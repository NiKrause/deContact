/**
 * Documents in an address book, sealed to the book's owner (#59).
 *
 * Only the owner of a book reads it: Bob writes his card into Alice's book, but he reads
 * Alice's card in his own book, where she wrote it. So every document is sealed to the
 * owner's key (sealing.js), whoever writes it, and nobody else - not the contacts who
 * write into the book, not the relay, not the followers who keep a backup - can read it.
 *
 * What stays in the clear is what the access controller checks
 * (@le-space/orbitdb-access-controller-decontact `mayWrite`), so the relays keep checking
 * every entry without a key and the controller does not change:
 * - always `_id`;
 * - on a contact's card - written by a contact into somebody else's book, or carrying an
 *   invitation (the owner sealing a card again that was in the clear) - also `owner`
 *   (their DID) and `invitation` (the owner's signature for them). The contact's app
 *   reads its invitation there to update its card.
 * The owner's own documents (own card, placeholders, the books they were invited into)
 * keep only `_id` in the clear.
 * Everything else goes into `sealed`. Not OrbitDB's `encryption.data`: it seals the whole
 * payload, and a relay would see no key, owner or invitation and refuse every card.
 *
 * The seal's context names the book's owner and the document's `_id`, so a sealed card
 * copied under another key or into another book does not open there.
 */
import { encryptionKeyOfDid, isSeal, openJson, sealJson } from './sealing.js'

const CARD_CONTEXT = 'decontact/card/v1'
/** what the access controller reads of a contact's card */
const CHECKED = ['_id', 'owner', 'invitation']

const cardContext = (bookOwner, id) => `${CARD_CONTEXT}\n${bookOwner}\n${id}`

/**
 * A document as it is written into `bookOwner`'s book.
 *
 * @param {object} doc with `_id`
 * @param {{ bookOwner: string, writer: string }} options writer: our DID
 */
export async function sealCard(doc, { bookOwner, writer }) {
    const recipient = encryptionKeyOfDid(bookOwner)
    if (!recipient) throw new Error(`${bookOwner} has no key to seal to`)
    if (typeof doc?._id !== 'string') throw new TypeError('A document needs an _id')
    const clear = { _id: doc._id }
    if (writer !== bookOwner || doc.invitation !== undefined) {
        if (doc.owner !== undefined) clear.owner = doc.owner
        if (doc.invitation !== undefined) clear.invitation = doc.invitation
    }
    // eslint-disable-next-line no-unused-vars
    const { _id, ...rest } = doc
    for (const field of Object.keys(clear)) delete rest[field]
    return { ...clear, sealed: await sealJson(recipient, rest, { context: cardContext(bookOwner, doc._id) }) }
}

/** whether a stored document is sealed */
export const isSealedCard = (value) => isSeal(value?.sealed)

/**
 * A stored document as the app reads it. Never throws.
 *
 * - Sealed and ours to open: the clear fields and the opened ones together; the clear
 *   ones are what the access controller checked, so they win.
 * - Sealed and not ours (somebody else's book), or not opening: the clear fields, with
 *   `sealed: true`, and `unreadable: true` where we should have been able to read it.
 * - Written before #59, in the clear: as it is.
 * - `own` counts only on a card whose owner is the book's owner: a contact's card cannot
 *   pass for ours.
 *
 * @param {object} value as stored
 * @param {{ bookOwner: string, keys?: { publicKey: Uint8Array, privateKey: CryptoKey } }} options
 *   keys: our pair, when the book is ours
 */
export async function openCard(value, { bookOwner, keys }) {
    if (value === null || typeof value !== 'object') return value
    let card
    if (!isSealedCard(value)) {
        card = { ...value }
    } else {
        const clear = {}
        for (const field of CHECKED) if (value[field] !== undefined) clear[field] = value[field]
        if (!keys) return { ...clear, sealed: true }
        try {
            const opened = await openJson(keys, value.sealed, { context: cardContext(bookOwner, value._id) })
            if (opened === null || typeof opened !== 'object' || Array.isArray(opened)) throw new Error('not a document')
            card = { ...opened, ...clear }
        } catch {
            return { ...clear, sealed: true, unreadable: true }
        }
    }
    if (card.owner !== bookOwner) delete card.own
    return card
}
