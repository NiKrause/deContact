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
import { isInsecureWebSocketDial } from './lib/network/dial-policy.js'

const list = (value) => (value ?? '').split(',').map((entry) => entry.trim()).filter(Boolean)
const development = import.meta.env.MODE === 'development'

/** the relays (src/relay.js) the browser dials first */
export const seedNodes = list(development ? import.meta.env.VITE_SEED_NODES_DEV : import.meta.env.VITE_SEED_NODES)

/** topics on which browsers announce their addresses to each other */
export const pubSubPeerDiscoveryTopics = list(development ? import.meta.env.VITE_P2P_PUPSUB_DEV : import.meta.env.VITE_P2P_PUPSUB)

/**
 * The relay announces one /orbitdb/heads/<address> protocol per address book it holds.
 * Past libp2p's 8 KiB default the whole identify message is dropped, and with it the
 * relay's hop protocol: no reservation, no /p2p-circuit address, unreachable while still
 * visible over gossipsub. identifyPush reads later updates against the same limit.
 */
export const IDENTIFY_MAX_MESSAGE_SIZE = 65_536

const iceServers = [{ urls: ['stun:stun.l.google.com:19302', 'stun:global.stun.twilio.com:3478'] }]

/**
 * libp2p configuration for the browser.
 *
 * @param {{ webRTC?: boolean }} options webRTC false: reach other browsers only through the relay
 */
export function createLibp2pConfig({ webRTC: webRTCEnabled = true } = {}) {
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
            bootstrap({ list: seedNodes }),
            pubsubPeerDiscovery({
                interval: 5000,
                topics: pubSubPeerDiscoveryTopics,
                listenOnly: false
            })
        ],
        services: {
            identify: identify({ maxMessageSize: IDENTIFY_MAX_MESSAGE_SIZE }),
            identifyPush: identifyPush({ maxMessageSize: IDENTIFY_MAX_MESSAGE_SIZE }),
            ping: ping({ timeout: 10_000 }),
            autoNAT: autoNAT(),
            ...(webRTCEnabled ? { dcutr: dcutr() } : {}),
            // runOnLimitedConnection: two browsers often only share a relayed connection,
            // and OrbitDB announces new heads over gossipsub
            pubsub: gossipsub({ allowPublishToZeroTopicPeers: true, canRelayMessage: true, runOnLimitedConnection: true })
        }
    }
}
