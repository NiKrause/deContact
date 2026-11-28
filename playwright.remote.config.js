// @ts-check
import { defineConfig, devices } from '@playwright/test';

// Alice and Bob on two networks, as simple-todo's remote replication runs it: Alice's
// browser here, Bob's on an Aleph VM or in a second local browser (tests/remote/bob.js).
// Both open the deployed app, which finds Le Space's relays through Aleph: the suite's own
// relay and its E2E build (window.__decontactE2E) play no part, so the tests read only
// what the app shows and its book (window.mydb).
//   REMOTE_PROVIDER=local pnpm exec playwright test -c playwright.remote.config.js
// .github/workflows/remote-replication.yml runs it with Bob on the VM.
const appUrl = process.env.REMOTE_APP_URL || 'https://nikrause.github.io/deContact/';
// the helpers open PAGE_URL and check that a link leads back to it (tests/helpers)
process.env.PAGE_URL = appUrl.endsWith('/') ? appUrl : `${appUrl}/`;

export default defineConfig({
	testDir: './tests/remote',
	// not *.spec.js: the suite of playwright.config.js must not pick these up
	testMatch: '**/*.remote.js',
	fullyParallel: false,
	workers: 1,
	forbidOnly: !!process.env.CI,
	// the VM is paid for by the minute; a failure is evidence, not something to retry
	retries: 0,
	reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-remote' }]],
	outputDir: 'test-results/remote',
	timeout: 600000,
	expect: { timeout: 60000 },
	use: {
		baseURL: process.env.PAGE_URL,
		locale: 'en-US',
		trace: 'retain-on-failure'
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		}
	]
});
