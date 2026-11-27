<script>
    /**
     * @component Which build runs: its version, when it was published (built, for GitHub
     * Pages), its commit and the source. Under every screen, the first one included, so a
     * phone at a stand shows which version it has. The values come from the build
     * (vite.config.js).
     */
    import { _, formatDateTime } from '#lib/i18n/index.js'

    const REPOSITORY = 'https://github.com/NiKrause/deContact'
    const version = import.meta.env.VITE_APP_VERSION
    const commit = import.meta.env.VITE_COMMIT ?? ''
    const builtAt = import.meta.env.VITE_BUILT_AT
</script>

<footer class="app-info" data-testid="app-info">
    <span>{$_('about.version', { version })}</span>
    {#if builtAt}<span>· {$_('about.published', { date: formatDateTime(builtAt) })}</span>{/if}
    {#if commit}
        <span>· <a href="{REPOSITORY}/commit/{commit}" target="_blank" rel="noopener noreferrer" data-testid="app-commit">{$_('about.commit', { commit: commit.slice(0, 7) })}</a></span>
    {/if}
    <span>· <a href={REPOSITORY} target="_blank" rel="noopener noreferrer">{$_('about.source')}</a></span>
</footer>

<style>
    .app-info {
        display: flex;
        flex-wrap: wrap;
        gap: 0.25rem 0.5rem;
        margin: 2rem 1rem 1rem;
        font-size: 0.75rem;
        opacity: 0.7;
    }
    .app-info a {
        color: inherit;
    }
</style>
