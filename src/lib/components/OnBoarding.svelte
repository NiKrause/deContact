<script>
    /**
     * @component Somebody opened an invitation link (#86). The inviter's card arrives by
     * itself (the view then shows their name and photo, #87), while the person types their own: email, first and last name, the address
     * behind "Add address". Then they choose whether the inviter gets it: "Save and share
     * with Alice" or "Save only"; a link without a two-way exchange offers only "Save". A
     * request of the inviter waits for that choice, and no request dialog appears here
     * (p2p-operations.js openInvitationLink, exchanges.js).
     *
     * On a device without deContact the form shows without a passkey (#97): a temporary
     * identity starts once the person starts on the form, and only then is the inviter
     * asked, so "Already have a deContact passkey? Sign in" before that leaves the link's
     * one-time token unused. The passkey is offered after the exchange (SecureOffer).
     */
    import { onDestroy } from 'svelte'
    import { did, query } from '../../routes/router.js'
    import { connectedPeers, dbMyAddressBook, myAddressBook, orbitdb } from '../../stores.js'
    import {
        chooseExchange,
        leaveInvitationLink,
        openInvitationLink,
        saveOwnCard,
        sendInvitationLinkRequest
    } from '#lib/network/p2p-operations.js'
    import { sha256 } from '../../utils/utils.js'
    import { session, startTemporary, temporaryAhead } from '#lib/identity/session.js'
    import { withSignIn } from '#lib/identity/temporary.js'
    import { InlineLoading } from 'carbon-components-svelte'
    import ContactPhoto from './ContactPhoto.svelte'
    import LanguageSwitch from './LanguageSwitch.svelte'
    import { _, t } from '#lib/i18n/index.js'

    // #/onboarding/<the inviter's DID>?onBoardingToken=<their one-time token>&peer=<their device>
    const inviter = ($did ?? '').trim()
    const onBoardingToken = new URLSearchParams($query ?? '').get('onBoardingToken') ?? undefined
    // the inviter's device: where our request goes (contact-protocol.js)
    const inviterPeer = new URLSearchParams($query ?? '').get('peer') ?? undefined

    const NAME_FIELDS = ['email', 'firstName', 'lastName']
    const ADDRESS_FIELDS = ['street', 'postalCode', 'city', 'countryRegion']

    let card = $state(Object.fromEntries([...NAME_FIELDS, ...ADDRESS_FIELDS].map((field) => [field, ''])))
    let showAddress = $state(false)
    /** whether the link lets us share back, once it is checked (locally, against the DID) */
    let twoWay = $state(false)
    let linkChecked = $state(false)
    let saving = $state(false)
    /** what went wrong, read in the language on screen @type {(() => string) | undefined} */
    let problem = $state()
    let requested = false
    let prefilled = false

    const opening = openInvitationLink(inviter, onBoardingToken, inviterPeer).then((link) => {
        twoWay = link.twoWay
        linkChecked = true
    })
    // leaving without a choice: a request of the inviter is asked for in the dialog
    onDestroy(() => leaveInvitationLink(inviter))

    // ask the inviter once our book is open and a peer is there; resent until answered
    $effect(() => {
        if (requested || !$dbMyAddressBook?.address || $connectedPeers < 1) return
        requested = true
        opening
            .then(() => sendInvitationLinkRequest(inviter, onBoardingToken))
            .catch((error) => console.log('could not send the request of the invitation link:', error?.message))
    })

    /** the person starts on the form: a temporary identity starts, if one is to (#97) */
    function engage() {
        if ($temporaryAhead) startTemporary().catch((error) => console.error('the temporary identity did not start:', error))
    }
    /** the passkey screen instead (today's flow): the page opens this link again with a passkey first */
    function signIn() {
        history.replaceState(null, '', withSignIn(window.location.href))
        window.location.reload()
    }
    const temporary = $derived($temporaryAhead || Boolean($session?.temporary))

    const me = $derived($orbitdb?.identity?.id)
    /** the inviter's card, once it arrived (our placeholder sits under its key until then) */
    const inviterCard = $derived(
        $myAddressBook?.find((it) => it.owner === inviter && !(it.firstName === 'invited' && it.lastName === inviter))
    )
    /** an address book that already has a card of ours: it is shown to be checked */
    const ownCard = $derived(me ? $myAddressBook?.find((it) => it.owner === me && it.own) : undefined)
    /** the inviter's first name once their card is here; until then nobody's: the DID is no name (#110) */
    const inviterName = $derived(inviterCard?.firstName || inviterCard?.lastName || inviterCard?.email || '')
    /** what is being done after a click on save: shown while it lasts @type {'share' | 'only' | 'save' | undefined} */
    let savingAs = $state()
    const filledIn = $derived(NAME_FIELDS.some((field) => card[field].trim() !== ''))
    const canSave = $derived(linkChecked && filledIn && Boolean(me && $dbMyAddressBook?.address) && !saving)

    $effect(() => {
        if (prefilled || !ownCard) return
        prefilled = true
        for (const field of Object.keys(card)) card[field] = typeof ownCard[field] === 'string' ? ownCard[field] : ''
        // a card of an older version had our DID as its last name: never show or send that
        if (card.lastName === me) card.lastName = ''
        showAddress = ADDRESS_FIELDS.some((field) => card[field] !== '')
    })

    /** @param {'share' | 'only' | 'save'} choice */
    async function save(choice) {
        saving = true
        savingAs = choice
        problem = undefined
        try {
            const fields = Object.fromEntries(Object.entries(card).map(([field, value]) => [field, value.trim()]))
            const next = { category: 'business', ...ownCard, ...fields, owner: me, own: true, sharedAddress: $dbMyAddressBook.address }
            delete next.id
            next._id = ownCard?._id ?? (await sha256(JSON.stringify(next)))
            await saveOwnCard(next)
            await chooseExchange(inviter, choice)
            window.location.hash = '/'
        } catch (error) {
            console.error('could not save the card:', error)
            problem = () => t('onboarding.problem')
        } finally {
            saving = false
            savingAs = undefined
        }
    }
