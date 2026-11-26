/**
 * Contact requests between deContact users and the one-time invitation links behind the
 * QR code. Pure functions and small stores without app state (contact-messages.spec.js).
 *
 * Messages (gossipsub topic CONTENT_TOPIC/<recipient DID>):
 * - signed with the sender's did:key, the Ed25519 key the DID is made of (the identity of
 *   the sender's passkey vault, lib/identity/vault.js), so nobody else can send a request
 *   in the sender's name;
 * - recipient, timestamp and a random nonce are inside the signature: a receiver drops
 *   messages for somebody else, messages outside MAX_CLOCK_SKEW_MS and messages it has
 *   seen before (createReplayGuard);
 * - anything that does not have the expected shape is dropped (openMessage never throws).
 *
 * Invitation links (onboarding tokens):
 * - signed by the inviter over a random nonce, an expiry and the "request address" choice;
 * - the device that issued a token remembers it; the first invitee who uses it owns it,
 *   everybody else is asked for (createOnboardingTokenStore). A token from another device,
 *   a used, expired or forged token means: ask the user to confirm.
 */
import { generateKeyPairFromSeed } from '@libp2p/crypto/keys'
import { base64url } from 'multiformats/bases/base64'
import { publicKeyFromDid, verifyInvitation } from '@le-space/orbitdb-access-controller-decontact'

export const REQUEST_ADDRESS = 'REQUEST_ADDRESS'

/** a request is well below 2 KiB; anything much larger is not one of ours */
export const MAX_MESSAGE_LENGTH = 16 * 1024
/** how far a message's timestamp may be from our clock (gossipsub delivers at once) */
export const MAX_CLOCK_SKEW_MS = 10 * 60 * 1000
/** how long an invitation link can be used */
export const ONBOARDING_TOKEN_TTL_MS = 24 * 60 * 60 * 1000

const MESSAGE_CONTEXT = 'decontact/message/v2'
const ONBOARDING_CONTEXT = 'decontact/onboarding/v1'
const NONCE = /^[A-Za-z0-9_-]{22}$/ // 16 random bytes, base64url
const SIGNATURE = /^[A-Za-z0-9_-]{86}$/ // 64 bytes Ed25519, base64url
const MAX_ADDRESS_LENGTH = 200
const MAX_TOKEN_LENGTH = 512

const encode = (text) => new TextEncoder().encode(text)
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const randomNonce = () => base64url.baseEncode(crypto.getRandomValues(new Uint8Array(16)))

function parseJson(text) {
    try {
        return JSON.parse(text)
    } catch {
        return undefined
    }
}

async function verifySignature(publicKey, bytes, signature) {
    if (!publicKey || typeof signature !== 'string' || !SIGNATURE.test(signature)) return false
    try {
        return await publicKey.verify(bytes, base64url.baseDecode(signature))
    } catch {
        return false
    }
}

/**
 * Signs with the key of a did:key, given its seed. The app signs with the vault's identity
 * instead (createSecretSigner of @le-space/orbitdb-identity-provider-webauthn-did, which
 * has the same shape); this one is for tests and tools that hold a seed.
 *
 * @param {Uint8Array} seed the 32-byte seed of the did:key
 * @param {string} did the DID; must belong to the seed
 * @returns {Promise<{ did: string, sign: (bytes: Uint8Array) => Promise<Uint8Array> }>}
 */
export async function createSigner(seed, did) {
    const key = await generateKeyPairFromSeed('Ed25519', seed)
    if (!publicKeyFromDid(did)?.equals(key.publicKey)) throw new Error(`this seed does not belong to ${did}`)
    return { did, sign: async (bytes) => key.sign(bytes) }
}

/** the signer's signature over `bytes`, base64url */
const signed = async (signer, bytes) => base64url.baseEncode(await signer.sign(bytes))

const messageBytes = (payload) => encode(`${MESSAGE_CONTEXT}\n${payload}`)

/**
 * A signed message, ready to publish.
 *
 * @param signer from createSigner; its DID is the sender
 * @param {{ command: string, recipient: string, data: { sharedAddress: string, invitation: object }, onBoardingToken?: string, nopingpong?: boolean }} fields
 * @returns {Promise<string>}
 */
