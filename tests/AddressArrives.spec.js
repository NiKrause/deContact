import { test, expect } from '@playwright/test';
import { addVirtualAuthenticator, confirmExperimental, contactAddressOf, createAddressBook } from './helpers/passkeys.js';

// The other specs only click through the dialogs. This one checks that each address
// really ends up in the other address book, and logs which way it travelled:
// - WebRTC on: Alice and Bob may connect directly; the relay (orbitdb-relay) keeps a
//   replica of both books either way.
// - WebRTC off: the browsers only meet through the relay; the address has to come from
//   the relay's replica or over the relayed circuit.
// Afterwards Alice's card in Bob's book names her device (devices.js), so her DID alone,
// without the device of a QR code, reaches her.

const people = {
	alice: { first: 'Alice', last: 'Wolkenfabrik', city: 'Musterstadt' },
	bob: { first: 'Bob', last: 'Stromwerk', city: 'Beispielort' }
};

for (const webRTC of [true, false]) {
	test(`addresses arrive on both sides (${webRTC ? 'WebRTC allowed' : 'relay only'})`, async ({ browser }) => {
		test.setTimeout(240000);
		const alice = await startPerson(browser, people.alice, { webRTC });
		const bob = await startPerson(browser, people.bob, { webRTC });
		try {
			await bob.page.getByRole('tab', { name: 'Contacts' }).click();
			await bob.page.getByRole('textbox', { role: 'scanContact' }).fill(await contactAddressOf(alice.page));
			await bob.page.getByRole('button', { name: 'Scan' }).click();

			// Alice is asked and answers; Bob is asked back and answers
			await alice.page.getByRole('button', { name: 'Send My Contact Data' }).click({ timeout: 90000 });
			await bob.page.getByRole('button', { name: 'Send My Contact Data' }).click({ timeout: 90000 });

			try {
				await expect.poll(() => names(alice.page), { timeout: 90000, message: "Bob's address in Alice's book" })
					.toContain(`${people.bob.first} ${people.bob.last}`);
				await expect.poll(() => names(bob.page), { timeout: 90000, message: "Alice's address in Bob's book" })
					.toContain(`${people.alice.first} ${people.alice.last}`);
			} finally {
				const label = webRTC ? 'webrtc' : 'relay-only';
				const path = await pathBetween(bob.page, alice.page);
				console.log(`[${label}] Bob -> Alice connections: ${JSON.stringify(path.connections)}`);
				console.log(`[${label}] Bob synced his copy of Alice's book with: ${JSON.stringify(path.syncedWith)}`);
				console.log(`[${label}] Alice's book: ${JSON.stringify(await names(alice.page))}, Bob's book: ${JSON.stringify(await names(bob.page))}`);
				console.log(`[${label}] Bob's dials: ${JSON.stringify([...new Set(bob.dials)].slice(0, 8), null, 1)}`);
				if (!webRTC) expect(path.connections.filter((c) => c.startsWith('webrtc'))).toEqual([]);
			}

			// her card names her device; his request by her DID alone goes there
			const alicesPeer = await alice.page.evaluate(() => window.helia.libp2p.peerId.toString());
			await expect.poll(() => devicesInCard(bob.page, alice.did), { timeout: 90000, message: "Alice's device in her card in Bob's book" })
				.toContain(alicesPeer);
			await bob.page.getByRole('tab', { name: 'Contacts' }).click();
			await bob.page.getByRole('textbox', { role: 'scanContact' }).fill(alice.did);
			await bob.page.getByRole('button', { name: 'Scan' }).click();
			await expect(alice.page.getByTestId('request-from')).toContainText(`${people.bob.first} ${people.bob.last}`, { timeout: 90000 });
			await alice.page.getByRole('button', { name: 'Cancel' }).first().click();
		} finally {
			await Promise.all([alice.close(), bob.close()]);
		}
	});
}

async function startPerson(browser, person, { webRTC }) {
	const context = await browser.newContext();
	if (!webRTC) {
		await context.addInitScript(() => localStorage.setItem('useWebRTC', 'false'));
	}
	const page = await context.newPage();
	// how this browser tried to reach the other one (peer-connectivity.js)
	const dials = [];
	page.on('console', (message) => {
		const text = message.text();
		if (/discovered peer|reserved a slot|refused a reservation/.test(text)) dials.push(text.slice(0, 300));
	});
	await addVirtualAuthenticator(page);
	await page.goto(process.env.PAGE_URL);
	await confirmExperimental(page);
	await createAddressBook(page, person.first);
	await page.getByRole('tab', { name: 'Settings' }).click();
	const didField = page.getByLabel('DID', { exact: true });
	await expect(didField).not.toHaveValue('');
	const did = await didField.inputValue();
	await page.getByRole('tab', { name: 'My Address' }).click();
	await page.getByPlaceholder('Enter firstname...').fill(person.first);
	await page.getByPlaceholder('Enter lastname...').fill(person.last);
	await page.getByPlaceholder('Enter city...').fill(person.city);
	await page.getByRole('button', { name: 'Add' }).click();
	return { page, did, dials, close: () => context.close() };
}

/** the devices the card of `did` in this browser's own book names */
function devicesInCard(page, did) {
	return page.evaluate(async (did) => {
		const card = (await window.mydb.all()).map((record) => record.value).find((value) => value.owner === did && Array.isArray(value.devices));
		return (card?.devices ?? []).map((device) => device.peer);
	}, did);
}

/** names in this browser's own address book */
function names(page) {
	return page.evaluate(async () =>
		(await window.mydb.all()).map((record) => `${record.value.firstName} ${record.value.lastName}`)
	);
}

/** how `from` reaches `to`, and with whom `from` exchanged heads of `to`'s address book */
async function pathBetween(from, to) {
	const toPeerId = await to.evaluate(() => window.helia.libp2p.peerId.toString());
	const toBook = await to.evaluate(() => window.mydb.address);
	return from.evaluate(async ({ toPeerId, toBook }) => {
		const libp2p = window.helia.libp2p;
		const kind = (addr) => (addr.includes('/webrtc') ? 'webrtc' : addr.includes('/p2p-circuit') ? 'relayed' : 'direct');
		const connections = libp2p.getConnections()
			.filter((c) => c.remotePeer.toString() === toPeerId)
			.map((c) => `${kind(c.remoteAddr.toString())} ${c.remoteAddr}`);
		const relays = libp2p.getConnections()
			.filter((c) => kind(c.remoteAddr.toString()) === 'direct')
			.map((c) => c.remotePeer.toString());
		// already open in this browser, so open() hands back that instance
		const db = await window.orbitdb.open(toBook);
		const syncedWith = [...(db.peers ?? [])].map(String)
			.map((id) => (id === toPeerId ? 'the other browser' : relays.includes(id) ? 'relay' : id));
		return { connections, syncedWith };
	}, { toPeerId, toBook });
}
