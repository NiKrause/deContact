<script>
    import {
        Tabs,
        Tab,
        TabContent,
        Button,
        TextInput,
        Column,
        Grid,
        Row,
        ProgressBar,
        ToastNotification
    } from "carbon-components-svelte";
    import QrCode from "carbon-icons-svelte/lib/QrCode.svelte";
    import Scan from "carbon-icons-svelte/lib/Scan.svelte";
    import ContactForm from "#lib/components/ContactForm.svelte";
    import ContactList from "#lib/components/ContactList.svelte";
    import Settings from "#lib/components/Settings.svelte";
    import Statistics from "#lib/components/Statistics.svelte";

    import {
        orbitdb,
        qrCodeOpen,
        qrCodeData,
        showNotification,
        notificationMessage,
        notificationKind,
        selectedTab,
        selectedRowIds,
        exchangesWaiting
    } from "../stores.js";
    import { loadContact, showMyCard } from "../operations.js";
    import { untrack } from "svelte";
    import { requestAddress } from "../lib/network/p2p-operations.js"
    import { parseContactAddress } from "#lib/network/contact-address.js"
    import QrScanner from "#lib/components/QrScanner.svelte"
    import { notify } from "../utils/utils.js";
    import { _ } from "#lib/i18n/index.js";

    // a row picked in the list: its contact goes into the form
    $effect(() => {
        if ($selectedRowIds.length > 0) loadContact($selectedRowIds[0])
    })
    /** My Address, opened without a contact picked from the list: it shows our own card (#110) */
    const myCardAsked = $derived($selectedTab === 1 && $selectedRowIds.length === 0)
    $effect(() => {
        // only when that turns true: the book changing under an open form leaves it alone
        if (myCardAsked) untrack(showMyCard)
    })
    /** the tabs' labels, in the language on screen */
    const tabLabels = $derived([$_('tabs.contacts'), $_('tabs.myAddress'), $_('tabs.statistics'), $_('tabs.settings')]);
    let scannedAddress = $state();
    /** @type {any} */
    let scanner = $state();
    /** a contact address pasted into the field, else the camera */
    function scanOrOpenCamera() {
        if (scannedAddress?.trim()) return scan()
        return scanner.open()
    }
    /** what the camera read: an invitation link opens here, a contact address is asked */
    function scannedByCamera(target) {
        if (target.kind === 'link') {
            window.location.hash = target.hash
            return
        }
        return requestAddress(target.did, false, target.onBoardingToken, target.peer)
    }
    /** a contact address or an invitation link: whom to ask, on which device (contact-address.js) */
    function scan() {
        const address = parseContactAddress(scannedAddress)
        if (!address) {
            notify($_('notify.noContactAddress'), 'warning')
            return
        }
        return requestAddress(address.did, false, address.onBoardingToken, address.peer)
    }
</script>

<div class="content">
    <!-- an invitation link we opened: its inviter's phone has not answered yet (#86) -->
    {#each $exchangesWaiting as waiting (waiting.inviter)}
        <p class="waiting" role="status" data-testid="waiting-for-phone">{waiting.name ? $_('home.waiting', { name: waiting.name }) : $_('home.waitingNameless')}</p>
    {/each}
<!--    {#if $progressState!==6}
    <ProgressBar helperText={"("+$progressState+"/6) "+$progressText} status={$progressState===6?"finished":"active"} />
    {/if}-->
    <Tabs class="tabs" bind:selected={$selectedTab}>
        <Tab label={tabLabels[0]} data-cy="contacts"/>
        <Tab label={tabLabels[1]} data-cy="address"/>
        <Tab label={tabLabels[2]}  data-cy="statistics"/>
        <Tab label={tabLabels[3]}  data-cy="settings"/>
        <svelte:fragment slot="content">
            <TabContent>
                <Grid fullWidth class="scan-bar">
                    <Row>
                        <Column>
                            <!-- a name a screen reader says; the placeholder goes away once something is typed -->
                            <TextInput data-testid="scan-field" size="sm" labelText={$_('home.scanLabel')} hideLabel placeholder={$_('scanner.hint')} bind:value={scannedAddress} on:keydown={(e) => e.code==='Enter'?scan():null} />
                        </Column>
                            <Column>
                                <div class="scan-actions">
                                    <Button size="sm"
                                            on:click={async () => await scanOrOpenCamera()}>
                                        <Scan size="16"/> &nbsp; {$_('home.scan')}
                                    </Button>
                                    <Button size="sm" on:click={() => {
                                        $qrCodeData = $orbitdb?.identity?.id;
                                        $qrCodeOpen = !$qrCodeOpen;
                                    }}>
                                        <QrCode size="16" /> &nbsp; {$_('home.qrCode')}
                                    </Button>
                                </div>
                        </Column>
                    </Row>
                </Grid>
                <ContactList/>
                <QrScanner bind:this={scanner} onscan={scannedByCamera} />
            </TabContent>
            <TabContent><ContactForm/></TabContent>
            <TabContent><Statistics/></TabContent>
            <TabContent><Settings/></TabContent>
        </svelte:fragment>
    </Tabs>
</div>
{#if $showNotification}
    <ToastNotification class="toast"
                       kind={$notificationKind}
                       title={$_(`toast.${$notificationKind}`)}
                       subtitle={$notificationMessage}
                       closeButtonDescription={$_('toast.close')} />
{/if}
<style>
    :global(.content) {
        margin: 3rem;
    }
    :global(.bx--btn, input) {
        margin-bottom: 1rem;
    }
    :global(.tabs) {
        margin: 1rem;
    }
    .waiting {
        margin: 0 1rem;
        overflow-wrap: anywhere;
    }
    /*
     * A phone's width, below Carbon's md breakpoint (42rem), where its tabs become a list:
     * the screen's width goes to the field, the buttons and the contacts, not to margins.
     */
    @media (max-width: 41.98rem) {
        :global(.content) {
            margin-left: 0;
            margin-right: 0;
        }
        /* Carbon's width: 100% and the margin above would reach past the screen's edge */
        :global(.bx--tabs.tabs) {
            width: auto;
        }
        /* the field and the buttons line up with the table below */
        :global(.bx--grid.scan-bar) {
            padding-left: 0;
            padding-right: 0;
        }
        /* the field on a line of its own, the buttons on the next one */
        :global(.scan-bar .bx--col) {
            flex-basis: 100%;
            max-width: 100%;
        }
        /* side by side, half the width each, their labels on one line */
        .scan-actions {
            display: flex;
            gap: 0.5rem;
        }
        .scan-actions :global(.bx--btn) {
            flex: 1 1 0;
            max-width: none;
            justify-content: center;
            padding-right: 12px; /* as on the left: no space kept for an icon at the end */
            white-space: nowrap;
        }
    }
</style>
