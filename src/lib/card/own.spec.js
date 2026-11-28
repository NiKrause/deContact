import { describe, expect, it } from 'vitest';

import { ownCardOf, withOneOwnCard } from './own.js';

const me = 'did:key:z6MkAlice';
const alice = { _id: 'b-alice', owner: me, own: true, firstName: 'Alice', lastName: 'Wolkenfabrik' };
// added by hand: our DID as its owner, as it is ours to change
const carol = { _id: 'a-carol', owner: me, own: false, firstName: 'Carol', lastName: 'Beispiel' };
const bob = { _id: 'c-bob', owner: 'did:key:z6MkBob', firstName: 'Bob', lastName: 'Stromwerk' };

describe('our own card', () => {
	it('is the card of ours marked as our own', () => {
		expect(ownCardOf([carol, bob, alice], me)).toBe(alice);
		expect(ownCardOf([alice], undefined)).toBeUndefined();
		expect(ownCardOf(undefined, me)).toBeUndefined();
	});

	it('is none without a card marked as ours: a contact added by hand never goes out in its place', () => {
		expect(ownCardOf([carol, bob], me)).toBeUndefined();
		// a card of somebody else marked as theirs is not ours
		expect(ownCardOf([{ ...bob, own: true }], me)).toBeUndefined();
		expect(ownCardOf([{ ...alice, own: 'true' }], me)).toBeUndefined();
	});

	it('of several marked (a book from before #123): the one naming our devices, else the first by key, in any order', () => {
		const typedByHand = { ...carol, own: true };
		const named = { ...alice, devices: [{ peer: '12D3KooWAlice' }] };
		expect(ownCardOf([typedByHand, named], me)).toBe(named);
		expect(ownCardOf([named, typedByHand], me)).toBe(named);
		expect(ownCardOf([alice, typedByHand], me)).toBe(typedByHand);
		expect(ownCardOf([typedByHand, alice], me)).toBe(typedByHand);
		// both naming devices: the key decides
		const namedToo = { ...typedByHand, devices: [{ peer: '12D3KooWOther' }] };
		expect(ownCardOf([named, namedToo], me)).toBe(namedToo);
	});

	it('the others marked as ours are shown as contacts added by hand', () => {
		const typedByHand = { ...carol, own: true };
		const named = { ...alice, devices: [{ peer: '12D3KooWAlice' }] };
		const shown = withOneOwnCard([typedByHand, bob, named], me);
		expect(shown).toEqual([{ ...typedByHand, own: false }, bob, named]);
		expect(shown[2]).toBe(named);
		// a book with one own card stays as it is
		const cards = [carol, bob, alice];
		expect(withOneOwnCard(cards, me)).toEqual(cards);
		expect(withOneOwnCard(cards, me)[2]).toBe(alice);
		// nothing marked: nothing to change
		expect(withOneOwnCard([carol, bob], me)).toEqual([carol, bob]);
	});
});
