import { describe, expect, it } from 'vitest';
// as text: node:fs is polyfilled away under Vite
import html from '../app.html?raw';
import {
	ACCENTS,
	ACCENT_KEY,
	BAR,
	CARBON,
	DARK_QUERY,
	THEME_KEY,
	initialAccent,
	initialTheme,
	lookOf
} from './theme.js';

describe('initialTheme', () => {
	it('is the choice kept in this browser', () => {
		expect(initialTheme('light')).toBe('light');
		expect(initialTheme('dark')).toBe('dark');
		expect(initialTheme('system')).toBe('system');
	});

	it("is the system's without a choice, or with one it does not know", () => {
		expect(initialTheme(null)).toBe('system');
		expect(initialTheme('g90')).toBe('system');
		expect(initialTheme('')).toBe('system');
	});
});

describe('lookOf', () => {
	it("follows the system's setting for 'system'", () => {
		expect(lookOf('system', true)).toBe('dark');
		expect(lookOf('system', false)).toBe('light');
	});

	it('keeps a choice made in Settings, whatever the system says', () => {
		expect(lookOf('light', true)).toBe('light');
		expect(lookOf('dark', false)).toBe('dark');
	});
});

describe('initialAccent', () => {
	it("is Carbon's blue without a choice, or with one it does not know", () => {
		expect(ACCENTS[0]).toBe('blue');
		expect(initialAccent(null)).toBe('blue');
		expect(initialAccent('red')).toBe('blue');
	});

	it('is the accent kept in this browser', () => {
		for (const accent of ACCENTS) expect(initialAccent(accent)).toBe(accent);
	});
});

describe('the first paint (src/app.html)', () => {
	it('reads the same key and sets the same Carbon themes as the app', () => {
		expect(html).toContain(`'${THEME_KEY}'`);
		expect(html).toContain(`'${DARK_QUERY}'`);
		expect(html).toContain(`dark ? '${CARBON.dark}' : '${CARBON.light}'`);
		expect(html).toContain(`dark ? '${BAR.dark}' : '${BAR.light}'`);
	});

	it('sets the accent kept here, else blue', () => {
		expect(html).toContain(`'${ACCENT_KEY}'`);
		const others = ACCENTS.filter((it) => it !== 'blue');
		expect(html).toContain(
			`setAttribute('data-accent', ${others.map((it) => `accent === '${it}'`).join(' || ')} ? accent : 'blue')`
		);
	});

	it("has the browser's bar in the colour of each system setting", () => {
		expect(html).toContain(
			`<meta name="theme-color" media="(prefers-color-scheme: light)" content="${BAR.light}" />`
		);
		expect(html).toContain(
			`<meta name="theme-color" media="(prefers-color-scheme: dark)" content="${BAR.dark}" />`
		);
	});
});
