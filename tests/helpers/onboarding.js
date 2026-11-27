// Invitation links in the E2E tests (#72, #86): the link in the QR code, somebody new who
// opens it, their onboarding form, and what an address book ever held under a key.
import { expect } from '@playwright/test';
import { deriveSubkey } from '@le-space/orbitdb-identity-provider-webauthn-did/vault';
import { openCard } from '../../src/lib/encryption/cards.js';
import { encryptionKeysFromSeed } from '../../src/lib/encryption/sealing.js';
import { addVirtualAuthenticator, createAddressBook, prfOutputs, recordCeremonies } from './passkeys.js';

// part of the data format (src/lib/identity/vault.js)
const IDENTITY_INFO = 'decontact/identity/v1';
export const TWO_WAY_HELP = 'Whoever scans this code can also share their contact details with you. They decide whether to.';

/** the topic `did` receives requests on (p2p-operations.js CONTENT_TOPIC) */
export const topicOf = (did) => `/dContact/3/message/proto/${did}`;

/**
 * The invitation link in the QR code of `page`, pointing at the app under test.
 * "Two-way exchange" is on by default; `twoWay: false` turns it off first.
 */
export async function invitationLink(page, { twoWay = true } = {}) {
	await page.getByRole('tab', { name: 'Contacts' }).click();
	await page.getByRole('button', { name: 'QR Code' }).click();
	const option = page.getByRole('checkbox', { name: 'Two-way exchange' });
	await expect(option).toBeChecked();
	await expect(page.getByText(TWO_WAY_HELP)).toBeVisible();
	if (!twoWay) {
		await page.getByText('Two-way exchange', { exact: true }).click();
		await expect(option).not.toBeChecked();
	}
	// a token of 1.<nonce>.<expiry>.<two-way>.<signature>, issued again for the new choice
	const qrCode = page.locator('img.qrcode');
	await expect(qrCode).toHaveAttribute('alt', new RegExp(`onBoardingToken=1\\.[A-Za-z0-9_-]{22}\\.\\d+\\.${twoWay ? 1 : 0}\\.`));
	const link = await qrCode.getAttribute('alt');
	await page.keyboard.press('Escape');
	// the link leads back to the app that showed it, not to some other address
	expect(link.startsWith(`${process.env.PAGE_URL}#/onboarding/`)).toBe(true);
	return link;
}

/** somebody new opens an invitation link: a passkey, then the onboarding view */
export async function openLink(browser, link, label = 'Invitee') {
	const context = await browser.newContext();
	const page = await context.newPage();
	const lines = [];
	page.on('console', (message) => lines.push(message.text()));
	await addVirtualAuthenticator(page);
	await recordCeremonies(page);
	await page.goto(link);
	await expect(page.getByText('Create a passkey to open your own address book')).toBeVisible();
	const did = await createAddressBook(page, label);
	await expect(page.getByTestId('onboarding')).toBeVisible();
	return {
		page,
		did,
		lines,
		saw: (text) => lines.some((line) => line.includes(text)),
		close: () => context.close()
	};
}

/** how many lines of a person's console contain `text` */
export const times = (person, text) => person.lines.filter((line) => line.includes(text)).length;

/** the onboarding form: email first, the names, the address only on request */
export async function fillOnboardingCard(page, { email, first, last }) {
	await page.getByPlaceholder('Enter email...').fill(email);
	if (first) await page.getByPlaceholder('Enter firstname...').fill(first);
	if (last) await page.getByPlaceholder('Enter lastname...').fill(last);
}

/** the names in this browser's own address book, first name and last name */
export function names(page) {
	return page.evaluate(async () => {
		if (!window.mydb) return [];
		return (await window.mydb.all()).map((record) => `${record.value.firstName} ${record.value.lastName}`);
	});
}

/**
 * Every document that was ever put under `key` into the book of `owner` (a person from
 * newPerson), oldest first, opened with the owner's keys: what the book held at any time,
 * not only now. The X25519 key comes from the vault's root, the first passkey's PRF output.
 */
export async function everPutUnder(owner, key) {
	const values = await owner.page.evaluate(async (key) => {
		const entries = await window.mydb.raw.log.values();
		return entries.filter((entry) => entry.payload?.op === 'PUT' && entry.payload?.key === key).map((entry) => entry.payload.value);
	}, key);
	const [root] = await prfOutputs(owner.page);
	const seed = await deriveSubkey(Uint8Array.from(Buffer.from(root, 'hex')), IDENTITY_INFO);
	const keys = await encryptionKeysFromSeed(seed, { did: owner.did });
	return Promise.all(values.map((value) => openCard(value, { bookOwner: owner.did, keys })));
}
