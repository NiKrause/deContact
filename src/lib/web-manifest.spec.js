import { describe, expect, it } from 'vitest';
import { MANIFEST_PATHS, SCREENSHOTS, SCREENSHOT_SIZES, SHORTCUTS, screenshotFile, webManifest } from './web-manifest.js';
import en from './i18n/en.js';
import de from './i18n/de.js';

const root = '/deContact/';
const english = webManifest('en', { root });
const german = webManifest('de', { root });
/** where a manifest's relative address leads, from the manifest's own file */
const from = (locale, path) => new URL(path, `https://example.com${root}${MANIFEST_PATHS[locale]}`).pathname;

describe('the web app manifests (#110)', () => {
	it('name one app in both languages: same id, same scope, each opening its own page', () => {
		expect(english.id).toBe(root);
		expect(german.id).toBe(root);
		expect(from('en', english.scope)).toBe(root);
		expect(from('de', german.scope)).toBe(root);
		expect(from('en', english.start_url)).toBe(root);
		expect(from('de', german.start_url)).toBe(`${root}de/`);
	});

	it('take their texts from the catalogue of their language', () => {
		expect(english).toMatchObject({ lang: 'en', description: en.meta.description });
		expect(german).toMatchObject({ lang: 'de', description: de.meta.description });
		expect(german.shortcuts.map((it) => it.name)).toEqual([de.exchange.showCode, de.exchange.scan]);
		expect(german.screenshots.map((it) => it.label)).toEqual(SCREENSHOTS.map((it) => de.manifest.screens[it.name]));
		for (const manifest of [english, german]) expect(manifest.screenshots.every((it) => it.label)).toBe(true);
	});

	it('find the same icons and screenshots from either file', () => {
		for (const [index, icon] of english.icons.entries()) expect(from('de', german.icons[index].src)).toBe(from('en', icon.src));
		for (const [index, shot] of english.screenshots.entries()) {
			expect(from('de', german.screenshots[index].src)).toBe(from('en', shot.src));
			expect(from('en', shot.src)).toBe(root + screenshotFile(SCREENSHOTS[index]));
		}
	});

	it("open Exchange's code and camera from the shortcuts, on the manifest's own page", () => {
		expect(english.shortcuts.map((it) => from('en', it.url.split('#')[0]) + '#' + it.url.split('#')[1])).toEqual([
			`${root}#/?open=${SHORTCUTS.code}`,
			`${root}#/?open=${SHORTCUTS.scan}`
		]);
		expect(from('de', german.shortcuts[0].url.split('#')[0])).toBe(`${root}de/`);
	});

	it('give screenshots that Chrome shows: a narrow and a wide one, neither longer than 2.3 times its width', () => {
		expect(new Set(SCREENSHOTS.map((it) => it.form))).toEqual(new Set(['narrow', 'wide']));
		for (const [form, { width, height }] of Object.entries(SCREENSHOT_SIZES)) {
			expect(Math.max(width, height) / Math.min(width, height), form).toBeLessThanOrEqual(2.3);
			expect(Math.min(width, height), form).toBeGreaterThanOrEqual(320);
		}
		expect(SCREENSHOT_SIZES.narrow.height).toBeGreaterThan(SCREENSHOT_SIZES.narrow.width);
		expect(SCREENSHOT_SIZES.wide.width).toBeGreaterThan(SCREENSHOT_SIZES.wide.height);
	});
});
