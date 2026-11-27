<script>
    import { DataTable, Toolbar, ToolbarContent, ToolbarSearch, Pagination } from "carbon-components-svelte";
    import { readable } from "svelte/store";
    import { myAddressBook, selectedRowIds } from "../../stores.js";
    import { generateQRForAddress } from "../../operations.js"
    import ContactPhoto from "./ContactPhoto.svelte";
    import { _ } from "#lib/i18n/index.js";
    let pageSize = 50;
    let page = 1;
    let filteredRowIds = [];

    /** Carbon's search over every text of a row, without the photo's data URL (#87) */
    const matches = (row, value) => {
        const query = value.trim().toLowerCase()
        return Object.entries(row).some(([key, field]) =>
            key !== "id" && key !== "photo" && (typeof field === "string" || typeof field === "number") &&
            String(field).toLowerCase().includes(query))
    }

    // the devices a card names are for the app (devices.js), not for reading
    const withoutPhoto = ({ photo, devices, ...row }) => row

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
        rows={$myAddressBook}
        {pageSize}
        {page}
        radio
        selectRowLabel={$_('contacts.selectRow')}
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
    <svelte:fragment slot="expanded-row" let:row>
        <ContactPhoto photo={row.photo} size={128} testid="contact-details-photo" />
        <pre>{JSON.stringify(withoutPhoto(row), null, 2)}</pre>
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
        /* the details of a contact: long addresses wrap instead of widening the screen */
        :global(.contact-list pre) {
            white-space: pre-wrap;
            overflow-wrap: anywhere;
        }
    }
</style>
