<script>
    import { Accordion, AccordionItem, Button, ComposedModal, ModalBody, ModalFooter, ModalHeader } from "carbon-components-svelte";
    import { _, formatDateTime } from "#lib/i18n/index.js";

    /**
     * @component The request dialog (#110): somebody asks for our card. `data` is the request,
     * opened and verified (contact-messages.js). `onresult` gets the choice (addressModal.js):
     * true to share ours and ask for theirs, "ONLY_HANDOUT" to share ours only, false to
     * decline. A request that answers one of ours (`nopingpong`: they shared their card and ask
     * for ours in return) offers only "Share mine" and "Decline".
     * @type {{ data: any, onresult: (result: boolean | 'ONLY_HANDOUT') => void }}
     */
    let { data, onresult } = $props()

    /**
     * Who asks: the name and city their request carries. Their address book is sealed to them
     * (#59), so we cannot look their card up there; the name is inside their signed request.
     * @type {{ firstName?: string, lastName?: string, city?: string }}
     */
    const from = $derived(data.from ?? {})
    const name = $derived([from.firstName, from.lastName].filter(Boolean).join(' '))
    /** "Carol Beispiel (Beispielstadt)", in the language on screen */
    const who = (tr) => {
        if (!name) return tr('request.nameless')
        return from.city ? tr('request.nameAndCity', { name, city: from.city }) : name
    }
    const answersOurs = $derived(Boolean(data.nopingpong))
</script>

<ComposedModal open size="sm" class="request-dialog" data-testid="request-dialog" on:close={() => onresult(false)}>
    <ModalHeader title={$_('request.label')} iconDescription={$_('common.close')} />
    <ModalBody>
        <p class="who" data-testid="request-from">{$_(answersOurs ? 'request.wantsBack' : 'request.wants', { who: who($_) })}</p>
        <p class="what">{$_(answersOurs ? 'request.whatBack' : 'request.what')}</p>
        <Accordion>
            <AccordionItem title={$_('request.details')}>
                {#if data.timestamp}<p>{$_('request.asked', { value: formatDateTime(data.timestamp) })}</p>{/if}
                <p>{$_('request.sealed')}</p>
            </AccordionItem>
        </Accordion>
    </ModalBody>
    <!-- three choices, one per button: stacked at full width on a phone -->
    <ModalFooter>
        <div class="choices">
            {#if answersOurs}
                <Button kind="primary" on:click={() => onresult('ONLY_HANDOUT')}>{$_('request.shareMine')}</Button>
            {:else}
                <Button kind="primary" on:click={() => onresult(true)}>{$_('request.shareAndAsk')}</Button>
                <Button kind="secondary" on:click={() => onresult('ONLY_HANDOUT')}>{$_('request.onlyShare')}</Button>
            {/if}
            <Button kind="ghost" on:click={() => onresult(false)}>{$_('request.decline')}</Button>
        </div>
    </ModalFooter>
</ComposedModal>

<style>
    .who {
        font-size: 1.25rem;
        line-height: 1.4;
        margin-bottom: 0.5rem;
    }
    .what {
        margin-bottom: 1rem;
    }
    /* the buttons in a row, each as wide as its words; Carbon's footer has room for two */
    :global(.request-dialog .bx--modal-footer) {
        height: auto;
        padding: 1rem;
    }
    .choices {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 0.5rem;
        width: 100%;
    }
    .choices :global(.bx--btn) {
        flex: 1 1 auto;
        max-width: none;
        margin: 0;
    }
    /* a phone: one below the other, at full width, the main one first */
    @media (max-width: 41.98rem) {
        .choices {
            flex-direction: column;
        }
        .choices :global(.bx--btn) {
            width: 100%;
        }
    }
</style>
