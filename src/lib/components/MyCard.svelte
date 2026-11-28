<script>
    /**
     * @component My card (#110): our own card as others see it, and Edit, which opens the form.
     * Before the first save the form shows at once, under three lines on why: what the card is,
     * who can read it, and that changes reach everybody by themselves. "Later" leaves it for
     * now; Exchange then says to fill it in.
     */
    import { Button } from "carbon-components-svelte";
    import Edit from "carbon-icons-svelte/lib/Edit.svelte";
    import CardEntries from "./CardEntries.svelte";
    import ContactForm from "./ContactForm.svelte";
    import ContactPhoto from "./ContactPhoto.svelte";
    import { entriesOf } from "#lib/card/entries.js";
    import { ownCardOf } from "#lib/card/own.js";
    import { isPhoto } from "#lib/photo/photo.js";
    import { editingCard, myAddressBook, orbitdb } from "../../stores.js";
    import { cancelCardEdit, editMyCard } from "../../operations.js";
    import { _ } from "#lib/i18n/index.js";

    const me = $derived($orbitdb?.identity?.id);
    /** our card as the book has it now */
    const card = $derived(ownCardOf($myAddressBook, me));
    const text = (value) => (typeof value === "string" ? value.trim() : "");
    const name = $derived([text(card?.firstName), text(card?.lastName)].filter(Boolean).join(" "));
    const initials = $derived([text(card?.firstName)[0] ?? "", text(card?.lastName)[0] ?? ""].join("").toUpperCase() || "?");
    const entries = $derived(entriesOf(card));
    /** under the name: the organisation and the city of the first address */
    const sub = $derived([entries.organization, entries.addresses[0]?.city].filter(Boolean).join(" · "));
</script>

{#if !card}
    <!-- the first card: why, then the form -->
    <ul class="why" data-testid="card-why">
        <li>{$_("card.whyWhat")}</li>
        <li>{$_("card.whyWho")}</li>
        <li>{$_("card.whyUpdates")}</li>
    </ul>
    <ContactForm />
    <a class="later" href="#/" data-testid="card-later">{$_("card.later")}</a>
{:else if $editingCard}
    <ContactForm />
    <Button kind="ghost" size="sm" on:click={cancelCardEdit}>{$_("common.cancel")}</Button>
{:else}
    <article class="my-card" data-testid="my-card">
        <p class="hint">{$_("card.asOthersSeeIt")}</p>
        <header class="who">
            {#if isPhoto(card.photo)}
                <ContactPhoto photo={card.photo} size={96} testid="my-card-photo" />
            {:else}
                <span class="initials" aria-hidden="true">{initials}</span>
            {/if}
            <div>
                <h3 class="name" data-testid="my-card-name">{name || entries.emails[0]?.value || ""}</h3>
                {#if sub}<p class="sub">{sub}</p>{/if}
            </div>
        </header>
        <CardEntries {card} testid="my-card-details" />
        <div class="actions">
            <Button kind="primary" icon={Edit} on:click={editMyCard}>{$_("card.edit")}</Button>
        </div>
    </article>
{/if}

<style>
    .why {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        max-width: 40rem;
        margin: 0 0 1.5rem;
        padding: 1rem;
        list-style: none;
        background: var(--cds-layer-01, #262626);
    }
    .later {
        display: inline-block;
        margin: 0.5rem 0 1rem;
    }
    .my-card {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        max-width: 40rem;
    }
    .hint,
    .sub {
        color: var(--cds-text-secondary, #525252);
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
        background: var(--cds-layer-accent-01, #393939);
        color: var(--cds-text-primary, #f4f4f4);
        font-size: 2rem;
        font-weight: 600;
    }
    .name {
        font-size: 1.75rem;
        overflow-wrap: anywhere;
    }
    .actions :global(.bx--btn) {
        margin: 0;
    }
</style>
