/**
 * The open vault of this page, and everything that opens or changes it (#60).
 *
 * - Unlocking costs one passkey prompt: its PRF output opens the vault, and the
 *   identity is derived from the root inside it. Nothing asks the passkey again in this
 *   session.
 * - The vault key, the root, the identity's key and its X25519 pair (#59) live in this
 *   module's memory until the page closes; the UI sees `session` (the DID and the slots),
 *   never a secret.
 * - Every unlock asks `find` for records kept elsewhere: records handed over (a device
 *   link, a file) and the record published for this slot over OrbitDB
 *   (vault-directory.js). A passkey that opens nothing is never given a new address book
 *   without the person saying so (`createForPasskey`).
 * - Once the app's OrbitDB runs (`attachOrbitDB`), the record is published for every slot
 *   whose lookup id this session knows, and again after every change.
 * - A device without a vault that opens an invitation link starts without a passkey
 *   (#97): `expectTemporary` when the page loads, `startTemporary` once the person starts
 *   on the form. The identity's root is random and in this page's memory only; nothing
 *   is kept (held-storage.js) until `secureWithPasskey` seals that root into a vault.
 *   The DID stays, so the books, the invitations and the cards stay valid.
 */
import { writable } from 'svelte/store'
import { withPasskeySteps } from '@le-space/orbitdb-identity-provider-webauthn-did'
import { lookUpRecords, publishRecord } from './vault-directory.js'
import { deviceStorage } from './held-storage.js'
import { normalizeWords, seedFromWords, newRecoveryWords } from './recovery-words.js'
import { createPasskey, discoverPasskeyPrf, readPasskeyPrf } from './passkeys.js'
import {
    LAST_SLOT_KEY,
    WORDS_SLOT_ID,
    addPasskey,
    createKeeper,
    knownPasskeys,
    lookupIdOf,
    openWithPasskey,
    opensWith,
    openWithWords,
    removeLegacySeed,
    removeSlot,
    serializeVaultRecord,
    setRecoveryWords,
    signerOf,
    slotsOf,
    findIn,
    encryptionKeysOf,
    encryptionKeysOfRoot,
    newRoot,
    sealRoot,
    signerOfRoot,
    wordsSecret
} from './vault.js'

/** the IndexedDB database the seed phrase identity kept its OrbitDB key in, in the clear */
const LEGACY_KEYSTORE_DATABASE = 'level-js-./orbitdb/identities'

/**
 * What the UI may know of the open vault: `{ did, slots, kid }`, `{ did, slots: [],
 * temporary: true }` while the identity is temporary (#97), or undefined while it is shut.
 */
export const session = writable()
/** whether this page found and removed a seed phrase from before the vault */
export const legacySeedRemoved = writable(false)
/** a temporary identity is to start once the person starts on the invitation link's form (#97) */
export const temporaryAhead = writable(false)
/** the temporary identity was secured with a passkey in this session: offer the other ways back in */
export const securedNow = writable(false)

let keeper
let storage
/** the keeper's open vault: holds the vault key */
let opened
/** the identity: `{ did, type, publicKey, sign }` */
let signer
/** the identity's X25519 pair, which cards and requests are sealed to (#59) */
let encryptionKeys
/** lookup ids of the slots this session knows: where the record is published */
const lookupIds = new Set()
/** records handed over from another device */
const handed = []
let heliaReady
let orbitdb
let logs = new Map()
/** a passkey that opened nothing, kept until the person decides (no second prompt) */
let pending
/** the temporary identity's root (#97): in memory only, until a passkey seals it into a vault */
let temporaryRoot
/** the temporary identity, starting or started */
let temporary
/** securing it with a passkey, while the prompts run */
let securing
/** localStorage for the rest of the app, held while the identity is temporary (held-storage.js) */
let held

let resolveReady
/** resolves with the signer once the vault is open */
export const ready = new Promise((resolve) => (resolveReady = resolve))

/**
 * Before anything else on the page: the keeper, and the seed phrase identity removed.
 *
 * @param {{ storage?: Storage, helia: Promise<import('helia').Helia>, held?: ReturnType<typeof import('./held-storage.js').createHeldStorage> }} options
 *   helia: resolves once the node runs; lookups need it. held: what the rest of the app
 *   keeps, held while the identity is temporary
 */
export function initVault({ storage: store = globalThis.localStorage, helia, held: heldStorage = deviceStorage }) {
    storage = store
    held = heldStorage
    keeper = createKeeper(storage)
    heliaReady = helia
    if (removeLegacySeed(storage)) legacySeedRemoved.set(true)
    // the seed identity's OrbitDB keystore: its private key, unencrypted
    globalThis.indexedDB?.deleteDatabase(LEGACY_KEYSTORE_DATABASE)
}

/** whether this browser keeps a vault */
export function vaultKeptHere() {
    return keeper.records().length > 0
}

/** a record from another device (link or file): unlocking looks there too */
export function handRecord(record) {
    handed.push(record)
}

