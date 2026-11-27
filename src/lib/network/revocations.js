/**
 * Revoking the invitation of a contact we removed (#82).
 *
 * An invitation (@le-space/orbitdb-access-controller-decontact `createInvitation`) lets a
 * contact write their own card, `contact:<their DID>`, into our address book, and it never
 * expires: the access controller only checks that we signed it. So removing a contact
 * leaves them able to write their card back. Instead of changing the controller (and every
 * relay that bundles it), the owner's app writes a revocation into its own book and stops
 * counting their card:
 *
 * - `revoked:<their DID>`: `_id`, our DID as `owner`, the time. Only the owner may write a
 *   key other than `contact:<own DID>`, so nobody else can write or delete it. It goes
 *   through the sealed book like every document (cards.js): `_id` stays in the clear, so
 *   the contact's app sees it in its copy of our book; the rest is sealed to us.
 * - While it exists, our app ignores `contact:<their DID>`, whenever and however often
 *   they write it. That is sound because only they, or we, may write under that key.
 * - Inviting them again (any request that carries an invitation for them) deletes it first.
 * - The contact's app stops writing its card into a book that revoked it.
 *
 * Pure functions on records and a book's `get`/`put`/`del`, without app state
 * (revocations.spec.js); p2p-operations.js calls them.
 */
import { contactKey } from '@le-space/orbitdb-access-controller-decontact'

const PREFIX = 'revoked:'

/** the key of the revocation of `did`'s invitation in an address book */
export const revocationKey = (did) => `${PREFIX}${did}`

/** whether a document of an address book (`{ key, value }`) is a revocation */
export const isRevocation = (record) => typeof record?.key === 'string' && record.key.startsWith(PREFIX)

/** the revocation document: as small as it gets */
export const revocationOf = (did, { owner, now = Date.now() }) => ({ _id: revocationKey(did), owner, revokedAt: now })

/** the DIDs whose invitation these records of an address book revoke */
export function revokedDids(records) {
    return new Set(records.filter(isRevocation).map((record) => record.key.slice(PREFIX.length)))
}

/**
 * The records of our address book that count: no revocation, and no card of a contact
 * whose invitation is revoked.
 *
 * @param {{ key: string, value: any }[]} records as the documents database lists them
 * @returns {{ visible: { key: string, value: any }[], ignored: string[] }}
 *   ignored: the DIDs whose card is there and does not count
 */
export function withoutRevoked(records) {
    const revoked = revokedDids(records)
    const ignored = []
    const visible = records.filter((record) => {
        if (isRevocation(record)) return false
        for (const did of revoked) {
            if (record.key === contactKey(did)) {
                ignored.push(did)
                return false
            }
        }
        return true
    })
    return { visible, ignored }
}

/**
 * We removed `did`: their invitation into `book`, our own, counts no more.
 *
 * @param {{ put: (doc: object) => Promise<string> }} book our address book
 * @param {string} did the contact
 * @param {{ owner: string, now?: number }} options owner: our DID
 */
export function revoke(book, did, { owner, now }) {
    return book.put(revocationOf(did, { owner, now }))
}

/**
 * We invite `did` again: their card counts again.
 *
 * @param {{ get: (key: string) => Promise<any>, del: (key: string) => Promise<string> }} book our address book
 * @returns {Promise<boolean>} whether there was a revocation
 */
export async function liftRevocation(book, did) {
    const key = revocationKey(did)
    if (!(await book.get(key))) return false
    await book.del(key)
    return true
}

/**
 * Whether the owner of `book`, somebody else's address book we write our card into, has
 * removed us. Its `_id` is in the clear, so our copy of their book shows it.
 *
 * @param {{ get: (key: string) => Promise<any> }} book
 * @param {string} me our DID
 */
export async function removedUs(book, me) {
    return Boolean(await book.get(revocationKey(me)))
}
