<script>
    /**
     * @component The camera that reads a contact's QR code: the `<qr-scanner>` element of
     * @le-space/libp2p-webrtc-qr, as libp2p-webrtc-qr's demo uses it. It owns the camera
     * (released on every way out), reads with the browser's BarcodeDetector or jsQR, and
     * says why it cannot (http, refused, no camera) in its own dialog. Its code (some
     * 450 KB) is loaded on the first scan, not with the app.
     *
     * The words are deContact's (i18n `scanner.*`); a code that is no contact address or
     * invitation keeps the camera running and says so.
     */
    import { scanTarget } from '#lib/network/contact-address.js'
    import { t } from '#lib/i18n/index.js'

    /** onscan: what the code asks for (contact-address.js scanTarget) */
    let { onscan } = $props()
    let element = $state()

    const strings = () => ({
        label: t('scanner.label'),
        close: t('scanner.close'),
        unsupported: t('scanner.unsupported'),
        insecure: t('scanner.insecure'),
        denied: t('scanner.denied'),
        noDevice: t('scanner.noDevice'),
        starting: t('scanner.starting'),
        looking: t('scanner.looking'),
        stillLooking: ({ attempts }) => t('scanner.stillLooking', { attempts }),
        rejected: t('scanner.notContact'),
        animated: ({ received, total }) => t('scanner.animated', { received, total }),
        animatedUnknown: t('scanner.animatedUnknown')
    })

    /** opens the camera; what goes wrong is said in the scanner's own dialog */
    export async function open() {
        await import('@le-space/libp2p-webrtc-qr/elements')
        await customElements.whenDefined('qr-scanner')
        element.strings = strings()
        element.validate = (text) => (scanTarget(text) ? { ok: true } : { ok: false, reason: t('scanner.notContact') })
        try {
            await element.open()
        } catch (error) {
            console.log('the camera did not open:', error?.name, error?.message)
        }
    }

    function scanned(event) {
        const target = scanTarget(event.detail.text)
        if (target) onscan?.(target)
    }
</script>

<qr-scanner bind:this={element} onscan={scanned} data-testid="qr-scanner"></qr-scanner>
