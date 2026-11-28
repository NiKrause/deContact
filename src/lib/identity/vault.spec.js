import { describe, expect, it } from 'vitest'
import { pbkdf2Sync } from 'node:crypto'
import { createSecretSigner, deriveSubkey, openVault, deriveAesKey } from '@le-space/orbitdb-identity-provider-webauthn-did'
import { verifyInvitation, createInvitation } from '@le-space/orbitdb-access-controller-decontact'
import {
    IDENTITY_INFO,
    LEGACY_KEYS,
    SLOT_INFO,
    VAULTS_KEY,
    WORDS_SLOT_ID,
    addPasskey,
    createKeeper,
    findIn,
    knownPasskeys,
    lookupIdOf,
    openWithPasskey,
    openWithWords,
    parseVaultRecord,
    removeLegacySeed,
    removeSlot,
    serializeVaultRecord,
    setRecoveryWords,
    signerOf,
    slotsOf,
    encryptionKeysOf,
    encryptionKeysOfRoot,
    newRoot,
    sealRoot,
    signerOfRoot,
    wordsSecret
} from './vault.js'
import { rootOf } from '@le-space/orbitdb-identity-provider-webauthn-did/vault'
import { WORD_COUNT, checkWords, newRecoveryWords, normalizeWords, seedFromWords } from './recovery-words.js'
import { REQUEST_ADDRESS, openMessage, sealMessage } from '../network/contact-messages.js'

/** localStorage, in memory */
function memoryStorage() {
    const items = new Map()
    return {
        getItem: (key) => (items.has(key) ? items.get(key) : null),
        setItem: (key, value) => items.set(key, String(value)),
        removeItem: (key) => items.delete(key),
        text: () => [...items].map(([key, value]) => `${key}\n${value}`).join('\n')
    }
}

const random = (n = 32) => crypto.getRandomValues(new Uint8Array(n))
/** a passkey as the vault sees it: a credential id and its PRF output */
const passkey = () => ({ rawCredentialId: random(16), prfOutput: random(32) })
const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

