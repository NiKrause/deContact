import { describe, expect, it } from 'vitest';
import {
	TRANSPORTS,
	connectionOf,
	connectionText,
	partsOf,
	peerListOf,
	shortId,
	summaryOf,
	summaryText
} from './peer-list.js';
import en from '../i18n/en.js';
import de from '../i18n/de.js';

// Which peers the header's toggletip lists, and how they are connected. Made-up ids and
// addresses only: documentation ranges (192.0.2.0/24, 2001:db8::/32) and example.org.

const RELAY = '12D3KooWRelayExampleOrgAaaaaaaaaaaaaaaaaaaaaaaaR1ay';
const OTHER_RELAY = '12D3KooWRelaySecondExampleBbbbbbbbbbbbbbbbbbbbbR2ay';
const ALICE = '12D3KooWAliceWolkenfabrikCccccccccccccccccccccAl1c';
const BOB = '12D3KooWBobStromwerkDddddddddddddddddddddddddddB0bb';

const relayWss = `/dns4/relay.example.org/tcp/443/wss/p2p/${RELAY}`;
const relayTlsWs = `/ip4/192.0.2.10/tcp/443/tls/sni/relay.example.org/ws/p2p/${RELAY}`;
const relayWs = `/ip4/127.0.0.1/tcp/29302/ws/p2p/${RELAY}`;
const viaRelay = (peer, over = relayWss) => `${over}/p2p-circuit/p2p/${peer}`;
const webRTCOut = (peer, over = relayWss) => `${over}/p2p-circuit/webrtc/p2p/${peer}`;
const webRTCIn = (peer) => `/webrtc/p2p/${peer}`;

/** the i18n catalogue's lookup, as t() does it, without the app's language state */
function tIn(catalogue) {
	return (key, values = {}) => {
		let node = key.split('.').reduce((at, part) => at?.[part], catalogue);
		if (node && typeof node === 'object') node = node[values.count === 1 ? 'one' : 'other'];
		if (typeof node !== 'string') return key;
		return node.replace(/\{(\w+)\}/g, (match, name) => (name in values ? String(values[name]) : match));
	};
}
const t = tIn(en);

describe('multiaddr parts and short ids', () => {
	it('splits an address into its protocols and values', () => {
		expect(partsOf(webRTCOut(ALICE))).toEqual([
			{ name: 'dns4', value: 'relay.example.org' },
			{ name: 'tcp', value: '443' },
			{ name: 'wss' },
			{ name: 'p2p', value: RELAY },
			{ name: 'p2p-circuit' },
			{ name: 'webrtc' },
			{ name: 'p2p', value: ALICE }
		]);
		expect(partsOf('')).toEqual([]);
	});

	it('shortens a peer id to its first seven and last four characters', () => {
		expect(shortId(ALICE)).toBe('12D3Koo…Al1c');
		expect(shortId('12D3KooShort')).toBe('12D3KooShort');
	});
});

