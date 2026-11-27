import { describe, expect, it } from 'vitest'
import { multiaddr } from '@multiformats/multiaddr'
import { contactAddress, parseContactAddress } from './contact-address.js'
import { circuitAddresses, isPeerId } from './contact-protocol.js'

// made-up, in the formats of a did:key and a libp2p peer id
const did = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
const peer = '12D3KooWKnDdG3iXw9eTFijk3EWSunZcFi54Zka4wmtqtt6rPxc8'
const relay = '12D3KooWGrGmLRaKeqeMRzN9J2MPBas1CKcQiQPutXBTmoBHnVgS'
const token = ['1', 'nonce-of_alice', '1767225600000', '1', 'signature-of_alice'].join('.')

describe('what a QR code holds and the Scan field takes (contact-address.js)', () => {
    it('a contact address names the DID and the device', () => {
        expect(contactAddress(did, peer)).toBe(`${did}?peer=${peer}`)
        expect(parseContactAddress(contactAddress(did, peer))).toEqual({ did, peer })
        expect(parseContactAddress(`  ${did}?peer=${peer}\n`)).toEqual({ did, peer })
    })

    it('an invitation link names the token too', () => {
        const link = `https://example.com/deContact/#/onboarding/${did}?onBoardingToken=${token}&peer=${peer}`
        expect(parseContactAddress(link)).toEqual({ did, peer, onBoardingToken: token })
    })

    it('a DID alone names no device', () => {
        expect(parseContactAddress(did)).toEqual({ did })
        expect(parseContactAddress(`${did}?peer=not-a-peer`)).toEqual({ did })
    })

    it('anything else is no contact address', () => {
        expect(parseContactAddress('')).toBeNull()
        expect(parseContactAddress('https://example.com/')).toBeNull()
        expect(parseContactAddress(undefined)).toBeNull()
    })
})

describe('reaching a peer (contact-protocol.js)', () => {
    it('knows a peer id from anything else', () => {
        expect(isPeerId(peer)).toBe(true)
        for (const text of ['', 'peer', did, undefined, 'x'.repeat(200)]) expect(isPeerId(text)).toBe(false)
    })

    it('dials a peer through the circuit of each relay we are connected to, once per relay', () => {
        const connection = (address, remote) => ({ remoteAddr: multiaddr(address), remotePeer: { toString: () => remote } })
        const connections = [
            connection(`/dns4/relay.example.com/tcp/443/tls/ws/p2p/${relay}`, relay),
            connection('/ip4/127.0.0.1/tcp/29302/ws', relay),
            connection(`/ip4/192.0.2.7/udp/9/webrtc/p2p/${peer}`, peer)
        ]
        const addresses = circuitAddresses(connections, new Set([relay]), peer).map(String)
        expect(addresses).toEqual([`/dns4/relay.example.com/tcp/443/tls/ws/p2p/${relay}/p2p-circuit/p2p/${peer}`])
        // a relay connection whose address names no peer gets the relay's
        const bare = circuitAddresses([connections[1]], new Set([relay]), peer).map(String)
        expect(bare).toEqual([`/ip4/127.0.0.1/tcp/29302/ws/p2p/${relay}/p2p-circuit/p2p/${peer}`])
        expect(circuitAddresses(connections, new Set(), peer)).toEqual([])
    })
})
