<script>
    import { Modal, Column, Grid, Row } from "carbon-components-svelte";
    import { _ } from "#lib/i18n/index.js";

    /**
     * @component A notice to confirm (experimentalUseModal.js): `onresult` gets true for
     * "Continue", false for "Cancel" or closing.
     * @type {{ data: { text?: string }, onresult: (result: boolean) => void }}
     */
    let { data, onresult } = $props()
</script>

<Modal  open
        shouldSubmitOnEnter={false}
        primaryButtonText={$_('common.continue')}
        secondaryButtonText={$_('common.cancel')}
        iconDescription={$_('common.close')}
        selectorPrimaryFocus=".bx--btn--primary"
        modalHeading={$_('experimental.heading')}
        on:close={() => onresult(false)}
        on:click:button--secondary={() => onresult(false)}
        on:submit={() => onresult(true)}
>
    <Grid>
        {#if data.text} <Row><Column>{data.text}</Column></Row> {/if}
    </Grid>
</Modal>