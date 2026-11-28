import { webSockets } from "@libp2p/websockets";
import { webRTC, webRTCDirect } from "@libp2p/webrtc";
import { bootstrap } from '@libp2p/bootstrap'
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2'
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { pubsubPeerDiscovery } from "@libp2p/pubsub-peer-discovery";
import { identify, identifyPush } from '@libp2p/identify'
import { autoNAT } from '@libp2p/autonat'
import { gossipsub } from "@libp2p/gossipsub";
import { ping } from '@libp2p/ping'
import { dcutr } from '@libp2p/dcutr'
import { FaultTolerance } from '@libp2p/interface'
import { alephBootstrapDiscovery } from '@le-space/aleph-bootstrap'
import { isInsecureWebSocketDial } from './lib/network/dial-policy.js'
import { withoutOrbitdbHeadsAnnouncements } from './lib/network/identify-announcements.js'

const list = (value) => (value ?? '').split(',').map((entry) => entry.trim()).filter(Boolean)
const development = import.meta.env.MODE === 'development'

/** the relays (src/relay.js) the browser dials first */
export const seedNodes = list(development ? import.meta.env.VITE_SEED_NODES_DEV : import.meta.env.VITE_SEED_NODES)

/** whether to look for more relays on Aleph (VITE_ALEPH_RELAY_DISCOVERY=false turns it off) */
export const alephRelayDiscovery = import.meta.env.VITE_ALEPH_RELAY_DISCOVERY !== 'false'

/**
 * Le Space's production orbitdb-relays on Aleph. A deployed relay registers as
 * `relay:<profile>:<name>:<instance hash>`; the name finds it on whatever instance it runs
 * and keeps out other relay kinds and the throwaway relays smoke and E2E runs register in
 * the same channel (`relay:orbitdb-relay:smoke-…`), whose addresses are dead.
 */
export const ALEPH_RELAY_PROFILE = 'orbitdb-relay'
export const ALEPH_RELAY_REGISTRATION = 'relay:orbitdb-relay:orbitdb-relay'

/**
 * Peer store tags of the relays libp2p dials by itself: the configured ones (@libp2p/bootstrap)
 * and the ones found on Aleph (@le-space/aleph-bootstrap). Both tag a relay before announcing it.
 */
export const RELAY_TAGS = ['bootstrap', 'aleph-bootstrap']

/**
 * Topics on which browsers announce their addresses to each other. Defaults to the topic
 * Le Space's orbitdb-relays forward (orbitdb-relay's own default), so deContact finds other
 * browsers through them without changes on the relays. Other apps' browsers on those relays
 * announce themselves there too.
 */
export const ORBITDB_RELAY_DISCOVERY_TOPIC = 'todo._peer-discovery._p2p._pubsub'
const configuredTopics = list(development ? import.meta.env.VITE_P2P_PUPSUB_DEV : import.meta.env.VITE_P2P_PUPSUB)
export const pubSubPeerDiscoveryTopics = configuredTopics.length > 0 ? configuredTopics : [ORBITDB_RELAY_DISCOVERY_TOPIC]

/**
 * A relay before orbitdb-relay 0.11 announces one /orbitdb/heads/<address> protocol per
 * address book it holds. Past libp2p's 8 KiB default the whole identify message is dropped,
 * and with it the relay's hop protocol: no reservation, no /p2p-circuit address, unreachable
 * while still visible over gossipsub. identifyPush reads later updates against the same limit.
 * Our own identify leaves those protocols out (lib/network/identify-announcements.js).
 */
export const IDENTIFY_MAX_MESSAGE_SIZE = 65_536

const iceServers = [{ urls: ['stun:stun.l.google.com:19302', 'stun:global.stun.twilio.com:3478'] }]

/**
 * libp2p configuration for the browser.
 *
 * @param {{ webRTC?: boolean, relays?: string[], alephRelays?: boolean }} options webRTC false: reach
 * other browsers only through the relay; relays: the relays to dial first (default: VITE_SEED_NODES);
 * alephRelays: also dial Le Space's relays found on Aleph (default: VITE_ALEPH_RELAY_DISCOVERY)
 */
export function createLibp2pConfig({ webRTC: webRTCEnabled = true, relays = seedNodes, alephRelays = alephRelayDiscovery } = {}) {
    return {
        addresses: {
            // a browser can't listen on /ws or /wss; it is reachable through a relay
            // reservation (/p2p-circuit) and, if enabled, WebRTC on top of it
            listen: webRTCEnabled ? ['/p2p-circuit', '/webrtc'] : ['/p2p-circuit']
        },
        transports: [
            webSockets(),
            ...(webRTCEnabled
                ? [webRTC({ rtcConfiguration: { iceServers } }), webRTCDirect({ rtcConfiguration: { iceServers } })]
                : []),
            circuitRelayTransport({ reservationCompletionTimeout: 20_000 })
        ],
        connectionEncrypters: [noise()],
        streamMuxers: [yamux()],
        transportManager: {
            faultTolerance: FaultTolerance.NO_FATAL
        },
        connectionGater: {
            denyDialMultiaddr: (ma) => isInsecureWebSocketDial(ma)
        },
        peerDiscovery: [
            // @libp2p/bootstrap refuses an empty list
            ...(relays.length > 0 ? [bootstrap({ list: relays })] : []),
            pubsubPeerDiscovery({
                interval: 5000,
                topics: pubSubPeerDiscoveryTopics,
                listenOnly: false
            })
        ],
        services: {
            // answer every open book's /orbitdb/heads/<address>, but don't list them
            identify: withoutOrbitdbHeadsAnnouncements(identify({ maxMessageSize: IDENTIFY_MAX_MESSAGE_SIZE })),
            identifyPush: withoutOrbitdbHeadsAnnouncements(identifyPush({ maxMessageSize: IDENTIFY_MAX_MESSAGE_SIZE })),
            ping: ping({ timeout: 10_000 }),
            autoNAT: autoNAT(),
            ...(webRTCEnabled ? { dcutr: dcutr() } : {}),
            // runOnLimitedConnection: two browsers often only share a relayed connection,
            // and OrbitDB announces new heads over gossipsub
            pubsub: gossipsub({ allowPublishToZeroTopicPeers: true, canRelayMessage: true, runOnLimitedConnection: true }),
            // Le Space's relays on Aleph: the ones found on an earlier start are dialled at once
            // (kept in localStorage as the signed registrations, verified again on load); Aleph
            // is asked behind them when that list is empty or six hours old, or when none of
            // them answers within 10 s. A service, not a peerDiscovery entry, so the app can
            // listen to what it finds.
            ...(alephRelays
                ? { alephRelays: alephBootstrapDiscovery({ profile: ALEPH_RELAY_PROFILE, registrationId: ALEPH_RELAY_REGISTRATION }) }
                : {})
        }
    }
}
