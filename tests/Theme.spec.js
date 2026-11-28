import { test, expect } from '@playwright/test';
import { newPerson } from './helpers/passkeys.js';
import { checkEveryWidth } from './helpers/axe.js';

// Light and dark (#110): the app follows the system's setting (prefers-color-scheme), from
// the first paint on and whenever it changes; Settings can name a look instead, which stays
// after a reload. The header has no theme switch any more.
// 1. The first screen follows the system, light and dark, and the system's change at once.
//    src/app.html sets the look before the app's own code runs (here it never does).
// The browser's bar (theme-color) has the header's colour: one per system setting, both the
// chosen look's colour once Settings names one.
// 2. Alice chooses Dark, then Light, then System again in Settings; the choice stays after a
//    reload, before the passkey unlocks anything. In German too.
// 3. The accent colour: Blue by default; Alice chooses Teal, then Purple, then Blue again.
//    Buttons and links take the colour in light and dark, the choice stays after a reload,
//    and axe finds nothing in either colour, light and dark, at every width.

const looks = {
	light: { theme: 'white', background: 'rgb(255, 255, 255)' },
	dark: { theme: 'g90', background: 'rgb(38, 38, 38)' }
};

/** the colours of the browser's bar: [for a light system, for a dark one] */
const bars = (page) =>
	page.evaluate(() =>
		['light', 'dark'].map((look) =>
			document
				.querySelector(`meta[name="theme-color"][media="(prefers-color-scheme: ${look})"]`)
				?.getAttribute('content')
		)
	);
const SYSTEM_BARS = ['#ffffff', '#262626'];

/** each accent's primary button, and its links in light and dark (lib/accent.css) */
const ACCENTS = {
	blue: { button: 'rgb(15, 98, 254)', link: { light: '#0f62fe', dark: '#78a9ff' } },
	teal: { button: 'rgb(0, 125, 121)', link: { light: '#007d79', dark: '#08bdba' } },
	purple: { button: 'rgb(138, 63, 252)', link: { light: '#8a3ffc', dark: '#be95ff' } }
};

/** the accent on screen: <html data-accent>, a primary button's colour, the links' colour */
async function expectAccent(page, accent, look) {
	await expect(page.locator('html')).toHaveAttribute('data-accent', accent);
	await expect(page.locator('.bx--btn--primary').first()).toHaveCSS(
		'background-color',
		ACCENTS[accent].button
	);
	const link = await page.evaluate(() =>
		getComputedStyle(document.documentElement)
			.getPropertyValue('--cds-link-primary')
			.trim()
			.toLowerCase()
	);
	expect(link, `the links of ${accent}, ${look}`).toBe(ACCENTS[accent].link[look]);
}

/** the look on screen: Carbon's theme on <html>, and the page's background */
async function expectLook(page, look) {
	await expect(page.locator('html')).toHaveAttribute('theme', looks[look].theme);
	await expect(page.locator('body')).toHaveCSS('background-color', looks[look].background);
	expect(await page.evaluate(() => document.documentElement.style.colorScheme)).toBe(look);
}

test("the first screen follows the system's setting, and its changes", async ({ browser }) => {
	for (const look of ['dark', 'light']) {
		const context = await browser.newContext({ colorScheme: look });
		try {
			const page = await context.newPage();
			await page.goto(process.env.PAGE_URL);
			await expect(page.getByTestId('passkey-gate')).toBeVisible();
			await expectLook(page, look);
			// the system turns the other way (a phone at night): the app with it, no reload
			const other = look === 'dark' ? 'light' : 'dark';
			await page.emulateMedia({ colorScheme: other });
			await expectLook(page, other);
			// nothing was chosen: no choice is stored, the bar follows the system
			expect(await page.evaluate(() => localStorage.getItem('decontact.theme'))).toBe(null);
			expect(await bars(page)).toEqual(SYSTEM_BARS);
			// the header names the app only: no theme switch in it
			await expect(page.locator('header').getByRole('switch')).toHaveCount(0);
			await expect(page.locator('header .bx--toggle-input')).toHaveCount(0);
		} finally {
			await context.close();
		}
	}
});

test('the look is set before the app runs: no white flash on a dark device', async ({
	browser
}) => {
	const context = await browser.newContext({ colorScheme: 'dark' });
	try {
		const page = await context.newPage();
		// only the page itself: none of the app's scripts or styles load
		await page.route('**/_app/**', (route) => route.abort());
		await page.goto(process.env.PAGE_URL);
		await expect(page.locator('html')).toHaveAttribute('theme', 'g90');
		expect(await page.evaluate(() => document.documentElement.style.colorScheme)).toBe('dark');
		expect(await bars(page)).toEqual(SYSTEM_BARS);
		// a choice kept here wins over the system's, the browser's bar included
		await page.evaluate(() => localStorage.setItem('decontact.theme', 'light'));
		await page.reload();
		await expect(page.locator('html')).toHaveAttribute('theme', 'white');
		expect(await bars(page)).toEqual(['#ffffff', '#ffffff']);
		// and the accent colour kept here; one the app does not know is Carbon's blue
		await expect(page.locator('html')).toHaveAttribute('data-accent', 'blue');
		await page.evaluate(() => localStorage.setItem('decontact.accent', 'purple'));
		await page.reload();
		await expect(page.locator('html')).toHaveAttribute('data-accent', 'purple');
		await page.evaluate(() => localStorage.setItem('decontact.accent', 'red'));
		await page.reload();
		await expect(page.locator('html')).toHaveAttribute('data-accent', 'blue');
	} finally {
		await context.close();
	}
});

