// Light and dark (#110): the app follows the system's setting (`prefers-color-scheme`),
// unless Settings names one. Carbon's themes paint it (carbon-components-svelte/css/all.css,
// as `<html theme="…">`): White for light, Gray 90 for dark, the header included. The
// browser's own bar (`<meta name="theme-color">`) takes the header's colour.
//
// src/app.html sets the theme once more before the first paint, from the same key, so a
// dark device does not flash white while the app loads. The two must agree (theme.spec.js).
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

/** @param {unknown} value @returns {value is ThemeChoice} */
const isTheme = (value) => THEMES.includes(/** @type {any} */ (value));

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

function readStored() {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage.getItem(THEME_KEY);
	} catch {
		return null;
	}
}

const choice = writable(initialTheme());

/** The choice in Settings, as a store: `$theme` in a component. */
export const theme = { subscribe: choice.subscribe };

/** @type {ThemeChoice} */
let current = initialTheme();
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
	document.documentElement.style.colorScheme = look;
	document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR[look]);
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
	try {
		localStorage.setItem(THEME_KEY, next);
	} catch {
		// storage blocked: this visit only
	}
}

/**
 * At start: the look of the choice kept here, and from then on the system's, whenever it
 * changes (a phone turning dark at night), as long as the choice is "system".
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
