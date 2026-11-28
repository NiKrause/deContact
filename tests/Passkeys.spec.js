import { test, expect } from './helpers/policy.js';
import { readFileSync } from 'node:fs';
import { deriveAesKey, deriveSubkey, openVault, rootOf } from '@le-space/orbitdb-identity-provider-webauthn-did/vault';
import { ed25519 } from '@noble/curves/ed25519.js';
import { contactKey } from '@le-space/orbitdb-access-controller-decontact';
import {
	addCard,
	addVirtualAuthenticator,
	createAddressBook,
	didOf,
	everythingStoredAsText,
	forgetThisDevice,
	names,
	newPerson,
	prfOutputs,
	recordCeremonies,
	spellings,
	takeCeremonies,
	editMyCard
} from './helpers/passkeys.js';
import {
	everPutUnder,
	fillOnboardingCard,
	invitationLink,
	newBrowser,
	secure,
	startOnTheForm,
	warnsBeforeLeaving
} from './helpers/onboarding.js';

// The identity comes from a vault the passkey opens (#60): one Ed25519 did:key from the
// vault's root, which is the first passkey's PRF output - or, for an identity that began
// as a temporary one after an invitation link (#97), a random root the first passkey
// sealed. These run on a virtual authenticator with PRF (Chromium's CDP WebAuthn domain).

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
 * What must not be on disk: the root, the identity's key, its X25519 key and the vault key
 * - worked out here from the PRF outputs the page was given and the public record. The
 * root is the first passkey's PRF output, or a temporary identity's random root (#97),
 * which only the vault shows.
 */
async function secretsOf(page) {
	const outputs = await prfOutputs(page);
	expect(outputs.length).toBeGreaterThan(0);
	const [record] = JSON.parse(await page.evaluate(() => localStorage.getItem('decontact.vaults.v1')));
	const secrets = {};
	const fromRoot = async (name, root) => {
		const identitySeed = await deriveSubkey(root, IDENTITY_INFO);
		secrets[`identity key from ${name}`] = hexOf(identitySeed);
		// the X25519 key cards and requests are sealed to (#59)
		secrets[`X25519 key from ${name}`] = hexOf(ed25519.utils.toMontgomerySecret(identitySeed));
	};
	for (const [i, hex] of outputs.entries()) {
		secrets[`PRF output ${i + 1}`] = hex;
		await fromRoot(`PRF output ${i + 1}`, fromHex(hex));
		for (const slot of record.slots) {
			try {
				const { vaultKey, payload } = await openVault(record.vault, {
					slotKey: await deriveAesKey(fromHex(hex), SLOT_INFO),
					rawCredentialId: Uint8Array.from(Buffer.from(slot.credentialId, 'base64url'))
				});
				secrets['vault key'] = hexOf(vaultKey);
				const root = rootOf(payload);
				secrets.root = hexOf(root);
				await fromRoot('the root', root);
			} catch {
				// not this passkey's slot
			}
		}
	}
	expect(Object.keys(secrets)).toContain('vault key');
	return secrets;
}

function expectNoSecretIn(text, secrets, where) {
	for (const [name, hex] of Object.entries(secrets)) {
		for (const spelling of spellings(hex)) {
			expect(text.includes(spelling), `${name} stored${where} as ${spelling.slice(0, 12)}…`).toBe(false);
		}
	}
}

/**
 * @param {{ earlier?: string }} options earlier: what the browser stored at an earlier
 *   moment (everythingStoredAsText), checked against the secrets as they are known now -
 *   for a temporary identity (#97), whose root shows only once a passkey sealed it
 */
async function expectNothingSecretStored(page, did, { earlier } = {}) {
	const secrets = await secretsOf(page);
	const { inventory, text } = await everythingStoredAsText(page);
	console.log('IndexedDB:', JSON.stringify(inventory));
	// identity documents are public: the scan does read what is stored
	expect(text).toContain(did);
	// no OrbitDB keystore: the identity's key lives in memory only
	expect(inventory.filter((db) => /keystore|orbitdb\/identities/i.test(db.database))).toEqual([]);
	expectNoSecretIn(text, secrets, '');
	if (earlier !== undefined) expectNoSecretIn(earlier, secrets, ' earlier');
	expect(text).not.toContain('seedPhrase');
	return secrets;
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
			await page.getByRole('link', { name: 'Settings' }).click();
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

// The passkey after the exchange (#97). Bob scans Alice's QR code with a browser that has
// never run deContact:
// 1. The form shows at once, without a passkey prompt. Once he starts on it, a temporary
//    identity starts (its root in memory only) and the two-way exchange runs under its DID.
//    Before he secures it, nothing secret is on disk and leaving the page warns. Then he
//    secures it with a passkey: the same DID, a reload unlocks it with the same contacts,
//    and his later changes still reach Alice's book.
// 2. "Already have a deContact passkey? Sign in": today's flow, with the DID of his vault,
//    and the link's one-time token is never used by a temporary identity.

const people = {
	alice,
	bob: { first: 'Bob', last: 'Stromwerk', email: 'bob@example.com' }
};
const fullName = (person) => `${person.first} ${person.last}`;

/**
 * Whether the relay holds the vault record this page published: asked by the hash of its
 * entries, as /pinning/databases counts no entries for a log it only saw in an update.
 */
async function relayHoldsVaultRecord(person) {
	const log = person.lines.find((line) => line.startsWith('published the vault record in'))?.split(' in ')[1];
	if (!log) return false;
	const hashes = await person.page.evaluate(async (address) => {
		const db = await window.orbitdb?.open(address);
		return db ? (await db.all()).map((entry) => entry.hash) : [];
	}, log);
	if (hashes.length === 0) return false;
	const response = await fetch(`${relayHttp}/pinning/has-entry`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ dbAddress: log, entryHash: hashes[0] })
	});
	return response.ok && (await response.json()).hasEntry === true;
}

