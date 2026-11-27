import { describe, expect, it } from 'vitest'
import { answeredBefore } from './answered.js'

// timestamps by the sender's clock: their request, and the one we answered
const request = 1_767_225_600_000

describe('a resent request we answered asks nobody again', () => {
    it('drops a resend of the request we answered, or of an earlier one', () => {
        expect(answeredBefore({ resentOf: request, answered: request })).toBe(true)
        // we answered a resend of it, which came first because the request itself was lost
        expect(answeredBefore({ resentOf: request, answered: request + 10_000 })).toBe(true)
    })

    it('asks for a request made anew: it names no request it repeats', () => {
        expect(answeredBefore({ resentOf: undefined, answered: request })).toBe(false)
    })

    it('asks for a resend of a request we never saw, though we answered an earlier one', () => {
        // they removed us and scanned again, and that request was lost on the way
        expect(answeredBefore({ resentOf: request, answered: request - 3_600_000 })).toBe(false)
    })

    it('asks when we answered nothing of theirs, and for a resent field that is no time', () => {
        expect(answeredBefore({ resentOf: request, answered: undefined })).toBe(false)
        expect(answeredBefore({ resentOf: '1767225600000', answered: request })).toBe(false)
        expect(answeredBefore({ resentOf: Number.NaN, answered: request })).toBe(false)
    })
})
