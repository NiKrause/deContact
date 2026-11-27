import { describe, expect, it } from 'vitest'
import { rootPayload } from '@le-space/orbitdb-identity-provider-webauthn-did/vault'
import AddressBookAccessController, { contactKey, createInvitation, mayWrite } from '@le-space/orbitdb-access-controller-decontact'
import { encryptionKeysOf, signerOf } from '../identity/vault.js'
import { sealedBook } from '../encryption/sealed-book.js'
import { isRevocation, liftRevocation, removedUs, revocationKey, revocationOf, revoke, revokedDids, withoutRevoked } from './revocations.js'

async function person(fill) {
    const opened = { payload: rootPayload(new Uint8Array(32).fill(fill)) }
    const signer = await signerOf(opened)
    return { did: signer.did, signer, keys: await encryptionKeysOf(opened, signer.did) }
}

const alice = await person(21)
const bob = await person(22)
const carol = await person(23)

/**
 * Alice's book as OrbitDB's documents database keeps it: one store, written through the
 * real rule of the access controller (`mayWrite`). `as(person)` is that person's copy,
 * wrapped as the app wraps it: Alice opens everything, the others only the clear fields.
 */
function alicesBook() {
    const docs = new Map()
    let entries = 0
    const copyOf = (writer) => ({
        address: '/orbitdb/zdpuAlicesBook',
        access: { type: AddressBookAccessController.type, owner: alice.did },
        async put(doc) {
            if (!(await mayWrite({ owner: alice.did, writer, payload: { op: 'PUT', key: doc._id, value: doc } }))) {
                throw new Error(`${writer} is not allowed to write ${doc._id}`)
            }
            const hash = `entry${++entries}`
            docs.set(doc._id, { key: doc._id, value: doc, hash })
            return hash
        },
        async del(key) {
            if (!(await mayWrite({ owner: alice.did, writer, payload: { op: 'DEL', key, value: null } }))) {
                throw new Error(`${writer} is not allowed to delete ${key}`)
            }
            docs.delete(key)
            return `entry${++entries}`
        },
        get: async (key) => docs.get(key),
        all: async () => [...docs.values()]
    })
    return {
        docs,
        as: (who) => sealedBook(copyOf(who.did), { me: who.did, keys: who === alice ? who.keys : undefined })
    }
}

const cardOf = async (who, extra = {}) => ({
    _id: contactKey(who.did),
    owner: who.did,
    firstName: who === bob ? 'Bob' : 'Carol',
    lastName: who === bob ? 'Stromwerk' : 'Beispiel',
    sharedAddress: `/orbitdb/zdpu${who === bob ? 'Bobs' : 'Carols'}Book`,
    invitation: await createInvitation(alice.signer, alice.did, who.did),
    ...extra
})

describe('the revocation document (#82)', () => {
    it('holds our DID and the time, and only its key stays in the clear', async () => {
        const book = alicesBook()
        await revoke(book.as(alice), bob.did, { owner: alice.did, now: 1_800_000_000_000 })

        const stored = book.docs.get(revocationKey(bob.did)).value
        expect(Object.keys(stored).sort()).toEqual(['_id', 'sealed'])
        expect(stored._id).toBe(`revoked:${bob.did}`)
        expect(JSON.stringify(stored)).not.toContain(alice.did)

        expect((await book.as(alice).get(revocationKey(bob.did))).value)
            .toEqual(revocationOf(bob.did, { owner: alice.did, now: 1_800_000_000_000 }))
        // Bob's copy of the book shows the key, and nothing of what is sealed to Alice
        expect((await book.as(bob).get(revocationKey(bob.did))).value).toEqual({ _id: revocationKey(bob.did), sealed: true })
    })

    it('tells the contact that the owner removed them, and nobody else', async () => {
        const book = alicesBook()
        await revoke(book.as(alice), bob.did, { owner: alice.did })
        expect(await removedUs(book.as(bob), bob.did)).toBe(true)
        expect(await removedUs(book.as(carol), carol.did)).toBe(false)
    })

    it('can be written and deleted by the owner only', async () => {
        const book = alicesBook()
        await expect(book.as(bob).put(revocationOf(carol.did, { owner: bob.did }))).rejects.toThrow(/not allowed/)
        await revoke(book.as(alice), bob.did, { owner: alice.did })
        await expect(book.as(bob).del(revocationKey(bob.did))).rejects.toThrow(/not allowed/)
        await expect(book.as(carol).del(revocationKey(bob.did))).rejects.toThrow(/not allowed/)
        expect(await removedUs(book.as(bob), bob.did)).toBe(true)
    })
})

describe('what our address book shows of a removed contact (#82)', () => {
    it('ignores their card, however often they write it with their old invitation', async () => {
        const book = alicesBook()
        await book.as(bob).put(await cardOf(bob))
        await book.as(carol).put(await cardOf(carol))
        await revoke(book.as(alice), bob.did, { owner: alice.did })

        // the access controller still takes Bob's card: his invitation is signed by Alice
        for (const city of ['Beispielort', 'Musterstadt']) await book.as(bob).put(await cardOf(bob, { city }))
        expect(book.docs.has(contactKey(bob.did))).toBe(true)

        const { visible, ignored } = withoutRevoked(await book.as(alice).all())
        expect(visible.map((record) => record.key)).toEqual([contactKey(carol.did)])
        expect(ignored).toEqual([bob.did])
    })

    it('shows no revocation and keeps everything else', () => {
        const records = [
            { key: revocationKey(bob.did), value: { _id: revocationKey(bob.did), owner: alice.did, revokedAt: 1 } },
            { key: 'a1b2c3', value: { _id: 'a1b2c3', owner: alice.did, own: true, firstName: 'Alice' } },
            // Alice's own record of Bob's book: only a card under Bob's key counts as his
            { key: 'd4e5f6', value: { _id: 'd4e5f6', owner: bob.did, sharedAddress: '/orbitdb/zdpuBobsBook', subscriber: true } },
            { key: contactKey(carol.did), value: { _id: contactKey(carol.did), owner: carol.did } }
        ]
        expect(revokedDids(records)).toEqual(new Set([bob.did]))
        expect(records.filter(isRevocation)).toHaveLength(1)
        expect(withoutRevoked(records)).toEqual({ visible: records.slice(1), ignored: [] })
    })

    it('shows their card again once we invite them again', async () => {
        const book = alicesBook()
        await revoke(book.as(alice), bob.did, { owner: alice.did })
        await book.as(bob).put(await cardOf(bob))
        expect(withoutRevoked(await book.as(alice).all()).visible).toEqual([])

        expect(await liftRevocation(book.as(alice), bob.did)).toBe(true)
        expect(await removedUs(book.as(bob), bob.did)).toBe(false)
        const { visible, ignored } = withoutRevoked(await book.as(alice).all())
        expect(visible.map((record) => record.value.lastName)).toEqual(['Stromwerk'])
        expect(ignored).toEqual([])
        // nothing to lift for somebody we never removed
        expect(await liftRevocation(book.as(alice), carol.did)).toBe(false)
    })
})
