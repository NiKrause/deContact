/**
 * Sealing bytes so that only one identity can read them (#59).
 *
 * - The key is the X25519 counterpart of the recipient's Ed25519 did:key, the key-agreement
 *   key did:key defines for it (libsodium: crypto_sign_ed25519_pk_to_curve25519). Anybody
 *   works out the public half from the DID alone, so there is no key directory, and no
 *   key that somebody could register under somebody else's DID.
 * - The private half comes from the seed of the vault's identity (vault.js
 *   `encryptionKeysOf`), the seed `createSecretSigner` makes the Ed25519 key of. It is
 *   imported into WebCrypto as a key that cannot be extracted, and the bytes are zeroed.
 * - A seal: a fresh ephemeral X25519 pair, HKDF-SHA256 over the shared secret (salt: both
 *   public keys, info SEAL_INFO), AES-GCM-256 with a fresh nonce. The context (what the
 *   bytes are, and where they belong) is the additional data: a seal moved to another
 *   place does not open there.
 *
 * Ported from simple-todo privacy01 (`key-wrapping.js`, which seals a database key, and
 * `db-encryption.js`), with the recipient's key taken from the DID instead of a directory.
 * Runs in the browser and in Node 22 (WebCrypto X25519).
 */
import { ed25519 } from '@noble/curves/ed25519.js'
import { base64url } from 'multiformats/bases/base64'
import { publicKeyFromDid } from '@le-space/orbitdb-access-controller-decontact'

export const SEAL_VERSION = 1
/** changed, nothing sealed before opens */
const SEAL_INFO = new TextEncoder().encode('decontact/seal/v1')
const KEY_BYTES = 32
const NONCE_BYTES = 12
const TAG_BYTES = 16
const X25519 = { name: 'X25519' }
/**
 * An X25519 private key in PKCS#8 (RFC 8410) is this prefix and the 32 key bytes: what
 * lets WebCrypto import a derived secret (as in privacy01's device-keys.js).
 */
const PKCS8_PREFIX = Uint8Array.from([
    0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x6e, 0x04, 0x22, 0x04, 0x20
])

const encode = (text) => new TextEncoder().encode(text)
const concat = (...parts) => {
    const out = new Uint8Array(parts.reduce((length, part) => length + part.length, 0))
    let offset = 0
    for (const part of parts) {
        out.set(part, offset)
        offset += part.length
    }
    return out
}
const sameBytes = (a, b) => a.length === b.length && a.every((byte, i) => byte === b[i])

/** the X25519 public key of an Ed25519 did:key (32 bytes), or null for anything else */
export function encryptionKeyOfDid(did) {
    const publicKey = publicKeyFromDid(did)
    if (!publicKey) return null
    try {
        return ed25519.utils.toMontgomery(publicKey.raw)
    } catch {
        return null
    }
}

/**
 * The X25519 pair of an identity, from the 32-byte seed of its Ed25519 key.
 *
 * @param {Uint8Array} seed zeroed by the caller once this returns
 * @param {{ did?: string }} options did: the identity's DID; the pair must belong to it
 * @returns {Promise<{ publicKey: Uint8Array, privateKey: CryptoKey }>} privateKey cannot be extracted
 */
export async function encryptionKeysFromSeed(seed, { did } = {}) {
    if (!(seed instanceof Uint8Array) || seed.length !== KEY_BYTES) throw new TypeError('An identity seed has 32 bytes')
    const secret = ed25519.utils.toMontgomerySecret(seed)
    const pkcs8 = concat(PKCS8_PREFIX, secret)
    try {
        const privateKey = await crypto.subtle.importKey('pkcs8', pkcs8, X25519, false, ['deriveBits'])
        const publicKey = ed25519.utils.toMontgomery(ed25519.getPublicKey(seed))
        if (did !== undefined && !sameBytes(publicKey, encryptionKeyOfDid(did) ?? new Uint8Array())) {
            throw new Error(`this seed does not belong to ${did}`)
        }
        return { publicKey, privateKey }
    } finally {
        secret.fill(0)
        pkcs8.fill(0)
    }
}

