import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
	addVirtualAuthenticator,
	addCard,
	confirmExperimental,
	contactAddressOf,
	createAddressBook,
	newPerson,
	names
} from './helpers/passkeys.js';
import { fillOnboardingCard, invitationLink, openLink } from './helpers/onboarding.js';

// A tour of every screen, saved as a screenshot at each reference width (#110), so a change
// to the UI can be compared before and after: CI keeps them as the artifact "screens" of
// the test job, and test-results/screens/index.html shows them side by side.
// It asserts little: each screen opens. It is not a pixel diff.

/**
 * The reference devices of #110, in CSS pixels, portrait. Until they are measured on the
 * devices themselves (innerWidth × innerHeight), the widths are the narrowest phone so far
 * (#98), a common Android phone, the open Fold's inner screen and a desktop; the heights are
 * those of similar devices. The measured values go here.
 */
const DEVICES = [
	{ name: 'Galaxy Z Fold 2, closed', width: 344, height: 882 },
	{ name: 'Galaxy A57', width: 412, height: 915 },
	{ name: 'Galaxy Z Fold 2, open', width: 884, height: 1104 },
	{ name: 'Desktop', width: 1280, height: 800 }
];
/** where the pictures go; one file per screen and width: <screen>-<width>.png */
const OUT = process.env.SCREENS_DIR || path.join('test-results', 'screens');
/** the width the tour clicks at: the tabs are a list below Carbon's md breakpoint */
const CLICK_AT = DEVICES.at(-1);

const people = {
	alice: { first: 'Alice', last: 'Wolkenfabrik', city: 'Musterstadt' },
	bob: { first: 'Bob', last: 'Stromwerk', email: 'bob@example.com' },
	carol: { first: 'Carol', last: 'Beispiel', city: 'Beispielstadt' }
};
const fullName = (person) => `${person.first} ${person.last}`;

/** every picture taken, for the index: { screen, title, width, file, sideways } */
const shots = [];

test('a screenshot of every screen at every reference width', async ({ browser }) => {
	test.setTimeout(600000);
	mkdirSync(OUT, { recursive: true });
	shots.length = 0;
	let alice, bob, carol;
	try {
		await test.step('the first start: the notice, the passkey screen, an empty address book', async () => {
			const context = await browser.newContext({ viewport: size(CLICK_AT) });
			const page = await context.newPage();
			await addVirtualAuthenticator(page);
			await page.goto(process.env.PAGE_URL);
			await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
			await shoot(page, '01-notice', 'First start: the notice', { dialog: true });
			await confirmExperimental(page);
			await expect(page.getByTestId('passkey-gate')).toBeVisible();
			await shoot(page, '02-passkey', 'First start: the passkey screen');

			const did = await createAddressBook(page, people.alice.first);
			alice = { page, did, close: () => context.close() };
			await openTab(page, 'Contacts');
			await shoot(page, '03-contacts-empty', 'Contacts, empty');
			await openTab(page, 'My Address');
			await shoot(page, '04-my-address', 'My Address');
			await addCard(page, people.alice);
		});

		const { page } = alice;
		await test.step('the QR dialog, Statistics and Settings', async () => {
			await openTab(page, 'Contacts');
			await page.getByRole('button', { name: 'QR Code' }).click();
			// the pointer off the dialog: over its close button, Carbon shows a tooltip, and the
			// first Escape closes that tooltip instead of the dialog (WCAG 1.4.13)
			await page.mouse.move(0, 0);
			await expect(page.locator('img.qrcode')).toHaveAttribute('alt', /onBoardingToken=/);
			await shoot(page, '05-qr-dialog', 'The QR dialog', { dialog: true });
			await page.keyboard.press('Escape');
			await expect(page.locator('img.qrcode')).toHaveCount(0);
			await openTab(page, 'Statistics');
			await shoot(page, '06-statistics', 'Statistics');
			await openTab(page, 'Settings');
			await shoot(page, '07-settings', 'Settings');
		});

		await test.step("the invitee's form: Bob opens Alice's invitation link", async () => {
			bob = await openLink(browser, await invitationLink(page));
			await bob.page.setViewportSize(size(CLICK_AT));
			await shoot(bob.page, '08-invitee-form', "The invitee's form, as it opens");
			await expect(bob.page.getByTestId('inviter-card')).toBeVisible({ timeout: 120000 });
			await fillOnboardingCard(bob.page, people.bob);
			await shoot(
				bob.page,
				'09-invitee-card-arrived',
				"The invitee's form: the inviter's card arrived, the form filled in"
			);
			await bob.page
				.getByRole('button', { name: `Save and share with ${people.alice.first}` })
				.click();
			await expect(bob.page.getByRole('tab', { name: 'Contacts' })).toBeVisible({ timeout: 60000 });
			await expect
				.poll(() => names(page), { timeout: 90000, message: "Bob's card in Alice's book" })
				.toContain(fullName(people.bob));
			await shoot(bob.page, '10-invitee-after-saving', 'The invitee after saving');
		});

		await test.step('the request dialog: Carol asks Alice by her contact address', async () => {
			carol = await newPerson(browser, people.carol);
			await carol.page.setViewportSize(size(CLICK_AT));
			await openTab(carol.page, 'Contacts');
			await carol.page.getByTestId('scan-field').fill(await contactAddressOf(page));
			await carol.page.getByRole('button', { name: 'Scan' }).click();
			const send = page.getByRole('button', { name: 'Share and ask for theirs' });
			await expect(send).toBeVisible({ timeout: 90000 });
			await shoot(page, '11-request-dialog', 'The request dialog', { dialog: true });
			await send.click();
			// Alice asks back: Carol's card comes to her
			await carol.page
				.getByRole('button', { name: 'Share mine' })
				.click({ timeout: 90000 });
			await expect
				.poll(() => names(page), { timeout: 90000, message: "Carol's card in Alice's book" })
				.toContain(fullName(people.carol));
		});

		await test.step('Contacts with contacts, a contact expanded and opened', async () => {
			await openTab(page, 'Contacts');
			// the first: once expanded, the row of the details below names him too
			const row = page.getByRole('row', { name: new RegExp(people.bob.last) }).first();
			await expect(row).toBeVisible({ timeout: 30000 });
			await expect(
				page.getByRole('row', { name: new RegExp(people.carol.last) }).first()
			).toBeVisible({ timeout: 30000 });
			await shoot(page, '12-contacts', 'Contacts, with contacts');
			await row.getByRole('button', { name: 'Expand current row' }).click();
			await expect(row.getByRole('button', { name: 'Collapse current row' })).toBeVisible();
			await shoot(page, '13-contact-expanded', 'A contact, expanded');
			await row.locator('label').click();
			await expect(page.getByPlaceholder('Enter lastname...')).toHaveValue(people.bob.last);
			await shoot(page, '14-contact-opened', 'A contact, opened');
		});
	} finally {
		writeIndex();
		await Promise.all([alice, bob, carol].filter(Boolean).map((person) => person.close()));
	}
});

