import { test, expect } from '@playwright/test';
import { contactKey } from '@le-space/orbitdb-access-controller-decontact';
import { newPerson } from './helpers/passkeys.js';
import { answerRequests, everPutUnder, fillOnboardingCard, invitationLink, names, openLink, times } from './helpers/onboarding.js';

// The onboarding of an invitation link (#86): Alice shows her QR code, Bob opens the link,
// gets her card at once, types his own and chooses whether she gets it.
// 1. Alice's phone does not answer at first. Bob saves and shares meanwhile; his app keeps
//    asking until Alice's app is back, then his card goes into her book.
// 2. Bob saves only: nothing of his reaches Alice's book. Carol opens the same link
//    afterwards: Alice is asked, and Carol shares with the invitation Alice sends back.
// 3. A link without a two-way exchange offers only "Save".
// In every case: no request dialog during onboarding, and the inviter's book never holds a
// placeholder card of the invitee (their DID as the last name).

const people = {
	alice: { first: 'Alice', last: 'Wolkenfabrik', city: 'Musterstadt' },
	bob: { first: 'Bob', last: 'Stromwerk', email: 'bob@example.com' },
	carol: { first: 'Carol', last: 'Beispiel', email: 'carol@example.com' },
	dave: { email: 'dave@example.com' }
};
const fullName = (person) => `${person.first} ${person.last}`;
const DIALOG = 'Send My Contact Data';

test('Save and share while the inviter\'s phone is not answering', async ({ browser }) => {
	test.setTimeout(360000);
	const alice = await newPerson(browser, people.alice);
	let bob;
	try {
		const link = await invitationLink(alice.page);
		// Alice's app in the background: her device answers no request
		await answerRequests(alice.page, false);

		await test.step('Bob opens the link: email first, the address collapsed', async () => {
			bob = await openLink(browser, link);
			await expect(bob.page.getByTestId('waiting-for-phone')).toHaveText(`Waiting for ${alice.did}'s phone…`);
			const fields = await bob.page.getByTestId('onboarding').locator('input').evaluateAll((inputs) => inputs.map((input) => input.id));
			expect(fields).toEqual(['onboarding-email', 'onboarding-first', 'onboarding-last']);
			await expect(bob.page.getByRole('button', { name: 'Add address' })).toBeVisible();
			await expect(bob.page.getByPlaceholder('Enter street...')).toHaveCount(0);
			await expect.poll(() => bob.saw(`could not deliver the request of the invitation link to ${alice.did}`), { timeout: 120000 })
				.toBe(true);
		});

		await test.step('Bob saves and shares before Alice answers', async () => {
			await fillOnboardingCard(bob.page, people.bob);
			const share = bob.page.getByRole('button', { name: /^Save and share with / });
			await expect(share).toBeEnabled();
			await expect(bob.page.getByRole('button', { name: 'Save only' })).toBeVisible();
			await share.click();
			await expect(bob.page.getByRole('tab', { name: 'Contacts' })).toBeVisible();
			await expect(bob.page.getByTestId('waiting-for-phone')).toHaveText(`Waiting for ${alice.did}'s phone…`);
			// his app tries again, with the same token, while Alice's does not answer
			const asked = `could not deliver the request of the invitation link to ${alice.did}`;
			const before = times(bob, asked);
			await expect.poll(() => times(bob, asked), { timeout: 45000 }).toBeGreaterThan(before);
			expect(alice.saw(`accepted the invitation link of ${bob.did}`)).toBe(false);
		});

		await test.step("Alice's app is back: her card reaches Bob, his reaches her", async () => {
			await answerRequests(alice.page, true);
			await expect.poll(() => alice.saw(`accepted the invitation link of ${bob.did}`), { timeout: 120000 }).toBe(true);
			await expect.poll(() => alice.saw(`sent an invitation to ${bob.did} for the two-way exchange`), { timeout: 30000 }).toBe(true);
			await expect.poll(() => names(bob.page), { timeout: 90000, message: "Alice's card in Bob's book" }).toContain(fullName(people.alice));
			await expect.poll(() => names(alice.page), { timeout: 90000, message: "Bob's card in Alice's book" }).toContain(fullName(people.bob));
			await expect(bob.page.getByTestId('waiting-for-phone')).toHaveCount(0, { timeout: 30000 });
		});

		await test.step("Alice's book only ever held Bob's real card, and nobody was asked", async () => {
			const cards = await everPutUnder(alice, contactKey(bob.did));
			expect(cards.length).toBeGreaterThan(0);
			for (const card of cards) {
				expect(card).toMatchObject({ owner: bob.did, firstName: people.bob.first, lastName: people.bob.last, email: people.bob.email });
			}
			for (const person of [alice, bob]) {
				expect(person.saw('asking to confirm the request')).toBe(false);
				await expect(person.page.getByRole('button', { name: DIALOG })).toHaveCount(0);
			}
		});
	} finally {
		await Promise.all([alice, bob].filter(Boolean).map((person) => person.close()));
	}
});

