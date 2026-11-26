import { test, expect } from '@playwright/test';
import { contactKey } from '@le-space/orbitdb-access-controller-decontact';
import { everythingStoredAsText, names, newPerson } from './helpers/passkeys.js';

// Every card is sealed to the owner of the book it sits in, every request to its
// recipient (#59, finding 3 of #58). Three people:
// 1. Carol listens on Alice's topic while Bob asks Alice: she receives the requests and
//    reads nothing of them. Alice's dialog still says who asks: the name is in the request.
// 2. Carol exchanges cards with Alice too, then replicates Alice's book, as a follower's
//    backup or a relay does: no name, city or book address in it, nor in Carol's storage.
// 3. Alice removes Bob: her card leaves Bob's book. Her next change reaches Carol, not Bob.

const people = {
	alice: { first: 'Alice', last: 'Wolkenfabrik', city: 'Musterstadt' },
	bob: { first: 'Bob', last: 'Stromwerk', city: 'Beispielort' },
	carol: { first: 'Carol', last: 'Beispiel', city: 'Example City' }
};
const NEW_CITY = 'Neustadt am Beispiel';
const topicOf = (did) => `/dContact/3/message/proto/${did}`;

test('a third peer reads nothing, and a removed contact gets no more updates', async ({ browser }) => {
	test.setTimeout(480000);
	const alice = await newPerson(browser, people.alice);
	const bob = await newPerson(browser, people.bob);
	const carol = await newPerson(browser, people.carol);
	try {
		const bobsBook = await bob.page.evaluate(() => window.mydb.address);
		const alicesBook = await alice.page.evaluate(() => window.mydb.address);

		await test.step("Bob asks Alice; Carol listens on Alice's topic", async () => {
			await listenOn(carol.page, topicOf(alice.did));
			await exchange(bob, alice);
			await expect.poll(() => names(alice.page), { timeout: 90000, message: "Bob's card in Alice's book" })
				.toContain(`${people.bob.first} ${people.bob.last}`);
			await expect.poll(() => names(bob.page), { timeout: 90000, message: "Alice's card in Bob's book" })
				.toContain(`${people.alice.first} ${people.alice.last}`);
		});

		await test.step('Carol received the requests and cannot read them', async () => {
			const heard = await carol.page.evaluate(() => window.__heard);
			expect(heard.length).toBeGreaterThan(0);
			for (const text of heard) {
				expect(JSON.parse(text)).toMatchObject({ v: 3, sealed: { v: 1 } });
				for (const plain of [bob.did, bobsBook, people.bob.last, people.bob.city, 'REQUEST_ADDRESS']) {
					expect(text, `a request on Alice's topic shows ${plain}`).not.toContain(plain);
				}
			}
			expect(carol.saw('dropped contact message: not sealed for us')).toBe(true);
		});

		await test.step('Carol and Alice exchange cards too', async () => {
			await exchange(carol, alice);
			await expect.poll(() => names(carol.page), { timeout: 90000, message: "Alice's card in Carol's book" })
				.toContain(`${people.alice.first} ${people.alice.last}`);
		});

		await test.step("Carol's copy of Alice's book holds no plaintext", async () => {
			const bobsKey = contactKey(bob.did);
			// Carol keeps Alice's book as a backup; once Bob's card has arrived (written by
			// Bob, so his DID and invitation stand in the clear), read it as stored
			const bobsCardArrived = async () =>
				(await storedValues(carol.page, alicesBook)).some((value) => value._id === bobsKey && value.owner === bob.did);
			await expect.poll(bobsCardArrived, { timeout: 90000, message: "Bob's card in Carol's copy of Alice's book" }).toBe(true);
			const values = await storedValues(carol.page, alicesBook);
			for (const value of values) {
				expect(value.sealed, JSON.stringify(value).slice(0, 120)).toMatchObject({ v: 1 });
				expect(Object.keys(value).every((field) => ['_id', 'owner', 'invitation', 'sealed'].includes(field))).toBe(true);
			}
			const text = JSON.stringify(values);
			for (const plain of [people.alice.last, people.alice.city, people.bob.last, people.bob.city, bobsBook]) {
				expect(text, `Alice's book shows ${plain}`).not.toContain(plain);
			}
			// nor does anything Carol's browser stores
			const stored = (await everythingStoredAsText(carol.page)).text;
			for (const plain of [people.alice.last, people.alice.city, people.bob.last, people.bob.city]) {
				expect(stored.includes(plain), `Carol's browser stores ${plain}`).toBe(false);
			}
		});

		await test.step("nothing of the cards is stored in the clear in Alice's browser", async () => {
			const stored = (await everythingStoredAsText(alice.page)).text;
			for (const plain of [people.alice.last, people.alice.city, people.bob.last, people.bob.city]) {
				expect(stored.includes(plain), `Alice's browser stores ${plain}`).toBe(false);
			}
		});

		await test.step('Alice removes Bob: her card leaves his book', async () => {
			await selectContact(alice.page, people.bob.last);
			await alice.page.getByRole('button', { name: 'Delete' }).click();
			await expect.poll(() => alice.saw(`removed our card from the address book of ${bob.did}`), { timeout: 60000 }).toBe(true);
			await expect.poll(() => names(alice.page), { timeout: 30000 }).not.toContain(`${people.bob.first} ${people.bob.last}`);
			await expect.poll(() => names(bob.page), { timeout: 90000, message: "Alice's card gone from Bob's book" })
				.not.toContain(`${people.alice.first} ${people.alice.last}`);
		});

		await test.step('her next change reaches Carol, not Bob', async () => {
			await selectContact(alice.page, people.alice.last);
			await alice.page.getByPlaceholder('Enter city...').fill(NEW_CITY);
			await alice.page.getByRole('button', { name: 'Update' }).click();
			await expect.poll(() => cities(carol.page), { timeout: 90000, message: "Alice's new city in Carol's book" }).toContain(NEW_CITY);
			// by now it would have reached Bob as well, through the same relay
			expect(await cities(bob.page)).not.toContain(NEW_CITY);
			expect(await names(bob.page)).not.toContain(`${people.alice.first} ${people.alice.last}`);
		});
	} finally {
		await Promise.all([alice.close(), bob.close(), carol.close()]);
	}
});

