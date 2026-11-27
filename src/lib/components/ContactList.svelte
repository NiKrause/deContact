<script>
    import { Accordion, AccordionItem, DataTable, Toolbar, ToolbarContent, ToolbarSearch, Pagination } from "carbon-components-svelte";
    import { readable } from "svelte/store";
    import { myAddressBook, orbitdb, selectedRowIds } from "../../stores.js";
    import { generateQRForAddress } from "../../operations.js"
    import ContactPhoto from "./ContactPhoto.svelte";
    import { _ } from "#lib/i18n/index.js";
    /** our contacts: our own card is under My Address, not in this list (#110) */
    const contacts = $derived(($myAddressBook ?? []).filter((row) => !(row.own && row.owner === $orbitdb?.identity?.id)))
    let pageSize = $state(50);
    let page = $state(1);
    let filteredRowIds = $state([]);

    /** Carbon's search over every text of a row, without the photo's data URL (#87) */
    const matches = (row, value) => {
        const query = value.trim().toLowerCase()
        return Object.entries(row).some(([key, field]) =>
            key !== "id" && key !== "photo" && (typeof field === "string" || typeof field === "number") &&
            String(field).toLowerCase().includes(query))
    }

    /** what a card says, as text; anything else (an older card's oddities) is not shown */
    const text = (value) => (typeof value === "string" ? value.trim() : "")
    /** the address in lines: street; postal code and city; country */
    const addressOf = (row) =>
        [text(row.street), [text(row.postalCode), text(row.city)].filter(Boolean).join(" "), text(row.countryRegion)].filter(Boolean)
    /** a category the form knows, in the language on screen */
    const categoryOf = (row, tr) => (["private", "business", "other"].includes(row.category) ? tr(`form.categories.${row.category}`) : "")

    /**
     * The first name of a placeholder, in the language on screen: the stored markers of a
     * request we sent (p2p-operations.js writePlaceholder) or one they declined (decline)
     * are data, and stay as they are.
     */
    const firstNameOf = (row, tr) => {
        if (row.lastName !== row.owner) return row.firstName
        if (row.firstName === "invited") return tr("contacts.invited")
        if (row.firstName === "request canceled") return tr("contacts.canceled")
        return row.firstName
    }

    /**
     * Whether the screen is a phone's: below Carbon's md breakpoint (42rem), where its tabs
     * become a list and +page.svelte drops the side margins. There the first name goes
     * under the name, in one column.
     */
    const narrow = readable(false, (set) => {
        const query = window.matchMedia("(max-width: 41.98rem)")
        set(query.matches)
        const changed = (event) => set(event.matches)
        query.addEventListener("change", changed)
        return () => query.removeEventListener("change", changed)
    })

    /** the columns, in the language on screen (new ones with each switch); one name column on a phone */
    const headersOf = (tr, narrow) => [
        { key: "photo", empty: true, sort: false, width: "4rem" },
        { key: "lastName", value: tr("contacts.name") },
        ...(narrow ? [] : [{ key: "firstName", value: tr("contacts.firstName"), display: (value, row) => firstNameOf(row, tr) }])
    ]

    /** what Carbon's table says to a screen reader, in the language on screen (a new function with each switch) */
    const tableTexts = (tr) => (id) => tr(`contacts.table.${id}`)

    /** Carbon's pagination texts, in the language on screen (new functions with each switch) */
    const paginationTexts = (tr) => ({
        forwardText: tr("contacts.nextPage"),
        backwardText: tr("contacts.previousPage"),
        pageText: (page) => tr("contacts.page", { page }),
        itemRangeText: (min, max, total) => tr("contacts.itemRange", { count: total, min, max, total }),
        pageRangeText: (current, total) => tr("contacts.pageRange", { count: total, total })
    })
</script>

