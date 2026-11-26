/**
 * The passkey prompts: registering a passkey and reading its PRF output. Each prompt is a
 * touch, so a flow asks as few as it can (one to unlock, two to create) and announces
 * every prompt after the first with `withPasskeySteps` (the app shows
 * `<passkey-step-dialog>`).
 *
 * Every read asks the same PRF input, the one the provider computes for this relying
 * party (`prfInputForRelyingParty`): the same passkey then answers with the same output
 * on every device, which is what makes it open the same vault everywhere.
 */
import {
    PrfUnavailableError,
    WebAuthnAuthenticationError,
    WebAuthnDIDProvider,
    beforePasskeyCeremony,
    prfInputForRelyingParty,
    readPrfOutput
} from '@le-space/orbitdb-identity-provider-webauthn-did'

const sameBytes = (a, b) => a.length === b.length && a.every((byte, i) => byte === b[i])

/** whether this browser can register passkeys at all */
export function passkeysSupported() {
    return WebAuthnDIDProvider.isSupported()
}

/**
 * A new passkey for deContact (one prompt). Its PRF output is read separately
 * (`readPasskeyPrf`): an authenticator need not answer PRF while registering.
 *
 * @param {{ label?: string }} options label: the name the passkey picker shows
 * @returns {Promise<{ rawCredentialId: Uint8Array, credentialId: string, prfInput?: Uint8Array }>}
 */
export async function createPasskey({ label = 'deContact' } = {}) {
    const credential = await WebAuthnDIDProvider.createCredential({
        userId: label,
        displayName: 'deContact',
        discoverableCredentials: true
    })
    return { rawCredentialId: credential.rawCredentialId, credentialId: credential.credentialId, prfInput: credential.prfInput }
}

/**
 * The PRF output of this one passkey (one prompt, naming it). Another passkey of the
 * site cannot answer in its place.
 */
export async function readPasskeyPrf(credential) {
    return readPrfOutput(credential)
}

/**
 * The PRF output of whichever passkey the person picks (one prompt). `allow` limits the
 * choice to these credentials; empty, every passkey of this site may answer - how an
 * empty device learns which passkey it has.
 *
 * @param {{ allow?: Uint8Array[] }} options
 * @returns {Promise<{ rawCredentialId: Uint8Array, prfOutput: Uint8Array }>}
 * @throws {PrfUnavailableError} when the passkey answers without a PRF output
 */
export async function discoverPasskeyPrf({ allow = [] } = {}) {
    const rpId = globalThis.location.hostname
    const input = await prfInputForRelyingParty(rpId)
    await beforePasskeyCeremony('prf')
    const assertion = await navigator.credentials.get({
        publicKey: {
            challenge: crypto.getRandomValues(new Uint8Array(32)),
            rpId,
            userVerification: 'required',
            ...(allow.length ? { allowCredentials: allow.map((id) => ({ id, type: 'public-key' })) } : {}),
            extensions: { prf: { eval: { first: input } } }
        }
    })
    const rawCredentialId = new Uint8Array(assertion.rawId)
    if (allow.length && !allow.some((id) => sameBytes(id, rawCredentialId))) {
        throw new WebAuthnAuthenticationError('A passkey answered that was not asked')
    }
    const first = assertion.getClientExtensionResults?.()?.prf?.results?.first
    if (!first) throw new PrfUnavailableError('The authenticator answered without a PRF output')
    return { rawCredentialId, prfOutput: new Uint8Array(first) }
}

/** what to tell the person when a passkey prompt failed */
export function passkeyProblem(error) {
    if (error?.name === 'NotAllowedError') return 'The passkey prompt was cancelled or timed out.'
    if (error?.name === 'PasskeyStepCancelled') return 'Cancelled.'
    if (error instanceof PrfUnavailableError || error?.code === 'PRF_UNAVAILABLE') {
        return 'This passkey cannot derive a secret (no PRF support). Use another passkey, a password manager or a security key with PRF.'
    }
    switch (error?.code) {
        case 'VAULT_SLOT_REMOVED':
            return 'This passkey was removed from the address book kept here.'
        case 'VAULT_LOCKED':
            return 'This key does not open the address book.'
        case 'VAULT_SLOT_EXISTS':
            return 'This passkey already opens an address book here.'
        case 'VAULT_SLOT_IN_USE':
            return error.message
        case 'VAULT_STORE_UNREADABLE':
            return 'The vault kept in this browser cannot be read; it was left as it is.'
    }
    return error?.message ?? String(error)
}
