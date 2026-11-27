import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { get } from 'svelte/store'
import { deriveAesKey, deriveSubkey, openVault, rootOf } from '@le-space/orbitdb-identity-provider-webauthn-did/vault'
import { IDENTITY_INFO, LAST_SLOT_KEY, SLOT_INFO, VAULTS_KEY } from './vault.js'
import { createHeldStorage } from './held-storage.js'

// The switch from a temporary identity to a vault (#97), through session.js as the app
// uses it. The passkey prompts and the network are stand-ins: a passkey is a credential id
// and a PRF output, and publishing the record is recorded.

const passkeys = vi.hoisted(() => ({ made: [], cancel: false }))
vi.mock('./passkeys.js', () => ({
    createPasskey: vi.fn(async () => {
        if (passkeys.cancel) throw Object.assign(new Error('The operation either timed out or was not allowed.'), { name: 'NotAllowedError' })
        const credential = { rawCredentialId: crypto.getRandomValues(new Uint8Array(16)), prfOutput: crypto.getRandomValues(new Uint8Array(32)) }
        passkeys.made.push(credential)
        return { rawCredentialId: credential.rawCredentialId }
    }),
    readPasskeyPrf: vi.fn(async ({ rawCredentialId }) => {
        const same = (a, b) => a.length === b.length && a.every((byte, i) => byte === b[i])
        return passkeys.made.find((credential) => same(credential.rawCredentialId, rawCredentialId)).prfOutput
    }),
    discoverPasskeyPrf: vi.fn(async () => passkeys.made[0])
}))
const directory = vi.hoisted(() => ({ published: [] }))
vi.mock('./vault-directory.js', () => ({
    lookUpRecords: vi.fn(async () => []),
    publishRecord: vi.fn(async (orbitdb, lookupIds, record, logs) => {
        directory.published.push({ lookupIds: [...lookupIds], record })
        return logs
    })
}))

function memoryStorage() {
    const items = new Map()
    return {
        getItem: (key) => (items.has(key) ? items.get(key) : null),
        setItem: (key, value) => items.set(key, String(value)),
        removeItem: (key) => items.delete(key),
        keys: () => [...items.keys()],
        text: () => [...items].map(([key, value]) => `${key}\n${value}`).join('\n')
    }
}

const hex = (bytes) => Buffer.from(bytes).toString('hex')

/** session.js as a page loads it: its own module state, the given browser storage */
async function loadPage(storage) {
    vi.resetModules()
    const session = await import('./session.js')
    const held = createHeldStorage(storage)
    session.initVault({ storage, helia: Promise.resolve(undefined), held })
    return { session, held }
}

/** the root the vault in `storage` holds, opened with the PRF output of the passkey made first */
async function rootIn(storage) {
    const [record] = JSON.parse(storage.getItem(VAULTS_KEY))
    const [{ rawCredentialId, prfOutput }] = passkeys.made
    const { payload } = await openVault(record.vault, { slotKey: await deriveAesKey(prfOutput, SLOT_INFO), rawCredentialId })
    return rootOf(payload)
}

beforeEach(() => {
    passkeys.made.length = 0
    passkeys.cancel = false
    directory.published.length = 0
})
afterEach(() => vi.restoreAllMocks())

