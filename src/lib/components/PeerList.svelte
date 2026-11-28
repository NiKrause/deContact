<script>
    /**
     * @component The connected peers and how each is reached, in the header's toggletip
     * (PeersStatus.svelte) and in Settings → Network: a sum line, then each peer as relay or
     * browser, its short id with a button that copies the whole one, and its transport,
     * direct or relayed (lib/network/peer-list.js). Never another browser's address; a
     * relay's DNS name may show.
     */
    import { CopyButton } from 'carbon-components-svelte'
    import { _ } from '#lib/i18n/index.js'
    import { connectionText, summaryOf, summaryText } from '#lib/network/peer-list.js'
    import { peerList } from '../../stores.js'

    const summary = $derived(summaryText(summaryOf($peerList), $_))

    /**
     * the other ways a peer is still connected, such as the relayed circuit after the upgrade to WebRTC
     * @param {import('#lib/network/peer-list.js').ConnectionInfo[]} connections
     */
    const alsoOpen = (connections) => connections.slice(1).map((c) => connectionText(c, $_)).join('; ')
</script>

<div class="peer-list">
    <p class="summary" data-testid="peer-summary">{summary}</p>
    {#if $peerList.length > 0}
        <ul class="peers">
            {#each $peerList as peer (peer.id)}
                <li
                    class="peer"
                    data-testid="peer"
                    data-kind={peer.kind}
                    data-transport={peer.best.transport}
                    data-relayed={peer.best.relayed}>
                    <div class="who">
                        <span class="kind">{$_(`peers.kind.${peer.kind}`)}</span>
                        <code class="id">{peer.short}</code>
                        <CopyButton
                            kind="ghost"
                            size="sm"
                            text={peer.id}
                            iconDescription={$_('peers.copy', { id: peer.short })}
                            feedback={$_('peers.copied')}
                            errorFeedback={$_('peers.copyFailed')} />
                    </div>
                    <div class="how">
                        {connectionText(peer.best, $_)}{#if peer.host}<span class="host"> · {peer.host}</span>{/if}
                    </div>
                    {#if peer.connections.length > 1}
                        <div class="also">
                            {$_('peers.also', { ways: alsoOpen(peer.connections) })}
                        </div>
                    {/if}
                </li>
            {/each}
        </ul>
    {/if}
</div>

<style>
    .peer-list {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        min-width: 0;
    }
    .summary {
        font-size: 0.875rem;
        line-height: 1.29;
    }
    .peers {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .peer {
        display: flex;
        flex-direction: column;
        gap: 0.125rem;
        min-width: 0;
        padding-top: 0.5rem;
        border-top: 1px solid var(--cds-border-subtle, #e0e0e0);
    }
    .who {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        min-width: 0;
    }
    .kind {
        font-size: 0.875rem;
        font-weight: 600;
    }
    .id {
        font-family: var(--cds-code-01-font-family, 'IBM Plex Mono', monospace);
        font-size: 0.75rem;
        overflow-wrap: anywhere;
    }
    .how,
    .also {
        font-size: 0.75rem;
        line-height: 1.34;
        overflow-wrap: anywhere;
    }
    .also,
    .host {
        color: var(--cds-text-secondary, #525252);
    }
</style>
