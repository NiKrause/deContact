import { describe, expect, it } from 'vitest';
import { LATE_AFTER_MS, NEEDED_FOR_CODE, STEPS, hasName, readinessOf } from './readiness.js';

// The checklist of "Show my code" (#110): what the code needs, what may come later.

const card = { firstName: 'Alice', lastName: 'Wolkenfabrik' };
const network = { started: true, relays: 1, reachable: true };
const ready = { bookOpen: true, network, linkSigned: true, ownCard: card };

describe('readiness (#110)', () => {
	it('names six steps, four of which the code needs', () => {
		expect(STEPS).toEqual(['book', 'network', 'relay', 'reachable', 'link', 'card']);
		expect(NEEDED_FOR_CODE).toEqual(['book', 'network', 'link', 'card']);
		expect(LATE_AFTER_MS).toBe(10_000);
	});

	it('is ready, and reachable, when every step is done', () => {
		expect(readinessOf(ready)).toEqual({
			steps: { book: 'done', network: 'done', relay: 'done', reachable: 'done', link: 'done', card: 'done' },
			codeReady: true,
			allDone: true,
			notReachable: false
		});
	});

	it('shows the code before the relay is there; after a while it says the device is not reachable yet', () => {
		const offline = { ...ready, network: { started: true, relays: 0, reachable: false } };
		expect(readinessOf(offline)).toMatchObject({ codeReady: true, allDone: false, notReachable: false });
		expect(readinessOf(offline).steps).toMatchObject({ relay: 'waiting', reachable: 'waiting' });
		expect(readinessOf({ ...offline, late: true })).toMatchObject({ codeReady: true, notReachable: true });
		expect(readinessOf({ ...offline, late: true }).steps).toMatchObject({ relay: 'problem', reachable: 'problem' });
		// connected to a relay, but no reservation yet
		const relayed = { ...ready, network: { started: true, relays: 1, reachable: false }, late: true };
		expect(readinessOf(relayed).steps).toMatchObject({ relay: 'done', reachable: 'problem' });
		expect(readinessOf(relayed).notReachable).toBe(true);
	});

	it('holds the code back until the book, the network and the link are there', () => {
		for (const missing of [{ bookOpen: false }, { network: { relays: 1, reachable: true } }, { linkSigned: false }]) {
			const state = readinessOf({ ...ready, ...missing, late: true });
			expect(state.codeReady, JSON.stringify(missing)).toBe(false);
			expect(state.notReachable).toBe(false);
		}
		// they never turn into a problem by waiting, only relay and reachable do
		expect(readinessOf({ ...ready, bookOpen: false, late: true }).steps.book).toBe('waiting');
	});

	it('needs no link for a contact address', () => {
		expect(readinessOf({ ...ready, linkSigned: undefined }).steps.link).toBe('done');
	});

	it('holds the code back for a card without a name: the other person would get an empty card', () => {
		const state = readinessOf({ ...ready, ownCard: { firstName: ' ', city: 'Musterstadt' } });
		expect(state.steps.card).toBe('problem');
		expect(state.codeReady).toBe(false);
		expect(readinessOf({ ...ready, ownCard: undefined }).steps.card).toBe('problem');
		expect(hasName({ email: 'alice@example.com' })).toBe(true);
		expect(hasName({ lastName: 'Wolkenfabrik' })).toBe(true);
		expect(hasName({})).toBe(false);
	});
});
