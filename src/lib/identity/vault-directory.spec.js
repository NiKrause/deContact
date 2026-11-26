import { describe, expect, it } from 'vitest'
import { directoryName, publishRecord, recordsIn } from './vault-directory.js'
import { serializeVaultRecord } from './vault.js'

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
        expect((await recordsIn(log, 1)).map((r) => r.vault.id)).toEqual(['b'])
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
