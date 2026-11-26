import { test, expect } from '@playwright/test';
import { deriveAesKey, deriveSubkey, openVault } from '@le-space/orbitdb-identity-provider-webauthn-did/vault';
import { ed25519 } from '@noble/curves/ed25519.js';
import {
	addCard,
	addVirtualAuthenticator,
	confirmExperimental,
	createAddressBook,
	didOf,
	everythingStoredAsText,
	forgetThisDevice,
	names,
	prfOutputs,
	recordCeremonies,
	spellings,
	takeCeremonies
} from './helpers/passkeys.js';

// The identity comes from a vault the passkey opens (#60): one Ed25519 did:key from the
// vault's root, which is the first passkey's PRF output. These run on a virtual
// authenticator with PRF (Chromium's CDP WebAuthn domain).

const alice = { first: 'Alice', last: 'Wolkenfabrik', city: 'Musterstadt' };
const relayHttp = `http://127.0.0.1:${process.env.E2E_RELAY_HTTP_PORT || '29300'}`;

// part of the data format (src/lib/identity/vault.js)
const SLOT_INFO = 'decontact/vault-slot/v1';
const IDENTITY_INFO = 'decontact/identity/v1';

const fromHex = (hex) => Uint8Array.from(Buffer.from(hex, 'hex'));
const hexOf = (bytes) => Buffer.from(bytes).toString('hex');

/** a page of its own with a virtual authenticator, its console collected */
async function newDevice(browser) {
	const context = await browser.newContext();
	const page = await context.newPage();
	const lines = [];
	page.on('console', (message) => lines.push(message.text()));
	await addVirtualAuthenticator(page);
	await recordCeremonies(page);
	return { context, page, lines, saw: (text) => lines.some((line) => line.includes(text)) };
}

/** how many entries the relay holds of a database (0 when it has none yet) */
async function relayEntries(address) {
	const response = await fetch(`${relayHttp}/pinning/databases?address=${encodeURIComponent(address)}`);
	if (!response.ok) return 0;
	const { databases } = await response.json();
	return databases[0]?.entryCount ?? 0;
}

/**
 * What must not be on disk: the root (the PRF output), the identity's key, its X25519 key
 * and the vault key - worked out here from the PRF outputs the page was given and the
 * public record.
 */
async function secretsOf(page) {
	const outputs = await prfOutputs(page);
	expect(outputs.length).toBeGreaterThan(0);
	const [record] = JSON.parse(await page.evaluate(() => localStorage.getItem('decontact.vaults.v1')));
	const secrets = {};
	for (const [i, hex] of outputs.entries()) {
		secrets[`PRF output ${i + 1}`] = hex;
		const identitySeed = await deriveSubkey(fromHex(hex), IDENTITY_INFO);
		secrets[`identity key from PRF output ${i + 1}`] = hexOf(identitySeed);
		// the X25519 key cards and requests are sealed to (#59)
		secrets[`X25519 key from PRF output ${i + 1}`] = hexOf(ed25519.utils.toMontgomerySecret(identitySeed));
		for (const slot of record.slots) {
			try {
				const { vaultKey } = await openVault(record.vault, {
					slotKey: await deriveAesKey(fromHex(hex), SLOT_INFO),
					rawCredentialId: Uint8Array.from(Buffer.from(slot.credentialId, 'base64url'))
				});
				secrets['vault key'] = hexOf(vaultKey);
			} catch {
				// not this passkey's slot
			}
		}
	}
	expect(Object.keys(secrets)).toContain('vault key');
	return secrets;
}

async function expectNothingSecretStored(page, did) {
	const secrets = await secretsOf(page);
	const { inventory, text } = await everythingStoredAsText(page);
	console.log('IndexedDB:', JSON.stringify(inventory));
	// identity documents are public: the scan does read what is stored
	expect(text).toContain(did);
	// no OrbitDB keystore: the identity's key lives in memory only
	expect(inventory.filter((db) => /keystore|orbitdb\/identities/i.test(db.database))).toEqual([]);
	for (const [name, hex] of Object.entries(secrets)) {
		for (const spelling of spellings(hex)) {
			expect(text.includes(spelling), `${name} stored as ${spelling.slice(0, 12)}…`).toBe(false);
		}
	}
	expect(text).not.toContain('seedPhrase');
}

