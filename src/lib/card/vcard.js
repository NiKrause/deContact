/**
 * A card as a vCard (#146): a copy for the address book a person already uses, from the
 * invitee's form or a contact's page.
 *
 * vCard 3.0 (RFC 2426), which iOS, Android and Outlook all read. Built from the card's
 * entries as entriesOf reads them (#109): names, organisation, phones, emails, addresses
 * with their labels, and profiles only where profileLink builds a link. Nothing else of the
 * card goes in: no DID, no book address, never our notes about the contact (#109).
 *
 * Every value comes from another person. Text is escaped as the RFC asks (backslash, comma,
 * semicolon, newline), labels map to fixed TYPE values, links are the app's own (profileLink,
 * the contact address), and no value can end a line: a name cannot add a property of its own.
 *
 * The copy does not update itself. The NOTE says so and carries the link back into deContact
 * (the contact address of the person, see contact-address.js), so whoever saved only the
 * vCard can still get the self-updating card.
 */
import { entriesOf, profileLink } from './entries.js'

/** the TYPE of each label (entries.js), as address books know them */
const PHONE_TYPES = { mobile: 'CELL', home: 'HOME', work: 'WORK', other: 'VOICE' }
const EMAIL_TYPES = { private: 'INTERNET,HOME', work: 'INTERNET,WORK', other: 'INTERNET' }
const ADDRESS_TYPES = { home: 'HOME', work: 'WORK', other: 'POSTAL' }

/** a text value: backslash, comma, semicolon and line breaks escaped; other control characters gone */
export function escapeText(value) {
    return String(value ?? '')
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
        .replace(/\\/g, '\\\\')
        .replace(/\r\n|\r|\n/g, '\\n')
        .replace(/,/g, '\\,')
        .replace(/;/g, '\\;')
}

/** a link: only http(s), and nothing that could end the line */
function uri(value) {
    // eslint-disable-next-line no-control-regex
    if (typeof value !== 'string' || /[\s\u0000-\u001f\u007f]/.test(value)) return undefined
    try {
        const url = new URL(value)
        return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined
    } catch {
        return undefined
    }
}

/**
 * A content line folded at 75 octets (RFC 2426, 2.6): the next line starts with a space.
 * Never inside a character.
 */
export function fold(line) {
    const encoder = new TextEncoder()
    const lines = []
    let current = ''
    let octets = 0
    for (const char of line) {
        const size = encoder.encode(char).length
        // the first line holds 75 octets, a continuation 74 after its leading space
        if (octets + size > (lines.length === 0 ? 75 : 74)) {
            lines.push(current)
            current = ''
            octets = 0
        }
        current += char
        octets += size
    }
    lines.push(current)
    return lines.join('\r\n ')
}

/**
 * @param {object} card the card as the book has it
 * @param {{ link?: string, note?: string, photo?: { type: 'JPEG' | 'PNG', base64: string } }} [extra]
 *   link: the way back into deContact (an http(s) address); note: the sentence that says the
 *   copy does not update, with the link in it; photo: the card's photo as the app prepared it
 * @returns {string} the vCard, with CRLF line ends
 */
export function toVCard(card, { link, note, photo } = {}) {
    const entries = entriesOf(card)
    const fullName = [entries.firstName, entries.lastName].filter(Boolean).join(' ') || entries.organization || entries.emails[0]?.value || ''
    const lines = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `N:${escapeText(entries.lastName)};${escapeText(entries.firstName)};;;`,
        `FN:${escapeText(fullName)}`
    ]
    if (entries.organization) lines.push(`ORG:${escapeText(entries.organization)}`)
    for (const phone of entries.phones) lines.push(`TEL;TYPE=${PHONE_TYPES[phone.label] ?? 'VOICE'}:${escapeText(phone.value)}`)
    for (const email of entries.emails) lines.push(`EMAIL;TYPE=${EMAIL_TYPES[email.label] ?? 'INTERNET'}:${escapeText(email.value)}`)
    for (const address of entries.addresses) {
        // post office box; extended address; street; locality; region; postal code; country
        const parts = ['', '', address.street, address.city, '', address.postalCode, address.countryRegion].map(escapeText)
        lines.push(`ADR;TYPE=${ADDRESS_TYPES[address.label] ?? 'POSTAL'}:${parts.join(';')}`)
    }
    for (const profile of entries.social) {
        const url = uri(profileLink(profile))
        if (url) lines.push(`URL:${url}`)
    }
    const back = uri(link)
    if (back) lines.push(`URL:${back}`)
    if (note) lines.push(`NOTE:${escapeText(note)}`)
    if (photo && (photo.type === 'JPEG' || photo.type === 'PNG') && /^[A-Za-z0-9+/]+={0,2}$/.test(photo.base64)) {
        lines.push(`PHOTO;ENCODING=b;TYPE=${photo.type}:${photo.base64}`)
    }
    lines.push('END:VCARD')
    return lines.map(fold).join('\r\n') + '\r\n'
}

/** a file name for the vCard: the person's name in letters, digits, dots and dashes */
export function vCardFileName(card, fallback = 'contact') {
    const { firstName, lastName } = entriesOf(card)
    const name = [firstName, lastName]
        .filter(Boolean)
        .join('-')
        .normalize('NFC')
        .replace(/[^\p{L}\p{N}.-]+/gu, '-')
        .replace(/^[-.]+|[-.]+$/g, '')
        .slice(0, 60)
    return `${name || fallback}.vcf`
}

/**
 * The way back into deContact for a vCard: the app's address with the person's contact
 * address, which Exchange puts into its *Paste a contact address* field (#146). Only with a
 * device to ask: a DID alone reaches nobody (contact-address.js).
 *
 * @param {string} app the app's address (appUrlIn)
 * @param {string} contact the contact address (contactAddress)
 */
export function askLink(app, contact) {
    return `${app}#/?ask=${encodeURIComponent(contact)}`
}
