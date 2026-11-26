<script>
    /**
     * @component Somebody opened an invitation link (#86). The inviter's card arrives by
     * itself (the view then shows their name and photo, #87), while the person types their own: email, first and last name, the address
     * behind "Add address". Then they choose whether the inviter gets it: "Save and share
     * with Alice" or "Save only"; a link without a two-way exchange offers only "Save". A
     * request of the inviter waits for that choice, and no request dialog appears here
     * (p2p-operations.js openInvitationLink, exchanges.js).
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
    import ContactPhoto from './ContactPhoto.svelte'

    // #/onboarding/<the inviter's DID>?onBoardingToken=<their one-time token>
    const inviter = ($did ?? '').trim()
    const onBoardingToken = new URLSearchParams($query ?? '').get('onBoardingToken') ?? undefined

    const NAME_FIELDS = ['email', 'firstName', 'lastName']
    const ADDRESS_FIELDS = ['street', 'postalCode', 'city', 'countryRegion']

    let card = $state(Object.fromEntries([...NAME_FIELDS, ...ADDRESS_FIELDS].map((field) => [field, ''])))
    let showAddress = $state(false)
    /** whether the link lets us share back, once it is checked (locally, against the DID) */
    let twoWay = $state(false)
    let linkChecked = $state(false)
    let saving = $state(false)
    let problem = $state('')
    let requested = false
    let prefilled = false

    const opening = openInvitationLink(inviter, onBoardingToken).then((link) => {
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

    const me = $derived($orbitdb?.identity?.id)
    /** the inviter's card, once it arrived (our placeholder sits under its key until then) */
    const inviterCard = $derived(
        $myAddressBook?.find((it) => it.owner === inviter && !(it.firstName === 'invited' && it.lastName === inviter))
    )
    /** an address book that already has a card of ours: it is shown to be checked */
    const ownCard = $derived(me ? $myAddressBook?.find((it) => it.owner === me && it.own) : undefined)
    const shortDid = (value) => (value.length > 24 ? `${value.slice(0, 16)}…${value.slice(-6)}` : value)
    const inviterName = $derived(inviterCard?.firstName || inviterCard?.lastName || inviterCard?.email || shortDid(inviter))
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
        problem = ''
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
            problem = 'Your card could not be saved. Please try again.'
        } finally {
            saving = false
        }
    }
</script>

<div class="content onboarding" data-testid="onboarding">
    {#if inviterCard}
        <div class="inviter">
            <ContactPhoto photo={inviterCard.photo} size={96} testid="inviter-photo" />
            <h3 data-testid="inviter-card">
                {[inviterCard.firstName, inviterCard.lastName].filter(Boolean).join(' ') || inviterCard.email || inviter} was added to your address book
            </h3>
        </div>
    {:else}
        <h3>Contact data have been shared with you</h3>
        <p class="waiting" role="status" data-testid="waiting-for-phone">Waiting for {inviter}'s phone…</p>
    {/if}

    <form class="card" onsubmit={(event) => event.preventDefault()}>
        <h4>Your contact details</h4>
        <label class="bx--label" for="onboarding-email">Email</label>
        <input id="onboarding-email" class="bx--text-input" type="email" autocomplete="email" placeholder="Enter email..." bind:value={card.email} />
        <div class="names">
            <div>
                <label class="bx--label" for="onboarding-first">First name</label>
                <input id="onboarding-first" class="bx--text-input" autocomplete="given-name" placeholder="Enter firstname..." bind:value={card.firstName} />
            </div>
            <div>
                <label class="bx--label" for="onboarding-last">Last name</label>
                <input id="onboarding-last" class="bx--text-input" autocomplete="family-name" placeholder="Enter lastname..." bind:value={card.lastName} />
            </div>
        </div>

        {#if showAddress}
            <div class="names">
                <div>
                    <label class="bx--label" for="onboarding-street">Street</label>
                    <input id="onboarding-street" class="bx--text-input" autocomplete="street-address" placeholder="Enter street..." bind:value={card.street} />
                </div>
                <div>
                    <label class="bx--label" for="onboarding-zip">Zip code</label>
                    <input id="onboarding-zip" class="bx--text-input" autocomplete="postal-code" placeholder="Enter zipcode..." bind:value={card.postalCode} />
                </div>
            </div>
            <div class="names">
                <div>
                    <label class="bx--label" for="onboarding-city">City</label>
                    <input id="onboarding-city" class="bx--text-input" autocomplete="address-level2" placeholder="Enter city..." bind:value={card.city} />
                </div>
                <div>
                    <label class="bx--label" for="onboarding-country">Country</label>
                    <input id="onboarding-country" class="bx--text-input" autocomplete="country-name" placeholder="Enter country..." bind:value={card.countryRegion} />
                </div>
            </div>
        {:else}
            <button type="button" class="bx--btn bx--btn--ghost bx--btn--sm add-address" onclick={() => (showAddress = true)}>Add address</button>
        {/if}

        {#if linkChecked}
            <div class="buttons">
                {#if twoWay}
                    <button type="button" class="bx--btn bx--btn--primary" disabled={!canSave} onclick={() => save('share')}>
                        Save and share with {inviterName}
                    </button>
                    <button type="button" class="bx--btn bx--btn--secondary" disabled={!canSave} onclick={() => save('only')}>Save only</button>
                {:else}
                    <button type="button" class="bx--btn bx--btn--primary" disabled={!canSave} onclick={() => save('save')}>Save</button>
                {/if}
            </div>
        {/if}
        {#if problem}<p class="problem" role="alert">{problem}</p>{/if}
    </form>
</div>

<style>
    .onboarding {
        max-width: 40rem;
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    .waiting {
        overflow-wrap: anywhere;
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
    .add-address {
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
