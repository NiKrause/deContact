import { test, expect } from './helpers/policy.js';
import { writeFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { askByAddress, contactAddressOf, newPerson } from './helpers/passkeys.js';
import {
	QR_SUMMARY,
	answerRequests,
	fillOnboardingCard,
	names,
	openLink,
	times
} from './helpers/onboarding.js';
import { DEVICES, LOOKS, size } from './helpers/devices.js';

// What the person who shows the code learns (link-outcomes.js, ExchangeNotices.svelte):
// 1. Alice shows her code and keeps it open; Bob opens the link. Once her card is in his book
//    the dialog closes by itself, the focus is back on "Show my code", the phone vibrates,
//    and a notice names Bob. His card follows: a second notice links to it.
// 2. Only the code's own token closes the dialog: not the token of a code issued before
//    another option was chosen, not a link somebody else used already. The new code's token
//    does; and with "Let them ask first" the request dialog takes over.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
/** the width the test clicks at: a desktop's, with the places in a rail */
const CLICK_AT = DEVICES.at(-1);

const people = {
	alice: { first: 'Alice', last: 'Wolkenfabrik', city: 'Musterstadt' },
	bob: { first: 'Bob', last: 'Stromwerk', email: 'bob@example.com' },
	carol: { first: 'Carol', last: 'Beispiel', email: 'carol@example.com' },
	dave: { email: 'dave@example.com' }
};
const fullName = (person) => `${person.first} ${person.last}`;

const qrCode = (page) => page.locator('img.qrcode');
const notice = (page, kind) => page.getByTestId(`exchange-notice-${kind}`);
const showCodeButton = (page) => page.getByRole('button', { name: 'Show my code' });
const twoWayOption = (page) =>
	page.getByRole('checkbox', { name: 'Also ask for their contact details' });

/** Exchange → Show my code, left open: the invitation link the code shows once it is signed */
async function showCode(page) {
	await page.getByRole('link', { name: 'Exchange' }).click();
	await showCodeButton(page).click();
	await expect(page.getByRole('radio', { name: 'Share right away' })).toBeChecked();
	await expect(qrCode(page)).toHaveAttribute('alt', /onBoardingToken=/, { timeout: 60000 });
	await expect(twoWayOption(page)).toBeChecked();
	return qrCode(page).getAttribute('alt');
}

/** "Also ask for their contact details" off, in the dialog already open: a new code, with a new token */
async function issueAgainOneWay(page) {
	const before = await qrCode(page).getAttribute('alt');
	await page.getByText('Also ask for their contact details', { exact: true }).click();
	await expect(twoWayOption(page)).not.toBeChecked();
	await expect(qrCode(page)).not.toHaveAttribute('alt', before);
	await expect(qrCode(page)).toHaveAttribute('alt', /onBoardingToken=/);
	return qrCode(page).getAttribute('alt');
}

/** everybody's console in this test: attached when it fails */
const consoles = [];
test.afterEach(async ({}, testInfo) => {
	if (testInfo.status !== testInfo.expectedStatus) {
		for (const { name, lines } of consoles) {
			const file = testInfo.outputPath(`${name}-console.txt`);
			writeFileSync(file, lines.join('\n'));
			await testInfo.attach(`${name} console`, { path: file, contentType: 'text/plain' });
		}
	}
	consoles.length = 0;
});

/** each call of navigator.vibrate from now on, kept in the page */
function recordVibrations(page) {
	return page.evaluate(() => {
		window.__vibrations = [];
		navigator.vibrate = (pattern) => {
			window.__vibrations.push(pattern);
			return true;
		};
	});
}
const vibrations = (page) => page.evaluate(() => window.__vibrations);

/** what axe finds in the notices, as "rule (impact): where" */
async function axeOnNotices(page) {
	const { violations } = await new AxeBuilder({ page })
		.include('[data-testid="exchange-notices"]')
		.withTags(WCAG)
		.analyze();
	return violations.map(
		(violation) =>
			`${violation.id} (${violation.impact}): ${violation.nodes.map((node) => node.target.join(' ')).join(' | ')}`
	);
}

test("the code closes by itself once Bob has Alice's card, names him, and his card follows", async ({
	browser
}) => {
	test.setTimeout(420000);
	const alice = await newPerson(browser, people.alice);
	consoles.push({ name: 'Alice', lines: alice.lines });
	let bob;
	try {
		const { page } = alice;
		await recordVibrations(page);
		const link = await showCode(page);

		await test.step("Bob opens the link and shares while Alice's app is not answering yet", async () => {
			// so that his request carries his name: one sent before he typed it carries none
			await answerRequests(page, false);
			bob = await openLink(browser, link);
			consoles.push({ name: 'Bob', lines: bob.lines });
			await fillOnboardingCard(bob.page, people.bob);
			await bob.page.getByRole('button', { name: 'Save and share', exact: true }).click();
			await expect(bob.page.getByRole('link', { name: 'Contacts' })).toBeVisible();
			await expect
				.poll(
					() => bob.saw(`could not deliver the request of the invitation link to ${alice.did}`),
					{ timeout: 120000 }
				)
				.toBe(true);
			// nothing has reached Alice: the code stays
			await expect(qrCode(page)).toBeVisible();
			await expect(notice(page, 'given')).toHaveCount(0);
		});

		await test.step('her app answers: the dialog closes, the focus is back, the notice names Bob', async () => {
			await answerRequests(page, true);
			await expect
				.poll(() => alice.saw(`${bob.did} has our card: the code did its job`), { timeout: 120000 })
				.toBe(true);
			await expect(page.getByRole('heading', { name: 'Share your contact' })).toBeHidden();
			await expect(showCodeButton(page)).toBeFocused();
			const given = notice(page, 'given');
			await expect(given).toContainText(`${fullName(people.bob)} has your business card`);
			// in the live region that was there before it
			await expect(page.getByTestId('exchange-notices')).toHaveAttribute('role', 'status');
			// it goes after 8 seconds: axe at once, at this width
			expect.soft(await axeOnNotices(page), 'the first notice').toEqual([]);
			expect((await vibrations(page))[0]).toBe(200);
			// its resends are taken again, without a second notice
			expect(await notice(page, 'given').count()).toBe(1);
		});

		await test.step('his card arrives: a second notice links to it', async () => {
			const complete = notice(page, 'complete');
			await expect(complete).toContainText(
				`${fullName(people.bob)}'s business card is in your contacts`,
				{ timeout: 120000 }
			);
			expect(await names(page)).toContain(fullName(people.bob));
			expect(alice.saw(`the card of ${bob.did} arrived: the exchange is complete`)).toBe(true);
			expect(await vibrations(page)).toEqual([200, [100, 80, 100]]);
			// nothing to wait for on Exchange any more
			await expect(page.getByTestId('card-given')).toHaveCount(0);
			// the first notice goes by itself, this one stays
			await expect(notice(page, 'given')).toHaveCount(0, { timeout: 20000 });
			await expect(complete).toBeVisible();
			for (const look of LOOKS) {
				await page.emulateMedia({ colorScheme: look });
				for (const device of DEVICES) {
					await page.setViewportSize(size(device));
					await page.waitForTimeout(300);
					expect
						.soft(await axeOnNotices(page), `the second notice, ${device.width} px, ${look}`)
						.toEqual([]);
					// on a phone across the screen, never past its edge
					const box = await complete.boundingBox();
					expect
						.soft(box.x + box.width, `the notice at ${device.width} px`)
						.toBeLessThanOrEqual(device.width);
				}
			}
			await page.emulateMedia({ colorScheme: 'light' });
			await page.setViewportSize(size(CLICK_AT));
			await complete.getByRole('link', { name: 'Open their card' }).click();
			await expect(page.getByTestId('contact-name')).toContainText(fullName(people.bob));
			await expect(complete).toHaveCount(0);
		});
	} finally {
		await Promise.all([alice, bob].filter(Boolean).map((person) => person.close()));
	}
});

test('only the code on screen closes the dialog: not one issued before, not a used link', async ({
	browser
}) => {
	test.setTimeout(600000);
	const alice = await newPerson(browser, people.alice);
	consoles.push({ name: 'Alice', lines: alice.lines });
	let bob, carol, dave;
	try {
		const { page } = alice;
		const first = await showCode(page);

		await test.step('"This code is for" has its select, on screen at every width, light and dark', async () => {
			const select = page.getByLabel('This code is for');
			// the reference devices, and a phone with the browser's bars taking a third of its height
			for (const device of [...DEVICES, { width: 360, height: 560 }]) {
				for (const look of LOOKS) {
					await page.emulateMedia({ colorScheme: look });
					await page.setViewportSize(size(device));
					await page.waitForTimeout(200);
					await select.scrollIntoViewIfNeeded();
					const where = `${device.width}×${device.height}, ${look}`;
					await expect.soft(select, where).toBeInViewport({ ratio: 1 });
					const { box, text, field, dialog } = await select.evaluate((element) => {
						const style = getComputedStyle(element);
						const container = element.closest('.bx--modal-container');
						return {
							box: element.getBoundingClientRect().height,
							text: style.color,
							field: style.backgroundColor,
							dialog: getComputedStyle(container).backgroundColor
						};
					});
					expect.soft(box, where).toBeGreaterThanOrEqual(32);
					// the field stands out from the dialog, and its words from the field
					expect.soft(field, where).not.toBe(dialog);
					expect.soft(text, where).not.toBe(field);
				}
			}
			await page.emulateMedia({ colorScheme: 'light' });
			await page.setViewportSize(size(CLICK_AT));
		});
		// another option: a new code, with a new token
		const second = await issueAgainOneWay(page);
		expect(second).not.toBe(first);

		await test.step("Dave opens the first code: he has Alice's card, the new code stays", async () => {
			dave = await openLink(browser, first);
			consoles.push({ name: 'Dave', lines: dave.lines });
			await expect
				.poll(() => alice.saw(`${dave.did} has our card: the code did its job`), {
					timeout: 120000
				})
				.toBe(true);
			// his app asked before he typed: no name yet
			await expect(notice(page, 'given')).toContainText('Your business card was received');
			await page.waitForTimeout(2000);
			await expect(qrCode(page)).toHaveAttribute('alt', second);
			await expect(page.getByRole('heading', { name: 'Share your contact' })).toBeVisible();
		});

		await test.step('Carol opens the first code too: Alice is asked, and the code stays', async () => {
			carol = await openLink(browser, first);
			consoles.push({ name: 'Carol', lines: carol.lines });
			await expect
				.poll(
					() => alice.saw(`rejected the invitation link of ${carol.did}: it was already used`),
					{ timeout: 120000 }
				)
				.toBe(true);
			const request = page.getByTestId('request-dialog');
			await expect(request).toBeVisible({ timeout: 30000 });
			await expect(qrCode(page)).toHaveAttribute('alt', second);
			await request.getByRole('button', { name: 'Decline' }).click();
			await expect(request).toHaveCount(0);
			await expect(qrCode(page)).toBeVisible();
		});

		await test.step('Bob opens the code on screen: it closes', async () => {
			bob = await openLink(browser, second);
			consoles.push({ name: 'Bob', lines: bob.lines });
			await expect(page.getByRole('heading', { name: 'Share your contact' })).toBeHidden({
				timeout: 120000
			});
			await expect(showCodeButton(page)).toBeFocused();
			// Dave's code allowed a two-way exchange and he has not shared: Exchange says so
			await expect(page.getByTestId('card-given')).toHaveText(
				'Your business card was received. The person can send you theirs.'
			);
		});

		await test.step('Let them ask first: the request dialog takes over from the code', async () => {
			await fillOnboardingCard(bob.page, people.bob);
			await bob.page.getByRole('button', { name: 'Save', exact: true }).click();
			await expect(bob.page.getByRole('link', { name: 'Contacts' })).toBeVisible({
				timeout: 60000
			});
			await showCodeButton(page).click();
			await page.getByText('Let them ask first', { exact: true }).click();
			await expect(page.getByTestId('qr-summary')).toHaveText(QR_SUMMARY.ask);
			const address = await contactAddressOf(page);
			const request = page.getByTestId('request-dialog');
			// Bob has her card already: no placeholder, so his app does not resend a request
			// that did not get through (startInvitationCheckWorker); he asks again
			const notDelivered = `could not deliver the request to ${alice.did}`;
			for (let attempt = 1; attempt <= 3; attempt++) {
				const failed = times(bob, notDelivered);
				await askByAddress(bob.page, address);
				await expect
					.poll(async () => (await request.isVisible()) || times(bob, notDelivered) > failed, {
						timeout: 90000
					})
					.toBe(true);
				if (await request.isVisible()) break;
			}
			await expect(request).toBeVisible();
			await expect(page.getByRole('heading', { name: 'Share your contact' })).toBeHidden();
			await request.getByRole('button', { name: 'Decline' }).click();
			await expect(request).toHaveCount(0);
			await expect(showCodeButton(page)).toBeFocused();
		});
	} finally {
		await Promise.all([alice, bob, carol, dave].filter(Boolean).map((person) => person.close()));
	}
});
