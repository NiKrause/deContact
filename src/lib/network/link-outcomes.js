/**
 * What became of the codes we showed: the side of the person who shows "Show my code" (the
 * inviter). Without app state (link-outcomes.spec.js): p2p-operations.js reports, the QR
 * dialog, the notices and Exchange listen (QRCodeModal.svelte, ExchangeNotices.svelte,
 * Exchange.svelte).
 *
 * Alice shows her code, Bob opens the link (contact-messages.js, exchanges.js):
 * - 'given': Bob's app asked with the code's token and Alice's app took it: her card is in
 *   his book now. Once per token: his app resends until her card has arrived, and each
 *   resend is taken again. The dialog that still shows this token closes.
 * - 'complete': the token allowed a two-way exchange, Alice's app sent Bob an invitation,
 *   and his card arrived in her book: one that was not there when the token was taken, or
 *   one that changed since.
 * - 'asked': somebody's request is in the request dialog. With "Let them ask first" the
 *   request dialog takes over from the code.
 *
 * The name comes from Bob's signed request (`from`, contact-messages.js FROM_FIELDS): his
 * app may ask before he typed it, and then it is known only once his card arrives.
 */

/** "Bob Stromwerk": the first and the last name a request or a card carries, or '' */
export function nameOf(card) {
    return [card?.firstName, card?.lastName]
        .map((part) => (typeof part === 'string' ? part.trim() : ''))
        .filter(Boolean)
        .join(' ')
}

/** a card of `did`, not our placeholder for it nor an answer of "request canceled" */
function isCardOf(card, did) {
    if (card?.owner !== did) return false
    if (card.firstName === 'invited' && card.lastName === did) return false
    return card.firstName !== 'request canceled'
}

/** what tells a card that arrived from the one that was there before */
const fingerprint = (card) => (card ? JSON.stringify(card) : undefined)

/**
 * @typedef {{ kind: 'given', token: string, did: string, name?: string, twoWay: boolean }
 *   | { kind: 'complete', token: string, did: string, name?: string, id?: string }
 *   | { kind: 'asked', did: string, token?: string }} LinkEvent
 */

export function createLinkOutcomes() {
    /** token -> { did, twoWay, name, before, expiresAt, given, complete } */
    const links = new Map()
    /** @type {Set<(event: LinkEvent) => void>} */
    const listeners = new Set()

    const emit = (event) => {
        for (const listener of listeners) {
            try {
                listener(event)
            } catch (error) {
                console.log(`a listener of ${event.kind} failed:`, error?.message)
            }
        }
        return event
    }
    const current = (entry, now) => !(entry.expiresAt <= now)

    return {
        /** @param {(event: LinkEvent) => void} listener @returns {() => void} unsubscribes */
        subscribe(listener) {
            listeners.add(listener)
            return () => listeners.delete(listener)
        },
        /**
         * We took the token of `did`'s request, before anything went to them. Again for each
         * resend: a name or a two-way exchange it brings is kept.
         *
         * @param {string} token the token as the link carries it
         * @param {string} did the person who opened the link
         * @param {{ name?: string, twoWay?: boolean, card?: object, expiresAt?: number }} options
         *   name: the one their request carries; twoWay: we sent them an invitation into our
         *   book; card: the card of theirs our book holds now, if any; expiresAt: the token's
         * @returns {boolean} whether it is the first time
         */
        accepted(token, did, { name, twoWay = false, card, expiresAt } = {}) {
            const known = links.get(token)
            if (known) {
                if (name && !known.name) known.name = name
                if (twoWay && !known.twoWay) {
                    known.twoWay = true
                    known.complete = false
                }
                return false
            }
            links.set(token, {
                did,
                twoWay: Boolean(twoWay),
                name: name || undefined,
                before: fingerprint(card),
                expiresAt,
                given: false,
                complete: !twoWay
            })
            return true
        },
        /**
         * Our card went into their book: 'given', once per token.
         *
         * @returns {LinkEvent | undefined}
         */
        given(token) {
            const entry = links.get(token)
            if (!entry || entry.given) return undefined
            entry.given = true
            return emit({ kind: 'given', token, did: entry.did, name: entry.name, twoWay: entry.twoWay })
        },
        /**
         * Our book as it is now (its cards with their `id`): 'complete' for each two-way
         * exchange whose card arrived.
         *
         * @param {Array<any>} cards
         * @returns {LinkEvent[]}
         */
        bookChanged(cards, now = Date.now()) {
            const events = []
            for (const [token, entry] of links) {
                if (!entry.given || entry.complete || !current(entry, now)) continue
                const card = (cards ?? []).find((it) => isCardOf(it, entry.did))
                if (!card || fingerprint(card) === entry.before) continue
                entry.complete = true
                const name = nameOf(card) || entry.name
                if (name) entry.name = name
                events.push({ kind: 'complete', token, did: entry.did, name, id: card.id ?? card._id })
            }
            return events.map(emit)
        },
        /**
         * A request of `did` goes into the request dialog.
         *
         * @param {string} did
         * @param {string} [token] the invitation link token it came with, if any
         */
        asked(did, token) {
            return emit({ kind: 'asked', did, token })
        },
        /**
         * The two-way exchanges given and not complete yet, newest first: Exchange says whose
         * card may still come.
         *
         * @returns {Array<{ token: string, did: string, name?: string }>}
         */
        waiting(now = Date.now()) {
            return [...links]
                .filter(([, entry]) => entry.given && !entry.complete && current(entry, now))
                .map(([token, entry]) => ({ token, did: entry.did, name: entry.name }))
                .reverse()
        }
    }
}