describe('a temporary identity (#97)', () => {
    it('starts without a prompt and keeps nothing', async () => {
        const storage = memoryStorage()
        const { session, held } = await loadPage(storage)
        session.expectTemporary()
        expect(get(session.temporaryAhead)).toBe(true)
        expect(get(session.session)).toBeUndefined()
        // the app writes its exchanges meanwhile: held in memory
        held.setItem('decontact.exchanges.v1', '{"did:key:z6MkAlice":{}}')

        const signer = await session.startTemporary()
        expect(signer.did).toMatch(/^did:key:z6Mk/)
        expect(await session.ready).toBe(signer)
        expect(get(session.session)).toEqual({ did: signer.did, slots: [], temporary: true })
        expect(get(session.temporaryAhead)).toBe(false)
        expect(session.isTemporary()).toBe(true)
        expect(await session.startTemporary()).toBe(signer) // once
        expect(session.currentSigner()).toBe(signer)
        expect(session.currentEncryptionKeys().publicKey).toHaveLength(32)
        expect(passkeys.made).toEqual([])
        expect(storage.keys()).toEqual([])
    })

    it('a passkey secures it: same DID, same keys, a vault with the temporary root, published', async () => {
        const storage = memoryStorage()
        const { session, held } = await loadPage(storage)
        session.expectTemporary()
        held.setItem('decontact.exchanges.v1', '{"did:key:z6MkAlice":{"choice":"share"}}')
        const signer = await session.startTemporary()
        const keys = session.currentEncryptionKeys()
        await session.attachOrbitDB({ stand: 'in' })
        expect(directory.published).toEqual([]) // nothing to publish while temporary

        expect(await session.secureWithPasskey({ label: 'Bob phone' })).toBe(signer)
        expect(passkeys.made).toHaveLength(1)
        expect(session.isTemporary()).toBe(false)
        const now = get(session.session)
        expect(now).toMatchObject({ did: signer.did })
        expect(now.temporary).toBeUndefined()
        expect(now.slots.map((slot) => [slot.label, slot.current])).toEqual([['Bob phone', true]])
        expect(get(session.securedNow)).toBe(true)
        // the books keep running under the same identity: nothing is opened again
        expect(session.currentSigner()).toBe(signer)
        expect(session.currentEncryptionKeys()).toBe(keys)

        // the vault holds a random root, from which the same DID comes
        const root = await rootIn(storage)
        expect(hex(root)).not.toBe(hex(passkeys.made[0].prfOutput))
        const { createSecretSigner } = await import('@le-space/orbitdb-identity-provider-webauthn-did')
        expect((await createSecretSigner(root, { info: IDENTITY_INFO })).did).toBe(signer.did)
        expect(storage.getItem(LAST_SLOT_KEY)).toBe(now.slots[0].kid)
        // what was held is kept now
        expect(storage.getItem('decontact.exchanges.v1')).toBe('{"did:key:z6MkAlice":{"choice":"share"}}')
        expect(held.holding).toBe(false)
        // published where an empty device with this passkey looks
        expect(directory.published).toHaveLength(1)
        expect(directory.published[0].record.vault).toEqual(JSON.parse(storage.getItem(VAULTS_KEY))[0].vault)
        // and stored in the clear: neither the root nor the identity's key
        const seed = await deriveSubkey(root, IDENTITY_INFO)
        for (const secret of [hex(root), hex(seed)]) expect(storage.text()).not.toContain(secret)
    })

    it('after a reload the passkey unlocks the same DID', async () => {
        const storage = memoryStorage()
        const first = await loadPage(storage)
        first.session.expectTemporary()
        const { did } = await first.session.startTemporary()
        await first.session.secureWithPasskey()

        const reloaded = await loadPage(storage)
        expect(reloaded.session.vaultKeptHere()).toBe(true)
        const signer = await reloaded.session.unlockWithPasskey()
        expect(signer.did).toBe(did)
        expect(get(reloaded.session.session).temporary).toBeUndefined()
    })

    it('a cancelled prompt leaves it temporary and writes nothing', async () => {
        const storage = memoryStorage()
        const { session, held } = await loadPage(storage)
        session.expectTemporary()
        held.setItem('decontact.exchanges.v1', '{}')
        const { did } = await session.startTemporary()
        passkeys.cancel = true
        await expect(session.secureWithPasskey()).rejects.toMatchObject({ name: 'NotAllowedError' })
        expect(session.isTemporary()).toBe(true)
        expect(get(session.session)).toEqual({ did, slots: [], temporary: true })
        expect(storage.keys()).toEqual([])

        // offered again, it works
        passkeys.cancel = false
        expect((await session.secureWithPasskey()).did).toBe(did)
        expect(storage.getItem(VAULTS_KEY)).not.toBeNull()
    })

    it('asked twice at once, it makes one passkey', async () => {
        const storage = memoryStorage()
        const { session } = await loadPage(storage)
        session.expectTemporary()
        await session.startTemporary()
        const [a, b] = await Promise.all([session.secureWithPasskey(), session.secureWithPasskey()])
        expect(a).toBe(b)
        expect(passkeys.made).toHaveLength(1)
        expect(JSON.parse(storage.getItem(VAULTS_KEY))).toHaveLength(1)
    })

    it('a vault opened on the passkey screen first: no temporary identity, what was held is kept', async () => {
        const storage = memoryStorage()
        const { session, held } = await loadPage(storage)
        session.expectTemporary()
        held.setItem('decontact.exchanges.v1', '{"did:key:z6MkAlice":{}}')
        const signer = await session.createAddressBook({ label: 'Bob laptop' })
        expect(get(session.temporaryAhead)).toBe(false)
        expect(storage.getItem('decontact.exchanges.v1')).toBe('{"did:key:z6MkAlice":{}}')
        expect(await session.startTemporary()).toBe(signer)
        expect(session.isTemporary()).toBe(false)
        await expect(session.secureWithPasskey()).rejects.toThrow(/no temporary identity/)
    })
})
