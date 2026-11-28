import { describe, expect, it } from 'vitest'
import { openingOnce } from './open-once.js'

/** an OrbitDB whose open takes a moment and refuses a second open of a database under way, as libp2p does */
function slowOrbitDB() {
    const opening = new Set()
    const calls = []
    return {
        calls,
        async open(address) {
            calls.push(address)
            if (opening.has(address)) throw new Error(`Handler already registered for protocol /orbitdb/heads${address}`)
            opening.add(address)
            await new Promise((resolve) => setTimeout(resolve, 10))
            opening.delete(address)
            return { address }
        }
    }
}

describe('opening a database from more than one place', () => {
    it('shares an open under way: one open, the same database for both', async () => {
        const orbitdb = openingOnce(slowOrbitDB())
        const [a, b] = await Promise.all([orbitdb.open('/orbitdb/zdpuAlice'), orbitdb.open('/orbitdb/zdpuAlice')])
        expect(a).toBe(b)
        expect(orbitdb.calls).toEqual(['/orbitdb/zdpuAlice'])
    })

    it('opens other databases at once, and asks OrbitDB again once an open is done', async () => {
        const orbitdb = openingOnce(slowOrbitDB())
        await Promise.all([orbitdb.open('/orbitdb/zdpuAlice'), orbitdb.open('/orbitdb/zdpuBob')])
        await orbitdb.open('/orbitdb/zdpuAlice')
        expect(orbitdb.calls).toEqual(['/orbitdb/zdpuAlice', '/orbitdb/zdpuBob', '/orbitdb/zdpuAlice'])
        // wrapped once, however often asked
        expect(openingOnce(orbitdb).open).toBe(orbitdb.open)
    })

    it('a failed open fails for everybody waiting on it, and the next one tries again', async () => {
        let fail = true
        const orbitdb = openingOnce({ open: async (address) => { if (fail) throw new Error('no peer has it'); return { address } } })
        await expect(Promise.all([orbitdb.open('/orbitdb/zdpuAlice'), orbitdb.open('/orbitdb/zdpuAlice')])).rejects.toThrow('no peer has it')
        fail = false
        await expect(orbitdb.open('/orbitdb/zdpuAlice')).resolves.toEqual({ address: '/orbitdb/zdpuAlice' })
    })
})
