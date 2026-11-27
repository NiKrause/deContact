/**
 * A QR code as an SVG: square, black on white, with the quiet zone of 4 modules a reader
 * needs around it. It scales to any size without blurring, unlike the 200 px JPEG of
 * svelte-qrcode, whose modules sat in the top left corner with no margin at the top or
 * on the left. Pure (qr-image.spec.js).
 */
import qrcode from 'qrcode-generator'

/** the quiet zone the QR standard asks for, in modules */
export const QUIET_ZONE = 4

/**
 * @param {string} text what the code holds
 * @param {{ level?: 'L' | 'M' | 'Q' | 'H' }} options level: error correction (M: a scratch or a glare).
 *   A text too long for it gets L, which holds the most (a device link: PasskeySettings.svelte).
 * @returns {{ svg: string, modules: number, level: string }} modules: the code's width without the quiet zone
 */
export function qrSvg(text, { level = 'M' } = {}) {
    let qr
    try {
        qr = made(text, level)
    } catch (error) {
        if (level === 'L') throw error
        qr = made(text, 'L')
        level = 'L'
    }
    const modules = qr.getModuleCount()
    const size = modules + 2 * QUIET_ZONE
    let path = ''
    for (let row = 0; row < modules; row++) {
        for (let col = 0; col < modules; col++) {
            if (qr.isDark(row, col)) path += `M${col + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`
        }
    }
    const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">` +
        `<rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`
    return { svg, modules, level }
}

function made(text, level) {
    const qr = qrcode(0, level)
    qr.addData(text)
    qr.make()
    return qr
}

/** the SVG as an image source */
export function qrDataUrl(text, options) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg(text, options).svg)}`
}
