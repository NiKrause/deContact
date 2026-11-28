<script>
    /**
     * @component Saves a card as a vCard for the phone's own address book (#146): on the
     * invitee's form once the inviter's card is here, and on a contact's page. The vCard
     * carries the way back into deContact, the person's contact address on one of their
     * devices, where one is known (lib/card/vcard.js).
     */
    import { Button } from "carbon-components-svelte";
    import Download from "carbon-icons-svelte/lib/Download.svelte";
    import { saveVCard } from "#lib/card/save-vcard.js";
    import { askLink } from "#lib/card/vcard.js";
    import { contactAddress } from "#lib/network/contact-address.js";
    import { isPeerId } from "#lib/network/contact-protocol.js";
    import { appUrlIn } from "#lib/app-url.js";
    import { _, language } from "#lib/i18n/index.js";

    /** @type {{ card: any, peer?: string, label: string, testid?: string }} */
    let { card, peer = undefined, label, testid = "save-vcard" } = $props();

    let saving = $state(false);

    async function save() {
        const did = typeof card?.owner === "string" ? card.owner : "";
        const devices = Array.isArray(card?.devices) ? card.devices.map((device) => device?.peer) : [];
        const device = [peer, ...devices].find((it) => isPeerId(it));
        const link = did && device ? askLink(appUrlIn($language), contactAddress(did, device)) : undefined;
        saving = true;
        try {
            await saveVCard(card, { link, note: link ? $_("vcard.note", { link }) : $_("vcard.noteNoLink") });
        } finally {
            saving = false;
        }
    }
</script>

<div class="vcard">
    <Button kind="tertiary" size="field" icon={Download} disabled={saving} data-testid={testid} on:click={save}>{label}</Button>
    <p class="help">{$_("vcard.help")}</p>
</div>

<style>
    .vcard {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.25rem;
    }
    .help {
        color: var(--cds-text-secondary, #c6c6c6);
        font-size: 0.75rem;
    }
</style>
