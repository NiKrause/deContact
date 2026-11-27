import { describe, expect, it } from 'vitest'
import { OFFER_AGAIN_MS, contactCount, isContactCard, offerSecuring, somethingToLose, wantsSignIn, withSignIn } from './temporary.js'

const me = 'did:key:z6MkBob'
const alice = 'did:key:z6MkAlice'

describe('the cards that count as contacts', () => {
    it('counts a real card of somebody else', () => {
        expect(isContactCard({ owner: alice, firstName: 'Alice', lastName: 'Wolkenfabrik' }, me)).toBe(true)
        expect(isContactCard({ owner: alice, email: 'alice@example.com', firstName: '', lastName: '' }, me)).toBe(true)
    })

    it('not our own card, a placeholder or a canceled request', () => {
        expect(isContactCard({ owner: me, own: true, firstName: 'Bob' }, me)).toBe(false)
        expect(isContactCard({ owner: me, firstName: 'Bob' }, me)).toBe(false)
        expect(isContactCard({ owner: alice, firstName: 'invited', lastName: alice }, me)).toBe(false)
        expect(isContactCard({ owner: alice, firstName: 'request canceled', lastName: alice }, me)).toBe(false)
        expect(isContactCard(undefined, me)).toBe(false)
        expect(isContactCard({ firstName: 'Nobody' }, me)).toBe(false)
    })

    it('contactCount counts them in a book', () => {
        const cards = [
            { owner: me, own: true, firstName: 'Bob' },
            { owner: alice, firstName: 'invited', lastName: alice },
            { owner: 'did:key:z6MkCarol', firstName: 'Carol' }
        ]
        expect(contactCount(cards, me)).toBe(1)
        expect(contactCount(undefined, me)).toBe(0)
    })
})

describe('offering the passkey after the exchange (#97)', () => {
    const now = 1_000_000

    it('once a contact arrived, while the identity is temporary', () => {
        expect(offerSecuring({ temporary: true, contacts: 0, now })).toBe(false)
        expect(offerSecuring({ temporary: true, contacts: 1, now })).toBe(true)
        expect(offerSecuring({ temporary: false, contacts: 3, now })).toBe(false)
        expect(offerSecuring({ temporary: undefined, contacts: 3, now })).toBe(false)
    })

    it('"Not now" puts it away until another contact arrives', () => {
        const dismissed = { at: now, contacts: 1 }
        expect(offerSecuring({ temporary: true, contacts: 1, dismissed, now: now + 1000 })).toBe(false)
        expect(offerSecuring({ temporary: true, contacts: 2, dismissed, now: now + 1000 })).toBe(true)
    })

    it('or until a few minutes passed', () => {
        const dismissed = { at: now, contacts: 1 }
        expect(offerSecuring({ temporary: true, contacts: 1, dismissed, now: now + OFFER_AGAIN_MS - 1 })).toBe(false)
        expect(offerSecuring({ temporary: true, contacts: 1, dismissed, now: now + OFFER_AGAIN_MS })).toBe(true)
    })
})

describe('the warning before the tab closes (#97)', () => {
    it('only while temporary and once the book holds something', () => {
        expect(somethingToLose({ temporary: true, documents: [] })).toBe(false)
        expect(somethingToLose({ temporary: true, documents: undefined })).toBe(false)
        expect(somethingToLose({ temporary: true, documents: [{ owner: alice, firstName: 'invited', lastName: alice }] })).toBe(true)
        expect(somethingToLose({ temporary: false, documents: [{ owner: me }] })).toBe(false)
        expect(somethingToLose({ temporary: undefined, documents: [{ owner: me }] })).toBe(false)
    })
})

describe('"Already have a deContact passkey? Sign in"', () => {
    // a made-up token in the link's format: version, nonce, expiry, two-way, signature (base64url keeps - and _)
    const madeUp = ['1', 'nonce-of_alice', '1767225600000', '1', 'signature-of_alice'].join('.')
    const link = `https://example.com/deContact/#/onboarding/${alice}?onBoardingToken=${madeUp}`

    it('asks the reloaded link for the passkey screen, keeping the token', () => {
        const next = new URL(withSignIn(link))
        expect(next.pathname).toBe('/deContact/')
        const hash = next.hash.slice(1)
        expect(hash.startsWith(`/onboarding/${alice}?`)).toBe(true)
        const query = hash.slice(hash.indexOf('?') + 1)
        expect(new URLSearchParams(query).get('onBoardingToken')).toBe(madeUp)
        expect(wantsSignIn(query)).toBe(true)
    })

    it('works for a link without a token, and only once', () => {
        const once = withSignIn(`https://example.com/#/onboarding/${alice}`)
        expect(once).toBe(`https://example.com/#/onboarding/${alice}?signIn=1`)
        expect(withSignIn(once)).toBe(once)
    })

    it('a plain invitation link does not ask for it', () => {
        expect(wantsSignIn('onBoardingToken=1.x.2.1.y')).toBe(false)
        expect(wantsSignIn(undefined)).toBe(false)
        expect(wantsSignIn('signIn=0')).toBe(false)
    })
})
