<script>
    /**
     * @component One of a few choices, as a row of buttons (#110): the one chosen is pressed
     * (`aria-pressed`), the group is named by its label and described by a line below. Built
     * like the language switch; Settings has the theme and the accent colour this way.
     */

    /**
     * @type {{
     *   id: string,
     *   label: string,
     *   help?: string,
     *   choices: { value: string, text: string, swatch?: string }[],
     *   value: string,
     *   onchoose: (value: string) => void
     * }}
     */
    let { id, label, help, choices, value, onchoose } = $props()
</script>

<div class="choice-switch" role="group" aria-labelledby="{id}-label" aria-describedby={help ? `${id}-help` : undefined} data-testid="{id}-switch">
    <span class="bx--label" id="{id}-label">{label}</span>
    <div class="buttons">
        {#each choices as choice (choice.value)}
            <button
                type="button"
                class="bx--btn bx--btn--sm {value === choice.value ? 'bx--btn--primary' : 'bx--btn--tertiary'}"
                aria-pressed={value === choice.value}
                onclick={() => onchoose(choice.value)}
                data-testid="{id}-{choice.value}">
                {#if choice.swatch}<span class="swatch" style:background={choice.swatch} aria-hidden="true"></span>{/if}{choice.text}
            </button>
        {/each}
    </div>
    {#if help}<span class="bx--form__helper-text" id="{id}-help">{help}</span>{/if}
</div>

<style>
    .choice-switch {
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
        gap: 0.5rem;
    }
    /* the colour itself, ringed in the text's colour so it shows on its own colour too */
    .swatch {
        display: inline-block;
        flex: none;
        width: 0.875rem;
        height: 0.875rem;
        border-radius: 50%;
        box-shadow: 0 0 0 1px currentColor;
    }
</style>
