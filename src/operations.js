import {notify, sha256} from "./utils/utils.js";
import { ensureOwnDevice, removeContact, writeMyCardIntoFollowedBooks } from "./lib/network/p2p-operations.js";
import { t } from "#lib/i18n/index.js";
import { editable, entriesOf, problemsOf, withEntries } from "#lib/card/entries.js";
import { ownCardOf } from "#lib/card/own.js";
import {
    myAddressBook,
    selectedAddr,
    addingContact,
    editingCard,
    selectedRowIds,
    blankCard,
    qrCodeData,
    qrCodeOpen,
    orbitdb,
    myDal,
    dbMyAddressBook
} from "./stores.js";

/**
 * Loading a contact from memory into the contactForm
 * @param id
 * @returns {Promise<void>}
 */
export async function loadContact(id) {
    if (!myAddressBook || !_myAddressBook) return;
    const address = _myAddressBook.find(obj => obj.id === id)
    if(!address) return //do not set undefined here
    // a copy: the form never edits the card the book holds
    selectedAddr.set(editable(address))
}

/**
 * My card (#110): our own card, or before its first
 * save the empty form for it. A card the form already holds stays: our own with changes not
 * saved yet, the first one being typed, or a contact being added by hand.
 */
export function showMyCard() {
    const mine = ownCardOf(_myAddressBook, _orbitdb?.identity?.id)
    const shown = _selectedAddr ?? {}
    if (mine && shown._id === mine._id) return
    if (!shown._id && (shown.own ? !mine : shown.own === false && typedIn(shown))) return
    selectedAddr.set(mine ? editable(mine) : blankCard(true))
}

/** Edit on My card: the form, with our card as saved (#110) */
export function editMyCard() {
    selectedAddr.set({})
    showMyCard()
    editingCard.set(true)
}

/** Cancel while editing our card: back to it as saved, the changes dropped */
export function cancelCardEdit() {
    editingCard.set(false)
    selectedAddr.set({})
    showMyCard()
}

/** "Add contact" on Contacts: the form empty, for a contact added by hand */
export function newContact() {
    selectedAddr.set(blankCard(false))
    addingContact.set(true)
}

/** "All contacts": back from a contact's form to the list */
export function closeContact() {
    closeForm()
}

/** whether somebody typed something into this card: a name, an organisation or an entry (#109) */
function typedIn(card) {
    const { firstName, lastName, organization, phones, emails, addresses, social } = entriesOf(card)
    return Boolean(firstName || lastName || organization) || [phones, emails, addresses, social].some((entries) => entries.length > 0)
}

/**
 * The form's card as it is saved (entries.js withEntries), or undefined: a field is too long
 * or a kind has too many entries. The form marks the field; a notice says why (#109).
 */
function cardToSave() {
    const card = withEntries(_selectedAddr)
    const problems = problemsOf(card)
    if (problems.length === 0) return card
    console.log('not saved, over the limits:', problems.join(', '))
    notify(t('notify.cardTooLong'), 'error')
    return undefined
}

/**
 * Adds a new contact to the orbitdb dbMyAddressBook.
 * The result is a hash
 * At the end we switch back to ContactList Tab
 * @returns {Promise<void>}
 */
export async function addContact() {
    const card = cardToSave()
    if (!card) return
    card.owner = _orbitdb?.identity?.id
    card.sharedAddress = _dbMyAddressBook?.address
    card._id = await sha256(JSON.stringify(card))
    const hash = await _dbMyAddressBook.put(card)
    console.log('saved a card:', hash)
    notify(t('notify.contactAdded'));
    // our first card stays on My card, saved; a contact added by hand goes into the list
    if (card.own) selectedAddr.set(editable(card))
    else closeForm()
    // our first card: it names this device, so that contacts reach it (devices.js)
    await ensureOwnDevice()
}

/**
 * 1. Save the current edited address into the Svelte storage (local only)
 * 2. Inform the subscribers about the address update
 * @returns {Promise<void>}
 */
export async function updateContact() {
    const card = cardToSave()
    if (!card) return
    const newAddrBook = _myAddressBook.filter( el => el._id !== card._id )
    card.owner = _orbitdb?.identity?.id
    await _dbMyAddressBook.put(card)
    newAddrBook.push(card)
    myAddressBook.set(newAddrBook)
    // our own card goes to everybody who has it; one we keep by hand stays here
    notify(t(card.own ? 'notify.cardUpdated' : 'notify.contactUpdated'))
    // only our own card goes out. A contact added by hand has our DID as its owner too: it
    // once went out as our card, into every book we write into
    if (card.own && card.owner === _orbitdb?.identity?.id) {
        await writeMyCardIntoFollowedBooks(card)
    }
    closeForm()
}

/**
 * Deletes the selected contact. A card somebody else keeps up to date (or the placeholder
 * of a request to them) means removing that person: our card leaves their book too, and
 * they get no more updates from us (removeContact).
 */
export async function deleteContact() {
    const owner = _selectedAddr.owner
    // a placeholder has their DID as its last name: no name for a notice
    const name = _selectedAddr.lastName === owner ? '' : [_selectedAddr.firstName, _selectedAddr.lastName].filter(Boolean).join(' ')
    if (owner && owner !== _orbitdb?.identity?.id) {
        await removeContact(owner)
        console.log(`removed ${owner}`)
        notify(name ? t('notify.contactRemoved', { name }) : t('notify.contactRemovedNameless'))
    } else {
        const hash = await _dbMyAddressBook.del(_selectedAddr._id)
        console.log('deleted a card:', hash)
        notify(name ? t('notify.contactDeleted', { name }) : t('notify.contactDeletedNameless'))
    }
    closeForm()
}

/**
 * Back to the list with an empty form. The row leaves the selection too: selecting the same
 * contact again (e.g. our own card, to change its photo) loads it into the form again.
 */
function closeForm() {
    selectedAddr.set({})
    selectedRowIds.set([])
    addingContact.set(false)
    editingCard.set(false)
    // My card shows our card again; the form of a contact goes back to the list
    if (location.hash.startsWith('#/card')) showMyCard()
}

export async function generateQRForAddress(contact) {
    qrCodeData.set(contact)
    qrCodeOpen.set(true)
}
let _orbitdb
orbitdb.subscribe((value) => {
    _orbitdb = value
})

let _selectedAddr;
selectedAddr.subscribe((value) => {
    _selectedAddr = value
})

let _myAddressBook;
myAddressBook.subscribe((value) => {
    _myAddressBook = value
})


let _myDal;
myDal.subscribe((value) => {
    _myDal = value
})

let _dbMyAddressBook;
dbMyAddressBook.subscribe((value) => {
    _dbMyAddressBook = value
})

let _qrCodeData;
qrCodeData.subscribe((value) => {
    _qrCodeData = value
})

let _qrCodeOpen;
qrCodeOpen.subscribe((value) => {
    _qrCodeOpen = value
})