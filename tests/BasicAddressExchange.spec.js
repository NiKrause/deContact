import { test, expect } from '@playwright/test';
import { addVirtualAuthenticator, contactAddressOf, createAddressBook, askByAddress } from './helpers/passkeys.js';
/** the console of both pages */
const lines = [];

test.describe('Simple exchange of address between Alice and Bob', async () => {
	let pageAlice, pageBob;

	test.beforeAll(async ({ browser }) => {
		// two pages, each waiting until OrbitDB shows its DID
		test.setTimeout(90000);
		pageAlice = await initializeNewPage(browser, users[0]);
		pageBob = await initializeNewPage(browser, users[1]);
	});

	test('Alice and Bob can exchange addresses', async () => {
		// the request goes to Alice's device, peer to peer: directly when pubsub peer discovery
		// announced her (every 10 s), else through the relay; resent after 10 s, 20 s, ...
		test.setTimeout(240000);

		// the header's peer status, as a screen reader reads it
		await expect(pageAlice.getByTestId('peers'), 'connection Alice').toContainText('Swarm connected', { timeout: 15000 });
		await expect(pageBob.getByTestId('peers'), 'connection Bob').toContainText('Swarm connected');

		await askByAddress(pageBob, await contactAddressOf(pageAlice));


		const button = pageAlice.getByRole('button', { name: 'Share and ask for theirs' })
		await expect(button, "Exchange of Alice's contact information was successful").toBeEnabled({ timeout: 60000 }); //TODO what is that?
		await button.click();

		const button2 = pageBob.getByRole('button', { name: 'Share mine' })
		await expect(button2, "Exchange of Bobs's contact information was successful").toBeEnabled({ timeout: 60000 });
		await button2.click();

		// the exchange is done once each book holds the other's card: only then can an update reach it
		await expect.poll(() => cardOf(pageAlice, users[1].did), { timeout: 90000, message: "Bob's card in Alice's book" })
			.toMatchObject({ lastName: users[1].lastname });
		await expect.poll(() => cardOf(pageBob, users[0].did), { timeout: 90000, message: "Alice's card in Bob's book" })
			.toMatchObject({ lastName: users[0].lastname });


		//await pageAlice.getByRole('button', { name: 'Cancel' }).click();
	});

	test('Bob updates his address and Alice receives the update', async () => {
		test.setTimeout(180000);

		// his own card: under My Address, not in his list (#110)
		await pageBob.getByRole('link', { name: 'My card' }).click();
		await expect(pageBob.getByPlaceholder('Enter lastname...')).toHaveValue(users[1].lastname);
		await pageBob.getByPlaceholder('Enter lastname...').click();
		await pageBob.getByPlaceholder('Enter lastname...').fill(users[2].lastname);
		await pageBob.getByPlaceholder('Enter street...').click();
		await pageBob.getByPlaceholder('Enter street...').fill(users[2].street);
		await pageBob.getByPlaceholder('Enter zipcode...').click();
		await pageBob.getByPlaceholder('Enter zipcode...').fill(users[2].zipcode);
		await pageBob.getByPlaceholder('Enter city...').click();
		await pageBob.getByPlaceholder('Enter city...').fill(users[2].city);
		await pageBob.getByPlaceholder('Enter country...').fill(users[2].country);
		await pageBob.getByRole('button', { name: 'Update' }).click();
		// in Alice's book and in her list, without a reload
		await expect.poll(() => cardOf(pageAlice, users[1].did), { timeout: 90000, message: "Bob's update in Alice's book" })
			.toMatchObject({ lastName: users[2].lastname, street: users[2].street, city: users[2].city });
		await pageAlice.getByRole('link', { name: 'Contacts' }).click();
		await expect(pageAlice.getByRole('row', { name: new RegExp(users[2].lastname) })).toBeVisible({ timeout: 30000 });
	});

	test('Alice updates her address and Bob receives the update', async () => {
		test.setTimeout(180000);
		await pageAlice.getByRole('link', { name: 'My card' }).click();
		await expect(pageAlice.getByPlaceholder('Enter lastname...')).toHaveValue(users[0].lastname);
		await pageAlice.getByPlaceholder('Enter lastname...').fill(users[3].lastname);
		await pageAlice.getByPlaceholder('Enter street...').fill(users[3].street);
		await pageAlice.getByPlaceholder('Enter zipcode...').fill(users[3].zipcode);
		await pageAlice.getByPlaceholder('Enter city...').fill(users[3].city);
		await pageAlice.getByPlaceholder('Enter country...').fill(users[3].country);
		await pageAlice.getByRole('button', { name: 'Update' }).click();
		await expect.poll(() => cardOf(pageBob, users[0].did), { timeout: 90000, message: "Alice's update in Bob's book" })
			.toMatchObject({ lastName: users[3].lastname, street: users[3].street, city: users[3].city });
		await pageBob.getByRole('link', { name: 'Contacts' }).click();
		await expect(pageBob.getByRole('row', { name: new RegExp(users[3].lastname) })).toBeVisible({ timeout: 30000 });
	});
	

	// Playwright needs the fixtures as a pattern, even when none are used
	// eslint-disable-next-line no-empty-pattern
	test.afterEach(async ({}, testInfo) => {
		if (testInfo.status === testInfo.expectedStatus) return;
		const relevant = lines.filter((line) => /request|card|invited|sync error|could not|deliver|updated|answered/i.test(line));
		console.log(JSON.stringify(relevant.slice(-40), null, 1));
	});

	test.afterAll(async () => {
		await Promise.all([
			pageAlice.close(),
			pageBob.close()
		]);
	});
});
/** the card of `did` in this browser's own book, as it opens */
function cardOf(page, did) {
	return page.evaluate(async (did) => {
		const card = (await window.mydb.all()).map((record) => record.value)
			// their card: not our placeholder for them, not the record of their book (subscriber)
			.find((value) => value.owner === did && value.firstName !== 'invited' && !value.subscriber);
		return card ? { lastName: card.lastName, street: card.street, city: card.city } : undefined;
	}, did);
}

