/**
 * Contact requests between deContact users and the one-time invitation links behind the
 * QR code. Pure functions and small stores without app state (contact-messages.spec.js).
 *
 * Messages (gossipsub topic CONTENT_TOPIC/<recipient DID>):
 * - signed with the sender's did:key, the Ed25519 key the DID is made of (the identity of
 *   the sender's passkey vault, lib/identity/vault.js), so nobody else can send a request
 *   in the sender's name;
 * - then sealed to the recipient (#59, finding 3 of #58): to the X25519 counterpart of
 *   their did:key (lib/encryption/sealing.js). A peer on the topic sees that something was
 *   sent to the recipient, not who sent it, the sender's book or name. Signed inside the
 *   seal, and the signature names the recipient, so a request sealed again for somebody
 *   else is dropped there;
 * - the sender's name travels inside (`from`): the recipient cannot read the sender's
 *   book, which is sealed to its owner;
 * - recipient, timestamp and a random nonce are inside the signature: a receiver drops
 *   messages for somebody else, messages outside MAX_CLOCK_SKEW_MS and messages it has
 *   seen before (createReplayGuard);
 * - anything that does not have the expected shape is dropped (openMessage never throws).
 *
 * Invitation links (onboarding tokens):
 * - signed by the inviter over a random nonce, an expiry and the "two-way exchange" choice
 *   (#86): whether the invitee may share their own card back;
 * - the device that issued a token remembers it; the first invitee who uses it owns it,
 *   everybody else is asked for (createOnboardingTokenStore). A token from another device,
 *   a used, expired or forged token means: ask the user to confirm.
 *
 * The two-way exchange (#86). The invitee may write into the inviter's book only with an
 * invitation the inviter signed for the invitee's DID, which the inviter cannot sign before
 * the invitee's first request. So:
 * - the invitee's request carries the token and, when the token allows a two-way exchange,
 *   `twoWay: true`: "send me an invitation into your book, in case I share my card";
 * - the inviter's device, for its own valid token that allows it and the token's first
 *   invitee, answers without asking: a request with its invitation, `nopingpong: true` and
 *   the same `onBoardingToken`, which tells the invitee which link it answers. It writes no
 *   placeholder into its own book and does not resend: the invitee resends until it has
 *   what it needs;
 * - the invitee alone decides whether to use the invitation (exchanges.js).
 */
import { generateKeyPairFromSeed } from '@libp2p/crypto/keys'
import { base64url } from 'multiformats/bases/base64'
import { publicKeyFromDid, verifyInvitation } from '@le-space/orbitdb-access-controller-decontact'
import { encryptionKeyOfDid, isSeal, openSeal, seal } from '../encryption/sealing.js'
import { isThumbnail } from '../photo/photo.js'

export const REQUEST_ADDRESS = 'REQUEST_ADDRESS'

/** a request is well below 2 KiB; anything much larger is not one of ours */
export const MAX_MESSAGE_LENGTH = 16 * 1024
/** a sealed request: the signed one in base64url, and the seal around it */
export const MAX_SEALED_LENGTH = 24 * 1024
/** how far a message's timestamp may be from our clock (gossipsub delivers at once) */
export const MAX_CLOCK_SKEW_MS = 10 * 60 * 1000
/** how long an invitation link can be used */
export const ONBOARDING_TOKEN_TTL_MS = 24 * 60 * 60 * 1000

const MESSAGE_CONTEXT = 'decontact/message/v2'
/** what a request is sealed under: for one recipient */
const REQUEST_SEAL_CONTEXT = 'decontact/request/v1'
/** the fields of the sender's card a request carries, so the recipient knows who asks */
export const FROM_FIELDS = ['firstName', 'lastName', 'city']
const MAX_NAME_LENGTH = 200
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

const requestContext = (recipient) => `${REQUEST_SEAL_CONTEXT}\n${recipient}`

/** the sender's name for the recipient's dialog: only FROM_FIELDS, only text */
function fromOf(card) {
    if (!isObject(card)) return undefined
    const from = {}
    for (const field of FROM_FIELDS) {
        if (typeof card[field] === 'string' && card[field] !== '') from[field] = card[field].slice(0, MAX_NAME_LENGTH)
    }
    return Object.keys(from).length > 0 ? from : undefined
}

