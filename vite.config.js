import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { configDefaults, defineConfig } from 'vitest/config';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
// the address search engines and link previews are given (src/hooks.server.js, lib/seo.js):
// GitHub Pages, unless a build names another
process.env.VITE_SITE_URL ||= 'https://nikrause.github.io/deContact/';

// what the app says about its build (lib/components/AppInfo.svelte): the version, the
// commit, and when it was built, which for GitHub Pages is when it was published
process.env.VITE_APP_VERSION = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;
process.env.VITE_COMMIT ||= process.env.GITHUB_SHA || gitCommit();
process.env.VITE_BUILT_AT ||= new Date().toISOString();

function gitCommit() {
	try {
		return execSync('git rev-parse HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
	} catch {
		return '';
	}
}

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
