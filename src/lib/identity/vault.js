/**
 * deContact's vault (#60): one root that every passkey of the owner opens, and the
 * identity derived from it.
 *
 * - The vault is @le-space/orbitdb-identity-provider-webauthn-did's
 *   (`createVaultKeeper`), kept in localStorage under VAULTS_KEY. Its record is public
 *   JSON with nothing secret in the clear: the root sealed under a random vault key, and
 *   one slot per passkey with the vault key sealed under a key only that passkey derives
 *   from its PRF output.
 * - A new vault takes the first passkey's PRF output as its root, as Le-Space/belege's
 *   books do. That passkey alone restores everything on an empty device.
 * - A temporary identity (#97) has a random root, in memory only, until a passkey seals
 *   it into a new vault (`sealRoot`): the DID stays the same. Restoring such a vault on
 *   an empty device needs its record (found over OrbitDB, a device link or a file).
 * - The identity is `createSecretSigner(root, { info: IDENTITY_INFO })`: an Ed25519
 *   did:key that belongs to no single passkey. Every slot opens the same root, so every
 *   passkey writes as the same DID - the DID that owns the address book in the access
 *   controller and under which contacts keep the card (`contact:<DID>`).
 * - The identity's X25519 pair (`encryptionKeysOf`, #59) comes from the same seed as its
 *   Ed25519 key: what contact cards and requests are sealed to.
 * - The recovery words (recovery-words.js) are one more slot, filed under a fixed id
 *   (WORDS_SLOT_ID) in place of a credential id: one set of words per vault.
 * - Every slot has a lookup id derived from its secret, under which the record is
 *   published over OrbitDB (vault-directory.js), so an empty device finds it with only
 *   the passkey or the words.
 *
 * Nothing here touches the browser's WebAuthn API (passkeys.js does), so it runs in
 * Node for the unit tests.
 */
import {
    VaultError,
    createVaultKeeper,
    deriveAesKey,
    deriveSubkey,
    openVault,
    rootOf,
    rootPayload,
    slotIdFor
} from '@le-space/orbitdb-identity-provider-webauthn-did/vault'
import { createSecretSigner } from '@le-space/orbitdb-identity-provider-webauthn-did'
import { encryptionKeysFromSeed } from '../encryption/sealing.js'

/** a root's length: what `rootPayload` takes */
export const ROOT_BYTES = 32

/** where the vault records are kept (a JSON array, one record per vault) */
export const VAULTS_KEY = 'decontact.vaults.v1'
/** the info every passkey's slot key is derived under: changed, no slot opens any more */
export const SLOT_INFO = 'decontact/vault-slot/v1'
/** the identity's key is derived from the root under this info: changed, the DID changes */
export const IDENTITY_INFO = 'decontact/identity/v1'
/** what the words' slot is filed under, in place of a credential id */
export const WORDS_SLOT_ID = new TextEncoder().encode('decontact/recovery-words/v1')
export const WORDS_LABEL = 'Recovery words'
/** the words' secret, from their BIP39 seed; it stands in for a passkey's PRF output */
const WORDS_SECRET_INFO = 'decontact/vault-slot/words/v1'
/** a slot's lookup id, from its secret */
const LOOKUP_INFO = 'decontact/vault-lookup/v1'
/** the slot this browser opened last (a slot id: public) */
export const LAST_SLOT_KEY = 'decontact.lastSlot.v1'
/** what the seed phrase identity kept in localStorage, in the clear */
export const LEGACY_KEYS = ['seedPhrase', 'seed']

const MAX_RECORD_LENGTH = 64 * 1024

const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

/** base64url text (a credential id, as WebAuthn and the keeper write it) as bytes */
export function fromBase64url(text) {
    const base64 = text.replace(/-/g, '+').replace(/_/g, '/')
    return Uint8Array.from(atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4)), (c) => c.charCodeAt(0))
}

/** @param {Pick<Storage, 'getItem' | 'setItem'>} storage e.g. localStorage */
export function createKeeper(storage) {
    return createVaultKeeper({ storage, key: VAULTS_KEY, slotInfo: SLOT_INFO })
}

/** the slot id of the recovery words, the same in every vault */
export const wordsKid = () => slotIdFor(WORDS_SLOT_ID)

/** the secret the words' slot opens with, from `seedFromWords` */
export const wordsSecret = (seed) => deriveSubkey(seed, WORDS_SECRET_INFO)

/**
 * Where the record is published for the slot with this secret (a passkey's PRF output,
 * or `wordsSecret`). Public; it reveals nothing of the secret, and only the slot's
 * holder - or the device that gave it its slot - can work it out.
 */
