import { test, expect } from '@playwright/test';
import { contactKey } from '@le-space/orbitdb-access-controller-decontact';
import { newPerson } from './helpers/passkeys.js';
import { fillOnboardingCard, invitationLink, names, openLink } from './helpers/onboarding.js';

// An invitation link while the inviter's phone is offline. Alice shows her code, and her
// app is gone before Bob opens the link; Bob's app is gone before hers comes back. They
// are never online at the same time: whatever goes from one to the other has to wait on
// the relay.
// 1. Alice shows her code; her book is on the relay; her app is gone.
// 2. Bob opens the link and gets her card.
// 3. Bob saves and shares; his book is on the relay; his app is gone.
// 4. Alice's app is back: Bob's card is in her book, nobody was asked, and her card for
//    him is on the relay, where his app finds it when it is back.
//
// NOT BUILT YET, so the test is marked test.fail(). Today Alice's own device checks the
// link's one-time token (in its localStorage) and answers Bob over /decontact/request/1.0.0
// (contact-protocol.js): only her device can read her card, which is sealed to her, and
// sign an invitation for Bob's DID. The relay keeps both books, but nothing in them Bob or
// Alice could use. What fails today is checked softly (expect.soft), so that the test runs
// to its end:
// - step 2: her card does not arrive; his app keeps resending to her device and shows
//   "The business card of the person who invited you is on its way…";
// - step 4: Bob's card is not in her book, and her card for him is not on the relay: his
//   request never reached her device.
// Everything else works today and is checked as usual. When the feature is there: remove
// test.fail(), and in step 3 replace the fixed wait by a check that the relay holds what
// Bob's app leaves for Alice.

const relayHttp = `http://127.0.0.1:${process.env.E2E_RELAY_HTTP_PORT || '29300'}`;
const people = {
	alice: { first: 'Alice', last: 'Wolkenfabrik', city: 'Musterstadt' },
	bob: { first: 'Bob', last: 'Stromwerk', email: 'bob@example.com' }
};
const fullName = (person) => `${person.first} ${person.last}`;

test('the inviter is offline: Bob gets her card and shares his, and back online she has it', async ({ browser }) => {
	// not built yet: see above
	test.fail();
	test.setTimeout(480000);
	const alice = await newPerson(browser, people.alice);
	let bob;
	let bobClosed = false;
	try {
		let link;
		await test.step('Alice shows her code; her book is on the relay; her app is gone', async () => {
			link = await invitationLink(alice.page);
			const book = await alice.page.evaluate(() => window.mydb.address);
			await expect.poll(() => allOnRelay(alice.page, book), { timeout: 120000, message: "Alice's book on the relay" }).toBe(true);
			// a design that keeps something for the link outside her book checks that here too
			await alice.page.goto('about:blank');
		});

		await test.step('Bob opens the link and gets her card', async () => {
			bob = await openLink(browser, link);
			// fails today: his app asks her device, which is gone
			await expect.soft(bob.page.getByTestId('inviter-card'), "Alice's card while she is offline")
				.toHaveText(`${fullName(people.alice)} was added to your address book`, { timeout: 60000 });
		});

		let bobsBook;
		await test.step('Bob saves and shares; his book is on the relay; his app is gone', async () => {
			await fillOnboardingCard(bob.page, people.bob);
			// "Save and share with Alice" once her card is there, "Save and share" without it
			await bob.page.getByRole('button', { name: /^Save and share/ }).click();
			await expect(bob.page.getByRole('link', { name: 'Contacts' })).toBeVisible();
			bobsBook = await bob.page.evaluate(() => window.mydb.address);
			// she will write her card into it: from the relay's copy
			await expect.poll(() => allOnRelay(bob.page, bobsBook), { timeout: 120000, message: "Bob's book on the relay" }).toBe(true);
			// time for whatever his app leaves for her; a check of the relay once the design is chosen
			await bob.page.waitForTimeout(15000);
			await bob.close();
			bobClosed = true;
		});

		await test.step("Alice's app is back: Bob's card is in her book, and hers is on its way to his", async () => {
			await alice.page.goto(process.env.PAGE_URL);
			await alice.page.getByRole('button', { name: 'Unlock with passkey' }).click();
			await expect.poll(() => names(alice.page), { timeout: 60000, message: "Alice's book open again" }).toContain(fullName(people.alice));
			// fails today: his request never reached her device
			await expect.soft.poll(() => names(alice.page), { timeout: 90000, message: "Bob's card in Alice's book" })
				.toContain(fullName(people.bob));
			// fails today too: her card for Bob, with his invitation, in her copy of his book and on
			// the relay; his app finds it there when it is back
			await expect.soft.poll(() => herCardOnTheRelay(alice, bob.did, bobsBook), { timeout: 30000, message: "Alice's card for Bob on the relay" })
				.toBe(true);
			// the link was Bob's: nobody had to confirm anything
			expect(alice.saw('asking to confirm the request')).toBe(false);
		});
	} finally {
		// how far each app got
		const shown = (person) => JSON.stringify(person.lines.filter((line) => /invitation link|invitation to|our card|could not|has our card/i.test(line)).slice(-15), null, 1);
		console.log(`Alice: ${shown(alice)}`);
		if (bob) console.log(`Bob: ${shown(bob)}`);
		await Promise.all([alice.close(), bob && !bobClosed ? bob.close() : undefined]);
	}
});

/** whether the relay holds every entry of a book, as this page has it */
async function allOnRelay(page, address) {
	const hashes = await page.evaluate((address) => window.__decontactE2E.entries(address), address);
	if (hashes.length === 0) return false;
	return (await Promise.all(hashes.map((hash) => relayHasEntry(address, hash)))).every(Boolean);
}

/**
 * Whether Alice wrote her card into Bob's book with his invitation, and the relay holds it.
 * Bob's own placeholder for her has the same key; it carries no owner and no invitation in
 * the clear (cards.js).
 */
async function herCardOnTheRelay(alice, bobsDid, bobsBook) {
	const hash = await alice.page.evaluate(
		async ({ book, key, alice, bob }) =>
			(await window.__decontactE2E.all(book)).find(
				(doc) => doc.key === key && doc.value?.owner === alice && doc.value?.invitation?.owner === bob && doc.value?.invitation?.invitee === alice
			)?.hash,
		{ book: bobsBook, key: contactKey(alice.did), alice: alice.did, bob: bobsDid }
	);
	return hash ? relayHasEntry(bobsBook, hash) : false;
}

/** whether the relay holds this entry of a book */
async function relayHasEntry(address, entryHash) {
	const response = await fetch(`${relayHttp}/pinning/has-entry`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ dbAddress: address, entryHash })
	});
	if (!response.ok) return false;
	return (await response.json()).hasEntry === true;
}
