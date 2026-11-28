// Light and dark (#110): the app follows the system's setting (`prefers-color-scheme`),
// unless Settings names one. Carbon's themes paint it (carbon-components-svelte/css/all.css,
// as `<html theme="…">`): White for light, Gray 90 for dark, the header included. The
// browser's own bar takes the header's colour: src/app.html has a `theme-color` for each
// system setting, and a choice in Settings gives both its colour.
//
// The accent colour (#110, #103) is a choice too: Carbon's blue (the default), teal or
// purple, as `<html data-accent="…">`; src/lib/accent.css gives the other two their shades in
// both themes. The installed app's icon and manifest keep the default: they cannot follow a
// choice made in one browser.
//
// src/app.html sets the theme and the accent once more before the first paint, from the same
// keys, so a dark device does not flash white while the app loads. The two must agree
// (theme.spec.js).
import { writable } from 'svelte/store';

/** what Settings offers: follow the system, or always light, or always dark */
export const THEMES = /** @type {const} */ (['system', 'light', 'dark']);
/** @typedef {(typeof THEMES)[number]} ThemeChoice */

/** where this browser keeps the choice; it is not secret */
export const THEME_KEY = 'decontact.theme';
/** the Carbon theme for each look */
export const CARBON = /** @type {const} */ ({ light: 'white', dark: 'g90' });
/** the background of each, Carbon's `--cds-background`, which the header has too */
export const BAR = /** @type {const} */ ({ light: '#ffffff', dark: '#262626' });
/** the system's setting, as a media query */
export const DARK_QUERY = '(prefers-color-scheme: dark)';

/** the accent colours Settings offers; the first is Carbon's own, today's */
export const ACCENTS = /** @type {const} */ (['blue', 'teal', 'purple']);
/** @typedef {(typeof ACCENTS)[number]} Accent */
/** where this browser keeps the accent; it is not secret */
export const ACCENT_KEY = 'decontact.accent';

/** @param {unknown} value @returns {value is ThemeChoice} */
const isTheme = (value) => THEMES.includes(/** @type {any} */ (value));
/** @param {unknown} value @returns {value is Accent} */
const isAccent = (value) => ACCENTS.includes(/** @type {any} */ (value));

/**
 * The choice to start with: the one made in Settings earlier, else the system's.
 *
 * @param {string | null} [stored]
 * @returns {ThemeChoice}
 */
export function initialTheme(stored = readStored()) {
	return isTheme(stored) ? stored : 'system';
}

/**
 * The look a choice gives, with the system light or dark.
 *
 * @param {ThemeChoice} choice
 * @param {boolean} systemDark
 * @returns {'light' | 'dark'}
 */
export function lookOf(choice, systemDark) {
	if (choice === 'light' || choice === 'dark') return choice;
	return systemDark ? 'dark' : 'light';
}

/**
 * The accent to start with: the one chosen in Settings earlier, else Carbon's blue.
 *
 * @param {string | null} [stored]
 * @returns {Accent}
 */
export function initialAccent(stored = readStored(ACCENT_KEY)) {
	return isAccent(stored) ? stored : 'blue';
}

function readStored(key = THEME_KEY) {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
	} catch {
		return null;
	}
}

/** @param {string} key @param {string} value */
function keep(key, value) {
	try {
		localStorage.setItem(key, value);
	} catch {
		// storage blocked: this visit only
	}
}

const choice = writable(initialTheme());

/** The choice in Settings, as a store: `$theme` in a component. */
export const theme = { subscribe: choice.subscribe };

const accentChoice = writable(initialAccent());

/** The accent chosen in Settings, as a store: `$accent` in a component. */
export const accent = { subscribe: accentChoice.subscribe };

/** @type {ThemeChoice} */
let current = initialTheme();
/** @type {Accent} */
let currentAccent = initialAccent();
/** @type {MediaQueryList | undefined} */
let media;

/**
 * the look on screen: Carbon's theme on `<html>`, and the browser's own controls and bar
 * to match
 */
function show() {
	if (typeof document === 'undefined') return;
	const look = lookOf(current, media?.matches ?? false);
	document.documentElement.setAttribute('theme', CARBON[look]);
	document.documentElement.setAttribute('data-accent', currentAccent);
	document.documentElement.style.colorScheme = look;
	for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
		const own = /dark/.test(meta.getAttribute('media') ?? '') ? 'dark' : 'light';
		meta.setAttribute('content', BAR[current === 'system' ? own : look]);
	}
}

/**
 * Choose light, dark or the system's: at once on screen, and kept in this browser.
 *
 * @param {string} next
 */
export function setTheme(next) {
	if (!isTheme(next)) return;
	current = next;
	choice.set(next);
	show();
	keep(THEME_KEY, next);
}

/**
 * Choose the accent colour: at once on screen, and kept in this browser.
 *
 * @param {string} next
 */
export function setAccent(next) {
	if (!isAccent(next)) return;
	currentAccent = next;
	accentChoice.set(next);
	show();
	keep(ACCENT_KEY, next);
}

/**
 * At start: the look and the accent kept here, and from then on the system's look, whenever
 * it changes (a phone turning dark at night), as long as the choice is "system".
 *
 * @returns {() => void} stops following the system
 */
export function followTheme() {
	if (typeof window === 'undefined') return () => {};
	media = window.matchMedia?.(DARK_QUERY);
	show();
	media?.addEventListener('change', show);
	return () => media?.removeEventListener('change', show);
}
