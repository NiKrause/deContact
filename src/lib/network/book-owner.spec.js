import { describe, expect, it } from 'vitest'
import * as Block from 'multiformats/block'
import * as dagCbor from '@ipld/dag-cbor'
import { sha256 } from 'multiformats/hashes/sha2'
import { base58btc } from 'multiformats/bases/base58'
import AddressBookAccessController from '@le-space/orbitdb-access-controller-decontact'
import { addressBookOwner } from './book-owner.js'

const alice = 'did:key:z6MkAliceWolkenfabrik'

/** blocks as OrbitDB writes them (dag-cbor, sha256, base58btc), in memory */
function memoryBlocks() {
    const blocks = new Map()
    return {
        get: async (hash) => blocks.get(hash),
        async put(value) {
            const { cid, bytes } = await Block.encode({ value, codec: dagCbor, hasher: sha256 })
            const hash = cid.toString(base58btc)
            blocks.set(hash, bytes)
            return hash
        }
    }
}

/** the address of a database with this manifest, its controller written as `controller` */
async function database(blocks, { type = 'documents', controller = { type: AddressBookAccessController.type, owner: alice }, prefix } = {}) {
    const controllerHash = await blocks.put(controller)
    const manifest = { name: '/myAddressBook/abc', type, accessController: `${prefix ?? `/${controller.type}/`}${controllerHash}` }
    return `/orbitdb/${await blocks.put(manifest)}`
}

describe('whose address book an address names (#59), without opening it', () => {
    it('names the owner of a deContact address book', async () => {
        const blocks = memoryBlocks()
        expect(await addressBookOwner(blocks, await database(blocks))).toBe(alice)
    })

    it('names nobody for another type of database or another controller', async () => {
        const blocks = memoryBlocks()
        expect(await addressBookOwner(blocks, await database(blocks, { type: 'events' }))).toBeUndefined()
        expect(await addressBookOwner(blocks, await database(blocks, { controller: { type: 'ipfs', write: ['*'] } }))).toBeUndefined()
        // a controller block of another kind under deContact's prefix
        expect(await addressBookOwner(blocks, await database(blocks, { controller: { type: 'ipfs', owner: alice }, prefix: `/${AddressBookAccessController.type}/` }))).toBeUndefined()
        expect(await addressBookOwner(blocks, await database(blocks, { controller: { type: AddressBookAccessController.type, owner: 42 } }))).toBeUndefined()
    })

    it('names nobody for what is not an OrbitDB address', async () => {
        const blocks = memoryBlocks()
        for (const address of ['', '/orbitdb/', '/orbitdb/not-a-cid', 'https://example.com/']) {
            expect(await addressBookOwner(blocks, address)).toBeUndefined()
        }
    })

    it('fails when a block cannot be loaded, so the request can be tried again', async () => {
        const blocks = memoryBlocks()
        const address = await database(blocks)
        await expect(addressBookOwner({ get: async () => undefined }, address)).rejects.toThrow(/block not found/)
    })
})
