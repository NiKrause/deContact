/**
 * How a deContact browser finds the other browsers, adapted from simple-todo:
 *
 * - libp2p 2+ stores a peer that pubsub peer discovery announces but no longer dials it,
 *   so we dial it ourselves, retry it while it keeps being announced, and give each dial
 *   10 s: a WebRTC dial (signalling over the relay, then ICE) often needs longer than
 *   libp2p's per-address default.
 * - A relayed circuit is a limited connection; OrbitDB's head exchange doesn't run on it.
 *   While a peer is only reachable through the relay we keep trying to reach it over WebRTC.
 * - We reserve a slot on a connected relay explicitly: identify may report the relay's hop
 *   protocol only after the /p2p-circuit listener has already looked for relays.
 */
const CIRCUIT_RELAY_HOP_PROTOCOL = '/libp2p/circuit/relay/0.2.0/hop'
const RETRY_INTERVAL_MS = 2_000
const RETRY_COOLDOWN_MS = 5_000
const WEBRTC_UPGRADE_COOLDOWN_MS = 30_000
const DIAL_TIMEOUT_MS = 10_000
const FORGET_AFTER_MS = 60_000
const HOP_WAIT_MS = 5_000

const isWebRTCAddr = (ma) => ma.toString().includes('/webrtc')
const isCircuitAddr = (ma) => ma.toString().includes('/p2p-circuit')
const isLimited = (connection) => connection.limits != null

/**
 * Whether a browser can dial this address at all: a WebSocket or WebRTC-direct address,
 * or a circuit through a relay reached that way (relays also announce TCP and QUIC).
 */
export function isBrowserDialable(ma) {
    const address = ma.toString()
    const [toRelay] = address.split('/p2p-circuit')
    return /\/(wss?|tls\/ws|webrtc-direct)(\/|$)/.test(toRelay)
}

/** best first: WebRTC via a relay, relayed circuit, WebRTC-direct, direct WebSocket */
function rank(ma) {
    const address = ma.toString()
    const webSocket = /\/wss?(\/|$)/.test(address) || address.includes('/tls/ws')
    if (isCircuitAddr(ma) && isWebRTCAddr(ma)) return 0
    if (isCircuitAddr(ma)) return 1
    if (address.includes('/webrtc-direct')) return 2
    if (webSocket) return 3
    return 10
}

function withPeerId(ma, peerId) {
    const last = ma.getComponents().at(-1)
    return last?.name === 'p2p' && last.value === peerId ? ma : ma.encapsulate(`/p2p/${peerId}`)
}

/**
 * @param {import('libp2p').Libp2p} libp2p
 * @param {{ webRTC?: boolean, seedPeerIds?: string[] }} options seedPeerIds: dialled by bootstrap, not here
 * @returns {() => void} stop
 */
export function startPeerConnectivity(libp2p, { webRTC = true, seedPeerIds = [] } = {}) {
    const ownId = libp2p.peerId.toString()
    const seeds = new Set(seedPeerIds)
    /** @type {Map<string, { peer: any, multiaddrs: any[], dialing: boolean, lastAttempt: number, lastSeen: number }>} */
    const discovered = new Map()
    /** @type {Map<string, Promise<boolean>>} */
    const reservations = new Map()

    async function dialDiscovered(info) {
        if (info.dialing) return
        const connections = libp2p.getConnections(info.peer)
        if (connections.some((c) => !isLimited(c))) return
        const upgrading = connections.length > 0
        if (upgrading && !webRTC) return
        const cooldown = upgrading ? WEBRTC_UPGRADE_COOLDOWN_MS : RETRY_COOLDOWN_MS
        if (Date.now() - info.lastAttempt < cooldown) return

        const candidates = info.multiaddrs
            .filter((ma) => webRTC || !isWebRTCAddr(ma))
            .filter((ma) => !upgrading || isWebRTCAddr(ma))
            .sort((a, b) => rank(a) - rank(b))
        if (candidates.length === 0) return

        info.dialing = true
        info.lastAttempt = Date.now()
        try {
            for (const ma of candidates) {
                try {
                    // force: with a relayed connection open, libp2p would otherwise hand that one back
                    const connection = await libp2p.dial(ma, { signal: AbortSignal.timeout(DIAL_TIMEOUT_MS), force: upgrading })
                    console.log(`connected to discovered peer over ${connection.remoteAddr}`)
                    return
                } catch (e) {
                    console.log(`dialling discovered peer ${ma} failed:`, e?.message)
                }
            }
        } finally {
            info.dialing = false
        }
    }

    const onDiscovery = (event) => {
        const { id, multiaddrs } = event.detail
        const peerId = id.toString()
        if (peerId === ownId || seeds.has(peerId)) return
        const info = discovered.get(peerId) ?? { peer: id, multiaddrs: [], dialing: false, lastAttempt: 0, lastSeen: 0 }
        const known = new Map(info.multiaddrs.map((ma) => [ma.toString(), ma]))
        for (const ma of multiaddrs.filter(isBrowserDialable)) {
            const full = withPeerId(ma, peerId)
            known.set(full.toString(), full)
        }
        info.multiaddrs = [...known.values()]
        info.lastSeen = Date.now()
        discovered.set(peerId, info)
        void dialDiscovered(info)
    }

    const retry = setInterval(() => {
        for (const [peerId, info] of discovered) {
            if (Date.now() - info.lastSeen > FORGET_AFTER_MS) {
                discovered.delete(peerId)
                continue
            }
            void dialDiscovered(info)
        }
    }, RETRY_INTERVAL_MS)

    const hasCircuitAddressVia = (relayId) =>
        libp2p.getMultiaddrs().some((ma) => ma.toString().includes(`/p2p/${relayId}/p2p-circuit`))

    async function reserve(connection) {
        const relayId = connection.remotePeer.toString()
        if (hasCircuitAddressVia(relayId)) return true
        const deadline = Date.now() + HOP_WAIT_MS
        let hop = false
        while (!hop && Date.now() < deadline) {
            const peer = await libp2p.peerStore.get(connection.remotePeer).catch(() => null)
            hop = peer?.protocols?.includes(CIRCUIT_RELAY_HOP_PROTOCOL) ?? false
            if (!hop) await new Promise((resolve) => setTimeout(resolve, 250))
        }
        if (!hop || hasCircuitAddressVia(relayId)) return hop
        try {
            await libp2p.components.transportManager.listen([connection.remoteAddr.encapsulate('/p2p-circuit')])
            console.log(`reserved a slot on relay ${relayId}`)
            return true
        } catch (e) {
            console.log(`relay ${relayId} refused a reservation:`, e?.message)
            return false
        }
    }

    const reserveOnRelays = () => {
        if (libp2p.getMultiaddrs().some(isCircuitAddr)) return
        for (const connection of libp2p.getConnections()) {
            const relayId = connection.remotePeer.toString()
            if (isLimited(connection) || isCircuitAddr(connection.remoteAddr) || reservations.has(relayId)) continue
            const attempt = reserve(connection).finally(() => reservations.delete(relayId))
            reservations.set(relayId, attempt)
        }
    }

    libp2p.addEventListener('peer:discovery', onDiscovery)
    libp2p.addEventListener('connection:open', reserveOnRelays)
    libp2p.addEventListener('peer:identify', reserveOnRelays)
    reserveOnRelays()

    return () => {
        clearInterval(retry)
        libp2p.removeEventListener('peer:discovery', onDiscovery)
        libp2p.removeEventListener('connection:open', reserveOnRelays)
        libp2p.removeEventListener('peer:identify', reserveOnRelays)
    }
}
