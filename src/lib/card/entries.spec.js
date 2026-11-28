import { describe, expect, it } from 'vitest';

import { MAX_ENTRIES, MAX_LENGTH, addressLines, emailLink, entriesOf, phoneLink, profileLink, subtitleOf } from './entries.js';

const alice = {
	firstName: 'Alice',
	lastName: 'Wolkenfabrik',
	email: 'alice@example.com',
	street: 'Wolkenweg 1',
	postalCode: '12345',
	city: 'Musterstadt',
	countryRegion: 'Exampleland',
	category: 'private'
};

describe('a card from before #109', () => {
	it('reads as the first email and the first address, labelled after its category', () => {
		const entries = entriesOf(alice);
		expect(entries.emails).toEqual([{ label: 'private', value: 'alice@example.com' }]);
		expect(entries.addresses).toEqual([
			{ label: 'home', street: 'Wolkenweg 1', postalCode: '12345', city: 'Musterstadt', countryRegion: 'Exampleland' }
		]);
		expect(entries.phones).toEqual([]);
		expect(entries.social).toEqual([]);
		expect(entries.organization).toBe('');
		expect(entriesOf({ ...alice, category: 'business' }).addresses[0].label).toBe('work');
		expect(entriesOf({ ...alice, category: 'business' }).emails[0].label).toBe('work');
		expect(entriesOf({ ...alice, category: undefined }).emails[0].label).toBe('other');
	});

	it('without an email or an address it has none: no empty entry', () => {
		const entries = entriesOf({ firstName: 'Bob', email: '', street: '', postalCode: '', city: '', countryRegion: '' });
		expect(entries.emails).toEqual([]);
		expect(entries.addresses).toEqual([]);
	});

	it('an address with only a city is an address', () => {
		expect(entriesOf({ city: 'Musterstadt' }).addresses).toEqual([
			{ label: 'other', street: '', postalCode: '', city: 'Musterstadt', countryRegion: '' }
		]);
	});
});

describe('a card of #109', () => {
	const bob = {
		firstName: 'Bob',
		lastName: 'Stromwerk',
		organization: 'Stromwerk Kollektiv',
		phones: [
			{ label: 'mobile', value: '+49 30 1234 5678' },
			{ label: 'work', value: '030 999' }
		],
		emails: [
			{ label: 'work', value: 'bob@example.com' },
			{ label: 'private', value: 'bob@home.example' }
		],
		addresses: [
			{ label: 'work', street: 'Lindenweg 7', postalCode: '12345', city: 'Musterstadt', countryRegion: '' },
			{ label: 'home', street: 'Am Bach 2', postalCode: '54321', city: 'Beispielstadt', countryRegion: '' }
		],
		social: [{ network: 'mastodon', handle: '@bob@social.example' }],
		// the primary entries, for older app versions
		email: 'bob@example.com',
		street: 'Lindenweg 7',
		postalCode: '12345',
		city: 'Musterstadt',
		countryRegion: ''
	};

	it('reads its entries in their order', () => {
		const entries = entriesOf(bob);
		expect(entries.organization).toBe('Stromwerk Kollektiv');
		expect(entries.phones.map((it) => it.value)).toEqual(['+49 30 1234 5678', '030 999']);
		expect(entries.emails.map((it) => it.value)).toEqual(['bob@example.com', 'bob@home.example']);
		expect(entries.addresses.map((it) => it.city)).toEqual(['Musterstadt', 'Beispielstadt']);
		expect(entries.social).toEqual([{ network: 'mastodon', handle: '@bob@social.example' }]);
	});

	it('an older app version changed the flat fields: they win for the first entry, the others stay', () => {
		const moved = entriesOf({ ...bob, email: 'bob@new.example', street: 'Neue Straße 3', city: 'Neustadt' });
		expect(moved.emails).toEqual([
			{ label: 'work', value: 'bob@new.example' },
			{ label: 'private', value: 'bob@home.example' }
		]);
		expect(moved.addresses[0]).toEqual({ label: 'work', street: 'Neue Straße 3', postalCode: '12345', city: 'Neustadt', countryRegion: '' });
		expect(moved.addresses[1].city).toBe('Beispielstadt');
	});

	it('an older app version emptied the flat fields: the first entry is gone', () => {
		const emptied = entriesOf({ ...bob, email: '', street: '', postalCode: '', city: '' });
		expect(emptied.emails.map((it) => it.value)).toEqual(['bob@home.example']);
		expect(emptied.addresses.map((it) => it.city)).toEqual(['Beispielstadt']);
	});

	it('a card without the flat fields reads its entries alone', () => {
		// eslint-disable-next-line no-unused-vars
		const { email, street, postalCode, city, countryRegion, ...entriesOnly } = bob;
		expect(entriesOf(entriesOnly).emails).toHaveLength(2);
		expect(entriesOf(entriesOnly).addresses).toHaveLength(2);
	});
});

