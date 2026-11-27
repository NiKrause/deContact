/**
 * Contact requests go from peer to peer: a libp2p protocol of deContact's own, in place
 * of a pubsub topic per DID.
 *
 * Bob's app opens a stream to Alice's peer (CONTACT_PROTOCOL), over WebRTC or a relay's
 * circuit. It writes the sealed request (contact-messages.js) and reads her receipt. No
 * topic is involved, so neither a relay nor a third peer subscribes to anything or sees a
 * message go by. The relay only carries the stream, which is sealed end to end anyway.
 *
 * - The receipt says the request arrived and was readable for Alice. It says nothing of
 *   her answer, which comes later and on its own: her card in Bob's book, or a request
 *   of her own.
 * - Bob needs Alice's libp2p peer: her invitation link and her QR code name it
 *   (contact-address.js). Alice learns Bob's from the stream his request came on.
 * - A peer whose addresses are not known yet (pubsub peer discovery announces them every
 *   few seconds) is dialled through each relay we hold a connection to:
 *   `<relay>/p2p-circuit/p2p/<peer>`, where browsers keep their reservations.
 */
import { lpStream } from '@libp2p/utils'
import { peerIdFromString } from '@libp2p/peer-id'
import { multiaddr } from '@multiformats/multiaddr'
import { MAX_SEALED_LENGTH } from './contact-messages.js'

export const CONTACT_PROTOCOL = '/decontact/request/1.0.0'
/** how long one attempt to deliver a request may take */
export const DELIVERY_TIMEOUT_MS = 20_000
/** a receipt is a few bytes */
const MAX_RECEIPT_LENGTH = 256

const encode = (text) => new TextEncoder().encode(text)
const decode = (bytes) => new TextDecoder().decode(bytes.subarray())

/** whether a text names a libp2p peer */
export function isPeerId(text) {
    if (typeof text !== 'string' || text.length > 128) return false
    try {
        peerIdFromString(text)
        return true
    } catch {
        return false
    }
}

/**
 * Alice answers the protocol: every request is read, handed to `onRequest`, and
 * acknowledged with a receipt.
 *
 * @param {import('libp2p').Libp2p} libp2p
 * @param {(text: string, from: string) => Promise<boolean>} onRequest the request as text,
 *   and the peer it came from; resolves whether it was a request for us
 * @returns {() => Promise<void>} stops answering
 */
export async function answerContactRequests(libp2p, onRequest) {
    await libp2p.handle(
        CONTACT_PROTOCOL,
        async (stream, connection) => {
            const signal = AbortSignal.timeout(DELIVERY_TIMEOUT_MS)
            try {
                const lp = lpStream(stream, { maxDataLength: MAX_SEALED_LENGTH })
                const text = decode(await lp.read({ signal }))
                const ok = await onRequest(text, connection.remotePeer.toString())
                await lp.write(encode(JSON.stringify({ v: 1, received: Boolean(ok) })), { signal })
                await stream.close({ signal })
            } catch (error) {
                stream.abort(error)
            }
        },
        // a browser reaches another one through a relay's circuit when WebRTC does not connect
        { runOnLimitedConnection: true, maxInboundStreams: 16 }
    )
    return () => libp2p.unhandle(CONTACT_PROTOCOL)
}

/** the addresses to try for `peer`: what libp2p knows, else the circuits of our relays */
export function circuitAddresses(connections, relayPeers, peer) {
    const seen = new Set()
    const addresses = []
    for (const connection of connections) {
        const relay = connection.remotePeer.toString()
        if (!relayPeers.has(relay) || seen.has(relay)) continue
        seen.add(relay)
        const base = connection.remoteAddr.toString()
        const withRelay = base.includes(`/p2p/${relay}`) ? base : `${base}/p2p/${relay}`
        addresses.push(multiaddr(`${withRelay}/p2p-circuit/p2p/${peer}`))
    }
    return addresses
}

/**
 * Bob delivers a request to Alice's peer: one stream, the request, her receipt.
 *
 * @param {import('libp2p').Libp2p} libp2p
 * @param {string} peer Alice's peer id
 * @param {string} text the sealed request (contact-messages.js sealMessage)
 * @param {{ relayPeers?: Set<string> }} options relayPeers: the relays to dial her through
 *   when libp2p knows no address of hers yet
 * @returns {Promise<{ delivered: boolean, received?: boolean, error?: string }>}
 *   delivered: her app answered the protocol; received: it could open the request
 */
export async function deliverContactRequest(libp2p, peer, text, { relayPeers = new Set() } = {}) {
    if (!isPeerId(peer)) return { delivered: false, error: 'no peer to deliver to' }
    const targets = [peerIdFromString(peer), ...circuitAddresses(libp2p.getConnections(), relayPeers, peer)]
    let lastError
    for (const target of targets) {
        const signal = AbortSignal.timeout(DELIVERY_TIMEOUT_MS)
        try {
            const stream = await libp2p.dialProtocol(target, CONTACT_PROTOCOL, { signal, runOnLimitedConnection: true })
            const lp = lpStream(stream, { maxDataLength: MAX_RECEIPT_LENGTH })
            await lp.write(encode(text), { signal })
            const receipt = JSON.parse(decode(await lp.read({ signal })))
            await stream.close({ signal }).catch(() => {})
            return { delivered: true, received: receipt?.received === true }
        } catch (error) {
            lastError = error
        }
    }
    return { delivered: false, error: lastError?.message ?? String(lastError) }
}
