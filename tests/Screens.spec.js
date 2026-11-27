import { test, expect, chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
	addVirtualAuthenticator,
	askByAddress,
	addCard,
	contactAddressOf,
	createAddressBook,
	editMyCard,
	newPerson,
	names
} from './helpers/passkeys.js';
import { fillOnboardingCard, invitationLink, openLink } from './helpers/onboarding.js';
import { madeUpPortrait } from './helpers/portrait.js';
import { qrVideo } from './helpers/qr-video.js';

// A tour of every screen, saved as a screenshot at each reference width (#110), so a change
// to the UI can be compared before and after: CI keeps them as the artifact "screens" of
// the test job, and test-results/screens/index.html shows them side by side.
// It asserts little: each screen opens, and no screen scrolls sideways at any of the widths
// (#98). It is not a pixel diff.

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
/** the width the tour clicks at: a desktop's, with the places in a rail */
const CLICK_AT = DEVICES.at(-1);

const people = {
	alice: { first: 'Alice', last: 'Wolkenfabrik', city: 'Musterstadt' },
	bob: { first: 'Bob', last: 'Stromwerk', email: 'bob@example.com' },
	carol: { first: 'Carol', last: 'Beispiel', city: 'Beispielstadt' }
};
const fullName = (person) => `${person.first} ${person.last}`;
/** made-up portraits for their cards (helpers/portrait.js): the README shows them */
const portraits = {
	alice: { sky: ['#9cc3e6', '#f4e1c1'], skin: '#d9a066', hair: '#5a3825', shirt: '#2f6f62' },
	carol: { sky: ['#c9b3e6', '#f6dcc8'], skin: '#8d5524', hair: '#1f1a17', shirt: '#a23b72' }
};

/** every picture taken, for the index: { screen, title, width, file, sideways } */
const shots = [];

