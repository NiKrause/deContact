import { test, expect } from '@playwright/test';
import { addCard, editMyCard, listedContacts, names, newPerson } from './helpers/passkeys.js';
import { fillOnboardingCard, invitationLink, openLink, times } from './helpers/onboarding.js';

// Our own card is the one card marked as ours (src/lib/card/own.js). A contact added by hand
// has our DID as its owner too, since it is ours to change, but it is nobody's card to send.
// 1. Alice and Bob exchange cards. Alice deletes her own card and adds Carol by hand. Saving
//    a card names this device in our own card (ensureOwnDevice): with no card of her own,
//    nothing is written, and Bob keeps her card. Carol's once went out in its place, as the
//    first card with Alice's DID.
// 2. Alice types her card again: it goes to Bob, and Carol stays in her list.
// A second test: "Drop Followed & Follower DBs" in Settings keeps Alice's own book when she
// added a contact by hand. Such a card names her own book, which was dropped with the copies
// of other people's books.

const people = {
	alice: { first: 'Alice', last: 'Wolkenfabrik', city: 'Musterstadt' },
	bob: { first: 'Bob', last: 'Stromwerk', email: 'bob@example.com' },
	carol: { first: 'Carol', last: 'Beispiel' }
};

test('a contact added by hand never goes out as our card, also without a card of our own', async ({ browser }) => {
	test.setTimeout(480000);
	const alice = await newPerson(browser, people.alice);
	let bob;
	try {
		await test.step('Alice and Bob exchange cards', async () => {
			bob = await openLink(browser, await invitationLink(alice.page));
			await fillOnboardingCard(bob.page, people.bob);
			await bob.page.getByRole('button', { name: `Save and share with ${people.alice.first}` }).click({ timeout: 120000 });
			await expect.poll(async () => (await listedContacts(alice.page)).join(' | '), { timeout: 120000 }).toContain(people.bob.last);
			await expect.poll(() => cardOf(bob.page, alice.did), { timeout: 120000 }).toMatchObject({ firstName: people.alice.first, city: people.alice.city });
		});

		await test.step('Alice deletes her own card and adds Carol by hand: nothing goes to Bob', async () => {
			const { page } = alice;
			await editMyCard(page);
			await page.getByRole('button', { name: 'Delete', exact: true }).click();
			await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
			await expect.poll(() => names(page), { timeout: 30000 }).not.toContain(`${people.alice.first} ${people.alice.last}`);
			// My card is the empty form for a new card again, not the deleted one
			await expect(page.getByPlaceholder('Enter firstname...')).toHaveValue('');

			const named = times(alice, 'our card names this device now');
			await page.getByRole('link', { name: 'Contacts' }).click();
			await page.getByRole('button', { name: 'Add contact' }).click();
			await page.getByPlaceholder('Enter firstname...').fill(people.carol.first);
			await page.getByPlaceholder('Enter lastname...').fill(people.carol.last);
			await page.getByRole('button', { name: 'Save', exact: true }).click();
			await expect(page.getByTestId('contact-row').filter({ hasText: people.carol.last })).toBeVisible();
			// saving looks for our own card to name this device in: there is none
			await expect
				.poll(() => alice.saw('no card of our own') || times(alice, 'our card names this device now') > named, { timeout: 30000 })
				.toBe(true);
			expect(times(alice, 'our card names this device now'), "Carol's card named this device as Alice's").toBe(named);
			const card = await cardOf(bob.page, alice.did);
			expect(card).toMatchObject({ firstName: people.alice.first, lastName: people.alice.last });
			expect(JSON.stringify(card)).not.toContain(people.carol.last);
		});

		await test.step('Alice types her card again: it goes to Bob, Carol stays in her list', async () => {
			await addCard(alice.page, { ...people.alice, city: 'Neustadt' });
			await expect.poll(async () => (await cardOf(bob.page, alice.did))?.city, { timeout: 120000 }).toBe('Neustadt');
			expect(JSON.stringify(await cardOf(bob.page, alice.did))).not.toContain(people.carol.last);
			await expect.poll(async () => (await listedContacts(alice.page)).join(' | '), { timeout: 30000 }).toContain(people.carol.last);
			// Contacts leaves out our own card
			await expect(alice.page.getByTestId('contact-row').filter({ hasText: people.alice.last })).toHaveCount(0);
		});
	} finally {
		await Promise.all([alice.close(), bob?.close()]);
	}
});

test('"Drop Followed & Follower DBs" keeps our own book with a contact added by hand', async ({ browser }) => {
	test.setTimeout(240000);
	const alice = await newPerson(browser, people.alice);
	try {
		const { page } = alice;
		await page.getByRole('link', { name: 'Contacts' }).click();
		await page.getByRole('button', { name: 'Add contact' }).click();
		await page.getByPlaceholder('Enter firstname...').fill(people.carol.first);
		await page.getByPlaceholder('Enter lastname...').fill(people.carol.last);
		await page.getByRole('button', { name: 'Save', exact: true }).click();
		await expect(page.getByTestId('contact-row').filter({ hasText: people.carol.last })).toBeVisible();

		await page.getByRole('link', { name: 'Settings' }).click();
		await page.getByRole('button', { name: 'Developer' }).click();
		await page.getByRole('button', { name: 'Drop Followed & Follower DBs' }).click();
		await page.getByRole('alertdialog').getByRole('button', { name: 'Drop', exact: true }).click();
		await expect(page.getByRole('alertdialog')).toBeHidden();
		// the dialog says: "Your own card and your passkeys stay."
		await expect
			.poll(() => names(page), { timeout: 10000 })
			.toEqual(expect.arrayContaining([`${people.alice.first} ${people.alice.last}`, `${people.carol.first} ${people.carol.last}`]));
		await page.reload();
		await page.getByRole('button', { name: 'Unlock with passkey' }).click();
		await expect.poll(() => names(page), { timeout: 30000 }).toContain(`${people.carol.first} ${people.carol.last}`);
		await page.getByRole('link', { name: 'My business card' }).click();
		await expect(page.getByTestId('my-card-name')).toHaveText(`${people.alice.first} ${people.alice.last}`);
	} finally {
		await alice.close();
	}
});

/** the card of `did` in this browser's own book, as it opens */
function cardOf(page, did) {
	return page.evaluate(async (did) => {
		if (!window.mydb) return undefined;
		const card = (await window.mydb.all())
			.map((record) => record.value)
			.find((value) => value.owner === did && value.firstName !== 'invited' && !value.subscriber);
		return card ? JSON.parse(JSON.stringify(card)) : undefined;
	}, did);
}
