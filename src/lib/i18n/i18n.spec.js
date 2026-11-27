import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';

import de from './de.js';
import en from './en.js';
import {
	LOCALE_KEY,
	_,
	language,
	currentLocale,
	formatDate,
	formatDateTime,
	has,
	initialLocale,
	intlLocale,
	keysOf,
	passkeyStepStrings,
	setLocale,
	startLocale,
	t,
	textIn
} from './index.js';

/** @param {any} catalogue @param {string} key */
const at = (catalogue, key) => key.split('.').reduce((node, part) => node?.[part], catalogue);
/** @param {unknown} text */
const placeholders = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

/** a localStorage of its own for each test (vitest runs in Node, which has none) */
function fakeStorage() {
	const items = new Map();
	return {
		getItem: (/** @type {string} */ key) => (items.has(key) ? items.get(key) : null),
		setItem: (/** @type {string} */ key, /** @type {string} */ value) => void items.set(key, String(value)),
		removeItem: (/** @type {string} */ key) => void items.delete(key)
	};
}

describe('the catalogues (#89)', () => {
	beforeEach(() => {
		globalThis.localStorage = /** @type {any} */ (fakeStorage());
	});
	afterEach(() => {
		setLocale('en');
		delete (/** @type {any} */ (globalThis).localStorage);
	});

	it('English and German have the same keys, the same placeholders and no empty value', () => {
		const english = keysOf(/** @type {any} */ (en));
		const german = keysOf(/** @type {any} */ (de));
		expect(german).toEqual(english);
		for (const key of english) {
			const a = at(en, key);
			const b = at(de, key);
			expect(typeof a, key).toBe('string');
			expect(typeof b, key).toBe('string');
			expect(a.trim(), key).not.toBe('');
			expect(b.trim(), key).not.toBe('');
			expect(placeholders(b), key).toEqual(placeholders(a));
		}
	});

	it('the notices are sentences: no hash, DID or command name in them (#110)', () => {
		for (const key of keysOf(/** @type {any} */ (en)).filter((key) => key.startsWith('notify.'))) {
			for (const catalogue of [en, de]) {
				const text = at(catalogue, key);
				// a name or a reason may be filled in; nothing technical
				expect(placeholders(text).filter((name) => name !== 'name'), key).toEqual([]);
				expect(text, key).not.toMatch(/did:|zdpu|orbitdb|ipfs|SEND_ADDRESS|hash|DB\b/i);
				expect(text, key).toMatch(/^\S.*[.!?…]$/);
			}
		}
	});

	it('the agreed wording of the QR dialog: what scanning the code does (#86)', () => {
		expect(textIn('en', 'qr.shareNow')).toBe('Share right away');
		expect(textIn('de', 'qr.shareNow')).toBe('Sofort teilen');
		expect(textIn('en', 'qr.letThemAsk')).toBe('Let them ask first');
		expect(textIn('de', 'qr.letThemAsk')).toBe('Erst anfragen lassen');
		expect(textIn('en', 'qr.twoWay')).toBe('Also ask for their contact details');
		expect(textIn('de', 'qr.twoWay')).toBe('Auch um ihre Kontaktdaten bitten');
		expect(textIn('en', 'qr.summaryBoth')).toBe(
			'The first person to scan gets your contact details right away and can send you theirs. The code works for 24 hours.'
		);
		expect(textIn('de', 'qr.summaryBoth')).toBe(
			'Die erste Person, die scannt, bekommt deine Kontaktdaten sofort und kann dir ihre schicken. Der Code gilt 24 Stunden.'
		);
		expect(textIn('de', 'qr.summaryAsk')).toMatch(/^Nur in deContact scannbar: .* du entscheidest/);
	});

	it('switches at once and fills in the placeholders', () => {
		expect(currentLocale()).toBe('en');
		expect(t('onboarding.saveAndShare', { name: 'Alice' })).toBe('Save and share with Alice');
		setLocale('de');
		expect(currentLocale()).toBe('de');
		expect(t('onboarding.saveAndShare', { name: 'Alice' })).toBe('Speichern und mit Alice teilen');
		// a placeholder without a value stays visible
		expect(t('onboarding.saveAndShare')).toBe('Speichern und mit {name} teilen');
		expect(t('passkeys.added', { date: '1. Jan.' })).toBe('hinzugefügt am 1. Jan.');
	});

	it('a key German lacks shows in English, never blank; an unknown key shows as itself', () => {
		setLocale('de');
		const saved = /** @type {any} */ (de).onboarding.saveOnly;
		try {
			delete (/** @type {any} */ (de).onboarding.saveOnly);
			expect(t('onboarding.saveOnly')).toBe('Save only');
			/** @type {any} */ (de).onboarding.saveOnly = '';
			expect(t('onboarding.saveOnly')).toBe('Save only');
		} finally {
			/** @type {any} */ (de).onboarding.saveOnly = saved;
		}
		expect(t('onboarding.saveOnly')).toBe('Nur speichern');
		expect(t('no.such.key')).toBe('no.such.key');
		// a branch of the catalogue is not a text
		expect(t('onboarding')).toBe('onboarding');
	});

	it('a count picks the plural form of the language', () => {
		expect(t('contacts.itemRange', { count: 1, min: 1, max: 1, total: 1 })).toBe('1–1 of 1 item');
		expect(t('contacts.itemRange', { count: 3, min: 1, max: 3, total: 3 })).toBe('1–3 of 3 items');
		setLocale('de');
		expect(t('contacts.pageRange', { count: 1, total: 1 })).toBe('von 1 Seite');
		expect(t('contacts.pageRange', { count: 2, total: 2 })).toBe('von 2 Seiten');
		// without a count it is no text
		expect(t('contacts.pageRange')).toBe('contacts.pageRange');
	});

	it('components get the same words through the store $_, which changes with each switch', () => {
		const english = get(_);
		expect(get(language)).toBe('en');
		expect(english('nav.contacts')).toBe('Contacts');
		setLocale('de');
		expect(get(language)).toBe('de');
		const german = get(_);
		expect(german).not.toBe(english);
		expect(german('nav.contacts')).toBe('Kontakte');
		expect(german('home.waiting', { name: 'Alice' })).toBe(t('home.waiting', { name: 'Alice' }));
		expect(german('contacts.itemRange', { count: 2, min: 1, max: 2, total: 2 })).toBe('1–2 von 2 Einträgen');
	});

	it('starts in the choice made in Settings, else the browser’s language, else English', () => {
		expect(initialLocale({ stored: null, languages: ['de-DE'] })).toBe('de');
		expect(initialLocale({ stored: null, languages: ['de-AT', 'en'] })).toBe('de');
		expect(initialLocale({ stored: null, languages: ['de'] })).toBe('de');
		expect(initialLocale({ stored: null, languages: ['en-US', 'de-DE'] })).toBe('en');
		expect(initialLocale({ stored: null, languages: ['fr-FR'] })).toBe('en');
		expect(initialLocale({ stored: null, languages: [] })).toBe('en');
		expect(initialLocale({ stored: 'en', languages: ['de-DE'] })).toBe('en');
		expect(initialLocale({ stored: 'de', languages: ['en-US'] })).toBe('de');
		expect(initialLocale({ stored: 'xx', languages: ['en-US'] })).toBe('en');
	});

	it('keeps the choice in this browser; a start reads it back', () => {
		setLocale('de');
		expect(localStorage.getItem(LOCALE_KEY)).toBe('de');
		setLocale('fr');
		expect(currentLocale()).toBe('de');
		setLocale('en');
		expect(localStorage.getItem(LOCALE_KEY)).toBe('en');
		localStorage.setItem(LOCALE_KEY, 'de');
		startLocale();
		expect(currentLocale()).toBe('de');
	});

	it('dates and times follow the language on screen, in the browser’s variant of it', () => {
		const when = new Date(Date.UTC(2026, 10, 27, 12, 0, 0));
		expect(intlLocale(['en-US', 'de-DE'])).toBe('en-US');
		expect(intlLocale(['fr-FR'])).toBe('en');
		expect(formatDate(when, ['en-US'])).toBe(new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(when));
		setLocale('de');
		expect(intlLocale(['en-US', 'de-AT'])).toBe('de-AT');
		expect(intlLocale(['en-US'])).toBe('de');
		expect(formatDate(when, ['en-US'])).toBe('27.11.2026');
		expect(formatDateTime(when.getTime(), ['en-US'])).toMatch(/^27\.11\.2026, \d{2}:\d{2}:\d{2}$/);
	});

	it('the passkey step dialog gets deContact’s wording in both languages', () => {
		const strings = passkeyStepStrings();
		expect(strings.en.purposes.create.title).toBe(at(en, 'passkeyStep.create.title'));
		expect(strings.de.purposes.prf.why).toBe(at(de, 'passkeyStep.prf.why'));
		expect(Object.keys(strings.de.purposes)).toEqual(['create', 'prf']);
	});

	it('every key the code names is in the catalogue', () => {
		// node:fs is polyfilled away under Vite: the sources come as text
		/** @type {Record<string, string>} */
		const sources = import.meta.glob(['/src/**/*.{js,svelte}', '!**/*.spec.js'], {
			query: '?raw',
			import: 'default',
			eager: true
		});
		/** @type {string[]} */
		const missing = [];
		let named = 0;
		for (const [file, text] of Object.entries(sources)) {
			// t('a.b') in scripts, $_('a.b') in components
			for (const m of text.matchAll(/(?:\bt|\$_)\(\s*['"]([a-zA-Z]\w*(?:\.\w+)+)['"]/g)) {
				named++;
				if (!has(m[1])) missing.push(`${file}: ${m[1]}`);
			}
		}
		expect(named).toBeGreaterThan(100);
		expect(missing).toEqual([]);
	});
});
