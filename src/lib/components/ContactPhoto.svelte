<script>
    /**
     * @component A contact's photo (#87), round, or nothing when the card has none. Only a
     * WebP or JPEG data URL of a sensible size is shown (photo.js isPhoto): a card comes from
     * its owner's app, and a link in it would load something from elsewhere.
     */
    import { isPhoto } from '#lib/photo/photo.js'

    /** @type {{ photo?: unknown, size?: number, alt?: string, testid?: string }} */
    let { photo, size = 40, alt = '', testid = 'contact-photo' } = $props()
</script>

{#if isPhoto(photo)}
    <img class="contact-photo" src={photo} {alt} width={size} height={size} data-testid={testid} />
{/if}

<style>
    .contact-photo {
        display: block;
        flex: none;
        border-radius: 50%;
        object-fit: cover;
        background: #e0e0e0;
    }
</style>
