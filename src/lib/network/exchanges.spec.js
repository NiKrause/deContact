import { describe, expect, it } from 'vitest';
import { createExchangeStore, exchangeNeeds } from './exchanges.js';

const alice = 'did:key:z6MkAlice';
const carol = 'did:key:z6MkCarol';
const now = 1_800_000_000_000;
const link = (extra = {}) => ({ inviter: alice, token: '1.token', expiresAt: now + 1000, twoWay: true, ...extra });

const memoryStorage = () => {
	const items = new Map();
	return { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => items.set(key, value) };
};

describe('what the invitee asks for (#86)', () => {
	const needs = (exchange, state) => exchangeNeeds({ twoWay: true, ...exchange }, { cardArrived: false, ...state });

	it("asks for the inviter's card and, in case we share, an invitation", () => {
		expect(needs({}, {})).toEqual({ send: true, twoWay: true, waiting: true });
		// an invitation that waits for our choice is not asked for again
		expect(needs({}, { invitationHeld: true })).toEqual({ send: true, twoWay: false, waiting: true });
		// before the choice, the invitation comes with the card or not at all
		expect(needs({}, { cardArrived: true })).toEqual({ send: false, twoWay: false, waiting: false });
	});

	it('asks for no invitation when the link allows no two-way exchange', () => {
		expect(needs({ twoWay: false }, {})).toEqual({ send: true, twoWay: false, waiting: true });
		expect(needs({ twoWay: false, choice: 'save' }, { cardArrived: true }).send).toBe(false);
	});

	it('after "Save and share": asks for an invitation until our card went over', () => {
		expect(needs({ choice: 'share' }, { cardArrived: true })).toEqual({ send: true, twoWay: true, waiting: true });
		expect(needs({ choice: 'share', shared: true }, { cardArrived: true })).toEqual({ send: false, twoWay: false, waiting: false });
		// shared, but their card has not arrived yet
		expect(needs({ choice: 'share', shared: true }, {})).toEqual({ send: true, twoWay: false, waiting: true });
	});

	it('after "Save only": asks for their card only', () => {
		expect(needs({ choice: 'only' }, {})).toEqual({ send: true, twoWay: false, waiting: true });
		expect(needs({ choice: 'only' }, { cardArrived: true })).toEqual({ send: false, twoWay: false, waiting: false });
	});

	it('stops when the inviter canceled our request', () => {
		expect(needs({ choice: 'share' }, { cardArrived: true, declinedByInviter: true })).toEqual({ send: false, twoWay: false, waiting: false });
	});
});

describe('the exchanges of this device', () => {
	it('remembers a link and the choice across reloads', () => {
		const storage = memoryStorage();
		expect(createExchangeStore(storage).opened(link(), now)).toEqual(link());
		createExchangeStore(storage).chose(alice, 'share', now);
		const reloaded = createExchangeStore(storage);
		expect(reloaded.get(alice, now)).toEqual({ ...link(), choice: 'share' });
		reloaded.shared(alice, now);
		expect(reloaded.get(alice, now)).toEqual({ ...link(), choice: 'share', shared: true });
		expect(reloaded.get(carol, now)).toBeUndefined();
	});

	it('keeps the choice when the same link is opened again, and starts over with a new one', () => {
		const store = createExchangeStore(memoryStorage());
		store.opened(link(), now);
		store.chose(alice, 'only', now);
		expect(store.opened(link(), now).choice).toBe('only');
		// opened again, the person chooses again
		expect(store.chose(alice, 'share', now).choice).toBe('share');
		expect(store.opened(link({ token: '1.other', twoWay: false }), now)).toEqual(link({ token: '1.other', twoWay: false }));
	});

	it('forgets a link when its token expires', () => {
		const storage = memoryStorage();
		const store = createExchangeStore(storage);
		store.opened(link(), now);
		store.opened(link({ inviter: carol, expiresAt: now + 5000 }), now);
		expect(store.all(now).map((it) => it.inviter)).toEqual([alice, carol]);
		expect(store.get(alice, now + 1000)).toBeUndefined();
		expect(store.chose(alice, 'share', now + 1000)).toBeUndefined();
		expect(store.all(now + 1000).map((it) => it.inviter)).toEqual([carol]);
		store.opened(link({ inviter: carol, expiresAt: now + 5000 }), now + 2000);
		expect(Object.keys(JSON.parse(storage.getItem('decontact.exchanges.v1')))).toEqual([carol]);
	});

	it('accepts only the known choices', () => {
		const store = createExchangeStore(memoryStorage());
		store.opened(link(), now);
		expect(() => store.chose(alice, 'maybe', now)).toThrow();
	});

	it('starts over when what it stored is unreadable', () => {
		const storage = memoryStorage();
		storage.setItem('decontact.exchanges.v1', '{broken');
		const store = createExchangeStore(storage);
		expect(store.all(now)).toEqual([]);
		store.opened(link(), now);
		expect(store.get(alice, now)).toEqual(link());
		// nothing from the prototype of an object
		expect(store.get('__proto__', now)).toBeUndefined();
	});
});
