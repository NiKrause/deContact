/**
 * Which peers this browser is connected to, and how: what the header's network toggletip and
 * Settings → Network list (PeerList.svelte), and what the "Show my code" checklist counts as a
 * relay (readiness.js, through networkState). A pure rule (peer-list.spec.js); the connections
 * come from libp2p.getConnections() (peer-watch.js).
 *
 * For each peer:
 * - kind: 'relay' (a configured or Aleph relay, RELAY_TAGS, or any peer that offers the circuit
 *   relay hop protocol) or 'browser' (everything else: another deContact, or another app's
 *   browser on the same relays);
 * - for each of its connections the transport and whether it is relayed: a /p2p-circuit
 *   address that does not end in /webrtc, or a connection libp2p marks as limited. WebRTC
 *   between two browsers is signalled through a relay, so its address names the relay too,
 *   but the data goes directly: it counts as direct;
 * - best: the connection that says how the peer is reached. A direct one wins over a relayed
 *   one, so a browser reached through the relay and then upgraded to WebRTC shows as direct
 *   WebRTC while the relayed circuit is still open.
 *
 * Addresses stay out of what is shown: another browser's address may hold its IP. Only a
 * relay's DNS name is kept (host). The planned network log (#120) names transports and
 * shortens ids with the same functions.
 */

/** @typedef {{ transport: string, relayed: boolean, via?: string, host?: string, direction?: string }} ConnectionInfo */

/** the transports, best first among direct connections */
export const TRANSPORTS = ['webrtc', 'webtransport', 'wss', 'ws', 'webrtc-direct', 'quic', 'tcp', 'other'];

/** multiaddr protocols followed by a value (/ip4/127.0.0.1, /p2p/12D3Koo...); the rest stand alone */
const WITH_VALUE = new Set([
	'ip4',
	'ip6',
	'ip6zone',
	'ipcidr',
	'dns',
	'dns4',
	'dns6',
	'dnsaddr',
	'tcp',
	'udp',
	'dccp',
	'sctp',
	'p2p',
	'ipfs',
	'sni',
	'certhash',
	'onion',
	'onion3',
	'garlic32',
	'garlic64',
	'memory',
	'http-path'
]);
const HOST_NAMES = new Set(['dns', 'dns4', 'dns6', 'dnsaddr', 'sni']);

/**
 * A multiaddr as its parts: `/ip4/127.0.0.1/tcp/1/ws` → [{ name: 'ip4', value: '127.0.0.1' }, ...].
 * @param {string} address
 * @returns {{ name: string, value?: string }[]}
 */
export function partsOf(address) {
	const tokens = String(address ?? '')
		.split('/')
		.filter((token) => token !== '');
	const parts = [];
	for (let i = 0; i < tokens.length; i++) {
		const name = tokens[i];
		parts.push(WITH_VALUE.has(name) ? { name, value: tokens[++i] } : { name });
	}
	return parts;
}

/**
 * `12D3KooWAbCdEfGh...WxYz` → `12D3Koo…WxYz`: enough to tell peers apart on screen.
 * @param {string} id
 */
export function shortId(id) {
	const text = String(id ?? '');
	return text.length > 14 ? `${text.slice(0, 7)}…${text.slice(-4)}` : text;
}

/**
 * The transport of an address without /p2p-circuit, from its parts.
 * @param {{ name: string }[]} parts
 * @returns {string} one of TRANSPORTS
 */
function transportOfParts(parts) {
	const names = new Set(parts.map((part) => part.name));
	if (names.has('webrtc')) return 'webrtc';
	if (names.has('webrtc-direct')) return 'webrtc-direct';
	if (names.has('webtransport')) return 'webtransport';
	if (names.has('wss') || (names.has('tls') && names.has('ws'))) return 'wss';
	if (names.has('ws')) return 'ws';
	if (names.has('quic') || names.has('quic-v1')) return 'quic';
	if (names.has('tcp')) return 'tcp';
	return 'other';
}

/**
 * How one connection runs.
 *
 * - `<relay>/p2p-circuit/webrtc/p2p/<peer>` (we dialled) and `/webrtc/p2p/<peer>` (they did):
 *   WebRTC, direct;
 * - `<relay>/p2p/<relay id>/p2p-circuit/p2p/<peer>`: relayed through that relay, over the
 *   transport we reach the relay by;
 * - anything else: direct, over its own transport. libp2p's `limits` marks a relayed
 *   connection whatever its address says.
 *
 * @param {{ remoteAddr: string, limits?: object | null, direction?: string }} connection
 * @returns {{ transport: string, relayed: boolean, via?: string, host?: string, direction?: string }}
 *   via: the relay's peer id, for a relayed connection whose address names it;
 *   host: the DNS name the address reaches (for a relay's own connection, never shown for a browser)
 */
export function connectionOf({ remoteAddr, limits, direction }) {
	const parts = partsOf(remoteAddr);
	const circuit = parts.map((part) => part.name).lastIndexOf('p2p-circuit');
	const toRelay = circuit === -1 ? parts : parts.slice(0, circuit);
	const afterCircuit = circuit === -1 ? [] : parts.slice(circuit + 1);
	const webRTC = afterCircuit.some((part) => part.name === 'webrtc');
	const relayed = (circuit !== -1 && !webRTC) || limits != null;
	const transport = webRTC ? 'webrtc' : transportOfParts(toRelay);
	const via = circuit === -1 ? undefined : toRelay.findLast((part) => part.name === 'p2p')?.value;
	const host = circuit === -1 ? parts.find((part) => HOST_NAMES.has(part.name))?.value : undefined;
	return {
		transport,
		relayed,
		...(via && relayed ? { via } : {}),
		...(host ? { host } : {}),
		...(direction ? { direction } : {})
	};
}

