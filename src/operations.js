import {notify, sha256} from "./utils/utils.js";
import { ensureOwnDevice, removeContact, writeMyCardIntoFollowedBooks } from "./lib/network/p2p-operations.js";
import { t } from "#lib/i18n/index.js";
import {
    myAddressBook,
    selectedAddr,
    selectedTab,
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
    _selectedAddr = address
    if(!address) return //do not set undefined here
    selectedAddr.set(_selectedAddr)
    selectedTab.set(1)
}

/**
 * My Address with no contact picked from the list (#110): our own card, or before its first
 * save the empty form for it. A card the form already holds stays: our own with changes not
 * saved yet, the first one being typed, or a contact being added by hand.
 */
export function showMyCard() {
    const me = _orbitdb?.identity?.id
    const mine = me ? _myAddressBook?.find((it) => it.owner === me && it.own) : undefined
    const shown = _selectedAddr ?? {}
    if (mine && shown._id === mine._id) return
    if (!shown._id && (shown.own ? !mine : shown.own === false && typedIn(shown))) return
    selectedAddr.set(mine ? { ...mine } : blankCard(true))
}

/** "New": the form empty, for a contact added by hand */
export function newContact() {
    selectedAddr.set(blankCard(false))
}

/** whether somebody typed something into this card */
const typedIn = (card) => ['firstName', 'lastName', 'email', 'street', 'postalCode', 'city', 'countryRegion'].some((field) => String(card[field] ?? '').trim() !== '')

/**
 * Adds a new contact to the orbitdb dbMyAddressBook.
 * The result is a hash
 * At the end we switch back to ContactList Tab
 * @returns {Promise<void>}
 */
export async function addContact() {
    _selectedAddr.owner = _orbitdb?.identity?.id
    _selectedAddr.sharedAddress = _dbMyAddressBook?.address
    _selectedAddr._id = await sha256(JSON.stringify(_selectedAddr))
    const hash = await _dbMyAddressBook.put(_selectedAddr)
    console.log('saved a card:', hash)
    notify(t('notify.contactAdded'));
    closeForm()
    // our first card: it names this device, so that contacts reach it (devices.js)
    await ensureOwnDevice()
}

/**
 * 1. Save the current edited address into the Svelte storage (local only)
 * 2. Inform the subscribers about the address update
 * @returns {Promise<void>}
 */
export async function updateContact() {
    const newAddrBook = _myAddressBook.filter( el => el._id !== _selectedAddr._id )
    _selectedAddr.owner = _orbitdb?.identity?.id
    await _dbMyAddressBook.put(_selectedAddr)
    newAddrBook.push(_selectedAddr)
    myAddressBook.set(newAddrBook)
    // our own card goes to everybody who has it; one we keep by hand stays here
    notify(t(_selectedAddr.own ? 'notify.cardUpdated' : 'notify.contactUpdated'))
    if(_selectedAddr.owner === _orbitdb?.identity?.id){ //only send update requests if my own address was changed
        await writeMyCardIntoFollowedBooks(_selectedAddr)
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
    selectedTab.set(0)
}

export async function generateQRForAddress(contact) {
    qrCodeData.set(contact)
    qrCodeOpen.set(true)
}
let _orbitdb
orbitdb.subscribe((value) => {
    _orbitdb = value
})

let _selectedTab;
selectedTab.subscribe((value) => {
    _selectedTab = value
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