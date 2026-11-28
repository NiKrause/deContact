/**
 * Answer `/orbitdb/heads/<address>`, but do not announce it.
 *
 * OrbitDB registers one libp2p protocol per open database: our own address book, every
 * contact's book we hold open, the vault directory. All of them went out in identify and
 * identify-push, which cost:
 *
 * - **Size.** About 75 bytes per database. orbitdb-relay reads identify with libp2p's
 *   8 KiB default and drops a larger message whole, so past about a hundred open books it
 *   no longer learns what the browser offers.
 * - **Pushes.** Opening or closing a database changes the protocol list, and identify-push
 *   then sends the whole list again to every connected peer.
 *
 * Nothing reads the announcement. OrbitDB's Sync starts the heads exchange from gossipsub
 * (a peer subscribing to the database's topic, a new connection to a subscriber) and dials
 * the protocol with `dialProtocol`, which libp2p negotiates on the stream without looking
 * at what the other side announced. What has to stay is that we accept the protocol when
 * it is dialled, and libp2p reads that from the registrar's own `getProtocols()`, which this
 * leaves alone.
 *
 * {@link withoutOrbitdbHeadsAnnouncements} wraps the identify and identify-push service
 * factories so that only they see a filtered view:
 * - `registrar.getProtocols()` without heads protocols (what identify-push sends);
 * - `peerStore.get(self)` without them (what an identify response sends);
 * - `self:peer:update` dropped when nothing announced changed, so opening or closing a
 *   database pushes nothing.
 *
 * Taken from orbitdb-relay 0.11.1 (src/services/identify-announcements.ts), which wraps its
 * own identify the same way. Its package exports only the Node relay, so the browser keeps
 * this copy; the one change is that metadata is compared without Node's Buffer.
 */

/** Prefix of OrbitDB's per-database heads protocol ids. */
export const ORBITDB_HEADS_PROTOCOL_PREFIX = '/orbitdb/heads/';

/** @param {unknown} protocol whether it is one of OrbitDB's per-database heads protocols */
export function isOrbitdbHeadsProtocol(protocol) {
	return typeof protocol === 'string' && protocol.startsWith(ORBITDB_HEADS_PROTOCOL_PREFIX);
}

/**
 * The protocols a node announces: all but OrbitDB's per-database heads protocols.
 *
 * @param {readonly string[]} protocols
 */
export function announcedProtocols(protocols) {
	return protocols.filter((protocol) => !isOrbitdbHeadsProtocol(protocol));
}

/**
 * Wrap a libp2p service factory, `identify()` or `identifyPush()`, so the service announces
 * no `/orbitdb/heads/*` protocol. The node still answers them. Wrap both: wrapping only one
 * leaves the other announcing the full list.
 *
 * @template T
 * @param {(components: any) => T} factory
 * @returns {(components: any) => T}
 */
export function withoutOrbitdbHeadsAnnouncements(factory) {
	return (components) => factory(announcementView(components));
}

/** Bind methods to the real object: libp2p's emitters and stores check `this`. */
function passThrough(target, prop) {
	const value = Reflect.get(target, prop, target);
	return typeof value === 'function' ? value.bind(target) : value;
}

function announcementView(components) {
	const views = new WeakMap();
	const viewOf = (target, make) => {
		if (target == null || (typeof target !== 'object' && typeof target !== 'function')) {
			return target;
		}
		let view = views.get(target);
		if (view === undefined) {
			view = make(target);
			views.set(target, view);
		}
		return view;
	};
	return new Proxy(components, {
		get(target, prop) {
			if (prop === 'registrar') return viewOf(Reflect.get(target, prop), registrarView);
			if (prop === 'peerStore') {
				return viewOf(Reflect.get(target, prop), (peerStore) =>
					peerStoreView(peerStore, () => target.peerId)
				);
			}
			if (prop === 'events') return viewOf(Reflect.get(target, prop), eventsView);
			return Reflect.get(target, prop);
		}
	});
}

function registrarView(registrar) {
	return new Proxy(registrar, {
		get(target, prop) {
			// read at call time, so a protocol handled later is filtered too
			if (prop === 'getProtocols') return () => announcedProtocols(target.getProtocols());
			return passThrough(target, prop);
		}
	});
}

function peerStoreView(peerStore, selfPeerId) {
	return new Proxy(peerStore, {
		get(target, prop) {
			if (prop === 'get') {
				return async (peerId, options) => {
					const peer = await target.get(peerId, options);
					if (peer == null || selfPeerId()?.equals?.(peerId) !== true) return peer;
					return { ...peer, protocols: announcedProtocols(peer.protocols ?? []) };
				};
			}
			return passThrough(target, prop);
		}
	});
}

/**
 * What identify-push sends about this node, apart from the parts it computes fresh:
 * protocols (filtered), addresses, and metadata such as the agent version. Two updates with
 * the same signature announce nothing new.
 */
function announcedSignature(peer) {
	if (peer == null) return null;
	const metadata = Array.from(peer.metadata?.entries?.() ?? [], ([key, value]) => [
		key,
		Array.from(value ?? []).join(',')
	]).sort();
	return JSON.stringify([
		announcedProtocols(peer.protocols ?? []).sort(),
		Array.from(peer.addresses ?? [], (address) => String(address?.multiaddr)).sort(),
		metadata
	]);
}

function eventsView(events) {
	const wrapped = new WeakMap();
	const wrap = (listener) => {
		if (listener == null) return listener;
		let filtered = wrapped.get(listener);
		if (filtered === undefined) {
			const call = (event) =>
				typeof listener === 'function' ? listener(event) : listener.handleEvent?.(event);
			filtered = (event) => {
				const detail = event?.detail;
				if (
					detail?.previous != null &&
					announcedSignature(detail.peer) === announcedSignature(detail.previous)
				) {
					return;
				}
				return call(event);
			};
			wrapped.set(listener, filtered);
		}
		return filtered;
	};
	return new Proxy(events, {
		get(target, prop) {
			if (prop === 'addEventListener') {
				return (type, listener, options) =>
					target.addEventListener(
						type,
						type === 'self:peer:update' ? wrap(listener) : listener,
						options
					);
			}
			if (prop === 'removeEventListener') {
				return (type, listener, options) =>
					target.removeEventListener(
						type,
						type === 'self:peer:update' ? (wrapped.get(listener) ?? listener) : listener,
						options
					);
			}
			return passThrough(target, prop);
		}
	});
}