/** every way a secret could be written down in storage */
const spellings = (bytes) => {
    const base64 = btoa(String.fromCharCode(...bytes)).replace(/=+$/, '')
    return [hex(bytes), hex(bytes).toUpperCase(), base64, base64.replace(/\+/g, '-').replace(/\//g, '_'), Array.from(bytes).join(',')]
}

async function createdVault() {
    const storage = memoryStorage()
    const keeper = createKeeper(storage)
    const first = passkey()
    const opened = await openWithPasskey(keeper, { ...first, label: 'Laptop', mayCreate: true })
    return { storage, keeper, first, opened, signer: await signerOf(opened) }
}

describe('the vault', () => {
    it('takes the first passkey\'s PRF output as its root and derives the identity from it', async () => {
        const { first, opened, signer, storage } = await createdVault()
        expect(opened.created).toBe(true)
        const expected = await createSecretSigner(first.prfOutput, { info: IDENTITY_INFO })
        expect(signer.did).toBe(expected.did)
        expect(signer.did).toMatch(/^did:key:z6Mk/) // Ed25519
        expect(JSON.parse(storage.getItem(VAULTS_KEY))).toHaveLength(1)
    })

    it('unlocks again with the same passkey as the same identity', async () => {
        const { storage, first, signer } = await createdVault()
        const again = await openWithPasskey(createKeeper(storage), first)
        expect(again.created).toBe(false)
        expect((await signerOf(again)).did).toBe(signer.did)
    })

    it('never makes a vault for a passkey that opens nothing unless told to', async () => {
        const keeper = createKeeper(memoryStorage())
        await expect(openWithPasskey(keeper, passkey())).rejects.toMatchObject({ code: 'VAULT_NO_SLOT' })
        expect(keeper.records()).toEqual([])
    })

    it('restores the identity on an empty device with the first passkey alone', async () => {
        const { first, signer } = await createdVault()
        const elsewhere = createKeeper(memoryStorage())
        const restored = await openWithPasskey(elsewhere, { ...first, mayCreate: true })
        expect((await signerOf(restored)).did).toBe(signer.did)
    })

    it('lets a second passkey write as the same DID, here and on an empty device', async () => {
        const { storage, keeper, opened, signer } = await createdVault()
        const second = passkey()
        const withSecond = await addPasskey(keeper, opened, { ...second, label: 'Security key' })
        expect((await slotsOf(withSecond)).map((slot) => slot.label)).toEqual(['Laptop', 'Security key'])

        const here = await openWithPasskey(createKeeper(storage), second)
        expect((await signerOf(here)).did).toBe(signer.did)

        // an empty device: nothing kept, the record comes from elsewhere (link, file, OrbitDB)
        const record = parseVaultRecord(serializeVaultRecord(withSecond.record))
        const empty = createKeeper(memoryStorage())
        // a second passkey with nothing to find opens nothing
        await expect(openWithPasskey(empty, { ...second, find: findIn(async () => []) })).rejects.toMatchObject({ code: 'VAULT_NO_SLOT' })
        const restored = await openWithPasskey(empty, { ...second, find: findIn(async () => [record]) })
        expect(restored.found).toBe(true)
        expect((await signerOf(restored)).did).toBe(signer.did)
        // and keeps it, so the next unlock finds it here
        expect((await empty.status(second.rawCredentialId)).here).toBe(true)
    })

    it('refuses a removed passkey, and lets nobody remove the passkey that opened it', async () => {
        const { storage, keeper, opened, first } = await createdVault()
        const second = passkey()
        const withSecond = await addPasskey(keeper, opened, second)
        await expect(removeSlot(keeper, withSecond, withSecond.kid)).rejects.toMatchObject({ code: 'VAULT_SLOT_IN_USE' })
        const secondKid = (await slotsOf(withSecond)).find((slot) => !slot.current).kid
        await removeSlot(keeper, withSecond, secondKid)
        await expect(openWithPasskey(createKeeper(storage), second)).rejects.toMatchObject({ code: 'VAULT_SLOT_REMOVED' })
        await expect(openWithPasskey(createKeeper(storage), { ...second, mayCreate: true })).rejects.toMatchObject({ code: 'VAULT_SLOT_REMOVED' })
        expect((await openWithPasskey(createKeeper(storage), first)).created).toBe(false)
    })

    it('lists the passkeys it knows by credential id, without the recovery words', async () => {
        const { keeper, opened, first } = await createdVault()
        await setRecoveryWords(keeper, opened, await seedFromWords(newRecoveryWords()))
        const known = await knownPasskeys(keeper)
        expect(known).toHaveLength(1)
        expect(hex(known[0].rawCredentialId)).toBe(hex(first.rawCredentialId))
    })
})

describe('the recovery words', () => {
    it('are 24 BIP39 words whose seed is BIP39\'s (PBKDF2-HMAC-SHA512, salt "mnemonic")', async () => {
        const words = newRecoveryWords()
        expect(words).toHaveLength(WORD_COUNT)
        expect(checkWords(words)).toBe(true)
        const seed = await seedFromWords(words)
        expect(hex(seed)).toBe(pbkdf2Sync(words.join(' '), 'mnemonic', 2048, 64, 'sha512').toString('hex'))
    })

    it('read what a person typed, and refuse a misread word', async () => {
        const words = newRecoveryWords()
        const typed = words.map((word, i) => `${i + 1}. ${word.toUpperCase()}`).join(',\n')
        expect(normalizeWords(typed)).toEqual(words)
        expect(checkWords(words.slice(0, 12))).toBe(false)

        // A misread word fails the 8-bit checksum in 255 of 256 cases: random words would
        // let this test fail now and then. BIP39's test vector (all-zero entropy) with its
        // fourth word misread is one of the 255.
        const vector = [...Array(23).fill('abandon'), 'art']
        expect(checkWords(vector)).toBe(true)
        const misread = [...vector]
        misread[3] = 'ability'
        expect(checkWords(misread)).toBe(false)
        await expect(seedFromWords(misread)).rejects.toThrow(/not 24 valid/)
    })

    it('open the vault on an empty device as the same DID, and never make one', async () => {
        const { keeper, opened, signer } = await createdVault()
        const words = newRecoveryWords()
        const withWords = await setRecoveryWords(keeper, opened, await seedFromWords(words))
        expect((await slotsOf(withWords)).map((slot) => slot.words)).toEqual([false, true])

        const record = parseVaultRecord(serializeVaultRecord(withWords.record))
        const empty = createKeeper(memoryStorage())
        await expect(openWithWords(empty, { seed: await seedFromWords(words) })).rejects.toMatchObject({ code: 'VAULT_NO_SLOT' })
        const restored = await openWithWords(empty, { seed: await seedFromWords(words), find: findIn(async () => record) })
        expect((await signerOf(restored)).did).toBe(signer.did)
        // other words do not open it
        const other = createKeeper(memoryStorage())
        await expect(openWithWords(other, { seed: await seedFromWords(newRecoveryWords()), find: findIn(async () => record) }))
            .rejects.toMatchObject({ code: 'VAULT_LOCKED' })
    })

    it('can be replaced: the old words open nothing any more', async () => {
        const { storage, keeper, opened } = await createdVault()
        const oldWords = newRecoveryWords()
        const newWords = newRecoveryWords()
        const once = await setRecoveryWords(keeper, opened, await seedFromWords(oldWords))
        const twice = await setRecoveryWords(keeper, once, await seedFromWords(newWords))
        expect((await slotsOf(twice)).filter((slot) => slot.words)).toHaveLength(1)
        await expect(openWithWords(createKeeper(storage), { seed: await seedFromWords(oldWords) })).rejects.toMatchObject({ code: 'VAULT_LOCKED' })
        const byWords = await openWithWords(createKeeper(storage), { seed: await seedFromWords(newWords) })
        // opened with the words, the words cannot replace themselves
        await expect(setRecoveryWords(keeper, byWords, await seedFromWords(newRecoveryWords()))).rejects.toMatchObject({ code: 'VAULT_SLOT_IN_USE' })
    })

    it('revoke nothing when replaced: a copy of an older record still opens with the old words', async () => {
        const { keeper, opened, signer } = await createdVault()
        const oldWords = newRecoveryWords()
        const once = await setRecoveryWords(keeper, opened, await seedFromWords(oldWords))
        // the record as it was published while the old words were the vault's
        const older = parseVaultRecord(serializeVaultRecord(once.record))
        const twice = await setRecoveryWords(keeper, once, await seedFromWords(newRecoveryWords()))
        const newer = parseVaultRecord(serializeVaultRecord(twice.record))
        // the vault key and the root stay, so the old slot in the older record still opens them
        const empty = createKeeper(memoryStorage())
        const restored = await openWithWords(empty, { seed: await seedFromWords(oldWords), find: findIn(async () => [newer, older]) })
        expect((await signerOf(restored)).did).toBe(signer.did)
    })
})

describe('what the browser keeps', () => {
    it('holds no root, PRF output, vault key, identity key or words seed in the clear', async () => {
        const { storage, keeper, opened, first } = await createdVault()
        const second = passkey()
        const words = newRecoveryWords()
        const seed = await seedFromWords(words)
        const withAll = await setRecoveryWords(keeper, await addPasskey(keeper, opened, second), seed)
        const { vaultKey } = await openVault(withAll.record.vault, {
            slotKey: await deriveAesKey(first.prfOutput, SLOT_INFO),
            rawCredentialId: first.rawCredentialId
        })
        const secrets = {
            'root (first PRF output)': first.prfOutput,
            'second PRF output': second.prfOutput,
            'vault key': vaultKey,
            'identity key seed': await deriveSubkey(first.prfOutput, IDENTITY_INFO),
            'words seed': seed,
            'words secret': await wordsSecret(seed)
        }
        const text = storage.text()
        expect(text).toContain(VAULTS_KEY)
        for (const [name, bytes] of Object.entries(secrets)) {
            for (const spelling of spellings(bytes)) expect(text.includes(spelling), name).toBe(false)
        }
        for (const word of words) expect(text.includes(` ${word} `)).toBe(false)
        expect(text.includes(words.join(' '))).toBe(false)
    })

    it('loses the seed phrase of the identity before the vault', () => {
        const storage = memoryStorage()
        expect(removeLegacySeed(storage)).toBe(false)
        storage.setItem('seedPhrase', 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about')
        storage.setItem('seed', 'deadbeef')
        storage.setItem('useWebRTC', 'true')
        expect(removeLegacySeed(storage)).toBe(true)
        for (const key of LEGACY_KEYS) expect(storage.getItem(key)).toBeNull()
        expect(storage.getItem('useWebRTC')).toBe('true')
    })
})

describe('records and lookups', () => {
    it('reads a record back from text, and nothing else', async () => {
        const { opened } = await createdVault()
        expect(parseVaultRecord(serializeVaultRecord(opened.record))).toEqual({
            vault: opened.record.vault,
            slots: opened.record.slots,
            removed: opened.record.removed
        })
        for (const junk of ['', 'null', '[]', '{"vault":{}}', 'not json', 'x'.repeat(70_000), undefined]) {
            expect(parseVaultRecord(junk)).toBeNull()
        }
    })

    it('gives each slot its own lookup id, the same every time', async () => {
        const a = passkey().prfOutput
        const b = passkey().prfOutput
        expect(await lookupIdOf(a)).toBe(await lookupIdOf(a))
        expect(await lookupIdOf(a)).not.toBe(await lookupIdOf(b))
        expect(await lookupIdOf(a)).toMatch(/^[0-9a-f]{32}$/)
        // not a piece of the secret
        expect(hex(a).includes(await lookupIdOf(a))).toBe(false)
    })

    it('finds in every source together, and only records', async () => {
        const { opened } = await createdVault()
        const find = findIn(async () => [opened.record, { not: 'a record' }], async () => null, async () => opened.record)
        expect(await find('kid')).toEqual([opened.record, opened.record])
        await expect(findIn(async () => { throw new Error('offline') })('kid')).rejects.toThrow('offline')
    })

    it('files the words under a fixed id, never a credential\'s', () => {
        expect(new TextDecoder().decode(WORDS_SLOT_ID)).toBe('decontact/recovery-words/v1')
    })
})

describe('signing as the vault identity', () => {
    it('makes invitations and contact requests that verify against the DID', async () => {
        const alice = (await createdVault()).signer
        const bobsVault = await createdVault()
        const bob = bobsVault.signer
        const invitation = await createInvitation(alice, alice.did, bob.did)
        expect(await verifyInvitation(invitation, { owner: alice.did, invitee: bob.did })).toBe(true)

        const text = await sealMessage(alice, {
            command: REQUEST_ADDRESS,
            recipient: bob.did,
            data: { sharedAddress: '/orbitdb/zdpuExample', invitation }
        })
        // sealed to Bob's DID, opened with the pair his vault derives (#59)
        const opened = await openMessage(text, { me: bob.did, keys: await encryptionKeysOf(bobsVault.opened, bob.did) })
        expect(opened).toMatchObject({ ok: true, message: { sender: alice.did } })
    })

    it('gives the same X25519 pair to every slot, from the root, and leaves the root alone', async () => {
        const { keeper, first, opened, signer } = await createdVault()
        const second = passkey()
        const withTwo = await addPasskey(keeper, opened, { ...second, label: 'Security key' })
        const viaSecond = await openWithPasskey(keeper, second)
        const one = await encryptionKeysOf(withTwo, signer.did)
        const two = await encryptionKeysOf(viaSecond, signer.did)
        expect(two.publicKey).toEqual(one.publicKey)
        expect((await signerOf(viaSecond)).did).toBe(signer.did)
        // the payload still holds the root afterwards: only the copies are zeroed
        expect(Buffer.from(rootOf(viaSecond.payload))).toEqual(Buffer.from(first.prfOutput.slice(0, 32)))
        await expect(encryptionKeysOf(opened, (await createdVault()).signer.did)).rejects.toThrow(/does not belong/)
    })
})

describe('a temporary identity sealed into a vault (#97)', () => {
    it('keeps its DID and X25519 pair: the root is sealed as it is', async () => {
        const root = newRoot()
        const temporary = await signerOfRoot(root)
        const keys = await encryptionKeysOfRoot(root, temporary.did)
        const storage = memoryStorage()
        const keeper = createKeeper(storage)
        const first = passkey()
        const opened = await sealRoot(keeper, { ...first, label: 'Bob phone', root })
        expect(opened.created).toBe(true)
        expect((await signerOf(opened)).did).toBe(temporary.did)
        expect((await encryptionKeysOf(opened, temporary.did)).publicKey).toEqual(keys.publicKey)
        // the root is random, not the PRF output, and left for the caller to zero
        expect(Buffer.from(rootOf(opened.payload))).toEqual(Buffer.from(root))
        expect(hex(rootOf(opened.payload))).not.toBe(hex(first.prfOutput.slice(0, 32)))
        expect(root.some((byte) => byte !== 0)).toBe(true)
        expect((await slotsOf(opened)).map((slot) => slot.label)).toEqual(['Bob phone'])
    })

    it('opens again with that passkey as the same DID; on an empty device only with its record', async () => {
        const root = newRoot()
        const did = (await signerOfRoot(root)).did
        const storage = memoryStorage()
        const first = passkey()
        const opened = await sealRoot(createKeeper(storage), { ...first, root })

        // a reload: the passkey opens the vault kept here
        const again = await openWithPasskey(createKeeper(storage), first)
        expect(again.created).toBe(false)
        expect((await signerOf(again)).did).toBe(did)

        // an empty device: the passkey's PRF output is not the root, so a vault made from
        // it would be another identity; with the record it is the same
        const empty = memoryStorage()
        const made = await openWithPasskey(createKeeper(empty), { ...first, mayCreate: true })
        expect((await signerOf(made)).did).not.toBe(did)
        const record = parseVaultRecord(serializeVaultRecord(opened.record))
        const restored = await openWithPasskey(createKeeper(memoryStorage()), { ...first, find: findIn(async () => [record]) })
        expect(restored.found).toBe(true)
        expect((await signerOf(restored)).did).toBe(did)
    })

    it('stores nothing of the root, the identity key or the X25519 key in the clear', async () => {
        const root = newRoot()
        const storage = memoryStorage()
        const opened = await sealRoot(createKeeper(storage), { ...passkey(), root })
        const seed = await deriveSubkey(root, IDENTITY_INFO)
        const text = storage.text()
        for (const secret of [root, seed, opened.vaultKey]) {
            for (const spelling of spellings(secret)) expect(text.includes(spelling)).toBe(false)
        }
    })

    it('refuses a passkey that opens a vault kept here already, and changes nothing', async () => {
        const { storage, keeper, first } = await createdVault()
        const before = storage.getItem(VAULTS_KEY)
        await expect(sealRoot(keeper, { ...first, root: newRoot() })).rejects.toMatchObject({ code: 'VAULT_SLOT_EXISTS' })
        expect(storage.getItem(VAULTS_KEY)).toBe(before)
    })

    it('gives every temporary identity a root of its own', async () => {
        const [a, b] = [newRoot(), newRoot()]
        expect(a).toHaveLength(32)
        expect(hex(a)).not.toBe(hex(b))
        expect((await signerOfRoot(a)).did).not.toBe((await signerOfRoot(b)).did)
    })
})
