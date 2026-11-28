import { test, expect } from './bob.js';
import { editMyCard, names, newPerson } from '../helpers/passkeys.js';
import { fillOnboardingCard, invitationLink, openLink, times } from '../helpers/onboarding.js';

// Alice and Bob on two networks (playwright.remote.config.js): Alice's browser here, Bob's
// on an Aleph VM (REMOTE_PROVIDER=aleph) or a second local browser. Both use the deployed
// app and Le Space's relays, found through Aleph. What the suite checks against its own
// relay (Onboarding, UpdateAfterMove, OfflineInvitation), here across networks:
// 1. Bob opens Alice's invitation link: both cards arrive; Alice moves and Bob gets her new
//    address; then Bob's app is closed while she moves again, and her browser is gone
//    before his comes back: the new address can only come from a relay.
// 2. The inviter is offline (tests/OfflineInvitation.spec.js): not built yet, so marked
//    test.fail(); what fails today is checked softly.
// The relays' HTTP API is not asked: the deployed app has no test hook, and a relay found
// through Aleph is not ours to ask. Where the suite waits for an entry on its relay, these
// tests give the relays time instead (RELAY_TIME_MS).

const RELAY_TIME_MS = 30000;
const people = {
	alice: { first: 'Alice', last: 'Wolkenfabrik', city: 'Musterstadt' },
	bob: { first: 'Bob', last: 'Stromwerk', city: 'Beispielort', email: 'bob@example.com' }
};
const fullName = (person) => `${person.first} ${person.last}`;
const firstMove = { street: 'Lindenweg 3', postalCode: '12345', city: 'Neustadt am Beispiel' };
const secondMove = { street: 'Am Hafen 9', postalCode: '54321', city: 'Altstadt am Beispiel' };

test.beforeEach(async ({ bobBrowser }) => {
	test.info().annotations.push({ type: 'Bob', description: `${bobBrowser.provider}, Chromium ${bobBrowser.version()}` });
});

test('Alice here, Bob on another network: the link, both cards, and her moves, also while both were away', async ({ browser, bobBrowser }) => {
	test.setTimeout(900000);
	const alice = await newPerson(browser, people.alice);
	const bob = await newPerson(bobBrowser, people.bob);
	let aliceClosed = false;
	try {
		await test.step('Bob opens her invitation link: her card arrives, his goes to her', async () => {
			const link = await invitationLink(alice.page);
			// opened as a page of its own, as a phone opens a scanned link
			await bob.page.evaluate((url) => history.replaceState(null, '', url), link);
			await bob.page.reload();
			await bob.page.getByRole('button', { name: 'Unlock with passkey' }).click();
			await expect(bob.page.getByTestId('inviter-card')).toHaveText(`${fullName(people.alice)} was added to your address book`, {
				timeout: 240000
			});
			await bob.page.getByRole('button', { name: `Save and share with ${people.alice.first}` }).click();
			await expect.poll(() => names(alice.page), { timeout: 240000, message: "Bob's card in Alice's book" }).toContain(fullName(people.bob));
		});

		await test.step('Alice moves: Bob gets her new address', async () => {
			await move(alice.page, people.alice.last, firstMove);
			await expect.poll(() => addressIn(bob.page, alice.did), { timeout: 240000, message: "Alice's new address in Bob's book" })
				.toEqual(firstMove);
		});

		const bobsBook = await bob.page.evaluate(() => window.mydb.address);
		await test.step("Bob's app is closed while Alice moves again; then her browser is gone too", async () => {
			await bob.page.goto('about:blank');
			const updates = times(alice, `updated our card in ${bobsBook}`);
			await move(alice.page, people.alice.last, secondMove);
			await expect.poll(() => times(alice, `updated our card in ${bobsBook}`), { timeout: 120000 }).toBeGreaterThan(updates);
			// her new card in his book, on its way to the relays
			await alice.page.waitForTimeout(RELAY_TIME_MS);
			await alice.close();
			aliceClosed = true;
		});

		await test.step("Bob's app is back: her second address comes from a relay", async () => {
			await bob.page.goto(process.env.PAGE_URL);
			await bob.page.getByRole('button', { name: 'Unlock with passkey' }).click();
			await expect.poll(() => addressIn(bob.page, alice.did), { timeout: 240000, message: "Alice's second address in Bob's book" })
				.toEqual(secondMove);
		});
	} finally {
		report({ alice, bob });
		await Promise.all([aliceClosed ? undefined : alice.close(), bob.close()]);
	}
});

