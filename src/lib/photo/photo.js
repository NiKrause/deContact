/**
 * A contact's photo (#87): a small square image inside the sealed part of the card.
 *
 * - The card carries it as a data URL, `data:image/webp;base64,…` (or `image/jpeg`), under
 *   `photo`. It is sealed with the name and the address (encryption/cards.js), so it
 *   travels through the relays and arrives while its owner is offline, and only the
 *   card's reader opens it. Nothing new stands in the clear.
 * - The picked image is cropped to its centre square, scaled to PHOTO_SIDE × PHOTO_SIDE on
 *   a canvas and encoded again: WebP, or JPEG where the browser does not encode WebP
 *   (Safari gives a PNG instead). The quality goes down until it fits MAX_PHOTO_BYTES.
 * - Encoding a canvas again writes the pixels and nothing else: the EXIF block of the
 *   original file, with any location, does not survive.
 * - Every change of the card writes the photo into the log again; the cap keeps that small.
 *   A card with a photo of MAX_PHOTO_BYTES stays below 60 KB sealed, far from the 4 MiB
 *   that libp2p streams, gossipsub and bitswap accept for one message.
 */

/** width and height of a photo, in pixels */
export const PHOTO_SIDE = 256
/** the most bytes a photo we make may have, before the data URL (base64 adds a third) */
export const MAX_PHOTO_BYTES = 30 * 1024
/**
 * The most bytes a photo on a card may have to be shown. A contact's app may encode a
 * little differently; anything bigger, or anything but a WebP or JPEG data URL (a link that
 * would load from elsewhere, an SVG), is not shown.
 */
export const MAX_SHOWN_PHOTO_BYTES = 64 * 1024

/** what we encode to, in this order */
const TYPES = ['image/webp', 'image/jpeg']
/** tried from the first to the last until the photo fits */
const QUALITIES = [0.85, 0.75, 0.65, 0.55, 0.45, 0.35, 0.25, 0.15]
const PHOTO_URL = /^data:image\/(?:webp|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/

/**
 * The centre square of an image.
 *
 * @param {number} width
 * @param {number} height
 * @returns {{ x: number, y: number, side: number }}
 */
export function squareCrop(width, height) {
    if (!(width > 0 && height > 0)) throw new RangeError('An image has a width and a height')
    const side = Math.min(width, height)
    return { x: Math.floor((width - side) / 2), y: Math.floor((height - side) / 2), side }
}

/**
 * The first encoding that fits: each type in turn, each quality from high to low. A type
 * the browser does not encode (it hands back another type, or nothing) is skipped.
 *
 * @param {(type: string, quality: number) => Promise<Blob | null>} encode
 * @param {{ types?: string[], qualities?: number[], maxBytes?: number }} options
 * @returns {Promise<Blob>}
 */
export async function fitPhoto(encode, { types = TYPES, qualities = QUALITIES, maxBytes = MAX_PHOTO_BYTES } = {}) {
    for (const type of types) {
        for (const quality of qualities) {
            const blob = await encode(type, quality)
            if (!blob || blob.type !== type) break
            if (blob.size <= maxBytes) return blob
        }
    }
    throw new Error(`the photo does not fit into ${maxBytes} bytes`)
}

/**
 * A photo for a card from an image file the person picked or took: the centre square,
 * PHOTO_SIDE pixels wide, WebP or JPEG, at most MAX_PHOTO_BYTES, without the file's
 * metadata. Runs in the browser.
 *
 * @param {Blob} file
 * @param {{ types?: string[], qualities?: number[], maxBytes?: number }} options for the tests
 * @returns {Promise<string>} a data URL
 */
export async function photoFromFile(file, options) {
    // the browser turns the image upright as its EXIF orientation says
    const image = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = PHOTO_SIDE
    try {
        const { x, y, side } = squareCrop(image.width, image.height)
        const context = canvas.getContext('2d')
        // a transparent image on white, not on black (JPEG has no transparency)
        context.fillStyle = '#fff'
        context.fillRect(0, 0, PHOTO_SIDE, PHOTO_SIDE)
        context.imageSmoothingEnabled = true
        context.imageSmoothingQuality = 'high'
        context.drawImage(image, x, y, side, side, 0, 0, PHOTO_SIDE, PHOTO_SIDE)
    } finally {
        image.close()
    }
    const blob = await fitPhoto((type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality)), options)
    return dataUrlOf(blob)
}

/** @param {Blob} blob */
function dataUrlOf(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(/** @type {string} */ (reader.result))
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(blob)
    })
}

/**
 * Whether a card's `photo` may be shown: a WebP or JPEG data URL of at most
 * MAX_SHOWN_PHOTO_BYTES. A card comes from its owner's app, which may be any app.
 *
 * @param {unknown} value
 * @returns {value is string}
 */
export function isPhoto(value) {
    if (typeof value !== 'string' || value.length > 32 + Math.ceil(MAX_SHOWN_PHOTO_BYTES / 3) * 4) return false
    const base64 = PHOTO_URL.exec(value)?.[1]
    return base64 !== undefined && base64.length % 4 === 0 && bytesOfBase64(base64) <= MAX_SHOWN_PHOTO_BYTES
}

/** how many bytes a base64 text decodes to */
const bytesOfBase64 = (base64) => (base64.length / 4) * 3 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0)
