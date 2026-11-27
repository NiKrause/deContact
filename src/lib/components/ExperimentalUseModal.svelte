<script>
    import { Modal, Column, Grid, Row } from "carbon-components-svelte";
    import { createEventDispatcher } from "svelte";
    import { _, formatDateTime } from "#lib/i18n/index.js";
    const dispatch = createEventDispatcher();

    /* the header of the modal, else the catalogue's (#89) @type {string | undefined} */
    export let heading = undefined;
    /* the message to be displayed @type {string}  [message=''Do you want to proceed?']*/
    // export let message = 'Do you want to proceed?';
    /* ok button (true), else the catalogue's "Continue" @type {string | undefined} */
    export let TrueButtonText = undefined;
    /* the cancel button (false), else the catalogue's "Cancel" @type {string | undefined} */
    export let FalseButtonText = undefined;
    export let data

    let text

    console.log("data",data)
    function copySuccess(){
        text = "Copied!"
    }

    function copyError(event){
        text = `Error! ${event.detail}`
    }
</script>
<svelte:window on:copysuccess={copySuccess} on:copyerror={copyError}/>

<Modal  open
        shouldSubmitOnEnter={false}
        primaryButtonText={TrueButtonText ?? $_('common.continue')}
        secondaryButtonText={FalseButtonText ?? $_('common.cancel')}
        iconDescription={$_('common.close')}
        selectorPrimaryFocus=".bx--btn--primary"
        modalHeading={heading ?? $_('experimental.heading')}
        on:close={() => dispatch('result', false)}
        on:click:button--secondary={() => {
            /** when a button is clicked 'result' event with a result object is dispatched @return {boolean} true or false according to the clicked button */
            dispatch('result', false);
        }}
        on:submit={() => dispatch('result', true)}
>
    <Grid>
        {#if data.command} <Row><Column>{$_('request.command', { value: data.command })}</Column></Row> {/if}
        {#if data.text} <Row><Column>{data.text}</Column></Row> {/if}

        {#if data.recipient} <Row><Column>{$_('request.recipient', { value: data.recipient })}</Column></Row> {/if}
        {#if data.sender} <Row><Column>{$_('request.sender', { value: data.sender })}</Column></Row> {/if}
        {#if data.timestamp} <Row><Column>{$_('request.timestamp', { value: formatDateTime(data.timestamp) })}</Column></Row> {/if}
    </Grid>
</Modal>