test('a screenshot of every screen at every reference width', async ({ browser }) => {
	test.setTimeout(600000);
	mkdirSync(OUT, { recursive: true });
	shots.length = 0;
	let alice, bob, carol, camera;
	try {
		await test.step('the first start: the passkey screen, an empty address book', async () => {
			const context = await browser.newContext({ viewport: size(CLICK_AT) });
			const page = await context.newPage();
			await addVirtualAuthenticator(page);
			await page.goto(process.env.PAGE_URL);
			await expect(page.getByTestId('passkey-gate')).toBeVisible();
			await shoot(page, '02-passkey', 'First start: the passkey screen');

			const did = await createAddressBook(page, people.alice.first);
			alice = { page, did, close: () => context.close() };
			// a new address book opens on My card, with why (#110)
			await expect(page.getByRole('link', { name: 'My card' })).toHaveAttribute('aria-current', 'page');
			await expect(page.getByTestId('card-why')).toBeVisible();
			// Later: Exchange, which asks for the card
			await page.getByTestId('card-later').click();
			await expect(page.getByRole('link', { name: 'Exchange' })).toHaveAttribute('aria-current', 'page');
			await expect(page.getByTestId('fill-card')).toBeVisible();
			await openTab(page, 'Contacts');
			await shoot(page, '03-contacts-empty', 'Contacts, empty');
			// before the first card: the checklist holds the code back and asks for a name
			await openTab(page, 'Exchange');
			await page.getByRole('button', { name: 'Show my code' }).click();
			await page.mouse.move(0, 0);
			await expect(page.getByTestId('readiness-card')).toHaveAttribute('data-state', 'problem');
			await expect(page.locator('img.qrcode')).toHaveCount(0);
			await shoot(page, '04b-show-code-without-card', 'Show my code, before the first card', { dialog: true });
			await page.getByRole('button', { name: 'Fill in my card' }).click();
			await expect(page.getByRole('link', { name: 'My card' })).toHaveAttribute('aria-current', 'page');
			await openTab(page, 'My card');
			await shoot(page, '04-my-card', 'My card, before the first card');
			await addCard(page, people.alice);
			await choosePortrait(page, portraits.alice);
			await expect(page.getByTestId('my-card')).toBeVisible();
			await shoot(page, '04c-my-card-saved', 'My card, as others see it');
			// Edit opens the form; Cancel drops the change
			await page.getByRole('button', { name: 'Edit', exact: true }).click();
			await expect(page.getByPlaceholder('Enter lastname...')).toHaveValue(people.alice.last);
			await shoot(page, '04d-my-card-edit', 'My card, editing');
			await page.getByPlaceholder('Enter city...').fill('Anderswo');
			await page.getByRole('button', { name: 'Cancel' }).click();
			await expect(page.getByTestId('my-card')).toBeVisible();
			await expect(page.getByTestId('my-card')).not.toContainText('Anderswo');
		});

		const { page } = alice;
		await test.step('Exchange and its QR dialog, and Settings', async () => {
			await openTab(page, 'Exchange');
			await page.getByRole('button', { name: 'Show my code' }).click();
			// the pointer off the dialog: over its close button, Carbon shows a tooltip, and the
			// first Escape closes that tooltip instead of the dialog (WCAG 1.4.13)
			await page.mouse.move(0, 0);
			await expect(page.locator('img.qrcode')).toHaveAttribute('alt', /onBoardingToken=/);
			// every step done: the checklist folds into one line
			await expect(page.getByTestId('readiness-summary')).toHaveText('Ready · reachable through the relay', { timeout: 60000 });
			await shoot(page, '05-qr-dialog', 'Show my code, ready', { dialog: true });
			await page.keyboard.press('Escape');
			await expect(page.locator('img.qrcode')).toHaveCount(0);
			await openTab(page, 'Exchange');
			await shoot(page, '06-exchange', 'Exchange, the start screen');
			await openTab(page, 'Settings');
			await shoot(page, '07-settings', 'Settings');
		});

		await test.step("the invitee's form: Bob opens Alice's invitation link", async () => {
			bob = await openLink(browser, await invitationLink(page));
			await bob.page.setViewportSize(size(CLICK_AT));
			await shoot(bob.page, '08-invitee-form', "The invitee's form, as it opens");
			await expect(bob.page.getByTestId('inviter-card')).toBeVisible({ timeout: 120000 });
			// her photo and the line about her card, not under the fixed header at any width
			await clearOfHeader(bob.page, bob.page.getByTestId('onboarding'), 'the invitee form');
			await fillOnboardingCard(bob.page, people.bob);
			await shoot(
				bob.page,
				'09-invitee-card-arrived',
				"The invitee's form: the inviter's card arrived, the form filled in"
			);
			await bob.page
				.getByRole('button', { name: `Save and share with ${people.alice.first}` })
				.click();
			await expect(bob.page.getByRole('link', { name: 'Contacts' })).toBeVisible({ timeout: 60000 });
			await expect
				.poll(() => names(page), { timeout: 90000, message: "Bob's card in Alice's book" })
				.toContain(fullName(people.bob));
			await shoot(bob.page, '10-invitee-after-saving', 'The invitee after saving');
		});

		await test.step('the request dialog: Carol asks Alice by her contact address', async () => {
			carol = await newPerson(browser, people.carol);
			await carol.page.setViewportSize(size(CLICK_AT));
			await choosePortrait(carol.page, portraits.carol);
			await askByAddress(carol.page, await contactAddressOf(page));
			const send = page.getByRole('button', { name: 'Share and ask for theirs' });
			await expect(send).toBeVisible({ timeout: 90000 });
			// her photo, as the small copy her request carries
			await expect(page.getByTestId('request-photo')).toBeVisible();
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
			const row = page.getByTestId('contact-row').filter({ hasText: people.bob.last });
			await expect(row).toBeVisible({ timeout: 30000 });
			await expect(
				page.getByTestId('contact-row').filter({ hasText: people.carol.last })
			).toBeVisible({ timeout: 30000 });
			await shoot(page, '12-contacts', 'Contacts, with contacts');
			await row.click();
			await expect(page.getByTestId('contact-page')).toBeVisible();
			await shoot(page, '13-contact-page', "A contact's page");
			await page.getByRole('button', { name: 'All contacts' }).click();
			await page.getByRole('button', { name: 'Add contact' }).click();
			// empty, a new card: Add, not Update (our own card once leaked in here)
			await expect(page.getByPlaceholder('Enter lastname...')).toHaveValue('');
			await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeVisible();
			await shoot(page, '14-add-contact', 'Adding a contact by hand');
		});

		await test.step('Scan a code: the camera, held up to an invitation', async () => {
			// a browser whose fake camera films Alice's invitation QR code: for 12 seconds half
			// of it, as while the phone is still being held up, then all of it
			const video = test.info().outputPath('invitation.y4m');
			writeFileSync(video, qrVideo(await invitationLink(page), { width: 960, height: 540, fps: 2, approach: 24, frames: 6 }));
			camera = await chromium.launch({
				args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${video}`]
			});
			const scanner = await (await camera.newContext({ viewport: size(CLICK_AT) })).newPage();
			await addVirtualAuthenticator(scanner);
			await scanner.goto(process.env.PAGE_URL);
			await createAddressBook(scanner, 'Scanner');
			await scanner.getByRole('link', { name: 'Exchange' }).click();
			await scanner.getByRole('button', { name: 'Scan a code' }).click();
			// the camera runs
			await expect.poll(() => scanner.locator('video').evaluate((element) => element.currentTime), { timeout: 30000 }).toBeGreaterThan(0.5);
			await shoot(scanner, '15-scan', 'Scan a code: the camera', { dialog: true });
			// and reads the code once it is all in the picture
			await expect.poll(() => scanner.evaluate(() => location.hash), { timeout: 60000, message: 'the invitation opened' }).toContain('/onboarding/');
		});
	} finally {
		writeIndex();
		await Promise.all([alice, bob, carol].filter(Boolean).map((person) => person.close()));
		await camera?.close();
	}
});

const size = ({ width, height }) => ({ width, height });

/** `locator` lies below Carbon's fixed header at every width (the header covers what is under it) */
async function clearOfHeader(page, locator, what) {
	for (const device of DEVICES) {
		await page.setViewportSize(size(device));
		await page.evaluate(() => window.scrollTo(0, 0));
		const header = await page.locator('header').first().boundingBox();
		const box = await locator.boundingBox();
		expect.soft(box?.y, `${what} at ${device.width} px under the header`).toBeGreaterThanOrEqual(header.y + header.height);
	}
	await page.setViewportSize(size(CLICK_AT));
}

/** our own card gets a made-up portrait: My card → Edit → Choose photo → Update */
async function choosePortrait(page, colours) {
	await editMyCard(page);
	const chooser = page.waitForEvent('filechooser');
	await page.getByRole('button', { name: 'Choose photo' }).click();
	await (await chooser).setFiles({ name: 'portrait.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(await madeUpPortrait(page, colours)) });
	await expect(page.getByTestId('form-photo')).toBeVisible();
	await page.getByRole('button', { name: 'Update' }).click();
	await expect(page.getByTestId('my-card-photo')).toBeVisible();
	// the notice goes after two seconds; the pictures show the card without it
	await expect(page.locator('.bx--toast-notification')).toHaveCount(0, { timeout: 10000 });
}

/** one of the four places (#110), through the navigation, at the width the tour clicks at */
async function openTab(page, name) {
	await page.setViewportSize(size(CLICK_AT));
	await page.getByRole('link', { name }).click();
	await expect(page.getByRole('link', { name })).toHaveAttribute('aria-current', 'page');
}

/**
 * The screen as shown now, at each width: the whole page, or only the window for a dialog.
 * Back at the width the tour clicks at afterwards. A page wider than the screen fails the
 * tour (#98), after the rest of it, and is marked in the index.
 */
async function shoot(page, screen, title, { dialog = false } = {}) {
	// the pointer out of the way: no row lit up, no tooltip
	await page.mouse.move(0, 0);
	for (const device of DEVICES) {
		await page.setViewportSize(size(device));
		// some parts lay out again after a resize (the navigation moves to the bottom on a phone)
		await page.waitForTimeout(400);
		const file = `${screen}-${device.width}.png`;
		await page.screenshot({
			path: path.join(OUT, file),
			fullPage: !dialog,
			animations: 'disabled'
		});
		const wide = await page.evaluate(() => document.documentElement.scrollWidth);
		const sideways = wide > device.width ? wide : undefined;
		shots.push({ screen, title, width: device.width, file, sideways });
		// soft: the tour goes on, so every screen that is too wide is named
		expect.soft(wide, `${screen} at ${device.width} px scrolls sideways`).toBeLessThanOrEqual(device.width);
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