/**
 * direct before relayed, then by TRANSPORTS
 * @param {{ transport: string, relayed: boolean }} connection
 */
function rank(connection) {
	return (connection.relayed ? TRANSPORTS.length : 0) + TRANSPORTS.indexOf(connection.transport);
}

/**
 * The peers of a set of connections, relays first.
 *
 * @param {{ remotePeer: string, remoteAddr: string, limits?: object | null, direction?: string }[]} connections
 * @param {{ relays?: Iterable<string> }} [known] relays: the peer ids that are relays
 * @returns {{ id: string, short: string, kind: 'relay' | 'browser', host?: string,
 *   best: ReturnType<typeof connectionOf>, connections: ReturnType<typeof connectionOf>[] }[]}
 *   connections: each distinct way the peer is connected, best first
 */
export function peerListOf(connections, { relays = [] } = {}) {
	const relayIds = new Set([...relays].map(String));
	/** @type {Map<string, ReturnType<typeof connectionOf>[]>} */
	const byPeer = new Map();
	for (const connection of connections) {
		const id = String(connection.remotePeer);
		const list = byPeer.get(id) ?? [];
		list.push(connectionOf({ ...connection, remoteAddr: String(connection.remoteAddr) }));
		byPeer.set(id, list);
	}
	const peers = [...byPeer].map(([id, list]) => {
		const kind = /** @type {'relay' | 'browser'} */ (relayIds.has(id) ? 'relay' : 'browser');
		const distinct = [...new Map(list.map((c) => [`${c.relayed}/${c.transport}/${c.via ?? ''}`, c])).values()];
		const sorted = distinct.sort((a, b) => rank(a) - rank(b));
		const best = sorted[0];
		// a relay's DNS name may show; another browser's address never does
		const host = kind === 'relay' ? list.find((c) => c.host)?.host : undefined;
		/** @param {ReturnType<typeof connectionOf>} connection */
		const strip = (connection) => {
			const { host: _host, ...rest } = connection;
			return rest;
		};
		return {
			id,
			short: shortId(id),
			kind,
			...(host ? { host } : {}),
			best: strip(best),
			connections: sorted.map(strip)
		};
	});
	return peers.sort((a, b) => (a.kind === b.kind ? a.id.localeCompare(b.id) : a.kind === 'relay' ? -1 : 1));
}

/**
 * Counts for the sum line: how many relays and browsers, and how the browsers are reached,
 * grouped (direct WebRTC, relayed, ...), the largest group first.
 *
 * @param {ReturnType<typeof peerListOf>} peers
 * @returns {{ total: number, relays: number, browsers: number,
 *   ways: { relayed: boolean, transport?: string, count: number }[] }}
 *   ways: of the browsers; a relayed way names no transport (it is the relay's)
 */
export function summaryOf(peers) {
	const browsers = peers.filter((peer) => peer.kind === 'browser');
	/** @type {Map<string, { relayed: boolean, transport?: string, count: number }>} */
	const ways = new Map();
	for (const { best } of browsers) {
		const key = best.relayed ? 'relayed' : best.transport;
		const way = ways.get(key) ?? { relayed: best.relayed, ...(best.relayed ? {} : { transport: best.transport }), count: 0 };
		way.count++;
		ways.set(key, way);
	}
	return {
		total: peers.length,
		relays: peers.length - browsers.length,
		browsers: browsers.length,
		ways: [...ways.values()].sort((a, b) => b.count - a.count || Number(a.relayed) - Number(b.relayed))
	};
}

/**
 * How one connection reads: "WebRTC, direct", "relayed through relay 12D3Koo…AbCd".
 *
 * @param {ReturnType<typeof connectionOf>} connection
 * @param {(key: string, values?: Record<string, string | number>) => string} t
 */
export function connectionText(connection, t) {
	const transport = t(`peers.transport.${connection.transport}`);
	if (!connection.relayed) return t('peers.directOver', { transport });
	return connection.via
		? t('peers.relayedVia', { transport, relay: shortId(connection.via) })
		: t('peers.relayedOver', { transport });
}

/**
 * The sum line: "2 peers: 1 relay, 1 browser (direct, WebRTC)".
 *
 * @param {ReturnType<typeof summaryOf>} summary
 * @param {(key: string, values?: Record<string, string | number>) => string} t
 */
export function summaryText(summary, t) {
	if (summary.total === 0) return t('peers.none');
	const parts = [summary.relays > 0 ? t('peers.relays', { count: summary.relays }) : t('peers.noRelay')];
	if (summary.browsers > 0) {
		const single = summary.ways.length === 1;
		const ways = summary.ways.map((way) => {
			const how = way.relayed ? t('peers.relayed') : t('peers.directWay', { transport: t(`peers.transport.${way.transport}`) });
			return single ? how : t('peers.wayCount', { count: way.count, way: how });
		});
		parts.push(t('peers.browsersWays', { browsers: t('peers.browsers', { count: summary.browsers }), ways: ways.join('; ') }));
	}
	return t('peers.summary', { peers: t('peers.total', { count: summary.total }), parts: parts.join(', ') });
}
