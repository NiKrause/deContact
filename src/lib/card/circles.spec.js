import { describe, expect, it } from 'vitest';

import { CIRCLE_FIELDS, DEFAULT_CIRCLES, MAX_CIRCLES, cardForCircle, circleName, circlesOf, fieldName, fieldsOf, newCircle, showsLess } from './circles.js';
import { entriesOf, withEntries } from './entries.js';

const alice = withEntries({
	_id: 'abc',
	own: true,
	owner: 'did:key:z6MkAlice',
	sharedAddress: '/orbitdb/zdpuAlice',
	devices: [{ peer: '12D3KooWAlice' }],
	firstName: 'Alice',
	lastName: 'Wolkenfabrik',
	organization: 'Wolkenfabrik GmbH',
	photo: 'data:image/webp;base64,AAAA',
	phones: [
		{ label: 'mobile', value: '+49 30 1' },
		{ label: 'home', value: '030 2' }
	],
	emails: [
		{ label: 'private', value: 'alice@home.example' },
		{ label: 'work', value: 'alice@example.com' }
	],
	addresses: [
		{ label: 'home', street: 'Wolkenweg 1', postalCode: '12345', city: 'Musterstadt', countryRegion: '' },
		{ label: 'work', street: 'Fabrikstraße 2', postalCode: '12345', city: 'Musterstadt', countryRegion: '' }
	],
	social: [
		{ network: 'github', handle: 'alice' },
		{ network: 'instagram', handle: 'alice.private' }
	]
});
const business = fieldsOf(DEFAULT_CIRCLES, 'business');
const family = fieldsOf(DEFAULT_CIRCLES, 'family');

describe('circles (#100)', () => {
	it('a new address book has four; a new code gives the whole card; Family sees every field', () => {
		expect(DEFAULT_CIRCLES.circles.map((circle) => circle.id)).toEqual(['family', 'friends', 'acquaintances', 'business']);
		expect(DEFAULT_CIRCLES.defaultCircle).toBe('');
		expect(family).toEqual(CIRCLE_FIELDS);
		expect(Object.isFrozen(business)).toBe(true);
	});

	it('Business gets the name, photo, organisation, the mobile, the work email and address and GitHub', () => {
		const card = cardForCircle(alice, business);
		expect(card).toMatchObject({ firstName: 'Alice', lastName: 'Wolkenfabrik', organization: 'Wolkenfabrik GmbH', photo: alice.photo });
		expect(card.phones).toEqual([{ label: 'mobile', value: '+49 30 1' }]);
		expect(card.emails).toEqual([{ label: 'work', value: 'alice@example.com' }]);
		expect(card.addresses.map((it) => it.label)).toEqual(['work']);
		expect(card.social).toEqual([{ network: 'github', handle: 'alice' }]);
		// older app versions read the flat fields: only what the circle shows is there
		expect(card).toMatchObject({ email: 'alice@example.com', street: 'Fabrikstraße 2' });
		expect(JSON.stringify(card)).not.toContain('alice@home.example');
		expect(JSON.stringify(card)).not.toContain('Wolkenweg');
		expect(JSON.stringify(card)).not.toContain('alice.private');
		// what the app needs to work stays
		expect(card).toMatchObject({ sharedAddress: alice.sharedAddress, devices: alice.devices, owner: alice.owner });
	});

	it('Family, and no circle, get the whole card', () => {
		expect(entriesOf(cardForCircle(alice, family))).toEqual(entriesOf(alice));
		expect(cardForCircle(alice, family).photo).toBe(alice.photo);
		expect(cardForCircle(alice, undefined)).toBe(alice);
	});

	it('without the photo or the organisation they are not on the card', () => {
		const card = cardForCircle(alice, ['phones.mobile']);
		expect(card).not.toHaveProperty('photo');
		expect(card.organization).toBe('');
		expect(card.emails).toEqual([]);
		expect(card.email).toBe('');
	});

	it('an own card from before #109 is filtered by its entries too', () => {
		const old = { firstName: 'Alice', email: 'alice@example.com', street: 'Wolkenweg 1', city: 'Musterstadt', category: 'private' };
		const card = cardForCircle(old, business);
		// private: Home and Private, which Business does not see
		expect(card.email).toBe('');
		expect(card.city).toBe('');
		expect(card).not.toHaveProperty('category');
	});

	it('our document of circles is checked: unknown fields out, 3 to 6 circles, a default among them or the whole card', () => {
		const doc = {
			circles: [
				{ id: 'family', name: '  Familie Wolkenfabrik  ', fields: ['photo', 'emails.private', 'secret.field'] },
				{ id: 'friends', fields: [] },
				{ id: 'friends', fields: ['photo'] },
				{ id: 'Bad Id', fields: [] },
				{ id: 'business', fields: ['emails.work'] }
			],
			defaultCircle: 'gone'
		};
		expect(circlesOf(doc)).toEqual({
			circles: [
				{ id: 'family', name: 'Familie Wolkenfabrik', fields: ['photo', 'emails.private'] },
				{ id: 'friends', fields: [] },
				{ id: 'business', fields: ['emails.work'] }
			],
			defaultCircle: ''
		});
		expect(circlesOf({ ...doc, defaultCircle: 'business' }).defaultCircle).toBe('business');
		expect(circlesOf(undefined)).toEqual(DEFAULT_CIRCLES);
		// saved and read back, the defaults are the same, their fields in the same order
		expect(JSON.stringify(circlesOf(JSON.parse(JSON.stringify(DEFAULT_CIRCLES))))).toBe(JSON.stringify(DEFAULT_CIRCLES));
		expect(circlesOf({ circles: [{ id: 'a', fields: [] }] })).toEqual(DEFAULT_CIRCLES);
		const many = { circles: Array.from({ length: MAX_CIRCLES + 1 }, (_, i) => ({ id: `c${i}`, fields: [] })) };
		expect(circlesOf(many)).toEqual(DEFAULT_CIRCLES);
		// a copy of the defaults: changing it changes nothing for the next
		circlesOf(undefined).circles[0].fields.length = 0;
		expect(fieldsOf(circlesOf(undefined), 'family')).toEqual(CIRCLE_FIELDS);
	});

	it('moving to a circle that shows less is said: what they received stays with them', () => {
		expect(showsLess(undefined, business)).toBe(true);
		expect(showsLess(undefined, family)).toBe(false);
		expect(showsLess(business, family)).toBe(false);
		expect(showsLess(family, business)).toBe(true);
		expect(showsLess(business, undefined)).toBe(false);
	});

	it('names: the given one, else the default in the language on screen; fields in words', () => {
		const tr = (key, values) => `${key}${values ? JSON.stringify(values) : ''}`;
		expect(circleName(tr, { id: 'business' })).toBe('circles.defaults.business');
		expect(circleName(tr, { id: 'business', name: 'Kunden' })).toBe('Kunden');
		expect(circleName(tr, { id: 'circle-5' })).toBe('circle-5');
		expect(fieldName(tr, 'photo')).toBe('circles.photo');
		expect(fieldName(tr, 'social.github')).toBe('card.networks.github');
		expect(fieldName(tr, 'phones.work')).toBe('card.entryLabel{"kind":"card.kinds.phone","label":"card.labels.work"}');
		expect(fieldName(tr, 'social.other')).toBe('card.entryLabel{"kind":"card.kinds.social","label":"card.labels.other"}');
		expect(newCircle([{ id: 'family' }, { id: 'circle-2' }], 'Kreis')).toEqual({ id: 'circle-3', name: 'Kreis', fields: ['photo'] });
	});
});
