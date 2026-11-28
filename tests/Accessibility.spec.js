import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { addVirtualAuthenticator, newPerson, strayPasskey } from './helpers/passkeys.js';
import { invitationLink, openLink } from './helpers/onboarding.js';

// What a screen reader, a keyboard or weak eyes meet on each screen: axe-core with the rules
// of WCAG 2.1 A and AA, in English and German, at a desktop's width and a phone's. Each screen
// is checked as it is shown; one finding fails the test, and all of them are listed. The
// screens are the four places of #110 (Exchange, Contacts, My card, Settings).
// Not covered: the camera (<qr-scanner>), which needs a camera, and the passkey step dialog
// (<passkey-step-dialog>), which shows only during a passkey prompt.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const widths = { desktop: { width: 1280, height: 720 }, phone: { width: 390, height: 844 } };
const tabs = {
	en: ['Exchange', 'Contacts', 'My business card', 'Settings'],
	de: ['Austausch', 'Kontakte', 'Meine Visitenkarte', 'Einstellungen']
};

test('the first screen: the passkey screen, with the experimental note', async ({ browser }) => {
	test.setTimeout(180000);
	for (const [language, locale] of [
		['en', 'en-US'],
		['de', 'de-DE']
	]) {
		const context = await browser.newContext({ locale });
		try {
			const page = await context.newPage();
			await page.goto(process.env.PAGE_URL);
			await expect(page.getByTestId('passkey-gate')).toBeVisible();
			await expect(page.getByTestId('experimental-note')).toBeVisible();
			await expect(page.locator('#passkey-label')).toBeVisible();
			await checkEveryWidth(page, `the passkey screen (${language})`);
			// and with the examples unfolded (#110)
			const useful = page.getByRole('button', { name: language === 'de' ? 'Wozu ist das gut?' : 'Why is this useful?' });
			await useful.click();
			await expect(useful).toHaveAttribute('aria-expanded', 'true');
			await checkEveryWidth(page, `the passkey screen, why it is useful (${language})`);
		} finally {
			await context.close();
		}
	}
});

test('the passkey screen with a kept vault, and when a passkey opens nothing (#110)', async ({ browser }) => {
	test.setTimeout(240000);
	const alice = await newPerson(browser, { first: 'Alice', last: 'Wolkenfabrik', city: 'Musterstadt' });
	const context = await browser.newContext();
	try {
		// a reload: the vault is kept here, the screen offers to unlock it
		await alice.page.reload();
		await expect(alice.page.getByRole('button', { name: 'Unlock with passkey' })).toBeVisible();
		await checkEveryWidth(alice.page, 'the passkey screen with a kept vault (en)');
		await alice.page.getByTestId('gate-language-de').click();
		await expect(alice.page.getByRole('button', { name: 'Mit Passkey entsperren' })).toBeVisible();
		await checkEveryWidth(alice.page, 'the passkey screen with a kept vault (de)');

		const page = await context.newPage();
		await addVirtualAuthenticator(page);
		await page.goto(process.env.PAGE_URL);
		await strayPasskey(page);
		await page.getByRole('button', { name: 'Sign in with an existing passkey' }).click();
		await expect(page.getByTestId('ask-new')).toBeVisible({ timeout: 60000 });
		await checkEveryWidth(page, 'the passkey screen: this passkey opens nothing (en)');
	} finally {
		await Promise.all([alice.close(), context.close()]);
	}
});

test("the app's screens, the QR code and the invitation form", async ({ browser }) => {
	test.setTimeout(360000);
	const alice = await newPerson(browser, { first: 'Alice', last: 'Wolkenfabrik', city: 'Musterstadt' });
	let bob;
	try {
		for (const language of ['en', 'de']) {
			await test.step(`every place and the QR code (${language})`, async () => {
				const page = alice.page;
				if (language === 'de') {
					await page.getByRole('link', { name: tabs.en[3] }).click();
					await page.getByTestId('language-de').click();
					await expect(page.getByRole('link', { name: tabs.de[3] })).toBeVisible();
				}
				for (const name of tabs[language]) {
					await page.getByRole('link', { name }).click();
					await expect(page.getByRole('link', { name })).toHaveAttribute('aria-current', 'page');
					await checkEveryWidth(page, `${name} (${language})`);
				}
				await page.getByRole('link', { name: tabs[language][0] }).click();
				await page.getByRole('button', { name: language === 'de' ? 'Meinen Code zeigen' : 'Show my code' }).click();
				await expect(page.locator('img.qrcode')).toBeVisible();
				await checkEveryWidth(page, `the QR code (${language})`);
				await page.keyboard.press('Escape');
				await expect(page.locator('img.qrcode')).toHaveCount(0);
			});
		}

		await test.step('the invitation form, in English and German', async () => {
			// back to English for the helper that reads the link
			await alice.page.getByRole('link', { name: tabs.de[3] }).click();
			await alice.page.getByTestId('language-en').click();
			await expect(alice.page.getByRole('link', { name: tabs.en[3] })).toBeVisible();
			bob = await openLink(browser, await invitationLink(alice.page));
			await checkEveryWidth(bob.page, 'the invitation form (en)');
			await bob.page.getByTestId('onboarding-language-de').click();
			await expect(bob.page.locator('html')).toHaveAttribute('lang', 'de');
			await checkEveryWidth(bob.page, 'the invitation form (de)');
		});
	} finally {
		await Promise.all([alice.close(), bob?.close()]);
	}
});

/** the screen as shown now, at each width: what axe finds, as "rule (impact): where" */
async function checkEveryWidth(page, screen) {
	for (const [width, size] of Object.entries(widths)) {
		await page.setViewportSize(size);
		// Carbon lays some parts out again after a resize (the tabs become a list on a phone)
		await page.waitForTimeout(300);
		const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
		const found = violations.map(
			(violation) => `${violation.id} (${violation.impact}): ${violation.nodes.map((node) => node.target.join(' ')).join(' | ')}`
		);
		expect.soft(found, `${screen}, ${width}`).toEqual([]);
	}
	await page.setViewportSize(widths.desktop);
}
