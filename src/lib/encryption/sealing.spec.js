import { describe, expect, it } from 'vitest'
import { createSecretSigner } from '@le-space/orbitdb-identity-provider-webauthn-did'
import { deriveSubkey, rootPayload } from '@le-space/orbitdb-identity-provider-webauthn-did/vault'
import { base64url } from 'multiformats/bases/base64'
import { IDENTITY_INFO, encryptionKeysOf, signerOf } from '../identity/vault.js'
import { encryptionKeyOfDid, encryptionKeysFromSeed, isSeal, openJson, openSeal, seal, sealJson } from './sealing.js'

const bytes = (text) => new TextEncoder().encode(text)
const text = (value) => new TextDecoder().decode(value)

/** a person as the vault makes them: a root, the identity, its X25519 pair */
async function person(fill) {
    const root = new Uint8Array(32).fill(fill)
    const opened = { payload: rootPayload(root) }
    const signer = await signerOf(opened)
    const keys = await encryptionKeysOf(opened, signer.did)
    return { did: signer.did, keys }
}

const alice = await person(1)
const bob = await person(2)

describe('the X25519 pair of a did:key', () => {
    it('is the counterpart of the DID: anybody gets the public half from the DID alone', async () => {
        expect(alice.keys.publicKey).toEqual(encryptionKeyOfDid(alice.did))
        expect(alice.keys.publicKey).not.toEqual(bob.keys.publicKey)
    })

    it('comes from the seed createSecretSigner makes the identity of (the package does not change it unseen)', async () => {
        const root = crypto.getRandomValues(new Uint8Array(32))
        const signer = await createSecretSigner(root, { info: IDENTITY_INFO })
        const { publicKey } = await encryptionKeysFromSeed(await deriveSubkey(root, IDENTITY_INFO))
        expect(publicKey).toEqual(encryptionKeyOfDid(signer.did))
    })

    it('is the same for every passkey of a vault: it depends on the root only', async () => {
        expect((await person(1)).keys.publicKey).toEqual(alice.keys.publicKey)
    })

    it('refuses a seed that does not belong to the DID', async () => {
        await expect(encryptionKeysFromSeed(new Uint8Array(32).fill(9), { did: alice.did })).rejects.toThrow(/does not belong/)
    })

    it('keeps the private key inside WebCrypto', async () => {
        expect(alice.keys.privateKey.extractable).toBe(false)
        await expect(crypto.subtle.exportKey('pkcs8', alice.keys.privateKey)).rejects.toThrow()
    })

    it('has no key for what is not an Ed25519 did:key', () => {
        expect(encryptionKeyOfDid('did:key:zQ3shokFTS3brHcDQrn82RUDfCZESWL1ZdCEJwekUDPQiYBme')).toBeNull()
        expect(encryptionKeyOfDid('did:web:example.com')).toBeNull()
        expect(encryptionKeyOfDid(undefined)).toBeNull()
    })
})

describe('seal and open', () => {
    const context = 'decontact/test/v1\nsomewhere'

    it('opens for the recipient only', async () => {
        const sealed = await seal(encryptionKeyOfDid(bob.did), bytes('Bob, Example Street 1'), { context })
        expect(isSeal(sealed)).toBe(true)
        expect(text(await openSeal(bob.keys, sealed, { context }))).toBe('Bob, Example Street 1')
        await expect(openSeal(alice.keys, sealed, { context })).rejects.toThrow()
    })

    it('shows nothing of the plaintext, and never seals the same way twice', async () => {
        const recipient = encryptionKeyOfDid(bob.did)
        const one = await seal(recipient, bytes('Wolkenfabrik'), { context })
        const two = await seal(recipient, bytes('Wolkenfabrik'), { context })
        expect(JSON.stringify(one)).not.toContain('Wolkenfabrik')
        expect(one.epk).not.toBe(two.epk)
        expect(one.ct).not.toBe(two.ct)
    })

    it('does not open under another context', async () => {
        const sealed = await seal(encryptionKeyOfDid(bob.did), bytes('card'), { context })
        await expect(openSeal(bob.keys, sealed, { context: `${context}!` })).rejects.toThrow()
    })

    it('refuses what was altered or cut short', async () => {
        const sealed = await seal(encryptionKeyOfDid(bob.did), bytes('card'), { context })
        const ct = base64url.baseDecode(sealed.ct)
        ct[ct.length - 1] ^= 1
        await expect(openSeal(bob.keys, { ...sealed, ct: base64url.baseEncode(ct) }, { context })).rejects.toThrow()
        await expect(openSeal(bob.keys, { ...sealed, ct: sealed.ct.slice(0, 20) }, { context })).rejects.toThrow()
        const epk = base64url.baseDecode(sealed.epk)
        epk[0] ^= 1
        await expect(openSeal(bob.keys, { ...sealed, epk: base64url.baseEncode(epk) }, { context })).rejects.toThrow()
        await expect(openSeal(bob.keys, { v: 2, epk: sealed.epk, ct: sealed.ct }, { context })).rejects.toThrow(/Not a seal/)
    })

    it('refuses a seal whose ephemeral key is a low-order point', async () => {
        const sealed = await seal(encryptionKeyOfDid(bob.did), bytes('card'), { context })
        await expect(openSeal(bob.keys, { ...sealed, epk: base64url.baseEncode(new Uint8Array(32)) }, { context })).rejects.toThrow()
    })

    it('needs a key and a context', async () => {
        await expect(seal(new Uint8Array(31), bytes('x'), { context })).rejects.toThrow()
        await expect(seal(encryptionKeyOfDid(bob.did), bytes('x'), {})).rejects.toThrow()
    })

    it('carries JSON', async () => {
        const sealed = await sealJson(encryptionKeyOfDid(alice.did), { firstName: 'Alice' }, { context })
        expect(await openJson(alice.keys, sealed, { context })).toEqual({ firstName: 'Alice' })
    })
})
