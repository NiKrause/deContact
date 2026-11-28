import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { BAR, CARBON, DARK_QUERY, THEME_KEY, initialTheme, lookOf } from './theme.js';

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

describe('the first paint (src/app.html)', () => {
	const html = readFileSync(new URL('../app.html', import.meta.url), 'utf8');

	it('reads the same key and sets the same Carbon themes as the app', () => {
		expect(html).toContain(`'${THEME_KEY}'`);
		expect(html).toContain(`'${DARK_QUERY}'`);
		expect(html).toContain(`dark ? '${CARBON.dark}' : '${CARBON.light}'`);
		expect(html).toContain(`dark ? '${BAR.dark}' : '${BAR.light}'`);
	});
});
