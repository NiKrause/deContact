<script>
    import { createEventDispatcher } from "svelte";
    import { Modal, Toggle, Checkbox } from 'carbon-components-svelte';
    import QrCodeImage from "./QrCodeImage.svelte"
    const dispatch = createEventDispatcher();
    import { libp2p, orbitdb } from "../../stores.js";
    import { notify } from "../../utils/utils.js";
    import { issueOnboardingToken } from "#lib/network/p2p-operations.js";
    import { _, language } from "#lib/i18n/index.js";
    import { appUrlIn } from "#lib/app-url.js";
    import { contactAddress } from "#lib/network/contact-address.js";


    export let qrCodeData
    export let qrCodeOpen

    let onBoardingToken
    /** whoever scans the code may share their card with us in return (#86) */
    let twoWay = true
    let fullDeContactUrl = true

    // a new one-time token each time the dialog opens or the checkbox changes (it is signed in)
    let issuing = 0
    $: if (qrCodeOpen && $orbitdb) issueToken(twoWay)
    function issueToken(twoWay) {
        const issue = ++issuing
        onBoardingToken = undefined
        issueOnboardingToken({ twoWay })
            .then((token) => { if (issue === issuing) onBoardingToken = token })
            .catch((error) => console.log("could not create an invitation link:", error?.message))
    }
    // requests go to this device, peer to peer (contact-protocol.js): the code names it
    $: peer = $libp2p?.peerId?.toString()
    // the invitation link leads back to this app, wherever it runs, to the page of the
    // language on screen: a messenger's preview of it is in that language (app-url.js,
    // seo.js); without it, the contact address for the Scan field (contact-address.js)
    $: linkUrl = (fullDeContactUrl && onBoardingToken)
        ? `${appUrlIn($language)}#/onboarding/${qrCodeData}?onBoardingToken=${onBoardingToken}&peer=${peer}`
        : contactAddress(qrCodeData, peer)
</script>

<!-- What the person shows: the code first and as large as the screen allows, the options below -->
<Modal bind:open={ qrCodeOpen }
       passiveModal
       size="sm"
       modalHeading={$_('qr.heading')}
       iconDescription={$_('common.close')}
       on:close={() => dispatch('close')}>
    <div class="qr-dialog">
        {#if qrCodeData && qrCodeOpen}
            <!-- a tap copies what the code holds, for sending it another way -->
            <button type="button" class="qr-copy" aria-label={$_('qr.copy')} on:click={async () => {
                    await navigator.clipboard.writeText(linkUrl);
                    dispatch('close')
                    notify($_('notify.invitationCopied'));
                }}>
                <QrCodeImage value={linkUrl} />
            </button>
            <p class="hint">{$_('qr.copy')}</p>
        {/if}
        <div class="options">
            <Toggle
                labelText={$_('qr.scanWhat')}
                labelA={$_('qr.didOnly')}
                labelB={$_('qr.url')}
                bind:toggled={fullDeContactUrl}/>
            <div>
                <Checkbox id="two-way-exchange" labelText={$_('qr.twoWay')} bind:checked={twoWay} />
                <div class="bx--form__helper-text">{$_('qr.twoWayHelp')}</div>
            </div>
        </div>
    </div>
</Modal>

<style>
    .qr-dialog {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    .qr-copy {
        display: block;
        width: 100%;
        padding: 0;
        border: 0;
        background: none;
        cursor: pointer;
    }
    .hint {
        text-align: center;
        opacity: 0.75;
        font-size: 0.875rem;
    }
    .options {
        display: flex;
        flex-wrap: wrap;
        gap: 1rem 2rem;
    }
    .options > div {
        flex: 1 1 14rem;
    }
</style>
