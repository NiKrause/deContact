import { test, expect } from '@playwright/test';
import { contactKey } from '@le-space/orbitdb-access-controller-decontact';
import { contactAddressOf, names, newPerson, askByAddress } from './helpers/passkeys.js';
import { times } from './helpers/onboarding.js';

// Who may write into an address book, through the app and the relay (#81), and what
// removing a contact takes back (#82). The writes go through window.__decontactE2E
// (src/lib/network/e2e-hook.js), which only the E2E build has: as the page's identity,
// through the access controller, without the app's own rules.
//
// 1. Alice invites Bob with the normal exchange; Carol is not invited. Carol tries to put
//    her own card, Alice's card and a document of her own into Alice's book, and to delete
//    Bob's card. Bob tries to overwrite Alice's card and to write cards under other DIDs.
//    Each write is refused in the writer's browser, Alice's book stays as it was, and
//    Dave, who opens it later through the relay alone, finds none of it. Bob's update of
//    his own card still reaches Alice.
// 2. Alice removes Bob: his invitation is revoked. His app stops writing his card into her
//    book; a card he writes anyway does not show in her list. They exchange cards again,
//    and Bob is back.

const people = {
	alice: { first: 'Alice', last: 'Wolkenfabrik', city: 'Musterstadt' },
	bob: { first: 'Bob', last: 'Stromwerk', city: 'Beispielort' },
	carol: { first: 'Carol', last: 'Beispiel', city: 'Example City' },
	dave: { first: 'Dave', last: 'Example', city: 'Example City' }
};
const REFUSED = /is not allowed to write to the log/;
const relayHttp = `http://127.0.0.1:${process.env.E2E_RELAY_HTTP_PORT || '29300'}`;

