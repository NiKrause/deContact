/**
 * Whose address book an OrbitDB address names, read from two small blocks without opening
 * the database: its manifest, and its access controller's (the owner is part of it, as
 * the controller writes it). A request names the address of its sender's book; the app
 * checks it this way before anything is opened or synced, and opens the book only when it
 * writes into it (p2p-operations.js answerRequest).
 */
import * as Block from 'multiformats/block'
import * as dagCbor from '@ipld/dag-cbor'
import { sha256 } from 'multiformats/hashes/sha2'
import { parseAddress } from '@orbitdb/core'
import AddressBookAccessController from '@le-space/orbitdb-access-controller-decontact'

const CONTROLLER_PREFIX = `/${AddressBookAccessController.type}/`

async function decode(bytes) {
    if (!(bytes instanceof Uint8Array)) throw new Error('block not found')
    return (await Block.decode({ bytes, codec: dagCbor, hasher: sha256 })).value
}

/**
 * The owner's DID of the deContact address book at `address`, or undefined when it is not
 * one (another type of database, another access controller, not an OrbitDB address).
 *
 * @param {{ get: (hash: string) => Promise<Uint8Array | undefined> }} blocks e.g. OrbitDB's
 *   IPFSBlockStorage of the app's Helia, with a timeout
 * @param {string} address `/orbitdb/<manifest hash>`
 * @throws when a block cannot be loaded: the request may be tried again later
 */
export async function addressBookOwner(blocks, address) {
    let hash
    try {
        hash = parseAddress(address).hash
    } catch {
        return undefined
    }
    const manifest = await decode(await blocks.get(hash))
    if (manifest?.type !== 'documents' || typeof manifest.accessController !== 'string') return undefined
    if (!manifest.accessController.startsWith(CONTROLLER_PREFIX)) return undefined
    const controller = await decode(await blocks.get(manifest.accessController.slice(CONTROLLER_PREFIX.length)))
    if (controller?.type !== AddressBookAccessController.type || typeof controller.owner !== 'string') return undefined
    return controller.owner
}
