<script>
    /**
     * @component Offers to install deContact (#146): Chrome's own install dialog where the
     * browser offered one (lib/pwa/install.js), a short guide on an iPhone or iPad, nothing
     * once the app runs installed or where the browser cannot install it.
     */
    import { Button } from "carbon-components-svelte";
    import { install, installPrompt, installed, isIos } from "#lib/pwa/install.js";
    import { _ } from "#lib/i18n/index.js";

    /** @type {{ testid?: string }} */
    let { testid = "install-app" } = $props();

    const ios = isIos();
    let guide = $state(false);

    function offer() {
        if ($installPrompt) install($installPrompt);
        else guide = !guide;
    }
</script>

{#if !$installed && ($installPrompt || ios)}
    <div class="install" data-testid={testid}>
        <Button kind="tertiary" size="field" on:click={offer}>{$_("install.button")}</Button>
        <p class="help">{$_("install.why")}</p>
        {#if guide}
            <p class="guide" role="status" data-testid="{testid}-guide">{$_("install.ios")}</p>
        {/if}
    </div>
{/if}

<style>
    .install {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.25rem;
    }
    .help {
        color: var(--cds-text-secondary, #c6c6c6);
        font-size: 0.75rem;
    }
</style>
