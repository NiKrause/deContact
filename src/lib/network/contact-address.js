/**
 * What a QR code holds, and what the Scan field takes: whom to ask, and the device to
 * ask them on. Contact requests go peer to peer (contact-protocol.js), so a DID alone does
 * not reach anybody; the address names the libp2p peer of the app that showed it.
 *
 * - An invitation link: `<app>#/onboarding/<DID>?onBoardingToken=…&peer=<peer id>`.
 * - A contact address, for the Scan field: `<DID>?peer=<peer id>`.
 * - A DID alone is still read, and names no device: the app says so instead of asking.
 */
import { isPeerId } from './contact-protocol.js'

const DID = /did:key:z[1-9A-HJ-NP-Za-km-z]{40,60}/

/** the contact address of `did` on the device of `peer` */
export function contactAddress(did, peer) {
    return `${did}?peer=${peer}`
}

/**
 * What a scanned QR code asks for: an invitation link opens in this app (its onboarding
 * view, `hash`), a contact address or a DID becomes a request.
 *
 * @param {string} text what the camera read
 * @returns {{ kind: 'link', hash: string } | { kind: 'contact', did: string, peer?: string, onBoardingToken?: string } | null}
 */
export function scanTarget(text) {
    if (typeof text !== 'string') return null
    const address = parseContactAddress(text)
    if (!address) return null
    const at = text.indexOf('#/onboarding/')
    if (at !== -1) return { kind: 'link', hash: text.slice(at).trim() }
    return { kind: 'contact', ...address }
}

/**
 * Reads a contact address, an invitation link or a DID.
 *
 * @param {string} text what was scanned or pasted
 * @returns {{ did: string, peer?: string, onBoardingToken?: string } | null}
 */
export function parseContactAddress(text) {
    if (typeof text !== 'string') return null
    const trimmed = text.trim()
    const found = trimmed.match(DID)
    if (!found) return null
    const did = found[0]
    const at = trimmed.indexOf('?', found.index + did.length)
    const params = new URLSearchParams(at === -1 ? '' : trimmed.slice(at + 1))
    const result = { did }
    const peer = params.get('peer')
    if (isPeerId(peer)) result.peer = peer
    const token = params.get('onBoardingToken')
    if (token) result.onBoardingToken = token
    return result
}
