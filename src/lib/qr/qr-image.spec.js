import { describe, expect, it } from 'vitest'
import qrcode from 'qrcode-generator'
import { QUIET_ZONE, qrDataUrl, qrSvg } from './qr-image.js'

const link = `https://example.com/deContact/#/onboarding/did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK?onBoardingToken=${['1', 'nonce-of_alice', '1767225600000', '1', 'signature-of_alice'].join('.')}&peer=12D3KooWKnDdG3iXw9eTFijk3EWSunZcFi54Zka4wmtqtt6rPxc8`

describe('a QR code as an SVG (qr-image.js)', () => {
    it('is square, white with the quiet zone all around, the modules in the middle', () => {
        const { svg, modules } = qrSvg(link)
        const size = modules + 2 * QUIET_ZONE
        expect(svg).toContain(`viewBox="0 0 ${size} ${size}"`)
        expect(svg).toContain(`<rect width="${size}" height="${size}" fill="#fff"/>`)
        const cells = [...svg.matchAll(/M(\d+) (\d+)h1v1h-1z/g)].map(([, x, y]) => [Number(x), Number(y)])
        expect(cells.length).toBeGreaterThan(0)
        for (const [x, y] of cells) {
            expect(x).toBeGreaterThanOrEqual(QUIET_ZONE)
            expect(y).toBeGreaterThanOrEqual(QUIET_ZONE)
            expect(x).toBeLessThan(QUIET_ZONE + modules)
            expect(y).toBeLessThan(QUIET_ZONE + modules)
        }
        // the finder patterns reach the first and the last module on both axes: centred
        expect(Math.min(...cells.map(([x]) => x))).toBe(QUIET_ZONE)
        expect(Math.max(...cells.map(([x]) => x))).toBe(QUIET_ZONE + modules - 1)
        expect(Math.min(...cells.map(([, y]) => y))).toBe(QUIET_ZONE)
        expect(Math.max(...cells.map(([, y]) => y))).toBe(QUIET_ZONE + modules - 1)
    })

    it('holds the text it was made of, module for module', () => {
        const reference = qrcode(0, 'M')
        reference.addData(link)
        reference.make()
        const { svg, modules } = qrSvg(link)
        expect(modules).toBe(reference.getModuleCount())
        const dark = new Set([...svg.matchAll(/M(\d+) (\d+)h1v1h-1z/g)].map(([, x, y]) => `${x - QUIET_ZONE},${y - QUIET_ZONE}`))
        for (let row = 0; row < modules; row++) {
            for (let col = 0; col < modules; col++) expect(dark.has(`${col},${row}`)).toBe(reference.isDark(row, col))
        }
    })

    it('takes the lowest error correction for a text too long for the one asked for', () => {
        // a device link may have up to 2900 characters (PasskeySettings.svelte); M holds 2331
        const long = `https://example.com/deContact/#/link?vault=${'A'.repeat(2850)}`
        expect(qrSvg(link).level).toBe('M')
        const { level, modules } = qrSvg(long)
        expect(level).toBe('L')
        expect(modules).toBe(177)
        expect(() => qrSvg('A'.repeat(3000))).toThrow(/overflow/)
    })

    it('is an image source', () => {
        expect(qrDataUrl('did:key:z6Mk')).toMatch(/^data:image\/svg\+xml;charset=utf-8,%3Csvg/)
    })
})