test('a passkey opens the address book, again after a reload, and nothing secret is stored', async ({ browser }) => {
	test.setTimeout(180000);
	const device = await newDevice(browser);
	const { page } = device;
	try {
		await test.step('a browser of the seed phrase days loses its seed', async () => {
			await page.goto(process.env.PAGE_URL);
			await page.evaluate(() => {
				localStorage.setItem('seedPhrase', 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
				localStorage.setItem('seed', 'ab'.repeat(32));
				localStorage.setItem('testConfirmation', 'true');
			});
			await page.reload();
			await expect(page.getByTestId('legacy-reset')).toBeVisible();
			expect(await page.evaluate(() => [localStorage.getItem('seedPhrase'), localStorage.getItem('seed')])).toEqual([null, null]);
		});

		let did;
		await test.step('a new address book: two prompts, no seed phrase', async () => {
			await takeCeremonies(page);
			did = await createAddressBook(page, 'Alice laptop');
			// register, then one PRF read naming the new passkey
			expect(await takeCeremonies(page)).toEqual([
				['create', true, 0],
				['get', true, 1]
			]);
			await page.getByRole('tab', { name: 'Settings' }).click();
			await expect(page.getByLabel('DID', { exact: true })).toHaveValue(did);
			await expect(page.getByTestId('vault-slot')).toHaveText([/Alice laptop \(opened this session\)/]);
			await addCard(page, alice);
		});

		await test.step('after a reload one prompt opens the same identity and book', async () => {
			await page.reload();
			await page.getByRole('button', { name: 'Unlock with passkey' }).click();
			expect(await didOf(page)).toBe(did);
			expect(await takeCeremonies(page)).toEqual([['get', true, 1]]);
			await expect.poll(() => names(page), { timeout: 30000 }).toContain(`${alice.first} ${alice.last}`);
		});

		await test.step('no root, identity key, X25519 key or vault key at rest', async () => {
			await expectNothingSecretStored(page, did);
		});
	} finally {
		await device.context.close();
	}
});

test('an empty browser restores the identity and the own address book with the same passkey', async ({ browser }) => {
	test.setTimeout(240000);
	const device = await newDevice(browser);
	const { page } = device;
	try {
		await page.goto(process.env.PAGE_URL);
		await confirmExperimental(page);
		const did = await createAddressBook(page, 'Alice phone');
		await addCard(page, alice);
		const book = await page.evaluate(() => window.mydb.address);

		await test.step('the relay holds the address book and the vault record', async () => {
			await expect.poll(() => device.lines.find((line) => line.startsWith('published the vault record in')), { timeout: 30000 })
				.toBeTruthy();
			const log = device.lines.find((line) => line.startsWith('published the vault record in')).split(' in ')[1];
			await expect.poll(() => relayEntries(book), { timeout: 60000, message: 'the address book on the relay' }).toBeGreaterThan(0);
			await expect.poll(() => relayEntries(log), { timeout: 60000, message: 'the vault record on the relay' }).toBeGreaterThan(0);
		});

		await test.step('nothing is left in this browser; the passkey is', async () => {
			await forgetThisDevice(page);
			await page.goto(process.env.PAGE_URL);
			await confirmExperimental(page);
			await expect(page.getByRole('button', { name: 'Create a new address book' })).toBeVisible();
			await takeCeremonies(page);
		});

		await test.step('one prompt, any passkey of the site: the vault comes from the relay', async () => {
			device.lines.length = 0;
			await page.getByRole('button', { name: 'Sign in with an existing passkey' }).click();
			expect(await didOf(page)).toBe(did);
			expect(await takeCeremonies(page)).toEqual([['get', true, 0]]);
			expect(device.saw('vault opened (found elsewhere)')).toBe(true);
			await expect.poll(() => names(page), { timeout: 90000, message: 'the own card, back from the relay' })
				.toContain(`${alice.first} ${alice.last}`);
		});

		await test.step('the restored browser keeps nothing secret either', async () => {
			await expectNothingSecretStored(page, did);
		});
	} finally {
		await device.context.close();
	}
});

test('a passkey that opens nothing gets no address book without asking', async ({ browser }) => {
	test.setTimeout(120000);
	const device = await newDevice(browser);
	const { page } = device;
	try {
		// a passkey of this site that never made an address book (registered, nothing kept)
		await page.goto(process.env.PAGE_URL);
		await confirmExperimental(page);
		await page.evaluate(async () => {
			await navigator.credentials.create({
				publicKey: {
					challenge: crypto.getRandomValues(new Uint8Array(32)),
					rp: { name: 'deContact', id: location.hostname },
					user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'stranger', displayName: 'stranger' },
					pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
					authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
					extensions: { prf: {} }
				}
			});
		});
		await page.getByRole('button', { name: 'Sign in with an existing passkey' }).click();
		await expect(page.getByTestId('ask-new')).toBeVisible({ timeout: 60000 });
		await page.getByRole('button', { name: 'Cancel' }).click();
		await expect(page.getByTestId('passkey-problem')).toContainText('No address book was created');
		expect(await page.evaluate(() => localStorage.getItem('decontact.vaults.v1'))).toBeNull();
		expect(await page.evaluate(() => window.orbitdb)).toBeUndefined();

		// asked again, the person says yes: a new address book for that passkey
		await page.getByRole('button', { name: 'Sign in with an existing passkey' }).click();
		await page.getByRole('button', { name: 'Continue with this passkey' }).click({ timeout: 60000 });
		await didOf(page);
		expect(JSON.parse(await page.evaluate(() => localStorage.getItem('decontact.vaults.v1')))).toHaveLength(1);
	} finally {
		await device.context.close();
	}
});
