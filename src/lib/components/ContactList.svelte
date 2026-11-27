<script>
    import { DataTable, Toolbar, ToolbarContent, ToolbarSearch, Pagination } from "carbon-components-svelte";
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

    // eslint-disable-next-line no-unused-vars
    const withoutPhoto = ({ photo, ...row }) => row

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

    /** the columns, in the language on screen (new ones with each switch) */
    const headersOf = (tr) => [
        { key: "photo", empty: true, sort: false, width: "4rem" },
        { key: "lastName", value: tr("contacts.name") },
        { key: "firstName", value: tr("contacts.firstName"), display: (value, row) => firstNameOf(row, tr) }
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
        expandable
        rows={$myAddressBook}
        {pageSize}
        {page}
        radio
        sortable
        on:click={event => {
                if (event?.detail?.cell?.key === 'qr') {
                     generateQRForAddress(event.detail.row);
                }
        }}
        bind:selectedRowIds={$selectedRowIds}
        headers={headersOf($_)}
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
