/**
 * Every page the end-to-end tests open is held to the Content-Security-Policy and Trusted
 * Types (src/lib/csp.js), and a test fails on anything the browser refused: a
 * `securitypolicyviolation` event, or an error in the console or the page that names the
 * policy or Trusted Types. The specs import `test`, `expect` and `chromium` from here, not
 * from @playwright/test.
 *
 * It watches the test's own context and every context opened while the test runs
 * (`browser.newContext()`, `browser.newPage()`, a second browser from `chromium.launch()`).
 */
import { test as base, expect, chromium } from '@playwright/test';

export { expect, chromium };

/** what the browser writes when it refuses something under the policy or Trusted Types */
const NAMES_THE_POLICY =
	/Content[- ]Security[- ]Policy|Trusted ?Types?|TrustedHTML|TrustedScript|require-trusted-types-for/i;

/** the contexts already watched, so none is watched twice */
const watched = new WeakSet();

/**
 * Note in `refused` whatever the policy or Trusted Types refuse in the context's pages.
 *
 * @param {import('@playwright/test').BrowserContext} context
 * @param {string[]} refused
 */
export async function watchPolicy(context, refused) {
	if (watched.has(context)) return;
	watched.add(context);
	await context.exposeBinding('__decontactPolicyRefused', ({ page }, /** @type {string} */ what) =>
		refused.push(`${what} (on ${page?.url()})`)
	);
	await context.addInitScript(() => {
		// capture: a violation in a shadow root reaches the document as well
		document.addEventListener(
			'securitypolicyviolation',
			(event) =>
				/** @type {any} */ (window).__decontactPolicyRefused(
					`${event.effectiveDirective} refused ${event.blockedURI}` +
						(event.sample ? ` "${event.sample}"` : '') +
						` at ${event.sourceFile}:${event.lineNumber}`
				),
			true
		);
	});
	/** @param {import('@playwright/test').Page} page */
	const listen = (page) => {
		page.on('console', (message) => {
			if (message.type() === 'error' && NAMES_THE_POLICY.test(message.text())) {
				refused.push(`console: ${message.text()} (on ${page.url()})`);
			}
		});
		page.on('pageerror', (error) => {
			if (NAMES_THE_POLICY.test(String(error)))
				refused.push(`page error: ${error} (on ${page.url()})`);
		});
	};
	context.pages().forEach(listen);
	context.on('page', listen);
}

export const test = base.extend({
	/** what the policy and Trusted Types refused in this test; it must stay empty */
	policyRefusals: [
		async ({ browser, context }, use) => {
			/** @type {string[]} */
			const refused = [];
			await watchPolicy(context, refused);
			// every Browser, this worker's and one a test launches itself, opens its contexts here
			const Browser = Object.getPrototypeOf(browser);
			const newContext = Browser.newContext;
			Browser.newContext = async function (/** @type {any[]} */ ...args) {
				const opened = await newContext.apply(this, args);
				await watchPolicy(opened, refused);
				return opened;
			};
			try {
				await use(refused);
			} finally {
				Browser.newContext = newContext;
			}
			expect(refused, 'what the Content-Security-Policy and Trusted Types refused').toEqual([]);
		},
		{ auto: true }
	]
});
