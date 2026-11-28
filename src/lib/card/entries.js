/**
 * What a card holds (#109): besides the name, repeatable entries with a label, as in a
 * phone's own address book and in vCard.
 *
 * - `phones: [{ label, value }]`, `emails: [{ label, value }]`,
 *   `addresses: [{ label, street, postalCode, city, countryRegion }]`,
 *   `social: [{ network, handle }]`, and an optional `organization`.
 * - The order is the person's: the first entry of each kind is the primary one.
 * - Cards from before #109 hold one email and one address in flat fields (`email`,
 *   `street`, `postalCode`, `city`, `countryRegion`) and a `category` for both. They read
 *   as the first email and the first address, labelled after the category.
 * - Older app versions (a cached PWA on another phone) read and write only those flat
 *   fields, so the primary email and address are written there too. When they differ from
 *   the first entry, an older version changed them, and the flat fields win.
 *
 * A card comes from its owner's app, which may be any app: what is read here is checked
 * (strings only, known labels, at most MAX_ENTRIES of each kind, MAX_LENGTH per field).
 */

/** the most entries of one kind a card holds */
export const MAX_ENTRIES = 5

export const PHONE_LABELS = Object.freeze(['mobile', 'home', 'work', 'other'])
export const EMAIL_LABELS = Object.freeze(['private', 'work', 'other'])
export const ADDRESS_LABELS = Object.freeze(['home', 'work', 'other'])
export const NETWORKS = Object.freeze(['mastodon', 'bluesky', 'linkedin', 'github', 'instagram', 'x', 'website', 'other'])

/** the fields of one address, in the order they are written */
export const ADDRESS_FIELDS = Object.freeze(['street', 'postalCode', 'city', 'countryRegion'])

/** the longest each field may be, in characters */
export const MAX_LENGTH = Object.freeze({
    firstName: 100,
    lastName: 100,
    organization: 100,
    phone: 40,
    email: 254,
    street: 200,
    postalCode: 20,
    city: 100,
    countryRegion: 100,
    handle: 200
})

/** the labels of a card from before #109, after its category */
const FROM_CATEGORY = Object.freeze({
    private: { email: 'private', address: 'home' },
    business: { email: 'work', address: 'work' },
    other: { email: 'other', address: 'other' }
})

const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '')
const oneOf = (value, list) => (list.includes(value) ? value : 'other')
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

/** the entries of one kind, as read: records only, mapped, the empty ones out, at most MAX_ENTRIES */
function listOf(value, map, filled) {
    if (!Array.isArray(value)) return []
    return value.filter(isRecord).map(map).filter(filled).slice(0, MAX_ENTRIES)
}

const phoneOf = (it) => ({ label: oneOf(it.label, PHONE_LABELS), value: text(it.value, MAX_LENGTH.phone) })
const emailOf = (it) => ({ label: oneOf(it.label, EMAIL_LABELS), value: text(it.value, MAX_LENGTH.email) })
const addressOf = (it) => ({
    label: oneOf(it.label, ADDRESS_LABELS),
    ...Object.fromEntries(ADDRESS_FIELDS.map((field) => [field, text(it[field], MAX_LENGTH[field])]))
})
const profileOf = (it) => ({ network: oneOf(it.network, NETWORKS), handle: text(it.handle, MAX_LENGTH.handle) })
const hasAddress = (address) => ADDRESS_FIELDS.some((field) => address[field] !== '')

/**
 * The first entry as the flat field has it: the flat field is what every app version
 * writes. Equal: as it is. Empty: the first entry was removed. Else it replaces the first
 * entry's value, or is the only entry.
 *
 * @template T
 * @param {T[]} entries
 * @param {T | undefined} flat the primary entry after the flat fields, undefined if it is empty
 * @param {(a: T, b: T) => boolean} same
 * @param {(first: T, flat: T) => T} merge
 */
function withPrimary(entries, flat, same, merge) {
    const [first, ...rest] = entries
    if (!flat) return first === undefined ? entries : rest
    if (first === undefined) return [flat]
    return same(first, flat) ? entries : [merge(first, flat), ...rest]
}

/**
 * A card's name and entries, read and checked (see above). Never throws.
 *
 * @param {any} card as stored, a contact's or our own
 * @returns {{ firstName: string, lastName: string, organization: string,
 *   phones: { label: string, value: string }[], emails: { label: string, value: string }[],
 *   addresses: { label: string, street: string, postalCode: string, city: string, countryRegion: string }[],
 *   social: { network: string, handle: string }[] }}
 */
