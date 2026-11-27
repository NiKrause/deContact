<script>
    import { onDestroy, onMount } from "svelte";
    import { get } from "svelte/store";
    import "carbon-components-svelte/css/all.css";
    import ConnectionSignalOff from "carbon-icons-svelte/lib/ConnectionSignalOff.svelte";
    import ConnectionSignal from "carbon-icons-svelte/lib/ConnectionSignal.svelte";
    import { Header, HeaderGlobalAction, HeaderNav, HeaderUtilities, Theme } from "carbon-components-svelte";
    import { connectPasskeyStepDialog } from "@le-space/orbitdb-identity-provider-webauthn-did/elements";
    import { hash, query } from './router.js'
    import QRCodeModal from "#lib/components/QRCodeModal.svelte";
    import PasskeyGate from "#lib/components/PasskeyGate.svelte";
    import SecureOffer from "#lib/components/SecureOffer.svelte";
    import { myDal, qrCodeOpen, qrCodeData, helia, orbitdb, myAddressBook } from "../stores.js";

    import { startNetwork, startAddressBook, close } from "../lib/network/p2p-operations.js"
    import {
        attachOrbitDB,
        currentEncryptionKeys,
        expectTemporary,
        handRecord,
        initVault,
        ready,
        session,
        temporaryAhead,
        vaultKeptHere
    } from "#lib/identity/session.js"
    import { parseVaultRecord } from "#lib/identity/vault.js"
    import { somethingToLose, wantsSignIn } from "#lib/identity/temporary.js"

    import { connectedPeers } from "../stores.js";
    import { confirmExperimentalUse } from "./confirmExperimentalUse.js";
    import Home from './+page.svelte'
    import OnBoarding from "#lib/components/OnBoarding.svelte";
    import { _, language, passkeyStepStrings, startLocale } from "#lib/i18n/index.js";

    // the language before the first screen: a choice made earlier, else the browser's (#89)
    startLocale()

    let theme = "g90";

    // the vault comes first: the gate below asks it whether this browser keeps one
    let networkStarted
    initVault({ helia: new Promise((resolve) => (networkStarted = resolve)) })
    const handedOver = takeDeviceLink()

    /**
     * A device without deContact opens an invitation link (#97): the form shows at once,
     * and the passkey comes after the exchange. A device that keeps a vault unlocks as
     * before, and so does a link opened with "Already have a deContact passkey?".
     */
    const temporary = get(hash) === '/onboarding' && !handedOver && !wantsSignIn(get(query)) && !keptHere()
    if (temporary) expectTemporary()

    /** whether this browser keeps a vault; one it cannot read is the passkey screen's to explain */
    function keptHere() {
        try {
            return vaultKeptHere()
        } catch {
            return true
        }
    }

    /** until a passkey secures it, closing the tab loses this side of the exchange (#97) */
    function warnBeforeLeaving(event) {
        if (!somethingToLose({ temporary: $session?.temporary, documents: $myAddressBook })) return
        event.preventDefault()
        event.returnValue = '' // what older browsers look for
    }

    /**
     * A device link (#/link?vault=...) brings the public vault record of another device:
     * unlocking here looks in it too. The record leaves the address bar at once.
     */
    function takeDeviceLink() {
        if (!location.hash.startsWith('#/link?')) return false
        const encoded = new URLSearchParams(location.hash.slice('#/link?'.length)).get('vault') ?? ''
        history.replaceState(null, '', `${location.pathname}${location.search}#/`)
        try {
            const text = new TextDecoder().decode(
                Uint8Array.from(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
            )
            const record = parseVaultRecord(text)
            if (record) handRecord(record)
            return Boolean(record)
        } catch {
            return false
        }
    }

    let stepDialog
    onMount( async () => {
        // every passkey prompt after the first of an action says what it is for, in the
        // language on screen (its lang attribute) and in deContact's words
        stepDialog.strings = passkeyStepStrings()
        connectPasskeyStepDialog(stepDialog)
        if($hash!=='/onboarding') await confirmExperimentalUse();

        // the network starts while the person unlocks; the address book once both are done
        const network = startNetwork().then(
            () => networkStarted(get(helia)),
            (error) => {
                console.error('the network did not start:', error)
                networkStarted(undefined) // the unlock goes on without looking anything up
            }
        )
        const signer = await ready
        await network
        await startAddressBook(signer, currentEncryptionKeys());
        await attachOrbitDB(get(orbitdb))
    } )

    onDestroy(close)

    let isSideNavOpen

    const routes = {
        '/': Home,
        '': Home,
        '/onboarding': OnBoarding
    }
    $: console.log("$hash",$hash)
    $: view = routes[$hash] ?? Home

        //    const urlParams = new URLSearchParams(window.location.search); //TODO url params we need when we "onboard" a new user via scanning a URL
</script>
<svelte:window on:beforeinstallprompt={ () => { console.log("beforeinstallprompt") }} on:beforeunload={ warnBeforeLeaving } />

    <Header
        class="header-title"
        persistentHamburgerMenu={true}
        bind:isSideNavOpen
        company="deContact"
        platformName={$_('app.tagline')}
        href="./#/">

        <HeaderNav>
            <div class="flags">
                 {#if ($connectedPeers===0) }
                     <ConnectionSignalOff title={$_('header.peers.none')} class="statusRed" />&nbsp;{$connectedPeers}
                 {:else if $connectedPeers===1}
                     <ConnectionSignal title={$_('header.peers.seed')} class="statusYellow" />&nbsp;{$connectedPeers}
                 {:else}
                     <ConnectionSignal title={$_('header.peers.swarm')} class="statusGreen" />&nbsp;{$connectedPeers}
                 {/if}
            </div>
        </HeaderNav>

        <HeaderUtilities>
            <HeaderGlobalAction aria-label={$_('header.theme')}>
                <Theme
                        bind:theme
                        render="toggle"
                        toggle={{
                                themes: ["g90", "g80"],
                                labelA: "",
                                labelB: "",
                                hideLabel: true,
                                size: "sm",
                  }}/>
            </HeaderGlobalAction>
    </HeaderUtilities>
</Header>
<QRCodeModal
        on:close={ () => $qrCodeOpen = false }
        bind:qrCodeOpen={ $qrCodeOpen }
        qrCodeData={ $qrCodeData }
        dbMyDal={ $myDal } />
<!--<slot></slot>-->
{#if $session || ($temporaryAhead && $hash==='/onboarding')}
    <!-- one branch for both: the form stays as it is while its temporary identity starts (OnBoarding.svelte, #97) -->
    {#if $session && $hash!=='/onboarding'}<SecureOffer />{/if}
    <svelte:component this={ view } />
{:else}
    <PasskeyGate onboarding={ $hash==='/onboarding' } { handedOver } />
{/if}
<passkey-step-dialog bind:this={ stepDialog } lang={ $language }></passkey-step-dialog>
<style>
    :global(.bx--toast-notification) {
        z-index: 1;
        margin: 5rem;
    }
    :global(.statusRed) {
        color: red;
        width: 16px;
        height: 16px;
    }
    :global(.statusYellow) {
        color: yellow;
        width: 16px;
        height: 16px;
    }
    :global(.statusGreen) {
        color: green;
        width: 16px;
        height: 16px;
    }
    .flags {
        margin: 10px;
        display: flex;
        justify-content: space-between;
    }
</style>