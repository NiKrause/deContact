import { test, expect } from '@playwright/test';
import { contactKey } from '@le-space/orbitdb-access-controller-decontact';
import { contactAddressOf, everythingStoredAsText, newPerson } from './helpers/passkeys.js';
import { fillOnboardingCard, invitationLink, openLink } from './helpers/onboarding.js';
import { bytesOfDataUrl, metadataOf, withExif } from './helpers/exif.js';

// A contact photo in the sealed part of the card (#87).
// 1. Alice chooses a photo under My Address: a made-up portrait, as a JPEG whose EXIF names a
//    place and holds GPS coordinates. Her card gets a small WebP without them.
// 2. Bob opens her invitation link: the onboarding shows her photo once her card is there,
//    and after he saved, his contact list and her details do.
// 3. Carol, a third peer, replicates Bob's book as a follower or relay does: no byte of the
//    photo stands in the clear there, nor in any of the three browsers' storage.
// 4. Alice removes her photo: it goes from Bob's list too.
// 5. Carol, with a photo on her card, asks Alice by contact address: Alice's request dialog
//    shows a small copy of it, which Carol's signed request carries (#110).

const people = {
	alice: { first: 'Alice', last: 'Bildermacher', city: 'Musterstadt' },
	bob: { first: 'Bob', last: 'Stromwerk', email: 'bob@example.com' },
	carol: { first: 'Carol', last: 'Beispiel', city: 'Example City' }
};
const MAX_PHOTO_BYTES = 30 * 1024;

