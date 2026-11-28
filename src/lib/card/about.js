/**
 * What we keep about a contact for ourselves (#109): our notes on them ("met at the stand,
 * interested in X"). Never shared.
 *
 * A contact's card is written by the contact, so a note cannot live in it: their next update
 * would overwrite it, and it would travel back to them. It is a document of its own in our
 * own book, sealed to us like every document there (cards.js): `{ _id, about, note,
 * changedAt }`, `about` being their DID. Our other devices replicate our book, so it reaches
 * them; a contact cannot write it, the access controller lets them write only
 * `contact:<their DID>`.
 *
 * Its key is random, `about:<16 random bytes>`, not their DID: whoever replicates our book
 * sees the keys in the clear, and every contact keeps a backup of it. They see that such
 * documents exist and how big they are, not whom they are about.
 */
import { base64url } from 'multiformats/bases/base64'

const ABOUT = 'about:'
/** the longest a note may be, in characters */
export const MAX_NOTE_LENGTH = 2000

/** a new key for a document about a contact: nothing in it says whom */
export const newAboutKey = () => `${ABOUT}${base64url.baseEncode(crypto.getRandomValues(new Uint8Array(16)))}`

/** whether a document of our book is one about a contact */
export const isAbout = (value) =>
    typeof value?._id === 'string' && value._id.startsWith(ABOUT) && typeof value.about === 'string' && value.about !== ''

/**
 * Our documents about contacts: their DID → the latest one. Two devices may each have
 * written one about the same contact before they synced: the later counts.
 *
 * @param {Array<{ value: any }>} records the documents of our book
 * @returns {Map<string, { _id: string, about: string, note?: string, changedAt?: number }>}
 */
export function aboutContacts(records) {
    const latest = new Map()
    for (const { value } of records) {
        if (!isAbout(value)) continue
        const known = latest.get(value.about)
        if (!known || (Number(value.changedAt) || 0) > (Number(known.changedAt) || 0)) latest.set(value.about, value)
    }
    return latest
}

/** our note about a contact, as the page shows it */
export const noteOf = (about) => (typeof about?.note === 'string' ? about.note : '')

/**
 * The document about `did` with `note` in it: the one we have, or a new one.
 *
 * @param {object | undefined} about the document we have about them
 * @param {string} did
 * @param {string} note
 * @param {{ now?: number, key?: () => string }} options
 */
export function withNote(about, did, note, { now = Date.now(), key = newAboutKey } = {}) {
    if (typeof did !== 'string' || did === '') throw new TypeError('A note is about a DID')
    return { ...about, _id: about?._id ?? key(), about: did, note: String(note ?? '').trim().slice(0, MAX_NOTE_LENGTH), changedAt: now }
}