/**
 * A signed message sealed to its recipient, ready to publish.
 *
 * @param signer from createSigner; its DID is the sender
 * @param {{ command: string, recipient: string, data: { sharedAddress: string, invitation: object }, from?: object, photo?: string, onBoardingToken?: string, nopingpong?: boolean, twoWay?: boolean, resentOf?: number }} fields
 *   from: the sender's card; only its name (FROM_FIELDS) goes along;
 *   photo: a thumbnail of the sender's card photo (photo.js thumbnailOf), at the top level and
 *   not in `from`, whose fields an older app checks and would refuse the whole request for;
 *   resentOf: this repeats our request of that timestamp (answered.js); an older app ignores it;
 *   twoWay: with an onBoardingToken, ask the inviter for an invitation into their book
 * @returns {Promise<string>}
 */
export async function sealMessage(signer, { command, recipient, data, from, photo, onBoardingToken, nopingpong, twoWay, resentOf }, { now = Date.now() } = {}) {
    const recipientKey = encryptionKeyOfDid(recipient)
    if (!recipientKey) throw new Error(`${recipient} is not a did:key we can seal to`)
    if (twoWay === true && onBoardingToken === undefined) throw new Error('a two-way exchange needs an invitation link')
    const fields = { command, sender: signer.did, recipient, timestamp: now, nonce: randomNonce(), data }
    const name = fromOf(from)
    if (name) fields.from = name
    if (isThumbnail(photo)) fields.photo = photo
    if (onBoardingToken !== undefined) fields.onBoardingToken = onBoardingToken
    if (nopingpong === true) fields.nopingpong = true
    if (twoWay === true) fields.twoWay = true
    if (resentOf !== undefined) fields.resentOf = resentOf
    const payload = JSON.stringify(fields)
    const signedText = JSON.stringify({ v: 2, payload, sig: await signed(signer, messageBytes(payload)) })
    return JSON.stringify({ v: 3, sealed: await seal(recipientKey, encode(signedText), { context: requestContext(recipient) }) })
}

/** what is wrong with the shape of a message, or null */
function shapeProblem(message) {
    if (!isObject(message)) return 'not a message'
    const { command, sender, recipient, timestamp, nonce, data, onBoardingToken, nopingpong, twoWay, resentOf } = message
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
    if (twoWay !== undefined && typeof twoWay !== 'boolean') return 'bad twoWay'
    if (twoWay === true && onBoardingToken === undefined) return 'two-way exchange without an invitation link'
    if (resentOf !== undefined && (!Number.isSafeInteger(resentOf) || resentOf > timestamp)) return 'bad resentOf'
    const { from } = message
    if (from !== undefined) {
        if (!isObject(from)) return 'bad name'
        for (const [field, value] of Object.entries(from)) {
            if (!FROM_FIELDS.includes(field) || typeof value !== 'string' || value.length > MAX_NAME_LENGTH) return 'bad name'
        }
    }
    return null
}

/** the signed message inside a sealed one, or why there is none */
async function unseal(text, { me, keys }) {
    if (typeof text !== 'string' || text.length > MAX_SEALED_LENGTH) return { reason: 'not text or too large' }
    const outer = parseJson(text)
    if (!isObject(outer) || outer.v !== 3 || !isSeal(outer.sealed)) return { reason: 'not a sealed deContact message' }
    if (!keys) return { reason: 'no key to open it' }
    try {
        const bytes = await openSeal(keys, outer.sealed, { context: requestContext(me) })
        return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
    } catch {
        return { reason: 'not sealed for us' }
    }
}

/**
 * Checks a received message. Never throws.
 *
 * @param {string} text as received
 * @param {{ me: string, keys?: { publicKey: Uint8Array, privateKey: CryptoKey }, now?: number }} options
 *   me: our DID; keys: our X25519 pair (vault.js `encryptionKeysOf`)
 * @returns {Promise<{ ok: true, message: object } | { ok: false, reason: string, sender?: string }>}
 *   sender: the DID the message claims to come from, for logging
 */
