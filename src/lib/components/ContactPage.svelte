<script>
    /**
     * @component A contact's page (#110): their card as they share it, read-only. An email
     * writes, an address reads in lines. Their DID and the address of their book sit under a
     * collapsed "Technical details". "Remove contact" asks first, then removes them: our card
     * leaves their book and they get no more updates (operations.js deleteContact).
     */
    import { Accordion, AccordionItem, Button, ConfirmModal } from "carbon-components-svelte";
    import TrashCan from "carbon-icons-svelte/lib/TrashCan.svelte";
    import ContactPhoto from "./ContactPhoto.svelte";
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
    const address = $derived([text(card.street), [text(card.postalCode), text(card.city)].filter(Boolean).join(" "), text(card.countryRegion)].filter(Boolean));
    const category = $derived(["private", "business", "other"].includes(card.category) ? $_(`form.categories.${card.category}`) : "");

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
            {#if text(card.city)}<p class="sub">{text(card.city)}</p>{/if}
        </div>
    </header>

    <dl data-testid="contact-details">
        {#if text(card.email)}
            <dt>{$_("contacts.details.email")}</dt>
            <dd><a href="mailto:{text(card.email)}">{text(card.email)}</a></dd>
        {/if}
        {#if address.length}
            <dt>{$_("contacts.details.address")}</dt>
            <dd>{#each address as line, i (i)}<span class="line">{line}</span>{/each}</dd>
        {/if}
        {#if category}
            <dt>{$_("contacts.details.category")}</dt>
            <dd>{category}</dd>
        {/if}
    </dl>

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
        background: var(--cds-ui-03, #525252);
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
    .line {
        display: block;
    }
    .actions :global(.bx--btn) {
        margin: 0;
    }
</style>
