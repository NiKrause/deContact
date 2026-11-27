// The app's words, from one place (#89), the way Le-Space/belege does it.
//
// Every text the interface shows comes from a catalogue: `en.js`, and `de.js` of the same
// shape. The language is state (locale.svelte.js), so a switch re-renders what is on
// screen; both catalogues are in the bundle, so the app works offline in either language.
// English is the base: a key German does not have shows in English, never as a blank.
//
// Components write `$_('key')`, scripts `t('key')`. Most components here are not in runes
// mode, and there Svelte 5 reads `t()` in markup untracked: it would never re-render. The
// store `_` follows the same state, and `$_` is tracked in either mode (as with svelte-i18n
// in Le-Space/simple-todo).
import { derived, writable } from 'svelte/store';
import de from './de.js';
import en from './en.js';
import { locale } from './locale.svelte.js';

/** @typedef {string | { [key: string]: Catalogue }} Catalogue */
/** @typedef {import('./locale.svelte.js').Locale} Locale */

export const LOCALES = /** @type {const} */ (['en', 'de']);
/** where this browser keeps the choice; it is not secret */
export const LOCALE_KEY = 'decontact.locale';
/** @type {Record<Locale, Catalogue>} */
const catalogues = { en: /** @type {Catalogue} */ (en), de: /** @type {Catalogue} */ (de) };

/**
 * @param {Catalogue} catalogue
 * @param {string} key
 * @returns {Catalogue | undefined}
 */
function lookupIn(catalogue, key) {
	/** @type {any} */
	let node = catalogue;
	for (const part of key.split('.')) {
		if (node === null || typeof node !== 'object') return undefined;
		node = node[part];
	}
	return node;
}

/**
 * @param {Locale} language
 * @param {string} key in this language, else in English
 */
function lookup(language, key) {
	const here = lookupIn(catalogues[language], key);
	return typeof here === 'string' && here !== '' ? here : lookupIn(catalogues.en, key);
}

/** @param {string} text @param {Record<string, string | number>} [values] */
function fill(text, values) {
	if (!values) return text;
	return text.replace(/\{(\w+)\}/g, (match, name) => (name in values ? String(values[name]) : match));
}

/**
 * A text in the current language, with `{name}` placeholders filled in:
 * `t('onboarding.saveAndShare', { name: 'Alice' })`.
 *
 * A missing key shows as the key itself: visible, so a test or a reader finds it, rather
 * than an empty space nobody notices.
 *
 * @param {string} key
 * @param {Record<string, string | number>} [values]
 * @returns {string}
 */
export function t(key, values) {
	return textIn(locale.current, key, values);
}

/**
 * A text in a given language, whatever is on screen (the passkey step dialog takes its
 * wording for both languages at once).
 *
 * A key that holds `one` and `other` is a text that depends on a number: `values.count`
 * picks the form by the plural rules of the language.
 *
 * @param {Locale} language
 * @param {string} key
 * @param {Record<string, string | number>} [values]
 */
export function textIn(language, key, values) {
	let text = lookup(language, key);
	if (text !== undefined && typeof text === 'object' && typeof values?.count === 'number') {
		const form = new Intl.PluralRules(language).select(values.count) === 'one' ? 'one' : 'other';
		text = lookup(language, `${key}.${form}`);
	}
	return typeof text === 'string' ? fill(text, values) : key;
}

/** the language on screen, as a store, for components (see the top) */
const languageStore = writable(locale.current);

/** The language on screen as a store: `$language` in a component. */
export const language = { subscribe: languageStore.subscribe };

/**
 * `t` as a store, for components: `{$_('nav.contacts')}`. Its value is a new function at
 * each switch, so whatever uses it is computed again.
 */
export const _ = derived(
	languageStore,
	(code) =>
		/** @param {string} key @param {Record<string, string | number>} [values] */
		(key, values) =>
			textIn(code, key, values)
);

/**
 * Every key of a catalogue, dotted.
 *
 * @param {Catalogue} catalogue
 * @param {string} [prefix]
 * @returns {string[]}
 */
