import { test, expect } from '@playwright/test';
import { addVirtualAuthenticator, contactAddressOf, didOf, newPerson, names, recordCeremonies, takeCeremonies } from './helpers/passkeys.js';

// The app in English and German (#89). The suite runs its browsers in en-US
// (playwright.config.js); here the language comes from the browser, from the switch in
// Settings, and from the switch on the first screen.
// 1. A browser in German starts in German: the experimental-use and seed-migration notices.
// 2. Alice switches to German in Settings; it stays after a reload. Bob's request reaches her
//    as a German dialog, and its German button sends her card.
// 3. Carol opens Alice's invitation link and switches to German on the first screen, the
//    form (#97): the onboarding is German, sharing works, and so do the passkey steps of
//    securing it afterwards.

const people = {
	alice: { first: 'Alice', last: 'Wolkenfabrik', city: 'Musterstadt' },
	bob: { first: 'Bob', last: 'Stromwerk', city: 'Beispielort' },
	carol: { first: 'Carol', last: 'Beispiel', email: 'carol@example.com' }
};
const fullName = (person) => `${person.first} ${person.last}`;

/** the language on <html lang> */
const htmlLang = (page) => page.evaluate(() => document.documentElement.lang);

/** to German with the switch in Settings */
async function switchToGermanInSettings(page) {
	await page.getByRole('tab', { name: 'Settings' }).click();
	await page.getByTestId('language-de').click();
	await expect(page.getByRole('tab', { name: 'Einstellungen' })).toBeVisible();
	await expect(page.getByTestId('language-de')).toHaveAttribute('aria-pressed', 'true');
	expect(await htmlLang(page)).toBe('de');
}

