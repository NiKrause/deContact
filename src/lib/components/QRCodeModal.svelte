<script>
    import { untrack } from 'svelte';
    import { Modal, Checkbox, RadioButtonGroup, RadioButton, Select, SelectItem } from 'carbon-components-svelte';
    import QrCodeImage from "./QrCodeImage.svelte"
    import { circles, dbMyAddressBook, libp2p, myAddressBook, networkState, orbitdb } from "../../stores.js";
    import { circleName } from "#lib/card/circles.js";
    import ReadinessList from "./ReadinessList.svelte";
    import { LATE_AFTER_MS, readinessOf } from "#lib/network/readiness.js";
    import { notify } from "../../utils/utils.js";
    import { issueOnboardingToken } from "#lib/network/p2p-operations.js";
    import { _, language } from "#lib/i18n/index.js";
    import { appUrlIn } from "#lib/app-url.js";
    import { contactAddress } from "#lib/network/contact-address.js";


    /**
     * qrCodeData: our DID; qrCodeOpen: whether the dialog shows; onclose: it was closed
     * @type {{ qrCodeData: string | undefined, qrCodeOpen?: boolean, onclose: () => void }}
     */
    let { qrCodeData, qrCodeOpen = $bindable(false), onclose } = $props()

    let onBoardingToken = $state()
    /**
     * What the code does:
     * - 'now': an invitation link; the first person who opens it gets our card at once;
     * - 'ask': our contact address; whoever scans it in deContact sends us a request, and we decide.
     */
    let mode = $state('now')
    /** with 'now': whoever opens the link may share their card with us in return (#86) */
    let twoWay = $state(true)
    /**
     * with 'now': the circle whoever opens the link joins (#100), the default for a new code
     * at first (from Settings; the whole card, '', unless one was chosen there). It stays on
     * this device, not in the link.
     */
    let circle = $state($circles.defaultCircle)
    // each time the dialog opens: the default, as Settings has it now
    let wasOpen = false
    $effect(() => {
        if (qrCodeOpen && !wasOpen) circle = untrack(() => $circles.defaultCircle)
        wasOpen = qrCodeOpen
    })
    const shareNow = $derived(mode === 'now')
    /** one sentence that says what happens when somebody scans the code */
    const summary = $derived(!shareNow ? 'qr.summaryAsk' : twoWay ? 'qr.summaryBoth' : 'qr.summaryNow')

    // a new one-time token each time the dialog opens, the link is chosen or the checkbox
    // changes (it is signed in); the contact address needs none
    let issuing = 0
    $effect(() => {
        if (qrCodeOpen && $orbitdb && shareNow) issueToken(twoWay, circle)
    })
    function issueToken(twoWay, circle) {
        const issue = ++issuing
        onBoardingToken = undefined
        issueOnboardingToken({ twoWay, circle })
            .then((token) => { if (issue === issuing) onBoardingToken = token })
            .catch((error) => console.log("could not create an invitation link:", error?.message))
    }
    // the relay may take a while; after LATE_AFTER_MS the dialog says the code works anyway
    let late = $state(false)
    $effect(() => {
        if (!qrCodeOpen) return
        late = false
        const timer = setTimeout(() => (late = true), LATE_AFTER_MS)
        return () => clearTimeout(timer)
    })
    const me = $derived($orbitdb?.identity?.id)
    /** the checklist (readiness.js): the code shows once book, network, link and card are there */
    const readiness = $derived(readinessOf({
        bookOpen: Boolean(me && $dbMyAddressBook?.address),
        network: $networkState,
        linkSigned: shareNow ? Boolean(onBoardingToken) : undefined,
        ownCard: me ? $myAddressBook?.find((card) => card.owner === me && card.own) : undefined,
        late
    }))
    /** "Fill in my business card": to My card, the dialog closes */
    function fillCard() {
        onclose()
        window.location.hash = '#/card'
    }

    // requests go to this device, peer to peer (contact-protocol.js): the code names it
    const peer = $derived($libp2p?.peerId?.toString())
    // the invitation link leads back to this app, wherever it runs, to the page of the
    // language on screen: a messenger's preview of it is in that language (app-url.js,
    // seo.js); with 'ask', the contact address for the Scan field (contact-address.js)
    const linkUrl = $derived((shareNow && onBoardingToken)
        ? `${appUrlIn($language)}#/onboarding/${qrCodeData}?onBoardingToken=${onBoardingToken}&peer=${peer}`
        : contactAddress(qrCodeData, peer))
</script>

<!-- What the person shows: the code first and as large as the screen allows, what it does
     in one sentence, the options below -->
<Modal bind:open={ qrCodeOpen }
       passiveModal
       size="sm"
       modalHeading={$_('qr.heading')}
       iconDescription={$_('common.close')}
       on:close={() => onclose()}>
    <div class="qr-dialog">
        <ReadinessList {readiness} onfillcard={fillCard} />
        {#if qrCodeData && qrCodeOpen && readiness.codeReady}
            <!-- a tap copies what the code holds, for sending it another way -->
            <button type="button" class="qr-copy" aria-label={$_(shareNow ? 'qr.copyLink' : 'qr.copyAddress')} onclick={async () => {
                    await navigator.clipboard.writeText(linkUrl);
                    onclose()
                    notify($_(shareNow ? 'notify.invitationCopied' : 'notify.addressCopied'));
                }}>
                <QrCodeImage value={linkUrl} />
            </button>
            <p class="summary" data-testid="qr-summary">{$_(summary)}</p>
            <p class="hint">{$_(shareNow ? 'qr.copyLink' : 'qr.copyAddress')}</p>
        {:else if qrCodeOpen && readiness.steps.card !== 'problem'}
            <p class="getting-ready" role="status">{$_('readiness.gettingReady')}</p>
        {/if}
        <div class="options">
            <RadioButtonGroup legendText={$_('qr.mode')} name="qr-mode" bind:selected={mode}>
                <RadioButton value="now" labelText={$_('qr.shareNow')} />
                <RadioButton value="ask" labelText={$_('qr.letThemAsk')} />
            </RadioButtonGroup>
            {#if shareNow}
                <div>
                    <Checkbox id="two-way-exchange" labelText={$_('qr.twoWay')} bind:checked={twoWay} />
                    <div class="bx--form__helper-text">{$_('qr.twoWayHelp')}</div>
                </div>
                <!-- which fields of our card they get (#100) -->
                <Select labelText={$_('circles.codeFor')} helperText={$_('circles.codeForHelp')} bind:selected={circle}>
                    <SelectItem value="" text={$_('circles.wholeCard')} />
                    {#each $circles.circles as option (option.id)}<SelectItem value={option.id} text={circleName($_, option)} />{/each}
                </Select>
            {/if}
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
    .summary {
        text-align: center;
    }
    .getting-ready {
        text-align: center;
        color: var(--cds-text-secondary, #c6c6c6);
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
