import { describe, expect, it } from 'vitest'
import { rootPayload } from '@le-space/orbitdb-identity-provider-webauthn-did/vault'
import { contactKey, createInvitation, mayWrite } from '@le-space/orbitdb-access-controller-decontact'
import { encryptionKeysOf, signerOf } from '../identity/vault.js'
import { isSealedCard, openCard, sealCard } from './cards.js'

async function person(fill) {
    const opened = { payload: rootPayload(new Uint8Array(32).fill(fill)) }
    const signer = await signerOf(opened)
    return { did: signer.did, signer, keys: await encryptionKeysOf(opened, signer.did) }
}

const alice = await person(11)
const bob = await person(12)
const carol = await person(13)

const bobsCard = async () => ({
    _id: contactKey(bob.did),
    owner: bob.did,
    firstName: 'Bob',
    lastName: 'Stromwerk',
    city: 'Example City',
    sharedAddress: '/orbitdb/zdpuBobsBook',
    invitation: await createInvitation(alice.signer, alice.did, bob.did)
})

/** the operation OrbitDB's documents database appends for `put(doc)` */
const putOf = (doc) => ({ op: 'PUT', key: doc._id, value: doc })

describe('a card Bob writes into Alice\'s book', () => {
    it('keeps in the clear only what the access controller checks', async () => {
        const stored = await sealCard(await bobsCard(), { bookOwner: alice.did, writer: bob.did })
        expect(Object.keys(stored).sort()).toEqual(['_id', 'invitation', 'owner', 'sealed'])
        expect(isSealedCard(stored)).toBe(true)
        const text = JSON.stringify(stored)
        for (const plain of ['Stromwerk', 'Example City', 'zdpuBobsBook']) expect(text).not.toContain(plain)
    })

    it('is still accepted by the access controller, and a forged one still refused', async () => {
        const stored = await sealCard(await bobsCard(), { bookOwner: alice.did, writer: bob.did })
        expect(await mayWrite({ owner: alice.did, writer: bob.did, payload: putOf(stored) })).toBe(true)
        // Carol cannot use Bob's invitation, nor write under Bob's key
        const forged = await sealCard({ ...(await bobsCard()), _id: contactKey(carol.did), owner: carol.did }, { bookOwner: alice.did, writer: carol.did })
        expect(await mayWrite({ owner: alice.did, writer: carol.did, payload: putOf(forged) })).toBe(false)
        expect(await mayWrite({ owner: alice.did, writer: carol.did, payload: putOf(stored) })).toBe(false)
    })

    it('opens for Alice only', async () => {
        const stored = await sealCard(await bobsCard(), { bookOwner: alice.did, writer: bob.did })
        const opened = await openCard(stored, { bookOwner: alice.did, keys: alice.keys })
        expect(opened).toMatchObject({ firstName: 'Bob', lastName: 'Stromwerk', sharedAddress: '/orbitdb/zdpuBobsBook', owner: bob.did })
        expect(opened.sealed).toBeUndefined()
        // Bob, or a relay, sees the clear fields only
        expect(await openCard(stored, { bookOwner: alice.did })).toEqual({
            _id: stored._id,
            owner: bob.did,
            invitation: stored.invitation,
            sealed: true
        })
        expect(await openCard(stored, { bookOwner: alice.did, keys: bob.keys })).toMatchObject({ sealed: true, unreadable: true })
    })

    it('does not open when copied under another key or into another book', async () => {
        const stored = await sealCard(await bobsCard(), { bookOwner: alice.did, writer: bob.did })
        const copied = { ...stored, _id: contactKey(carol.did), owner: carol.did }
        expect(await openCard(copied, { bookOwner: alice.did, keys: alice.keys })).toMatchObject({ unreadable: true })
        // sealed to Alice: Carol's book cannot read it, even under the same key
        expect(await openCard(stored, { bookOwner: carol.did, keys: carol.keys })).toMatchObject({ unreadable: true })
    })

    it('cannot pass for Alice\'s own card', async () => {
        const stored = await sealCard({ ...(await bobsCard()), own: true }, { bookOwner: alice.did, writer: bob.did })
        expect((await openCard(stored, { bookOwner: alice.did, keys: alice.keys })).own).toBeUndefined()
    })

    it('cannot change the checked fields from inside the seal', async () => {
        const card = await bobsCard()
        const stored = await sealCard(card, { bookOwner: alice.did, writer: bob.did })
        // what the controller checked wins over whatever sits in the sealed part
        const opened = await openCard({ ...stored, owner: bob.did }, { bookOwner: alice.did, keys: alice.keys })
        expect(opened.owner).toBe(bob.did)
        expect(opened.invitation).toEqual(card.invitation)
    })
})

describe('what Alice writes into her own book', () => {
    it('keeps only the _id in the clear: her card, placeholders, the books she was invited into', async () => {
        const own = { _id: 'a1b2', owner: alice.did, own: true, firstName: 'Alice', sharedAddress: '/orbitdb/zdpuAlicesBook' }
        const placeholder = { _id: contactKey(bob.did), owner: bob.did, firstName: 'invited', lastName: bob.did }
        for (const doc of [own, placeholder]) {
            const stored = await sealCard(doc, { bookOwner: alice.did, writer: alice.did })
            expect(Object.keys(stored).sort()).toEqual(['_id', 'sealed'])
            // the owner is sealed (a placeholder's _id names the invitee anyway: contact:<DID>)
            expect(stored.owner).toBeUndefined()
            expect(JSON.stringify(stored.sealed)).not.toContain(doc.firstName)
            expect(await openCard(stored, { bookOwner: alice.did, keys: alice.keys })).toEqual(doc)
        }
    })
})

describe('documents from before #59', () => {
    it('keep the invitation of a contact\'s card in the clear when the owner seals them again', async () => {
        const plain = await bobsCard()
        const stored = await sealCard(plain, { bookOwner: alice.did, writer: alice.did })
        // Bob's app finds its invitation here to update his card
        expect(stored).toMatchObject({ _id: plain._id, owner: bob.did, invitation: plain.invitation })
        expect(JSON.stringify(stored)).not.toContain('Stromwerk')
        expect(await openCard(stored, { bookOwner: alice.did, keys: alice.keys })).toMatchObject({ firstName: 'Bob', owner: bob.did })
    })

    it('are read as they are', async () => {
        const plain = { _id: 'old', owner: alice.did, own: true, firstName: 'Alice' }
        expect(await openCard(plain, { bookOwner: alice.did, keys: alice.keys })).toEqual(plain)
        const bobsOld = { _id: contactKey(bob.did), owner: bob.did, own: true, firstName: 'Bob' }
        expect((await openCard(bobsOld, { bookOwner: alice.did, keys: alice.keys })).own).toBeUndefined()
    })

    it('need a DID to seal to', async () => {
        await expect(sealCard({ _id: 'x' }, { bookOwner: 'did:web:example.com', writer: alice.did })).rejects.toThrow()
        await expect(sealCard({}, { bookOwner: alice.did, writer: alice.did })).rejects.toThrow()
    })
})
