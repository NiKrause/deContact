import { describe, expect, it } from 'vitest';
import { groupByPeer, peerIdsOf, productionRegistrations, selectSeedNodes } from './seed-nodes.js';

const configured = ['/ip4/127.0.0.1/tcp/9092/ws/p2p/12D3KooWConfiguredRelay'];
const onAleph = ['/dns4/relay.example.com/tcp/443/tls/ws/p2p/12D3KooWAlephRelay'];

describe('selectSeedNodes', () => {
	it('uses only the configured relays when discovery is off', async () => {
		let asked = false;
		const { relays, later } = await selectSeedNodes({ configured, enabled: false, discover: async () => { asked = true; return onAleph; } });
		expect(relays).toEqual(configured);
		expect(later).toBeNull();
		expect(asked).toBe(false);
	});

	it('puts relays found on Aleph first and keeps the configured ones', async () => {
		const { relays, later } = await selectSeedNodes({ configured, enabled: true, discover: async () => [...onAleph, configured[0]] });
		expect(relays).toEqual([...onAleph, ...configured]);
		expect(later).toBeNull();
	});

	it('falls back to the configured relays when Aleph is unreachable', async () => {
		const { relays, later } = await selectSeedNodes({ configured, enabled: true, discover: async () => { throw new Error('fetch failed'); } });
		expect(relays).toEqual(configured);
		expect(later).toBeNull();
	});

	it('starts with the configured relays when Aleph is slow, and delivers its relays later', async () => {
		let answer;
		const slow = () => new Promise((resolve) => { answer = resolve; });
		const { relays, later } = await selectSeedNodes({ configured, enabled: true, timeoutMs: 20, discover: slow });
		expect(relays).toEqual(configured);
		answer(onAleph);
		expect(await later).toEqual(onAleph);
	});

	it('starts with no relays at all when none are configured and Aleph is slow', async () => {
		const { relays, later } = await selectSeedNodes({ configured: [], enabled: true, timeoutMs: 20, discover: () => new Promise(() => {}) });
		expect(relays).toEqual([]);
		expect(later).not.toBeNull();
	});

	it('delivers nothing later when the slow lookup fails', async () => {
		let fail;
		const slow = () => new Promise((_, reject) => { fail = reject; });
		const { later } = await selectSeedNodes({ configured, enabled: true, timeoutMs: 20, discover: slow });
		fail(new Error('fetch failed'));
		expect(await later).toEqual([]);
	});
});

describe('groupByPeer', () => {
	it('dials each relay once, with all its addresses', () => {
		const second = onAleph[0].replace('dns4', 'dns6');
		const groups = groupByPeer([...onAleph, second, ...configured]);
		expect([...groups.keys()]).toEqual(['12D3KooWAlephRelay', '12D3KooWConfiguredRelay']);
		expect(groups.get('12D3KooWAlephRelay')).toEqual([onAleph[0], second]);
	});
});

describe('peerIdsOf', () => {
	it('reads each relay peer id once', () => {
		expect(peerIdsOf([...onAleph, onAleph[0].replace('dns4', 'dns6'), ...configured])).toEqual(['12D3KooWAlephRelay', '12D3KooWConfiguredRelay']);
	});
});

describe('productionRegistrations', () => {
	const post = (registrationId) => ({ content: { registrationId } });
	it('keeps the production relays and leaves out smoke-test relays', () => {
		const posts = [
			post('relay:orbitdb-relay:orbitdb-relay:98f942de'),
			post('relay:orbitdb-relay:orbitdb-relay:98f942de'),
			post('relay:orbitdb-relay:orbitdb-relay'),
			post('relay:orbitdb-relay:smoke-orbitdb-relay-1:0f06aaac'),
			post('relay:orbitdb-relay:orbitdb-relay-other:1234'),
			post(undefined),
			{}
		];
		expect(productionRegistrations(posts)).toEqual(['relay:orbitdb-relay:orbitdb-relay:98f942de', 'relay:orbitdb-relay:orbitdb-relay']);
	});
});
