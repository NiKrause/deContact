import { describe, expect, it } from 'vitest';
import { multiaddr } from '@multiformats/multiaddr';
import { isBrowserDialable, isTaggedRelay } from './peer-connectivity.js';

const relay = '12D3KooWQmMRcN42peG5wDCpEp4DyDfygxaArF3fN7CgzCra9sHf';
const peer = '12D3KooWAekFAw4rmF3vpu6gXvdtF76JVoqba84xJAXGNXqoXi6V';

describe('isBrowserDialable', () => {
	it('takes circuits through a WebSocket relay address', () => {
		expect(isBrowserDialable(multiaddr(`/ip4/127.0.0.1/tcp/9092/ws/p2p/${relay}/p2p-circuit/webrtc/p2p/${peer}`))).toBe(true);
		expect(isBrowserDialable(multiaddr(`/dns4/relay.example.com/tcp/443/tls/ws/p2p/${relay}/p2p-circuit/p2p/${peer}`))).toBe(true);
	});

	it('drops circuits through a relay address a browser cannot open', () => {
		expect(isBrowserDialable(multiaddr(`/ip4/127.0.0.1/tcp/9091/p2p/${relay}/p2p-circuit/webrtc/p2p/${peer}`))).toBe(false);
	});

	it('drops a bare /webrtc address (needs a relay for signalling)', () => {
		expect(isBrowserDialable(multiaddr(`/webrtc/p2p/${peer}`))).toBe(false);
	});
});

describe('isTaggedRelay', () => {
	const store = (tags) => ({ get: async () => ({ tags: new Map(tags.map((tag) => [tag, { value: 50 }])) }) });
	const relayTags = ['bootstrap', 'aleph-bootstrap'];

	it('knows a relay by the tag its discovery gave it', async () => {
		expect(await isTaggedRelay(store(['aleph-bootstrap']), relay, relayTags)).toBe(true);
		expect(await isTaggedRelay(store(['bootstrap']), relay, relayTags)).toBe(true);
	});

	it('takes an untagged peer for a browser to dial', async () => {
		expect(await isTaggedRelay(store([]), peer, relayTags)).toBe(false);
		expect(await isTaggedRelay(store(['keep-alive']), peer, relayTags)).toBe(false);
	});

	it('takes a peer the store does not know for a browser', async () => {
		const empty = { get: async () => { throw new Error('Not Found'); } };
		expect(await isTaggedRelay(empty, peer, relayTags)).toBe(false);
	});

	it('checks nothing without relay tags', async () => {
		expect(await isTaggedRelay(store(['bootstrap']), relay, [])).toBe(false);
	});
});
