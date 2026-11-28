import { test, expect } from './helpers/policy.js';
import { editMyCard, listedContacts, newPerson, openContact } from './helpers/passkeys.js';
import { fillOnboardingCard, invitationLink, openLink } from './helpers/onboarding.js';

// Circles (#100): a contact gets what their circle shows.
// 1. Alice's card has a home address, a private and a work email.
// 2. Alice and Bob exchange cards through a code for the whole card: Bob is in no circle and
//    gets all of it, as every contact from before circles does.
// 3. Alice puts Bob into Business: the page says that what he got stays with him; his copy of
//    her card holds only her name and work email now, not her home address or private email,
//    also not in the flat fields that older app versions read.
// 4. Alice moves Bob to Family: he gets everything again.
// A second test: a new code gives the whole card, until Alice makes Business the default in
// Settings (the QR dialog says so); Carol, who opens a code then, gets Business's fields;
// Alice lets Business see her home address in Settings, and Carol gets it.

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

		await test.step('Alice and Bob exchange cards through a code for the whole card: Bob gets all of it', async () => {
			bob = await openLink(browser, await invitationLink(alice.page, { circle: '' }));
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

test('Settings: the circle for a new code, and what a circle sees', async ({ browser }) => {
	test.setTimeout(480000);
	const alice = await newPerson(browser, people.alice);
	let carol;
	try {
		await test.step('Alice adds a work email; in Settings she makes Business the circle for a new code', async () => {
			const { page } = alice;
			await editMyCard(page);
			await page.getByRole('button', { name: 'Add email' }).click();
			await page.getByLabel('Email 1', { exact: true }).fill('alice@example.com');
			await page.getByRole('button', { name: 'Update' }).click();
			await expect(page.getByTestId('my-card-details')).toContainText('alice@example.com');
			await page.getByRole('link', { name: 'Settings' }).click();
			const settings = page.getByTestId('circle-settings');
			await expect(settings.getByRole('columnheader')).toHaveText(['Field', 'Family', 'Friends', 'Acquaintances', 'Business']);
			// a new address book: a new code gives the whole card
			await expect(settings.getByLabel('A new code is for')).toHaveValue('');
			await expect(settings.getByRole('checkbox', { name: 'Business sees Address · Home' })).not.toBeChecked();
			await expect(settings.getByRole('checkbox', { name: 'Business sees Email · Work' })).toBeChecked();
			await expect(settings.getByRole('button', { name: 'Save circles' })).toHaveCount(0);
			await settings.getByLabel('A new code is for').selectOption('business');
			await settings.getByRole('button', { name: 'Save circles' }).click();
			await expect(settings.getByRole('button', { name: 'Save circles' })).toHaveCount(0);
		});

		await test.step('the QR dialog: this code is for Business', async () => {
			await alice.page.getByRole('link', { name: 'Exchange' }).click();
			await alice.page.getByRole('button', { name: 'Show my code' }).click();
			await expect(alice.page.getByLabel('This code is for')).toHaveValue('business');
			await alice.page.keyboard.press('Escape');
		});

		await test.step('Carol opens the code: she is in Business and gets the work email, not the home address', async () => {
			carol = await openLink(browser, await invitationLink(alice.page));
			await fillOnboardingCard(carol.page, { email: 'carol@example.com', first: 'Carol', last: 'Beispiel' });
			await carol.page.getByRole('button', { name: `Save and share with ${people.alice.first}` }).click({ timeout: 120000 });
			await expect.poll(() => cardOf(carol.page, alice.did), { timeout: 120000 }).toMatchObject({ email: 'alice@example.com' });
			expect(await cardOf(carol.page, alice.did)).toMatchObject({ city: '', addresses: [] });
			await expect.poll(async () => (await listedContacts(alice.page)).join(' | '), { timeout: 120000 }).toContain('Beispiel');
			await openContact(alice.page, 'Beispiel');
			await expect(alice.page.getByTestId('contact-circle').getByLabel('Circle')).toHaveValue('business');
		});

		await test.step('Alice lets Business see her home address: Carol gets it', async () => {
			const { page } = alice;
			await page.getByRole('link', { name: 'Settings' }).click();
			const settings = page.getByTestId('circle-settings');
			await settings.getByRole('checkbox', { name: 'Business sees Address · Home' }).check();
			await settings.getByRole('button', { name: 'Save circles' }).click();
			await expect(page.getByText('Circles saved.')).toBeVisible();
			await expect(settings.getByRole('button', { name: 'Save circles' })).toHaveCount(0);
			await expect
				.poll(async () => (await cardOf(carol.page, alice.did))?.city, { timeout: 120000, message: 'her home address for Business' })
				.toBe(people.alice.city);
		});
	} finally {
		await Promise.all([alice.close(), carol?.close()]);
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
