import { test, expect } from './helpers/policy.js';
import {
	addVirtualAuthenticator,
	continuePasskeyStep,
	didOf,
	names,
	newPerson,
	recordCeremonies,
	takeCeremonies
} from './helpers/passkeys.js';

// Two devices of one person (#60). Device A makes the address book with its passkey and
// sets up the recovery words. Device B, whose passkey does not sync, opens A's device
// link, unlocks with the words, adds a passkey of its own and from then on writes as the
// same DID: what it writes arrives on A, and A's card on B.

const alice = { first: 'Alice', last: 'Wolkenfabrik', city: 'Musterstadt' };

test('a second device with a passkey of its own writes as the same DID', async ({ browser }) => {
	test.setTimeout(300000);
	const a = await newPerson(browser, alice);
	const context = await browser.newContext();
	try {
		let words;
		let link;
		await test.step('device A: recovery words and a device link', async () => {
			await a.page.getByRole('link', { name: 'Settings' }).click();
			await a.page.getByRole('button', { name: 'Set up recovery words' }).click();
			words = await a.page.getByTestId('recovery-words').locator('ol li').allTextContents();
			expect(words).toHaveLength(24);
			await a.page.getByLabel('I have written the words down').check();
			await a.page.getByRole('button', { name: 'Keep these recovery words' }).click();
			await expect(a.page.getByTestId('vault-slot')).toHaveCount(2);
			await expect(a.page.getByTestId('vault-slot').last()).toContainText('Recovery words');
			// the words are not kept anywhere
			const stored = await a.page.evaluate(() => JSON.stringify({ ...localStorage }));
			expect(stored).not.toContain(words.slice(0, 3).join(' '));
			await a.page.getByRole('button', { name: 'Link another device' }).click();
			link = await a.page.getByTestId('device-link').inputValue();
			expect(link).toContain('#/link?vault=');
		});

		const page = await context.newPage();
		const lines = [];
		page.on('console', (message) => lines.push(message.text()));
		await addVirtualAuthenticator(page);
		await recordCeremonies(page);

		await test.step('device B: the link and the words open the vault', async () => {
			await page.goto(link);
			await expect(page.getByTestId('vault-handed-over')).toBeVisible();
			// the record left the address bar
			expect(page.url()).not.toContain('vault=');
			await page.getByRole('button', { name: 'Restore with recovery words' }).click();
			await page.getByLabel('Your 24 recovery words').fill(words.map((word, i) => `${i + 1}. ${word}`).join('\n'));
			await page.getByRole('button', { name: 'Open with recovery words' }).click();
			expect(await didOf(page)).toBe(a.did);
			expect(await takeCeremonies(page)).toEqual([]);
		});

		await test.step('device B: a passkey of its own', async () => {
			await page.getByRole('link', { name: 'Settings' }).click();
			await page.getByLabel('Name of the new passkey (optional)').fill('Device B');
			await page.getByRole('button', { name: 'Add a passkey' }).click();
			await continuePasskeyStep(page);
			await expect(page.getByTestId('vault-slot')).toHaveCount(3);
			expect(await takeCeremonies(page)).toEqual([
				['create', true, 0],
				['get', true, 1]
			]);
		});

		await test.step('device B unlocks with its passkey as the same DID', async () => {
			await page.reload();
			await page.getByRole('button', { name: 'Unlock with passkey' }).click();
			expect(await didOf(page)).toBe(a.did);
			// one prompt, open to the two passkeys the vault knows
			expect(await takeCeremonies(page)).toEqual([['get', true, 2]]);
		});

		await test.step('what device B writes arrives on device A, and A\'s card on B', async () => {
			await expect.poll(() => names(page), { timeout: 90000, message: "A's card on B" }).toContain(`${alice.first} ${alice.last}`);
			await page.evaluate(() =>
				window.mydb.put({ _id: 'written-on-b', owner: window.orbitdb.identity.id, firstName: 'Written', lastName: 'on device B' })
			);
			await expect.poll(() => names(a.page), { timeout: 90000, message: "B's entry on A" }).toContain('Written on device B');
		});
	} finally {
		await Promise.all([a.close(), context.close()]);
	}
});
