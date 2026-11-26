import { describe, expect, it } from 'vitest'
import { contactKey, createInvitation, mayWrite } from '@le-space/orbitdb-access-controller-decontact'
import { rootPayload } from '@le-space/orbitdb-identity-provider-webauthn-did/vault'
import { encryptionKeysOf, signerOf } from '../identity/vault.js'
import { openCard, sealCard } from '../encryption/cards.js'
import { MADE_UP_PLACE, metadataOf, withExif } from '../../../tests/helpers/exif.js'
import { MAX_PHOTO_BYTES, MAX_SHOWN_PHOTO_BYTES, fitPhoto, isPhoto, squareCrop } from './photo.js'

// The parts of the photo (#87) that need no canvas. Encoding a real image, its size and
// that its metadata is gone: photo.browser.spec.js, in Chromium.

/** a fake encoder: the size each type has at each quality, and the calls it got */
function encoder(sizes) {
    const calls = []
    const encode = async (type, quality) => {
        calls.push([type, quality])
        const size = sizes[type]?.(quality)
        if (size === undefined) return { type: 'image/png', size: 99_999 } // as Safari answers for WebP
        return { type, size }
    }
    return { encode, calls }
}

const base64Of = (bytes) => Buffer.from(bytes).toString('base64')
const photoOf = (bytes, type = 'webp') => `data:image/${type};base64,${base64Of(new Uint8Array(bytes))}`

describe('the square of a photo', () => {
    it('is the centre of a landscape, a portrait and a square image', () => {
        expect(squareCrop(4000, 3000)).toEqual({ x: 500, y: 0, side: 3000 })
        expect(squareCrop(3000, 4001)).toEqual({ x: 0, y: 500, side: 3000 })
        expect(squareCrop(256, 256)).toEqual({ x: 0, y: 0, side: 256 })
    })

    it('needs an image', () => {
        expect(() => squareCrop(0, 10)).toThrow()
        expect(() => squareCrop(Number.NaN, 10)).toThrow()
    })
})

describe('the size cap', () => {
    it('lowers the quality until the photo fits', async () => {
        const { encode, calls } = encoder({ 'image/webp': (q) => Math.round(q * 50_000) })
        const blob = await fitPhoto(encode)
        expect(blob.type).toBe('image/webp')
        expect(blob.size).toBeLessThanOrEqual(MAX_PHOTO_BYTES)
        // the first quality that fits, not a lower one
        expect(calls.at(-1)[1] * 50_000).toBeLessThanOrEqual(MAX_PHOTO_BYTES)
        expect(calls.at(-2)[1] * 50_000).toBeGreaterThan(MAX_PHOTO_BYTES)
    })

    it('takes JPEG where the browser does not encode WebP', async () => {
        const { encode, calls } = encoder({ 'image/jpeg': () => 20_000 })
        const blob = await fitPhoto(encode)
        expect(blob).toEqual({ type: 'image/jpeg', size: 20_000 })
        expect(calls).toEqual([['image/webp', 0.85], ['image/jpeg', 0.85]])
    })

    it('takes JPEG where WebP does not fit even at the lowest quality', async () => {
        const { encode } = encoder({ 'image/webp': () => MAX_PHOTO_BYTES + 1, 'image/jpeg': (q) => (q < 0.5 ? 10_000 : 40_000) })
        expect(await fitPhoto(encode)).toEqual({ type: 'image/jpeg', size: 10_000 })
    })

    it('gives up rather than make a photo that is too big', async () => {
        const { encode } = encoder({ 'image/webp': () => MAX_PHOTO_BYTES + 1, 'image/jpeg': () => MAX_PHOTO_BYTES + 1 })
        await expect(fitPhoto(encode)).rejects.toThrow(/does not fit/)
    })
})