describe('how one connection runs', () => {
	it('names the transport of a direct connection', () => {
		expect(connectionOf({ remoteAddr: relayWss })).toEqual({ transport: 'wss', relayed: false, host: 'relay.example.org' });
		expect(connectionOf({ remoteAddr: relayTlsWs })).toEqual({ transport: 'wss', relayed: false, host: 'relay.example.org' });
		expect(connectionOf({ remoteAddr: relayWs })).toEqual({ transport: 'ws', relayed: false });
		expect(connectionOf({ remoteAddr: `/ip4/192.0.2.10/udp/4001/webrtc-direct/certhash/uEiAbc/p2p/${RELAY}` }).transport).toBe('webrtc-direct');
		expect(connectionOf({ remoteAddr: `/ip6/2001:db8::1/udp/443/quic-v1/webtransport/certhash/uEiAbc/certhash/uEiDef/p2p/${RELAY}` }).transport).toBe('webtransport');
		expect(connectionOf({ remoteAddr: `/ip4/192.0.2.10/udp/4001/quic-v1/p2p/${RELAY}` }).transport).toBe('quic');
		expect(connectionOf({ remoteAddr: `/ip4/127.0.0.1/tcp/29301/p2p/${RELAY}` }).transport).toBe('tcp');
		expect(connectionOf({ remoteAddr: `/memory/test/p2p/${RELAY}` }).transport).toBe('other');
	});

	it('counts WebRTC between two browsers as direct, though a relay signalled it', () => {
		// we dialled: the address names the relay that carried the signalling
		expect(connectionOf({ remoteAddr: webRTCOut(ALICE), direction: 'outbound' })).toEqual({
			transport: 'webrtc',
			relayed: false,
			direction: 'outbound'
		});
		// they dialled: libp2p knows only the peer
		expect(connectionOf({ remoteAddr: webRTCIn(ALICE), direction: 'inbound' })).toEqual({
			transport: 'webrtc',
			relayed: false,
			direction: 'inbound'
		});
	});

	it('counts a circuit as relayed, through the relay its address names, over the transport to it', () => {
		const limits = { bytes: 131072n, seconds: 120 };
		expect(connectionOf({ remoteAddr: viaRelay(ALICE), limits })).toEqual({ transport: 'wss', relayed: true, via: RELAY });
		expect(connectionOf({ remoteAddr: viaRelay(ALICE, relayWs) })).toEqual({ transport: 'ws', relayed: true, via: RELAY });
		// a relayed connection carries no host name: it would be the relay's, not the peer's
		expect(connectionOf({ remoteAddr: viaRelay(ALICE) }).host).toBeUndefined();
		// an inbound circuit whose address names no relay
		expect(connectionOf({ remoteAddr: `/p2p-circuit/p2p/${ALICE}`, limits })).toEqual({ transport: 'other', relayed: true });
	});

	it("trusts libp2p's limits over the address", () => {
		expect(connectionOf({ remoteAddr: `/ip4/192.0.2.20/tcp/4001/ws/p2p/${ALICE}`, limits: { seconds: 60 } }).relayed).toBe(true);
		expect(connectionOf({ remoteAddr: relayWss, limits: null }).relayed).toBe(false);
	});
});

describe('the peers of a set of connections', () => {
	it('lists relays first, a browser upgraded to WebRTC as direct WebRTC', () => {
		const peers = peerListOf(
			[
				{ remotePeer: ALICE, remoteAddr: viaRelay(ALICE), limits: { seconds: 120 }, direction: 'outbound' },
				{ remotePeer: RELAY, remoteAddr: relayWss, direction: 'outbound' },
				{ remotePeer: ALICE, remoteAddr: webRTCOut(ALICE), direction: 'outbound' }
			],
			{ relays: [RELAY] }
		);
		expect(peers).toEqual([
			{
				id: RELAY,
				short: '12D3Koo…R1ay',
				kind: 'relay',
				host: 'relay.example.org',
				best: { transport: 'wss', relayed: false, direction: 'outbound' },
				connections: [{ transport: 'wss', relayed: false, direction: 'outbound' }]
			},
			{
				id: ALICE,
				short: '12D3Koo…Al1c',
				kind: 'browser',
				best: { transport: 'webrtc', relayed: false, direction: 'outbound' },
				connections: [
					{ transport: 'webrtc', relayed: false, direction: 'outbound' },
					{ transport: 'wss', relayed: true, via: RELAY, direction: 'outbound' }
				]
			}
		]);
	});

	it("never keeps another browser's address, only a relay's DNS name", () => {
		const [bob] = peerListOf([{ remotePeer: BOB, remoteAddr: `/dns4/bob.example.org/tcp/443/wss/p2p/${BOB}` }]);
		expect(bob.kind).toBe('browser');
		expect(bob.host).toBeUndefined();
		expect(JSON.stringify(bob)).not.toContain('example.org');
		const [relay] = peerListOf([{ remotePeer: RELAY, remoteAddr: `/ip4/192.0.2.10/tcp/443/wss/p2p/${RELAY}` }], { relays: [RELAY] });
		expect(relay.host).toBeUndefined();
		expect(JSON.stringify(relay)).not.toContain('192.0.2.10');
	});

	it('keeps one entry per distinct way a peer is connected', () => {
		const [alice] = peerListOf([
			{ remotePeer: ALICE, remoteAddr: webRTCOut(ALICE) },
			{ remotePeer: ALICE, remoteAddr: webRTCIn(ALICE) }
		]);
		expect(alice.connections).toEqual([{ transport: 'webrtc', relayed: false }]);
	});

	it('sorts direct connections by TRANSPORTS', () => {
		expect(TRANSPORTS[0]).toBe('webrtc');
		const [relay] = peerListOf(
			[
				{ remotePeer: RELAY, remoteAddr: relayWs },
				{ remotePeer: RELAY, remoteAddr: relayWss }
			],
			{ relays: [RELAY] }
		);
		expect(relay.connections.map((c) => c.transport)).toEqual(['wss', 'ws']);
		expect(relay.host).toBe('relay.example.org');
	});

	it('takes peer ids and addresses as libp2p objects too (their toString)', () => {
		const object = (text) => ({ toString: () => text });
		const [peer] = peerListOf([{ remotePeer: object(RELAY), remoteAddr: object(relayWs) }], { relays: new Set([RELAY]) });
		expect(peer).toMatchObject({ id: RELAY, kind: 'relay', best: { transport: 'ws' } });
	});
});

