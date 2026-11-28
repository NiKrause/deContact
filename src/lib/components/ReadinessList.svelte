<script>
    /**
     * @component The checklist of "Show my code" (#110): what the app and the network do
     * before the code can work, each step waiting (a small spinner), done (a tick) or a
     * problem (amber, with what to do). Folded into one line once everything is done.
     */
    import { InlineLoading } from "carbon-components-svelte";
    import CheckmarkFilled from "carbon-icons-svelte/lib/CheckmarkFilled.svelte";
    import WarningAltFilled from "carbon-icons-svelte/lib/WarningAltFilled.svelte";
    import { STEPS } from "#lib/network/readiness.js";
    import { _ } from "#lib/i18n/index.js";

    /**
     * readiness: readinessOf (readiness.js); onfillcard: "Fill in my business card" was chosen
     * @type {{ readiness: ReturnType<typeof import('#lib/network/readiness.js').readinessOf>, onfillcard: () => void }}
     */
    let { readiness, onfillcard } = $props();
</script>

{#if readiness.allDone}
    <p class="summary" role="status" data-testid="readiness-summary">
        <CheckmarkFilled size={20} class="done" aria-hidden="true" />{$_("readiness.ready")}
    </p>
{:else}
    <ol class="steps" aria-label={$_("readiness.title")} data-testid="readiness">
        {#each STEPS as step (step)}
            {@const state = readiness.steps[step]}
            <li class={state} data-testid="readiness-{step}" data-state={state}>
                <span class="mark" aria-hidden="true">
                    {#if state === "done"}
                        <CheckmarkFilled size={20} class="done" />
                    {:else if state === "problem"}
                        <WarningAltFilled size={20} class="problem" />
                    {:else}
                        <InlineLoading />
                    {/if}
                </span>
                <span class="label">
                    {$_(`readiness.${step}`)}
                    <span class="bx--visually-hidden">: {$_(`readiness.state.${state}`)}</span>
                </span>
                {#if step === "card" && state === "problem"}
                    <button type="button" class="bx--btn bx--btn--tertiary bx--btn--sm fill" onclick={onfillcard}>{$_("readiness.fillCard")}</button>
                {/if}
            </li>
        {/each}
    </ol>
{/if}
{#if readiness.notReachable}
    <p class="late" role="status" data-testid="readiness-not-reachable">{$_("readiness.notReachable")}</p>
{/if}

<style>
    .summary {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        justify-content: center;
    }
    .steps {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin: 0;
        padding: 0;
        list-style: none;
    }
    .steps li {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.25rem 0.75rem;
        min-height: 2rem;
    }
    .mark {
        display: inline-flex;
        width: 1.5rem;
        justify-content: center;
        flex: none;
    }
    .mark :global(.bx--inline-loading) {
        width: auto;
        min-height: 0;
    }
    .steps li.waiting .label {
        color: var(--cds-text-secondary, #c6c6c6);
    }
    :global(svg.done) {
        fill: var(--cds-support-02, #42be65);
    }
    :global(svg.problem) {
        fill: var(--cds-support-03, #f1c21b);
    }
    .fill {
        margin: 0 0 0 2.25rem;
    }
    .late {
        padding: 0.75rem 1rem;
        border-left: 3px solid var(--cds-support-03, #f1c21b);
        background: var(--cds-ui-01, #393939);
    }
</style>
