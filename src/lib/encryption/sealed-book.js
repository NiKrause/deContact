/**
 * An OrbitDB documents database of an address book that seals what is put into it and
 * opens what is read from it (cards.js). Everything else - address, events, access,
 * del, drop, close - is the database's own.
 *
 * - Our own book: `get` and `all` open every document with our keys.
 * - Somebody else's book (we write our card into it, or keep it as a backup): we can
 *   read only the clear fields; the rest is sealed to its owner.
 *
 * The book's owner is the DID in its access controller's manifest, so a document is
 * never sealed to somebody a writer merely claims.
 */
import AddressBookAccessController from '@le-space/orbitdb-access-controller-decontact'
import { isSealedCard, openCard, sealCard } from './cards.js'

const wrapped = new WeakMap()

/**
 * @param {any} db an open documents database
 * @param {{ me: string, keys?: { publicKey: Uint8Array, privateKey: CryptoKey } }} options
 *   me: our DID; keys: our pair (used only when the book is ours)
 */
export function sealedBook(db, { me, keys }) {
    if (wrapped.has(db)) return wrapped.get(db)
    if (db?.access?.type !== AddressBookAccessController.type || typeof db.access.owner !== 'string') {
        throw new Error(`${db?.address} is not a deContact address book`)
    }
    const bookOwner = db.access.owner
    const ours = bookOwner === me
    const open = (value) => openCard(value, { bookOwner, keys: ours ? keys : undefined })
    const openRecord = async (record) => (record ? { ...record, value: await open(record.value) } : record)

    const overrides = {
        bookOwner,
        sealed: true,
        put: async (doc) => db.put(await sealCard(doc, { bookOwner, writer: me })),
        get: async (key) => openRecord(await db.get(key)),
        all: async () => Promise.all((await db.all()).map(openRecord)),
        /** the documents still stored in the clear (written before #59) */
        unsealed: async () => (await db.all()).filter((record) => !isSealedCard(record.value)),
        /** the database itself, as relays and backups see it */
        raw: db
    }
    const book = new Proxy(db, {
        get(target, property) {
            if (Object.hasOwn(overrides, property)) return overrides[property]
            const value = Reflect.get(target, property, target)
            return typeof value === 'function' ? value.bind(target) : value
        }
    })
    wrapped.set(db, book)
    return book
}
