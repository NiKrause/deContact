import { test, expect } from '@playwright/test';
import { createSecretSigner } from '@le-space/orbitdb-identity-provider-webauthn-did';
import { createInvitation } from '@le-space/orbitdb-access-controller-decontact';
import { base64url } from 'multiformats/bases/base64';
import { encryptionKeyOfDid, seal } from '../src/lib/encryption/sealing.js';
import { addVirtualAuthenticator, createAddressBook, prfOutputs, recordCeremonies } from './helpers/passkeys.js';
import { openLink, openLinkWithPasskey } from './helpers/onboarding.js';

// part of the data format (src/lib/identity/vault.js, src/lib/network/contact-messages.js)
const IDENTITY_INFO = 'decontact/identity/v1';

// Contact requests are signed with the sender's DID, and an invitation link works once
// (#58, #38). Three people:
// 1. Bob opens Alice's invitation link: Alice sends her card without being asked.
// 2. Carol opens the same link afterwards, with a passkey first (her root signs the
//    forgery below): the token is used, Alice is asked to confirm.
// 3. Carol sends Alice a request in Bob's name, sealed to Alice: Alice drops it.
// The assertions read Alice's console (p2p-operations.js logs what it accepts and drops).

const people = {
	alice: { first: 'Alice', last: 'Wolkenfabrik', city: 'Musterstadt' },
	bob: { first: 'Bob', last: 'Stromwerk', city: 'Beispielort' },
	carol: { first: 'Carol', last: 'Beispiel', city: 'Example City' }
};

test('forged senders and used invitation links are rejected', async ({ browser }) => {
	test.setTimeout(360000);
	const alice = await register(browser, people.alice);
	let bob, carol;
	try {
		const link = await invitationLink(alice.page);

		await test.step('Bob opens the link: Alice answers without asking', async () => {
			bob = await openLink(browser, link);
			await expect.poll(() => alice.saw(`accepted the invitation link of ${bob.did}`), { timeout: 120000 }).toBe(true);
			await expect.poll(() => names(bob.page), { timeout: 90000, message: "Alice's card in Bob's book" })
				.toContain(`${people.alice.first} ${people.alice.last}`);
			expect(alice.saw(`asking to confirm the request of ${bob.did}`)).toBe(false);
		});

		await test.step('Carol opens the same link: Alice is asked', async () => {
			carol = await openLinkWithPasskey(browser, link);
			await expect.poll(() => alice.saw(`rejected the invitation link of ${carol.did}: it was already used`), { timeout: 120000 })
				.toBe(true);
			await expect.poll(() => alice.saw(`asking to confirm the request of ${carol.did}`)).toBe(true);
			const cancel = alice.page.getByRole('button', { name: 'Decline' });
			await expect(cancel).toBeVisible();
			await cancel.click();
		});

		await test.step("Carol sends a request in Bob's name: Alice drops it", async () => {
			// Carol signs a request with her own key, names Bob as its sender and seals it
			// to Alice, as anybody can (#59): only the signature gives her away
			const [root] = await prfOutputs(carol.page);
			const signer = await createSecretSigner(Uint8Array.from(Buffer.from(root, 'hex')), { info: IDENTITY_INFO });
			expect(signer.did).toBe(carol.did);
			const sharedAddress = await carol.page.evaluate(() => window.mydb.address);
			const forged = await forgedRequest(signer, { claimedSender: bob.did, recipient: alice.did, sharedAddress });
			// to Alice's device, as the app sends a request (contact-protocol.js)
			const alicesPeer = await alice.page.evaluate(() => window.helia.libp2p.peerId.toString());
			// delivered as the app delivers: tried again while no way to her device is open yet
			let delivery;
			await expect.poll(async () => {
				delivery = await carol.page.evaluate(({ peer, text }) => window.__decontactE2E.deliver(peer, text), { peer: alicesPeer, text: forged });
				return delivery.delivered;
			}, { timeout: 60000, intervals: [2000] }).toBe(true);
			// her device took it, and could not open it as a request of Bob's
			expect(delivery, JSON.stringify(delivery)).toMatchObject({ delivered: true, received: false });

			await expect.poll(() => alice.saw(`dropped contact message from ${bob.did}: signature does not match the sender`), { timeout: 120000 })
				.toBe(true);
			expect(alice.saw(`asking to confirm the request of ${bob.did}`)).toBe(false);
		});
	} finally {
		await Promise.all([alice, bob, carol].filter(Boolean).map((person) => person.close()));
	}
});

/** collects the console of a new browser */
async function newBrowser(browser) {
	const context = await browser.newContext();
	const page = await context.newPage();
	const lines = [];
	page.on('console', (message) => lines.push(message.text()));
	// a passkey per person (#60): its vault holds the identity
	await addVirtualAuthenticator(page);
	await recordCeremonies(page);
	return { page, saw: (text) => lines.some((line) => line.includes(text)), close: () => context.close() };
}

/** a new user with a contact card, as in AddressArrives.spec.js */
async function register(browser, person) {
	const user = await newBrowser(browser);
	const { page } = user;
	await page.goto(process.env.PAGE_URL);
	await createAddressBook(page, person.first);
	await page.getByRole('link', { name: 'Settings' }).click();
	const didField = page.getByLabel('DID', { exact: true });
	await expect(didField).not.toHaveValue('');
	user.did = await didField.inputValue();
	await page.getByRole('link', { name: 'My card' }).click();
	await page.getByPlaceholder('Enter firstname...').fill(person.first);
	await page.getByPlaceholder('Enter lastname...').fill(person.last);
	// a new card has no address yet: "Add address" opens its fields (#109)
	await page.getByRole('button', { name: 'Add address' }).click();
	await page.getByPlaceholder('Enter city...').fill(person.city);
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	return user;
}

/** the link in the QR code of `page`, pointing at the app under test */
async function invitationLink(page) {
	await page.getByRole('link', { name: 'Exchange' }).click();
	await page.getByRole('button', { name: 'Show my code' }).click();
	const qrCode = page.locator('img.qrcode');
	await expect(qrCode).toHaveAttribute('alt', /onBoardingToken=/);
	const link = await qrCode.getAttribute('alt');
	await page.keyboard.press('Escape');
	return link;
}

/**
 * A request `signer` signs, naming `claimedSender` as its sender, sealed to `recipient`:
 * the format of contact-messages.js, made by hand.
 */
async function forgedRequest(signer, { claimedSender, recipient, sharedAddress }) {
	const encode = (text) => new TextEncoder().encode(text);
	const payload = JSON.stringify({
		command: 'REQUEST_ADDRESS',
		sender: claimedSender,
		recipient,
		timestamp: Date.now(),
		nonce: base64url.baseEncode(crypto.getRandomValues(new Uint8Array(16))),
		data: { sharedAddress, invitation: await createInvitation(signer, signer.did, recipient) }
	});
	const sig = base64url.baseEncode(await signer.sign(encode(`decontact/message/v2\n${payload}`)));
	const sealed = await seal(encryptionKeyOfDid(recipient), encode(JSON.stringify({ v: 2, payload, sig })), {
		context: `decontact/request/v1\n${recipient}`
	});
	return JSON.stringify({ v: 3, sealed });
}

/** names in this browser's own address book */
function names(page) {
	return page.evaluate(async () => {
		if (!window.mydb) return [];
		return (await window.mydb.all()).map((record) => `${record.value.firstName} ${record.value.lastName}`);
	});
}