export async function openMessage(text, { me, keys, now = Date.now() }) {
    const unsealed = await unseal(text, { me, keys })
    if (unsealed.reason) return { ok: false, reason: unsealed.reason }
    return openSigned(unsealed.text, { me, now })
}

/** the checks of a signed message, once unsealed */
async function openSigned(text, { me, now }) {
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
    // a photo we do not show (too large, not WebP or JPEG, not a data URL) goes; the request stays
    if (message.photo !== undefined && !isThumbnail(message.photo)) delete message.photo
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

// the last field was called "request address" before #86; the token format is the same
const tokenBytes = (inviter, { nonce, expiresAt, twoWay }) =>
    encode(`${ONBOARDING_CONTEXT}\n${inviter}\n${nonce}\n${expiresAt}\n${twoWay ? 1 : 0}`)

/**
 * A token for the invitation link: whoever uses it first gets our contact data without
 * us confirming (once, until it expires).
 *
 * @param signer from createSigner; its DID is the inviter
 * @param {{ twoWay?: boolean, now?: number, ttlMs?: number }} options
 *   twoWay: whether the invitee may share their contact data with us in return (#86)
 * @returns {Promise<{ text: string, nonce: string, expiresAt: number, twoWay: boolean }>} text goes into the link
 */
export async function createOnboardingToken(signer, { twoWay = true, now = Date.now(), ttlMs = ONBOARDING_TOKEN_TTL_MS } = {}) {
    const token = { nonce: randomNonce(), expiresAt: now + ttlMs, twoWay: Boolean(twoWay) }
    const sig = await signed(signer, tokenBytes(signer.did, token))
    return { ...token, text: ['1', token.nonce, token.expiresAt, token.twoWay ? 1 : 0, sig].join('.') }
}

/** the parts of a token, or null */
export function parseOnboardingToken(text) {
    if (typeof text !== 'string' || text.length > MAX_TOKEN_LENGTH) return null
    const parts = text.split('.')
    if (parts.length !== 5 || parts[0] !== '1') return null
    const [, nonce, expiresAt, twoWay, sig] = parts
    if (!NONCE.test(nonce) || !/^\d{1,15}$/.test(expiresAt) || !/^[01]$/.test(twoWay) || !SIGNATURE.test(sig)) return null
    return { nonce, expiresAt: Number(expiresAt), twoWay: twoWay === '1', sig }
}

/**
 * Whether `inviter` signed this token and it has not expired. Says nothing about whether
 * it was used: that only the issuing device knows (createOnboardingTokenStore). The
 * invitee checks it too, against the DID in the link, to learn whether it may share back.
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
        /**
         * remember a token from createOnboardingToken, and the circle chosen for it (#100):
         * on this device only, not in the link; '' is the whole card
         */
        issued({ nonce, expiresAt, circle }, now = Date.now()) {
            const tokens = load()
            tokens[nonce] = typeof circle === 'string' ? { expiresAt, circle } : { expiresAt }
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
            return { ok: true, circle: typeof entry.circle === 'string' ? entry.circle : undefined }
        }
    }
}

/**
 * Accepts an invitation link token from `invitee`: signed by us, not expired, issued on
 * this device and not used by anybody else.
 *
 * @returns {Promise<{ ok: true, twoWay: boolean, circle?: string, expiresAt: number } | { ok: false, reason: string }>}
 *   twoWay: whether the token allows a two-way exchange; circle: the one chosen for it (#100);
 *   expiresAt: when it stops working
 */
export async function redeemOnboardingToken(text, { inviter, invitee, store, now = Date.now() }) {
    const verified = await verifyOnboardingToken(text, { inviter, now })
    if (!verified.ok) return verified
    const redeemed = store.redeem(verified.token, invitee, now)
    return redeemed.ok ? { ok: true, twoWay: verified.token.twoWay, circle: redeemed.circle, expiresAt: verified.token.expiresAt } : redeemed
}