<DataTable
        class="contact-list"
        expandable
        rows={contacts}
        {pageSize}
        {page}
        radio
        translateWithId={tableTexts($_)}
        sortable
        on:click={event => {
                if (event?.detail?.cell?.key === 'qr') {
                     generateQRForAddress(event.detail.row);
                }
        }}
        bind:selectedRowIds={$selectedRowIds}
        headers={headersOf($_, $narrow)}
>
        <Toolbar>
            <ToolbarContent>
                <ToolbarSearch
                        persistent
                        value=""
                        labelText={$_("contacts.searchLabel")}
                        hideLabel
                        placeholder={$_("contacts.search")}
                        closeButtonLabelText={$_("contacts.clearSearch")}
                        shouldFilterRows={matches}
                        bind:filteredRowIds
                />
            </ToolbarContent>
    </Toolbar>
    <svelte:fragment slot="cell" let:row let:cell>
        {#if cell.key === "photo"}
            <ContactPhoto photo={cell.value} size={32} />
        {:else if $narrow && cell.key === "lastName"}
            <span class="stacked-name">{cell.value ?? ""}</span>
            <span class="stacked-first-name">{firstNameOf(row, $_) ?? ""}</span>
        {:else}
            {cell.display ? cell.display(cell.value, row) : cell.value}
        {/if}
    </svelte:fragment>
    <!-- what the card says, in words; the DID and the book address only on request (#110) -->
    <svelte:fragment slot="expandedRow" let:row>
        <div class="details" data-testid="contact-details">
            <ContactPhoto photo={row.photo} size={128} testid="contact-details-photo" />
            <dl>
                {#if text(row.email)}
                    <dt>{$_("contacts.details.email")}</dt>
                    <dd><a href="mailto:{text(row.email)}">{text(row.email)}</a></dd>
                {/if}
                {#if addressOf(row).length}
                    <dt>{$_("contacts.details.address")}</dt>
                    <dd>{#each addressOf(row) as line, i (i)}<span class="line">{line}</span>{/each}</dd>
                {/if}
                {#if categoryOf(row, $_)}
                    <dt>{$_("contacts.details.category")}</dt>
                    <dd>{categoryOf(row, $_)}</dd>
                {/if}
            </dl>
            {#if text(row.owner) || text(row.sharedAddress)}
                <Accordion size="sm">
                    <AccordionItem title={$_("contacts.details.technical")}>
                        <dl class="technical">
                            {#if text(row.owner)}<dt>{$_("contacts.details.did")}</dt><dd>{text(row.owner)}</dd>{/if}
                            {#if text(row.sharedAddress)}<dt>{$_("contacts.details.book")}</dt><dd>{text(row.sharedAddress)}</dd>{/if}
                        </dl>
                    </AccordionItem>
                </Accordion>
            {/if}
        </div>
    </svelte:fragment>
</DataTable>
<Pagination
        bind:pageSize
        bind:page
        totalItems={filteredRowIds.length}
        pageSizeInputDisabled
        {...paginationTexts($_)}
/>
<style>
    @media (max-width: 41.98rem) {
        /*
         * Carbon lays the table out from its first row (table-layout: fixed, for the photo's
         * width), and the radio column's header has no width of its own: without one it
         * takes as much as the name.
         */
        :global(.contact-list .bx--data-table thead th:nth-child(2)) {
            width: 3rem;
        }
        .stacked-name,
        .stacked-first-name {
            display: block;
            overflow-wrap: anywhere;
        }
        .stacked-name {
            color: var(--cds-text-primary, #161616);
        }
    }
    .details {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        padding: 0.5rem 0 1rem;
    }
    dl {
        display: grid;
        grid-template-columns: max-content 1fr;
        gap: 0.5rem 1.5rem;
        margin: 0;
    }
    dt {
        color: var(--cds-text-secondary, #c6c6c6);
    }
    dd {
        margin: 0;
        /* a DID or a book address wraps instead of widening the screen */
        overflow-wrap: anywhere;
        min-width: 0;
    }
    .line {
        display: block;
    }
</style>
