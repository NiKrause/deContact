import { test, expect } from '@playwright/test';
import { newPerson } from './helpers/passkeys.js';
import { DEVICES, size } from './helpers/devices.js';

// Where things are at each device of #110 (helpers/devices.js):
// - a phone (the closed Fold, the A57): the navigation at the bottom, the places the
//   screen's width with a 16 px gutter, Contacts one pane at a time;
// - the open Fold (wide like a tablet, held like a phone): the navigation at the bottom,
//   under the thumbs; Exchange, My card and Settings a column in the middle; Contacts the
//   list and the contact's page side by side; Exchange's two buttons at the bottom;
// - a desktop: the rail on the left, a column beside it, Contacts in two panes.

/** one of the four places, once the navigation marks it and its layout is there */
async function openPlace(page, name) {
	await page.getByRole('link', { name }).click();
	await expect(page.getByRole('link', { name })).toHaveAttribute('aria-current', 'page');
	await page.waitForTimeout(200);
}

const kind = (device) =>
	device.width >= 1056 ? 'desktop' : device.width >= 840 ? 'fold' : 'phone';

test('the places at every device width: navigation, column, and Contacts in panes', async ({
	browser
}) => {
	test.setTimeout(240000);
	const alice = await newPerson(browser, {
		first: 'Alice',
		last: 'Wolkenfabrik',
		city: 'Musterstadt'
	});
	const { page } = alice;
	try {
		await page.getByRole('link', { name: 'Contacts' }).click();
		await page.getByRole('button', { name: 'Add contact' }).click();
		await page.getByPlaceholder('Enter firstname...').fill('Bob');
		await page.getByPlaceholder('Enter lastname...').fill('Stromwerk');
		await page.getByRole('button', { name: 'Save', exact: true }).click();
		await page.getByTestId('contact-row').filter({ hasText: 'Stromwerk' }).click();

		for (const device of DEVICES) {
			await page.setViewportSize(size(device));
			await page.waitForTimeout(300);
			const what = `${device.name} (${device.width} px)`;
			const nav = await page.getByTestId('main-nav').boundingBox();
			if (kind(device) === 'desktop') {
				expect(nav.x, `${what}: the rail on the left`).toBe(0);
				expect(nav.height, `${what}: the rail runs down`).toBeGreaterThan(nav.width);
			} else {
				expect(nav.y + nav.height, `${what}: the navigation at the bottom`).toBeGreaterThanOrEqual(
					device.height - 2
				);
				expect(nav.width, `${what}: across the screen`).toBe(device.width);
			}

			// Contacts: two panes from the open Fold on
			await openPlace(page, 'Contacts');
			const list = page.getByTestId('contacts-list-pane');
			const pane = page.getByTestId('contacts-contact-pane');
			await expect(pane).toBeVisible();
			if (kind(device) === 'phone') {
				await expect(list, `${what}: one pane`).toBeHidden();
			} else {
				await expect(list, `${what}: the list beside the page`).toBeVisible();
				const left = await list.boundingBox();
				const right = await pane.boundingBox();
				expect(left.x + left.width, `${what}: side by side`).toBeLessThanOrEqual(right.x);
			}

			// the other places: a column, in the middle of the open Fold
			for (const name of ['Exchange', 'My business card', 'Settings']) {
				await openPlace(page, name);
				const place = await page.locator('main.place').boundingBox();
				if (kind(device) === 'phone') {
					expect(Math.round(place.x), `${what}, ${name}: 16 px from the edge`).toBe(16);
				} else if (kind(device) === 'fold') {
					expect(place.width, `${what}, ${name}: a column`).toBeLessThanOrEqual(704);
					expect(
						Math.abs(place.x + place.width / 2 - device.width / 2),
						`${what}, ${name}: in the middle`
					).toBeLessThanOrEqual(2);
				} else {
					expect(place.width, `${what}, ${name}: a column`).toBeLessThanOrEqual(992);
				}
				// the version line below starts where the place does
				const info = await page.getByTestId('app-info').boundingBox();
				expect(Math.round(info.x), `${what}, ${name}: the version line flush with the place`).toBe(
					Math.round(place.x)
				);
			}

			// Exchange: the two buttons at the bottom, under the thumb, on the phone and the Fold
			await openPlace(page, 'Exchange');
			const show = await page.getByRole('button', { name: 'Show my code' }).boundingBox();
			if (kind(device) !== 'desktop') {
				expect(show.y, `${what}: Show my code in the lower half`).toBeGreaterThan(
					device.height / 2
				);
				expect(show.y + show.height, `${what}: above the navigation`).toBeLessThanOrEqual(nav.y);
			}
		}
	} finally {
		await alice.close();
	}
});