describe('a card is checked as it is read: it may come from any app', () => {
	it('never throws, whatever it holds', () => {
		for (const card of [undefined, null, 'text', 42, [], { phones: 'x', emails: [null, 1, 'a'], addresses: {}, social: [[]] }]) {
			expect(() => entriesOf(card)).not.toThrow();
		}
		expect(entriesOf({ phones: [null, 'a', { value: 7 }], emails: [{ value: { a: 1 } }] })).toMatchObject({ phones: [], emails: [] });
	});

	it('an unknown label or network is Other', () => {
		const entries = entriesOf({
			phones: [{ label: 'satellite', value: '123' }],
			emails: [{ label: '<b>', value: 'a@example.com' }],
			addresses: [{ label: 'castle', city: 'Musterstadt' }],
			social: [{ network: 'myspace', handle: 'bob' }]
		});
		expect(entries.phones[0].label).toBe('other');
		expect(entries.emails[0].label).toBe('other');
		expect(entries.addresses[0].label).toBe('other');
		expect(entries.social[0].network).toBe('other');
	});

	it(`at most ${MAX_ENTRIES} of each kind, and each field cut to its length`, () => {
		const many = Array.from({ length: 20 }, (_, i) => ({ label: 'mobile', value: `0${i}`.repeat(30) }));
		const entries = entriesOf({ phones: many, firstName: 'A'.repeat(1000) });
		expect(entries.phones).toHaveLength(MAX_ENTRIES);
		expect(entries.phones[0].value).toHaveLength(MAX_LENGTH.phone);
		expect(entries.firstName).toHaveLength(MAX_LENGTH.firstName);
	});

	it('trims the fields and leaves out empty entries', () => {
		const entries = entriesOf({ phones: [{ label: 'mobile', value: '  ' }, { label: 'work', value: ' 0301 ' }] });
		expect(entries.phones).toEqual([{ label: 'work', value: '0301' }]);
	});
});

describe('the line under a name', () => {
	it('is the organisation, else the city of the first address', () => {
		expect(subtitleOf({ ...alice, organization: 'Wolkenfabrik GmbH' })).toBe('Wolkenfabrik GmbH');
		expect(subtitleOf(alice)).toBe('Musterstadt');
		expect(subtitleOf({ firstName: 'Bob' })).toBe('');
	});

	it('an address reads in lines', () => {
		expect(addressLines(entriesOf(alice).addresses[0])).toEqual(['Wolkenweg 1', '12345 Musterstadt', 'Exampleland']);
		expect(addressLines({ street: '', postalCode: '', city: 'Musterstadt', countryRegion: '' })).toEqual(['Musterstadt']);
	});
});

describe('links (#109)', () => {
	it('a social profile is a link only for a known network and a handle of its form', () => {
		expect(profileLink({ network: 'mastodon', handle: '@bob@social.example' })).toBe('https://social.example/@bob');
		expect(profileLink({ network: 'mastodon', handle: 'bob@Social.Example' })).toBe('https://social.example/@bob');
		expect(profileLink({ network: 'bluesky', handle: '@bob.bsky.social' })).toBe('https://bsky.app/profile/bob.bsky.social');
		expect(profileLink({ network: 'linkedin', handle: 'bob-stromwerk' })).toBe('https://www.linkedin.com/in/bob-stromwerk');
		expect(profileLink({ network: 'github', handle: '@bob-s' })).toBe('https://github.com/bob-s');
		expect(profileLink({ network: 'instagram', handle: 'bob.stromwerk' })).toBe('https://www.instagram.com/bob.stromwerk/');
		expect(profileLink({ network: 'x', handle: '@bob_s' })).toBe('https://x.com/bob_s');
		expect(profileLink({ network: 'website', handle: 'https://stromwerk.example/about' })).toBe('https://stromwerk.example/about');
	});

	it('anything else is no link: shown as text', () => {
		for (const profile of [
			{ network: 'other', handle: 'https://example.com' },
			{ network: 'myspace', handle: 'bob' },
			{ network: 'toString', handle: 'bob' },
			{ network: '__proto__', handle: 'bob' },
			{ network: 'mastodon', handle: 'bob' },
			{ network: 'mastodon', handle: '@bob@evil.example/path' },
			{ network: 'mastodon', handle: '@bob@localhost' },
			{ network: 'github', handle: 'https://github.com/bob' },
			{ network: 'github', handle: 'bob/../../evil' },
			{ network: 'github', handle: '-bob' },
			{ network: 'x', handle: 'a_name_that_is_too_long' },
			{ network: 'instagram', handle: 'bob?x=1' },
			{ network: 'linkedin', handle: 'bob/../x' },
			{ network: 'bluesky', handle: 'bob' },
			{ network: 'website', handle: 'javascript:alert(1)' },
			{ network: 'website', handle: 'data:text/html,hi' },
			{ network: 'website', handle: 'https://user:secret@example.com' },
			{ network: 'website', handle: 'https://localhost:8080' },
			{ network: 'website', handle: 'https://127.0.0.1' },
			{ network: 'website', handle: 'stromwerk.example' },
			{ network: 'github', handle: undefined }
		]) {
			expect(profileLink(/** @type {any} */ (profile)), JSON.stringify(profile)).toBeUndefined();
		}
	});

	it('a phone number calls; anything else is no number', () => {
		expect(phoneLink('+49 30 1234-5678')).toBe('tel:+493012345678');
		expect(phoneLink('(030) 999 / 12')).toBe('tel:03099912');
		expect(phoneLink('call me')).toBeUndefined();
		expect(phoneLink('123;ext=evil')).toBeUndefined();
		expect(phoneLink('++49')).toBeUndefined();
		expect(phoneLink('')).toBeUndefined();
	});

	it('an email address writes; nothing that would add a recipient or a header', () => {
		expect(emailLink(' bob@example.com ')).toBe('mailto:bob@example.com');
		expect(emailLink('bob@example.com?cc=eve@example.com')).toBeUndefined();
		expect(emailLink('bob@example.com&subject=x')).toBeUndefined();
		expect(emailLink('bob')).toBeUndefined();
		expect(emailLink('a@b@example.com')).toBeUndefined();
		expect(emailLink('bob @example.com')).toBeUndefined();
	});
});