describe('the sum line', () => {
	const relayConnection = { remotePeer: RELAY, remoteAddr: relayWss };

	it('reads "2 peers: 1 relay, 1 browser (direct, WebRTC)"', () => {
		const peers = peerListOf([relayConnection, { remotePeer: ALICE, remoteAddr: webRTCIn(ALICE) }], { relays: [RELAY] });
		expect(summaryOf(peers)).toEqual({ total: 2, relays: 1, browsers: 1, ways: [{ relayed: false, transport: 'webrtc', count: 1 }] });
		expect(summaryText(summaryOf(peers), t)).toBe('2 peers: 1 relay, 1 browser (direct, WebRTC)');
		expect(summaryText(summaryOf(peers), tIn(de))).toBe('2 Peers: 1 Relay, 1 Browser (direkt, WebRTC)');
	});

	it('counts the ways when the browsers are reached differently', () => {
		const peers = peerListOf(
			[
				relayConnection,
				{ remotePeer: OTHER_RELAY, remoteAddr: `/dns4/relay2.example.org/tcp/443/wss/p2p/${OTHER_RELAY}` },
				{ remotePeer: ALICE, remoteAddr: webRTCOut(ALICE) },
				{ remotePeer: BOB, remoteAddr: viaRelay(BOB), limits: {} }
			],
			{ relays: [RELAY, OTHER_RELAY] }
		);
		expect(summaryText(summaryOf(peers), t)).toBe('4 peers: 2 relays, 2 browsers (1 direct, WebRTC; 1 relayed)');
		expect(summaryText(summaryOf(peers), tIn(de))).toBe('4 Peers: 2 Relays, 2 Browser (1 direkt, WebRTC; 1 über ein Relay)');
	});

	it('says when only the relay is there, or nobody', () => {
		const relayOnly = summaryOf(peerListOf([relayConnection], { relays: [RELAY] }));
		expect(summaryText(relayOnly, t)).toBe('1 peer: 1 relay');
		const browsersOnly = summaryOf(peerListOf([{ remotePeer: BOB, remoteAddr: viaRelay(BOB) }, { remotePeer: ALICE, remoteAddr: viaRelay(ALICE) }]));
		expect(summaryText(browsersOnly, t)).toBe('2 peers: no relay, 2 browsers (relayed)');
		expect(summaryText(summaryOf([]), t)).toBe(en.peers.none);
		expect(summaryText(summaryOf([]), tIn(de))).toBe(de.peers.none);
	});
});

describe('one connection in words', () => {
	it('names the transport, and the relay of a relayed connection', () => {
		expect(connectionText({ transport: 'webrtc', relayed: false }, t)).toBe('WebRTC, direct');
		expect(connectionText({ transport: 'wss', relayed: true, via: RELAY }, t)).toBe('relayed through 12D3Koo…R1ay (WebSocket Secure)');
		expect(connectionText({ transport: 'ws', relayed: true }, t)).toBe('relayed (WebSocket)');
		expect(connectionText({ transport: 'webrtc', relayed: false }, tIn(de))).toBe('WebRTC, direkt');
		expect(connectionText({ transport: 'wss', relayed: true, via: RELAY }, tIn(de))).toBe('über Relay 12D3Koo…R1ay (WebSocket Secure)');
	});

	it('has a name for every transport, in both languages', () => {
		for (const transport of TRANSPORTS) {
			expect(en.peers.transport[transport], transport).toBeTruthy();
			expect(de.peers.transport[transport], transport).toBeTruthy();
		}
	});
});
