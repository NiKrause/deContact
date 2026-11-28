import { test, expect } from '@playwright/test';
import { addVirtualAuthenticator, contactAddressOf, didOf, newPerson, names, recordCeremonies, takeCeremonies, askByAddress } from './helpers/passkeys.js';

// The app in English and German (#89). The suite runs its browsers in en-US
// (playwright.config.js); here the language comes from the browser, from the switch in
// Settings, and from the switch on the first screen.
// 1. A browser in German starts in German: the start screen's text and the seed-migration notice.
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
	await page.getByRole('link', { name: 'Settings' }).click();
	await page.getByTestId('language-de').click();
	await expect(page.getByRole('link', { name: 'Einstellungen' })).toBeVisible();
	await expect(page.getByTestId('language-de')).toHaveAttribute('aria-pressed', 'true');
	expect(await htmlLang(page)).toBe('de');
}

test('a browser in German starts in German: the text of the start screen and the seed-migration notice', async ({ browser }) => {
	const context = await browser.newContext({ locale: 'de-DE' });
	try {
		const page = await context.newPage();
		await page.goto(process.env.PAGE_URL);
		await expect(page.getByRole('heading', { name: 'Dein deContact-Adressbuch' })).toBeVisible();
		// German capitalises each word of the tagline (#119)
		await expect(page.getByTestId('passkey-gate')).toContainText('Selbstaktualisierend · Lokal · Peer-to-Peer');
		await expect(page.getByTestId('gate-lead')).toContainText('So erreichen sie dich auch nach einem Umzug oder Jobwechsel.');
		// the examples are folded away until asked for (#110)
		const useful = page.getByRole('button', { name: 'Wozu ist das gut?' });
		await expect(useful).toHaveAttribute('aria-expanded', 'false');
		await expect(page.getByText(/in der Ausbildung, im Studium oder im Beruf/)).toBeHidden();
		await useful.click();
		await expect(useful).toHaveAttribute('aria-expanded', 'true');
		await expect(page.getByText(/in der Ausbildung, im Studium oder im Beruf/)).toBeVisible();
		await expect(page.getByTestId('gate-useful')).toContainText('du verlässt ein soziales Netzwerk');
		// what happens with the contact details, right on the first screen
		await expect(page.getByTestId('gate-lead')).toContainText(
			'Kein Server und keine Cloud kann deine Kontaktdaten lesen: Sie gehen verschlüsselt Peer-to-Peer von Handy zu Handy, und nur du und deine Kontakte können sie öffnen.'
		);
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

		await test.step('on a phone, the navigation at the bottom is German too', async () => {
			const page = alice.page;
			const desktop = page.viewportSize();
			await page.setViewportSize({ width: 390, height: 844 });
			const nav = page.getByRole('navigation', { name: 'Hauptnavigation' });
			await expect(nav.getByRole('link', { name: 'Einstellungen' })).toHaveAttribute('aria-current', 'page');
			await nav.getByRole('link', { name: 'Kontakte' }).click();
			await expect(nav.getByRole('link', { name: 'Kontakte' })).toHaveAttribute('aria-current', 'page');
			await expect(nav.getByRole('link', { name: 'Austausch' })).toBeVisible();
			await expect(nav.getByRole('link', { name: 'Meine Visitenkarte' })).toBeVisible();
			await page.setViewportSize(desktop);
		});

		await test.step('the choice is kept after a reload', async () => {
			await alice.page.reload();
			await expect(alice.page.getByRole('heading', { name: 'Dein deContact-Adressbuch' })).toBeVisible();
			expect(await htmlLang(alice.page)).toBe('de');
			await alice.page.getByRole('button', { name: 'Mit Passkey entsperren' }).click();
			expect(await didOf(alice.page)).toBe(alice.did);
			await expect(alice.page.getByRole('link', { name: 'Kontakte' })).toBeVisible();
			await alice.page.getByRole('link', { name: 'Austausch' }).click();
			await expect(alice.page.getByRole('button', { name: 'Meinen Code zeigen' })).toBeVisible();
		});

		await test.step("Bob's request reaches Alice as a German dialog", async () => {
			bob = await newPerson(browser, people.bob);
			await askByAddress(bob.page, await contactAddressOf(alice.page));
			const send = alice.page.getByRole('button', { name: 'Teilen und um ihre bitten' });
			await expect(send).toBeVisible({ timeout: 90000 });
			await expect(alice.page.getByRole('heading', { name: 'Kontaktanfrage' })).toBeVisible();
			await expect(alice.page.getByTestId('request-from')).toHaveText(
				`${fullName(people.bob)} (${people.bob.city}) möchte deine Kontaktdaten.`
			);
			await expect(alice.page.getByRole('button', { name: 'Nur meine teilen' })).toBeVisible();
			await expect(alice.page.getByRole('button', { name: 'Ablehnen' })).toBeVisible();
			await send.click();
			// her card reaches Bob; he is asked back in English
			await expect.poll(() => names(bob.page), { timeout: 90000, message: "Alice's card in Bob's book" }).toContain(fullName(people.alice));
			await expect(bob.page.getByRole('button', { name: 'Share mine' })).toBeVisible({ timeout: 90000 });
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
			await alice.page.getByRole('link', { name: 'Austausch' }).click();
			await alice.page.getByRole('button', { name: 'Meinen Code zeigen' }).click();
			await expect(alice.page.getByRole('heading', { name: 'Kontakt teilen' })).toBeVisible();
			await expect(alice.page.getByRole('radio', { name: 'Sofort teilen' })).toBeChecked();
			await expect(alice.page.getByRole('checkbox', { name: 'Auch um ihre Kontaktdaten bitten' })).toBeChecked();
			await expect(alice.page.getByTestId('qr-summary')).toHaveText(
				'Die erste Person, die scannt, bekommt deine Kontaktdaten sofort und kann dir ihre schicken. Der Code gilt 24 Stunden.'
			);
			await expect(alice.page.getByText('Die Person entscheidet, ob sie ihre schickt.')).toBeVisible();
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
			await expect(carol.page.getByTestId('waiting-for-phone')).toHaveText('Die Visitenkarte der Person, die dich eingeladen hat, ist unterwegs …');
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
			await expect(carol.page.getByRole('link', { name: 'Kontakte' })).toBeVisible();
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