test('only the owner, and an invited contact with their own card, write into an address book', async ({ browser }) => {
	test.setTimeout(480000);
	const alice = await newPerson(browser, people.alice);
	const bob = await newPerson(browser, people.bob);
	const carol = await newPerson(browser, people.carol);
	let dave;
	try {
		const book = await bookOf(alice.page);
		await test.step('Alice invites Bob through the normal exchange', async () => {
			await exchangeCards(bob, alice);
		});

		// Alice's book as it stands, and as Bob and Carol see it before they try anything
		const before = await documents(alice.page, book);
		await expect.poll(() => documents(bob.page, book), { timeout: 90000, message: "Bob's copy of Alice's book" }).toEqual(before);
		await openBook(carol.page, book, alice.did);
		await expect.poll(() => documents(carol.page, book), { timeout: 90000, message: "Carol's copy of Alice's book" }).toEqual(before);
		const alicesCard = await ownCardKey(alice.page);
		const bobsCard = before.find((doc) => doc.key === contactKey(bob.did));
		expect(alicesCard, "Alice's own card").toBeTruthy();
		// Bob's invitation stands in the clear on his card: anybody who opens the book reads it
		const bobsInvitation = bobsCard.value.invitation;
		expect(bobsInvitation).toMatchObject({ owner: alice.did, invitee: bob.did });

		const attempts = [
			[carol, 'her own card, without an invitation', { put: { _id: contactKey(carol.did), owner: carol.did, firstName: 'Carol' } }],
			[carol, "her own card, with Bob's invitation", { put: { _id: contactKey(carol.did), owner: carol.did, firstName: 'Carol', invitation: bobsInvitation } }],
			[carol, "Alice's own card", { put: { _id: alicesCard, owner: alice.did, firstName: 'Alice', lastName: 'Overwritten' } }],
			[carol, 'a document of her own', { put: { _id: 'written-by-carol', owner: carol.did, firstName: 'Carol' } }],
			[carol, "to delete Bob's card", { del: contactKey(bob.did) }],
			[bob, "Alice's own card", { put: { _id: alicesCard, owner: bob.did, firstName: 'Alice', lastName: 'Overwritten', invitation: bobsInvitation } }],
			[bob, "a card under Carol's DID", { put: { _id: contactKey(carol.did), owner: carol.did, firstName: 'Carol', invitation: bobsInvitation } }],
			[bob, 'a card under his key, owned by Carol', { put: { _id: contactKey(bob.did), owner: carol.did, firstName: 'Carol', invitation: bobsInvitation } }],
			[bob, "to delete Alice's own card", { del: alicesCard }]
		];
		for (const [person, what, attempt] of attempts) {
			const who = person === bob ? 'Bob' : 'Carol';
			await test.step(`${who} tries ${what}: refused`, async () => {
				const result = await write(person.page, book, attempt);
				expect(result.ok, JSON.stringify(result)).toBe(false);
				expect(result.error).toMatch(REFUSED);
				// refused in the writer's browser: their copy of the book did not take it either
				expect(await documents(person.page, book)).toEqual(before);
			});
		}

		const NEW_CITY = 'Neustadt am Beispiel';
		let after;
		await test.step('Bob still updates his own card, and Alice sees it', async () => {
			await openOwnCard(bob.page, people.bob.last);
			await bob.page.getByPlaceholder('Enter city...').fill(NEW_CITY);
			await bob.page.getByRole('button', { name: 'Update' }).click();
			await expect.poll(() => cities(alice.page), { timeout: 90000, message: "Bob's new city in Alice's book" }).toContain(NEW_CITY);
			await expect.poll(() => listed(alice.page)).toContainEqual(expect.stringContaining(people.bob.last));
			after = await documents(alice.page, book);
		});

		await test.step("Alice's book is unchanged but for Bob's update", async () => {
			expect(after.map((doc) => doc.key)).toEqual(before.map((doc) => doc.key));
			for (const doc of after) {
				if (doc.key === bobsCard.key) expect(doc.hash).not.toBe(bobsCard.hash);
				else expect(doc).toEqual(before.find((it) => it.key === doc.key));
			}
			expect(await names(alice.page)).not.toContain('Alice Overwritten');
			// the update came after every refused write, through the same relay and peers
			await expect.poll(() => documents(carol.page, book), { timeout: 60000, message: "Carol's copy of Alice's book" }).toEqual(after);
		});

		const entries = await entriesOf(alice.page, book);
		await test.step('the relay holds Alice\'s book with the update', async () => {
			const update = after.find((doc) => doc.key === bobsCard.key).hash;
			await expect.poll(() => relayHasEntry(book, update), { timeout: 90000, message: 'the update on the relay' }).toBe(true);
		});

		await test.step('Dave opens Alice\'s book through the relay alone: none of it is there', async () => {
			// nobody else is online, so whatever Dave gets comes from the relay
			await Promise.all([alice, bob, carol].map(leave));
			dave = await newPerson(browser, people.dave);
			await openBook(dave.page, book, alice.did);
			await expect.poll(() => documents(dave.page, book), { timeout: 120000, message: "Dave's copy of Alice's book" }).toEqual(after);
			// not one entry more: no refused write is hidden behind a newer one either
			await expect.poll(() => entriesOf(dave.page, book), { timeout: 60000 }).toEqual(entries);
		});
	} finally {
		await Promise.all([alice, bob, carol, dave].filter(Boolean).map(leave));
	}
});