export function keysOf(catalogue, prefix = '') {
	if (typeof catalogue !== 'object' || catalogue === null) return [prefix];
	return Object.entries(catalogue).flatMap(([k, v]) => keysOf(v, prefix ? `${prefix}.${k}` : k));
}

/**
 * Whether the English catalogue has this key (every language falls back to it): a text,
 * or a text that depends on a number (`one` and `other`); for tests.
 */
export function has(/** @type {string} */ key) {
	const text = lookupIn(catalogues.en, key);
	if (typeof text === 'string') return true;
	return typeof lookupIn(catalogues.en, `${key}.one`) === 'string' && typeof lookupIn(catalogues.en, `${key}.other`) === 'string';
}

/** The language now. */
export const currentLocale = () => locale.current;

/** @param {unknown} value @returns {value is Locale} */
const isLocale = (value) => LOCALES.includes(/** @type {any} */ (value));

/** @returns {readonly string[]} */
const browserLanguages = () =>
	typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language]);

/**
 * The language to start in: a choice made in Settings earlier, else the browser's
 * (`de-AT` is German), else English.
 *
 * @param {{ stored?: string | null, languages?: readonly string[] }} [env]
 * @returns {Locale}
 */
export function initialLocale({ stored = readStored(), languages = browserLanguages() } = {}) {
	if (isLocale(stored)) return stored;
	const first = String(languages[0] ?? '').toLowerCase();
	return first.startsWith('de') ? 'de' : 'en';
}

function readStored() {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage.getItem(LOCALE_KEY);
	} catch {
		return null;
	}
}

/** @param {Locale} next on screen: the state, the store and `<html lang>` */
function show(next) {
	locale.current = next;
	languageStore.set(next);
	if (typeof document !== 'undefined') document.documentElement.lang = next;
}

/**
 * Switch the language: at once on screen, kept in this browser, and on `<html lang>`.
 *
 * @param {string} next
 */
export function setLocale(next) {
	if (!isLocale(next)) return;
	show(next);
	try {
		localStorage.setItem(LOCALE_KEY, next);
	} catch {
		// storage blocked: this visit only
	}
}

/** At start, before the first screen: the initial language, without storing it. */
export function startLocale() {
	show(initialLocale());
}

/**
 * The `Intl` locale for dates and times: the browser's own variant of the language on
 * screen (`de-AT`, `en-GB`), else the language itself.
 *
 * @param {readonly string[]} [languages]
 */
export function intlLocale(languages = browserLanguages()) {
	const here = locale.current;
	return languages.find((tag) => String(tag).toLowerCase().split('-')[0] === here) ?? here;
}

/** @param {Date | string | number} value */
const asDate = (value) => (value instanceof Date ? value : new Date(value));

/**
 * A date in the language on screen.
 *
 * @param {Date | string | number} value
 * @param {readonly string[]} [languages]
 */
export function formatDate(value, languages) {
	return new Intl.DateTimeFormat(intlLocale(languages), { dateStyle: 'medium' }).format(asDate(value));
}

/**
 * A date with its time in the language on screen.
 *
 * @param {Date | string | number} value
 * @param {readonly string[]} [languages]
 */
export function formatDateTime(value, languages) {
	return new Intl.DateTimeFormat(intlLocale(languages), { dateStyle: 'medium', timeStyle: 'medium' }).format(
		asDate(value)
	);
}

/**
 * deContact's wording for `<passkey-step-dialog>`, in both languages (the element picks one
 * by its `lang`): the purposes this app announces, in the voice of the rest of the app.
 */
export function passkeyStepStrings() {
	/** @param {Locale} language */
	const purposes = (language) => ({
		purposes: Object.fromEntries(
			['create', 'prf'].map((purpose) => [
				purpose,
				{
					title: textIn(language, `passkeyStep.${purpose}.title`),
					why: textIn(language, `passkeyStep.${purpose}.why`)
				}
			])
		)
	});
	return { en: purposes('en'), de: purposes('de') };
}
