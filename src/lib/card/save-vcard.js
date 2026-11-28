/**
 * Saving a card as a vCard file (#146), in the browser: the photo as a JPEG (iOS shows no
 * WebP in a contact), then a download of `<name>.vcf`. iOS Safari opens *Add Contact* on
 * it, Android imports it from the downloads, desktops into their address book.
 */
import { toVCard, vCardFileName } from './vcard.js'
import { isPhoto } from '../photo/photo.js'

/** the card's photo as JPEG in base64, or undefined */
async function jpegOf(photo) {
    if (!isPhoto(photo)) return undefined
    const [head, base64] = photo.split(',')
    if (head.startsWith('data:image/jpeg')) return { type: 'JPEG', base64 }
    try {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
        const image = await createImageBitmap(new Blob([bytes], { type: head.slice('data:'.length, head.indexOf(';')) }))
        const canvas = document.createElement('canvas')
        canvas.width = image.width
        canvas.height = image.height
        const context = canvas.getContext('2d')
        // a transparent photo on white, as JPEG has no transparency
        context.fillStyle = '#fff'
        context.fillRect(0, 0, canvas.width, canvas.height)
        context.drawImage(image, 0, 0)
        image.close()
        return { type: 'JPEG', base64: canvas.toDataURL('image/jpeg', 0.9).split(',')[1] }
    } catch {
        return undefined
    }
}

/**
 * @param {object} card the card as the book has it
 * @param {{ link?: string, note?: string }} extra see toVCard
 */
export async function saveVCard(card, { link, note } = {}) {
    const text = toVCard(card, { link, note, photo: await jpegOf(card.photo) })
    const url = URL.createObjectURL(new Blob([text], { type: 'text/vcard;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = vCardFileName(card)
    anchor.rel = 'noopener'
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    // the download has its own copy; give the browser a moment before the URL goes
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
