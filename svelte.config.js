import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
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
	}
}
export default config;