/** what this browser keeps in localStorage and sessionStorage, by key */
const storageKeys = (page) => page.evaluate(() => ({ local: Object.keys(localStorage).sort(), session: Object.keys(sessionStorage) }));

test('a new browser exchanges cards first and secures them with a passkey afterwards', async ({ browser }) => {
	test.setTimeout(600000);
	const alice = await newPerson(browser, people.alice);
	let bob;
	try {
		const link = await invitationLink(alice.page);
		bob = await newBrowser(browser);
		const { page } = bob;

		await test.step('the form at once: no passkey prompt, no identity yet', async () => {
			await page.goto(link);
			await expect(page.getByTestId('onboarding')).toBeVisible();
			await expect(page.getByRole('button', { name: 'Already have a deContact passkey? Sign in' })).toBeVisible();
			await expect(page.getByTestId('passkey-gate')).toHaveCount(0);
			expect(await takeCeremonies(page)).toEqual([]);
			expect(await page.evaluate(() => window.orbitdb)).toBeUndefined();
			expect(await warnsBeforeLeaving(page)).toBe(false);
		});

		await test.step('Bob starts on the form: a temporary identity, and Alice\'s card arrives', async () => {
			await startOnTheForm(page);
			await page.keyboard.type('bob@');
			bob.did = await didOf(page);
			expect(bob.saw(`temporary identity ${bob.did}`)).toBe(true);
			// the form stayed as it was while the identity started: what he typed, and where
			await expect(page.getByPlaceholder('Enter email...')).toHaveValue('bob@');
			expect(await page.evaluate(() => document.activeElement?.id)).toBe('onboarding-email');
			await expect(page.getByTestId('inviter-card')).toHaveText(`${fullName(people.alice)} was added to your address book`, { timeout: 120000 });
			await expect.poll(() => alice.saw(`accepted the invitation link of ${bob.did}`), { timeout: 60000 }).toBe(true);
		});

		await test.step('Save and share: his card reaches her book under the temporary DID', async () => {
			await fillOnboardingCard(page, people.bob);
			await page.getByRole('button', { name: `Save and share with ${people.alice.first}` }).click();
			await expect(page.getByRole('link', { name: 'Contacts' })).toBeVisible();
			await expect.poll(() => names(alice.page), { timeout: 120000, message: "Bob's card in Alice's book" }).toContain(fullName(people.bob));
			expect(await names(page)).toContain(fullName(people.alice));
			const cards = await everPutUnder(alice, contactKey(bob.did));
			expect(cards.at(-1)).toMatchObject({ owner: bob.did, firstName: people.bob.first, email: people.bob.email });
			expect(await takeCeremonies(page)).toEqual([]);
		});

		let temporaryPhase;
		await test.step('until it is secured: nothing kept but sealed entries, and leaving warns', async () => {
			expect(await warnsBeforeLeaving(page)).toBe(true);
			const keys = await storageKeys(page);
			for (const key of ['decontact.vaults.v1', 'decontact.lastSlot.v1', 'decontact.exchanges.v1', 'onboardingTokens']) {
				expect(keys.local, `${key} in localStorage`).not.toContain(key);
			}
			// sessionStorage: only SvelteKit's own scroll positions and history (the scan below reads them too)
			expect(keys.session.filter((key) => !key.startsWith('sveltekit:'))).toEqual([]);
			temporaryPhase = await everythingStoredAsText(page);
			console.log('IndexedDB while temporary:', JSON.stringify(temporaryPhase.inventory));
			// the scan reads what is stored: the public identity document names the DID
			expect(temporaryPhase.text).toContain(bob.did);
			// no OrbitDB keystore: the identity's key lives in memory only
			expect(temporaryPhase.inventory.filter((db) => /keystore|orbitdb\/identities/i.test(db.database))).toEqual([]);
			// the cards in the book are sealed: Bob's email is not on disk
			expect(temporaryPhase.text).not.toContain(people.bob.email);
		});

		await test.step('"Keep this contact?" - Not now; Settings still offers it', async () => {
			const offer = page.getByTestId('secure-offer');
			await expect(offer.getByRole('heading', { name: 'Keep this contact?' })).toBeVisible({ timeout: 60000 });
			await offer.getByRole('button', { name: 'Not now' }).click();
			await expect(offer).toHaveCount(0);
			expect(await warnsBeforeLeaving(page)).toBe(true);
			await page.getByRole('link', { name: 'Settings' }).click();
			await expect(page.getByLabel('DID', { exact: true })).toHaveValue(bob.did);
			await expect(page.getByTestId('secure-settings')).toBeVisible();
			await expect(page.getByTestId('vault-slot')).toHaveCount(0);
			expect(await takeCeremonies(page)).toEqual([]);
		});

		await test.step('Bob secures it: two prompts, the same DID, the record published', async () => {
			await secure(page, page.getByTestId('secure-settings').getByRole('button', { name: 'Secure with a passkey' }));
			expect(await takeCeremonies(page)).toEqual([
				['create', true, 0],
				['get', true, 1]
			]);
			expect(bob.saw(`vault opened (new, for the temporary identity), identity ${bob.did}`)).toBe(true);
			await expect(page.getByLabel('DID', { exact: true })).toHaveValue(bob.did);
			await expect(page.getByTestId('vault-slot')).toHaveText([/deContact \(opened this session\)/]);
			expect(await warnsBeforeLeaving(page)).toBe(false);
			await expect.poll(() => bob.lines.find((line) => line.startsWith('published the vault record in')), { timeout: 30000 }).toBeTruthy();
			// what was held in memory is kept now: the link's exchange outlives a reload
			expect((await storageKeys(page)).local).toEqual(expect.arrayContaining(['decontact.vaults.v1', 'decontact.lastSlot.v1', 'decontact.exchanges.v1']));
		});

		await test.step('the other ways back in: short, skippable', async () => {
			const safeguards = page.getByTestId('secure-safeguards');
			await expect(safeguards.getByRole('button', { name: 'Write down recovery words' })).toBeVisible();
			const download = page.waitForEvent('download');
			await safeguards.getByRole('button', { name: 'Download vault file' }).click();
			const file = await download;
			expect(file.suggestedFilename()).toBe('decontact-vault.json');
			const record = JSON.parse(readFileSync(await file.path(), 'utf8'));
			const [kept] = JSON.parse(await page.evaluate(() => localStorage.getItem('decontact.vaults.v1')));
			expect(record.vault).toEqual(kept.vault);
			await safeguards.getByRole('button', { name: 'Done' }).click();
			await expect(safeguards).toHaveCount(0);
		});

		await test.step('no secret of the temporary identity was ever on disk', async () => {
			const secrets = await expectNothingSecretStored(page, bob.did, { earlier: temporaryPhase.text });
			// the vault holds the temporary root, not the passkey's PRF output
			expect(secrets.root).toBeTruthy();
			expect(secrets.root).not.toBe(secrets['PRF output 1'].slice(0, 64));
		});

		await test.step('after a reload the passkey unlocks the same DID with the same contacts', async () => {
			await page.reload();
			// the notice of a first visit, which the invitation link skipped
			await page.getByRole('button', { name: 'Unlock with passkey' }).click();
			expect(await didOf(page)).toBe(bob.did);
			expect(await takeCeremonies(page)).toEqual([['get', true, 1]]);
			await expect.poll(() => names(page), { timeout: 60000 }).toEqual(expect.arrayContaining([fullName(people.alice), fullName(people.bob)]));
			await expect(page.getByTestId('secure-offer')).toHaveCount(0);
		});

		await test.step("his invitation into Alice's book still holds: a change of his card reaches her", async () => {
			// his own card, under My Address (#110)
			await editMyCard(page);
			await expect(page.getByPlaceholder('Enter lastname...')).toHaveValue(people.bob.last);
			// his card from the onboarding form has no address yet: "Add address" opens its fields (#109)
			await page.getByRole('button', { name: 'Add address' }).click();
			await page.getByPlaceholder('Enter city...').fill('Beispielort');
			await page.getByRole('button', { name: 'Update' }).click();
			await expect
				.poll(async () => (await everPutUnder(alice, contactKey(bob.did))).at(-1)?.city, { timeout: 120000, message: "Bob's new city in Alice's book" })
				.toBe('Beispielort');
		});

		await test.step('the relay holds the vault record, where an empty device looks for it', async () => {
			await expect.poll(() => relayHoldsVaultRecord(bob), { timeout: 120000, message: 'the vault record on the relay' }).toBe(true);
		});
	} finally {
		await Promise.all([alice, bob].filter(Boolean).map((person) => person.close()));
	}
});

