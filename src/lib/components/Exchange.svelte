<script>
    /**
     * @component The start screen (#110): what deContact is used for at a stand. One status
     * line, the exchanges still waiting, and two big buttons at the bottom, under the thumb:
     * "Show my code" and "Scan a code", each one tap from opening the app. A contact address
     * can still be pasted ("Paste a contact address instead"): the camera's dialog belongs to
     * <qr-scanner> and has no room for it.
     */
    import { Button, TextInput } from "carbon-components-svelte";
    import QrCode from "carbon-icons-svelte/lib/QrCode.svelte";
    import Scan from "carbon-icons-svelte/lib/Scan.svelte";
    import QrScanner from "./QrScanner.svelte";
    import { dbMyAddressBook, exchangesWaiting, myAddressBook, networkState, orbitdb, qrCodeData, qrCodeOpen } from "../../stores.js";
    import { LATE_AFTER_MS, readinessOf } from "#lib/network/readiness.js";
    import { requestAddress } from "#lib/network/p2p-operations.js";
    import { parseContactAddress } from "#lib/network/contact-address.js";
    import { notify } from "../../utils/utils.js";
    import { _ } from "#lib/i18n/index.js";

    /** @type {any} */
    let scanner = $state();
    let pasting = $state(false);
    let pasted = $state("");

    const me = $derived($orbitdb?.identity?.id);
    // the relay may take a while: "Connecting…" first, "not reachable" only after LATE_AFTER_MS
    let late = $state(false);
    $effect(() => {
        const timer = setTimeout(() => (late = true), LATE_AFTER_MS);
        return () => clearTimeout(timer);
    });
    /** the states of Show my code's checklist (readiness.js), in one line */
    const readiness = $derived(readinessOf({
        bookOpen: Boolean(me && $dbMyAddressBook?.address),
        network: $networkState,
        ownCard: me ? $myAddressBook?.find((card) => card.owner === me && card.own) : undefined,
        late
    }));
    const ready = $derived(readiness.allDone);
    /** what the status line says: ready, a card without a name, not reachable yet, or still starting */
    const status = $derived(
        readiness.allDone ? "exchange.ready"
            : readiness.steps.card === "problem" ? "exchange.fillCard"
            : readiness.steps.network === "done" && late ? "exchange.notReachable"
            : "exchange.connecting"
    );

    function showCode() {
        $qrCodeData = $orbitdb?.identity?.id;
        $qrCodeOpen = true;
    }

    /** what the camera read: an invitation link opens here, a contact address is asked */
    function scanned(target) {
        if (target.kind === "link") {
            window.location.hash = target.hash;
            return;
        }
        return requestAddress(target.did, false, target.onBoardingToken, target.peer);
    }

    /** a pasted contact address or invitation link: whom to ask, on which device (contact-address.js) */
    function ask() {
        const address = parseContactAddress(pasted);
        if (!address) {
            notify($_("notify.noContactAddress"), "warning");
            return;
        }
        pasted = "";
        return requestAddress(address.did, false, address.onBoardingToken, address.peer);
    }
</script>

<section class="exchange" data-testid="exchange">
    <h2 class="bx--visually-hidden">{$_("nav.exchange")}</h2>
    <p class="status" class:ready role="status" data-testid="exchange-status">
        <span class="dot" aria-hidden="true"></span>
        {$_(status)}
    </p>
    {#if status === "exchange.fillCard"}
        <a class="fill-card" href="#/card" data-testid="fill-card">{$_("exchange.fillCardNow")}</a>
    {/if}

    <!-- an invitation link we opened: its inviter's phone has not answered yet (#86) -->
    {#each $exchangesWaiting as waiting (waiting.inviter)}
        <p class="waiting" role="status" data-testid="waiting-for-phone">{waiting.name ? $_("home.waiting", { name: waiting.name }) : $_("home.waitingNameless")}</p>
    {/each}

    <div class="spacer"></div>

    {#if pasting}
        <form class="paste" onsubmit={(event) => { event.preventDefault(); ask(); }}>
            <TextInput data-testid="scan-field" labelText={$_("exchange.pasteLabel")} placeholder={$_("scanner.hint")} bind:value={pasted} />
            <Button type="submit" kind="secondary" disabled={!pasted.trim()}>{$_("exchange.ask")}</Button>
        </form>
    {/if}

    <div class="actions">
        <Button class="big" kind="primary" on:click={showCode}>
            <span class="big-label"><QrCode size={32} aria-hidden="true" />{$_("exchange.showCode")}</span>
        </Button>
        <Button class="big" kind="secondary" on:click={() => scanner.open()}>
            <span class="big-label"><Scan size={32} aria-hidden="true" />{$_("exchange.scan")}</span>
        </Button>
    </div>
    {#if !pasting}
        <Button kind="ghost" size="sm" class="paste-instead" on:click={() => (pasting = true)}>{$_("exchange.paste")}</Button>
    {/if}
    <QrScanner bind:this={scanner} onscan={scanned} />
</section>

<style>
    .exchange {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        max-width: 40rem;
    }
    /* a phone and the open Fold: the buttons at the bottom, under the thumb */
    @media (max-width: 65.98rem) {
        .exchange {
            min-height: calc(100dvh - 14rem);
        }
    }
    /* a desktop: the buttons right under the status line */
    @media (min-width: 66rem) {
        .spacer {
            display: none;
        }
    }
    .status {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 1.125rem;
    }
    .dot {
        width: 0.75rem;
        height: 0.75rem;
        border-radius: 50%;
        background: var(--cds-support-03, #f1c21b);
        flex: none;
    }
    .status.ready .dot {
        background: var(--cds-support-02, #42be65);
    }
    .waiting {
        overflow-wrap: anywhere;
    }
    .fill-card {
        align-self: flex-start;
    }
    .spacer {
        flex: 1 1 auto;
    }
    .paste {
        display: flex;
        align-items: flex-end;
        gap: 0.5rem;
    }
    .paste :global(.bx--form-item) {
        flex: 1 1 auto;
        min-width: 0;
    }
    .paste :global(.bx--btn) {
        margin: 0;
    }
    .actions {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.5rem;
    }
    .actions :global(.bx--btn.big) {
        max-width: none;
        width: 100%;
        min-height: 6rem;
        margin: 0;
        padding: 0.75rem;
        justify-content: center;
        align-items: center;
    }
    .big-label {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.5rem;
        font-size: 1rem;
        text-align: center;
    }
    :global(.bx--btn.paste-instead) {
        align-self: center;
    }
</style>
