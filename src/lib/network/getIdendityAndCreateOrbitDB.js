import { convertTo32BitSeed } from "../../utils/utils.js";
import createIdentityProvider from "$lib/network/identityProvider.js";
import { createOrbitDB } from "@orbitdb/core";
import {CONTENT_TOPIC} from "$lib/network/p2p-operations.js";

/**
 * From a seed generate an identity and start an OrbitDB instance
 *
 * @param type {string} [type='ed25519'] default or 'ethereum' for web3/Metamask support
 * @param masterseed {string} our 64bit masterseed generated from the seedPhrase
 * @param helia the ipfs (Helia) instance to create an OrbitDB instance.
 *
 * @returns {Promise<{import('@orbitdb/core').OrbitDB}>}
 */
let created // the OrbitDB being created or created for this seed and Helia node

export const getIdentityAndCreateOrbitDB = async (type='ed25519', masterseed, helia) => {
    // startNetwork() and the layout both ask for OrbitDB. A second instance on the same
    // Helia node registers /orbitdb/heads/<address> again when it opens a database we
    // already hold open, which libp2p 3 refuses ("Handler already registered").
    if (created?.type === type && created?.masterseed === masterseed && created?.helia === helia) {
        return created.orbitdb
    }
    const orbitdb = createIdentityAndOrbitDB(type, masterseed, helia)
    created = { type, masterseed, helia, orbitdb }
    orbitdb.catch(() => { if (created?.orbitdb === orbitdb) created = undefined })
    return orbitdb
}

const createIdentityAndOrbitDB = async (type, masterseed, helia) => {
    const identitySeed = convertTo32BitSeed(masterseed)
    const idProvider = await createIdentityProvider(type, identitySeed, helia)
    const _ourIdentity = idProvider.identity
    const _identities = idProvider.identities
    const orbitdb = await createOrbitDB({
        ipfs: helia,
        identity: _ourIdentity,
        identities: _identities,
        directory: './deContact' })
    const ourContentTopic = CONTENT_TOPIC+"/"+orbitdb.identity.id
    helia.libp2p.services.pubsub.subscribe(ourContentTopic)
    return orbitdb
}
