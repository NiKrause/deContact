import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { newPerson } from './helpers/passkeys.js';
import { DEVICES, size } from './helpers/devices.js';

// Contacts on the open Fold and a desktop (#110): the list on the left, the contact's page
// beside it. On a phone one of them at a time, as before: the list, or the page with
// "All contacts" above it.
// 1. Alice adds Bob and Carol by hand. On a desktop the pane beside the list says to choose
//    one; a tap opens Bob beside the list, marked in it, then Carol instead.
// 2. My card and back: Carol is still open, not Alice's own card (My card puts it into the
//    same form meanwhile).
// 3. On the open Fold the two panes too; on a phone only Carol's page, "All contacts" goes
//    back to the list.
// 4. axe at every width, in English and German, with a contact open and without.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const DESKTOP = DEVICES.at(-1);
/** where the list is beside the page: from the open Fold on, 52.5rem */
const twoPanes = (device) => device.width >= 840;

/** a contact added by hand: Contacts → Add contact → Save */
async function addByHand(page, first, last) {
	await page.getByRole('button', { name: 'Add contact' }).click();
	await page.getByPlaceholder('Enter firstname...').fill(first);
	await page.getByPlaceholder('Enter lastname...').fill(last);
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByTestId('contact-row').filter({ hasText: last })).toBeVisible();
}

/** what axe finds on the screen as shown now, at every width: "rule (impact): where" */
async function checkEveryWidth(page, screen) {
	for (const device of DEVICES) {
		await page.setViewportSize(size(device));
		await page.waitForTimeout(300);
		const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
		const found = violations.map(
			(violation) =>
				`${violation.id} (${violation.impact}): ${violation.nodes.map((node) => node.target.join(' ')).join(' | ')}`
		);
		expect.soft(found, `${screen}, ${device.width} px`).toEqual([]);
	}
	await page.setViewportSize(size(DESKTOP));
}

test('Contacts: the list and a contact side by side on the open Fold and a desktop, one at a time on a phone', async ({
	browser
}) => {
	test.setTimeout(300000);
	const alice = await newPerson(browser, {
		first: 'Alice',
		last: 'Wolkenfabrik',
		city: 'Musterstadt'
	});
	const { page } = alice;
	const list = page.getByTestId('contacts-list-pane');
	const pane = page.getByTestId('contacts-contact-pane');
	const row = (last) => page.getByTestId('contact-row').filter({ hasText: last });
	const back = page.getByRole('button', { name: 'All contacts' });
	try {
		await page.setViewportSize(size(DESKTOP));
		await page.getByRole('link', { name: 'Contacts' }).click();
		// no contacts yet: nothing to choose beside the list
		await expect(page.getByTestId('contacts-empty')).toBeVisible();
		await expect(page.getByTestId('contacts-choose')).toHaveCount(0);

		await test.step('a desktop: the list on the left, a contact beside it', async () => {
			await addByHand(page, 'Bob', 'Stromwerk');
			await addByHand(page, 'Carol', 'Beispiel');
			await expect(page.getByTestId('contacts-choose')).toHaveText(
				'Choose a contact on the left to see their business card.'
			);
			await row('Stromwerk').click();
			await expect(page.getByPlaceholder('Enter lastname...')).toHaveValue('Stromwerk');
			await expect(list).toBeVisible();
			await expect(row('Stromwerk')).toHaveAttribute('aria-current', 'true');
			// side by side, from the same height on
			const left = await list.boundingBox();
			const right = await pane.boundingBox();
			expect(left.x + left.width, 'the list ends before the page starts').toBeLessThanOrEqual(
				right.x
			);
			expect(Math.abs(left.y - right.y), 'the panes start level').toBeLessThanOrEqual(8);
			// the list is beside the page: no way back to it needed
			await expect(back).toBeHidden();

			await row('Beispiel').click();
			await expect(page.getByPlaceholder('Enter lastname...')).toHaveValue('Beispiel');
			await expect(row('Beispiel')).toHaveAttribute('aria-current', 'true');
			await expect(row('Stromwerk')).not.toHaveAttribute('aria-current', 'true');
			await checkEveryWidth(page, 'Contacts with Carol open (en)');
		});

		await test.step('My card and back: still Carol, not our own card', async () => {
			await page.getByRole('link', { name: 'My business card' }).click();
			await expect(page.getByTestId('my-card-name')).toHaveText('Alice Wolkenfabrik');
			await page.getByRole('link', { name: 'Contacts' }).click();
			await expect(page.getByPlaceholder('Enter firstname...')).toHaveValue('Carol');
			await expect(page.getByPlaceholder('Enter lastname...')).toHaveValue('Beispiel');
		});

		await test.step('the open Fold: side by side too; a phone: one at a time', async () => {
			for (const device of DEVICES.filter((it) => twoPanes(it))) {
				await page.setViewportSize(size(device));
				await expect(list, `${device.width} px: the list`).toBeVisible();
				await expect(pane, `${device.width} px: the page beside it`).toBeVisible();
				await expect(back).toBeHidden();
			}
			for (const device of DEVICES.filter((it) => !twoPanes(it))) {
				await page.setViewportSize(size(device));
				await expect(pane, `${device.width} px: the page`).toBeVisible();
				await expect(list, `${device.width} px: not the list`).toBeHidden();
				await expect(back).toBeVisible();
			}
			await back.click();
			await expect(list).toBeVisible();
			await expect(pane).toBeHidden();
			await expect(row('Beispiel')).not.toHaveAttribute('aria-current', 'true');
			await page.setViewportSize(size(DESKTOP));
			// nothing open: the pane beside the list says what to do
			await expect(page.getByTestId('contacts-choose')).toBeVisible();
			await checkEveryWidth(page, 'Contacts, nothing open (en)');
		});

		await test.step('in German', async () => {
			await page.getByRole('link', { name: 'Settings' }).click();
			await page.getByTestId('language-de').click();
			await page.getByRole('link', { name: 'Kontakte' }).click();
			await expect(page.getByTestId('contacts-choose')).toHaveText(
				'Wähle links einen Kontakt, um die Visitenkarte zu sehen.'
			);
			await checkEveryWidth(page, 'Contacts, nothing open (de)');
			await row('Stromwerk').click();
			await expect(page.getByPlaceholder('Nachname eingeben …')).toHaveValue('Stromwerk');
			await checkEveryWidth(page, 'Contacts with Bob open (de)');
			await page.getByRole('link', { name: 'Einstellungen' }).click();
			await page.getByTestId('language-en').click();
		});
	} finally {
		await alice.close();
	}
});