test('Save only; a second person with the same link is asked for', async ({ browser }) => {
	test.setTimeout(480000);
	const alice = await newPerson(browser, people.alice);
	let bob, carol;
	try {
		const link = await invitationLink(alice.page);

		await test.step("Bob opens the link: Alice's card arrives, her invitation waits for his choice", async () => {
			bob = await openLink(browser, link);
			await expect(bob.page.getByTestId('inviter-card')).toHaveText(`${fullName(people.alice)} was added to your address book`, { timeout: 120000 });
			await expect.poll(() => bob.saw(`holding the request of ${alice.did} until we chose`), { timeout: 60000 }).toBe(true);
			await expect(bob.page.getByRole('button', { name: `Save and share with ${people.alice.first}` })).toBeVisible();
			await expect(bob.page.getByRole('button', { name: DIALOG })).toHaveCount(0);
		});

		await test.step('Bob saves only, with his email alone: nothing of his reaches Alice', async () => {
			await fillOnboardingCard(bob.page, { email: people.bob.email });
			await bob.page.getByRole('button', { name: 'Save only' }).click();
			await expect(bob.page.getByRole('tab', { name: 'Contacts' })).toBeVisible();
			await expect.poll(() => bob.saw(`declined the request of ${alice.did}: we saved our card only`), { timeout: 30000 }).toBe(true);
			// his own card: the email, no DID in a name
			const own = await bob.page.evaluate(async () => {
				const me = window.orbitdb.identity.id;
				return (await window.mydb.all()).map((record) => record.value).find((card) => card.owner === me && card.own);
			});
			expect(own).toMatchObject({ email: people.bob.email, firstName: '', lastName: '' });
			// time enough for anything Bob wrote to reach Alice
			await bob.page.waitForTimeout(15000);
			expect(await everPutUnder(alice, contactKey(bob.did))).toEqual([]);
			const stored = JSON.stringify(await alice.page.evaluate(async () => (await window.mydb.all()).map((record) => record.value)));
			expect(stored).not.toContain(people.bob.email);
			expect(alice.saw('asking to confirm the request')).toBe(false);
		});

		await test.step('Carol opens the same link: Alice is asked, once', async () => {
			carol = await openLink(browser, link);
			await expect.poll(() => alice.saw(`rejected the invitation link of ${carol.did}: it was already used`), { timeout: 120000 }).toBe(true);
			const send = alice.page.getByRole('button', { name: DIALOG });
			await expect(send).toBeVisible({ timeout: 30000 });
			await send.click();
			await expect.poll(() => names(carol.page), { timeout: 90000, message: "Alice's card in Carol's book" }).toContain(fullName(people.alice));
			// Alice's dialog asked back; on Carol's side that request waits for her choice
			await expect.poll(() => carol.saw(`holding the request of ${alice.did} until we chose`), { timeout: 60000 }).toBe(true);
			await expect(carol.page.getByRole('button', { name: DIALOG })).toHaveCount(0);
		});

		await test.step('Carol saves and shares: her real card reaches Alice', async () => {
			await fillOnboardingCard(carol.page, people.carol);
			await carol.page.getByRole('button', { name: `Save and share with ${people.alice.first}` }).click();
			await expect.poll(() => names(alice.page), { timeout: 120000, message: "Carol's card in Alice's book" }).toContain(fullName(people.carol));
			// besides Alice's own "invited" entry, only Carol's real card
			for (const card of await everPutUnder(alice, contactKey(carol.did))) {
				if (card.firstName === 'invited') continue;
				expect(card).toMatchObject({ owner: carol.did, firstName: people.carol.first, lastName: people.carol.last });
			}
			// Carol's app kept resending; Alice was asked one time only
			expect(times(alice, `asking to confirm the request of ${carol.did}`)).toBe(1);
			expect(carol.saw('asking to confirm the request')).toBe(false);
		});
	} finally {
		await Promise.all([alice, bob, carol].filter(Boolean).map((person) => person.close()));
	}
});

test('a link without a two-way exchange offers only Save', async ({ browser }) => {
	test.setTimeout(300000);
	const alice = await newPerson(browser, people.alice);
	let dave;
	try {
		const link = await invitationLink(alice.page, { twoWay: false });
		dave = await openLink(browser, link);
		await fillOnboardingCard(dave.page, people.dave);
		await expect(dave.page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
		await expect(dave.page.getByRole('button', { name: /^Save and share/ })).toHaveCount(0);
		await expect(dave.page.getByRole('button', { name: 'Save only' })).toHaveCount(0);
		await dave.page.getByRole('button', { name: 'Save', exact: true }).click();
		await expect.poll(() => names(dave.page), { timeout: 120000, message: "Alice's card in Dave's book" }).toContain(fullName(people.alice));
		expect(dave.saw('asking for an invitation')).toBe(false);
		expect(alice.saw(`sent an invitation to ${dave.did}`)).toBe(false);
		expect(await everPutUnder(alice, contactKey(dave.did))).toEqual([]);
	} finally {
		await Promise.all([alice, dave].filter(Boolean).map((person) => person.close()));
	}
});
