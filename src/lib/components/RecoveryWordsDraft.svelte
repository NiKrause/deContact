<script>
    /**
     * @component New recovery words on screen, not kept yet (#60): the person writes them
     * down and says so, then they become the vault's recovery slot (`onkeep`). Settings
     * shows it, and so does the offer after a temporary identity was secured (#97).
     */
    import { _ } from '#lib/i18n/index.js'

    /** words: from `draftRecoveryWords` */
    let { words, busy = false, onkeep, oncancel } = $props()
    let wroteDown = $state(false)
</script>

<div class="words" data-testid="recovery-words">
    <p>{$_('passkeys.writeDown')}</p>
    <ol>
        {#each words as word, i (i)}<li>{word}</li>{/each}
    </ol>
    <label><input type="checkbox" bind:checked={wroteDown} /> {$_('passkeys.wroteDown')}</label>
    <button class="bx--btn bx--btn--primary bx--btn--sm" disabled={busy || !wroteDown} onclick={onkeep}>{$_('passkeys.keepWords')}</button>
    <button class="bx--btn bx--btn--ghost bx--btn--sm" onclick={oncancel}>{$_('common.cancel')}</button>
</div>

<style>
    .words {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        max-width: 40rem;
    }
    .words ol {
        columns: 3;
        padding-left: 1.5rem;
        list-style: decimal;
    }
</style>
