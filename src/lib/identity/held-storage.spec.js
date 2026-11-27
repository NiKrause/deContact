import { describe, expect, it } from 'vitest'
import { createHeldStorage } from './held-storage.js'

function memoryStorage(entries = {}) {
    const items = new Map(Object.entries(entries))
    return {
        getItem: (key) => (items.has(key) ? items.get(key) : null),
        setItem: (key, value) => items.set(key, String(value)),
        removeItem: (key) => items.delete(key),
        items
    }
}

describe('held storage (#97)', () => {
    it('passes everything through until it holds', () => {
        const backing = memoryStorage()
        const storage = createHeldStorage(backing)
        storage.setItem('a', '1')
        expect(backing.getItem('a')).toBe('1')
        expect(storage.getItem('a')).toBe('1')
        storage.removeItem('a')
        expect(backing.getItem('a')).toBeNull()
        expect(storage.holding).toBe(false)
    })

    it('while held, writes nothing and reads only what it holds', () => {
        const backing = memoryStorage({ 'decontact.exchanges.v1': '{"did:key:old":{}}' })
        const storage = createHeldStorage(backing)
        storage.hold()
        expect(storage.holding).toBe(true)
        // what the browser kept belongs to no identity of this page
        expect(storage.getItem('decontact.exchanges.v1')).toBeNull()
        storage.setItem('decontact.exchanges.v1', '{"did:key:alice":{}}')
        storage.setItem('onboardingTokens', '{}')
        storage.removeItem('onboardingTokens')
        expect(storage.getItem('decontact.exchanges.v1')).toBe('{"did:key:alice":{}}')
        expect(storage.getItem('onboardingTokens')).toBeNull()
        expect([...backing.items]).toEqual([['decontact.exchanges.v1', '{"did:key:old":{}}']])
    })

    it('keep writes what was held, then passes through again', () => {
        const backing = memoryStorage({ gone: 'x' })
        const storage = createHeldStorage(backing)
        storage.hold()
        storage.setItem('decontact.exchanges.v1', 'held')
        storage.removeItem('gone')
        storage.keep()
        expect(storage.holding).toBe(false)
        expect(backing.getItem('decontact.exchanges.v1')).toBe('held')
        expect(backing.getItem('gone')).toBeNull()
        storage.setItem('later', '2')
        expect(backing.getItem('later')).toBe('2')
    })

    it('a second hold keeps what is held; keep without hold does nothing', () => {
        const backing = memoryStorage()
        const storage = createHeldStorage(backing)
        storage.keep()
        storage.hold()
        storage.setItem('a', '1')
        storage.hold()
        expect(storage.getItem('a')).toBe('1')
        storage.keep()
        expect(backing.getItem('a')).toBe('1')
    })
})
