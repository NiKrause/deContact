/**
 * Where an empty device finds the vault record: an OrbitDB event log per slot, named after
 * the slot's lookup id (vault.js `lookupIdOf`), which the relay replicates like every
 * database a browser opens.
 *
 * - The record is public (vault.js), so the log may be too. Its name says nothing of the
 *   slot: the lookup id is derived from the slot's secret, so only the holder of the
 *   passkey or the words - or the device that gave it its slot - can name it.
 * - Anybody may append (IPFSAccessController, write '*'): before the vault is open the
 *   reader knows no DID to check a writer against. What protects the vault is the vault
 *   itself: a record that does not open with the slot's key is passed over, and one that
 *   opens was made by a holder of the vault key.
 * - So a lookup counts only the records that open with the slot (vault.js `opensWith`),
 *   newest first, and looks at many more entries than it keeps: entries that merely have
 *   the shape of a record cannot crowd out the one that opens. The keeper takes the
 *   latest generation among them.
 *
 * Before the vault is open there is no identity to run OrbitDB with, so a lookup runs on
 * an OrbitDB of its own, with a throwaway identity in memory, and stops it before the
 * app's OrbitDB starts (two instances must not hold one database open at once: libp2p
 * refuses a second handler for its heads protocol).
 */
import { IPFSAccessController, Identities, createOrbitDB, useIdentityProvider } from '@orbitdb/core'
import {
    OrbitDBWebAuthnIdentityProviderFunction,
    createSecretSigner,
    createSessionKeystore
} from '@le-space/orbitdb-identity-provider-webauthn-did'
import { isVaultRecord, parseVaultRecord, serializeVaultRecord } from './vault.js'

/** the OrbitDB directory the app uses, so that what a lookup fetched is there for the app */
export const ORBITDB_DIRECTORY = './deContact'
/** records a lookup keeps, newest first */
const MAX_RECORDS = 20
/** entries a lookup looks at, at most: anybody may append, so a log may hold any number */
export const MAX_SCANNED = 5_000
/** a published record holds a few slots, about a kilobyte; anything much longer is not one */
export const MAX_ENTRY_LENGTH = 16 * 1024

export const directoryName = (lookupId) => `decontact-vault/${lookupId}`

const open = (orbitdb, lookupId) =>
    orbitdb.open(directoryName(lookupId), {
        type: 'events',
        sync: true,
        AccessController: IPFSAccessController({ write: ['*'] })
    })

/**
 * The records in a log, newest first, each once; anything that is not a record is left
 * out, and with `opens` anything that does not open with the slot.
 *
 * @param {{ max?: number, scan?: number, opens?: (record: object) => Promise<boolean> }} options
 *   max: records kept; scan: entries looked at; opens: from vault.js `opensWith`
 */
export async function recordsIn(db, { max = MAX_RECORDS, scan = MAX_SCANNED, opens } = {}) {
    const records = []
    const seen = new Set()
    if (max < 1) return records
    for await (const { value } of db.iterator({ amount: scan })) {
        if (typeof value !== 'string' || value.length > MAX_ENTRY_LENGTH || seen.has(value)) continue
        seen.add(value)
        const record = parseVaultRecord(value)
        if (!record || (opens && !(await opens(record)))) continue
        records.push(record)
        if (records.length >= max) break
    }
    return records
}

/**
 * Waits for what the network has of this log: at most `timeoutMs` while nothing is here,
 * at most `graceMs` once something is.
 */
function settle(db, { timeoutMs, graceMs, opens }) {
    return new Promise((resolve) => {
        let timer
        const done = () => {
            clearTimeout(timer)
            db.events.off('update', onUpdate)
            db.events.off('join', onJoin)
            resolve()
        }
        const onUpdate = () => {
            clearTimeout(timer)
            timer = setTimeout(done, 500) // a burst of entries comes together
        }
        // a peer (usually the relay) exchanged heads with us: what it has arrives as
        // updates right after; when it has nothing, there is no point waiting much longer
        const onJoin = (peerId, heads) => {
            clearTimeout(timer)
            timer = setTimeout(done, heads?.length ? 500 : 1_500)
        }
        db.events.on('update', onUpdate)
        db.events.on('join', onJoin)
        recordsIn(db, { max: 1, opens }).then((here) => {
            clearTimeout(timer)
            timer = setTimeout(done, here.length > 0 ? graceMs : timeoutMs)
        })
    })
}

let providerRegistered = false
/** verifying a writer of any of deContact's databases needs the provider's identity type */
export function registerIdentityProvider() {
    if (providerRegistered) return
    useIdentityProvider(OrbitDBWebAuthnIdentityProviderFunction)
    providerRegistered = true
}

/**
 * An OrbitDB for the identity `signer`, with its key in memory only: the keystore serves
 * the signer, which keeps its key inside `sign`, so nothing lands in IndexedDB.
 */
export async function createOrbitDBFor(helia, signer, directory = ORBITDB_DIRECTORY) {
    registerIdentityProvider()
    const keystore = await createSessionKeystore({ signer })
    const identities = await Identities({ ipfs: helia, keystore })
    const identity = await identities.createIdentity({ provider: OrbitDBWebAuthnIdentityProviderFunction({ signer }) })
    return createOrbitDB({ ipfs: helia, identity, identities, directory })
}

/**
 * The records published for one slot, newest first.
 *
 * @param {import('helia').Helia} helia a started node
 * @param {string} lookupId from `lookupIdOf`
 * @param {{ timeoutMs?: number, graceMs?: number, opens?: (record: object) => Promise<boolean> }} options
 *   how long to wait for the network when nothing is here yet, and once something is;
 *   opens: only records that open with the slot count (vault.js `opensWith`)
 */
export async function lookUpRecords(helia, lookupId, { timeoutMs = 20_000, graceMs = 2_000, opens } = {}) {
    const reader = await createSecretSigner(crypto.getRandomValues(new Uint8Array(32)), { info: 'decontact/vault-lookup/v1' })
    const orbitdb = await createOrbitDBFor(helia, reader)
    try {
        const db = await open(orbitdb, lookupId)
        try {
            await settle(db, { timeoutMs, graceMs, opens })
            return await recordsIn(db, { opens })
        } finally {
            await db.close()
        }
    } finally {
        await orbitdb.stop()
    }
}

/** the record as it is published: canonical, so that the same record is published once */
const published = (record) => serializeVaultRecord(record)

/**
 * Publishes the record for these slots. The logs stay open, so the relay keeps them and
 * other devices find the record while this one is offline.
 *
 * @param {import('@orbitdb/core').OrbitDB} orbitdb the app's
 * @param {Iterable<string>} lookupIds
 * @param {object} record the keeper's record
 * @param {Map<string, object>} [opened] logs opened before, by lookup id
 */
export async function publishRecord(orbitdb, lookupIds, record, opened = new Map()) {
    if (!isVaultRecord(record)) throw new TypeError('not a vault record')
    const text = published(record)
    for (const lookupId of new Set(lookupIds)) {
        let db = opened.get(lookupId)
        if (!db) {
            db = await open(orbitdb, lookupId)
            db.events.on('error', (error) => console.log(`sync error on the vault directory:`, error?.message))
            opened.set(lookupId, db)
        }
        const [latest] = await recordsIn(db, { max: 1 })
        if (latest && published(latest) === text) continue
        await db.add(text)
        console.log(`published the vault record in ${db.address}`)
    }
    return opened
}
