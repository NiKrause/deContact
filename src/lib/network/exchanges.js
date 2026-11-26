/**
 * The invitation links we opened, as the invitee (#86). Pure functions and a small store
 * without app state (exchanges.spec.js); p2p-operations.js sends and answers.
 *
 * Bob opens Alice's link. His app asks Alice's device for her card with the link's token,
 * and, when the token allows a two-way exchange, for an invitation into her book as well
 * (contact-messages.js). Then Bob saves his card and chooses:
 * - 'share' ("Save and share with Alice"): his card goes into her book with her invitation,
 *   now or when the invitation arrives;
 * - 'only' ("Save only"): nothing of his goes into her book; a request of hers is declined,
 *   as Cancel does in the request dialog;
 * - 'save' (the token allows no two-way exchange, or could not be checked): no choice was
 *   offered; a request of hers is asked for in the dialog, as anybody else's.
 *
 * Until Bob chooses, a request of Alice's waits (no dialog during onboarding). His app
 * resends with the same token until it has what it needs (exchangeNeeds), every
 * EXCHANGE_RETRY_MS until the token expires. The choice outlives a reload: an invitation
 * that arrives later is used, or declined, without asking him again.
 */

/** how often the invitee resends while the inviter's phone does not answer */
export const EXCHANGE_RETRY_MS = 15_000

export const CHOICES = ['share', 'only', 'save']

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

/**
 * What the invitee still needs from the inviter, and whether to tell the person.
 *
 * Before the choice, an invitation is asked for together with the card, in case the
 * person shares: the inviter's phone answers once, while it is in their hand. After
 * "Save and share", it is asked for until it arrives.
 *
 * @param {{ twoWay: boolean, choice?: string, shared?: boolean }} exchange
 * @param {{ cardArrived: boolean, invitationHeld?: boolean, declinedByInviter?: boolean }} state
 *   cardArrived: the inviter's card is in our book; invitationHeld: an invitation of theirs
 *   waits for our choice; declinedByInviter: they canceled our request instead
 * @returns {{ send: boolean, twoWay: boolean, waiting: boolean }}
 *   send: resend the request; twoWay: ask for an invitation in it;
 *   waiting: show "Waiting for <name>'s phone…"
 */
export function exchangeNeeds(exchange, { cardArrived, invitationHeld = false, declinedByInviter = false }) {
    if (declinedByInviter) return { send: false, twoWay: false, waiting: false }
    const sharing = exchange.choice === 'share'
    const undecided = exchange.choice === undefined
    const wantsInvitation =
        exchange.twoWay && !exchange.shared && !invitationHeld && (sharing || (undecided && !cardArrived))
    return {
        send: !cardArrived || wantsInvitation,
        twoWay: wantsInvitation,
        // he waits for what he asked for himself, not for an invitation he may not use
        waiting: !cardArrived || (sharing && wantsInvitation)
    }
}

/**
 * The exchanges of this device, by inviter DID, until their tokens expire.
 *
 * @param {{ getItem: (key: string) => string | null, setItem: (key: string, value: string) => void }} storage e.g. localStorage
 */
export function createExchangeStore(storage, key = 'decontact.exchanges.v1') {
    const load = () => {
        try {
            const exchanges = JSON.parse(storage.getItem(key) ?? '{}')
            return isObject(exchanges) ? exchanges : {}
        } catch {
            return {}
        }
    }
    const save = (exchanges, now) => {
        for (const inviter of Object.keys(exchanges)) {
            if (!(exchanges[inviter]?.expiresAt > now)) delete exchanges[inviter]
        }
        storage.setItem(key, JSON.stringify(exchanges))
    }
    const current = (exchanges, inviter, now) => {
        const exchange = Object.hasOwn(exchanges, inviter) ? exchanges[inviter] : undefined
        return isObject(exchange) && exchange.expiresAt > now ? exchange : undefined
    }
    return {
        /**
         * We opened a verified link of `inviter`. Opening it again (a reload) keeps the
         * choice; another link of theirs starts over.
         *
         * @param {{ inviter: string, token: string, expiresAt: number, twoWay: boolean }} link
         */
        opened({ inviter, token, expiresAt, twoWay }, now = Date.now()) {
            const exchanges = load()
            const known = current(exchanges, inviter, now)
            exchanges[inviter] = known?.token === token ? known : { inviter, token, expiresAt, twoWay: Boolean(twoWay) }
            save(exchanges, now)
            return { ...exchanges[inviter] }
        },
        /** the exchange with `inviter`, while its token is valid */
        get(inviter, now = Date.now()) {
            const exchange = current(load(), inviter, now)
            return exchange ? { ...exchange } : undefined
        },
        /** every exchange whose token is valid */
        all(now = Date.now()) {
            const exchanges = load()
            return Object.keys(exchanges).map((inviter) => current(exchanges, inviter, now)).filter(Boolean).map((it) => ({ ...it }))
        },
        /** the person chose (CHOICES); opening the link again lets them choose again */
        chose(inviter, choice, now = Date.now()) {
            if (!CHOICES.includes(choice)) throw new Error(`no such choice: ${choice}`)
            const exchanges = load()
            const exchange = current(exchanges, inviter, now)
            if (!exchange) return undefined
            exchange.choice = choice
            save(exchanges, now)
            return { ...exchange }
        },
        /** our card went into the inviter's book */
        shared(inviter, now = Date.now()) {
            const exchanges = load()
            const exchange = current(exchanges, inviter, now)
            if (!exchange) return
            exchange.shared = true
            save(exchanges, now)
        }
    }
}