export async function lookupIdOf(slotSecret) {
    return toHex(await deriveSubkey(slotSecret, LOOKUP_INFO, { length: 16 }))
}

/**
 * Whether a record opens with this slot: the slot's secret (a passkey's PRF output, or
 * `wordsSecret`) and its credential id (`WORDS_SLOT_ID` for the words). A record found
 * over the network counts only if it does (vault-directory.js `recordsIn`): anybody may
 * append to a slot's log, so a record that merely has the shape of one says nothing.
 *
 * @returns {Promise<(record: object) => Promise<boolean>>} never throws
 */
export async function opensWith(slotSecret, rawCredentialId) {
    const slotKey = await deriveAesKey(slotSecret, SLOT_INFO)
    return async (record) => {
        try {
            const { payload } = await openVault(record.vault, { slotKey, rawCredentialId })
            payload.fill?.(0)
            return true
        } catch {
            return false
        }
    }
}

/**
 * Opens the vault this passkey has a slot in.
 *
 * @param {ReturnType<typeof createKeeper>} keeper
 * @param {{ prfOutput: Uint8Array, rawCredentialId: Uint8Array, label?: string,
 *   find?: (kid: string) => Promise<object[]>, mayCreate?: boolean }} unlock
 *   find: records kept elsewhere (pass it on every unlock); mayCreate: without a vault
 *   for this passkey, make one with its PRF output as the root - only when the person
 *   said so, never as a fallback
 * @throws {VaultError} `VAULT_NO_SLOT` without a vault and without `mayCreate`, and the
 *   keeper's other refusals
 */
export function openWithPasskey(keeper, { prfOutput, rawCredentialId, label, find, mayCreate = false }) {
    return keeper.open({
        prfOutput,
        rawCredentialId,
        label,
        find,
        create: mayCreate ? () => rootPayload(prfOutput.slice(0, 32)) : undefined
    })
}

/**
 * A new vault for a temporary identity's root (#97), with a slot for a passkey made just
 * now: the identity derived from it is the temporary one, so nothing has to move. The
 * caller keeps `root` and zeroes it.
 *
 * @param {{ prfOutput: Uint8Array, rawCredentialId: Uint8Array, label?: string, root: Uint8Array }} seal
 * @throws {VaultError} `VAULT_SLOT_EXISTS` when this passkey opens a vault kept here
 *   already (a passkey made just now cannot), and the keeper's other refusals
 */
export async function sealRoot(keeper, { prfOutput, rawCredentialId, label, root }) {
    // a passkey made just now has a slot nowhere: there is nothing to find
    const opened = await keeper.open({ prfOutput, rawCredentialId, label, create: () => rootPayload(root) })
    if (!opened.created) {
        throw new VaultError('This passkey opens an address book here already', { code: 'VAULT_SLOT_EXISTS' })
    }
    return opened
}

/**
 * Opens the vault with the recovery words. Never makes one.
 *
 * @param {{ seed: Uint8Array, find?: (kid: string) => Promise<object[]> }} unlock seed: from `seedFromWords`
 */
export async function openWithWords(keeper, { seed, find }) {
    return keeper.open({ prfOutput: await wordsSecret(seed), rawCredentialId: WORDS_SLOT_ID, label: WORDS_LABEL, find })
}

/** gives one more passkey a slot, while the vault is open */
export function addPasskey(keeper, opened, { prfOutput, rawCredentialId, label }) {
    return keeper.addPasskey(opened, { prfOutput, rawCredentialId, label })
}

/** takes a passkey's (or the words') slot out; the one that opened the vault cannot go */
export function removeSlot(keeper, opened, kid) {
    return keeper.removePasskey(opened, kid)
}

/**
 * Gives the vault recovery words, in place of the ones it had.
 *
 * @param {Uint8Array} seed from `seedFromWords` of new words
 * @throws {VaultError} `VAULT_SLOT_IN_USE` when the vault was opened with the words it has
 */
export async function setRecoveryWords(keeper, opened, seed) {
    const kid = await wordsKid()
    let current = opened
    if (current.record.vault.slots.some((slot) => slot?.kid === kid)) {
        if (current.kid === kid) {
            throw new VaultError('Open the vault with a passkey to replace the recovery words', { code: 'VAULT_SLOT_IN_USE' })
        }
        current = await keeper.removePasskey(current, kid)
    }
    return keeper.addPasskey(current, { prfOutput: await wordsSecret(seed), rawCredentialId: WORDS_SLOT_ID, label: WORDS_LABEL })
}

/** a temporary identity's root (#97): random, for this page's memory only */
export function newRoot() {
    return crypto.getRandomValues(new Uint8Array(ROOT_BYTES))
}

/**
 * The identity of a root: an Ed25519 signer `{ did, type, publicKey, sign }`. The key
 * stays inside `sign`; the root is left as it is.
 */
