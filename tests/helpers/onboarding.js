// Invitation links in the E2E tests (#72, #86, #97): the link in the QR code, somebody new
// who opens it (the form at once, a passkey afterwards), their onboarding form, and what an
// address book ever held under a key.
import { expect } from '@playwright/test';
import { deriveSubkey } from '@le-space/orbitdb-identity-provider-webauthn-did/vault';
import { openCard } from '../../src/lib/encryption/cards.js';
import { encryptionKeysFromSeed } from '../../src/lib/encryption/sealing.js';
import {
	addVirtualAuthenticator,
	continuePasskeyStep,
	createAddressBook,
	didOf,
	prfOutputs,
	recordCeremonies,
	takeCeremonies
} from './passkeys.js';

// part of the data format (src/lib/identity/vault.js)
const IDENTITY_INFO = 'decontact/identity/v1';
export const TWO_WAY_HELP = 'Whoever scans this code can also share their contact details with you. They decide whether to.';

/**
 * An app in the background: its device does not answer contact requests (the end-to-end
 * build's hook, src/lib/network/e2e-hook.js), or does again.
 */
export const answerRequests = (page, answering) =>
	page.evaluate((answering) => (answering ? window.__decontactE2E.resumeRequests() : window.__decontactE2E.pauseRequests()), answering);

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

/** a browser of its own with a virtual authenticator, its console collected */
export async function newBrowser(browser) {
	const context = await browser.newContext();
	const page = await context.newPage();
	const lines = [];
	page.on('console', (message) => lines.push(message.text()));
	await addVirtualAuthenticator(page);
	await recordCeremonies(page);
	return {
		page,
		lines,
		saw: (text) => lines.some((line) => line.includes(text)),
		close: () => context.close()
	};
}

/**
 * Somebody new opens an invitation link (#97): the form at once, without a passkey. They
 * start on it, and their temporary identity starts; the passkey comes after the exchange
 * (`secure`).
 */
export async function openLink(browser, link) {
	const person = await newBrowser(browser);
	const { page } = person;
	await page.goto(link);
	await expect(page.getByTestId('onboarding')).toBeVisible();
	await expect(page.getByTestId('sign-in-instead')).toBeVisible();
	expect(await takeCeremonies(page), 'a passkey prompt before the form').toEqual([]);
	await startOnTheForm(page);
	person.did = await didOf(page);
	return person;
}

/** the person starts on the form (the email field): a temporary identity starts, and the inviter is asked */
export async function startOnTheForm(page) {
	await page.getByPlaceholder('Enter email...').focus();
}

/**
 * Somebody opens an invitation link with a passkey first, today's flow: "Already have a
 * deContact passkey? Sign in" on the form, then a new address book on the passkey screen.
 */
export async function openLinkWithPasskey(browser, link, label = 'Invitee') {
	const person = await newBrowser(browser);
	const { page } = person;
	await page.goto(link);
	await page.getByRole('button', { name: 'Already have a deContact passkey? Sign in' }).click();
	await expect(page.getByText('Create a passkey to open your own address book')).toBeVisible();
	person.did = await createAddressBook(page, label);
	await expect(page.getByTestId('onboarding')).toBeVisible();
	return person;
}

/** "Secure with a passkey" (the banner's or the settings'): two prompts, the second announced */
export async function secure(page, button = page.getByRole('button', { name: 'Secure with a passkey' })) {
	await button.click();
	await continuePasskeyStep(page);
	await expect(page.getByTestId('secure-safeguards')).toBeVisible();
}

/**
 * Whether leaving the page now asks first (beforeunload). Asked of the page's own handler,
 * so no dialog opens.
 */
export function warnsBeforeLeaving(page) {
	return page.evaluate(() => {
		const event = new Event('beforeunload', { cancelable: true });
		window.dispatchEvent(event);
		return event.defaultPrevented;
	});
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