/** `from` scans `to`'s DID; `to` sends their card and asks back; `from` answers */
async function exchange(from, to) {
	await from.page.getByRole('tab', { name: 'Contacts' }).click();
	await from.page.getByRole('textbox', { role: 'scanContact' }).fill(to.did);
	await from.page.getByRole('button', { name: 'Scan' }).click();
	// the dialog names who asks, though it cannot read their book
	const asking = to.page.getByTestId('request-from');
	await expect(asking).toContainText(await firstAndLast(from.page), { timeout: 90000 });
	await to.page.getByRole('button', { name: 'Send My Contact Data' }).click({ timeout: 90000 });
	await from.page.getByRole('button', { name: 'Send My Contact Data' }).click({ timeout: 90000 });
}

/** the name on this browser's own card */
function firstAndLast(page) {
	return page.evaluate(async () => {
		const me = window.orbitdb.identity.id;
		const own = (await window.mydb.all()).map((record) => record.value).find((card) => card.owner === me);
		return `${own.firstName} ${own.lastName}`;
	});
}

/** remembers what arrives on `topic` in this browser, as anybody may subscribe to it */
async function listenOn(page, topic) {
	await page.evaluate(async (topic) => {
		window.__heard = [];
		const pubsub = window.helia.libp2p.services.pubsub;
		pubsub.addEventListener('message', (event) => {
			if (event.detail.topic === topic) window.__heard.push(new TextDecoder().decode(event.detail.data));
		});
		await pubsub.subscribe(topic);
	}, topic);
}

/** the documents of a book as this browser stores them, without opening anything */
function storedValues(page, address) {
	return page.evaluate(async (address) => {
		const db = await window.orbitdb.open(address, { type: 'documents', sync: true });
		// what the app's sealed book wraps; a book it does not know yet is the database itself
		const raw = db.raw ?? db;
		return (await raw.all()).map((record) => record.value);
	}, address);
}

/** selects a contact in the list, which opens it in the form */
async function selectContact(page, lastName) {
	await page.getByRole('tab', { name: 'Contacts' }).click();
	await page.getByRole('row', { name: new RegExp(lastName) }).locator('label').click();
	await expect(page.getByPlaceholder('Enter lastname...')).toHaveValue(lastName);
}

/** the cities in this browser's own address book */
function cities(page) {
	return page.evaluate(async () => (await window.mydb.all()).map((record) => record.value.city));
}
