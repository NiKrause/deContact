import { test, expect } from '@playwright/test';
import { editMyCard, listedContacts, newPerson, openContact } from './helpers/passkeys.js';
import { fillOnboardingCard, invitationLink, openLink, times } from './helpers/onboarding.js';

// The card's entries (#109).
// 1. Alice fills in her card: an organisation, two phones, an email, two profiles. Saved,
//    the card holds them in their order, and the first email and address again in the flat
//    fields that older app versions read.
// 2. Bob opens her invitation link and adds a phone behind "Add phone" on the onboarding form.
// 3. Bob sees every entry of hers on her contact page: the phone calls, the email writes, the
//    Mastodon profile is a link the app built, the other profile is text.
// 4. Alice sees Bob's phone on his page.
// 5. A contact Alice adds by hand and then changes stays in her book: it does not go out as
//    her card (it once did, since such a card has her DID as its owner).

const people = {
	alice: { first: 'Alice', last: 'Wolkenfabrik', city: 'Musterstadt' },
	bob: { first: 'Bob', last: 'Stromwerk', email: 'bob@example.com', phone: '+49 30 9876 5432' }
};

test("a card's entries: filled in, sent, shown with their labels and links", async ({ browser }) => {
	test.setTimeout(480000);
	const alice = await newPerson(browser, people.alice);
	let bob;
	try {
		await test.step('Alice fills in an organisation, two phones, an email and two profiles', async () => {
			const { page } = alice;
			await editMyCard(page);
			await page.getByLabel('Organization (optional)').fill('Wolkenfabrik GmbH');
			// the kinds without entries are only their buttons
			await expect(page.getByLabel('Phone 1', { exact: true })).toHaveCount(0);
			await page.getByRole('button', { name: 'Add phone' }).click();
			// the new field has the focus, and a label: the first phone is Mobile
			await expect(page.getByLabel('Phone 1', { exact: true })).toBeFocused();
			await expect(page.getByLabel('Label of phone 1')).toHaveValue('mobile');
			await page.keyboard.type('+49 30 1234 5678');
			await page.getByRole('button', { name: 'Add phone' }).click();
			await expect(page.getByLabel('Label of phone 2')).toHaveValue('work');
			await page.getByLabel('Phone 2', { exact: true }).fill('030 999 12');
			await page.getByRole('button', { name: 'Add email' }).click();
			await page.getByLabel('Email 1', { exact: true }).fill('alice@example.com');
			await page.getByRole('button', { name: 'Add profile' }).click();
			await page.getByLabel('Profile 1', { exact: true }).fill('@alice@social.example');
			await page.getByRole('button', { name: 'Add profile' }).click();
			await page.getByLabel('Network of profile 2').selectOption('github');
			// not a GitHub user name: the form says it shows as text; Other takes it as it is
			await page.getByLabel('Profile 2', { exact: true }).fill('https://github.com/alice');
			await expect(page.getByText('Shown as text: this is not a GitHub profile name.')).toBeVisible();
			await page.getByLabel('Network of profile 2').selectOption('other');
			await expect(page.getByText('Shown as text: this is not a GitHub profile name.')).toHaveCount(0);
			await page.getByLabel('Profile 2', { exact: true }).fill('alice at the stand');
			// a third phone, removed again before saving
			await page.getByRole('button', { name: 'Add phone' }).click();
			await page.getByRole('button', { name: 'Remove phone 3' }).click();
			await expect(page.getByLabel('Phone 3', { exact: true })).toHaveCount(0);
			await page.getByRole('button', { name: 'Update' }).click();

			const card = page.getByTestId('my-card-details');
			await expect(card).toContainText('Phone · Mobile');
			await expect(card).toContainText('+49 30 1234 5678');
			await expect(card).toContainText('Phone · Work');
			await expect(card).toContainText('Email · Work');
			await expect(card).toContainText('Mastodon');
			await expect(page.getByTestId('my-card')).toContainText('Wolkenfabrik GmbH · Musterstadt');
		});

		await test.step('saved: the entries in their order, and the first email and address for older versions', async () => {
			const own = await alice.page.evaluate(async (did) => {
				const card = (await window.mydb.all()).map((record) => record.value).find((value) => value.owner === did && value.own);
				return card;
			}, alice.did);
			expect(own.organization).toBe('Wolkenfabrik GmbH');
			expect(own.phones).toEqual([
				{ label: 'mobile', value: '+49 30 1234 5678' },
				{ label: 'work', value: '030 999 12' }
			]);
			expect(own.emails).toEqual([{ label: 'work', value: 'alice@example.com' }]);
			expect(own.social).toEqual([
				{ network: 'mastodon', handle: '@alice@social.example' },
				{ network: 'other', handle: 'alice at the stand' }
			]);
			expect(own.addresses).toEqual([{ label: 'home', street: '', postalCode: '', city: people.alice.city, countryRegion: '' }]);
			expect(own).toMatchObject({ email: 'alice@example.com', city: people.alice.city });
			expect(own).not.toHaveProperty('category');
		});

		await test.step('Bob opens her link and adds a phone on the onboarding form', async () => {
			const link = await invitationLink(alice.page);
			bob = await openLink(browser, link);
			await fillOnboardingCard(bob.page, people.bob);
			await expect(bob.page.getByPlaceholder('Phone number')).toHaveCount(0);
			await bob.page.getByRole('button', { name: 'Add phone' }).click();
			await bob.page.getByPlaceholder('Phone number').fill(people.bob.phone);
			await bob.page.getByRole('button', { name: `Save and share with ${people.alice.first}` }).click({ timeout: 120000 });
		});

		await test.step('Bob sees her entries with their labels: a phone calls, an email writes, a profile is a link the app built', async () => {
			await expect.poll(async () => (await listedContacts(bob.page)).join(' | '), { timeout: 120000 }).toContain(people.alice.last);
			await openContact(bob.page, people.alice.last);
			await expect(bob.page.getByTestId('contact-sub')).toHaveText('Wolkenfabrik GmbH · Musterstadt');
			const details = bob.page.getByTestId('contact-details');
			await expect(details.getByRole('link', { name: '+49 30 1234 5678' })).toHaveAttribute('href', 'tel:+493012345678');
			await expect(details.getByRole('link', { name: '030 999 12' })).toHaveAttribute('href', 'tel:03099912');
			await expect(details.getByRole('link', { name: 'alice@example.com' })).toHaveAttribute('href', 'mailto:alice@example.com');
			const mastodon = details.getByRole('link', { name: '@alice@social.example' });
			await expect(mastodon).toHaveAttribute('href', 'https://social.example/@alice');
			await expect(mastodon).toHaveAttribute('rel', 'noopener noreferrer nofollow');
			// the other profile is text, not a link
			await expect(details).toContainText('alice at the stand');
			await expect(details.getByRole('link', { name: 'alice at the stand' })).toHaveCount(0);
			await expect(details.getByRole('button', { name: 'Copy address' })).toBeVisible();
		});

		await test.step("Alice sees Bob's phone from the onboarding form", async () => {
			await expect.poll(async () => (await listedContacts(alice.page)).join(' | '), { timeout: 120000 }).toContain(people.bob.last);
			await openContact(alice.page, people.bob.last);
			await expect(alice.page.getByTestId('contact-details').getByRole('link', { name: people.bob.phone })).toHaveAttribute('href', 'tel:+493098765432');
			await expect(alice.page.getByTestId('contact-details')).toContainText('Phone · Mobile');
		});

		await test.step('a contact Alice adds by hand and changes stays in her book', async () => {
			const { page } = alice;
			await page.getByRole('button', { name: 'All contacts' }).click();
			await page.getByRole('button', { name: 'Add contact' }).click();
			await page.getByPlaceholder('Enter firstname...').fill('Carol');
			await page.getByPlaceholder('Enter lastname...').fill('Beispiel');
			await page.getByRole('button', { name: 'Save', exact: true }).click();
			await page.getByTestId('contact-row').filter({ hasText: 'Beispiel' }).click();
			const written = times(alice, 'updated our card in');
			await page.getByPlaceholder('Enter firstname...').fill('Caroline');
			await page.getByRole('button', { name: 'Update' }).click();
			await expect(page.getByTestId('contact-row').filter({ hasText: 'Caroline Beispiel' })).toBeVisible();
			// Update waits for the books it writes into: nothing was written
			expect(times(alice, 'updated our card in')).toBe(written);
			// Bob still has her card, not Carol's
			await expect(bob.page.getByTestId('contact-name')).toHaveText(`${people.alice.first} ${people.alice.last}`);
		});
	} finally {
		await Promise.all([alice.close(), bob?.close()]);
	}
});
