import { createOrbitDBFor } from "#lib/identity/vault-directory.js";
import { openingOnce } from "./open-once.js";

let created // the OrbitDB being created or created for this identity and Helia node

/**
 * Starts OrbitDB with the identity of the passkey vault (#60): its Ed25519 did:key signs
 * every entry, from a keystore in memory, so no key lands in IndexedDB.
 *
 * @param signer the identity, `createSecretSigner` of the vault's root (lib/identity/vault.js)
 * @param helia the ipfs (Helia) instance to create an OrbitDB instance.
 * @returns {Promise<import('@orbitdb/core').OrbitDB>}
 */
export const getIdentityAndCreateOrbitDB = async (signer, helia) => {
    // A second instance on the same Helia node registers /orbitdb/heads/<address> again
    // when it opens a database we already hold open, which libp2p 3 refuses
    // ("Handler already registered").
    if (created?.did === signer.did && created?.helia === helia) return created.orbitdb
    // one open at a time per database: the app opens a contact's book from more than one place (open-once.js)
    const orbitdb = createOrbitDBFor(helia, signer).then(openingOnce)
    created = { did: signer.did, helia, orbitdb }
    orbitdb.catch(() => { if (created?.orbitdb === orbitdb) created = undefined })
    return orbitdb
}
