/**
 * The rules of a temporary identity (#97), as pure functions (temporary.spec.js).
 *
 * Bob scans Alice's QR code with a phone that has never run deContact. He exchanges cards
 * first, under an identity whose root is in memory only (session.js `startTemporary`),
 * and is offered a passkey afterwards (`secureWithPasskey`), which seals that root into a
 * vault: the DID stays, and so do his book and his card in Alice's.
 */

/** how long "Not now" puts the offer away, unless another contact arrives first */
export const OFFER_AGAIN_MS = 3 * 60_000

/** the query parameter of an invitation link that asks for today's flow: a passkey first */
export const SIGN_IN_PARAM = 'signIn'

/**
 * Whether a card in our book is somebody else's real card: not ours, not the placeholder
 * we wrote under their key ("invited"), not their "request canceled".
 *
 * @param {Record<string, any>} card as the address book shows it
 * @param {string | undefined} me our DID
 */
export function isContactCard(card, me) {
    if (!card || typeof card.owner !== 'string' || card.owner === me || card.own) return false
    const placeholder = card.lastName === card.owner && (card.firstName === 'invited' || card.firstName === 'request canceled')
    return !placeholder
}

/** how many contacts our book holds */
export function contactCount(cards, me) {
    return (cards ?? []).filter((card) => isContactCard(card, me)).length
}

/**
 * Whether to offer the passkey now: the identity is temporary and a contact's card has
 * arrived. "Not now" puts it away until another contact arrives or OFFER_AGAIN_MS pass.
 *
 * @param {{ temporary?: boolean, contacts: number, dismissed?: { at: number, contacts: number }, now: number }} state
 */
export function offerSecuring({ temporary, contacts, dismissed, now }) {
    if (!temporary || contacts < 1) return false
    if (!dismissed) return true
    return contacts > dismissed.contacts || now - dismissed.at >= OFFER_AGAIN_MS
}

/**
 * Whether closing the tab loses something: the identity is temporary and its book holds a
 * document (a placeholder of a request we sent, our card, a contact's card).
 *
 * @param {{ temporary?: boolean, documents?: unknown[] }} state
 */
export function somethingToLose({ temporary, documents }) {
    return Boolean(temporary) && (documents?.length ?? 0) > 0
}

/** whether the query of an invitation link asks for today's flow */
export function wantsSignIn(query) {
    return new URLSearchParams(query ?? '').get(SIGN_IN_PARAM) === '1'
}

/**
 * The address of this invitation link with the request for today's flow: a reload of it
 * shows the passkey screen instead of the form.
 *
 * @param {string} href location.href, e.g. https://example.com/#/onboarding/did:key:…?onBoardingToken=…
 */
export function withSignIn(href) {
    const url = new URL(href)
    const hash = url.hash.replace(/^#/, '')
    const at = hash.indexOf('?')
    const path = at === -1 ? hash : hash.slice(0, at)
    const params = new URLSearchParams(at === -1 ? '' : hash.slice(at + 1))
    params.set(SIGN_IN_PARAM, '1')
    url.hash = `${path}?${params}`
    return url.toString()
}
