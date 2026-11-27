/**
 * The devices of a DID, in its own card: where its contacts send their requests
 * (contact-protocol.js). Pure rules, without app state (devices.spec.js).
 *
 * Each device of Alice adds its libp2p peer, with when it was seen, to her own card. Her
 * card goes into every contact's book, sealed to that book's owner, so only her contacts
 * learn her devices; neither a relay nor a stranger does. A stranger reaches her through
 * the device her QR code names (contact-address.js).
 *
 * The card changes only when it has to, so the books' logs grow little: a new device, or
 * one not seen for DEVICE_REFRESH_MS. A device not seen for DEVICE_TTL_MS drops out with
 * the next change.
 */
import { isPeerId } from './contact-protocol.js'

export const DEVICE_REFRESH_MS = 7 * 24 * 60 * 60 * 1000
export const DEVICE_TTL_MS = 60 * 24 * 60 * 60 * 1000
export const MAX_DEVICES = 8
/** a device clock ahead of ours by up to this is still believed */
const CLOCK_SKEW_MS = 10 * 60 * 1000

/**
 * The devices a card names, most recently seen first: well-formed ones only, each once,
 * none older than DEVICE_TTL_MS.
 *
 * @returns {{ peer: string, seenAt: number }[]}
 */
export function devicesOf(card, now = Date.now()) {
    const listed = Array.isArray(card?.devices) ? card.devices : []
    const newest = new Map()
    for (const device of listed) {
        if (!device || !isPeerId(device.peer) || !Number.isSafeInteger(device.seenAt)) continue
        if (now - device.seenAt >= DEVICE_TTL_MS || device.seenAt > now + CLOCK_SKEW_MS) continue
        if ((newest.get(device.peer)?.seenAt ?? -1) < device.seenAt) newest.set(device.peer, { peer: device.peer, seenAt: device.seenAt })
    }
    return [...newest.values()].sort((a, b) => b.seenAt - a.seenAt)
}

/**
 * Our own card with this device in it, or null when the card names it recently enough and
 * holds nothing to drop: then nothing is written.
 *
 * @param {Record<string, any>} card our own card
 * @param {string} peer this device's peer id
 */
export function withDevice(card, peer, now = Date.now()) {
    if (!isPeerId(peer)) return null
    const devices = devicesOf(card, now)
    const mine = devices.find((device) => device.peer === peer)
    const listed = Array.isArray(card?.devices) ? card.devices.length : 0
    if (mine && now - mine.seenAt < DEVICE_REFRESH_MS && devices.length === listed) return null
    const next = [{ peer, seenAt: now }, ...devices.filter((device) => device.peer !== peer)].slice(0, MAX_DEVICES)
    return { ...card, devices: next }
}