/** the AES key one agreement gives, bound to both public keys */
async function sealKey(sharedSecret, ephemeral, recipient, usages) {
    const material = await crypto.subtle.importKey('raw', sharedSecret, 'HKDF', false, ['deriveKey'])
    return crypto.subtle.deriveKey(
        { name: 'HKDF', hash: 'SHA-256', salt: concat(ephemeral, recipient), info: SEAL_INFO },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        usages
    )
}

/**
 * Seals `bytes` for the holder of `recipient`'s private key.
 *
 * @param {Uint8Array} recipient X25519 public key, e.g. `encryptionKeyOfDid(did)`
 * @param {Uint8Array} bytes
 * @param {{ context: string }} options what the bytes are and where they belong; opening needs the same
 * @returns {Promise<{ v: 1, epk: string, ct: string }>} epk: the ephemeral public key, ct: nonce ‖ ciphertext (base64url)
 */
export async function seal(recipient, bytes, { context }) {
    if (!(recipient instanceof Uint8Array) || recipient.length !== KEY_BYTES) throw new TypeError('No key to seal to')
    if (typeof context !== 'string' || context.length === 0) throw new TypeError('A seal needs a context')
    const ephemeral = await crypto.subtle.generateKey(X25519, true, ['deriveBits'])
    const recipientKey = await crypto.subtle.importKey('raw', recipient, X25519, false, [])
    const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'X25519', public: recipientKey }, ephemeral.privateKey, 256))
    const epk = new Uint8Array(await crypto.subtle.exportKey('raw', ephemeral.publicKey))
    const key = await sealKey(shared, epk, recipient, ['encrypt'])
    shared.fill(0)
    const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES))
    const ciphertext = new Uint8Array(
        await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: encode(context) }, key, bytes)
    )
    return { v: SEAL_VERSION, epk: base64url.baseEncode(epk), ct: base64url.baseEncode(concat(nonce, ciphertext)) }
}

/** whether `value` has the shape of a seal (says nothing about whether it opens) */
export function isSeal(value) {
    return (
        value !== null &&
        typeof value === 'object' &&
        value.v === SEAL_VERSION &&
        typeof value.epk === 'string' &&
        typeof value.ct === 'string'
    )
}

/**
 * Opens a seal made for `keys`. Throws when it was made for somebody else, under another
 * context, or altered: AES-GCM gives the same answer for all of them.
 *
 * @param {{ publicKey: Uint8Array, privateKey: CryptoKey }} keys from `encryptionKeysFromSeed`
 * @param {{ v: 1, epk: string, ct: string }} sealed
 * @param {{ context: string }} options
 * @returns {Promise<Uint8Array>}
 */
export async function openSeal(keys, sealed, { context }) {
    if (!isSeal(sealed)) throw new Error('Not a seal')
    const epk = base64url.baseDecode(sealed.epk)
    const bytes = base64url.baseDecode(sealed.ct)
    if (epk.length !== KEY_BYTES || bytes.length < NONCE_BYTES + TAG_BYTES) throw new Error('Not a seal')
    const ephemeral = await crypto.subtle.importKey('raw', epk, X25519, false, [])
    const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'X25519', public: ephemeral }, keys.privateKey, 256))
    const key = await sealKey(shared, epk, keys.publicKey, ['decrypt'])
    shared.fill(0)
    return new Uint8Array(
        await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: bytes.subarray(0, NONCE_BYTES), additionalData: encode(context) },
            key,
            bytes.subarray(NONCE_BYTES)
        )
    )
}

/** seals a JSON value */
export const sealJson = (recipient, value, options) => seal(recipient, encode(JSON.stringify(value)), options)

/** opens a seal of a JSON value; throws as `openSeal` does, and on bytes that are not JSON */
export async function openJson(keys, sealed, options) {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await openSeal(keys, sealed, options)))
}