</script>

<div class="content onboarding" data-testid="onboarding">
    {#if inviterCard}
        <div class="inviter">
            <ContactPhoto photo={inviterCard.photo} size={96} testid="inviter-photo" />
            <h3 data-testid="inviter-card">
                {$_('onboarding.added', { name: [inviterCard.firstName, inviterCard.lastName].filter(Boolean).join(' ') || inviterCard.email || $_('onboarding.inviter') })}
            </h3>
        </div>
    {:else}
        <!-- until their card is here, their name is not known: the line says whose card it is, without the DID -->
        <div class="arriving">
            <InlineLoading />
            <h3 data-testid="waiting-for-phone">{$_('onboarding.onTheWay')}</h3>
        </div>
    {/if}

    <form class="card" onsubmit={(event) => event.preventDefault()} onfocusin={engage} oninput={engage}>
        <h4>{$_('onboarding.yourDetails')}</h4>
        <label class="bx--label" for="onboarding-email">{$_('onboarding.email')}</label>
        <input id="onboarding-email" class="bx--text-input" type="email" autocomplete="email" placeholder={$_('onboarding.emailPlaceholder')} bind:value={card.email} />
        <div class="names">
            <div>
                <label class="bx--label" for="onboarding-first">{$_('onboarding.firstName')}</label>
                <input id="onboarding-first" class="bx--text-input" autocomplete="given-name" placeholder={$_('onboarding.firstNamePlaceholder')} bind:value={card.firstName} />
            </div>
            <div>
                <label class="bx--label" for="onboarding-last">{$_('onboarding.lastName')}</label>
                <input id="onboarding-last" class="bx--text-input" autocomplete="family-name" placeholder={$_('onboarding.lastNamePlaceholder')} bind:value={card.lastName} />
            </div>
        </div>

        {#if showAddress}
            <div class="names">
                <div>
                    <label class="bx--label" for="onboarding-street">{$_('onboarding.street')}</label>
                    <input id="onboarding-street" class="bx--text-input" autocomplete="street-address" placeholder={$_('onboarding.streetPlaceholder')} bind:value={card.street} />
                </div>
                <div>
                    <label class="bx--label" for="onboarding-zip">{$_('onboarding.zipCode')}</label>
                    <input id="onboarding-zip" class="bx--text-input" autocomplete="postal-code" placeholder={$_('onboarding.zipCodePlaceholder')} bind:value={card.postalCode} />
                </div>
            </div>
            <div class="names">
                <div>
                    <label class="bx--label" for="onboarding-city">{$_('onboarding.city')}</label>
                    <input id="onboarding-city" class="bx--text-input" autocomplete="address-level2" placeholder={$_('onboarding.cityPlaceholder')} bind:value={card.city} />
                </div>
                <div>
                    <label class="bx--label" for="onboarding-country">{$_('onboarding.country')}</label>
                    <input id="onboarding-country" class="bx--text-input" autocomplete="country-name" placeholder={$_('onboarding.countryPlaceholder')} bind:value={card.countryRegion} />
                </div>
            </div>
        {:else}
            <button type="button" class="bx--btn bx--btn--ghost bx--btn--sm add-address" onclick={() => (showAddress = true)}>{$_('onboarding.addAddress')}</button>
        {/if}

        {#if linkChecked}
            <div class="buttons">
                {#if twoWay}
                    <button type="button" class="bx--btn bx--btn--primary" disabled={!canSave} onclick={() => save('share')}>
                        {inviterName ? $_('onboarding.saveAndShare', { name: inviterName }) : $_('onboarding.saveAndShareNameless')}
                    </button>
                    <button type="button" class="bx--btn bx--btn--secondary" disabled={!canSave} onclick={() => save('only')}>{$_('onboarding.saveOnly')}</button>
                {:else}
                    <button type="button" class="bx--btn bx--btn--primary" disabled={!canSave} onclick={() => save('save')}>{$_('onboarding.save')}</button>
                {/if}
            </div>
        {/if}
        {#if savingAs}
            <div class="saving" role="status" data-testid="onboarding-saving">
                <InlineLoading description={$_(savingAs === 'share' ? 'onboarding.savingAndSharing' : 'onboarding.saving')} />
            </div>
        {/if}
        {#if problem}<p class="problem" role="alert">{problem()}</p>{/if}
    </form>

    {#if temporary}
        <button type="button" class="bx--btn bx--btn--ghost bx--btn--sm sign-in" data-testid="sign-in-instead" onclick={signIn}>{$_('secure.signIn')}</button>
    {/if}
    <!-- the first screen of an invitation link (#89, #97): Settings is out of reach until the card is saved -->
    <LanguageSwitch testid="onboarding-language" />
</div>

<style>
    .onboarding {
        max-width: 40rem;
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    /* a phone: the page has no side margin there (+page.svelte), the form keeps 16 px */
    @media (max-width: 41.98rem) {
        .onboarding {
            padding-inline: 1rem;
        }
    }
    .arriving {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    .arriving :global(.bx--inline-loading) {
        width: auto;
        flex: none;
    }
    /* a status line, not a title: it gives way to the inviter's card */
    .arriving h3 {
        font-size: 1.25rem;
        line-height: 1.4;
    }
    .inviter {
        display: flex;
        align-items: center;
        gap: 1rem;
    }
    .card {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .names {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
        gap: 0.5rem 1rem;
    }
    .add-address,
    .sign-in {
        align-self: flex-start;
    }
    .buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-top: 1rem;
    }
    .problem {
        color: #fa4d56;
    }
</style>
