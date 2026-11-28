import { test as unguarded } from '@playwright/test';
import { test, expect } from './helpers/policy.js';
import { readFileSync } from 'node:fs';
import { PAGES, policyProblems } from '../scripts/csp-check.js';

// The Content-Security-Policy (src/lib/csp.js) is in every built page, first in <head>, and
// lets through nothing it should not (scripts/csp-check.js). The browser holds the page to it:
// an injected script does not run, text is not run as code, nothing loads from another host,
// and Trusted Types refuse markup handed to the DOM as a string. The fonts are the app's own:
// no request goes to IBM's CDN. Every other spec fails on anything the policy refuses
// (tests/helpers/policy.js).

test('every built page carries the policy, and it lets through nothing it should not', () => {
	// the end-to-end tests' build (tests/start-e2e-server.mjs), which may dial the relay on
	// this machine; scripts/check-production-build.mjs checks a production build, which may not
	for (const file of PAGES) {
		const html = readFileSync(new URL(`../build/${file}`, import.meta.url), 'utf8');
		expect(policyProblems(html, { localRelay: true }), file).toEqual([]);
	}
});

// what the browser refuses is the point here: this test is not held to "nothing refused"
unguarded('the browser holds the page to it', async ({ page }) => {
	/** @type {string[]} */
	const refused = [];
	await page.exposeFunction('noteRefused', (/** @type {string} */ what) => refused.push(what));
	await page.addInitScript(() => {
		document.addEventListener(
			'securitypolicyviolation',
			(event) => /** @type {any} */ (window).noteRefused(event.effectiveDirective),
			true
		);
	});
	await page.goto(process.env.PAGE_URL);
	// the app's own start script ran, by its hash: the page is there
	await expect(page.getByTestId('passkey-gate')).toBeVisible();

	const tried = await page.evaluate(async () => {
		/** @type {Record<string, unknown>} */
		const out = {};
		const w = /** @type {any} */ (window);
		/** @param {() => unknown} attempt */
		const outcome = (attempt) => {
			try {
				attempt();
				return 'ran';
			} catch (error) {
				return /** @type {Error} */ (error).name;
			}
		};
		// Text run as code, from a timer: what a test evaluates itself the browser's debugging
		// protocol lets off the policy.
		const later = (/** @type {() => unknown} */ attempt) =>
			new Promise((resolve) => setTimeout(() => resolve(outcome(attempt)), 0));
		out.eval = await later(() => (0, eval)('1'));
		out.newFunction = await later(() => new Function('return 1')());
		// markup handed to the DOM as a string: Trusted Types refuse it
		out.innerHTML = await later(() => {
			document.createElement('div').innerHTML = '<img src=x onerror=alert(1)>';
		});
		// no policy of one's own, and not Svelte's a second time
		out.ownPolicy = await later(() =>
			w.trustedTypes.createPolicy('mine', { createHTML: (/** @type {string} */ s) => s })
		);
		out.sveltePolicy = await later(() =>
			w.trustedTypes.createPolicy('svelte-trusted-html', {
				createHTML: (/** @type {string} */ s) => s
			})
		);
		// an inline script, as injected markup would bring one: Trusted Types refuse its text
		const inline = document.createElement('script');
		inline.append(document.createTextNode('window.__inlineRan = true'));
		document.head.append(inline);
		out.inlineRan = w.__inlineRan === true;
		// a script from another host: Trusted Types refuse an address that is a plain string
		out.foreignScript = await new Promise((resolve) => {
			const script = document.createElement('script');
			try {
				script.src = 'https://scripts.example.com/x.js';
			} catch (error) {
				resolve(/** @type {Error} */ (error).name);
				return;
			}
			script.onload = () => resolve('loaded');
			script.onerror = () => resolve('refused');
			document.head.append(script);
		});
		// an event handler in markup: Trusted Types refuse it as a string, and it does not run
		const button = document.createElement('button');
		out.handler = outcome(() => button.setAttribute('onclick', 'window.__handlerRan = true'));
		document.body.append(button);
		button.click();
		button.remove();
		out.handlerRan = w.__handlerRan === true;
		// a <style> and a style attribute, as injected markup would bring them
		const style = document.createElement('style');
		style.append(document.createTextNode('body { outline: 7px solid rgb(255, 0, 0) }'));
		document.head.append(style);
		const marked = document.createElement('p');
		marked.setAttribute('style', 'outline: 7px solid rgb(255, 0, 0)');
		document.body.append(marked);
		out.styles = [
			getComputedStyle(document.body).outlineStyle,
			getComputedStyle(marked).outlineStyle
		];
		marked.remove();
		// a picture and a request to another host
		out.image = await new Promise((resolve) => {
			const image = new Image();
			image.onload = () => resolve('loaded');
			image.onerror = () => resolve('refused');
			image.src = 'https://images.example.com/x.png';
		});
		out.fetch = await fetch('https://data.example.com/x.json').then(
			() => 'answered',
			(error) => error.name
		);
		return out;
	});
	expect(tried).toEqual({
		eval: 'EvalError',
		newFunction: 'EvalError',
		innerHTML: 'TypeError',
		ownPolicy: 'TypeError',
		sveltePolicy: 'TypeError',
		inlineRan: false,
		foreignScript: 'TypeError',
		handler: 'TypeError',
		handlerRan: false,
		styles: ['none', 'none'],
		image: 'refused',
		fetch: 'TypeError'
	});
	// each one refused, by Trusted Types first where a string would become code
	await expect
		.poll(() => [...new Set(refused)].sort())
		.toEqual([
			'connect-src',
			'img-src',
			'require-trusted-types-for',
			'style-src-attr',
			'style-src-elem',
			'trusted-types'
		]);
});

test("IBM Plex comes from the app's own files: no request goes to IBM's CDN", async ({ page }) => {
	/** @type {string[]} */
	const requested = [];
	page.on('request', (request) => requested.push(request.url()));
	await page.goto(process.env.PAGE_URL);
	await expect(page.getByTestId('passkey-gate')).toBeVisible();
	await page.evaluate(() => document.fonts.ready);
	// the start screen's text is IBM Plex Sans, the regular weight among them, as loaded
	const loaded = await page.evaluate(() =>
		[...document.fonts]
			.filter((face) => face.status === 'loaded')
			.map((face) => `${face.family} ${face.weight}`)
	);
	expect(loaded.map((face) => face.replaceAll('"', ''))).toEqual(
		expect.arrayContaining(['IBM Plex Sans 400'])
	);
	const fonts = await page.evaluate(() =>
		performance
			.getEntriesByType('resource')
			.map(({ name }) => name)
			.filter((name) => /\.woff2?($|\?)/.test(name))
	);
	// every font the page fetched is the app's own (none at all where IBM Plex is installed on
	// the machine: `local()` comes first)
	const own = String(process.env.PAGE_URL).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	for (const font of fonts)
		expect(font).toMatch(new RegExp(`^${own}fonts/IBMPlex(Sans|Mono)-\\w+\\.woff2$`));
	expect(requested.filter((url) => /s81c\.com/.test(url))).toEqual([]);
});