test("a removed contact's card stays out until they are invited again", async ({ browser }) => {
	test.setTimeout(480000);
	const alice = await newPerson(browser, people.alice);
	const bob = await newPerson(browser, people.bob);
	try {
		const book = await bookOf(alice.page);
		await test.step('Alice and Bob exchange cards', async () => {
			await exchangeCards(bob, alice);
		});
		// what Bob can still write with: his invitation, which never expires
		await expect.poll(() => documents(bob.page, book).then((docs) => docs.some((doc) => doc.key === contactKey(bob.did))), { timeout: 90000 })
			.toBe(true);
		const bobsInvitation = (await documents(bob.page, book)).find((doc) => doc.key === contactKey(bob.did)).value.invitation;

		await test.step('Alice removes Bob: his invitation is revoked', async () => {
			await selectContact(alice.page, people.bob.last);
			await alice.page.getByRole('button', { name: 'Delete' }).click();
			// asked first (#110)
			await expect(alice.page.getByRole('heading', { name: `Remove ${people.bob.first} ${people.bob.last}?` })).toBeVisible();
			await alice.page.getByRole('button', { name: 'Remove', exact: true }).click();
			await expect.poll(() => alice.saw(`revoked the invitation of ${bob.did}`), { timeout: 30000 }).toBe(true);
			await expect.poll(() => alice.saw(`removed our card from the address book of ${bob.did}`), { timeout: 60000 }).toBe(true);
			const docs = await documents(alice.page, book);
			const revocation = docs.find((doc) => doc.key === `revoked:${bob.did}`);
			// only the key in the clear; who removed him and when are sealed to Alice
			expect(Object.keys(revocation.value).sort()).toEqual(['_id', 'sealed']);
			expect(docs.some((doc) => doc.key === contactKey(bob.did))).toBe(false);
			await expect.poll(() => listed(alice.page)).not.toContainEqual(expect.stringContaining(people.bob.last));
		});

		await test.step("Bob's app stops writing his card into Alice's book", async () => {
			await expect.poll(() => documents(bob.page, book).then((docs) => docs.some((doc) => doc.key === `revoked:${bob.did}`)), {
				timeout: 90000,
				message: "the revocation in Bob's copy of Alice's book"
			}).toBe(true);
			const updates = times(bob, `updated our card in ${book}`);
			await openOwnCard(bob.page, people.bob.last);
			await bob.page.getByPlaceholder('Enter city...').fill('Neustadt am Beispiel');
			await bob.page.getByRole('button', { name: 'Update' }).click();
			await expect.poll(() => bob.saw(`not updating our card in ${book}: its owner removed us`), { timeout: 30000 }).toBe(true);
			expect(times(bob, `updated our card in ${book}`)).toBe(updates);
			expect((await documents(bob.page, book)).some((doc) => doc.key === contactKey(bob.did))).toBe(false);
		});

		await test.step('a card Bob writes anyway does not show in her list', async () => {
			// the access controller still takes it: the invitation is Alice's signature
			const card = { _id: contactKey(bob.did), owner: bob.did, firstName: 'Bob', lastName: 'Unwanted', invitation: bobsInvitation };
			const result = await write(bob.page, book, { put: card });
			expect(result.ok, JSON.stringify(result)).toBe(true);
			await expect.poll(() => documents(alice.page, book).then((docs) => docs.find((doc) => doc.key === card._id)?.value.lastName), {
				timeout: 90000,
				message: "Bob's card in Alice's book"
			}).toBe('Unwanted');
			await expect.poll(() => alice.saw(`ignored the card of ${bob.did}: we removed them`), { timeout: 30000 }).toBe(true);
			const rows = await listed(alice.page);
			expect(rows.some((row) => row.includes('Unwanted') || row.includes(people.bob.last)), rows.join(' | ')).toBe(false);
		});

		await test.step('Alice and Bob exchange cards again: Bob is back', async () => {
			await exchangeCards(bob, alice);
			await expect.poll(() => alice.saw(`lifted the revocation of ${bob.did}: we invite them again`), { timeout: 30000 }).toBe(true);
			expect((await documents(alice.page, book)).some((doc) => doc.key === `revoked:${bob.did}`)).toBe(false);
			await expect.poll(() => listed(alice.page), { timeout: 90000, message: "Bob's card in Alice's list" })
				.toContainEqual(expect.stringContaining(people.bob.last));
			await expect.poll(() => listed(alice.page)).not.toContainEqual(expect.stringContaining('Unwanted'));
		});

		await test.step("Bob's updates reach Alice again", async () => {
			await expect.poll(() => documents(bob.page, book).then((docs) => docs.some((doc) => doc.key === `revoked:${bob.did}`)), {
				timeout: 60000,
				message: "the revocation gone from Bob's copy of Alice's book"
			}).toBe(false);
			await openOwnCard(bob.page, people.bob.last);
			await bob.page.getByPlaceholder('Enter city...').fill('Altstadt am Beispiel');
			await bob.page.getByRole('button', { name: 'Update' }).click();
			await expect.poll(() => cities(alice.page), { timeout: 90000, message: "Bob's new city in Alice's book" }).toContain('Altstadt am Beispiel');
		});
	} finally {
		await Promise.all([alice, bob].map(leave));
	}
});

