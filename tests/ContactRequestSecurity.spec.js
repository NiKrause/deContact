import { test, expect } from '@playwright/test';

// Contact requests are signed with the sender's DID, and an invitation link works once
// (#58, #38). Three people:
// 1. Bob opens Alice's invitation link: Alice sends her card without being asked.
// 2. Carol opens the same link afterwards: the token is used, Alice is asked to confirm.
// 3. Carol sends Alice a request in Bob's name: Alice drops it.
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
			carol = await openLink(browser, link);
			await expect.poll(() => alice.saw(`rejected the invitation link of ${carol.did}: it was already used`), { timeout: 120000 })
				.toBe(true);
			await expect.poll(() => alice.saw(`asking to confirm the request of ${carol.did}`)).toBe(true);
			const cancel = alice.page.getByRole('button', { name: 'Cancel' }).first();
			await expect(cancel).toBeVisible();
			await cancel.click();
		});

		await test.step("Carol sends a request in Bob's name: Alice drops it", async () => {
			// Carol's app signs her request; on the way out it claims to come from Bob
			await carol.page.evaluate((bobDid) => {
				const pubsub = window.helia.libp2p.services.pubsub;
				const publish = pubsub.publish.bind(pubsub);
				pubsub.publish = (topic, bytes) => {
					const envelope = JSON.parse(new TextDecoder().decode(bytes));
					const payload = JSON.parse(envelope.payload);
					payload.sender = bobDid;
					envelope.payload = JSON.stringify(payload);
					return publish(topic, new TextEncoder().encode(JSON.stringify(envelope)));
				};
			}, bob.did);
			await carol.page.evaluate(() => (window.location.hash = '#/'));
			await carol.page.getByRole('tab', { name: 'Contacts' }).click();
			await carol.page.getByRole('textbox', { role: 'scanContact' }).fill(alice.did);
			await carol.page.getByRole('button', { name: 'Scan' }).click();

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
	return { page, saw: (text) => lines.some((line) => line.includes(text)), close: () => context.close() };
}

/** a new user with a contact card, as in AddressArrives.spec.js */
async function register(browser, person) {
	const user = await newBrowser(browser);
	const { page } = user;
	await page.goto(process.env.PAGE_URL);
	await page.getByRole('button', { name: 'Continue' }).click();
	await page.getByRole('button', { name: 'Generate New' }).click();
	await page.getByRole('tab', { name: 'Settings' }).click();
	const didField = page.getByLabel('DID', { exact: true });
	await expect(didField).not.toHaveValue('');
	user.did = await didField.inputValue();
	await page.getByRole('tab', { name: 'My Address' }).click();
	await page.getByPlaceholder('Enter firstname...').fill(person.first);
	await page.getByPlaceholder('Enter lastname...').fill(person.last);
	await page.getByPlaceholder('Enter city...').fill(person.city);
	await page.getByRole('button', { name: 'Add' }).click();
	return user;
}

/** the link in the QR code of `page`, pointing at the app under test */
async function invitationLink(page) {
	await page.getByRole('tab', { name: 'Contacts' }).click();
	await page.getByRole('button', { name: 'QR Code' }).click();
	const qrCode = page.locator('img.qrcode');
	await expect(qrCode).toHaveAttribute('alt', /onBoardingToken=/);
	const link = await qrCode.getAttribute('alt');
	await page.keyboard.press('Escape');
	return process.env.PAGE_URL + link.slice(link.indexOf('#'));
}

/** somebody new opens an invitation link */
async function openLink(browser, link) {
	const user = await newBrowser(browser);
	await user.page.goto(link);
	await expect.poll(() => user.page.evaluate(() => window.orbitdb?.identity?.id ?? ''), { timeout: 60000 }).not.toBe('');
	user.did = await user.page.evaluate(() => window.orbitdb.identity.id);
	return user;
}

/** names in this browser's own address book */
function names(page) {
	return page.evaluate(async () => {
		if (!window.mydb) return [];
		return (await window.mydb.all()).map((record) => `${record.value.firstName} ${record.value.lastName}`);
	});
}
