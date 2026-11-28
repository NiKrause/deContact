// Passkeys in the E2E tests (#60): a virtual authenticator with PRF (CDP WebAuthn, as in
// simple-todo passkey01 and Le-Space/belege's e2e), the steps between two prompts, and
// what a browser keeps on disk. The storage scan follows Belege's e2e/storage-scan.js.
import { expect } from '@playwright/test';

/**
 * A platform-style authenticator with PRF, resident keys and user verification, for this
 * page (a virtual authenticator belongs to the page it was added to, across navigations).
 *
 * @param {import('@playwright/test').Page} page
 */
export async function addVirtualAuthenticator(page) {
	const cdp = await page.context().newCDPSession(page);
	await cdp.send('WebAuthn.enable');
	const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
		options: {
			protocol: 'ctap2',
			ctap2Version: 'ctap2_1',
			transport: 'internal',
			hasResidentKey: true,
			hasUserVerification: true,
			isUserVerified: true,
			hasPrf: true,
			automaticPresenceSimulation: true
		}
	});
	return { cdp, authenticatorId };
}

/**
 * Record every WebAuthn ceremony the page starts, and the PRF outputs it was given (so the
 * storage scan knows what must not be on disk). Injected by the test, not in the app.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function recordCeremonies(page) {
	await page.addInitScript(() => {
		const log = [];
		const prf = [];
		const hex = (buffer) => Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');
		Object.defineProperty(window, '__webauthnCeremonies', { value: log });
		Object.defineProperty(window, '__prfOutputs', { value: prf });
		for (const kind of ['create', 'get']) {
			const original = navigator.credentials[kind].bind(navigator.credentials);
			navigator.credentials[kind] = async (options) => {
				const entry = {
					kind,
					prf: Boolean(options?.publicKey?.extensions?.prf),
					allow: options?.publicKey?.allowCredentials?.length ?? 0,
					ok: false
				};
				log.push(entry);
				const result = await original(options);
				entry.ok = true;
				const first = result?.getClientExtensionResults?.()?.prf?.results?.first;
				if (first) prf.push(hex(first));
				return result;
			};
		}
	});
}

/** the ceremonies since the last call, as [kind, prf, allow], and forget them */
export async function takeCeremonies(page) {
	const ceremonies = await page.evaluate(() => window.__webauthnCeremonies.splice(0));
	expect(ceremonies.every((c) => c.ok), JSON.stringify(ceremonies)).toBe(true);
	return ceremonies.map((c) => [c.kind, c.prf, c.allow]);
}

/** the PRF outputs this page was given, in hex */
export function prfOutputs(page) {
	return page.evaluate(() => [...new Set(window.__prfOutputs)]);
}

/** "Continue" in <passkey-step-dialog>, which announces the second prompt of an action */
export async function continuePasskeyStep(page) {
	const button = page.locator('passkey-step-dialog').getByRole('button', { name: 'Continue' });
	await expect(button).toBeVisible({ timeout: 30000 });
	// the dialog ignores clicks for a moment after it appears, so a click meant for the
	// step before cannot approve this one
	await page.waitForTimeout(600);
	await button.click();
	await expect(button).toBeHidden();
}

/** the DID of the page's OrbitDB, once it runs */
export async function didOf(page) {
	await expect.poll(() => page.evaluate(() => window.orbitdb?.identity?.id ?? ''), { timeout: 60000 }).toMatch(/^did:key:z6Mk/);
	return page.evaluate(() => window.orbitdb.identity.id);
}

/** a new address book with a new passkey: two prompts, the second announced */
export async function createAddressBook(page, label = 'E2E') {
	await page.getByLabel('Name of the new passkey (optional)').fill(label);
	await page.getByRole('button', { name: 'Create a new address book' }).click();
	await continuePasskeyStep(page);
	return didOf(page);
}

/**
 * A new person in a browser of their own, with a passkey and a contact card.
 *
 * @param {import('@playwright/test').Browser} browser
 * @param {{ first: string, last: string, city?: string }} person
 * @param {{ webRTC?: boolean }} options
 */
export async function newPerson(browser, person, { webRTC = true } = {}) {
	const context = await browser.newContext();
	if (!webRTC) await context.addInitScript(() => localStorage.setItem('useWebRTC', 'false'));
	const page = await context.newPage();
	const lines = [];
	page.on('console', (message) => lines.push(message.text()));
	const authenticator = await addVirtualAuthenticator(page);
	// the PRF outputs: what a storage scan must not find, and the root of the vault (#59)
	await recordCeremonies(page);
	await page.goto(process.env.PAGE_URL);
	const did = await createAddressBook(page, person.first);
	await addCard(page, person);
	return {
		page,
		did,
		authenticator,
		lines,
		saw: (text) => lines.some((line) => line.includes(text)),
		close: () => context.close()
	};
}

/** our own card in the form: My card shows it as others see it, Edit opens the form (#110) */
export async function editMyCard(page) {
	await page.getByRole('link', { name: 'My business card' }).click();
	await page.getByRole('button', { name: 'Edit', exact: true }).click();
}

/** our own contact card */
export async function addCard(page, { first, last, city = 'Example City' }) {
	await page.getByRole('link', { name: 'My business card' }).click();
	await page.getByPlaceholder('Enter firstname...').fill(first);
	await page.getByPlaceholder('Enter lastname...').fill(last);
	// a new card has no address yet: "Add address" opens its fields (#109)
	await page.getByRole('button', { name: 'Add address' }).click();
	await page.getByPlaceholder('Enter city...').fill(city);
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect.poll(() => names(page), { timeout: 30000 }).toContain(`${first} ${last}`);
	await expect(page.getByTestId('my-card-name')).toHaveText(`${first} ${last}`);
}

