import { beforeAll, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';

/** @type {import('./stores.js')} */
let stores;
beforeAll(async () => {
	// stores.js reads the WebRTC setting from localStorage when it loads
	globalThis.window ??= { localStorage: { getItem: () => null } };
	stores = await import('./stores.js');
});

// the form binds its fields to the card in selectedAddr and writes into it (#110)
describe('the empty card', () => {
	it('stays empty after the first card is typed into the form', () => {
		const typed = get(stores.selectedAddr);
		typed.lastName = 'Wolkenfabrik';
		typed._id = 'abc';
		expect(stores.blankCard(false)).toMatchObject({ lastName: '', _id: '', own: false });
		expect(stores.blankCard(true)).toMatchObject({ lastName: '', _id: '', own: true });
	});

	it('is a new object each time', () => {
		expect(stores.blankCard(false)).not.toBe(stores.blankCard(false));
	});
});
