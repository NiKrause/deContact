<script>
    import { Modal, Column, Grid, Row } from "carbon-components-svelte";
    import { _, formatDateTime } from "#lib/i18n/index.js";

    /**
     * @component A notice to confirm (experimentalUseModal.js): `onresult` gets true for
     * "Continue", false for "Cancel" or closing.
     * @type {{ data: { text?: string, command?: string, recipient?: string, sender?: string, timestamp?: number }, onresult: (result: boolean) => void }}
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
        {#if data.command} <Row><Column>{$_('request.command', { value: data.command })}</Column></Row> {/if}
        {#if data.text} <Row><Column>{data.text}</Column></Row> {/if}

        {#if data.recipient} <Row><Column>{$_('request.recipient', { value: data.recipient })}</Column></Row> {/if}
        {#if data.sender} <Row><Column>{$_('request.sender', { value: data.sender })}</Column></Row> {/if}
        {#if data.timestamp} <Row><Column>{$_('request.timestamp', { value: formatDateTime(data.timestamp) })}</Column></Row> {/if}
    </Grid>
</Modal>