export function entriesOf(card) {
    const c = isRecord(card) ? card : {}
    const labels = FROM_CATEGORY[c.category] ?? FROM_CATEGORY.other

    let emails = listOf(c.emails, emailOf, (it) => it.value !== '')
    if (typeof c.email === 'string') {
        const value = text(c.email, MAX_LENGTH.email)
        emails = withPrimary(
            emails,
            value ? { label: labels.email, value } : undefined,
            (a, b) => a.value === b.value,
            (first, flat) => ({ ...first, value: flat.value })
        )
    }

    let addresses = listOf(c.addresses, addressOf, hasAddress)
    if (ADDRESS_FIELDS.some((field) => typeof c[field] === 'string')) {
        const flat = addressOf({ ...c, label: labels.address })
        addresses = withPrimary(
            addresses,
            hasAddress(flat) ? flat : undefined,
            (a, b) => ADDRESS_FIELDS.every((field) => a[field] === b[field]),
            (first, address) => ({ ...address, label: first.label })
        )
    }

    return {
        firstName: text(c.firstName, MAX_LENGTH.firstName),
        lastName: text(c.lastName, MAX_LENGTH.lastName),
        organization: text(c.organization, MAX_LENGTH.organization),
        phones: listOf(c.phones, phoneOf, (it) => it.value !== ''),
        emails,
        addresses,
        social: listOf(c.social, profileOf, (it) => it.handle !== '')
    }
}

/** the line under a name in the list and on a card: the organisation, else the city of the first address */
export function subtitleOf(card) {
    const { organization, addresses } = entriesOf(card)
    return organization || addresses[0]?.city || ''
}

/** an address in lines: street; postal code and city; country */
export function addressLines(address) {
    return [address.street, [address.postalCode, address.city].filter(Boolean).join(' '), address.countryRegion].filter(Boolean)
}

/** a domain name: letters, digits and hyphens between dots, ending in a top-level domain of letters */
const DOMAIN = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i
const bare = (handle) => handle.replace(/^@/, '')

/** each known network: the link to a profile, built from a handle only if it has the network's form */
const PROFILE_LINKS = {
    mastodon: (handle) => {
        const match = /^@?([a-z0-9_]{1,30})@([^@\s/]+)$/i.exec(handle)
        return match && DOMAIN.test(match[2]) ? `https://${match[2].toLowerCase()}/@${match[1]}` : undefined
    },
    bluesky: (handle) => (DOMAIN.test(bare(handle)) ? `https://bsky.app/profile/${bare(handle).toLowerCase()}` : undefined),
    linkedin: (handle) => (/^[a-z0-9-]{3,100}$/i.test(bare(handle)) ? `https://www.linkedin.com/in/${bare(handle)}` : undefined),
    github: (handle) => (/^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/i.test(bare(handle)) ? `https://github.com/${bare(handle)}` : undefined),
    instagram: (handle) => (/^[a-z0-9._]{1,30}$/i.test(bare(handle)) ? `https://www.instagram.com/${bare(handle)}/` : undefined),
    x: (handle) => (/^[a-z0-9_]{1,15}$/i.test(bare(handle)) ? `https://x.com/${bare(handle)}` : undefined),
    website: (handle) => {
        let url
        try {
            url = new URL(handle)
        } catch {
            return undefined
        }
        const web = url.protocol === 'https:' || url.protocol === 'http:'
        return web && !url.username && !url.password && DOMAIN.test(url.hostname) ? url.href : undefined
    }
}

/**
 * The link to a social profile (#109): only for a known network, built by the app from a
 * handle of that network's form, or a web address for a website. Anything else is shown as
 * text, never as a link.
 *
 * @param {{ network: string, handle: string }} profile
 * @returns {string | undefined}
 */
export function profileLink({ network, handle }) {
    if (typeof handle !== 'string' || !Object.hasOwn(PROFILE_LINKS, network)) return undefined
    return PROFILE_LINKS[network](handle.trim())
}

/**
 * A phone number for a `tel:` link: digits, an optional leading +, and the separators people
 * type (spaces, dashes, dots, parentheses, slashes) taken out. Anything else is no number.
 */
export function phoneLink(value) {
    if (typeof value !== 'string' || !/^\+?[\d\s\-./()]{3,40}$/.test(value.trim())) return undefined
    const number = value.trim().replace(/[\s\-./()]/g, '')
    return /^\+?\d{3,}$/.test(number) ? `tel:${number}` : undefined
}

