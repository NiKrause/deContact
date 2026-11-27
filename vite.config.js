import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { configDefaults, defineConfig } from 'vitest/config';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
// the address search engines and link previews are given (src/hooks.server.js, lib/seo.js):
// GitHub Pages, unless a build names another
process.env.PUBLIC_SITE_URL ||= 'https://nikrause.github.io/deContact/';

export default defineConfig({
	plugins: [
		// SvelteKit 3 takes its configuration here; svelte.config.js is no longer read
		sveltekit({
			adapter: adapter({
				pages: 'build',
				assets: 'build',
				// index.html and de/index.html are written with their tags (lib/seo.js); any
				// other path gets the app as GitHub Pages' 404 page
				fallback: '404.html',
				precompress: false,
				strict: true
			}),
			serviceWorker: {
				register: true
			},
			// GitHub Pages serves the app below /deContact (BASE_PATH=/deContact in CI)
			paths: {
				base: process.env.BASE_PATH ?? ''
			}
		}),
		nodePolyfills({
			// Vite 8 builds SvelteKit's server bundle with rolldown, whose runtime imports
			// createRequire from node:module; an empty polyfill for it breaks that build
			exclude: ['module'],
			globals: {
				Buffer: true,
				global: true,
				process: true
			},
			protocolImports: true
		}),
		// SvelteKitPWA({
		// 	strategies: 'injectManifest',
		// 	srcDir: 'src'})
	],
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}', 'packages/*/**/*.{test,spec}.{js,ts}', 'scripts/**/*.{test,spec}.{js,ts}'],
		// unit tests that need a real browser run in Playwright (playwright.unit.config.js)
		exclude: [...configDefaults.exclude, '**/*.browser.spec.js']
	}
});