export function signerOfRoot(root) {
    return createSecretSigner(root, { info: IDENTITY_INFO })
}

/**
 * The identity of an open vault (`signerOfRoot` of its root). The root is zeroed once
 * the key is derived.
 */
export async function signerOf(opened) {
    const root = rootOf(opened.payload)
    try {
        return await signerOfRoot(root)
    } finally {
        root.fill(0)
    }
}

/**
 * The identity's X25519 pair (#59), which contact cards and requests are sealed to: the
 * key-agreement counterpart of its Ed25519 did:key (lib/encryption/sealing.js). It comes
 * from the seed `createSecretSigner` derives the Ed25519 key from, so every passkey and
 * every device has the same pair, and anybody can seal to it knowing only the DID.
 *
 * @param {string} did the identity's DID (`signerOf(opened).did`): the pair must belong to it
 * @returns {Promise<{ publicKey: Uint8Array, privateKey: CryptoKey }>} privateKey cannot be extracted
 */
export async function encryptionKeysOf(opened, did) {
    const root = rootOf(opened.payload)
    try {
        return await encryptionKeysOfRoot(root, did)
    } finally {
        root.fill(0)
    }
}

/** `encryptionKeysOf` for a root at hand (a temporary identity's, #97); the root is left as it is */
export async function encryptionKeysOfRoot(root, did) {
    const seed = await deriveSubkey(root, IDENTITY_INFO)
    try {
        return await encryptionKeysFromSeed(seed, { did })
    } finally {
        seed.fill(0)
    }
}

/**
 * The slots of a record as the settings list them: passkeys first, the words last.
 *
 * @returns {Promise<{ kid: string, label: string, addedAt: string, credentialId?: string, words: boolean, current: boolean }[]>}
 */
export async function slotsOf(opened) {
    const words = await wordsKid()
    return opened.record.vault.slots
        .map((slot) => slot.kid)
        .map((kid) => {
            const entry = opened.record.slots.find((slot) => slot?.kid === kid) ?? {}
            const isWords = kid === words
            return {
                kid,
                label: entry.label || (isWords ? WORDS_LABEL : 'Passkey'),
                addedAt: entry.addedAt ?? '',
                credentialId: isWords ? undefined : entry.credentialId,
                words: isWords,
                current: kid === opened.kid
            }
        })
        .sort((a, b) => Number(a.words) - Number(b.words))
}

/** the credential ids of the passkeys the vaults kept here have a slot for (not the words) */
export async function knownPasskeys(keeper) {
    const words = await wordsKid()
    return keeper
        .records()
        .flatMap((record) => record.slots)
        .filter((slot) => slot?.kid !== words && typeof slot?.credentialId === 'string' && slot.credentialId)
        .map((slot) => ({ kid: slot.kid, rawCredentialId: fromBase64url(slot.credentialId), label: slot.label }))
}

/** whether `value` has the shape of a keeper's record (what the keeper itself checks first) */
export function isVaultRecord(value) {
    return (
        Boolean(value) &&
        typeof value === 'object' &&
        Boolean(value.vault) &&
        typeof value.vault === 'object' &&
        Array.isArray(value.vault.slots)
    )
}

/** a record handed over as text (a device link, a file, the directory), or null */
export function parseVaultRecord(text) {
    if (typeof text !== 'string' || text.length > MAX_RECORD_LENGTH) return null
    try {
        const value = JSON.parse(text)
        return isVaultRecord(value) ? value : null
    } catch {
        return null
    }
}

/** a record as it travels: the keeper's fields, as JSON */
export function serializeVaultRecord(record) {
    const { vault, slots, removed } = record
    return JSON.stringify({ vault, slots, removed })
}

/**
 * Removes what the seed phrase identity kept in the clear. deContact now opens its
 * identity with a passkey; the seed's DID is not the vault's, so nothing is carried over.
 *
 * @returns {boolean} whether there was anything to remove
 */
export function removeLegacySeed(storage) {
    let found = false
    for (const key of LEGACY_KEYS) {
        if (storage.getItem(key) !== null) found = true
        storage.removeItem(key)
    }
    return found
}

/**
 * Sources of records kept elsewhere, as the keeper's `find` takes them: each source's
 * answers together. A source that fails, fails the lookup (with nothing kept here the
 * keeper then refuses rather than making a new vault).
 *
 * @param {...((kid: string) => Promise<object | object[] | null | undefined>)} sources
 */
export function findIn(...sources) {
    return async (kid) => {
        const answers = await Promise.all(sources.filter(Boolean).map((source) => source(kid)))
        return answers.flat().filter(isVaultRecord)
    }
}
