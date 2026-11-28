<script>
    /**
     * @component The network state in the header: the antenna, coloured by how many peers are
     * connected, and their number. A toggletip names the peers and how each is reached
     * (PeerList.svelte): a click, a tap, Enter or Space opens and closes it, and so does a
     * mouse resting on it; a click keeps it open after the mouse leaves. Escape, a click
     * elsewhere or Tab out of it close it.
     *
     * Built on Carbon's Popover rather than its Toggletip: the toggletip's high-contrast
     * surface would hide the copy buttons' icons, and it opens by click only.
     */
    import ConnectionSignalOff from 'carbon-icons-svelte/lib/ConnectionSignalOff.svelte'
    import ConnectionSignal from 'carbon-icons-svelte/lib/ConnectionSignal.svelte'
    import { Popover } from 'carbon-components-svelte'
    import { _ } from '#lib/i18n/index.js'
    import { connectedPeers } from '../../stores.js'
    import PeerList from './PeerList.svelte'

    /** how long the mouse may be away before a toggletip it opened closes */
    const HOVER_CLOSE_MS = 300
    const contentId = 'peers-toggletip'

    /** what the antenna's colour says, in words, with the number next to it */
    const peersState = $derived($connectedPeers === 0 ? 'header.peers.none' : $connectedPeers === 1 ? 'header.peers.seed' : 'header.peers.swarm')
    const peersText = $derived(`${$_(peersState)} ${$_('header.peers.count', { count: $connectedPeers })}`)

    let open = $state(false)
    /** opened by a click, a tap or a key: stays open when the mouse leaves */
    let pinned = $state(false)
    /** @type {HTMLElement | undefined} */
    let wrapper = $state()
    /** @type {HTMLButtonElement | undefined} */
    let button = $state()
    /** @type {HTMLElement | undefined} */
    let content = $state()
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let closing

    function close() {
        clearTimeout(closing)
        open = false
        pinned = false
    }

    function toggle() {
        clearTimeout(closing)
        // a click on what the mouse opened keeps it open
        if (open && !pinned) pinned = true
        else if (open) close()
        else open = pinned = true
    }

    /** @param {PointerEvent} event */
    function hoverIn(event) {
        if (event.pointerType !== 'mouse') return // a tap is a click
        clearTimeout(closing)
        if (!open) open = true
    }

    /** whether a node is the button's or the toggletip's (which Carbon may move to a portal) */
    const ours = (/** @type {Node | null} */ node) => Boolean(node && (wrapper?.contains(node) || content?.contains(node)))

    /** @param {PointerEvent} event */
    function hoverOut(event) {
        if (event.pointerType !== 'mouse' || pinned) return
        // from the button into the toggletip, or back: still on it
        if (ours(/** @type {Node | null} */ (event.relatedTarget))) return
        clearTimeout(closing)
        closing = setTimeout(close, HOVER_CLOSE_MS)
    }

    /** @param {KeyboardEvent} event */
    function onKeydown(event) {
        if (!open || event.key !== 'Escape') return
        const focusInside = ours(document.activeElement)
        close()
        if (focusInside) button?.focus()
    }

    /** @param {FocusEvent} event */
    function onFocusout(event) {
        const to = /** @type {Node | null} */ (event.relatedTarget)
        if (open && to && !ours(to)) close()
    }

    /** @param {CustomEvent<{ target: EventTarget | null }>} event */
    function onOutsideClick(event) {
        // the button is outside the popover, but toggles it itself
        if (!ours(/** @type {Node | null} */ (event.detail.target))) close()
    }
</script>

<svelte:window onkeydown={onKeydown} />

<!-- not in HeaderNav: that is a menu bar, which holds only menu items. The colour and the
     number are for the eye; the hidden text says both. Not a live region: the number changes
     too often to be read out each time. -->
<!-- the hover only adds to what the button does -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<span
    class="peers"
    data-testid="peers"
    bind:this={wrapper}
    onpointerenter={hoverIn}
    onpointerleave={hoverOut}
    onfocusout={onFocusout}>
    <button
        bind:this={button}
        type="button"
        class="peers-button"
        data-testid="peers-button"
        aria-expanded={open}
        aria-controls={open ? contentId : undefined}
        onclick={toggle}>
        {#if $connectedPeers === 0}
            <ConnectionSignalOff aria-hidden="true" class="statusRed" />
        {:else}
            <ConnectionSignal aria-hidden="true" class={$connectedPeers === 1 ? 'statusYellow' : 'statusGreen'} />
        {/if}
        <span aria-hidden="true">&nbsp;{$connectedPeers}</span>
        <span class="bx--visually-hidden">{peersText}</span>
    </button>
    <Popover {open} align="bottom-right" caret border class="peers-popover" on:click:outside={onOutsideClick}>
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
            bind:this={content}
            class="peers-content"
            id={contentId}
            data-testid="peers-toggletip"
            onpointerenter={hoverIn}
            onpointerleave={hoverOut}
            onfocusout={onFocusout}>
            <p class="title">{$_('peers.title')}</p>
            <PeerList />
        </div>
    </Popover>
</span>

<style>
    .peers {
        position: relative;
        display: flex;
        align-items: stretch;
        height: 100%;
    }
    .peers-button {
        display: flex;
        align-items: center;
        height: 100%;
        padding: 0 1rem;
        border: 0;
        background: transparent;
        color: var(--cds-text-secondary, #525252);
        font: inherit;
        font-size: 0.875rem;
        cursor: pointer;
    }
    .peers-button:hover {
        background-color: var(--cds-background-hover, #8d8d8d1f);
        color: var(--cds-text-primary, #161616);
    }
    .peers-button:focus-visible {
        outline: 2px solid var(--cds-focus, #0f62fe);
        outline-offset: -2px;
    }
    .peers-button[aria-expanded='true'] {
        background-color: var(--cds-layer-selected, #e0e0e0);
        color: var(--cds-text-primary, #161616);
    }
    /* on the Fold closed (344 px) it fits between the screen's edges, 1 rem from each */
    .peers :global(.peers-popover .bx--popover-contents) {
        max-width: calc(100vw - 2rem);
    }
    .peers-content {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        box-sizing: border-box;
        padding: 1rem;
        width: min(20rem, calc(100vw - 2rem));
        text-align: left;
    }
    .title {
        font-size: 0.875rem;
        font-weight: 600;
    }
</style>
