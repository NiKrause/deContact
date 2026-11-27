// Runs only while the app is built: the pages are written once (prerendered, and the
// fallback), and GitHub Pages serves them as files. Each page gets the tags search engines
// and link previews read, in its language (lib/seo.js).
import { localeOfRoute, metaTags, noscript } from './lib/seo.js';

/** the public address the tags point to (vite.config.js): link previews need absolute ones */
const SITE_URL = import.meta.env.VITE_SITE_URL;

/** @type {import('@sveltejs/kit').Handle} */
export function handle({ event, resolve }) {
	const locale = localeOfRoute(event.route.id);
	return resolve(event, {
		transformPageChunk: ({ html }) =>
			html
				.replace('<html lang="en">', `<html lang="${locale}">`)
				.replace('<!--decontact:meta-->', metaTags({ locale, siteUrl: SITE_URL }))
				.replace('<!--decontact:noscript-->', noscript({ locale }))
	});
}
