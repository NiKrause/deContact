/**
 * Our own card: the one card that goes out as ours, into our contacts' books, with our
 * requests, naming this device (devices.js).
 *
 * Only a card of ours marked as our own counts. A contact added by hand has our DID as its
 * owner too, as it is ours to change; it never goes out. Without a card marked as ours there
 * is none until we save one. (The first card with our DID once counted: with our own card
 * deleted, a contact added by hand went out in its place.)
 *
 * Before #123 the form marked every card typed into it as our own unless its box was
 * unticked, so a book from then may hold several. One of them counts, the same on every
 * device and after every save: the one naming our devices (ensureOwnDevice writes them into
 * our card only), else the first by its key. The others are contacts added by hand
 * (`withOneOwnCard`).
 *
 * @param {Array<Record<string, any>> | undefined} cards the cards of our book
 * @param {string | undefined} me our DID
 * @returns {Record<string, any> | undefined}
 */
export function ownCardOf(cards, me) {
    if (!me) return undefined
    const marked = (cards ?? []).filter((card) => card?.owner === me && card.own === true)
    if (marked.length < 2) return marked[0]
    return [...marked].sort(preferred)[0]
}

/** a card naming devices first */
const unnamed = (card) => (Array.isArray(card.devices) && card.devices.length > 0 ? 0 : 1)
const keyOf = (card) => String(card._id ?? '')
const preferred = (a, b) => unnamed(a) - unnamed(b) || (keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0)

/**
 * The cards as the app shows them: marked as our own only on our own card (`ownCardOf`).
 * Another card of ours that is marked (before #123) is a contact added by hand: in the list,
 * kept by us, and saved unmarked once it is changed.
 *
 * @param {Array<Record<string, any>>} cards
 * @param {string | undefined} me our DID
 */
export function withOneOwnCard(cards, me) {
    const own = ownCardOf(cards, me)
    return cards.map((card) => (card?.own === true && card !== own ? { ...card, own: false } : card))
}