/**
 * Asks somebody for their card by their contact address, as a person does without a camera:
 * Exchange → "Paste a contact address instead" → Ask (#110).
 */
export async function askByAddress(page, address) {
	await page.getByRole('link', { name: 'Exchange' }).click();
	const field = page.getByTestId('scan-field');
	if (!(await field.isVisible())) await page.getByRole('button', { name: 'Paste a contact address instead' }).click();
	await field.fill(address);
	await page.getByRole('button', { name: 'Ask', exact: true }).click();
}

/**
 * Back to the list under Contacts (#110): "All contacts" on a phone; on a desktop the list is
 * beside the contact's page already.
 */
export async function allContacts(page) {
	const back = page.getByRole('button', { name: 'All contacts' });
	if (await back.isVisible()) await back.click();
	await expect(page.getByTestId('contacts-list-pane')).toBeVisible();
}

/** the list under Contacts, as it shows (#110): one text per contact */
export async function listedContacts(page) {
	await page.getByRole('link', { name: 'Contacts' }).click();
	await allContacts(page);
	return page.getByTestId('contact-row').allTextContents();
}

/** a contact's page: Contacts → their row (#110) */
export async function openContact(page, lastName) {
	await listedContacts(page);
	await page.getByTestId('contact-row').filter({ hasText: lastName }).first().click();
	await expect(page.getByTestId('contact-page')).toBeVisible();
	await expect(page.getByTestId('contact-name')).toContainText(lastName);
}

/** names in this browser's own address book */
export function names(page) {
	return page.evaluate(async () => {
		if (!window.mydb) return [];
		return (await window.mydb.all()).map((record) => `${record.value.firstName} ${record.value.lastName}`);
	});
}

/**
 * Everything this origin kept - localStorage, sessionStorage, every IndexedDB database -
 * gone, as on a device that has never been here. The passkey stays in the authenticator.
 * Done from a static file of the same origin: the app holds its databases open.
 */
export async function forgetThisDevice(page) {
	await page.goto(new URL('manifest.json', process.env.PAGE_URL).toString());
	await page.evaluate(async () => {
		localStorage.clear();
		sessionStorage.clear();
		for (const { name } of await indexedDB.databases()) {
			if (!name) continue;
			await new Promise((resolve, reject) => {
				const request = indexedDB.deleteDatabase(name);
				request.onsuccess = () => resolve(undefined);
				request.onerror = () => reject(request.error);
				request.onblocked = () => reject(new Error(`${name} is still open`));
			});
		}
	});
}

/**
 * Everything this origin keeps in IndexedDB, localStorage and sessionStorage, as text.
 * Bytes appear twice: as UTF-8 (for DIDs, words) and as hex (for keys).
 */
export async function everythingStoredAsText(page) {
	return page.evaluate(async () => {
		const decoder = new TextDecoder('utf-8', { fatal: false });
		const asText = (value) => {
			if (value == null) return '';
			if (typeof value === 'string') return value;
			const both = (bytes) => decoder.decode(bytes) + '\n' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
			if (value instanceof ArrayBuffer) return both(new Uint8Array(value));
			if (ArrayBuffer.isView(value)) return both(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
			if (typeof value === 'object') return Object.values(value).map(asText).join('\n');
			return String(value);
		};
		const inventory = [];
		let text = '';
		for (const { name } of await indexedDB.databases()) {
			if (!name) continue;
			const db = await new Promise((resolve, reject) => {
				const request = indexedDB.open(name);
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => reject(request.error);
			});
			let records = 0;
			for (const storeName of db.objectStoreNames) {
				const store = db.transaction(storeName, 'readonly').objectStore(storeName);
				const [keys, values] = await Promise.all(
					[store.getAllKeys(), store.getAll()].map(
						(request) =>
							new Promise((resolve, reject) => {
								request.onsuccess = () => resolve(request.result);
								request.onerror = () => reject(request.error);
							})
					)
				);
				records += values.length;
				text += asText(keys) + '\n' + asText(values) + '\n';
			}
			db.close();
			inventory.push({ database: name, records });
		}
		for (const storage of [localStorage, sessionStorage]) {
			for (let i = 0; i < storage.length; i++) {
				const key = storage.key(i);
				text += key + '\n' + storage.getItem(key) + '\n';
			}
		}
		return { inventory, text };
	});
}

/**
 * The ways a secret could be written down: hex, base64, base64url, a JSON number array,
 * each for the whole secret and its first 32 bytes.
 *
 * @param {string} hex
 */
export function spellings(hex) {
	const forms = new Set();
	for (const part of new Set([hex, hex.slice(0, 64)])) {
		const bytes = Buffer.from(part, 'hex');
		forms.add(part);
		forms.add(part.toUpperCase());
		forms.add(bytes.toString('base64').replace(/=+$/, ''));
		forms.add(bytes.toString('base64url'));
		forms.add(Array.from(bytes).join(','));
	}
	return [...forms];
}

/**
 * What the QR code shows besides the invitation link: the DID and the device to ask it on
 * (src/lib/network/contact-address.js). Requests go peer to peer, so a DID alone reaches
 * nobody.
 */
export function contactAddressOf(page) {
	return page.evaluate(() => `${window.orbitdb.identity.id}?peer=${window.helia.libp2p.peerId.toString()}`);
}

/**
 * A passkey of this site that never made an address book (registered, nothing kept):
 * "Sign in with an existing passkey" with it asks before making one (the ask-new state).
 */
export async function strayPasskey(page) {
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
}