test("Bob sees Alice's photo after the onboarding; a third peer sees no image bytes", async ({ browser }) => {
	test.setTimeout(480000);
	const alice = await newPerson(browser, people.alice);
	let bob, carol, photo;
	try {
		await test.step('Alice chooses a photo: small, square, without the EXIF of the original', async () => {
			const original = withExif(await madeUpPortrait(alice.page));
			expect(metadataOf(original).metadata).toEqual(['place', 'EXIF']);
			await openCard(alice.page, people.alice.last);
			const chooser = alice.page.waitForEvent('filechooser');
			await alice.page.getByRole('button', { name: 'Choose photo' }).click();
			await (await chooser).setFiles({ name: 'portrait.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(original) });
			await expect(alice.page.getByTestId('form-photo')).toBeVisible();
			await expect(alice.page.getByRole('button', { name: 'Remove photo' })).toBeVisible();
			await alice.page.getByRole('button', { name: 'Update' }).click();
			await expect.poll(() => ownPhoto(alice.page), { timeout: 30000 }).toMatch(/^data:image\/webp;base64,/);
			photo = await ownPhoto(alice.page);
			const bytes = bytesOfDataUrl(photo);
			expect(bytes.length).toBeLessThanOrEqual(MAX_PHOTO_BYTES);
			expect(metadataOf(bytes)).toEqual({ type: 'webp', metadata: [] });
			// her own card is under My Address, not in her list (#110)
			await openCard(alice.page, people.alice.last);
			await expect(alice.page.getByTestId('form-photo')).toHaveAttribute('src', photo);
		});

		await test.step("Bob opens her link: the onboarding shows her photo once her card is there", async () => {
			const link = await invitationLink(alice.page);
			bob = await openLink(browser, link);
			await expect(bob.page.getByTestId('inviter-card')).toHaveText(`${people.alice.first} ${people.alice.last} was added to your address book`, {
				timeout: 120000
			});
			const shown = bob.page.getByTestId('inviter-photo');
			await expect(shown).toHaveAttribute('src', photo);
			expect(await shown.evaluate((image) => [image.complete, image.naturalWidth, image.naturalHeight])).toEqual([true, 256, 256]);
		});

		await test.step('Bob saves: her photo in his contact list and in her details', async () => {
			await fillOnboardingCard(bob.page, people.bob);
			await bob.page.getByRole('button', { name: `Save and share with ${people.alice.first}` }).click();
			await expect(bob.page.getByRole('tab', { name: 'Contacts' })).toBeVisible();
			const row = rowOf(bob.page, people.alice.last);
			await expect(row.getByTestId('contact-photo')).toHaveAttribute('src', photo, { timeout: 60000 });
			await row.getByRole('button', { name: 'Expand current row' }).click();
			await expect(bob.page.getByTestId('contact-details-photo')).toHaveAttribute('src', photo);
			// the details list the other fields in words, not the data URL
			const details = bob.page.getByTestId('contact-details');
			await expect(details).toContainText(people.alice.city);
			expect(await details.textContent()).not.toContain('data:image');
		});

		await test.step("Carol replicates Bob's book: the photo is not in the clear there", async () => {
			carol = await newPerson(browser, people.carol);
			const bobsBook = await bob.page.evaluate(() => window.mydb.address);
			const alicesKey = contactKey(alice.did);
			const alicesCardArrived = async () => (await storedValues(carol.page, bobsBook)).some((value) => value._id === alicesKey && value.owner === alice.did);
			await expect.poll(alicesCardArrived, { timeout: 120000, message: "Alice's card in Carol's copy of Bob's book" }).toBe(true);
			const values = await storedValues(carol.page, bobsBook);
			for (const value of values) {
				expect(value.sealed, JSON.stringify(value).slice(0, 120)).toMatchObject({ v: 1 });
				expect(Object.keys(value).every((field) => ['_id', 'owner', 'invitation', 'sealed'].includes(field))).toBe(true);
			}
			const text = JSON.stringify(values);
			for (const spelling of spellingsOf(photo)) expect(text.includes(spelling), `Bob's book shows the photo as ${spelling.slice(0, 20)}…`).toBe(false);
		});

		await test.step('no browser stores the photo in the clear', async () => {
			for (const [person, name] of [[carol, 'Carol'], [bob, 'Bob'], [alice, 'Alice']]) {
				const stored = (await everythingStoredAsText(person.page)).text;
				for (const spelling of spellingsOf(photo)) {
					expect(stored.includes(spelling), `${name}'s browser stores the photo as ${spelling.slice(0, 20)}…`).toBe(false);
				}
			}
		});

		await test.step('an entry of her card stays small', async () => {
			const sizes = await bob.page.evaluate(async (key) => {
				const log = window.mydb.raw.log;
				const entries = (await log.values()).filter((entry) => entry.payload?.key === key);
				return Promise.all(entries.map(async (entry) => (await log.storage.get(entry.hash))?.length ?? 0));
			}, contactKey(alice.did));
			console.log(`entries of Alice's card in Bob's book: ${sizes.join(', ')} bytes`);
			expect(sizes.length).toBeGreaterThan(0);
			// far below the 4 MiB libp2p streams, gossipsub and bitswap accept for one message
			expect(Math.max(...sizes)).toBeLessThan(64 * 1024);
		});

		await test.step('Alice removes her photo: it goes from Bob\'s list too', async () => {
			await openCard(alice.page, people.alice.last);
			await alice.page.getByRole('button', { name: 'Remove photo' }).click();
			await expect(alice.page.getByTestId('form-photo')).toHaveCount(0);
			await alice.page.getByRole('button', { name: 'Update' }).click();
			await expect.poll(() => ownPhoto(alice.page), { timeout: 30000 }).toBeUndefined();
			await expect(rowOf(bob.page, people.alice.last).getByTestId('contact-photo')).toHaveCount(0, { timeout: 120000 });
			await expect(rowOf(bob.page, people.alice.last)).toBeVisible();
		});
	} finally {
		await Promise.all([alice, bob, carol].filter(Boolean).map((person) => person.close()));
	}
});

test("the request dialog shows a small copy of the asker's photo", async ({ browser }) => {
	test.setTimeout(300000);
	const alice = await newPerson(browser, people.alice);
	const carol = await newPerson(browser, people.carol);
	try {
		await test.step('Carol chooses a photo', async () => {
			await openCard(carol.page, people.carol.last);
			const chooser = carol.page.waitForEvent('filechooser');
			await carol.page.getByRole('button', { name: 'Choose photo' }).click();
			await (await chooser).setFiles({ name: 'portrait.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(await madeUpPortrait(carol.page)) });
			await expect(carol.page.getByTestId('form-photo')).toBeVisible();
			await carol.page.getByRole('button', { name: 'Update' }).click();
			await expect.poll(() => ownPhoto(carol.page), { timeout: 30000 }).toMatch(/^data:image\/webp;base64,/);
		});

		await test.step("she asks Alice: Alice's dialog shows it, 64 pixels wide and a few KB", async () => {
			await carol.page.getByRole('tab', { name: 'Contacts' }).click();
			await carol.page.getByTestId('scan-field').fill(await contactAddressOf(alice.page));
			await carol.page.getByRole('button', { name: 'Scan' }).click();
			const shown = alice.page.getByTestId('request-photo');
			await expect(shown).toBeVisible({ timeout: 90000 });
			const src = await shown.getAttribute('src');
			expect(src).toMatch(/^data:image\/(webp|jpeg);base64,/);
			expect(bytesOfDataUrl(src).length).toBeLessThanOrEqual(6 * 1024);
			expect(await shown.evaluate((image) => [image.complete, image.naturalWidth, image.naturalHeight])).toEqual([true, 64, 64]);
			await expect(alice.page.getByTestId('request-from')).toContainText(`${people.carol.first} ${people.carol.last}`);
			await alice.page.getByRole('button', { name: 'Decline' }).click();
		});
	} finally {
		await Promise.all([alice.close(), carol.close()]);
	}
});

/** a made-up portrait as a JPEG, drawn on a canvas of this page: a gradient, a head and shoulders */
async function madeUpPortrait(page) {
	const bytes = await page.evaluate(async () => {
		const canvas = document.createElement('canvas');
		canvas.width = 1200;
		canvas.height = 1600;
		const context = canvas.getContext('2d');
		const sky = context.createLinearGradient(0, 0, 0, canvas.height);
		sky.addColorStop(0, '#7fb2e5');
		sky.addColorStop(1, '#f2d7b6');
		context.fillStyle = sky;
		context.fillRect(0, 0, canvas.width, canvas.height);
		context.fillStyle = '#c68642';
		context.beginPath();
		context.arc(600, 640, 216, 0, 2 * Math.PI);
		context.fill();
		context.fillStyle = '#3b5b92';
		context.fillRect(300, 990, 600, 610);
		const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
		return Array.from(new Uint8Array(await blob.arrayBuffer()));
	});
	return Uint8Array.from(bytes);
}

/**
 * How the photo would show if it were stored in the clear: the start of its data URL, a
 * piece of its base64 (and base64url), its WebP header, and a piece of its bytes in hex
 * (the storage scan shows bytes as text and as hex).
 */
function spellingsOf(photo) {
	const base64 = photo.slice(photo.indexOf(',') + 1);
	const piece = base64.slice(400, 480);
	return [photo.slice(0, 60), piece, piece.replaceAll('+', '-').replaceAll('/', '_'), 'WEBPVP8', Buffer.from(base64, 'base64').subarray(600, 648).toString('hex')];
}

/** the photo on this browser's own card */
function ownPhoto(page) {
	return page.evaluate(async () => {
		const me = window.orbitdb.identity.id;
		const own = (await window.mydb.all()).map((record) => record.value).find((card) => card.owner === me && card.own);
		return own?.photo;
	});
}

/** the row of a contact in the list (not the row of its details, when they are open) */
function rowOf(page, lastName) {
	return page.getByRole('row', { name: new RegExp(lastName) }).first();
}

/** our own card: My Address opens it (#110) */
async function openCard(page, lastName) {
	await page.getByRole('tab', { name: 'My Address' }).click();
	await expect(page.getByPlaceholder('Enter lastname...')).toHaveValue(lastName);
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
