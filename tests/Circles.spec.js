import { test, expect } from '@playwright/test';
import { editMyCard, listedContacts, newPerson, openContact } from './helpers/passkeys.js';
import { fillOnboardingCard, invitationLink, openLink } from './helpers/onboarding.js';

// Circles (#100): a contact gets what their circle shows.
// 1. Alice's card has a home address, a private and a work email.
// 2. Alice and Bob exchange cards: Bob is in no circle and gets her whole card, as before.
// 3. Alice puts Bob into Business: the page says that what he got stays with him; his copy of
//    her card holds only her name and work email now, not her home address or private email,
//    also not in the flat fields that older app versions read.
// 4. Alice moves Bob to Family: he gets everything again.

const people = {
	alice: { first: 'Alice', last: 'Wolkenfabrik', city: 'Musterstadt' },
	bob: { first: 'Bob', last: 'Stromwerk', email: 'bob@example.com' }
};

test('a contact gets what their circle shows', async ({ browser }) => {
	test.setTimeout(480000);
	const alice = await newPerson(browser, people.alice);
	let bob;
	try {
		await test.step('Alice adds a private and a work email to her card; her address is Home', async () => {
			const { page } = alice;
			await editMyCard(page);
			await page.getByRole('button', { name: 'Add email' }).click();
			await page.getByLabel('Email 1', { exact: true }).fill('alice@example.com');
			await page.getByRole('button', { name: 'Add email' }).click();
			await page.getByLabel('Email 2', { exact: true }).fill('alice@home.example');
			await expect(page.getByLabel('Label of email 2')).toHaveValue('private');
			await expect(page.getByLabel('Label of address 1')).toHaveValue('home');
			await page.getByRole('button', { name: 'Update' }).click();
			await expect(page.getByTestId('my-card-details')).toContainText('alice@home.example');
		});

		await test.step('Alice and Bob exchange cards: without a circle Bob gets her whole card', async () => {
			bob = await openLink(browser, await invitationLink(alice.page));
			await fillOnboardingCard(bob.page, people.bob);
			await bob.page.getByRole('button', { name: `Save and share with ${people.alice.first}` }).click({ timeout: 120000 });
			await expect.poll(async () => (await listedContacts(bob.page)).join(' | '), { timeout: 120000 }).toContain(people.alice.last);
			await expect.poll(async () => (await listedContacts(alice.page)).join(' | '), { timeout: 120000 }).toContain(people.bob.last);
			await expect.poll(() => cardOf(bob.page, alice.did), { timeout: 60000 }).toMatchObject({ city: people.alice.city });
			const card = await cardOf(bob.page, alice.did);
			expect(card.emails.map((it) => it.value)).toEqual(['alice@example.com', 'alice@home.example']);
		});

		await test.step('Alice puts Bob into Business: he gets her name and work email only', async () => {
			await openContact(alice.page, people.bob.last);
			const circle = alice.page.getByTestId('contact-circle');
			await expect(circle.getByLabel('Circle')).toHaveValue('');
			await circle.getByLabel('Circle').selectOption('business');
			await expect(circle).toContainText('What Bob already received stays with them.');
			await expect
				.poll(async () => (await cardOf(bob.page, alice.did))?.emails?.map((it) => it.value), { timeout: 120000, message: 'her card for Business' })
				.toEqual(['alice@example.com']);
			const card = await cardOf(bob.page, alice.did);
			expect(card).toMatchObject({ firstName: people.alice.first, lastName: people.alice.last, email: 'alice@example.com', city: '', street: '' });
			expect(card.addresses).toEqual([]);
			expect(JSON.stringify(card)).not.toContain('alice@home.example');
			expect(JSON.stringify(card)).not.toContain(people.alice.city);
			// on his page of hers
			await openContact(bob.page, people.alice.last);
			await expect(bob.page.getByTestId('contact-details')).not.toContainText(people.alice.city);
			await expect(bob.page.getByTestId('contact-details')).toContainText('alice@example.com');
		});

		await test.step('Alice moves Bob to Family: he gets everything again', async () => {
			await alice.page.getByTestId('contact-circle').getByLabel('Circle').selectOption('family');
			await expect(alice.page.getByTestId('contact-circle')).not.toContainText('stays with them');
			await expect
				.poll(async () => (await cardOf(bob.page, alice.did))?.city, { timeout: 120000, message: 'her whole card again' })
				.toBe(people.alice.city);
			expect((await cardOf(bob.page, alice.did)).emails).toHaveLength(2);
			// the circle is in her book, sealed, not on Bob's card of hers
			expect(JSON.stringify(await cardOf(bob.page, alice.did))).not.toContain('family');
		});
	} finally {
		await Promise.all([alice.close(), bob?.close()]);
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