/** an email address for a `mailto:` link: one @, no spaces, nothing that would add a header */
export function emailLink(value) {
    if (typeof value !== 'string') return undefined
    const address = value.trim()
    return /^[^\s@?&#/\\]+@[^\s@?&#/\\]+\.[^\s@?&#/\\]+$/.test(address) ? `mailto:${address}` : undefined
}

/**
 * The label a new entry gets: the first phone Mobile, a second Work, the first address Home
 * (#109); the first email Work, as the cards of the onboarding form were before (category
 * business): it is the one people exchange at a stand.
 */
const DEFAULT_LABELS = Object.freeze({ phones: ['mobile', 'work'], emails: ['work', 'private'], addresses: ['home', 'work'] })

/**
 * A new, empty entry of `kind`, the `index`th of its kind, with its default label.
 *
 * @param {'phones' | 'emails' | 'addresses' | 'social'} kind
 * @param {number} index
 */
export function newEntry(kind, index) {
    if (kind === 'social') return { network: NETWORKS[0], handle: '' }
    const label = DEFAULT_LABELS[kind]?.[index] ?? 'other'
    if (kind === 'addresses') return { label, ...Object.fromEntries(ADDRESS_FIELDS.map((field) => [field, ''])) }
    return { label, value: '' }
}

/**
 * A card for the form: a copy with the entries of #109 in arrays of their own. The form
 * edits the copy, never the card the book holds, so Cancel drops what was typed.
 */
export const editable = (card) => ({ ...card, ...entriesOf(card) })

const trimmed = (value) => (typeof value === 'string' ? value.trim() : '')
const records = (value) => (Array.isArray(value) ? value.filter(isRecord) : [])

/**
 * A card as it is saved (#109): its entries trimmed, the empty ones out, unknown labels
 * Other; the first email and the first address also in the flat fields, for older app
 * versions; the `category` of before #109 gone, the labels say it now. Nothing is cut:
 * problemsOf says what is too long.
 *
 * @param {any} card the form's card
 */
export function withEntries(card) {
    const phones = records(card.phones)
        .map((it) => ({ label: oneOf(it.label, PHONE_LABELS), value: trimmed(it.value) }))
        .filter((it) => it.value !== '')
    const emails = records(card.emails)
        .map((it) => ({ label: oneOf(it.label, EMAIL_LABELS), value: trimmed(it.value) }))
        .filter((it) => it.value !== '')
    const addresses = records(card.addresses)
        .map((it) => ({ label: oneOf(it.label, ADDRESS_LABELS), ...Object.fromEntries(ADDRESS_FIELDS.map((field) => [field, trimmed(it[field])])) }))
        .filter(hasAddress)
    const social = records(card.social)
        .map((it) => ({ network: oneOf(it.network, NETWORKS), handle: trimmed(it.handle) }))
        .filter((it) => it.handle !== '')
    // eslint-disable-next-line no-unused-vars
    const { category, ...rest } = card
    return {
        ...rest,
        firstName: trimmed(card.firstName),
        lastName: trimmed(card.lastName),
        organization: trimmed(card.organization),
        phones,
        emails,
        addresses,
        social,
        // for older app versions: they read and write these
        email: emails[0]?.value ?? '',
        ...Object.fromEntries(ADDRESS_FIELDS.map((field) => [field, addresses[0]?.[field] ?? '']))
    }
}

/** the field of MAX_LENGTH each field of an entry is measured by */
const LENGTH_OF = Object.freeze({
    phones: { value: 'phone' },
    emails: { value: 'email' },
    addresses: Object.fromEntries(ADDRESS_FIELDS.map((field) => [field, field])),
    social: { handle: 'handle' }
})

/**
 * What keeps a card from being saved (#109): a kind with more than MAX_ENTRIES entries, a
 * field longer than MAX_LENGTH. Paths such as `phones.1.value`; none: an empty list.
 *
 * @param {any} card as withEntries returns it
 * @returns {string[]}
 */
export function problemsOf(card) {
    const problems = []
    for (const field of ['firstName', 'lastName', 'organization']) {
        if (trimmed(card[field]).length > MAX_LENGTH[field]) problems.push(field)
    }
    for (const [kind, fields] of Object.entries(LENGTH_OF)) {
        const entries = records(card[kind])
        if (entries.length > MAX_ENTRIES) problems.push(kind)
        entries.forEach((entry, i) => {
            for (const [field, length] of Object.entries(fields)) {
                if (trimmed(entry[field]).length > MAX_LENGTH[length]) problems.push(`${kind}.${i}.${field}`)
            }
        })
    }
    return problems
}
