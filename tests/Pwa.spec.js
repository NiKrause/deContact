import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// deContact as a PWA, and what search engines and link previews read.
// 1. Chrome's own verdict: the app can be installed. The manifest's icons exist in the
//    sizes it names, one of them maskable, and it starts at the app's own address.
// 2. Offline, a reload still starts the app: the service worker keeps its page.
// 3. The page's head, without running the app: title, description, Open Graph and
//    Twitter tags with an absolute image of 1200 × 630, and structured data.

/** width × height of a PNG, from its header */
const pngSize = (bytes) => `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;

test('installable, and it starts offline', async ({ browser }) => {
	test.setTimeout(120000);
	const context = await browser.newContext();
	const page = await context.newPage();
	try {
		await page.goto(process.env.PAGE_URL);
		const cdp = await context.newCDPSession(page);

		await test.step('the manifest and its icons', async () => {
			const { url, errors, data } = await cdp.send('Page.getAppManifest');
			expect(errors).toEqual([]);
			const manifest = JSON.parse(data);
			expect(manifest).toMatchObject({ name: 'deContact', short_name: 'deContact', start_url: './', scope: './', display: 'standalone' });
			// relative to the manifest: below /deContact/ on GitHub Pages
			expect(new URL(manifest.start_url, url).href).toBe(process.env.PAGE_URL);
			const pngs = manifest.icons.filter((icon) => icon.type === 'image/png');
			expect(pngs.map((icon) => `${icon.sizes} ${icon.purpose}`)).toEqual(expect.arrayContaining(['192x192 any', '512x512 any', '512x512 maskable']));
			for (const icon of pngs) {
				const response = await page.request.get(new URL(icon.src, url).href);
				expect(response.status(), icon.src).toBe(200);
				expect(pngSize(await response.body()), icon.src).toBe(icon.sizes);
			}
		});

		await test.step("Chrome's verdict: installable", async () => {
			// a context Playwright makes is incognito-like, which Chrome names as the only reason
			const errors = async () =>
				(await cdp.send('Page.getInstallabilityErrors')).installabilityErrors.filter((error) => error.errorId !== 'in-incognito');
			await expect.poll(errors, { timeout: 30000 }).toEqual([]);
		});

		await test.step('offline, a reload starts the app from the service worker', async () => {
			await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 30000 }).toBe(true);
			await context.setOffline(true);
			await page.reload();
			await expect(page.getByRole('link', { name: /deContact/ })).toBeVisible();
			await context.setOffline(false);
		});
	} finally {
		await context.close();
	}
});

// the page of each language (src/lib/seo.js): its address below the app's, its title, its picture
const pages = [
	{ locale: 'en', page: '', title: 'deContact – self-updating · local · peer-to-peer', image: 'og-image.png', ogLocale: 'en_US' },
	{ locale: 'de', page: 'de/', title: 'deContact – Selbstaktualisierend · Lokal · Peer-to-Peer', image: 'og-image-de.png', ogLocale: 'de_DE' }
];

for (const { locale, page, title, image, ogLocale } of pages) {
	test(`search engines and link previews read the ${locale} page: title, description, Open Graph tags`, async ({ request }) => {
		// the page as a crawler gets it: the app does not run
		const response = await request.get(new URL(page, process.env.PAGE_URL).href);
		expect(response.status()).toBe(200);
		const html = await response.text();
		const tag = (attribute, name) => html.match(new RegExp(`<meta ${attribute}="${name}" content="([^"]*)"`))?.[1];

		expect(html).toContain(`<html lang="${locale}">`);
		expect(html).toContain(`<title>${title}</title>`);
		expect(html).not.toMatch(/%sveltekit|decontact:meta|decontact:noscript/);
		expect(tag('name', 'description')).toBeTruthy();
		for (const name of ['og:title', 'og:description', 'og:url', 'og:image', 'og:image:alt', 'twitter:title', 'twitter:image']) {
			expect(tag(name.startsWith('og:') ? 'property' : 'name', name), name).toBeTruthy();
		}
		expect(tag('property', 'og:type')).toBe('website');
		expect(tag('property', 'og:locale')).toBe(ogLocale);
		expect(tag('name', 'twitter:card')).toBe('summary_large_image');
		// link previews need absolute addresses; each language its own page and picture
		const url = tag('property', 'og:url');
		expect(url).toMatch(new RegExp(`^https://.+/${page}$`));
		const root = url.slice(0, url.length - page.length);
		expect(tag('property', 'og:image')).toBe(`${root}${image}`);
		expect(html).toContain(`<link rel="canonical" href="${url}" />`);
		expect(html).toContain(`<link rel="alternate" hreflang="en" href="${root}" />`);
		expect(html).toContain(`<link rel="alternate" hreflang="de" href="${root}de/" />`);

		// the picture is part of this build, in the size the tags name
		const picture = await request.get(new URL(image, process.env.PAGE_URL).href);
		expect(picture.status()).toBe(200);
		expect(pngSize(await picture.body())).toBe(`${tag('property', 'og:image:width')}x${tag('property', 'og:image:height')}`);

		const data = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
		expect(data).toMatchObject({ '@type': 'WebApplication', name: 'deContact', url, inLanguage: locale });
	});
}

test('every screen says which build runs: version, publication, commit, source', async ({ page }) => {
	const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
	await page.goto(process.env.PAGE_URL);
	const info = page.getByTestId('app-info');
	// package.json's major and minor; the patch counts the deploys since its tag, where the
	// checkout has the history (scripts/app-version.js), and is package.json's otherwise
	const [major, minor, patch] = version.split('.').map(Number);
	const shown = (await info.textContent()).match(/Version (\d+)\.(\d+)\.(\d+)/);
	expect(shown, await info.textContent()).toBeTruthy();
	expect([Number(shown[1]), Number(shown[2])]).toEqual([major, minor]);
	expect(Number(shown[3])).toBeGreaterThanOrEqual(patch);
	await expect(info).toContainText('published');
	const commit = page.getByTestId('app-commit');
	await expect(commit).toHaveAttribute('href', /^https:\/\/github\.com\/NiKrause\/deContact\/commit\/[0-9a-f]{40}$/);
	expect((await commit.textContent()).trim()).toMatch(/^commit [0-9a-f]{7}$/);
	await expect(info.getByRole('link', { name: 'Source on GitHub' })).toHaveAttribute('href', 'https://github.com/NiKrause/deContact');
	// the header names the app and what it is, no more "the cloud we are"
	await expect(page.getByRole('link', { name: /deContact/ }).first()).toContainText('self-updating · local · peer-to-peer');
});

test('the German page runs the app', async ({ browser }) => {
	test.setTimeout(120000);
	const context = await browser.newContext({ locale: 'de-DE' });
	const page = await context.newPage();
	try {
		await page.goto(new URL('de/', process.env.PAGE_URL).href);
		await page.getByRole('button', { name: 'Weiter' }).click();
		await expect(page.getByRole('button', { name: 'Neues Adressbuch anlegen' })).toBeVisible();
		expect(await page.evaluate(() => document.documentElement.lang)).toBe('de');
	} finally {
		await context.close();
	}
});
