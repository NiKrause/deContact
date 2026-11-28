import { describe, expect, it } from 'vitest';

import { MAX_NOTE_LENGTH, aboutContacts, isAbout, newAboutKey, noteOf, withNote } from './about.js';

const bob = 'did:key:z6MkBob';
const carol = 'did:key:z6MkCarol';

describe('what we keep about a contact (#109)', () => {
	it('has a random key that does not name the contact', () => {
		const key = newAboutKey();
		expect(key).toMatch(/^about:[A-Za-z0-9_-]{22}$/);
		expect(newAboutKey()).not.toBe(key);
		const note = withNote(undefined, bob, 'met at the stand', { now: 1 });
		expect(note._id).not.toContain(bob);
		expect(note._id).not.toContain('z6Mk');
	});

	it('a note: trimmed, cut to its length, in the document we already have', () => {
		const first = withNote(undefined, bob, '  met at the stand  ', { now: 1, key: () => 'about:one' });
		expect(first).toEqual({ _id: 'about:one', about: bob, note: 'met at the stand', changedAt: 1 });
		const second = withNote(first, bob, 'x'.repeat(MAX_NOTE_LENGTH + 10), { now: 2, key: () => 'about:two' });
		expect(second._id).toBe('about:one');
		expect(second.note).toHaveLength(MAX_NOTE_LENGTH);
		expect(() => withNote(undefined, '', 'x')).toThrow();
	});

	it('finds the documents among the others of our book; the later one counts', () => {
		const records = [
			{ value: { _id: 'contact:did:key:z6MkBob', owner: bob, firstName: 'Bob' } },
			{ value: { _id: 'about:a', about: bob, note: 'older', changedAt: 1 } },
			{ value: { _id: 'about:b', about: bob, note: 'newer', changedAt: 2 } },
			{ value: { _id: 'about:c', about: carol, note: 'Carol', changedAt: 1 } },
			{ value: { _id: 'about:d', note: 'about nobody' } },
			{ value: { _id: 'revoked:x', about: bob } },
			{ value: null }
		];
		const about = aboutContacts(records);
		expect([...about.keys()]).toEqual([bob, carol]);
		expect(noteOf(about.get(bob))).toBe('newer');
		expect(noteOf(about.get('did:key:z6MkNobody'))).toBe('');
		expect(isAbout(records[0].value)).toBe(false);
		expect(isAbout(records[4].value)).toBe(false);
	});
});
