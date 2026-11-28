import { describe, expect, it } from 'vitest';
import { isCarbonStylesheet, withoutFontFaces } from './carbon-fonts.js';

// Node's own fs, past Vite: under Vite `node:fs` and `process` are polyfilled away, and
// Vitest hands a stylesheet over empty, `?raw` or not
const { readFileSync, readdirSync } = globalThis.process.getBuiltinModule('node:fs');
const read = (/** @type {string} */ path) => readFileSync(new URL(path, import.meta.url), 'utf8');
/** Carbon's stylesheet as it is in the package */
const carbon = read('../node_modules/carbon-components-svelte/css/all.css');
const fonts = read('../src/lib/fonts.css');

describe("Carbon's stylesheet without its fonts", () => {
	it("names IBM Plex on IBM's CDN as it comes", () => {
		expect(carbon).toMatch(/@font-face\{[^}]*IBM Plex Sans[^}]*1\.www\.s81c\.com/);
	});

	it('loses every @font-face rule, and with them every address of IBM', () => {
		const css = withoutFontFaces(carbon);
		expect(css).not.toContain('@font-face');
		expect(css).not.toContain('s81c.com');
		// and nothing else
		const rules = carbon.match(/@font-face\{[^{}]*\}/g) ?? [];
		expect(css.length).toBe(carbon.length - rules.join('').length);
		expect(css).toContain('.bx--btn--primary');
	});

	it("is applied to Carbon's stylesheets as Vite asks for them, not to the app's own", () => {
		const carbonCss = '/app/node_modules/carbon-components-svelte/css';
		expect(isCarbonStylesheet(`${carbonCss}/all.css`)).toBe(true);
		expect(isCarbonStylesheet(`${carbonCss}/g90.css?direct`)).toBe(true);
		expect(isCarbonStylesheet(`${carbonCss}/all.css?raw`)).toBe(false);
		expect(isCarbonStylesheet('/app/src/lib/fonts.css')).toBe(false);
		expect(
			isCarbonStylesheet('/app/node_modules/carbon-components-svelte/src/Button/Button.svelte')
		).toBe(false);
	});
});

describe("the app's own IBM Plex (src/lib/fonts.css)", () => {
	const faces = [...fonts.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, body]) => ({
		family: /font-family:\s*'([^']+)'/.exec(body)?.[1],
		weight: /font-weight:\s*(\d+)/.exec(body)?.[1],
		urls: [...body.matchAll(/url\('([^']+)'\)/g)].map(([, url]) => url)
	}));

	it('has the weights the app shows: Sans 300, 400 and 600, Mono 400', () => {
		expect(faces.map(({ family, weight }) => `${family} ${weight}`)).toEqual([
			'IBM Plex Sans 300',
			'IBM Plex Sans 400',
			'IBM Plex Sans 600',
			'IBM Plex Mono 400'
		]);
	});

	it("loads them from the app's own files only, which are there, with their licence", () => {
		const files = readdirSync(new URL('../static/fonts/', import.meta.url)).map(
			(name) => `/fonts/${name}`
		);
		for (const { urls } of faces) {
			expect(urls).toHaveLength(1);
			expect(urls[0]).toMatch(/^\/fonts\/IBMPlex(Sans|Mono)-[A-Za-z]+\.woff2$/);
			expect(files).toContain(urls[0]);
		}
		expect(files).toContain('/fonts/LICENSE.txt');
	});
});
