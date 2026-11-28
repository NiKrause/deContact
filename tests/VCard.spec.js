import { test, expect } from './helpers/policy.js';
import { readFileSync } from 'node:fs';
import { contactAddressOf, newPerson } from './helpers/passkeys.js';
import { invitationLink, openLink } from './helpers/onboarding.js';

// Right after an invitation (#146):
// 1. Bob opens Alice's invitation link on a phone without deContact. Once her card is
//    there, "Save to my contacts (vCard)" gives a .vcf with her name, city and the way back
//    into deContact: her contact address on her device. Nothing else of her card goes in.
// 2. That link, opened later in deContact, puts Alice's contact address into Exchange's
//    paste field; nothing is sent until the person chooses Ask.
// 3. "Install deContact" opens Chrome's own install dialog where Chrome offered one, and is
//    gone once it was used. (Playwright's Chromium offers none: the test hands the page a
//    prompt as Chrome would.)

const people = {
	alice: { first: 'Alice', last: 'Wolkenfabrik', city: 'Musterstadt' },
	carol: { first: 'Carol', last: 'Beispiel', city: 'Beispielstadt' }
};

/** a vCard's content lines, unfolded, as [name with parameters, value] */
const parse = (text) =>
	text
		.replace(/\r\n /g, '')
		.split('\r\n')
		.filter(Boolean)
		.map((line) => [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 1)]);

test("Bob saves Alice's card as a vCard from the invitation, with the way back into deContact", async ({ browser }) => {
	test.setTimeout(300000);
	const alice = await newPerson(browser, people.alice);
	let bob;
	try {
		const link = await invitationLink(alice.page);
		bob = await openLink(browser, link);
		await expect(bob.page.getByTestId('inviter-card')).toHaveText(`${people.alice.first} ${people.alice.last} was added to your address book`, { timeout: 120000 });

		const [download] = await Promise.all([bob.page.waitForEvent('download'), bob.page.getByTestId('save-inviter-vcard').click()]);
		expect(download.suggestedFilename()).toBe('Alice-Wolkenfabrik.vcf');
		const text = readFileSync(await download.path(), 'utf8');
		const lines = parse(text);
		expect(lines[0]).toEqual(['BEGIN', 'VCARD']);
		expect(lines).toContainEqual(['FN', 'Alice Wolkenfabrik']);
		expect(lines).toContainEqual(['N', 'Wolkenfabrik;Alice;;;']);
		expect(lines.find(([name]) => name.startsWith('ADR'))?.[1]).toContain('Musterstadt');
		// the way back: the app, and Alice's contact address on the device that showed the code
		const peer = new URL(link.replace('#/onboarding/', 'onboarding/')).searchParams.get('peer');
		const back = `${process.env.PAGE_URL}#/?ask=${encodeURIComponent(`${alice.did}?peer=${peer}`)}`;
		expect(lines).toContainEqual(['URL', back]);
		expect(lines.find(([name]) => name === 'NOTE')?.[1]).toContain(back);
		// nothing of her book: no book address, no DID outside the link
		expect(text.replaceAll(encodeURIComponent(alice.did), '')).not.toContain('did:key');
		expect(text).not.toContain('/orbitdb/');
	} finally {
		await bob?.close();
		await alice.close();
	}
});

test("Install deContact opens Chrome's install dialog, once", async ({ browser }) => {
	test.setTimeout(180000);
	const alice = await newPerson(browser, people.alice);
	try {
		const { page } = alice;
		await page.getByRole('link', { name: 'Settings' }).click();
		// no prompt from the browser: no button
		await expect(page.getByTestId('settings-install')).toHaveCount(0);
		await page.evaluate(() => {
			const event = new Event('beforeinstallprompt', { cancelable: true });
			event.prompt = async () => {
				window.__installPrompted = (window.__installPrompted ?? 0) + 1;
			};
			event.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });
			window.dispatchEvent(event);
		});
		const offer = page.getByTestId('settings-install');
		await expect(offer).toBeVisible();
		await offer.getByRole('button', { name: 'Install deContact' }).click();
		await expect.poll(() => page.evaluate(() => window.__installPrompted)).toBe(1);
		// the prompt can be used once: the button goes until Chrome offers again
		await expect(offer).toHaveCount(0);
	} finally {
		await alice.close();
	}
});

test("the vCard's link back fills Exchange's paste field, and asks nobody by itself", async ({ browser }) => {
	test.setTimeout(240000);
	const alice = await newPerson(browser, people.alice);
	const carol = await newPerson(browser, people.carol);
	try {
		const address = await contactAddressOf(alice.page);
		const { page } = carol;
		// as a phone opens the link from its address book: a fresh load of the app
		await page.goto('about:blank');
		await page.goto(`${process.env.PAGE_URL}#/?ask=${encodeURIComponent(address)}`);
		await page.getByRole('button', { name: 'Unlock with passkey' }).click();
		await expect(page.getByTestId('scan-field')).toHaveValue(address, { timeout: 60000 });
		expect(await page.evaluate(() => location.hash)).toBe('#/');
		await expect(page.getByRole('button', { name: 'Ask', exact: true })).toBeEnabled();
		// no request went out: Alice is not asked
		await page.waitForTimeout(3000);
		expect(alice.saw(carol.did)).toBe(false);
	} finally {
		await carol.close();
		await alice.close();
	}
});
