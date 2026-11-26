// @ts-check
import { defineConfig, devices } from '@playwright/test';

// The suite starts its own relay (src/relay.js, orbitdb-relay) and a production build of
// the app pointed at it: tests/start-e2e-server.mjs, as in simple-todo. Move the ports with
// E2E_PREVIEW_PORT / E2E_RELAY_*_PORT to run two checkouts at once.
const previewPort = Number(process.env.E2E_PREVIEW_PORT || 4431);
// WebAuthn needs a domain as relying party id: localhost, never an IP address (#60)
const baseURL = `http://localhost:${previewPort}/`;
// the specs open PAGE_URL; it is always the app this run built
process.env.PAGE_URL = baseURL;

export default defineConfig({
	webServer: {
		command: 'node tests/start-e2e-server.mjs',
		port: previewPort,
		reuseExistingServer: false,
		timeout: 240000
	},
	testDir: './tests',
	// every spec talks to the same relay and discovery topic
	fullyParallel: false,
	workers: 1,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	reporter: [['list'], ['html', { open: 'never' }]],
	timeout: 120000,
	expect: { timeout: 30000 },
	use: {
		baseURL,
		trace: 'on-first-retry'
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		}
	]
});