/**
 * Where `find` looks for the slot with this secret and credential id. From the network
 * only records that open with the slot count: anybody may append to its log.
 */
async function finderFor(slotSecret, { kept, rawCredentialId }) {
    const lookupId = await lookupIdOf(slotSecret)
    const opens = await opensWith(slotSecret, rawCredentialId)
    const network = async () => {
        try {
            const helia = await heliaReady
            if (!helia) return []
            // with a vault kept here only a quick look, for a vault renewed elsewhere
            return await lookUpRecords(helia, lookupId, kept ? { timeoutMs: 3_000, graceMs: 1_000, opens } : { opens })
        } catch (error) {
            console.log('could not look up the vault record:', error?.message)
            return []
        }
    }
    return { lookupId, find: findIn(async () => handed, network) }
}

async function begin(next, lookupId) {
    if (temporary) throw new Error('A temporary identity is open: secure it instead')
    opened = next
    lookupIds.add(lookupId)
    signer = await signerOf(opened)
    encryptionKeys = await encryptionKeysOf(opened, signer.did)
    storage.setItem(LAST_SLOT_KEY, opened.kid)
    // the person went to the passkey screen before starting on an invitation link's form
    temporaryAhead.set(false)
    held.keep()
    console.log(`vault opened (${opened.created ? 'new' : opened.found ? 'found elsewhere' : 'kept here'}), identity ${signer.did}`)
    await refresh()
    resolveReady(signer)
    return signer
}

async function refresh() {
    session.set({ did: signer.did, kid: opened.kid, slots: await slotsOf(opened) })
}

async function publish() {
    if (!orbitdb || !opened) return
    try {
        logs = await publishRecord(orbitdb, lookupIds, opened.record, logs)
    } catch (error) {
        console.log('could not publish the vault record:', error?.message)
    }
}

/** the app's OrbitDB runs: publish the record where other devices look */
export async function attachOrbitDB(instance) {
    orbitdb = instance
    await publish()
}

async function openPasskey({ rawCredentialId, prfOutput }, { mayCreate = false, label } = {}) {
    const kept = (await keeper.status(rawCredentialId)).here
    const { lookupId, find } = await finderFor(prfOutput, { kept, rawCredentialId })
    try {
        const next = await openWithPasskey(keeper, { prfOutput, rawCredentialId, label, find, mayCreate })
        pending = undefined
        return await begin(next, lookupId)
    } catch (error) {
        if (error?.code === 'VAULT_NO_SLOT') pending = { rawCredentialId, prfOutput }
        throw error
    }
}

/**
 * Unlock with a passkey (one prompt): the one opened here last, else any passkey the
 * vaults kept here have a slot for; with `any`, whichever passkey the person picks.
 *
 * @throws a `VaultError` with code `VAULT_NO_SLOT` when it opens nothing here or
 *   elsewhere: ask the person, then `createForPasskey()`
 */
export async function unlockWithPasskey({ any = false } = {}) {
    const known = await knownPasskeys(keeper)
    const last = known.find((passkey) => passkey.kid === storage.getItem(LAST_SLOT_KEY))
    const answer = await withPasskeySteps(1, async () =>
        last && !any
            ? { rawCredentialId: last.rawCredentialId, prfOutput: await readPasskeyPrf({ rawCredentialId: last.rawCredentialId }) }
            : discoverPasskeyPrf({ allow: any ? [] : known.map((passkey) => passkey.rawCredentialId) })
    )
    return openPasskey(answer)
}

/** whether a passkey that opened nothing waits for the person's decision */
export const passkeyPending = () => pending !== undefined

/**
 * The person said the passkey that opened nothing should have an address book: a new
 * vault with its PRF output as the root. For the passkey this address book was created
 * with, that is the same root, the same DID and the same address book as before.
 */
export async function createForPasskey() {
    if (!pending) throw new Error('No passkey is waiting')
    return openPasskey(pending, { mayCreate: true })
}

export function forgetPendingPasskey() {
    pending = undefined
}

/**
 * A new address book: a new passkey (two prompts: register, read its PRF output) and a
 * new vault with that output as the root.
 */
export async function createAddressBook({ label = 'deContact' } = {}) {
    const answer = await withPasskeySteps(2, async () => {
        const credential = await createPasskey({ label })
        return { rawCredentialId: credential.rawCredentialId, prfOutput: await readPasskeyPrf(credential) }
    })
    // a passkey made just now has a slot nowhere: there is nothing to find
    const next = await openWithPasskey(keeper, { ...answer, label, mayCreate: true })
    return begin(next, await lookupIdOf(answer.prfOutput))
}

/**
 * A device without a vault opened an invitation link (#97): the form shows without a
 * passkey, and what the app keeps beside the vault is held in memory from now on. The
 * identity itself starts with `startTemporary`.
 */
export function expectTemporary() {
    if (opened || temporary) return
    held.hold()
    temporaryAhead.set(true)
}

