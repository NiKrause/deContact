/**
 * The web app manifest, one per language (#103, #110): what a browser shows when it offers
 * to install deContact, and what the installed app is.
 *
 * Written at build time from the catalogues (src/routes/manifest.json, de/manifest.json),
 * so its texts come from i18n like every other text. The English page links the first,
 * the German page (de/) the second (seo.js). Paths are relative to the manifest itself,
 * but `id`: browsers read it against the origin or against `start_url`, so it is the
 * app's absolute path, the same in both. Both manifests name the same app; only the
 * page an installed app opens (`start_url`) and the language differ.
 *
 * - shortcuts: a long press on the installed app's icon offers *Show my code* and *Scan a
 *   code*; they open Exchange with `?open=code` or `?open=scan` (Exchange.svelte).
 * - screenshots: the screen tour's pictures (tests/Screens.spec.js, copied by
 *   scripts/readme-screens.mjs into static/screenshots/), narrow for phones and wide for
 *   desktops: Chrome shows them in its larger install dialog.
 */
import en from './i18n/en.js';
import de from './i18n/de.js';

const CATALOGUES = { en, de };

/** where each language's manifest lies, below the app's address (as LOCALE_PAGES in seo.js) */
export const MANIFEST_PATHS = { en: 'manifest.json', de: 'de/manifest.json' };

/** what a shortcut asks Exchange to open */
export const SHORTCUTS = { code: 'code', scan: 'scan' };

/** the size of a screenshot of each form factor: the tour's Galaxy A57 and desktop */
export const SCREENSHOT_SIZES = { narrow: { width: 412, height: 915 }, wide: { width: 1280, height: 800 } };

/**
 * The screenshots, in the order a browser shows them: the tour's screen, the file in
 * static/screenshots/ (<name>-<form factor>.png) and its label in the catalogue.
 */
export const SCREENSHOTS = [
	{ screen: '06-exchange', name: 'exchange', form: 'narrow' },
	{ screen: '05-qr-dialog', name: 'code', form: 'narrow' },
	{ screen: '12-contacts', name: 'contacts', form: 'narrow' },
	{ screen: '04c-my-card-saved', name: 'card', form: 'narrow' },
	{ screen: '06-exchange', name: 'exchange', form: 'wide' },
	{ screen: '12-contacts', name: 'contacts', form: 'wide' }
];

/** the file of a screenshot, below static/ (and the app's address) */
export const screenshotFile = ({ name, form }) => `screenshots/${name}-${form}.png`;

/**
 * @param {'en' | 'de'} locale
 * @param {{ root: string }} paths root: the app's absolute path, with a slash at the end
 *   ('/deContact/' on GitHub Pages)
 * @returns {object} the manifest of that language's page
 */
export function webManifest(locale, { root }) {
	const texts = CATALOGUES[locale];
	// from the manifest to the app's address: de/manifest.json lies one level below
	const up = locale === 'en' ? './' : '../';
	return {
		// the same app in both languages and wherever it is installed from
		id: root,
		name: 'deContact',
		short_name: 'deContact',
		description: texts.meta.description,
		lang: locale,
		dir: 'ltr',
		start_url: './',
		scope: up,
		display: 'standalone',
		background_color: '#262626',
		theme_color: '#262626',
		categories: ['productivity', 'social', 'utilities'],
		icons: [
			{ src: `${up}icons/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
			{ src: `${up}icons/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
			{ src: `${up}icons/maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
			{ src: `${up}favicon.svg`, sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
		],
		shortcuts: [
			{ name: texts.exchange.showCode, url: `./#/?open=${SHORTCUTS.code}`, icons: [{ src: `${up}icons/icon-192.png`, sizes: '192x192', type: 'image/png' }] },
			{ name: texts.exchange.scan, url: `./#/?open=${SHORTCUTS.scan}`, icons: [{ src: `${up}icons/icon-192.png`, sizes: '192x192', type: 'image/png' }] }
		],
		screenshots: SCREENSHOTS.map((shot) => {
			const { width, height } = SCREENSHOT_SIZES[shot.form];
			return {
				src: up + screenshotFile(shot),
				sizes: `${width}x${height}`,
				type: 'image/png',
				form_factor: shot.form,
				label: texts.manifest.screens[shot.name]
			};
		})
	};
}
