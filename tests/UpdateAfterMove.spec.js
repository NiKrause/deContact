import { test, expect } from '@playwright/test';
import { contactKey } from '@le-space/orbitdb-access-controller-decontact';
import { names, newPerson } from './helpers/passkeys.js';
import { invitationLink, times } from './helpers/onboarding.js';

// Self-updating: Alice moves, and Bob's address book shows her new address without
// anybody asking. Both browsers reach each other only through the relay (WebRTC off).
// 1. Both online: Alice changes her street, postal code and city; Bob's list shows them,
//    without a reload.
// 2. Bob's app is closed while Alice moves again, and Alice's browser is gone before Bob
//    comes back: the new address can only come from the relay's replica of his book. He
//    opens the app, unlocks, and his list shows it.

const relayHttp = `http://127.0.0.1:${process.env.E2E_RELAY_HTTP_PORT || '29300'}`;
const people = {
	alice: { first: 'Alice', last: 'Wolkenfabrik', city: 'Musterstadt' },
	bob: { first: 'Bob', last: 'Stromwerk', city: 'Beispielort' }
};
const firstMove = { street: 'Lindenweg 3', postalCode: '12345', city: 'Neustadt am Beispiel' };
const secondMove = { street: 'Am Hafen 9', postalCode: '54321', city: 'Altstadt am Beispiel' };

test('Alice moves: Bob gets her new address, also when his app was closed meanwhile', async ({ browser }) => {
	test.setTimeout(480000);
	const alice = await newPerson(browser, people.alice, { webRTC: false });
	const bob = await newPerson(browser, people.bob, { webRTC: false });
	let aliceClosed = false;
	try {
		await test.step('Bob opens her invitation link and shares his card', async () => {
			const link = await invitationLink(alice.page);
			// opened as a page of its own, as a phone opens a scanned link
			await bob.page.evaluate((url) => history.replaceState(null, '', url), link);
			await bob.page.reload();
			await bob.page.getByRole('button', { name: 'Unlock with passkey' }).click();
			await expect(bob.page.getByTestId('inviter-card')).toHaveText(`${people.alice.first} ${people.alice.last} was added to your address book`, {
				timeout: 120000
			});
			await bob.page.getByRole('button', { name: `Save and share with ${people.alice.first}` }).click();
			await expect.poll(() => names(alice.page), { timeout: 120000, message: "Bob's card in Alice's book" })
				.toContain(`${people.bob.first} ${people.bob.last}`);
		});

		await test.step('Alice moves: his list shows her new address, without a reload', async () => {
			await move(alice.page, people.alice.last, firstMove);
			await expect.poll(() => addressIn(bob.page, alice.did), { timeout: 120000, message: "Alice's new address in Bob's book" })
				.toEqual(firstMove);
			await expect.poll(() => detailsInList(bob.page, people.alice.last), { timeout: 30000, message: "Alice's new address in Bob's list" })
				.toContain(firstMove.street);
		});

		const bobsBook = await bob.page.evaluate(() => window.mydb.address);
		await test.step("Bob's app is closed while Alice moves again; then her browser is gone too", async () => {
			await bob.page.goto('about:blank');
			const updates = times(alice, `updated our card in ${bobsBook}`);
			await move(alice.page, people.alice.last, secondMove);
			await expect.poll(() => times(alice, `updated our card in ${bobsBook}`), { timeout: 60000 }).toBeGreaterThan(updates);
			// her new card in Bob's book is on the relay before she leaves
			const entry = await alice.page.evaluate(
				async ({ book, key }) => (await window.__decontactE2E.all(book)).find((doc) => doc.key === key)?.hash,
				{ book: bobsBook, key: contactKey(alice.did) }
			);
			expect(entry).toBeTruthy();
			await expect.poll(() => relayHasEntry(bobsBook, entry), { timeout: 120000, message: "Alice's new card on the relay" }).toBe(true);
			await alice.close();
			aliceClosed = true;
		});

		await test.step('Bob opens the app again: the new address comes from the relay', async () => {
			await bob.page.goto(process.env.PAGE_URL);
			await bob.page.getByRole('button', { name: 'Unlock with passkey' }).click();
			await expect.poll(() => addressIn(bob.page, alice.did), { timeout: 120000, message: "Alice's second address in Bob's book" })
				.toEqual(secondMove);
			await expect.poll(() => detailsInList(bob.page, people.alice.last), { timeout: 30000, message: "Alice's second address in Bob's list" })
				.toContain(secondMove.street);
		});
	} finally {
		await Promise.all([aliceClosed ? undefined : alice.close(), bob.close()]);
	}
});

/** a person moves: their own card, selected in the list, gets a new street, postal code and city */
async function move(page, lastName, { street, postalCode, city }) {
	await page.getByRole('tab', { name: 'Contacts' }).click();
	await page.getByRole('row', { name: new RegExp(lastName) }).first().locator('label').click();
	await expect(page.getByPlaceholder('Enter lastname...')).toHaveValue(lastName);
	await page.getByPlaceholder('Enter street...').fill(street);
	await page.getByPlaceholder('Enter zipcode...').fill(postalCode);
	await page.getByPlaceholder('Enter city...').fill(city);
	await page.getByRole('button', { name: 'Update' }).click();
}

/** the address on the card of `did` in this browser's own book */
function addressIn(page, did) {
	return page.evaluate(async (did) => {
		const card = (await window.mydb.all()).map((record) => record.value).find((value) => value.owner === did && value.firstName !== 'invited');
		return card ? { street: card.street, postalCode: card.postalCode, city: card.city } : undefined;
	}, did);
}

/** what the contact list shows of a contact when its row is opened */
async function detailsInList(page, lastName) {
	await page.getByRole('tab', { name: 'Contacts' }).click();
	const details = page.locator('pre', { hasText: lastName });
	if ((await details.count()) === 0) {
		await page.getByRole('row', { name: new RegExp(lastName) }).first().getByRole('button', { name: 'Expand current row' }).click();
	}
	return (await details.first().textContent()) ?? '';
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
