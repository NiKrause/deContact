// deContact's icons and its Open Graph pictures, rendered from scripts/brand: icon.svg is
// the source of every icon, og-image.html of the link previews, one per language with the
// texts of src/lib/i18n (meta.*). After changing any of them, run `pnpm run brand` and
// commit what it writes to static/.
import { chromium } from '@playwright/test';
import { imageTexts, LOCALE_PAGES } from '../src/lib/seo.js';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const brand = path.join(root, 'scripts', 'brand');
const icon = readFileSync(path.join(brand, 'icon.svg'), 'utf8');
const out = (file) => path.join(root, 'static', file);
mkdirSync(out('icons'), { recursive: true });

/**
 * rounded: the corners cut, as an icon of purpose "any" and the favicon show it; full
 * bleed otherwise (maskable, Apple's home screen, which round it themselves).
 * zoom: larger cards, for the tab's few pixels.
 */
const variants = [
	{ png: 'icons/icon-192.png', size: 192, rounded: true },
	{ png: 'icons/icon-512.png', size: 512, rounded: true },
	{ png: 'icons/maskable-512.png', size: 512 },
	{ png: 'icons/apple-touch-icon.png', size: 180 },
	{ png: 'favicon.png', size: 48, rounded: true, zoom: 1.3 },
	{ svg: 'favicon.svg', size: 512, rounded: true, zoom: 1.3 }
];

const browser = await chromium.launch();
try {
	const page = await browser.newPage();
	for (const { png, svg, size, rounded = false, zoom = 1 } of variants) {
		await page.setViewportSize({ width: size, height: size });
		await page.setContent(`<html><body style="margin:0;background:transparent">${icon}</body></html>`);
		await page.evaluate(
			({ size, rounded, zoom }) => {
				const element = document.querySelector('svg');
				element.setAttribute('width', String(size));
				element.setAttribute('height', String(size));
				element.querySelectorAll('title').forEach((title) => title.remove());
				const comments = document.createTreeWalker(element, NodeFilter.SHOW_COMMENT);
				const found = [];
				while (comments.nextNode()) found.push(comments.currentNode);
				found.forEach((comment) => comment.remove());
				if (rounded) document.getElementById('background').setAttribute('rx', '112');
				if (zoom !== 1) document.getElementById('cards').setAttribute('transform', `translate(256 256) scale(${zoom}) translate(-256 -256)`);
			},
			{ size, rounded, zoom }
		);
		if (png) await page.locator('svg').screenshot({ path: out(png), omitBackground: true });
		if (svg) writeFileSync(out(svg), (await page.locator('svg').evaluate((element) => element.outerHTML)) + '\n');
		console.log(`wrote static/${png ?? svg}`);
	}

	await page.setViewportSize({ width: 1200, height: 630 });
	const template = readFileSync(path.join(brand, 'og-image.html'), 'utf8');
	for (const locale of Object.keys(LOCALE_PAGES)) {
		const { file, lang, lead, more } = imageTexts(locale);
		await page.setContent(
			template.replace('<!-- lang -->', lang).replace('<!-- icon -->', icon).replace('<!-- lead -->', lead).replace('<!-- more -->', more)
		);
		await page.screenshot({ path: out(file) });
		console.log(`wrote static/${file}`);
	}
} finally {
	await browser.close();
}
