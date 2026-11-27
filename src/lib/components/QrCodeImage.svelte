<script>
    /**
     * @component A QR code, sharp at any size, centred in its quiet zone (lib/qr/qr-image.js).
     * Its `alt` is `label` when given: a screen reader then says what the code is, not
     * hundreds of characters of a device link. Without it, the `alt` holds what the code
     * says, which the end-to-end tests read (`img.qrcode`); in the QR dialog the button
     * around it names the code.
     */
    import { qrDataUrl } from '#lib/qr/qr-image.js'

    let { value, label } = $props()
    const src = $derived(value ? qrDataUrl(value) : '')
</script>

{#if src}<img class="qrcode" {src} alt={label ?? value} />{/if}

<style>
    .qrcode {
        display: block;
        width: 100%;
        max-width: 22rem;
        height: auto;
        aspect-ratio: 1;
        margin: 0 auto;
        background: #fff;
    }
</style>
