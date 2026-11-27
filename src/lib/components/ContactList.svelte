<script>
    /**
     * @component The contacts (#110): a list with a photo or initials, the name and the city.
     * A tap opens the contact page. Search appears from SEARCH_FROM contacts on; no paging, no
     * radio buttons. Our own card is under My card, not here (#123); the records that only
     * remember somebody's book (`subscriber`) are no contacts.
     */
    import { Search } from "carbon-components-svelte";
    import ContactPhoto from "./ContactPhoto.svelte";
    import { isPhoto } from "#lib/photo/photo.js";
    import { myAddressBook, orbitdb, selectedRowIds } from "../../stores.js";
    import { _ } from "#lib/i18n/index.js";

    /** from how many contacts on the list can be searched */
    const SEARCH_FROM = 10;
    let query = $state("");

    const me = $derived($orbitdb?.identity?.id);
    /** a placeholder for a request (its last name is the DID it waits for), or one they declined */
    const isPlaceholder = (row) => row.lastName === row.owner;
    /** the name a row shows: never a DID */
    const nameOf = (row, tr) => {
        if (isPlaceholder(row)) return row.firstName === "request canceled" ? tr("contacts.canceled") : tr("contacts.invited");
        return [row.firstName, row.lastName].filter((part) => typeof part === "string" && part.trim()).join(" ") || row.email || tr("contacts.nameless");
    };
    const initialsOf = (row) =>
        isPlaceholder(row) ? "?" : [row.firstName, row.lastName].map((part) => (typeof part === "string" ? part.trim()[0] ?? "" : "")).join("").toUpperCase() || "?";
    /** the second line: the city, as long as there is no organisation on a card (#109) */
    const subOf = (row) => (typeof row.city === "string" ? row.city : "");

    const contacts = $derived(
        ($myAddressBook ?? [])
            .filter((row) => !row.subscriber && !(row.own && row.owner === me))
            .sort((a, b) => nameOf(a, $_).localeCompare(nameOf(b, $_)))
    );
    const shown = $derived.by(() => {
        const words = query.trim().toLowerCase();
        if (!words) return contacts;
        return contacts.filter((row) =>
            [nameOf(row, $_), row.email, row.city, row.street].some((text) => typeof text === "string" && text.toLowerCase().includes(words))
        );
    });

    /** the contact page of `row` */
    const open = (row) => selectedRowIds.set([row.id]);
</script>

{#if contacts.length >= SEARCH_FROM}
    <Search size="lg" labelText={$_("contacts.searchLabel")} placeholder={$_("contacts.search")} closeButtonLabelText={$_("contacts.clearSearch")} bind:value={query} />
{/if}
{#if contacts.length === 0}
    <p class="empty" data-testid="contacts-empty">{$_("contacts.empty")}</p>
{/if}
<ul class="contact-list" data-testid="contact-list">
    {#each shown as row (row.id)}
        <li>
            <button type="button" class="contact" data-testid="contact-row" onclick={() => open(row)}>
                <span class="avatar" aria-hidden="true">
                    {#if isPhoto(row.photo)}
                        <ContactPhoto photo={row.photo} size={48} />
                    {:else}
                        <span class="initials">{initialsOf(row)}</span>
                    {/if}
                </span>
                <span class="text">
                    <span class="name">{nameOf(row, $_)}</span>
                    {#if subOf(row)}<span class="sub">{subOf(row)}</span>{/if}
                </span>
            </button>
        </li>
    {/each}
</ul>

<style>
    .contact-list {
        margin: 0;
        padding: 0;
        list-style: none;
        border-top: 1px solid var(--cds-ui-03, #525252);
    }
    .contact {
        display: flex;
        align-items: center;
        gap: 1rem;
        width: 100%;
        min-height: 4rem;
        padding: 0.5rem 0.25rem;
        border: 0;
        border-bottom: 1px solid var(--cds-ui-03, #525252);
        background: none;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
    }
    .contact:hover {
        background: var(--cds-hover-ui, #4c4c4c);
    }
    .contact:focus-visible {
        outline: 2px solid var(--cds-focus, #ffffff);
        outline-offset: -2px;
    }
    .avatar {
        display: inline-flex;
        flex: none;
    }
    .initials {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 3rem;
        height: 3rem;
        border-radius: 50%;
        background: var(--cds-ui-03, #525252);
        color: var(--cds-text-primary, #f4f4f4);
        font-weight: 600;
    }
    .text {
        display: flex;
        flex-direction: column;
        min-width: 0;
    }
    .name {
        font-size: 1rem;
        overflow-wrap: anywhere;
    }
    .sub {
        color: var(--cds-text-secondary, #c6c6c6);
        font-size: 0.875rem;
    }
    .empty {
        color: var(--cds-text-secondary, #c6c6c6);
        margin-bottom: 1rem;
    }
    :global(.bx--search) {
        margin-bottom: 1rem;
    }
</style>
