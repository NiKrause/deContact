// @ts-check
import { defineConfig, devices } from '@playwright/test';

// Unit tests that need a real browser (*.browser.spec.js next to their module, e.g. the
// canvas of the contact photo, #87). Unlike playwright.config.js: no relay, no build, no
// server; each test serves the modules it needs to an empty page (see the spec).
export default defineConfig({
	testDir: './src',
	testMatch: '**/*.browser.spec.js',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	reporter: 'list',
	timeout: 60000,
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		}
	]
});