const size = ({ width, height }) => ({ width, height });

/** a tab of the home screen, clicked where the tabs are tabs */
async function openTab(page, name) {
	await page.setViewportSize(size(CLICK_AT));
	await page.getByRole('tab', { name }).click();
	await expect(page.getByRole('tab', { name, selected: true })).toBeVisible();
}

/**
 * The screen as shown now, at each width: the whole page, or only the window for a dialog.
 * Back at the width the tour clicks at afterwards. Whether the page scrolls sideways goes
 * into the index and the report, without failing the tour.
 */
async function shoot(page, screen, title, { dialog = false } = {}) {
	for (const device of DEVICES) {
		await page.setViewportSize(size(device));
		// Carbon lays some parts out again after a resize (the tabs become a list on a phone)
		await page.waitForTimeout(400);
		const file = `${screen}-${device.width}.png`;
		await page.screenshot({
			path: path.join(OUT, file),
			fullPage: !dialog,
			animations: 'disabled'
		});
		const wide = await page.evaluate(() => document.documentElement.scrollWidth);
		const sideways = wide > device.width ? wide : undefined;
		if (sideways)
			test
				.info()
				.annotations.push({
					type: 'scrolls sideways',
					description: `${screen} at ${device.width} px: ${wide} px wide`
				});
		shots.push({ screen, title, width: device.width, file, sideways });
	}
	await page.setViewportSize(size(CLICK_AT));
}

/** test-results/screens/index.html: one row per screen, one column per width */
function writeIndex() {
	const escape = (text) =>
		String(text).replace(
			/[&<>"]/g,
			(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
		);
	const screens = [...new Map(shots.map((shot) => [shot.screen, shot.title])).entries()];
	const cell = (screen, width) => {
		const shot = shots.find((it) => it.screen === screen && it.width === width);
		if (!shot) return '<td></td>';
		const note = shot.sideways
			? `<p class="wide">scrolls sideways: ${shot.sideways} px wide</p>`
			: '';
		return `<td><a href="${shot.file}"><img src="${shot.file}" alt="${escape(shot.title)}, ${width} px" loading="lazy"></a>${note}</td>`;
	};
	const rows = screens.map(
		([screen, title]) =>
			`<tr><th scope="row">${escape(title)}<br><code>${screen}</code></th>${DEVICES.map((device) => cell(screen, device.width)).join('')}</tr>`
	);
	const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>deContact screens</title>
<style>
body { font: 14px system-ui, sans-serif; margin: 1rem; }
table { border-collapse: collapse; }
th, td { border: 1px solid #ccc; padding: 0.5rem; vertical-align: top; text-align: left; }
img { width: 240px; height: auto; display: block; }
.wide { color: #b00; margin: 0.25rem 0 0; }
</style></head><body>
<h1>deContact screens</h1>
<p>Generated by tests/Screens.spec.js on ${new Date().toISOString()}.</p>
<table><thead><tr><th></th>${DEVICES.map((device) => `<th scope="col">${escape(device.name)}<br>${device.width} × ${device.height}</th>`).join('')}</tr></thead>
<tbody>${rows.join('\n')}</tbody></table>
</body></html>
`;
	writeFileSync(path.join(OUT, 'index.html'), html);
}