export async function sealMessage(signer, { command, recipient, data, onBoardingToken, nopingpong }, { now = Date.now() } = {}) {
    const fields = { command, sender: signer.did, recipient, timestamp: now, nonce: randomNonce(), data }
    if (onBoardingToken !== undefined) fields.onBoardingToken = onBoardingToken
    if (nopingpong === true) fields.nopingpong = true
    const payload = JSON.stringify(fields)
    return JSON.stringify({ v: 2, payload, sig: await signed(signer, messageBytes(payload)) })
}

/** what is wrong with the shape of a message, or null */
function shapeProblem(message) {
    if (!isObject(message)) return 'not a message'
    const { command, sender, recipient, timestamp, nonce, data, onBoardingToken, nopingpong } = message
    if (command !== REQUEST_ADDRESS) return 'unknown command'
    if (!publicKeyFromDid(sender)) return 'sender is not a did:key'
    if (typeof recipient !== 'string') return 'no recipient'
    if (!Number.isSafeInteger(timestamp)) return 'no timestamp'
    if (typeof nonce !== 'string' || !NONCE.test(nonce)) return 'no nonce'
    if (!isObject(data)) return 'no data'
    const { sharedAddress, invitation } = data
    if (typeof sharedAddress !== 'string' || !sharedAddress.startsWith('/orbitdb/') || sharedAddress.length > MAX_ADDRESS_LENGTH) {
        return 'no address book'
    }
    if (!isObject(invitation)) return 'no invitation'
    if (onBoardingToken !== undefined && (typeof onBoardingToken !== 'string' || onBoardingToken.length > MAX_TOKEN_LENGTH)) {
        return 'bad invitation link'
    }
    if (nopingpong !== undefined && typeof nopingpong !== 'boolean') return 'bad nopingpong'
    return null
}

/**
 * Checks a received message. Never throws.
 *
 * @param {string} text as received
 * @param {{ me: string, now?: number }} options me: our DID
 * @returns {Promise<{ ok: true, message: object } | { ok: false, reason: string, sender?: string }>}
 *   sender: the DID the message claims to come from, for logging
 */
export async function openMessage(text, { me, now = Date.now() }) {
    if (typeof text !== 'string' || text.length > MAX_MESSAGE_LENGTH) return { ok: false, reason: 'not text or too large' }
    const envelope = parseJson(text)
    if (!isObject(envelope) || envelope.v !== 2 || typeof envelope.payload !== 'string' || typeof envelope.sig !== 'string') {
        return { ok: false, reason: 'not a signed deContact message' }
    }
    const message = parseJson(envelope.payload)
    const problem = shapeProblem(message)
    const sender = typeof message?.sender === 'string' ? message.sender : undefined
    if (problem) return { ok: false, reason: problem, sender }
    if (message.recipient !== me) return { ok: false, reason: 'not addressed to us', sender }
    if (Math.abs(now - message.timestamp) > MAX_CLOCK_SKEW_MS) return { ok: false, reason: 'too old or from the future', sender }
    if (!(await verifySignature(publicKeyFromDid(sender), messageBytes(envelope.payload), envelope.sig))) {
        return { ok: false, reason: 'signature does not match the sender', sender }
    }
    if (!(await verifyInvitation(message.data.invitation, { owner: sender, invitee: me }))) {
        return { ok: false, reason: 'invitation is not from the sender for us', sender }
    }
    return { ok: true, message }
}

/**
 * Remembers the messages we accepted for as long as openMessage would accept them again.
 *
 * @param {{ maxEntries?: number }} options
 */
export function createReplayGuard({ maxEntries = 10_000 } = {}) {
    const seen = new Map() // "sender nonce" -> timestamp, oldest first
    return {
        /** true the first time we see this message, false for a replay */
        firstTime(message, now = Date.now()) {
            for (const [id, timestamp] of seen) {
                if (now - timestamp > 2 * MAX_CLOCK_SKEW_MS) seen.delete(id)
            }
            const id = `${message.sender} ${message.nonce}`
            if (seen.has(id)) return false
            seen.set(id, message.timestamp)
            if (seen.size > maxEntries) seen.delete(seen.keys().next().value)
            return true
        }
    }
}

const tokenBytes = (inviter, { nonce, expiresAt, requestAddress }) =>
    encode(`${ONBOARDING_CONTEXT}\n${inviter}\n${nonce}\n${expiresAt}\n${requestAddress ? 1 : 0}`)

