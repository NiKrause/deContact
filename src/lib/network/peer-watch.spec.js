import { describe, expect, it, vi } from 'vitest';
import { CIRCUIT_RELAY_HOP_PROTOCOL, watchPeers } from './peer-watch.js';

// The live side of the peer list: libp2p's events, no polling. A made-up libp2p.

const RELAY = '12D3KooWRelayExampleOrgAaaaaaaaaaaaaaaaaaaaaaaaR1ay';
const HOP_RELAY = '12D3KooWRelayWithHopOnlyEeeeeeeeeeeeeeeeeeeeeeH0p1';
const ALICE = '12D3KooWAliceWolkenfabrikCccccccccccccccccccccAl1c';

const id = (text) => ({ toString: () => text });
const connection = (peer, remoteAddr, extra = {}) => ({ remotePeer: id(peer), remoteAddr: id(remoteAddr), status: 'open', ...extra });

function fakeLibp2p(peerStore) {
	const target = new EventTarget();
	let connections = [];
	return Object.assign(target, {
		setConnections: (list) => (connections = list),
		getConnections: () => connections,
		peerStore: {
			get: async (peer) => {
				const entry = peerStore[peer.toString()];
				if (!entry) throw new Error('not found');
				return entry;
			}
		}
	});
}

/** resolves once onChange has been called `times` times */
function changes(times) {
	const lists = [];
	let resolve;
	const done = new Promise((r) => (resolve = r));
	const onChange = vi.fn((list) => {
		lists.push(list);
		if (lists.length === times) resolve(lists);
	});
	return { onChange, done };
}

describe('watchPeers', () => {
	it('lists the peers at once and again on each event; tags and the hop protocol make relays', async () => {
		const libp2p = fakeLibp2p({
			[RELAY]: { tags: new Map([['bootstrap', { value: 50 }]]), protocols: [] },
			[HOP_RELAY]: { tags: new Map(), protocols: [CIRCUIT_RELAY_HOP_PROTOCOL] },
			[ALICE]: { tags: new Map(), protocols: ['/decontact/request/1.0.0'] }
		});
		libp2p.setConnections([connection(RELAY, `/ip4/127.0.0.1/tcp/29302/ws/p2p/${RELAY}`)]);
		const { onChange, done } = changes(2);
		const stop = watchPeers(libp2p, { relayTags: ['bootstrap', 'aleph-bootstrap'], onChange });
		await vi.waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
		expect(onChange.mock.calls[0][0]).toMatchObject([{ id: RELAY, kind: 'relay', best: { transport: 'ws', relayed: false } }]);

		libp2p.setConnections([
			connection(RELAY, `/ip4/127.0.0.1/tcp/29302/ws/p2p/${RELAY}`),
			connection(HOP_RELAY, `/dns4/relay2.example.org/tcp/443/wss/p2p/${HOP_RELAY}`),
			connection(ALICE, `/webrtc/p2p/${ALICE}`, { direction: 'inbound' }),
			// on its way out: not listed
			connection(ALICE, `/ip4/127.0.0.1/tcp/29302/ws/p2p/${RELAY}/p2p-circuit/p2p/${ALICE}`, { status: 'closing', limits: {} })
		]);
		libp2p.dispatchEvent(new Event('connection:open'));
		const [, second] = await done;
		expect(second.map((peer) => [peer.kind, peer.best.transport, peer.best.relayed])).toEqual([
			['relay', 'ws', false],
			['relay', 'wss', false],
			['browser', 'webrtc', false]
		]);
		expect(second.find((peer) => peer.id === ALICE).connections).toHaveLength(1);

		stop();
		libp2p.dispatchEvent(new Event('connection:close'));
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(onChange).toHaveBeenCalledTimes(2);
	});

	it('builds once more, not once per event, for a burst of events', async () => {
		const libp2p = fakeLibp2p({});
		libp2p.setConnections([]);
		const onChange = vi.fn();
		watchPeers(libp2p, { onChange });
		for (let i = 0; i < 5; i++) libp2p.dispatchEvent(new Event('peer:identify'));
		libp2p.setConnections([connection(ALICE, `/webrtc/p2p/${ALICE}`)]);
		await vi.waitFor(() => expect(onChange.mock.calls.at(-1)?.[0]).toHaveLength(1));
		expect(onChange.mock.calls.length).toBeLessThanOrEqual(2);
		// a peer the store does not know is a browser
		expect(onChange.mock.calls.at(-1)[0][0]).toMatchObject({ id: ALICE, kind: 'browser' });
	});
});
