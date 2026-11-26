/**
 * Who may write into a deContact address book (OrbitDB access controller
 * "decontact-address-book").
 *
 * - The owner - any device whose OrbitDB identity carries the owner's DID - may write
 *   anything.
 * - Anybody else may write only their own contact card: the document with the key
 *   contactKey(their DID) whose `owner` is their DID, carrying an invitation the owner
 *   signed for them with the key of the owner's did:key (createInvitation). They may
 *   also delete that card.
 *
 * The app and the relay register the same controller, so both accept the same entries
 * (src/relay.js; orbitdb-relay: RELAY_ACCESS_CONTROLLERS). Runs in the browser and in
 * Node: no Node built-ins.
 */
import * as Block from 'multiformats/block'
import * as dagCbor from '@ipld/dag-cbor'
import { sha256 } from 'multiformats/hashes/sha2'
import { base58btc } from 'multiformats/bases/base58'
import { base64url } from 'multiformats/bases/base64'
import { generateKeyPairFromSeed, publicKeyFromRaw } from '@libp2p/crypto/keys'
import { ComposedStorage, IPFSBlockStorage, LRUStorage } from '@orbitdb/core'

export const type = 'decontact-address-book'

const INVITATION_CONTEXT = 'decontact/invitation/v1'
const ED25519_PUBLIC_KEY_PREFIX = [0xed, 0x01] // multicodec ed25519-pub

/** the key of somebody's own contact card in another person's address book */
export const contactKey = (did) => `contact:${did}`

const invitationBytes = (owner, invitee) => new TextEncoder().encode(`${INVITATION_CONTEXT}\n${owner}\n${invitee}`)

/** the Ed25519 public key inside a did:key, or null */
export function publicKeyFromDid(did) {
    if (typeof did !== 'string' || !did.startsWith('did:key:z')) return null
    try {
        const bytes = base58btc.decode(did.slice('did:key:'.length))
        if (bytes.length !== 34 || bytes[0] !== ED25519_PUBLIC_KEY_PREFIX[0] || bytes[1] !== ED25519_PUBLIC_KEY_PREFIX[1]) return null
        return publicKeyFromRaw(bytes.slice(2))
    } catch {
        return null
    }
}

/** a signer for a 32-byte Ed25519 seed, in the shape of `{ did, sign }` below */
async function signerOfSeed(seed) {
    const key = await generateKeyPairFromSeed('Ed25519', seed)
    const did = `did:key:${base58btc.encode(new Uint8Array([...ED25519_PUBLIC_KEY_PREFIX, ...key.publicKey.raw]))}`
    return { did, sign: (bytes) => key.sign(bytes) }
}

/**
 * The owner invites `invitee` to write their contact card into the owner's address books.
 *
 * @param {{ did: string, sign: (bytes: Uint8Array) => Promise<Uint8Array> } | Uint8Array} signer
 *   the key of the owner's did:key: a signer whose DID is the owner's (e.g. `createSecretSigner`
 *   of @le-space/orbitdb-identity-provider-webauthn-did), or the key's 32-byte seed
 * @param {string} owner the owner's DID
 * @param {string} invitee the invitee's DID
 */
export async function createInvitation(signer, owner, invitee) {
    const key = signer instanceof Uint8Array ? await signerOfSeed(signer) : signer
    if (typeof key?.sign !== 'function' || key.did !== owner) throw new Error(`this key does not belong to ${owner}`)
    const signature = await key.sign(invitationBytes(owner, invitee))
    return { v: 1, owner, invitee, sig: base64url.encode(signature) }
}

/** whether `invitation` is the owner's signed invitation for `invitee` */
export async function verifyInvitation(invitation, { owner, invitee }) {
    if (invitation?.v !== 1 || invitation.owner !== owner || invitation.invitee !== invitee || typeof invitation.sig !== 'string') {
        return false
    }
    const publicKey = publicKeyFromDid(owner)
    if (!publicKey) return false
    try {
        return await publicKey.verify(invitationBytes(owner, invitee), base64url.decode(invitation.sig))
    } catch {
        return false
    }
}

/**
 * The rule itself: may `writer` append this operation to `owner`'s address book?
 * (The writer's identity is verified separately.)
 */
export async function mayWrite({ owner, writer, payload }) {
    if (writer === owner) return true
    const { op, key, value } = payload ?? {}
    if (key !== contactKey(writer)) return false
    if (op === 'DEL') return true
    if (op !== 'PUT' || value?._id !== key || value?.owner !== writer) return false
    return verifyInvitation(value.invitation, { owner, invitee: writer })
}

/**
 * @param {{ owner?: string, storage?: any }} options owner: DID of the owner, defaults to the creating identity's
 */
const AddressBookAccessController = ({ owner, storage } = {}) => async ({ orbitdb, identities, address }) => {
    storage = storage || await ComposedStorage(
        await LRUStorage({ size: 1000 }),
        await IPFSBlockStorage({ ipfs: orbitdb.ipfs, pin: true })
    )

    if (address) {
        const bytes = await storage.get(address.replace(`/${type}/`, ''))
        const { value } = await Block.decode({ bytes, codec: dagCbor, hasher: sha256 })
        owner = value.owner
    } else {
        owner = owner || orbitdb.identity.id
        const { cid, bytes } = await Block.encode({ value: { type, owner }, codec: dagCbor, hasher: sha256 })
        const hash = cid.toString(base58btc)
        await storage.put(hash, bytes)
        address = `/${type}/${hash}`
    }

    const canAppend = async (entry) => {
        const writer = await identities.getIdentity(entry.identity)
        if (!writer) return false
        if (!(await mayWrite({ owner, writer: writer.id, payload: entry.payload }))) return false
        return identities.verifyIdentity(writer)
    }

    return { type, address, owner, canAppend }
}

AddressBookAccessController.type = type

export default AddressBookAccessController
