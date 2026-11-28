import { test, expect } from './helpers/policy.js';
import { everythingStoredAsText, listedContacts, newPerson, openContact } from './helpers/passkeys.js';
import { fillOnboardingCard, invitationLink, openLink } from './helpers/onboarding.js';

// My notes on a contact (#109): only I see them.
// 1. Alice and Bob exchange cards through her invitation link.
// 2. Alice writes a note on Bob's page and saves it. It stays after a reload.
// 3. It is a document of her own book, sealed to her, under a key that does not name Bob.
// 4. Bob has nothing of it: not in his book, not in his copy of hers in the clear, nowhere in
//    his browser's storage.
// 5. Alice empties the note: the document goes.

const people = {
	alice: { first: 'Alice', last: 'Wolkenfabrik', city: 'Musterstadt' },
	bob: { first: 'Bob', last: 'Stromwerk', email: 'bob@example.com' }
};
const NOTE = 'Met at the stand at 10:42. Wants the slides on relays.';

test('a note on a contact stays with me', async ({ browser }) => {
	test.setTimeout(420000);
	const alice = await newPerson(browser, people.alice);
	let bob;
	try {
		await test.step('Alice and Bob exchange cards', async () => {
			bob = await openLink(browser, await invitationLink(alice.page));
			await fillOnboardingCard(bob.page, people.bob);
			await bob.page.getByRole('button', { name: `Save and share with ${people.alice.first}` }).click({ timeout: 120000 });
			await expect.poll(async () => (await listedContacts(alice.page)).join(' | '), { timeout: 120000 }).toContain(people.bob.last);
			await expect.poll(async () => (await listedContacts(bob.page)).join(' | '), { timeout: 120000 }).toContain(people.alice.last);
		});

		await test.step("Alice writes a note on Bob's page", async () => {
			const { page } = alice;
			await openContact(page, people.bob.last);
			const notes = page.getByTestId('contact-notes');
			await expect(notes).toContainText('Only you see them');
			await expect(notes.getByRole('button', { name: 'Save note' })).toHaveCount(0);
			await notes.getByLabel('My notes').fill(NOTE);
			await notes.getByRole('button', { name: 'Save note' }).click();
			await expect(page.getByText('Note saved.')).toBeVisible();
			await expect(notes.getByRole('button', { name: 'Save note' })).toHaveCount(0);
			// the list holds contacts only
			expect((await listedContacts(page)).join(' | ')).not.toContain(NOTE);
			await page.reload();
			await page.getByRole('button', { name: 'Unlock with passkey' }).click();
			await openContact(page, people.bob.last);
			await expect(page.getByTestId('contact-notes').getByLabel('My notes')).toHaveValue(NOTE);
		});

		await test.step('in her book: sealed to her, under a key that does not name Bob', async () => {
			const stored = await alice.page.evaluate(async () => {
				const raw = await window.mydb.raw.all();
				return raw.map((record) => ({ key: record.key, value: record.value }));
			});
			const about = stored.filter((record) => record.key.startsWith('about:'));
			expect(about).toHaveLength(1);
			expect(about[0].key).not.toContain(bob.did);
			expect(about[0].key).not.toContain(bob.did.slice('did:key:'.length));
			// only the key is in the clear
			expect(Object.keys(about[0].value).sort()).toEqual(['_id', 'sealed']);
			expect(JSON.stringify(about[0].value)).not.toContain('Met at the stand');
		});

		await test.step('Bob has nothing of it', async () => {
			const own = await bob.page.evaluate(async () => JSON.stringify((await window.mydb.all()).map((record) => record.value)));
			expect(own).not.toContain('Met at the stand');
			expect(own).not.toContain('about:');
			// his app keeps a copy of her book: the note is in it sealed, if at all, and names nobody
			const { text } = await everythingStoredAsText(bob.page);
			expect(text).not.toContain('Met at the stand');
			expect(text).not.toContain('slides on relays');
		});

		await test.step('an empty note takes the document away', async () => {
			const notes = alice.page.getByTestId('contact-notes');
			await notes.getByLabel('My notes').fill('');
			await notes.getByRole('button', { name: 'Save note' }).click();
			await expect
				.poll(() => alice.page.evaluate(async () => (await window.mydb.all()).filter((record) => record.key.startsWith('about:')).length))
				.toBe(0);
		});
	} finally {
		await Promise.all([alice.close(), bob?.close()]);
	}
});