async function fillInput(page, placeholder, value) {
	await page.click(`[placeholder="${placeholder}"]`);
	await page.fill(`[placeholder="${placeholder}"]`, value);
}

async function fillForm(page, user) {
	await fillInput(page, 'Enter firstname...', user.firstname);
	await fillInput(page, 'Enter lastname...', user.lastname);
	await fillInput(page, 'Enter street...', user.street);
	await fillInput(page, 'Enter zipcode...', user.zipcode);
	await fillInput(page, 'Enter city...', user.city);
	await fillInput(page, 'Enter country...', user.country);
	await page.getByLabel('Category').click();
	await page.getByText('Private').click();
	// await page.locator('label').filter({ hasText: 'our own address' }).click();
}

async function initializeNewPage(browser, user) {
	
		const context = await browser.newContext();
		const page = await context.newPage();
		const page_url = process.env.PAGE_URL;
		// what each side did, printed when a test of this file fails (test.afterEach)
		page.on('console', (message) => lines.push(`${user.identity}: ${message.text()}`.slice(0, 300)));


		// a passkey per person (#60): its vault holds the identity
		await addVirtualAuthenticator(page);
		await page.goto(page_url);
		await createAddressBook(page, user.identity);
		await page.getByRole('link', { name: 'Settings' }).click();
		// the DID appears once OrbitDB has started
		await expect(page.getByLabel('DID', { exact: true })).not.toHaveValue('', { timeout: 30000 });
		user.did = await page.getByLabel('DID', { exact: true }).inputValue();
		await page.getByRole('link', { name: 'My card' }).click();
		await fillForm(page, user);
		await page.getByRole('button', { name: 'Add' }).click({ timeout: 50000 });
		return page;
	
}
//TODO can we put this into fixtures?
const users = [
	{
		identity: 'Alice',
		firstname: 'Alice',
		lastname: 'Wolkenfabrik',
		street: 'Schulgasse 5',
		zipcode: '84444',
		did: '',
		city: 'Berlin',
		country: 'Germany'
	},
	{
		identity: 'Bob',
		firstname: 'Bob',
		lastname: 'Stromwerk',
		street: 'Schulgasse 55',
		zipcode: '565544',
		did: '',
		city: 'Berlin',
		country: 'Germany'
	},
	{
		identity: 'Bob',
		firstname: 'Bob',
		lastname: 'Umzug',
		street: 'Am Hafen 9',
		zipcode: '1111111',
		did: '',
		city: 'Rom',
		country: 'Italy'
	},
	{
		identity: 'Alice',
		firstname: 'Alice',
		lastname: 'Neubau',
		street: 'Lindenweg 3',
		zipcode: '84444',
		did: '',
		city: 'Rom',
		country: 'Italy'
	},
];