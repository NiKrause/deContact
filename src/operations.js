import {notify, sha256} from "./utils/utils.js";
import { ensureOwnDevice, removeContact, writeMyCardIntoFollowedBooks } from "./lib/network/p2p-operations.js";
import { t } from "#lib/i18n/index.js";
import {
    myAddressBook,
    selectedAddr,
    selectedTab,
    selectedRowIds,
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
    notify(t('notify.contactAdded', { hash }));
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
    const name = [_selectedAddr.firstName, _selectedAddr.lastName].filter(Boolean).join(' ')
    notify(t('notify.contactUpdated', { name }))
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
    if (owner && owner !== _orbitdb?.identity?.id) {
        await removeContact(owner)
        notify(t('notify.contactRemoved', { owner }))
    } else {
        const hash = await _dbMyAddressBook.del(_selectedAddr._id)
        notify(t('notify.contactDeleted', { hash }))
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