test('Settings: Dark, Light or System, kept after a reload, in English and German', async ({
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
		// Playwright's browsers are light; the app follows
		await expectLook(page, 'light');
		await page.getByRole('link', { name: 'Settings' }).click();
		const group = page.getByRole('group', { name: 'Theme' });
		await expect(group).toBeVisible();
		await expect(group.getByRole('button', { name: 'System' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		await expect(page.getByTestId('theme-switch')).toContainText(
			'System: light or dark, as this device is set.'
		);

		await group.getByRole('button', { name: 'Dark' }).click();
		await expectLook(page, 'dark');
		await expect(group.getByRole('button', { name: 'Dark' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		await expect(group.getByRole('button', { name: 'System' })).toHaveAttribute(
			'aria-pressed',
			'false'
		);
		expect(await page.evaluate(() => localStorage.getItem('decontact.theme'))).toBe('dark');
		expect(await bars(page)).toEqual(['#262626', '#262626']);

		// kept: dark from the first paint on, the passkey screen included
		await page.reload();
		await expect(page.getByRole('button', { name: 'Unlock with passkey' })).toBeVisible();
		await expectLook(page, 'dark');
		expect(await bars(page)).toEqual(['#262626', '#262626']);
		await page.getByRole('button', { name: 'Unlock with passkey' }).click();
		await page.getByRole('link', { name: 'Settings' }).click();
		await expect(group.getByRole('button', { name: 'Dark' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);

		// a choice wins over the system's setting
		await page.emulateMedia({ colorScheme: 'dark' });
		await group.getByRole('button', { name: 'Light' }).click();
		await expectLook(page, 'light');
		expect(await bars(page)).toEqual(['#ffffff', '#ffffff']);

		// System again: the system's look, and its changes
		await group.getByRole('button', { name: 'System' }).click();
		await expectLook(page, 'dark');
		await page.emulateMedia({ colorScheme: 'light' });
		await expectLook(page, 'light');
		expect(await page.evaluate(() => localStorage.getItem('decontact.theme'))).toBe('system');
		expect(await bars(page)).toEqual(SYSTEM_BARS);

		// in German
		await page.getByTestId('language-de').click();
		const gruppe = page.getByRole('group', { name: 'Farbschema' });
		await expect(gruppe.getByRole('button')).toHaveText(['System', 'Hell', 'Dunkel']);
		await gruppe.getByRole('button', { name: 'Dunkel' }).click();
		await expectLook(page, 'dark');
		await page.getByTestId('language-en').click();
	} finally {
		await alice.close();
	}
});

test('Settings: the accent colour, Blue by default, Teal or Purple, in light and dark, kept after a reload', async ({
	browser
}) => {
	test.setTimeout(420000);
	const alice = await newPerson(browser, {
		first: 'Alice',
		last: 'Wolkenfabrik',
		city: 'Musterstadt'
	});
	const { page } = alice;
	try {
		await page.getByRole('link', { name: 'Settings' }).click();
		const group = page.getByRole('group', { name: 'Accent color' });
		await expect(group.getByRole('button')).toHaveText(['Blue', 'Teal', 'Purple']);
		await expect(group.getByRole('button', { name: 'Blue' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		await expect(page.getByTestId('accent-switch')).toContainText(
			'The color of buttons, links and marks.'
		);
		await expectAccent(page, 'blue', 'light');

		for (const accent of ['teal', 'purple']) {
			const name = accent === 'teal' ? 'Teal' : 'Purple';
			await group.getByRole('button', { name }).click();
			await expect(group.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true');
			await expect(group.getByRole('button', { name: 'Blue' })).toHaveAttribute(
				'aria-pressed',
				'false'
			);
			expect(await page.evaluate(() => localStorage.getItem('decontact.accent'))).toBe(accent);
			await expectAccent(page, accent, 'light');
			await page.emulateMedia({ colorScheme: 'dark' });
			await expectAccent(page, accent, 'dark');
			await page.emulateMedia({ colorScheme: 'light' });
			// contrast in this colour, light and dark, at every width: Settings and Exchange
			await checkEveryWidth(page, `Settings, ${accent}`);
			await page.getByRole('link', { name: 'Exchange' }).click();
			await checkEveryWidth(page, `Exchange, ${accent}`);
			await page.getByRole('link', { name: 'Settings' }).click();
		}

		// kept: purple from the first paint on, the passkey screen included
		await page.reload();
		await expect(page.getByRole('button', { name: 'Unlock with passkey' })).toBeVisible();
		await expectAccent(page, 'purple', 'light');
		await page.getByRole('button', { name: 'Unlock with passkey' }).click();
		await page.getByRole('link', { name: 'Settings' }).click();
		await expect(group.getByRole('button', { name: 'Purple' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);

		// in German, and back to Blue
		await page.getByTestId('language-de').click();
		const gruppe = page.getByRole('group', { name: 'Akzentfarbe' });
		await expect(gruppe.getByRole('button')).toHaveText(['Blau', 'Petrol', 'Violett']);
		await gruppe.getByRole('button', { name: 'Blau' }).click();
		await expectAccent(page, 'blue', 'light');
		expect(await page.evaluate(() => localStorage.getItem('decontact.accent'))).toBe('blue');
		await page.getByTestId('language-en').click();
	} finally {
		await alice.close();
	}
});
