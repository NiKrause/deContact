import { test, expect } from '@playwright/test';
import { addVirtualAuthenticator, didOf, newPerson, names, recordCeremonies } from './helpers/passkeys.js';

// The app in English and German (#89). The suite runs its browsers in en-US
// (playwright.config.js); here the language comes from the browser, from the switch in
// Settings, and from the switch on the first screen.
// 1. A browser in German starts in German: the experimental-use and seed-migration notices.
// 2. Alice switches to German in Settings; it stays after a reload. Bob's request reaches her
//    as a German dialog, and its German button sends her card.
// 3. Carol opens Alice's invitation link and switches to German on the first screen: the
//    passkey steps and the onboarding are German, and sharing works.

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
			await bob.page.getByRole('textbox', { role: 'scanContact' }).fill(alice.did);
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
			link = alt;
			await alice.page.keyboard.press('Escape');
		});

		const carol = {};
		await test.step('Carol opens the link in English and switches to German there', async () => {
			carolContext = await browser.newContext();
			carol.page = await carolContext.newPage();
			await addVirtualAuthenticator(carol.page);
			await recordCeremonies(carol.page);
			await carol.page.goto(link);
			await expect(carol.page.getByText('Create a passkey to open your own address book')).toBeVisible();
			await carol.page.getByTestId('gate-language-de').click();
			await expect(carol.page.getByRole('heading', { name: 'Kontaktdaten wurden mit dir geteilt' })).toBeVisible();
			await expect(carol.page.getByText('Leg einen Passkey an, um dein eigenes Adressbuch zu öffnen.')).toBeVisible();
			expect(await htmlLang(carol.page)).toBe('de');
		});

		await test.step('the passkey steps are German, in the voice of the app', async () => {
			await carol.page.getByLabel('Name des neuen Passkeys (optional)').fill('Carol');
			await carol.page.getByRole('button', { name: 'Neues Adressbuch anlegen' }).click();
			const step = carol.page.locator('passkey-step-dialog');
			await expect(step.getByText('Jetzt der Schlüssel für deine Daten')).toBeVisible({ timeout: 30000 });
			const next = step.getByRole('button', { name: 'Weiter' });
			await expect(next).toBeVisible();
			await carol.page.waitForTimeout(600); // the dialog ignores clicks for a moment
			await next.click();
			carol.did = await didOf(carol.page);
		});

		await test.step('the onboarding is German, and sharing works', async () => {
			const onboarding = carol.page.getByTestId('onboarding');
			await expect(onboarding).toBeVisible();
			await expect(onboarding.getByRole('heading', { name: 'Deine Kontaktdaten' })).toBeVisible();
			await expect(carol.page.getByRole('button', { name: 'Adresse hinzufügen' })).toBeVisible();
			await expect(carol.page.getByTestId('inviter-card')).toHaveText(`${fullName(people.alice)} ist jetzt in deinem Adressbuch`, {
				timeout: 120000
			});
			await expect(carol.page.getByRole('button', { name: 'Nur speichern' })).toBeVisible();
			await carol.page.getByPlaceholder('E-Mail eingeben …').fill(people.carol.email);
			await carol.page.getByPlaceholder('Vorname eingeben …').fill(people.carol.first);
			await carol.page.getByPlaceholder('Nachname eingeben …').fill(people.carol.last);
			await carol.page.getByRole('button', { name: `Speichern und mit ${people.alice.first} teilen` }).click();
			await expect(carol.page.getByRole('tab', { name: 'Kontakte' })).toBeVisible();
			await expect.poll(() => names(alice.page), { timeout: 120000, message: "Carol's card in Alice's book" })
				.toContain(fullName(people.carol));
		});
	} finally {
		await Promise.all([alice.close(), carolContext?.close()]);
	}
});
