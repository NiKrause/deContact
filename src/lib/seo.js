/**
 * What search engines and link previews read: title, description, Open Graph and Twitter
 * tags, the alternates of the other language and structured data.
 *
 * The app renders in the browser; crawlers and link previews do not run it. So each
 * language has a page of its own, written at build time with these tags
 * (hooks.server.js): the app's address for English, `de/` below it for German. Each names
 * its own picture (static/og-image.png, og-image-de.png, from scripts/brand). The app's
 * language itself still follows the person's choice or their browser (i18n).
 */
import en from './i18n/en.js';
import de from './i18n/de.js';

/** the page of each language, below the app's address */
export const LOCALE_PAGES = { en: '', de: 'de/' };
const CATALOGUES = { en, de };
const OG_LOCALES = { en: 'en_US', de: 'de_DE' };
const IMAGES = { en: 'og-image.png', de: 'og-image-de.png' };
export const IMAGE_SIZE = { width: 1200, height: 630 };
const SOURCE = 'https://github.com/NiKrause/deContact';

/** the language of a page, by its route id (src/routes): '/de' is German, anything else English */
export const localeOfRoute = (routeId) => (routeId === '/de' ? 'de' : 'en');

const escape = (text) =>
	String(text).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/**
 * @param {{ locale: 'en' | 'de', siteUrl: string }} options siteUrl: the app's public
 *   address (link previews need absolute addresses)
 * @returns {string} the tags, for the page's <head>
 */
export function metaTags({ locale, siteUrl }) {
	const meta = CATALOGUES[locale].meta;
	const root = siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`;
	const url = root + LOCALE_PAGES[locale];
	const image = root + IMAGES[locale];
	const other = locale === 'de' ? 'en' : 'de';
	const data = {
		'@context': 'https://schema.org',
		'@type': 'WebApplication',
		name: 'deContact',
		url,
		description: meta.description,
		inLanguage: locale,
		applicationCategory: 'UtilitiesApplication',
		operatingSystem: 'Any',
		browserRequirements: 'JavaScript, WebAuthn passkeys with the PRF extension',
		isAccessibleForFree: true,
		license: 'https://opensource.org/licenses/MIT',
		offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' }
	};
	const tag = (attribute, name, content) => `<meta ${attribute}="${name}" content="${escape(content)}" />`;
	return [
		`<title>${escape(meta.title)}</title>`,
		tag('name', 'description', meta.description),
		`<link rel="canonical" href="${escape(url)}" />`,
		...Object.entries(LOCALE_PAGES).map(([code, page]) => `<link rel="alternate" hreflang="${code}" href="${escape(root + page)}" />`),
		`<link rel="alternate" hreflang="x-default" href="${escape(root)}" />`,
		tag('property', 'og:type', 'website'),
		tag('property', 'og:site_name', 'deContact'),
		tag('property', 'og:title', meta.title),
		tag('property', 'og:description', meta.previewDescription),
		tag('property', 'og:url', url),
		tag('property', 'og:image', image),
		tag('property', 'og:image:type', 'image/png'),
		tag('property', 'og:image:width', IMAGE_SIZE.width),
		tag('property', 'og:image:height', IMAGE_SIZE.height),
		tag('property', 'og:image:alt', meta.imageAlt),
		tag('property', 'og:locale', OG_LOCALES[locale]),
		tag('property', 'og:locale:alternate', OG_LOCALES[other]),
		tag('name', 'twitter:card', 'summary_large_image'),
		tag('name', 'twitter:title', meta.title),
		tag('name', 'twitter:description', meta.previewDescription),
		tag('name', 'twitter:image', image),
		tag('name', 'twitter:image:alt', meta.imageAlt),
		`<script type="application/ld+json">${JSON.stringify(data).replaceAll('<', '\\u003c')}</script>`
	].join('\n\t\t');
}

/** what a browser without JavaScript shows, and what a crawler that does not run it reads */
export function noscript({ locale }) {
	const meta = CATALOGUES[locale].meta;
	return `<noscript><h1>deContact</h1><p>${escape(meta.noscript)}</p><p><a href="${SOURCE}">${escape(meta.source)}</a></p></noscript>`;
}

/** the picture's file and texts, for scripts/render-brand-images.mjs */
export function imageTexts(locale) {
	const meta = CATALOGUES[locale].meta;
	return { file: IMAGES[locale], lang: locale, lead: meta.imageLead, more: meta.previewDescription };
}
