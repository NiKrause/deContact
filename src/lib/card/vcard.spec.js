import { describe, expect, it } from 'vitest';
import { askLink, escapeText, fold, toVCard, vCardFileName } from './vcard.js';

/** a vCard's content lines, unfolded, as [name with parameters, value] */
function parse(text) {
	expect(text.endsWith('\r\n')).toBe(true);
	const unfolded = text.replace(/\r\n /g, '');
	return unfolded
		.split('\r\n')
		.filter(Boolean)
		.map((line) => {
			const colon = line.indexOf(':');
			return [line.slice(0, colon), line.slice(colon + 1)];
		});
}
const names = (text) => parse(text).map(([name]) => name.split(';')[0]);

const alice = {
	owner: 'did:key:z6MkAlice',
	firstName: 'Alice',
	lastName: 'Wolkenfabrik',
	organization: 'Wolkenfabrik Hosting GmbH',
	phones: [
		{ label: 'mobile', value: '+49 170 0000000' },
		{ label: 'work', value: '+49 30 0000000' }
	],
	emails: [{ label: 'work', value: 'alice@example.com' }],
	addresses: [{ label: 'work', street: 'Musterstraße 1', postalCode: '12345', city: 'Musterstadt', countryRegion: 'Deutschland' }],
	social: [
		{ network: 'github', handle: 'alice-example' },
		{ network: 'other', handle: 'javascript:alert(1)' }
	],
	notes: 'never in a vCard',
	sharedAddress: '/orbitdb/zdpuExample'
};

describe('a card as a vCard (#146)', () => {
	it('holds name, organisation, phones, emails, addresses and linked profiles, with their types', () => {
		const lines = parse(toVCard(alice));
		expect(lines[0]).toEqual(['BEGIN', 'VCARD']);
		expect(lines[1]).toEqual(['VERSION', '3.0']);
		expect(lines.at(-1)).toEqual(['END', 'VCARD']);
		expect(lines).toContainEqual(['N', 'Wolkenfabrik;Alice;;;']);
		expect(lines).toContainEqual(['FN', 'Alice Wolkenfabrik']);
		expect(lines).toContainEqual(['ORG', 'Wolkenfabrik Hosting GmbH']);
		expect(lines).toContainEqual(['TEL;TYPE=CELL', '+49 170 0000000']);
		expect(lines).toContainEqual(['TEL;TYPE=WORK', '+49 30 0000000']);
		expect(lines).toContainEqual(['EMAIL;TYPE=INTERNET,WORK', 'alice@example.com']);
		expect(lines).toContainEqual(['ADR;TYPE=WORK', ';;Musterstraße 1;Musterstadt;;12345;Deutschland']);
		expect(lines).toContainEqual(['URL', 'https://github.com/alice-example']);
	});

	it('leaves out what is not part of the card for others: DID, book address, notes, unlinked profiles', () => {
		const text = toVCard(alice);
		for (const secret of ['did:key', '/orbitdb/', 'never in a vCard', 'javascript:']) expect(text).not.toContain(secret);
	});

	it('carries the way back into deContact and the note, only as an http(s) link', () => {
		const link = askLink('https://example.com/deContact/', 'did:key:z6MkAlice?peer=12D3KooWExample');
		expect(link).toBe('https://example.com/deContact/#/?ask=did%3Akey%3Az6MkAlice%3Fpeer%3D12D3KooWExample');
		const lines = parse(toVCard(alice, { link, note: `Always up to date there: ${link}` }));
		expect(lines).toContainEqual(['URL', link]);
		expect(lines).toContainEqual(['NOTE', `Always up to date there: ${link}`]);
		expect(names(toVCard(alice, { link: 'javascript:alert(1)' }))).toEqual(names(toVCard(alice)));
		expect(names(toVCard(alice, { link: 'https://example.com/\r\nTEL:1' }))).toEqual(names(toVCard(alice)));
	});

	it('cannot be given properties of its own through a name or a field', () => {
		const hostile = {
			firstName: 'Mallory\r\nTEL:+1 555',
			lastName: 'Example;X-EVIL:1',
			organization: 'Org,\nEND:VCARD\nBEGIN:VCARD',
			phones: [{ label: 'mobile', value: '+1\nURL:https://evil.example.com' }],
			emails: [{ label: 'work\nX', value: 'a@example.com\r\nNOTE:hi' }],
			addresses: [{ label: 'home', street: 'Street\n1;2', postalCode: '1\u0000', city: 'City,\\', countryRegion: '' }]
		};
		const text = toVCard(hostile, { note: 'line one\nline two' });
		expect(names(text)).toEqual(['BEGIN', 'VERSION', 'N', 'FN', 'ORG', 'TEL', 'EMAIL', 'ADR', 'NOTE', 'END']);
		const lines = parse(text);
		expect(lines).toContainEqual(['N', 'Example\\;X-EVIL:1;Mallory\\nTEL:+1 555;;;']);
		expect(lines).toContainEqual(['NOTE', 'line one\\nline two']);
		expect(text).not.toContain('\u0000');
	});

	it('escapes as RFC 2426 asks, and folds long lines without splitting a character', () => {
		expect(escapeText('a\\b,c;d\ne')).toBe('a\\\\b\\,c\\;d\\ne');
		const long = `NOTE:${'ä'.repeat(100)}`;
		const folded = fold(long);
		for (const line of folded.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
		expect(folded.replace(/\r\n /g, '')).toBe(long);
	});

	it('takes a photo the app prepared, as JPEG in base64, and nothing that is not base64', () => {
		expect(parse(toVCard(alice, { photo: { type: 'JPEG', base64: 'AAEC' } }))).toContainEqual(['PHOTO;ENCODING=b;TYPE=JPEG', 'AAEC']);
		expect(names(toVCard(alice, { photo: { type: 'JPEG', base64: 'AA\r\nTEL:1' } }))).not.toContain('PHOTO');
		expect(names(toVCard(alice, { photo: { type: 'SVG', base64: 'AAEC' } }))).not.toContain('PHOTO');
	});

	it('names the file after the person, in letters, digits, dots and dashes', () => {
		expect(vCardFileName(alice)).toBe('Alice-Wolkenfabrik.vcf');
		expect(vCardFileName({ firstName: '../../etc', lastName: 'passwd' })).toBe('etc-passwd.vcf');
		expect(vCardFileName({})).toBe('contact.vcf');
	});
});
