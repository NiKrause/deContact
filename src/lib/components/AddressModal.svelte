<script>
    import { ComposedModal, ModalHeader, ModalBody, ModalFooter, ExpandableTile, Column, Grid, Row, Checkbox } from "carbon-components-svelte";
    import { _, formatDateTime } from "#lib/i18n/index.js";

    /**
     * data: the request from Alice, opened and verified (contact-messages.js);
     * onresult: what Bob chose (addressModal.js): true to share and ask back,
     * "ONLY_HANDOUT" to share only, false to cancel.
     * @type {{ data: any, onresult: (result: boolean | 'ONLY_HANDOUT') => void }}
     */
    let { data, onresult } = $props()

    /**
     * Who asks: the name Alice's request carries. Her address book is sealed to her (#59),
     * so we cannot look her card up there; the name is inside her signed request.
     * @type {{ firstName?: string, lastName?: string, city?: string }}
     */
    const from = $derived(data.from ?? {})
    const name = $derived([from.firstName, from.lastName].filter(Boolean).join(' '))

    /** label for the checkbox which requests the contact data from Alice after Bob received her data */
    const checkboxLabel = (tr) => tr('request.askBack', { name: [name || tr('request.them'), from.city].filter(Boolean).join(' ') });
    /** the two buttons, in the language on screen: read when shown and when clicked */
    const sendText = (tr) => tr('request.send')
    const cancelText = (tr) => tr('common.cancel')

    /** if Alice receives a REQUEST_ADDRESS from Bob, he marks the pubsub message with nopingpong=true so Alice isn't requesting Bobs contact data again*/
    let exchangeData = $derived(!data.nopingpong)
    const dontRequestData = $derived(data.nopingpong)
</script>
<!--
@component
Opens a confirmation modal on Bob's device when Alice is requesting his contact data.
-->
<ComposedModal open on:close={() => onresult(false)} on:submit={() => onresult(true)}>
    <ModalHeader label={$_('request.label')} title={$_('request.heading')} iconDescription={$_('common.close')} />
    <ModalBody hasForm>
        <ExpandableTile tileCollapsedIconText={$_('request.showDetails')} tileExpandedIconText={$_('request.hideDetails')}>
            <div slot="above">
                <div data-testid="request-from">{$_('request.from')}
                    {name || $_('request.nameless')} {from.city ?? ''} <br/>
                    {$_('request.owner')} {data.sender}<br/>
                </div>
                <p>&nbsp;</p>
                {#if !dontRequestData}
                    <Checkbox labelText={checkboxLabel($_)} data-testid="requestContactData"  bind:checked={exchangeData} />{/if}
                <p>&nbsp;</p>
                <div>{$_('request.details')}</div>
            </div>
            <div slot="below">
                <Grid>
                    {#if data.command}<Row><Column>{$_('request.command', { value: data.command })}</Column></Row>{/if}
                    {#if data.text}<Row><Column>{data.text}</Column></Row>{/if}
                    {#if data.recipient}<Row><Column>{$_('request.recipient', { value: data.recipient })}</Column></Row>{/if}
                    {#if data.sender}<Row><Column>{$_('request.sender', { value: data.sender })}</Column></Row>{/if}
                    {#if data.timestamp}<Row><Column>{$_('request.timestamp', { value: formatDateTime(data.timestamp) })}</Column></Row>{/if}
                </Grid>
            </div>
        </ExpandableTile>
    </ModalBody>

    <ModalFooter
            primaryButtonDisabled
            secondaryButtons={[
                { text: cancelText($_) },{ text: sendText($_) }
            ]}
            on:click:button--secondary={({ detail }) => {
                if (detail.text === cancelText($_)) onresult(false);
                if (detail.text === sendText($_)) onresult((dontRequestData || !exchangeData)?"ONLY_HANDOUT":true)
            }}
    />
</ComposedModal>
