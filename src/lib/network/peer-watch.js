import { peerListOf } from './peer-list.js';

/** what a relay offers and a browser does not: browsers run only the circuit's stop side */
export const CIRCUIT_RELAY_HOP_PROTOCOL = '/libp2p/circuit/relay/0.2.0/hop';

/**
 * Keeps the list of connected peers current (peer-list.js): rebuilt when a connection opens or
 * closes and when identify tells what a peer offers. libp2p's events only, no polling; a burst
 * of them builds the list once more at most, after the build that is running.
 *
 * A peer is a relay when the peer store tags it as one (RELAY_TAGS: the configured relays and
 * the ones found on Aleph) or identify says it offers the hop protocol.
 *
 * @param {import('libp2p').Libp2p} libp2p
 * @param {{ relayTags?: string[], onChange: (peers: ReturnType<typeof peerListOf>) => void }} options
 * @returns {() => void} stop
 */
export function watchPeers(libp2p, { relayTags = [], onChange }) {
	let building = false;
	let again = false;
	let stopped = false;

	/** @param {import('@libp2p/interface').PeerId} remotePeer */
	async function isRelay(remotePeer) {
		const peer = await libp2p.peerStore.get(remotePeer).catch(() => null);
		return (
			relayTags.some((tag) => peer?.tags?.has(tag) ?? false) ||
			(peer?.protocols ?? []).includes(CIRCUIT_RELAY_HOP_PROTOCOL)
		);
	}

	async function build() {
		// a closing connection is on its way out of the list
		const connections = libp2p.getConnections().filter((c) => c.status == null || c.status === 'open');
		const peers = new Map(connections.map((c) => [c.remotePeer.toString(), c.remotePeer]));
		const relays = new Set();
		await Promise.all(
			[...peers].map(async ([id, remotePeer]) => {
				if (await isRelay(remotePeer)) relays.add(id);
			})
		);
		return peerListOf(
			connections.map((c) => ({
				remotePeer: c.remotePeer.toString(),
				remoteAddr: c.remoteAddr.toString(),
				limits: c.limits,
				direction: c.direction
			})),
			{ relays }
		);
	}

	async function update() {
		if (building) {
			again = true;
			return;
		}
		building = true;
		try {
			do {
				again = false;
				const list = await build();
				if (!stopped && !again) onChange(list);
			} while (again && !stopped);
		} catch (error) {
			console.log('could not list the connected peers:', /** @type {Error} */ (error)?.message);
		} finally {
			building = false;
		}
	}

	const events = /** @type {const} */ (['connection:open', 'connection:close', 'peer:identify']);
	const listener = () => void update();
	for (const event of events) libp2p.addEventListener(event, listener);
	void update();
	return () => {
		stopped = true;
		for (const event of events) libp2p.removeEventListener(event, listener);
	};
}
