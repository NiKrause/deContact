// The English page's web app manifest, written at build time (lib/web-manifest.js).
import { MANIFEST_PATHS, webManifest } from '#lib/web-manifest.js';

export const prerender = true;

/** @type {import('./$types').RequestHandler} */
export function GET({ url }) {
	// the app's absolute path (/deContact/ on GitHub Pages): this file's, without its own name
	const root = url.pathname.slice(0, url.pathname.length - MANIFEST_PATHS.en.length);
	return new Response(JSON.stringify(webManifest('en', { root }), null, '\t'), {
		headers: { 'content-type': 'application/json' }
	});
}