test('the inviter is offline: Bob gets her card and shares his, and back online she has it', async ({ browser, bobBrowser }) => {
	// not built yet: what fails is checked softly, as in tests/OfflineInvitation.spec.js
	test.fail();
	test.setTimeout(900000);
	const alice = await newPerson(browser, people.alice);
	let bob;
	let bobClosed = false;
	try {
		let link;
		await test.step('Alice shows her code; her book goes to the relays; her app is gone', async () => {
			link = await invitationLink(alice.page);
			await alice.page.waitForTimeout(RELAY_TIME_MS);
			await alice.page.goto('about:blank');
		});

		await test.step('Bob opens the link and gets her card', async () => {
			bob = await openLink(bobBrowser, link);
			// fails today: his app asks her device, which is gone
			await expect.soft(bob.page.getByTestId('inviter-card'), "Alice's card while she is offline")
				.toHaveText(`${fullName(people.alice)} was added to your address book`, { timeout: 120000 });
		});

		await test.step('Bob saves and shares; his app is gone', async () => {
			await fillOnboardingCard(bob.page, people.bob);
			await bob.page.getByRole('button', { name: /^Save and share/ }).click();
			await expect(bob.page.getByRole('link', { name: 'Contacts' })).toBeVisible();
			await bob.page.waitForTimeout(RELAY_TIME_MS);
			await bob.close();
			bobClosed = true;
		});

		await test.step("Alice's app is back: Bob's card is in her book", async () => {
			await alice.page.goto(process.env.PAGE_URL);
			await alice.page.getByRole('button', { name: 'Unlock with passkey' }).click();
			await expect.poll(() => names(alice.page), { timeout: 120000, message: "Alice's book open again" }).toContain(fullName(people.alice));
			// fails today: his request never reached her device
			await expect.soft.poll(() => names(alice.page), { timeout: 180000, message: "Bob's card in Alice's book" })
				.toContain(fullName(people.bob));
			expect(alice.saw('asking to confirm the request')).toBe(false);
		});
	} finally {
		report({ alice, bob });
		await Promise.all([alice.close(), bob && !bobClosed ? bob.close() : undefined]);
	}
});

/** a person moves: their own card gets a new street, postal code and city (as tests/UpdateAfterMove.spec.js) */
async function move(page, lastName, { street, postalCode, city }) {
	await editMyCard(page);
	await expect(page.getByPlaceholder('Enter lastname...')).toHaveValue(lastName);
	await page.getByPlaceholder('Enter street...').fill(street);
	await page.getByPlaceholder('Enter zipcode...').fill(postalCode);
	await page.getByPlaceholder('Enter city...').fill(city);
	await page.getByRole('button', { name: 'Update' }).click();
}

/** the address on the card of `did` in this browser's own book */
function addressIn(page, did) {
	return page.evaluate(async (did) => {
		if (!window.mydb) return undefined;
		const card = (await window.mydb.all()).map((record) => record.value)
			.find((value) => value.owner === did && value.firstName !== 'invited' && !value.subscriber);
		return card ? { street: card.street, postalCode: card.postalCode, city: card.city } : undefined;
	}, did);
}

/** which relays each app found, and how far it got: the evidence of a run across networks */
function report(people) {
	for (const [name, person] of Object.entries(people)) {
		if (!person) continue;
		const lines = person.lines.filter((line) => /relay from Aleph|invitation link|our card|sync error|could not/i.test(line));
		console.log(`${name}: ${JSON.stringify(lines.slice(-20), null, 1)}`);
	}
}
