import { describe, expect, it } from 'vitest';
import { createLinkOutcomes, nameOf } from './link-outcomes.js';

const bob = 'did:key:z6MkBob';
const dave = 'did:key:z6MkDave';
const now = 1_800_000_000_000;
const token = '1.first';
const later = '1.second';
const bobsCard = (extra = {}) => ({
	id: 'contact-bob',
	_id: 'contact-bob',
	owner: bob,
	firstName: 'Bob',
	lastName: 'Stromwerk',
	...extra
});

/** a tracker and every event it sent */
function track() {
	const outcomes = createLinkOutcomes();
	const events = [];
	outcomes.subscribe((event) => events.push(event));
	return { outcomes, events };
}

describe('the name a request or a card carries', () => {
	it('is the first and the last name, whichever there is', () => {
		expect(nameOf({ firstName: 'Bob', lastName: 'Stromwerk' })).toBe('Bob Stromwerk');
		expect(nameOf({ firstName: ' Bob ', lastName: '' })).toBe('Bob');
		expect(nameOf({ lastName: 'Stromwerk' })).toBe('Stromwerk');
		expect(nameOf({ firstName: 42 })).toBe('');
		expect(nameOf(undefined)).toBe('');
	});
});

describe('what became of a code we showed', () => {
	it('says once that they have our card, however often their app resends', () => {
		const { outcomes, events } = track();
		expect(outcomes.accepted(token, bob, { name: 'Bob Stromwerk' })).toBe(true);
		// nothing before our card went to them
		expect(events).toEqual([]);
		expect(outcomes.given(token)).toEqual({
			kind: 'given',
			token,
			did: bob,
			name: 'Bob Stromwerk',
			twoWay: false
		});
		expect(outcomes.accepted(token, bob, { name: 'Bob Stromwerk' })).toBe(false);
		expect(outcomes.given(token)).toBeUndefined();
		expect(events).toHaveLength(1);
	});

	it('names nobody until a request brings the name', () => {
		const { outcomes } = track();
		outcomes.accepted(token, bob, {});
		outcomes.accepted(token, bob, { name: 'Bob Stromwerk' });
		expect(outcomes.given(token).name).toBe('Bob Stromwerk');

		const other = createLinkOutcomes();
		other.accepted(token, bob, {});
		expect(other.given(token).name).toBeUndefined();
	});

	it('says nothing for a token it never took', () => {
		const { outcomes, events } = track();
		expect(outcomes.given(token)).toBeUndefined();
		expect(outcomes.bookChanged([bobsCard()])).toEqual([]);
		expect(events).toEqual([]);
	});

	it('keeps the tokens apart: a code issued again is another token', () => {
		const { outcomes, events } = track();
		outcomes.accepted(token, dave, {});
		outcomes.given(token);
		outcomes.accepted(later, bob, { name: 'Bob Stromwerk' });
		outcomes.given(later);
		expect(events.map((event) => [event.token, event.did])).toEqual([
			[token, dave],
			[later, bob]
		]);
	});
});

describe('a two-way exchange', () => {
	it('is complete once their card arrived in our book', () => {
		const { outcomes, events } = track();
		outcomes.accepted(token, bob, { twoWay: true, expiresAt: now + 1000 });
		outcomes.given(token);
		expect(outcomes.waiting(now)).toEqual([{ token, did: bob, name: undefined }]);
		// our placeholder for them, or another person's card, is not theirs
		expect(
			outcomes.bookChanged(
				[{ owner: bob, firstName: 'invited', lastName: bob }, bobsCard({ owner: dave })],
				now
			)
		).toEqual([]);
		expect(outcomes.bookChanged([bobsCard()], now)).toEqual([
			{ kind: 'complete', token, did: bob, name: 'Bob Stromwerk', id: 'contact-bob' }
		]);
		// once
		expect(outcomes.bookChanged([bobsCard({ city: 'Musterstadt' })], now)).toEqual([]);
		expect(outcomes.waiting(now)).toEqual([]);
		expect(events.map((event) => event.kind)).toEqual(['given', 'complete']);
	});

	it('waits for a new card when one of theirs was there before', () => {
		const { outcomes } = track();
		outcomes.accepted(token, bob, { twoWay: true, card: bobsCard({ invitation: 'old' }) });
		outcomes.given(token);
		expect(outcomes.bookChanged([bobsCard({ invitation: 'old' })])).toEqual([]);
		expect(outcomes.bookChanged([bobsCard({ invitation: 'new' })])).toHaveLength(1);
	});

	it('comes after "given", even when their card was quicker than ours', () => {
		const { outcomes, events } = track();
		outcomes.accepted(token, bob, { twoWay: true });
		expect(outcomes.bookChanged([bobsCard()])).toEqual([]);
		outcomes.given(token);
		expect(outcomes.bookChanged([bobsCard()])).toHaveLength(1);
		expect(events.map((event) => event.kind)).toEqual(['given', 'complete']);
	});

	it('is nothing to wait for without an invitation, until a resend brings one', () => {
		const { outcomes } = track();
		outcomes.accepted(token, bob, {});
		outcomes.given(token);
		expect(outcomes.waiting()).toEqual([]);
		expect(outcomes.bookChanged([bobsCard()])).toEqual([]);
		outcomes.accepted(token, bob, { twoWay: true, name: 'Bob Stromwerk' });
		expect(outcomes.waiting()).toEqual([{ token, did: bob, name: 'Bob Stromwerk' }]);
	});

	it('waits no longer than the token lasts', () => {
		const { outcomes } = track();
		outcomes.accepted(token, bob, { twoWay: true, expiresAt: now + 1000 });
		outcomes.given(token);
		expect(outcomes.waiting(now + 1000)).toEqual([]);
		expect(outcomes.bookChanged([bobsCard()], now + 1000)).toEqual([]);
	});

	it('lists the newest first', () => {
		const { outcomes } = track();
		for (const [each, did] of [
			[token, dave],
			[later, bob]
		]) {
			outcomes.accepted(each, did, { twoWay: true });
			outcomes.given(each);
		}
		expect(outcomes.waiting().map((it) => it.did)).toEqual([bob, dave]);
	});
});

describe('the listeners', () => {
	it('hear a request that goes into the dialog, and stop hearing once unsubscribed', () => {
		const outcomes = createLinkOutcomes();
		const heard = [];
		const stop = outcomes.subscribe((event) => heard.push(event));
		outcomes.asked(bob);
		outcomes.asked(dave, token);
		stop();
		outcomes.asked(bob);
		expect(heard).toEqual([
			{ kind: 'asked', did: bob, token: undefined },
			{ kind: 'asked', did: dave, token }
		]);
	});

	it('one that fails does not keep the others from hearing', () => {
		const outcomes = createLinkOutcomes();
		const heard = [];
		outcomes.subscribe(() => {
			throw new Error('broken');
		});
		outcomes.subscribe((event) => heard.push(event.kind));
		outcomes.asked(bob);
		expect(heard).toEqual(['asked']);
	});
});
