import { describe, expect, it } from 'vitest'
import { MAX_ENTRY_LENGTH, directoryName, publishRecord, recordsIn } from './vault-directory.js'
import { addPasskey, createKeeper, findIn, openWithPasskey, opensWith, serializeVaultRecord, signerOf } from './vault.js'

const record = (id) => ({ vault: { version: 1, id, slots: [{ kid: 'k' }] }, slots: [], removed: [] })

/** an OrbitDB event log in memory, newest first as OrbitDB's iterator yields */
function memoryLog() {
    const values = []
    return {
        values,
        events: { on() {}, off() {} },
        add: async (value) => values.push(value),
        async *iterator({ amount = -1 } = {}) {
            const newest = [...values].reverse()
            for (const value of amount < 0 ? newest : newest.slice(0, amount)) yield { hash: 'h', value }
        }
    }
}

function memoryStorage() {
    const items = new Map()
    return { getItem: (k) => (items.has(k) ? items.get(k) : null), setItem: (k, v) => items.set(k, String(v)), removeItem: (k) => items.delete(k) }
}
const random = (n = 32) => crypto.getRandomValues(new Uint8Array(n))
const passkey = () => ({ rawCredentialId: random(16), prfOutput: random(32) })

/** a vault with a second passkey, whose record an empty device must find */
async function vaultWithSecondPasskey() {
    const keeper = createKeeper(memoryStorage())
    const opened = await openWithPasskey(keeper, { ...passkey(), mayCreate: true })
    const second = passkey()
    const withSecond = await addPasskey(keeper, opened, second)
    return { second, text: serializeVaultRecord(withSecond.record), did: (await signerOf(opened)).did }
}

/** what anybody may append to a slot's log: copies that do not open, and records of other slots */
async function appendJunk(log, text, count) {
    for (let i = 0; i < count; i++) {
        const copy = JSON.parse(text)
        copy.vault.id = `copy-${i}`
        copy.vault.payload = { ...copy.vault.payload, ciphertext: copy.vault.payload.ciphertext.slice(0, -4) + 'AAAA' }
        await log.add(JSON.stringify(copy))
        await log.add(JSON.stringify({ vault: { version: 1, id: `other-${i}`, slots: [{ kid: 'x' }] }, slots: [], removed: [] }))
    }
}

function memoryOrbitDB() {
    const logs = new Map()
    return {
        logs,
        open: async (name, options) => {
            expect(options.type).toBe('events')
            if (!logs.has(name)) logs.set(name, memoryLog())
            return logs.get(name)
        }
    }
}

describe('the vault directory', () => {
    it('reads the records of a log newest first and leaves out anything else', async () => {
        const log = memoryLog()
        await log.add(serializeVaultRecord(record('a')))
        await log.add('not a record')
        await log.add({ an: 'object' })
        await log.add(serializeVaultRecord(record('b')))
        expect((await recordsIn(log)).map((r) => r.vault.id)).toEqual(['b', 'a'])
        expect((await recordsIn(log, { max: 1 })).map((r) => r.vault.id)).toEqual(['b'])
    })

    it('publishes a record once per slot, and again when it changed', async () => {
        const orbitdb = memoryOrbitDB()
        const opened = await publishRecord(orbitdb, ['one', 'two', 'one'], record('a'))
        expect([...orbitdb.logs.keys()]).toEqual([directoryName('one'), directoryName('two')])
        await publishRecord(orbitdb, ['one', 'two'], record('a'), opened)
        expect(orbitdb.logs.get(directoryName('one')).values).toHaveLength(1)
        await publishRecord(orbitdb, ['one'], record('b'), opened)
        expect((await recordsIn(orbitdb.logs.get(directoryName('one')))).map((r) => r.vault.id)).toEqual(['b', 'a'])
        await expect(publishRecord(orbitdb, ['one'], { not: 'a record' })).rejects.toThrow(/not a vault record/)
    })
})

describe('a lookup of the vault record', () => {
    it('finds the record that opens behind the records anybody appended after it', async () => {
        const { second, text, did } = await vaultWithSecondPasskey()
        const log = memoryLog()
        await log.add(text)
        await appendJunk(log, text, 25)
        const opens = await opensWith(second.prfOutput, second.rawCredentialId)

        // what merely has the shape of a record fills the newest places
        expect((await recordsIn(log)).every((record) => record.vault.id !== JSON.parse(text).vault.id)).toBe(true)
        // only a record that opens with the slot counts
        expect((await recordsIn(log, { opens })).map((record) => record.vault.id)).toEqual([JSON.parse(text).vault.id])

        const restored = await openWithPasskey(createKeeper(memoryStorage()), { ...second, find: findIn(async () => recordsIn(log, { opens })) })
        expect(restored.found).toBe(true)
        expect((await signerOf(restored)).did).toBe(did)
    })

    it('counts a record once, and leaves out entries far longer than a record', async () => {
        const { second, text } = await vaultWithSecondPasskey()
        const log = memoryLog()
        await log.add(text)
        await log.add(text)
        await log.add(JSON.stringify({ ...JSON.parse(text), padding: 'x'.repeat(MAX_ENTRY_LENGTH) }))
        const opens = await opensWith(second.prfOutput, second.rawCredentialId)
        expect(await recordsIn(log, { opens })).toHaveLength(1)
    })

    it('opens nothing for another passkey', async () => {
        const { text } = await vaultWithSecondPasskey()
        const log = memoryLog()
        await log.add(text)
        const stranger = passkey()
        expect(await recordsIn(log, { opens: await opensWith(stranger.prfOutput, stranger.rawCredentialId) })).toEqual([])
    })
})
