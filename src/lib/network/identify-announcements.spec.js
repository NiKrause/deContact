import { afterEach, describe, expect, it } from 'vitest';
import { createLibp2p } from 'libp2p';
import { webSockets } from '@libp2p/websockets';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { identify, identifyPush } from '@libp2p/identify';
import {
	announcedProtocols,
	isOrbitdbHeadsProtocol,
	withoutOrbitdbHeadsAnnouncements
} from './identify-announcements.js';

const BOOK = '/orbitdb/heads/orbitdb/zdpuAliceWolkenfabrikBook';
const OTHER_BOOK = '/orbitdb/heads/orbitdb/zdpuClaraBeispielBook';
const REQUEST = '/decontact/request/1.0.0';
const LATER = '/decontact/later/1.0.0';

/** a node on localhost; `wrapped`: identify and identify-push leave heads protocols out */
async function node({ wrapped }) {
	const wrap = wrapped ? withoutOrbitdbHeadsAnnouncements : (factory) => factory;
	return createLibp2p({
		addresses: { listen: ['/ip4/127.0.0.1/tcp/0/ws'] },
		transports: [webSockets()],
		connectionEncrypters: [noise()],
		streamMuxers: [yamux()],
		connectionGater: { denyDialMultiaddr: () => false },
		// push after 10 ms instead of a second
		services: { identify: wrap(identify()), identifyPush: wrap(identifyPush({ debounce: 10 })) }
	});
}

/** every protocol list `libp2p` has received from `peerId`: the identify response and each push */
function announcements(libp2p, peerId) {
	const received = [];
	libp2p.addEventListener('peer:identify', (event) => {
		if (event.detail.peerId.equals(peerId)) received.push(event.detail.protocols);
	});
	return received;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 300));

/** resolves once `libp2p` hears from identify or identify-push that `peerId` offers `protocol` */
function learns(libp2p, peerId, protocol) {
	return new Promise((resolve) => {
		const check = async () => {
			const peer = await libp2p.peerStore.get(peerId).catch(() => null);
			if (!(peer?.protocols ?? []).includes(protocol)) return;
			libp2p.removeEventListener('peer:identify', check);
			resolve(peer.protocols);
		};
		libp2p.addEventListener('peer:identify', check);
		check();
	});
}

const nodes = [];
afterEach(async () => {
	await Promise.all(nodes.splice(0).map((n) => n.stop()));
});

describe('announcedProtocols', () => {
	it("drops OrbitDB's per-database heads protocols and keeps the others", () => {
		expect(announcedProtocols([REQUEST, BOOK, '/meshsub/1.1.0', OTHER_BOOK])).toEqual([
			REQUEST,
			'/meshsub/1.1.0'
		]);
		expect(isOrbitdbHeadsProtocol(BOOK)).toBe(true);
		expect(isOrbitdbHeadsProtocol('/orbitdb/heads')).toBe(false);
		expect(isOrbitdbHeadsProtocol(undefined)).toBe(false);
	});
});

describe('withoutOrbitdbHeadsAnnouncements', () => {
	/** what identify and identify-push are given, around these components */
	function viewOf(components) {
		let view;
		withoutOrbitdbHeadsAnnouncements((given) => (view = given))(components);
		return view;
	}

	const self = { equals: (other) => other === self };
	const someoneElse = { equals: (other) => other === someoneElse };
	const peer = (protocols) => ({ protocols, addresses: [], metadata: new Map() });

	it('shows them our protocols without the books, and other peers as they are', async () => {
		const view = viewOf({
			peerId: self,
			registrar: { getProtocols: () => [REQUEST, BOOK] },
			peerStore: { get: async (id) => peer(id === self ? [REQUEST, BOOK] : [BOOK]) },
			events: new EventTarget()
		});
		expect(view.registrar.getProtocols()).toEqual([REQUEST]);
		expect((await view.peerStore.get(self)).protocols).toEqual([REQUEST]);
		expect((await view.peerStore.get(someoneElse)).protocols).toEqual([BOOK]);
	});

	it('tells identify-push of a change only when what we announce changed', () => {
		const events = new EventTarget();
		const view = viewOf({ peerId: self, events });
		const heard = [];
		const listener = (event) => heard.push(event.detail.peer.protocols);
		view.events.addEventListener('self:peer:update', listener);
		const update = (protocols, previous) =>
			events.dispatchEvent(
				new CustomEvent('self:peer:update', {
					detail: { peer: peer(protocols), previous: peer(previous) }
				})
			);

		update([REQUEST, BOOK, OTHER_BOOK], [REQUEST, BOOK]); // a book opened
		update([REQUEST, BOOK], [REQUEST, BOOK, OTHER_BOOK]); // and closed
		expect(heard).toEqual([]);
		update([REQUEST, BOOK, LATER], [REQUEST, BOOK]);
		expect(heard).toEqual([[REQUEST, BOOK, LATER]]);

		view.events.removeEventListener('self:peer:update', listener);
		update([REQUEST], [REQUEST, BOOK, LATER]);
		expect(heard).toHaveLength(1);
	});

	it('answers a book it does not announce, over a real connection', async () => {
		const browser = await node({ wrapped: true });
		const other = await node({ wrapped: false });
		nodes.push(browser, other);
		await browser.handle(BOOK, async (stream) => {
			await stream.close();
		});
		await browser.handle(REQUEST, async (stream) => {
			await stream.close();
		});

		const received = announcements(other, browser.peerId);
		await other.dial(browser.getMultiaddrs()[0]);
		await learns(other, browser.peerId, REQUEST);

		// the heads exchange dials the protocol without asking identify
		const stream = await other.dialProtocol(browser.peerId, BOOK);
		expect(stream.protocol).toBe(BOOK);
		await stream.close();

		// open and close a book, then handle something new: that one is pushed
		await browser.handle(OTHER_BOOK, async (s) => {
			await s.close();
		});
		await settle();
		await browser.unhandle(OTHER_BOOK);
		await browser.handle(LATER, async (s) => {
			await s.close();
		});
		await learns(other, browser.peerId, LATER);

		expect(received.length).toBeGreaterThanOrEqual(2);
		expect(received.flat().filter(isOrbitdbHeadsProtocol)).toEqual([]);
		// the node itself still has the book
		expect(browser.getProtocols()).toContain(BOOK);
	});

	it('without it, identify lists every open book and opening one pushes the list', async () => {
		const browser = await node({ wrapped: false });
		const other = await node({ wrapped: false });
		nodes.push(browser, other);
		await browser.handle(BOOK, async (stream) => {
			await stream.close();
		});

		await other.dial(browser.getMultiaddrs()[0]);
		expect(await learns(other, browser.peerId, BOOK)).toContain(BOOK);

		await browser.handle(OTHER_BOOK, async (s) => {
			await s.close();
		});
		expect(await learns(other, browser.peerId, OTHER_BOOK)).toContain(BOOK);
	});
});
