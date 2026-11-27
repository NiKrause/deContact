<script>
    /**
     * @component English / Deutsch (#89): at once, kept in this browser, offline (both
     * catalogues are in the bundle). In Settings, and on the first screen, which comes before
     * Settings can be reached (an invitation link opens there).
     */
    import { LOCALES, _, language, setLocale } from '#lib/i18n/index.js'

    /** @type {{ testid?: string }} */
    let { testid = 'language' } = $props()
</script>

<div class="language" role="group" aria-label={$_('language.label')} data-testid="{testid}-switch">
    <span class="bx--label">{$_('language.label')}</span>
    <div class="buttons">
        {#each LOCALES as code (code)}
            <button
                type="button"
                class="bx--btn bx--btn--sm {$language === code ? 'bx--btn--primary' : 'bx--btn--ghost'}"
                aria-pressed={$language === code}
                lang={code}
                onclick={() => setLocale(code)}
                data-testid="{testid}-{code}">{$_(`language.${code}`)}</button>
        {/each}
    </div>
</div>

<style>
    .language {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }
    .buttons {
        display: flex;
        gap: 0.5rem;
    }
    .buttons :global(.bx--btn) {
        margin-bottom: 0;
    }
</style>