test('a browser in German starts in German, with both notices', async ({ browser }) => {
	const context = await browser.newContext({ locale: 'de-DE' });
	try {
		const page = await context.newPage();
		await page.goto(process.env.PAGE_URL);
		await expect(page.getByRole('heading', { name: 'Bestätigung' })).toBeVisible();
		await expect(page.getByText('Hinweis: Das ist noch experimentelle Software.')).toBeVisible();
		await page.getByRole('button', { name: 'Weiter' }).click();
		await expect(page.getByRole('heading', { name: 'Dein deContact-Adressbuch' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Neues Adressbuch anlegen' })).toBeVisible();
		expect(await htmlLang(page)).toBe('de');
		// nothing was chosen: the browser's language, not a stored one
		expect(await page.evaluate(() => localStorage.getItem('decontact.locale'))).toBe(null);

		// a browser of the seed phrase days is told in German that its seed is gone
		await page.evaluate(() => localStorage.setItem('seedPhrase', 'abandon abandon abandon'));
		await page.reload();
		await expect(page.getByTestId('legacy-reset')).toContainText('deContact öffnet deine Identität jetzt mit einem Passkey.');
	} finally {
		await context.close();
	}
});

test('German after switching in Settings: kept after a reload, and in the request dialog', async ({ browser }) => {
	test.setTimeout(300000);
	const alice = await newPerson(browser, people.alice);
	let bob;
	try {
		await test.step('Alice switches to German', async () => {
			expect(await htmlLang(alice.page)).toBe('en');
			await switchToGermanInSettings(alice.page);
			await expect(alice.page.getByText('Passkeys und Wiederherstellungswörter')).toBeVisible();
			await expect(alice.page.getByLabel('DID', { exact: true })).toHaveValue(alice.did);
		});

		await test.step("on a phone, the tabs' dropdown names the tab in German too", async () => {
			const page = alice.page;
			const desktop = page.viewportSize();
			// below 42rem Carbon shows the tabs as a dropdown, labelled with the selected tab
			await page.setViewportSize({ width: 390, height: 844 });
			const trigger = page.locator('.bx--tabs-trigger');
			const shown = trigger.locator('.bx--tabs-trigger-text');
			await expect(trigger).toBeVisible();
			await expect(shown).toHaveText('Einstellungen');
			await trigger.click();
			await page.getByRole('tab', { name: 'Kontakte' }).click();
			await expect(shown).toHaveText('Kontakte');
			await page.setViewportSize(desktop);
		});

		await test.step('the choice is kept after a reload', async () => {
			await alice.page.reload();
			await expect(alice.page.getByRole('heading', { name: 'Dein deContact-Adressbuch' })).toBeVisible();
			expect(await htmlLang(alice.page)).toBe('de');
			await alice.page.getByRole('button', { name: 'Mit Passkey entsperren' }).click();
			expect(await didOf(alice.page)).toBe(alice.did);
			await expect(alice.page.getByRole('tab', { name: 'Kontakte' })).toBeVisible();
			await expect(alice.page.getByRole('button', { name: 'QR-Code' })).toBeVisible();
		});

		await test.step("Bob's request reaches Alice as a German dialog", async () => {
			bob = await newPerson(browser, people.bob);
			await bob.page.getByRole('tab', { name: 'Contacts' }).click();
			await bob.page.getByTestId('scan-field').fill(await contactAddressOf(alice.page));
			await bob.page.getByRole('button', { name: 'Scan' }).click();
			const send = alice.page.getByRole('button', { name: 'Meine Kontaktdaten senden' });
			await expect(send).toBeVisible({ timeout: 90000 });
			await expect(alice.page.getByText('deContact-Kontaktanfrage')).toBeVisible();
			await expect(alice.page.getByTestId('request-from')).toContainText(`Von: ${fullName(people.bob)}`);
			await expect(alice.page.getByText(`Kontaktdaten von ${fullName(people.bob)} ${people.bob.city} anfordern`)).toBeVisible();
			await expect(alice.page.getByRole('button', { name: 'Abbrechen' })).toBeVisible();
			await send.click();
			// her card reaches Bob; he is asked back in English
			await expect.poll(() => names(bob.page), { timeout: 90000, message: "Alice's card in Bob's book" }).toContain(fullName(people.alice));
			await expect(bob.page.getByRole('button', { name: 'Send My Contact Data' })).toBeVisible({ timeout: 90000 });
		});
	} finally {
		await Promise.all([alice, bob].filter(Boolean).map((person) => person.close()));
	}
});

test('the onboarding in German, switched on the first screen', async ({ browser }) => {
	test.setTimeout(300000);
	const alice = await newPerson(browser, people.alice);
	let carolContext;
	try {
		let link;
		await test.step('Alice shows her invitation in German', async () => {
			await switchToGermanInSettings(alice.page);
			await alice.page.getByRole('tab', { name: 'Kontakte' }).click();
			await alice.page.getByRole('button', { name: 'QR-Code' }).click();
			await expect(alice.page.getByRole('checkbox', { name: 'Gegenseitig austauschen' })).toBeChecked();
			await expect(
				alice.page.getByText('Wer diesen Code scannt, kann auch seine Kontaktdaten mit dir teilen. Ob, entscheidet die Person selbst.')
			).toBeVisible();
			const qrCode = alice.page.locator('img.qrcode');
			await expect(qrCode).toHaveAttribute('alt', /onBoardingToken=1\./);
			const alt = await qrCode.getAttribute('alt');
			// the German page of the app: a messenger's preview of the link is German (lib/seo.js)
			expect(alt.startsWith(`${process.env.PAGE_URL}de/#/onboarding/`)).toBe(true);
			link = alt;
			await alice.page.keyboard.press('Escape');
		});

		const carol = {};
		await test.step('Carol opens the link in English and switches to German on the form', async () => {
			carolContext = await browser.newContext();
			carol.page = await carolContext.newPage();
			await addVirtualAuthenticator(carol.page);
			await recordCeremonies(carol.page);
			await carol.page.goto(link);
			await expect(carol.page.getByRole('button', { name: 'Already have a deContact passkey? Sign in' })).toBeVisible();
			await carol.page.getByTestId('onboarding-language-de').click();
			await expect(carol.page.getByRole('heading', { name: 'Kontaktdaten wurden mit dir geteilt' })).toBeVisible();
			await expect(carol.page.getByRole('button', { name: 'Du hast schon einen deContact-Passkey? Anmelden' })).toBeVisible();
			expect(await htmlLang(carol.page)).toBe('de');
			expect(await takeCeremonies(carol.page)).toEqual([]);
		});

		await test.step('the onboarding is German, and sharing works', async () => {
			const onboarding = carol.page.getByTestId('onboarding');
			await expect(onboarding.getByRole('heading', { name: 'Deine Kontaktdaten' })).toBeVisible();
			await expect(carol.page.getByRole('button', { name: 'Adresse hinzufügen' })).toBeVisible();
			// she starts on the form: her temporary identity starts, and Alice is asked
			await carol.page.getByPlaceholder('E-Mail eingeben …').fill(people.carol.email);
			carol.did = await didOf(carol.page);
			await expect(carol.page.getByTestId('inviter-card')).toHaveText(`${fullName(people.alice)} ist jetzt in deinem Adressbuch`, {
				timeout: 120000
			});
			await expect(carol.page.getByRole('button', { name: 'Nur speichern' })).toBeVisible();
			await carol.page.getByPlaceholder('Vorname eingeben …').fill(people.carol.first);
			await carol.page.getByPlaceholder('Nachname eingeben …').fill(people.carol.last);
			await carol.page.getByRole('button', { name: `Speichern und mit ${people.alice.first} teilen` }).click();
			await expect(carol.page.getByRole('tab', { name: 'Kontakte' })).toBeVisible();
			await expect.poll(() => names(alice.page), { timeout: 120000, message: "Carol's card in Alice's book" })
				.toContain(fullName(people.carol));
		});

		await test.step('securing it afterwards: German passkey steps, in the voice of the app', async () => {
			const offer = carol.page.getByTestId('secure-offer');
			await expect(offer.getByRole('heading', { name: 'Diesen Kontakt behalten?' })).toBeVisible({ timeout: 60000 });
			await offer.getByRole('button', { name: 'Mit Passkey sichern' }).click();
			const step = carol.page.locator('passkey-step-dialog');
			await expect(step.getByText('Jetzt der Schlüssel für deine Daten')).toBeVisible({ timeout: 30000 });
			const next = step.getByRole('button', { name: 'Weiter' });
			await expect(next).toBeVisible();
			await carol.page.waitForTimeout(600); // the dialog ignores clicks for a moment
			await next.click();
			const safeguards = carol.page.getByTestId('secure-safeguards');
			await expect(safeguards.getByRole('heading', { name: 'Mit deinem Passkey gesichert' })).toBeVisible();
			await expect(safeguards.getByRole('button', { name: 'Wiederherstellungswörter aufschreiben' })).toBeVisible();
			await safeguards.getByRole('button', { name: 'Überspringen' }).click();
			expect(await didOf(carol.page)).toBe(carol.did);
		});
	} finally {
		await Promise.all([alice.close(), carolContext?.close()]);
	}
});