/**
 * The temporary identity (#97): a random root in this page's memory, and from it the
 * Ed25519 did:key and its X25519 pair, as from a vault's root. No prompt, and nothing is
 * written anywhere. Called again, it returns the same identity.
 *
 * @returns {Promise<{ did: string, sign: Function }>} the signer
 */
export function startTemporary() {
    if (opened) return Promise.resolve(signer)
    temporary ??= (async () => {
        held.hold()
        const root = newRoot()
        temporaryRoot = root
        signer = await signerOfRoot(root)
        encryptionKeys = await encryptionKeysOfRoot(root, signer.did)
        // the session first: the form stays on screen throughout (+layout.svelte)
        session.set({ did: signer.did, slots: [], temporary: true })
        temporaryAhead.set(false)
        console.log(`temporary identity ${signer.did}: in memory only, until a passkey secures it`)
        resolveReady(signer)
        return signer
    })()
    return temporary
}

/** whether the identity is temporary: nothing of it outlives the tab */
export const isTemporary = () => temporaryRoot !== undefined

/**
 * The temporary identity gets a vault (#97): a new passkey (two prompts: register, read
 * its PRF output), and the temporary root sealed in its slot. The DID, the books and the
 * cards stay; nothing is opened again. The record is published as after every change,
 * and what was held in memory is kept from now on.
 *
 * A prompt that fails or is cancelled leaves the identity temporary, and nothing written.
 */
export function secureWithPasskey({ label = 'deContact' } = {}) {
    // the banner and the settings both offer it: one passkey, however often it is asked
    securing ??= seal(label).finally(() => (securing = undefined))
    return securing
}

async function seal(label) {
    if (!temporaryRoot) throw new Error('There is no temporary identity to secure')
    const answer = await withPasskeySteps(2, async () => {
        const credential = await createPasskey({ label })
        return { rawCredentialId: credential.rawCredentialId, prfOutput: await readPasskeyPrf(credential) }
    })
    opened = await sealRoot(keeper, { ...answer, label, root: temporaryRoot })
    lookupIds.add(await lookupIdOf(answer.prfOutput))
    storage.setItem(LAST_SLOT_KEY, opened.kid)
    temporaryRoot.fill(0)
    temporaryRoot = undefined
    temporary = undefined
    held.keep()
    console.log(`vault opened (new, for the temporary identity), identity ${signer.did}`)
    await refresh()
    securedNow.set(true)
    await publish()
    return signer
}

/** unlock with the recovery words (no prompt) */
export async function unlockWithWords(text) {
    const seed = await seedFromWords(normalizeWords(text))
    const secret = await wordsSecret(seed)
    try {
        const kept = (await keeper.status(WORDS_SLOT_ID)).here
        const { lookupId, find } = await finderFor(secret, { kept, rawCredentialId: WORDS_SLOT_ID })
        return await begin(await openWithWords(keeper, { seed, find }), lookupId)
    } finally {
        seed.fill(0)
        secret.fill(0)
    }
}

function vaultOpen() {
    if (!opened) throw new Error('The vault is not open')
}

/**
 * One more passkey for this vault (two prompts: register, read its PRF output); every
 * passkey with a slot writes as the same identity.
 */
export async function addNewPasskey({ label = 'deContact' } = {}) {
    vaultOpen()
    const answer = await withPasskeySteps(2, async () => {
        const credential = await createPasskey({ label })
        return { rawCredentialId: credential.rawCredentialId, prfOutput: await readPasskeyPrf(credential) }
    })
    opened = await addPasskey(keeper, opened, { ...answer, label })
    lookupIds.add(await lookupIdOf(answer.prfOutput))
    await refresh()
    await publish()
}

/** a passkey's or the words' slot out of the vault (not the one that opened it) */
export async function removeVaultSlot(kid) {
    vaultOpen()
    opened = await removeSlot(keeper, opened, kid)
    await refresh()
    await publish()
}

/** new recovery words, to show once; nothing is kept until `keepRecoveryWords` */
export function draftRecoveryWords() {
    return newRecoveryWords()
}

/** the words the person wrote down become the vault's recovery slot */
export async function keepRecoveryWords(words) {
    vaultOpen()
    const seed = await seedFromWords(words)
    const secret = await wordsSecret(seed)
    try {
        opened = await setRecoveryWords(keeper, opened, seed)
        lookupIds.add(await lookupIdOf(secret))
    } finally {
        seed.fill(0)
        secret.fill(0)
    }
    await refresh()
    await publish()
}

/** the record as text, for a device link or a file: public */
export function vaultRecordText() {
    vaultOpen()
    return serializeVaultRecord(opened.record)
}

/** the identity's signer, for contact requests and invitations */
export function currentSigner() {
    return signer
}

/**
 * The identity's X25519 pair, to open what was sealed to our DID (#59): our own address
 * book and the requests sent to us. Its private key cannot be extracted.
 */
export function currentEncryptionKeys() {
    return encryptionKeys
}
