import { describe, expect, it } from 'vitest';
import { LOCALE_PAGES, imageTexts, localeOfRoute, metaTags, noscript } from './seo.js';
import en from './i18n/en.js';
import de from './i18n/de.js';

const site = 'https://example.com/deContact/';
const content = (html, attribute, name) => html.match(new RegExp(`<meta ${attribute}="${name}" content="([^"]*)"`))?.[1];

describe('the tags of each language (seo.js)', () => {
	it('English at the app address, German below it, each with its own picture', () => {
		const english = metaTags({ locale: 'en', siteUrl: site });
		const german = metaTags({ locale: 'de', siteUrl: 'https://example.com/deContact' });
		expect(content(english, 'property', 'og:url')).toBe(site);
		expect(content(german, 'property', 'og:url')).toBe(`${site}de/`);
		expect(content(english, 'property', 'og:image')).toBe(`${site}og-image.png`);
		expect(content(german, 'property', 'og:image')).toBe(`${site}og-image-de.png`);
		expect(content(english, 'property', 'og:locale')).toBe('en_US');
		expect(content(german, 'property', 'og:locale')).toBe('de_DE');
		expect(content(german, 'property', 'og:locale:alternate')).toBe('en_US');
		expect(english).toContain(`<title>${en.meta.title}</title>`);
		expect(german).toContain(`<title>${de.meta.title}</title>`);
		expect(content(german, 'name', 'description')).toBe(de.meta.description);
		for (const html of [english, german]) {
			expect(html).toContain(`<link rel="alternate" hreflang="en" href="${site}" />`);
			expect(html).toContain(`<link rel="alternate" hreflang="de" href="${site}de/" />`);
			expect(html).toContain(`<link rel="alternate" hreflang="x-default" href="${site}" />`);
			expect(content(html, 'name', 'twitter:card')).toBe('summary_large_image');
		}
	});

	it('escapes what goes into an attribute, and keeps the structured data inside its script', () => {
		const html = metaTags({ locale: 'en', siteUrl: 'https://example.com/"><script>alert(1)</script>/' });
		expect(html).not.toContain('"><script>alert');
		const data = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1];
		expect(data).not.toContain('<');
		expect(JSON.parse(data)).toMatchObject({ '@type': 'WebApplication', inLanguage: 'en' });
	});

	it("links the language's own manifest when given one (web-manifest.js)", () => {
		expect(metaTags({ locale: 'de', siteUrl: site, manifest: '/deContact/de/manifest.json' })).toContain(
			'<link rel="manifest" href="/deContact/de/manifest.json" />'
		);
		expect(metaTags({ locale: 'en', siteUrl: site })).not.toContain('rel="manifest"');
		expect(metaTags({ locale: 'en', siteUrl: site, manifest: '/x/"><script>' })).not.toContain('"><script>');
	});

	it('the German route is German, every other route and the fallback English', () => {
		expect(localeOfRoute('/de')).toBe('de');
		expect(localeOfRoute('/')).toBe('en');
		expect(localeOfRoute(null)).toBe('en');
		expect(Object.keys(LOCALE_PAGES)).toEqual(['en', 'de']);
	});

	it('the noscript text and the picture texts come from the catalogue of the language', () => {
		expect(noscript({ locale: 'de' })).toContain(de.meta.noscript);
		expect(imageTexts('de')).toEqual({ file: 'og-image-de.png', lang: 'de', lead: de.meta.imageLead, more: de.meta.previewDescription });
		expect(imageTexts('en').file).toBe('og-image.png');
	});
});
