<script>
    import { ComposedModal, ModalHeader, ModalBody, ModalFooter, ExpandableTile, Column, Grid, Row, Checkbox } from "carbon-components-svelte";
    import { createEventDispatcher } from "svelte";


    /** dispatches the events when a button was clicked*/
    const dispatch = createEventDispatcher();

    /** the header of the modal @type {string} [heading='deContact Protocol Action'] */
    export let heading = 'deContact address request ';

    /** the button label when sending the contact data  @type {string} [heading='Send My Contact Data'] */
    export let SendMyContactData = 'Send My Contact Data';
    /** the button label when canceling the operation  @type {string} [heading='Send My Contact Data']*/
    export let CancelOperationButtonText = 'Cancel';

    /** the request from Alice, opened and verified (contact-messages.js) */
    export let data;

    /**
     * Who asks: the name Alice's request carries. Her address book is sealed to her (#59),
     * so we cannot look her card up there; the name is inside her signed request.
     * @type {{ firstName?: string, lastName?: string, city?: string }}
     */
    const from = data.from ?? {}
    const name = [from.firstName, from.lastName].filter(Boolean).join(' ')

    /** label for the checkbox which requests the contact data from Alice after Bob received her data @type {string} */
    const checkboxLabel = `Request contact data from ${name || 'them'}${from.city ? ` ${from.city}` : ''}`;

    /** if Alice receives a REQUEST_ADDRESS from Bob, he marks the pubsub message with nopingpong=true so Alice isn't requesting Bobs contact data again*/
    let exchangeData = !data.nopingpong
    let dontRequestData = data.nopingpong
</script>
<!--
@component
Opens a confirmation modal on Bob's device when Alice is requesting his contact data.
-->
<ComposedModal open on:close={() => dispatch('result', false)} on:submit={() => dispatch('result', true)}>
    <ModalHeader label="deContact Protocol Action" title={heading} />
    <ModalBody hasForm>
        <ExpandableTile>
            <div slot="above">
                <div data-testid="request-from">From:
                    {name || 'somebody without a name on their card'} {from.city ?? ''} <br/>
                    owner: {data.sender}<br/>
                </div>
                <p>&nbsp;</p>
                {#if !dontRequestData}
                    <Checkbox labelText={checkboxLabel} data-testid="requestContactData"  bind:checked={exchangeData} />{/if}
                <p>&nbsp;</p>
                <div>View Transaction Details</div>
            </div>
            <div slot="below">
                <Grid>
                    {#if data.command}<Row><Column>Command: {data.command}</Column></Row>{/if}
                    {#if data.text}<Row><Column>{data.text}</Column></Row>{/if}
                    {#if data.recipient}<Row><Column>Recipient: {data.recipient}</Column></Row>{/if}
                    {#if data.sender}<Row><Column>Sender: {data.sender}</Column></Row>{/if}
                    {#if data.timestamp}<Row><Column>TimeStamp: {data.timestamp}</Column></Row>{/if}
                </Grid>
            </div>
        </ExpandableTile>
    </ModalBody>

    <ModalFooter
            primaryButtonDisabled
            selectorPrimaryFocus=".bx--btn--primary"
            secondaryButtons={[
                { text: CancelOperationButtonText },{ text: SendMyContactData }
            ]}
            on:click:button--secondary={({ detail }) => {
                if (detail.text === CancelOperationButtonText) dispatch('result', false);
                if (detail.text === SendMyContactData) dispatch('result', (dontRequestData || !exchangeData)?"ONLY_HANDOUT":true)
            }}
    />
</ComposedModal>