/**
 * A token for the invitation link: whoever uses it first gets our contact data without
 * us confirming (once, until it expires).
 *
 * @param signer from createSigner; its DID is the inviter
 * @param {{ requestAddress?: boolean, now?: number, ttlMs?: number }} options
 *   requestAddress: whether we ask the invitee for their contact data in return
 * @returns {Promise<{ text: string, nonce: string, expiresAt: number, requestAddress: boolean }>} text goes into the link
 */
export async function createOnboardingToken(signer, { requestAddress = true, now = Date.now(), ttlMs = ONBOARDING_TOKEN_TTL_MS } = {}) {
    const token = { nonce: randomNonce(), expiresAt: now + ttlMs, requestAddress: Boolean(requestAddress) }
    const sig = await signed(signer, tokenBytes(signer.did, token))
    return { ...token, text: ['1', token.nonce, token.expiresAt, token.requestAddress ? 1 : 0, sig].join('.') }
}

/** the parts of a token, or null */
export function parseOnboardingToken(text) {
    if (typeof text !== 'string' || text.length > MAX_TOKEN_LENGTH) return null
    const parts = text.split('.')
    if (parts.length !== 5 || parts[0] !== '1') return null
    const [, nonce, expiresAt, requestAddress, sig] = parts
    if (!NONCE.test(nonce) || !/^\d{1,15}$/.test(expiresAt) || !/^[01]$/.test(requestAddress) || !SIGNATURE.test(sig)) return null
    return { nonce, expiresAt: Number(expiresAt), requestAddress: requestAddress === '1', sig }
}

/**
 * Whether `inviter` signed this token and it has not expired. Says nothing about whether
 * it was used: that only the issuing device knows (createOnboardingTokenStore).
 *
 * @returns {Promise<{ ok: true, token: object } | { ok: false, reason: string }>}
 */
export async function verifyOnboardingToken(text, { inviter, now = Date.now() }) {
    const token = parseOnboardingToken(text)
    if (!token) return { ok: false, reason: 'is malformed' }
    if (!(await verifySignature(publicKeyFromDid(inviter), tokenBytes(inviter, token), token.sig))) {
        return { ok: false, reason: 'is not signed by us' }
    }
    if (token.expiresAt <= now) return { ok: false, reason: 'has expired' }
    return { ok: true, token }
}

/**
 * The tokens this device issued, and who used them.
 *
 * @param {{ getItem: (key: string) => string | null, setItem: (key: string, value: string) => void }} storage e.g. localStorage
 */
export function createOnboardingTokenStore(storage, key = 'onboardingTokens') {
    const load = () => {
        try {
            const tokens = JSON.parse(storage.getItem(key) ?? '{}')
            return isObject(tokens) ? tokens : {}
        } catch {
            return {}
        }
    }
    const save = (tokens, now) => {
        for (const nonce of Object.keys(tokens)) {
            if (!(tokens[nonce]?.expiresAt > now)) delete tokens[nonce]
        }
        storage.setItem(key, JSON.stringify(tokens))
    }
    return {
        /** remember a token from createOnboardingToken */
        issued({ nonce, expiresAt }, now = Date.now()) {
            const tokens = load()
            tokens[nonce] = { expiresAt }
            save(tokens, now)
        },
        /**
         * May `invitee` use this verified token? The first invitee owns it; the same
         * invitee may come back (their app resends the request until it is answered).
         */
        redeem({ nonce }, invitee, now = Date.now()) {
            const tokens = load()
            const entry = Object.hasOwn(tokens, nonce) ? tokens[nonce] : undefined
            if (!isObject(entry) || !(entry.expiresAt > now)) return { ok: false, reason: 'was not issued on this device' }
            if (entry.redeemedBy !== undefined && entry.redeemedBy !== invitee) return { ok: false, reason: 'was already used' }
            entry.redeemedBy = invitee
            save(tokens, now)
            return { ok: true }
        }
    }
}

/**
 * Accepts an invitation link token from `invitee`: signed by us, not expired, issued on
 * this device and not used by anybody else.
 *
 * @returns {Promise<{ ok: true, requestAddress: boolean } | { ok: false, reason: string }>}
 */
export async function redeemOnboardingToken(text, { inviter, invitee, store, now = Date.now() }) {
    const verified = await verifyOnboardingToken(text, { inviter, now })
    if (!verified.ok) return verified
    const redeemed = store.redeem(verified.token, invitee, now)
    return redeemed.ok ? { ok: true, requestAddress: verified.token.requestAddress } : redeemed
}
