import { describe, expect, it } from 'vitest'
import { DEVICE_REFRESH_MS, DEVICE_TTL_MS, MAX_DEVICES, devicesOf, withDevice } from './devices.js'

// made-up peer ids, in the format of libp2p's
const laptop = '12D3KooWKnDdG3iXw9eTFijk3EWSunZcFi54Zka4wmtqtt6rPxc8'
const phone = '12D3KooWGrGmLRaKeqeMRzN9J2MPBas1CKcQiQPutXBTmoBHnVgS'
const now = 1_767_225_600_000
const card = { owner: 'did:key:z6MkAlice', own: true, firstName: 'Alice' }

describe('the devices in the own card (devices.js)', () => {
    it('a new device goes in, first, with when it was seen', () => {
        const once = withDevice(card, laptop, now)
        expect(once).toEqual({ ...card, devices: [{ peer: laptop, seenAt: now }] })
        const twice = withDevice(once, phone, now + 1000)
        expect(twice.devices).toEqual([{ peer: phone, seenAt: now + 1000 }, { peer: laptop, seenAt: now }])
        expect(twice.firstName).toBe('Alice')
    })

    it('nothing is written while the card names the device recently enough', () => {
        const once = withDevice(card, laptop, now)
        expect(withDevice(once, laptop, now + DEVICE_REFRESH_MS - 1)).toBeNull()
        expect(withDevice(once, laptop, now + DEVICE_REFRESH_MS).devices).toEqual([{ peer: laptop, seenAt: now + DEVICE_REFRESH_MS }])
    })

    it('a device not seen for long drops out with the next change, and the list stays short', () => {
        const old = { ...card, devices: [{ peer: phone, seenAt: now - DEVICE_TTL_MS }, { peer: laptop, seenAt: now - 1000 }] }
        expect(devicesOf(old, now)).toEqual([{ peer: laptop, seenAt: now - 1000 }])
        // the laptop is recent, but the stale phone has to go: written
        expect(withDevice(old, laptop, now).devices).toEqual([{ peer: laptop, seenAt: now }])
        const many = { ...card, devices: Array.from({ length: 12 }, (_, i) => ({ peer: i % 2 ? laptop : phone, seenAt: now - i })) }
        expect(devicesOf(many, now)).toHaveLength(2)
        expect(withDevice(card, laptop, now).devices.length).toBeLessThanOrEqual(MAX_DEVICES)
    })

    it('reads only well-formed devices, most recently seen first, each once', () => {
        const messy = {
            devices: [
                { peer: laptop, seenAt: now - 5000 },
                { peer: 'not-a-peer', seenAt: now },
                { peer: phone, seenAt: String(now) },
                { peer: phone, seenAt: now - 10 },
                { peer: laptop, seenAt: now - 1 },
                { peer: phone, seenAt: now + 24 * 60 * 60 * 1000 },
                null
            ]
        }
        expect(devicesOf(messy, now)).toEqual([{ peer: laptop, seenAt: now - 1 }, { peer: phone, seenAt: now - 10 }])
        expect(devicesOf({}, now)).toEqual([])
        expect(devicesOf(undefined, now)).toEqual([])
        expect(withDevice(card, 'not-a-peer', now)).toBeNull()
    })
})
