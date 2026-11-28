<script>
    /**
     * @component Settings → Network: the peers, and how each is connected, as the header's
     * toggletip lists them (PeerList.svelte), with the antenna in its colour.
     */
    import ConnectionSignalOff from "carbon-icons-svelte/lib/ConnectionSignalOff.svelte";
    import ConnectionSignal from "carbon-icons-svelte/lib/ConnectionSignal.svelte";
    import { connectedPeers } from "../../stores.js";
    import PeerList from "./PeerList.svelte";
</script>

<div class="statistics" data-testid="network-peers">
    <span class="antenna" aria-hidden="true">
        {#if $connectedPeers === 0}
            <ConnectionSignalOff class="statusRed" />
        {:else}
            <ConnectionSignal class={$connectedPeers === 1 ? 'statusYellow' : 'statusGreen'} />
        {/if}
    </span>
    <PeerList />
</div>

<style>
    .statistics {
        display: flex;
        align-items: flex-start;
        gap: 0.5rem;
        margin-bottom: 1.5rem;
    }
    .antenna {
        display: flex;
        padding-top: 0.0625rem;
    }
    .statistics :global(.peer-list) {
        flex: 1;
    }
</style>
