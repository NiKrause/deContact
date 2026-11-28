import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { configDefaults, defineConfig } from 'vitest/config';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { deployVersion } from './scripts/app-version.js';
import { cspDirectives } from './src/lib/csp.js';
import { carbonWithoutFonts } from './scripts/carbon-fonts.js';
// the address search engines and link previews are given (src/hooks.server.js, lib/seo.js):
// GitHub Pages, unless a build names another
process.env.VITE_SITE_URL ||= 'https://nikrause.github.io/deContact/';

// what the app says about its build (lib/components/AppInfo.svelte): the version, the
// commit, and when it was built, which for GitHub Pages is when it was published
const packageVersion = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;
// one more with every deploy: the commits since the tag of package.json's version (scripts/app-version.js)
process.env.VITE_APP_VERSION ||= deployVersion(packageVersion, commitsSince(`v${packageVersion}`));
process.env.VITE_COMMIT ||= process.env.GITHUB_SHA || gitCommit();
process.env.VITE_BUILT_AT ||= new Date().toISOString();

/** how many commits HEAD is ahead of `tag`, or undefined (no tag, a shallow checkout, no git) */
function commitsSince(tag) {
	try {
		const count = execSync(`git rev-list --count ${tag}..HEAD`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
		return /^\d+$/.test(count) ? Number(count) : undefined;
	} catch {
		return undefined;
	}
}

function gitCommit() {
	try {
		return execSync('git rev-parse HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
	} catch {
		return '';
	}
}

export default defineConfig(({ command }) => ({
	plugins: [
		// IBM Plex from the app's own files, not from IBM's CDN (src/lib/fonts.css)
		carbonWithoutFonts(),
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
			},
			// the Content-Security-Policy of every page, as a meta tag with the hash of
			// SvelteKit's start script (src/lib/csp.js). The end-to-end tests' build and
			// `vite dev` dial a relay on this machine; a production build does not.
			csp: {
				mode: 'hash',
				directives: /** @type {any} */ (
					cspDirectives({ localRelay: process.env.VITE_E2E === 'true' || command === 'serve' })
				)
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
}));