test('"Already have a deContact passkey? Sign in" opens the link with the vault\'s DID', async ({ browser }) => {
	test.setTimeout(420000);
	const bob = await newPerson(browser, { first: people.bob.first, last: people.bob.last });
	let alice;
	try {
		await test.step("Bob's vault record is on the relay; then his browser forgets everything", async () => {
			await expect.poll(() => bob.lines.find((line) => line.startsWith('published the vault record in')), { timeout: 30000 }).toBeTruthy();
			await expect.poll(() => relayHoldsVaultRecord(bob), { timeout: 120000, message: 'the vault record on the relay' }).toBe(true);
			await forgetThisDevice(bob.page);
		});

		alice = await newPerson(browser, people.alice);
		const link = await invitationLink(alice.page);

		await test.step('the form shows; Bob signs in instead, before starting on it', async () => {
			bob.lines.length = 0;
			// every page load records its own ceremonies: none yet on this one
			await bob.page.goto(link);
			await expect(bob.page.getByTestId('onboarding')).toBeVisible();
			expect(await takeCeremonies(bob.page)).toEqual([]);
			await bob.page.getByRole('button', { name: 'Already have a deContact passkey? Sign in' }).click();
			await expect(bob.page.getByText('Create a passkey to open your own address book')).toBeVisible();
			await bob.page.getByRole('button', { name: 'Sign in with an existing passkey' }).click();
			expect(await didOf(bob.page)).toBe(bob.did);
			expect(await takeCeremonies(bob.page)).toEqual([['get', true, 0]]);
			expect(bob.saw('vault opened (found elsewhere)')).toBe(true);
			expect(bob.saw('temporary identity')).toBe(false);
		});

		await test.step('the exchange runs under his vault\'s DID; the token was not used before', async () => {
			await expect(bob.page.getByTestId('onboarding')).toBeVisible();
			await expect(bob.page.getByTestId('sign-in-instead')).toHaveCount(0);
			await expect(bob.page.getByTestId('inviter-card')).toHaveText(`${fullName(people.alice)} was added to your address book`, { timeout: 120000 });
			await fillOnboardingCard(bob.page, people.bob);
			await bob.page.getByRole('button', { name: `Save and share with ${people.alice.first}` }).click();
			await expect.poll(() => names(alice.page), { timeout: 120000, message: "Bob's card in Alice's book" }).toContain(fullName(people.bob));
			expect(alice.saw(`accepted the invitation link of ${bob.did}`)).toBe(true);
			expect(alice.saw('rejected the invitation link')).toBe(false);
			expect(alice.saw('asking to confirm the request')).toBe(false);
			await expect(bob.page.getByTestId('secure-offer')).toHaveCount(0);
			expect(await warnsBeforeLeaving(bob.page)).toBe(false);
		});

		await test.step('a browser that keeps a vault opens a link with the passkey screen, as before', async () => {
			// the plain link again, without the request for the passkey screen
			await bob.page.evaluate((url) => history.replaceState(null, '', url), link);
			await bob.page.reload();
			await expect(bob.page.getByRole('button', { name: 'Unlock with passkey' })).toBeVisible();
			await expect(bob.page.getByTestId('onboarding')).toHaveCount(0);
			await expect(bob.page.getByTestId('sign-in-instead')).toHaveCount(0);
		});
	} finally {
		await Promise.all([alice, bob].filter(Boolean).map((person) => person.close()));
	}
});
