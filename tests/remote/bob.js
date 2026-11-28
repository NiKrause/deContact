// Bob's browser for the tests of Alice and Bob on two networks (playwright.remote.config.js),
// the way simple-todo's remote replication runs them: Alice's browser is the test's own,
// here; Bob's is
// - REMOTE_PROVIDER=aleph: Chromium on an Aleph VM, the playwright-runner RootFS of
//   relay-button, behind authenticated WSS (.github/workflows/remote-replication.yml
//   deploys it and sets ALEPH_PLAYWRIGHT_WS_ENDPOINT, ALEPH_PLAYWRIGHT_VERSION_URL and
//   ALEPH_PLAYWRIGHT_SECRET);
// - REMOTE_PROVIDER=local (the default): a second Chromium on this machine, to try the
//   tests without a VM.
import { test as base, chromium } from '@playwright/test';

/** the guest's Playwright must be exactly the client's: the runner RootFS has this one */
export const PLAYWRIGHT_RUNNER_VERSION = '1.61.1';

export const provider = process.env.REMOTE_PROVIDER || 'local';

/**
 * Chromium on the Aleph VM: the version endpoint and the WebSocket take the run's bearer
 * secret, over HTTPS and WSS only, and the guest's Playwright must match ours. The same
 * checks as connectAlephChromium of @le-space/playwright (relay-button).
 */
export async function connectAlephChromium({ wsEndpoint, versionUrl, secret, timeoutMs = 120000 }) {
	const token = (secret ?? '').trim();
	if (!token) throw new Error('ALEPH_PLAYWRIGHT_SECRET is required for REMOTE_PROVIDER=aleph');
	if (!wsEndpoint?.startsWith('wss://')) throw new Error('ALEPH_PLAYWRIGHT_WS_ENDPOINT must be a wss:// endpoint');
	if (!versionUrl?.startsWith('https://')) throw new Error('ALEPH_PLAYWRIGHT_VERSION_URL must be an https:// endpoint');
	const headers = { Authorization: `Bearer ${token}` };
	const response = await fetch(versionUrl, { headers, cache: 'no-store', signal: AbortSignal.timeout(30000) });
	if (!response.ok) throw new Error(`the Aleph Playwright version endpoint answered HTTP ${response.status}`);
	const { playwrightVersion } = await response.json();
	if (playwrightVersion !== PLAYWRIGHT_RUNNER_VERSION) {
		throw new Error(`Playwright on the VM is ${playwrightVersion || 'unknown'}, here ${PLAYWRIGHT_RUNNER_VERSION}: they must be the same`);
	}
	return chromium.connect(wsEndpoint, { headers, timeout: timeoutMs });
}

async function launchBob() {
	if (provider === 'aleph') {
		return connectAlephChromium({
			wsEndpoint: process.env.ALEPH_PLAYWRIGHT_WS_ENDPOINT,
			versionUrl: process.env.ALEPH_PLAYWRIGHT_VERSION_URL,
			secret: process.env.ALEPH_PLAYWRIGHT_SECRET
		});
	}
	if (provider === 'local') return chromium.launch({ headless: true });
	throw new Error(`REMOTE_PROVIDER is "${provider}": use aleph or local`);
}

/**
 * `bobBrowser`: what the helpers need of a browser (newPerson, openLink: `newContext`). Its
 * contexts read English, as the config's `use` gives the test's own browser; a browser we
 * connected ourselves gets nothing of it.
 */
export const test = base.extend({
	bobBrowser: [
		// Playwright reads a fixture's dependencies from its first parameter: none
		// eslint-disable-next-line no-empty-pattern
		async ({}, use) => {
			const browser = await launchBob();
			try {
				await use({
					provider,
					version: () => browser.version(),
					newContext: (options = {}) => browser.newContext({ locale: 'en-US', ...options })
				});
			} finally {
				await browser.close().catch(() => {});
			}
		},
		{ scope: 'worker' }
	]
});

export { expect } from '@playwright/test';
