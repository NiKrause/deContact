// What axe-core finds on a screen as shown now (#107, #110): the rules of WCAG 2.1 A and AA,
// at the width of each device of #110, light and dark (the system's setting, which the app
// follows at once). Soft: every finding is listed, as "rule (impact): where", and fails the
// test at its end. Back at a desktop's width, light, afterwards.
import { expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { DEVICES, LOOKS, size } from './devices.js';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} screen named in each finding
 */
export async function checkEveryWidth(page, screen) {
	for (const look of LOOKS) {
		await page.emulateMedia({ colorScheme: look });
		await expect(page.locator('html')).toHaveAttribute('theme', look === 'dark' ? 'g90' : 'white');
		for (const device of DEVICES) {
			await page.setViewportSize(size(device));
			// some parts lay out again after a resize (the navigation moves to the bottom on a phone)
			await page.waitForTimeout(300);
			const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
			const found = violations.map(
				(violation) =>
					`${violation.id} (${violation.impact}): ${violation.nodes.map((node) => node.target.join(' ')).join(' | ')}`
			);
			expect.soft(found, `${screen}, ${device.width} px, ${look}`).toEqual([]);
		}
	}
	await page.emulateMedia({ colorScheme: 'light' });
	await page.setViewportSize(size(DEVICES.at(-1)));
}
