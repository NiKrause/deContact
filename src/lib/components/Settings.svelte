<script>
    import { Accordion, AccordionItem, Button, ConfirmModal, TextInput, Toggle } from "carbon-components-svelte";
    import PasskeySettings from "./PasskeySettings.svelte";
    import SecureOffer from "./SecureOffer.svelte";
    import { session } from "#lib/identity/session.js";
    import LanguageSwitch from "./LanguageSwitch.svelte";
    import Statistics from "./Statistics.svelte";
    import { _ } from "#lib/i18n/index.js";
    import {
        libp2p,
        connectedPeers,
        orbitdb,
        dbMyAddressBook, selectedAddr,
        useWebRTC
    } from "../../stores.js"

    // read when the network starts (p2p-operations.js)
    $effect(() => window.localStorage.setItem('useWebRTC', $useWebRTC.toString()))

    /** which drop waits for its confirmation */
    let confirmFollowers = $state(false)
    let confirmBook = $state(false)

    /** the copies of other people's books we keep, and their cards that came from them */
    async function dropFollowers() {
        const addressRecords = await $dbMyAddressBook.all();
        console.log("dropping DropFollowerDBs db!",addressRecords)
        for (const addressRecord of addressRecords) {
            if(addressRecord.value.own) continue
            // placeholders and revocations (#82) name no book of somebody else
            if(!addressRecord.value.sharedAddress) continue
            console.log("dropping follower db",addressRecord.value.sharedAddress)
            const followerDB2DDrop = await $orbitdb.open(addressRecord.value.sharedAddress)
            await followerDB2DDrop.drop()
            if(addressRecord.value.subscriber){
                const deleteHash = await $dbMyAddressBook.del(addressRecord.key)
                console.log("deleteHash",deleteHash)
            }
        }
        console.log("addressRecords",addressRecords)
        selectedAddr.set({})
        window.location.hash = '#/'
    }

    /** this device's copy of our address book */
    async function dropBook() {
        console.log("dropping address db!")
        await $dbMyAddressBook.drop()
        const addressRecords = await $dbMyAddressBook.all();
        console.log("addressRecords",addressRecords)
        selectedAddr.set({})
        window.location.hash = '#/'
    }
</script>

<!--
 @component Settings: the language, the passkeys and recovery words, WebRTC; at the bottom,
 collapsed, what only a developer needs (#110): the DID, the peer id and peers, and the two
 drop actions, each behind a confirmation.
-->
<div class="settings">
    <section><LanguageSwitch /></section>

    <!-- a temporary identity (#97) has no vault yet: securing it comes first -->
    <section>{#if $session?.temporary}<SecureOffer inSettings />{:else}<PasskeySettings />{/if}</section>

    <section>
        <h3 class="section-title">{$_('settings.network')}</h3>
        <!-- once a tab of its own, Statistics (#110) -->
        <Statistics />
        <!-- off: other browsers are reached only through the relay; read when the network starts -->
        <Toggle id="webrtc-toggle" labelText={$_('settings.webrtc')} labelA={$_('common.off')} labelB={$_('common.on')} bind:toggled={$useWebRTC} />
    </section>

    <Accordion class="developer">
        <AccordionItem title={$_('settings.developer')} data-testid="developer">
            <div class="fields">
                <TextInput labelText={$_('settings.did')} helperText={$_('settings.didHelp')} size="sm" readonly value={$orbitdb?.identity?.id} />
                <TextInput labelText={$_('settings.peerId')} helperText={$_('settings.peerIdHelp')} size="sm" readonly value={$libp2p?.peerId?.toString()} />
                <TextInput labelText={$_('settings.peers')} helperText={$_('settings.peersHelp')} size="sm" readonly value={$connectedPeers} />
                <div class="drops">
                    <Button data-cy="DropFollowerDBs" kind="danger-tertiary" size="sm" on:click={() => (confirmFollowers = true)}>{$_('settings.dropFollowers')}</Button>
                    <Button data-cy="DropAddressDB" kind="danger-tertiary" size="sm" on:click={() => (confirmBook = true)}>{$_('settings.dropAddressBook')}</Button>
                </div>
            </div>
        </AccordionItem>
    </Accordion>
</div>

<ConfirmModal
        bind:open={confirmFollowers}
        title={$_('settings.dropFollowersTitle')}
        confirmText={$_('settings.drop')}
        cancelText={$_('common.cancel')}
        confirm={dropFollowers}>
    <p>{$_('settings.dropFollowersText')}</p>
</ConfirmModal>
<ConfirmModal
        bind:open={confirmBook}
        title={$_('settings.dropAddressBookTitle')}
        confirmText={$_('settings.drop')}
        cancelText={$_('common.cancel')}
        confirm={dropBook}>
    <p>{$_('settings.dropAddressBookText')}</p>
</ConfirmModal>

<style>
    .settings {
        display: flex;
        flex-direction: column;
        gap: 2.5rem;
        max-width: 40rem;
        /* the passkeys' and the developer's long values wrap or scroll inside, not the page */
        min-width: 0;
    }
    .section-title {
        font-size: 1.25rem;
        margin-bottom: 1rem;
    }
    .fields {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
    }
    .drops {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
    }
    .drops :global(.bx--btn) {
        margin: 0;
    }
    :global(.settings .bx--accordion__content) {
        padding-right: 1rem;
    }
</style>