describe('a photo on a card', () => {
    it('is shown when it is a WebP or JPEG data URL of a sensible size', () => {
        expect(isPhoto(photoOf([1, 2, 3, 4, 5]))).toBe(true)
        expect(isPhoto(photoOf([1, 2, 3, 4], 'jpeg'))).toBe(true)
        expect(isPhoto(photoOf(new Uint8Array(MAX_SHOWN_PHOTO_BYTES)))).toBe(true)
    })

    it('is not shown when it is anything else', () => {
        for (const value of [
            undefined,
            null,
            42,
            '',
            'https://tracker.example.com/pixel.webp', // would load from elsewhere when shown
            'javascript:alert(1)',
            'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', // may hold a script
            'data:image/png;base64,iVBORw0KGgo=',
            'data:image/webp,notbase64',
            'data:image/webp;base64,AAA', // not a whole base64 text
            'data:image/webp;base64,AAAA"><img src=x>',
            photoOf(new Uint8Array(MAX_SHOWN_PHOTO_BYTES + 1))
        ]) {
            expect(isPhoto(value), String(value).slice(0, 60)).toBe(false)
        }
    })
})

async function person(fill) {
    const opened = { payload: rootPayload(new Uint8Array(32).fill(fill)) }
    const signer = await signerOf(opened)
    return { did: signer.did, signer, keys: await encryptionKeysOf(opened, signer.did) }
}
const alice = await person(21)
const bob = await person(22)
// the biggest photo we make, of bytes that do not compress
const bigPhoto = photoOf(crypto.getRandomValues(new Uint8Array(MAX_PHOTO_BYTES)))
const alicesCard = async () => ({
    _id: contactKey(alice.did),
    owner: alice.did,
    firstName: 'Alice',
    lastName: 'Wolkenfabrik',
    city: 'Musterstadt',
    photo: bigPhoto,
    sharedAddress: '/orbitdb/zdpuAlicesBook',
    invitation: await createInvitation(bob.signer, bob.did, alice.did)
})

describe('a card with a photo', () => {
    it('keeps the photo in the sealed part; Bob opens it, the access controller still accepts it', async () => {
        const stored = await sealCard(await alicesCard(), { bookOwner: bob.did, writer: alice.did })
        expect(Object.keys(stored).sort()).toEqual(['_id', 'invitation', 'owner', 'sealed'])
        const text = JSON.stringify(stored)
        expect(text).not.toContain(bigPhoto.slice(30, 90))
        expect(text).not.toContain('data:image')
        expect(await mayWrite({ owner: bob.did, writer: alice.did, payload: { op: 'PUT', key: stored._id, value: stored } })).toBe(true)
        expect((await openCard(stored, { bookOwner: bob.did, keys: bob.keys })).photo).toBe(bigPhoto)
        expect(await openCard(stored, { bookOwner: bob.did })).not.toHaveProperty('photo')
    })

    it('stays far below what libp2p, gossipsub and bitswap accept for one message (4 MiB)', async () => {
        const stored = await sealCard(await alicesCard(), { bookOwner: bob.did, writer: alice.did })
        const bytes = new TextEncoder().encode(JSON.stringify(stored)).length
        expect(bytes).toBeLessThan(60 * 1024)
        expect(bytes).toBeLessThan((4 * 1024 * 1024) / 50)
    })
})

describe('the EXIF test image', () => {
    // a JPEG of nothing: start, a JFIF header, end
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...Buffer.from('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9])

    it('carries a place and GPS in an EXIF block, which the look for metadata finds', () => {
        expect(metadataOf(jpeg)).toEqual({ type: 'jpeg', metadata: [] })
        const tagged = withExif(jpeg)
        expect(metadataOf(tagged)).toEqual({ type: 'jpeg', metadata: ['place', 'EXIF'] })
        expect(Buffer.from(tagged).includes(Buffer.from(MADE_UP_PLACE))).toBe(true)
        // GPSLatitudeRef 'N' in the GPS block
        expect(Buffer.from(tagged).includes(Buffer.from([0x00, 0x01, 0x00, 0x02, 0x00, 0x00, 0x00, 0x02, 0x4e, 0x00]))).toBe(true)
    })
})
