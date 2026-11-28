/**
 * Circles (#100): a few groups of contacts, each seeing chosen fields of our card. Family
 * sees everything; a business contact the name, a work email and a few profiles.
 *
 * We already write our card separately into each contact's book, sealed to them (cardFor in
 * p2p-operations.js). A circle only decides which fields that copy holds: no group keys, no
 * extra books, no change to the access controller or the relays.
 *
 * - The circles are the document `settings:circles` of our own book, sealed to us like every
 *   document there, so all our devices share them: `{ circles: [{ id, name?, fields }],
 *   defaultCircle }`. A circle without a `name` shows its default name in the language on
 *   screen.
 * - The fields are the rows of #109's entries: kind and label (`phones.work`), each social
 *   network on its own (`social.github`), and the photo and the organisation. The name is
 *   always there, so that the card can be recognised.
 * - A contact's circle is in our document about them (about.js), never in their card.
 *   Without one they see the whole card, as before circles.
 */
import { ADDRESS_LABELS, EMAIL_LABELS, NETWORKS, PHONE_LABELS, entriesOf, withEntries } from './entries.js'

export const CIRCLES_KEY = 'settings:circles'
export const MIN_CIRCLES = 3
export const MAX_CIRCLES = 6
export const MAX_CIRCLE_NAME = 40

/** every field a circle may show, in the order of the card */
export const CIRCLE_FIELDS = Object.freeze([
    'photo',
    'organization',
    ...PHONE_LABELS.map((label) => `phones.${label}`),
    ...EMAIL_LABELS.map((label) => `emails.${label}`),
    ...ADDRESS_LABELS.map((label) => `addresses.${label}`),
    ...NETWORKS.map((network) => `social.${network}`)
])

const PROFESSIONAL = ['social.linkedin', 'social.github', 'social.mastodon', 'social.bluesky', 'social.website']
const ALL_SOCIAL = NETWORKS.map((network) => `social.${network}`)

/** an object and everything in it, frozen: the defaults are read, never changed */
const frozen = (value) => {
    if (value && typeof value === 'object') for (const inner of Object.values(value)) frozen(inner)
    return Object.freeze(value)
}

/** the circles of a new address book; Business is the default for a new code: a conference */
export const DEFAULT_CIRCLES = frozen({
    circles: [
        { id: 'family', fields: [...CIRCLE_FIELDS] },
        {
            id: 'friends',
            fields: ['photo', 'organization', 'phones.mobile', 'phones.home', 'phones.other', 'emails.private', 'emails.other', 'addresses.home', 'addresses.other', ...ALL_SOCIAL]
        },
        { id: 'acquaintances', fields: ['photo', 'phones.mobile', 'emails.private', 'emails.work', 'emails.other', ...ALL_SOCIAL] },
        {
            id: 'business',
            fields: ['photo', 'organization', 'phones.mobile', 'phones.work', 'emails.work', 'emails.other', 'addresses.work', ...PROFESSIONAL]
        }
    ],
    defaultCircle: 'business'
})

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const ID = /^[a-z0-9-]{1,40}$/

/**
 * The circles as our book holds them, checked: 3 to 6, each with an id, an optional name and
 * known fields; the default one of them. Without a document, or with one that does not
 * check out, the defaults.
 *
 * @param {any} doc the document `settings:circles`
 * @returns {{ circles: { id: string, name?: string, fields: string[] }[], defaultCircle: string }}
 */
export function circlesOf(doc) {
    const circles = []
    for (const circle of Array.isArray(doc?.circles) ? doc.circles : []) {
        if (!isRecord(circle) || !ID.test(circle.id) || circles.some((it) => it.id === circle.id)) continue
        const fields = CIRCLE_FIELDS.filter((field) => Array.isArray(circle.fields) && circle.fields.includes(field))
        const name = typeof circle.name === 'string' ? circle.name.trim().slice(0, MAX_CIRCLE_NAME) : ''
        circles.push(name ? { id: circle.id, name, fields } : { id: circle.id, fields })
    }
    if (circles.length < MIN_CIRCLES || circles.length > MAX_CIRCLES) return structuredClone(DEFAULT_CIRCLES)
    const defaultCircle = circles.some((it) => it.id === doc.defaultCircle) ? doc.defaultCircle : circles[0].id
    return { circles, defaultCircle }
}

/** the fields a contact in `circleId` sees; undefined: the whole card (no circle, or one that is gone) */
export function fieldsOf(circles, circleId) {
    return circles.circles.find((circle) => circle.id === circleId)?.fields
}

/**
 * Our card as a contact in a circle gets it: the name always, the photo, the organisation
 * and each entry only if the circle shows it, and the first email and address again for
 * older app versions (entries.js withEntries) from what is left. Whatever else the card
 * carries (our devices, the address of our book) stays: the app needs it to work.
 *
 * @param {object} card our card, as saved
 * @param {string[] | undefined} fields the circle's; undefined: the whole card
 */
export function cardForCircle(card, fields) {
    if (!fields) return card
    const shows = (field) => fields.includes(field)
    // a card saved before #109 has its email and address only in the flat fields
    const { phones, emails, addresses, social } = entriesOf(card)
    const next = withEntries({
        ...card,
        phones: phones.filter((it) => shows(`phones.${it.label}`)),
        emails: emails.filter((it) => shows(`emails.${it.label}`)),
        addresses: addresses.filter((it) => shows(`addresses.${it.label}`)),
        social: social.filter((it) => shows(`social.${it.network}`))
    })
    if (!shows('photo')) delete next.photo
    if (!shows('organization')) next.organization = ''
    return next
}

/**
 * Whether moving a contact from one circle to another shows them less: then the app says
 * that what they already received stays with them (#100).
 */
export function showsLess(from, to) {
    if (!to) return false
    if (!from) return to.length < CIRCLE_FIELDS.length
    return from.some((field) => !to.includes(field))
}

const DEFAULT_IDS = ['family', 'friends', 'acquaintances', 'business']
/** the kind of an entry in words: `card.kinds.*` */
const KIND_OF = { phones: 'phone', emails: 'email', addresses: 'address', social: 'social' }

/** a circle's name: the one given to it, else its default name in the language on screen */
export function circleName(tr, circle) {
    if (circle?.name) return circle.name
    return DEFAULT_IDS.includes(circle?.id) ? tr(`circles.defaults.${circle.id}`) : String(circle?.id ?? '')
}

/** a field of CIRCLE_FIELDS in words: "Photo", "Phone · Work", "GitHub", "Profile · Other" */
export function fieldName(tr, field) {
    if (field === 'photo' || field === 'organization') return tr(`circles.${field}`)
    const [kind, label] = field.split('.')
    if (kind === 'social' && label !== 'other') return tr(`card.networks.${label}`)
    const labelText = kind === 'social' ? tr('card.labels.other') : tr(`card.labels.${label}`)
    return tr('card.entryLabel', { kind: tr(`card.kinds.${KIND_OF[kind]}`), label: labelText })
}

/**
 * A new circle after `circles`, with a name given in the language on screen and only the
 * photo shown: what else it shows is chosen in the matrix.
 *
 * @param {{ id: string }[]} circles
 * @param {string} name
 */
export function newCircle(circles, name) {
    let n = circles.length + 1
    while (circles.some((circle) => circle.id === `circle-${n}`)) n++
    return { id: `circle-${n}`, name, fields: ['photo'] }
}
