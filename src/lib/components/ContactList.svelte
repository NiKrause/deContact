<script>
    import { DataTable, Toolbar, ToolbarContent, ToolbarSearch, Pagination } from "carbon-components-svelte";
    import { myAddressBook, selectedRowIds } from "../../stores.js";
    import { generateQRForAddress } from "../../operations.js"
    import ContactPhoto from "./ContactPhoto.svelte";
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
        headers={[
                    { key: "photo", empty: true, sort: false, width: "4rem" },
                    { key: "lastName", value: "Name" },
                    { key: "firstName", value: "Firstname" }
        ]}
>
        <Toolbar>
            <ToolbarContent>
                <ToolbarSearch
                        persistent
                        value=""
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
/>
