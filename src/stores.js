import { writable } from 'svelte/store'

/**
 * The libp2p node instance
 * @type {Writable<import('libp2p').Libp2p>}
 */
export const libp2p = writable()

/**
 * The OrbitDB instance
 * @type {Writable<import('@orbitdb/core').OrbitDB>}
 */
export const orbitdb = writable()

/**
 * The Helia instance
 * @type {Writable<import('helia').Helia>}
 */
export const helia = writable()


export const dbMessages = writable()
export const subscription = writable()
export const connectedPeers = writable(0)
/** what the readiness of "Show my code" reads (#110, readiness.js): libp2p runs, relays, a reservation */
export const networkState = writable({ started: false, relays: 0, reachable: false })


/** this is the orbitdb which holds the contact data */
export const myAddressBook = writable()
/** an orbitdb which will replace the myAddressBook store based on localstorage //TODO */
export const dbMyAddressBook = writable([])

export const myDal = writable()

/** storage protocol in synced with another device TODO count the sync events instead of showing just true/false) */
export const synced = writable(false)

/**
 * if contacts of the devices got synced with another devices
 * @type {Writable<boolean>}
 */
export const syncedDevices = writable(false)

/**
 * how many records (messages) got syned via the storage protocol.
 * @type {Writable<number>}
 */
export const recordsSynced = writable(0)

/**
 * Holds the amount of address records, synced from another of my devices (devices with the same identity)
 * @type {Writable<number>}
 */
// export const addressRecordsSynced = writable(0)

export const showNotification =  writable()
export const notificationMessage = writable()
/** @type {Writable<'success' | 'warning' | 'error'>} */
export const notificationKind = writable('success')

export const useWebRTC = writable(window.localStorage.getItem('useWebRTC') !== null ? window.localStorage.getItem('useWebRTC') === 'true' : true);

export const followList = writable([] )
/**
 * The inviters whose phone we wait for, after we opened their invitation link (#86):
 * `{ inviter: DID, name?: their first name, once their card arrived }`
 * @type {Writable<Array<{ inviter: string, name?: string }>>}
 */
export const exchangesWaiting = writable([])
export const qrCodeOpen = writable(false)
export const qrCodeData = writable()

export const selectedRowIds = writable([])
/** Contacts shows the form for a contact being added by hand (#110) */
export const addingContact = writable(false)
/** My card: the form open on our own card, after Edit (#110) */
export const editingCard = writable(false)
/** the empty card every form starts from; frozen: the form edits a copy, never this */
const contact = Object.freeze({
    _id:"",
    firstName: "",
    lastName: "",
    organization: "",
    street: "",
    postalCode: "",
    city: "",
    stateProvince: "",
    countryRegion:"",
    email:"",
    ipns: "",
    owner:"",
    own:true,
    sharedAddress:""
})

/**
 * An empty card for the form: our own before its first save (own), or a contact added by
 * hand. Its entries (#109) are new arrays each time: the template's would be shared.
 */
export const blankCard = (own) => ({ ...contact, phones: [], emails: [], addresses: [], social: [], own })
// a copy: the first card typed into the form once went into the template itself, so every
// later "Add contact" started with our own name and its _id, and offered Update and Delete
export const selectedAddr = writable(blankCard(true))
// export const selectedAddress = writable( )