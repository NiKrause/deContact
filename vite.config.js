import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
export default defineConfig({
	plugins: [
		// SvelteKit 3 takes its configuration here; svelte.config.js is no longer read
		sveltekit({
			adapter: adapter({
				pages: 'build',
				assets: 'build',
				fallback: 'index.html',
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
		include: ['src/**/*.{test,spec}.{js,ts}', 'packages/*/**/*.{test,spec}.{js,ts}']
	}
});
