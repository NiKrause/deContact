<script>
    /**
     * @component A contact's page (#110): their card as they share it, read-only, with every
     * entry of #109: a phone number calls, an email writes, an address reads in lines and can be
     * copied (CardEntries.svelte). Their DID and the address of their book sit under a
     * collapsed "Technical details". "Remove contact" asks first, then removes them: our card
     * leaves their book and they get no more updates (operations.js deleteContact).
     */
    import { Accordion, AccordionItem, Button, ConfirmModal } from "carbon-components-svelte";
    import TrashCan from "carbon-icons-svelte/lib/TrashCan.svelte";
    import CardEntries from "./CardEntries.svelte";
    import ContactCircle from "./ContactCircle.svelte";
    import ContactNotes from "./ContactNotes.svelte";
    import ContactPhoto from "./ContactPhoto.svelte";
    import VCardButton from "./VCardButton.svelte";
    import { entriesOf } from "#lib/card/entries.js";
    import { isPhoto } from "#lib/photo/photo.js";
    import { myAddressBook, selectedAddr, selectedRowIds } from "../../stores.js";
    import { deleteContact } from "../../operations.js";
    import { _ } from "#lib/i18n/index.js";

    /** the card as the book has it now: a change of theirs shows while the page is open */
    const card = $derived(($myAddressBook ?? []).find((row) => row.id === $selectedRowIds[0]) ?? $selectedAddr ?? {});
    const text = (value) => (typeof value === "string" ? value.trim() : "");
    /** a placeholder for a request: its last name is the DID it waits for, which is no name */
    const placeholder = $derived(text(card.lastName) !== "" && card.lastName === card.owner);
    const name = $derived(placeholder ? "" : [text(card.firstName), text(card.lastName)].filter(Boolean).join(" "));
    const initials = $derived(placeholder ? "?" : [text(card.firstName)[0] ?? "", text(card.lastName)[0] ?? ""].join("").toUpperCase() || "?");
    /** under the name: their organisation and the city of their first address */
    const entries = $derived(entriesOf(card));
    const sub = $derived([entries.organization, entries.addresses[0]?.city].filter(Boolean).join(" · "));

    let confirmRemove = $state(false);
</script>

<article class="contact-page" data-testid="contact-page">
    <header class="who">
        {#if isPhoto(card.photo)}
            <ContactPhoto photo={card.photo} size={96} testid="contact-details-photo" />
        {:else}
            <span class="initials" aria-hidden="true">{initials}</span>
        {/if}
        <div>
            <h3 class="name" data-testid="contact-name">{name || $_(placeholder ? "contacts.invited" : "contacts.nameless")}</h3>
            {#if sub}<p class="sub" data-testid="contact-sub">{sub}</p>{/if}
        </div>
    </header>

    <CardEntries {card} reach testid="contact-details" />

    {#if !placeholder && name}
        <!-- a copy for the phone's own address book (#146) -->
        <VCardButton {card} label={$_("vcard.export")} testid="export-vcard" />
    {/if}

    {#if text(card.owner)}
        <!-- which fields of our card they get (#100) -->
        <ContactCircle did={text(card.owner)} name={placeholder ? "" : text(card.firstName) || name} />
        <!-- ours alone, never part of their card (#109) -->
        <ContactNotes did={text(card.owner)} name={placeholder ? "" : text(card.firstName) || name} />
    {/if}

    {#if text(card.owner) || text(card.sharedAddress)}
        <Accordion>
            <AccordionItem title={$_("contacts.details.technical")}>
                <dl class="technical">
                    {#if text(card.owner)}<dt>{$_("contacts.details.did")}</dt><dd>{text(card.owner)}</dd>{/if}
                    {#if text(card.sharedAddress)}<dt>{$_("contacts.details.book")}</dt><dd>{text(card.sharedAddress)}</dd>{/if}
                </dl>
            </AccordionItem>
        </Accordion>
    {/if}

    <div class="actions">
        <Button kind="danger-tertiary" icon={TrashCan} on:click={() => (confirmRemove = true)}>{$_("contacts.remove")}</Button>
    </div>
</article>

<ConfirmModal
        bind:open={confirmRemove}
        title={name ? $_("form.removeTitle", { name }) : $_("form.removeTitleNameless")}
        confirmText={$_("form.remove")}
        cancelText={$_("common.cancel")}
        confirm={deleteContact}>
    <p>{$_("form.removeText")}</p>
</ConfirmModal>

<style>
    .contact-page {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        max-width: 40rem;
    }
    .who {
        display: flex;
        align-items: center;
        gap: 1rem;
    }
    .initials {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 6rem;
        height: 6rem;
        flex: none;
        border-radius: 50%;
        background: var(--cds-layer-accent-01, #525252);
        font-size: 2rem;
        font-weight: 600;
    }
    .name {
        font-size: 1.75rem;
        overflow-wrap: anywhere;
    }
    .sub {
        color: var(--cds-text-secondary, #c6c6c6);
    }
    dl {
        display: grid;
        grid-template-columns: max-content 1fr;
        gap: 0.75rem 1.5rem;
        margin: 0;
    }
    dt {
        color: var(--cds-text-secondary, #c6c6c6);
    }
    dd {
        margin: 0;
        min-width: 0;
        overflow-wrap: anywhere;
    }
    .actions :global(.bx--btn) {
        margin: 0;
    }
</style>
