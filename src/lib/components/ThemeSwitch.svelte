<script>
    /**
     * @component Light or dark (#110), in Settings: as the system is set (the default), or
     * always light, or always dark. At once, kept in this browser (lib/theme.js). Built like
     * the language switch above it.
     */
    import { _ } from '#lib/i18n/index.js'
    import { THEMES, setTheme, theme } from '#lib/theme.js'
</script>

<div class="theme" role="group" aria-labelledby="theme-label" aria-describedby="theme-help" data-testid="theme-switch">
    <span class="bx--label" id="theme-label">{$_('theme.label')}</span>
    <div class="buttons">
        {#each THEMES as choice (choice)}
            <button
                type="button"
                class="bx--btn bx--btn--sm {$theme === choice ? 'bx--btn--primary' : 'bx--btn--tertiary'}"
                aria-pressed={$theme === choice}
                onclick={() => setTheme(choice)}
                data-testid="theme-{choice}">{$_(`theme.${choice}`)}</button>
        {/each}
    </div>
    <span class="bx--form__helper-text" id="theme-help">{$_('theme.help')}</span>
</div>

<style>
    .theme {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }
    .buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
    }
    /* three side by side at 344 px: Carbon keeps room on the right for an icon these have not */
    .buttons :global(.bx--btn) {
        margin-bottom: 0;
        padding-right: 0.75rem;
    }
</style>