/**
 * `from` scans `to`'s DID; `to` sends their card and asks back; `from` answers. Then
 * each has the other's card.
 */
async function exchangeCards(from, to) {
	await askByAddress(from.page, await contactAddressOf(to.page));
	await expect(to.page.getByTestId('request-from')).toBeVisible({ timeout: 90000 });
	await to.page.getByRole('button', { name: 'Share and ask for theirs' }).click({ timeout: 90000 });
	await from.page.getByRole('button', { name: 'Share mine' }).click({ timeout: 90000 });
	const fromName = await firstAndLast(from.page);
	const toName = await firstAndLast(to.page);
	await expect.poll(() => names(from.page), { timeout: 90000, message: `${toName} in the book of ${fromName}` }).toContain(toName);
	await expect.poll(() => names(to.page), { timeout: 90000, message: `${fromName} in the book of ${toName}` }).toContain(fromName);
}

const left = new WeakSet();
/** closes a person's browser once */
async function leave(person) {
	if (left.has(person)) return;
	left.add(person);
	await person.close();
}

/** the address of this browser's own book */
const bookOf = (page) => page.evaluate(() => window.mydb.address);

/** the `_id` of this browser's own card in its own book */
function ownCardKey(page) {
	return page.evaluate(async () => {
		const me = window.orbitdb.identity.id;
		return (await window.mydb.all()).find((record) => record.value.owner === me && record.value.own)?.key;
	});
}

/** the name on this browser's own card */
function firstAndLast(page) {
	return page.evaluate(async () => {
		const me = window.orbitdb.identity.id;
		const own = (await window.mydb.all()).map((record) => record.value).find((card) => card.owner === me && card.own);
		return `${own.firstName} ${own.lastName}`;
	});
}

/** opens a book by its address in this browser: its manifest names the owner */
async function openBook(page, address, owner) {
	const opened = await page.evaluate((address) => window.__decontactE2E.open(address), address);
	expect(opened).toEqual({ address, type: 'decontact-address-book', owner });
}

/** the documents of a book as this browser stores them, by key */
async function documents(page, address) {
	const docs = await page.evaluate((address) => window.__decontactE2E.all(address), address);
	return docs.sort((a, b) => a.key.localeCompare(b.key));
}

/** the hashes of every entry of a book's log in this browser */
async function entriesOf(page, address) {
	return (await page.evaluate((address) => window.__decontactE2E.entries(address), address)).sort();
}

/** a put or a delete as this browser's identity: `{ ok, hash }` or `{ ok: false, error }` */
function write(page, address, attempt) {
	return page.evaluate(
		({ address, attempt }) =>
			attempt.del !== undefined ? window.__decontactE2E.del(address, attempt.del) : window.__decontactE2E.put(address, attempt.put),
		{ address, attempt }
	);
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

/** the rows of the contact list on screen */
async function listed(page) {
	await page.getByRole('link', { name: 'Contacts' }).click();
	return page.getByRole('row').allTextContents();
}

/** our own card: My Address opens it, it is not in the list (#110) */
async function openOwnCard(page, lastName) {
	await page.getByRole('link', { name: 'My card' }).click();
	await expect(page.getByPlaceholder('Enter lastname...')).toHaveValue(lastName);
}

/** selects a contact in the list, which opens it in the form */
async function selectContact(page, lastName) {
	await page.getByRole('link', { name: 'Contacts' }).click();
	await page.getByRole('row', { name: new RegExp(lastName) }).locator('label').click();
	await expect(page.getByPlaceholder('Enter lastname...')).toHaveValue(lastName);
}

/** the cities in this browser's own address book */
function cities(page) {
	return page.evaluate(async () => (await window.mydb.all()).map((record) => record.value.city));
}
