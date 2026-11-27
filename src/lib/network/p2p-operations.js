import { createHeliaLight } from "helia";
import { withLibp2pLight } from "@helia/libp2p";
import { withBitswap } from "@helia/bitswap";
import * as dagCbor from "@ipld/dag-cbor";
import { useAccessController} from '@orbitdb/core';
import { LevelBlockstore } from "blockstore-level"
import { LevelDatastore } from "datastore-level";
import { get } from 'svelte/store';
import { createLibp2pConfig, RELAY_TAGS } from "../../config.js";
import { startPeerConnectivity } from "./peer-connectivity.js";

import {
    libp2p,
    helia,
    orbitdb,
    myAddressBook,
    dbMyAddressBook,
    subscription,
    connectedPeers,
    followList, dbMessages, selectedTab, syncedDevices,
    useWebRTC,
    exchangesWaiting
} from "../../stores.js";

import { confirm } from "../components/addressModal.js"
import { notify, sha256 } from "../../utils/utils.js";
import { t } from "#lib/i18n/index.js";
import { getIdentityAndCreateOrbitDB } from "#lib/network/getIdendityAndCreateOrbitDB.js";
import AddressBookAccessController, { contactKey, createInvitation } from '@le-space/orbitdb-access-controller-decontact';
import { sealedBook } from "../encryption/sealed-book.js";
import {
    REQUEST_ADDRESS,
    createOnboardingToken,
    createOnboardingTokenStore,
    createReplayGuard,
    openMessage,
    redeemOnboardingToken,
    sealMessage,
    verifyOnboardingToken
} from "./contact-messages.js";
import { EXCHANGE_RETRY_MS, createExchangeStore, exchangeNeeds } from "./exchanges.js";

let blockstore = new LevelBlockstore("./helia-blocks")
let datastore = new LevelDatastore("./helia-data")

/** the newest verified request of each sender that we have not answered yet: sender -> { request, receivedAt } */
const pendingRequests = new Map();
/** senders whose request we are answering (at most one dialog per sender) */
const answering = new Set();
/** when we last answered each sender */
const answeredAt = new Map();
/** "sender token" of invitation link requests we answered in the dialog: their resends ask nobody again */
const answeredLinks = new Set();
const replayGuard = createReplayGuard();

/**
 * The inviter whose link is open in the onboarding view (#86): their requests wait for our
 * choice (heldInvitations), and no request dialog appears until the view is left.
 */
let onboardingWith
/** the newest request of an inviter that waits for our choice: inviter -> request */
const heldInvitations = new Map();
let releaseDialogs
/** resolves once request dialogs may appear */
let dialogsAllowed = Promise.resolve()

let _libp2p; /** @type {import('libp2p').Libp2p} Value of to the libp2p store variable containing the libp2p instance*/
libp2p.subscribe((val) => {
    _libp2p = val
});

/**
 * The PubSub topic where deContact is publishing and subscribing
 * REQUEST_ADDRESS requests
 * @type {string}
 */
export const CONTENT_TOPIC = "/dContact/3/message/proto";

/**
 * Starting libp2p and Helia. The address book starts once the vault is open and the
 * identity known (startAddressBook).
 * @returns {Promise<void>}
 */
export async function startNetwork() {

    // Helia 7 is composed: blocks come only from peers via bitswap, never from
    // public HTTP gateways (createHelia's default would ask them for every CID).
    // OrbitDB stores entries, heads and manifests as dag-cbor.
    // withLibp2pLight creates libp2p from our config on start, without the
    // defaults withLibp2p would add (public bootstrap nodes, DHT, delegated routing).
    // Two browsers often reach each other only through the relay (WebRTC may fail behind NAT),
    // so bitswap, like gossipsub, also runs on the limited relayed connection.
    // Relays: the configured ones (VITE_SEED_NODES) and Le Space's on Aleph, which libp2p
    // dials by itself once started; the app does not wait for Aleph to answer.
    const webRTCEnabled = get(useWebRTC)
    _helia = await withBitswap(
        withLibp2pLight(
            createHeliaLight({ blockstore, datastore, codecs: [dagCbor] }),
            createLibp2pConfig({ webRTC: webRTCEnabled })
        ),
        { runOnLimitedConnections: true }
    ).start();
    _libp2p = _helia.libp2p
    libp2p.set(_libp2p)
    helia.set(_helia)
    window.helia = _helia

    // the header shows peers, not connections: "Swarm connected" means a peer besides the relay
    const countPeers = () => connectedPeers.set(_libp2p.getPeers().length)
    countPeers() // libp2p already dialled the seed nodes while Helia started
    _libp2p.addEventListener('peer:disconnect', countPeers);
    _libp2p.addEventListener('connection:open',  async (c) => {
        console.log("connection:open",c.detail.remoteAddr.toString())
        countPeers()
        if(_connectedPeers>1 && _dbMyAddressBook)
            await getAddressRecords();
    });
    _libp2p.addEventListener('connection:close', (c) => {
        console.log("connection:close",c.detail.remoteAddr.toString());
        countPeers()
    });

    startPeerConnectivity(_libp2p, { webRTC: webRTCEnabled, relayTags: RELAY_TAGS })
    _libp2p.services.alephRelays?.addEventListener('peer', (event) =>
        console.log(`relay from Aleph: ${event.detail.id} (${event.detail.multiaddrs.length} addresses)`))
}

/**
 * Starting OrbitDB with the identity of the passkey vault, replication of my address book
 * with my other devices and the contact requests of others.
 *
 * Every document in an address book is sealed to the book's owner, and every request to
 * its recipient (#59, lib/encryption): `keys` opens what was sealed to us.
 *
 * @param signer the identity: `{ did, sign }` of the vault's root (lib/identity/vault.js)
 * @param keys the identity's X25519 pair (vault.js `encryptionKeysOf`)
 * @returns {Promise<void>}
 */
export async function startAddressBook(signer, keys) {
    _signer = signer
    _keys = keys
    _orbitdb = await getIdentityAndCreateOrbitDB(signer, _helia)
    orbitdb.set(_orbitdb)
    window.orbitdb = _orbitdb

    await _libp2p.services.pubsub.subscribe(CONTENT_TOPIC+"/"+_orbitdb.identity.id)

    _libp2p.services.pubsub.addEventListener('message', event => {
        const topic = event.detail.topic
        const message = new TextDecoder().decode(event.detail.data)
        if(!topic.startsWith(CONTENT_TOPIC)) return
        console.log(`Message received on topic '${topic}': ${message}`)
        handleMessage(message).catch((error) => console.log("could not handle a contact message:", error?.message))
    })

    /**
     * My Address Book (with own contact data and contact data of others
     */
    useAccessController(AddressBookAccessController)
    const myIdentityHash = await sha256(_orbitdb.identity.id)
    let myDBName = "/myAddressBook/"+myIdentityHash

    _dbMyAddressBook = bookOf(await _orbitdb.open(myDBName, {
        type: 'documents',
        sync: true,
        AccessController: AddressBookAccessController()
    }))

    logSyncErrors(_dbMyAddressBook)
    await sealWhatWasPlain(_dbMyAddressBook)
    dbMyAddressBook.set(_dbMyAddressBook)
    window.mydb = _dbMyAddressBook
    await getAddressRecords()

    initReplicationBackup(_orbitdb.identity.id)

    void retryExchanges() // the links we opened before a reload
    startInvitationCheckWorker()
    _dbMyAddressBook.events.on('join', async (peerId, heads) => {
        console.log(`db replicated (join event received) peerId: ${peerId}`,heads)
        syncedDevices.set(true)
        getAddressRecords()
    })

    _dbMyAddressBook.events.on('update', async (entry) => {
        console.log("someone updated my address book",entry) //TODO
        getAddressRecords()
    })
}

/**
 * OrbitDB reports sync errors (e.g. a peer we reach only through the relay, where the
 * head exchange can't open a stream) as 'error' events; an EventEmitter throws an
 * 'error' nobody listens to.
 */
function logSyncErrors(db) {
    if (db.events.listenerCount('error') === 0) {
        db.events.on('error', (e) => console.log(`sync error on ${db.address}:`, e?.message))
    }
}

export async function close() {
    await _orbitdb?.stop()
    await _helia?.stop();
}

/**
 * A message arrived on our topic. Anything that is not a request signed by its sender,
 * for us, recent and not seen before is dropped (contact-messages.js).
 */
async function handleMessage(text) {
    const opened = await openMessage(text, { me: _orbitdb?.identity?.id, keys: _keys })
    if (!opened.ok) {
        console.log(`dropped contact message${opened.sender ? ` from ${opened.sender}` : ''}: ${opened.reason}`)
        return
    }
    const request = opened.message
    if (!replayGuard.firstTime(request)) {
        console.log(`dropped contact message from ${request.sender}: seen before`)
        return
    }
    // keep only the newest request of each sender
    const queued = pendingRequests.get(request.sender)
    if (queued && queued.request.timestamp > request.timestamp) return
    pendingRequests.set(request.sender, { request, receivedAt: Date.now() })
    processMessageQueue()
}

/**
 * Answers the queued requests, each sender's in parallel (one confirmation dialog per sender).
 * The sender's app resends until it is answered: a resend that came while we answered is
 * answered with it; one that came while we failed (e.g. their book could not be loaded yet)
 * is the next try.
 */
function processMessageQueue() {
    for (const [sender, { request, receivedAt }] of pendingRequests) {
        if (answering.has(sender)) continue
        pendingRequests.delete(sender)
        if (receivedAt <= (answeredAt.get(sender) ?? 0)) continue
        answering.add(sender)
        answerRequest(request)
            .then(() => answeredAt.set(sender, Date.now()))
            .catch((error) => console.error(`could not answer the request of ${sender}:`, error))
            .finally(() => {
                answering.delete(sender)
                processMessageQueue()
            })
    }
}

/**
 * The words the person reads (#89) for why an invitation link of a request was not good:
 * the reasons of redeemOnboardingToken (contact-messages.js), which the log keeps as they are.
 */
const LINK_PROBLEMS = {
    'is malformed': 'malformed',
    'is not signed by us': 'notOurs',
    'has expired': 'expired',
    'was not issued on this device': 'notIssuedHere',
    'was already used': 'alreadyUsed'
}

/**
 * A verified request: write our card into the sender's address book - right away for a
 * valid invitation link of ours, otherwise after the user confirmed. A request of an
 * inviter whose link we opened is answered by our choice instead (#86).
 */
async function answerRequest(request) {
    const me = _orbitdb.identity.id
    const { sender, data } = request

    // opened by address: its manifest names the access controller
    const opened = await _orbitdb.open(data.sharedAddress, { type: 'documents', sync: true })
    logSyncErrors(opened)
    // our card goes only into the sender's own address book
    if (opened.access?.type !== AddressBookAccessController.type || opened.access?.owner !== sender) {
        console.log(`dropped contact message from ${sender}: ${data.sharedAddress} is not their address book`)
        return
    }
    // what we write into it is sealed to the sender, the book's owner
    const requesterDB = bookOf(opened)

    // the inviter of a link we opened: we chose, or are about to, whether they get our card;
    // a token other than that link's can only be one of ours
    const exchange = exchanges().get(sender)
    const toOurLink = request.onBoardingToken !== undefined && request.onBoardingToken !== exchange?.token
    if (!toOurLink && (exchange || onboardingWith === sender)) {
        if (await answerInviter(request, requesterDB, exchange)) return
        return askToConfirm(request, requesterDB)
    }

    if (request.onBoardingToken !== undefined) {
        const redeemed = await redeemOnboardingToken(request.onBoardingToken, { inviter: me, invitee: sender, store: onboardingTokens() })
        if (redeemed.ok) {
            console.log(`accepted the invitation link of ${sender}`)
            // two-way exchange (#86): the invitation they asked for, in case they share their card
            if (request.twoWay && redeemed.twoWay) await sendInvitation(sender, request.onBoardingToken)
            await writeMyAddressIntoRequesterDB(requesterDB, data.invitation);
            // their book, so that later changes of our card reach it
            await rememberTheirBook(sender, data.sharedAddress)
            initReplicationBackup(me) //init replication of all subscriber ids
            return
        }
        if (answeredLinks.has(`${sender} ${request.onBoardingToken}`)) {
            console.log(`dropped contact message from ${sender}: we answered this invitation link already`)
            return
        }
        console.log(`rejected the invitation link of ${sender}: it ${redeemed.reason}`)
        notify(t(`notify.invitationLink.${LINK_PROBLEMS[redeemed.reason] ?? 'other'}`), 'warning');
    }

    await askToConfirm(request, requesterDB)
    if (request.onBoardingToken !== undefined) answeredLinks.add(`${sender} ${request.onBoardingToken}`)
}

/** the request dialog: send our card (and ask back), send it only, or cancel */
async function askToConfirm(request, requesterDB) {
    const me = _orbitdb.identity.id
    const { sender, data } = request
    // no dialog while the onboarding view is open (#86)
    await dialogsAllowed
    console.log(`asking to confirm the request of ${sender}`)
    const result = await confirm({ data: request });

    if(result){
        if(result==='ONLY_HANDOUT'){
            //As Bob updates his contact data (without requesting contact data of Alice), Bob needs to remember Alice db address so he can
            //1) update his contact data in her address book
            //2) keep a backup of her data
            await rememberTheirBook(sender, data.sharedAddress)
            await writeMyAddressIntoRequesterDB(requesterDB, data.invitation); //Bob writes his address into Alice address book
        }
        else {
            await writeMyAddressIntoRequesterDB(requesterDB, data.invitation);
            await requestAddress(sender, true)
        }
        initReplicationBackup(me) //init replication of all subscriber ids

    } else{
        await decline(requesterDB, data.invitation)
    }
}

/**
 * Cancel: the placeholder the requester wrote for us, the only document of theirs we may
 * change, says so. It is sealed to the requester, so we replace it without reading it. We
 * know it from our own documents, which carry their invitation in the clear: a card we
 * gave them, or an earlier "request canceled", stays as it is.
 */
async function decline(requesterDB, invitation) {
    const me = _orbitdb.identity.id
    try {
        const placeholder = await requesterDB.get(contactKey(me))
        if (placeholder && placeholder.value?.invitation === undefined) {
            const canceled = { _id: contactKey(me), owner: me, firstName: "request canceled", lastName: me, invitation }
            const hash = await requesterDB.put(canceled)
            notify(t('notify.requestDeclined', { hash }));
        }
    } catch (error) {
        console.error('could not decline the request:', error);
    }
}

/**
 * A request of the inviter whose link we opened (#86, exchanges.js): it waits while the
 * onboarding view is open; then our choice answers it. False: ask in the dialog after all
 * (no choice was offered, or the view was left before choosing).
 */
async function answerInviter(request, requesterDB, exchange) {
    const me = _orbitdb.identity.id
    const { sender, data } = request
    if (onboardingWith === sender) {
        heldInvitations.set(sender, request)
        console.log(`holding the request of ${sender} until we chose`)
        showWaiting()
        return true
    }
    switch (exchange?.choice) {
        case 'only':
            console.log(`declined the request of ${sender}: we saved our card only`)
            await decline(requesterDB, data.invitation)
            return true
        case 'share': {
            // their answer to our link comes without a placeholder for us in their book
            const answersOurLink = request.onBoardingToken === exchange.token
            if (await writeMyAddressIntoRequesterDB(requesterDB, data.invitation, { waitForPlaceholder: !answersOurLink })) {
                exchanges().shared(sender)
                console.log(`shared our card with ${sender}`)
                initReplicationBackup(me)
                void retryExchanges()
            }
            return true
        }
        default:
            return false
    }
}

/**
 * The answer to the two-way exchange of our invitation link (#86): our book and an
 * invitation for `invitee`, with nopingpong and the link's token. No placeholder in our
 * book and no resend: the invitee resends until it has what it needs.
 */
async function sendInvitation(invitee, onBoardingToken) {
    const msg = await addressRequest(invitee, { onBoardingToken, nopingpong: true })
    await _libp2p.services.pubsub.publish(CONTENT_TOPIC + "/" + invitee, new TextEncoder().encode(msg))
    console.log(`sent an invitation to ${invitee} for the two-way exchange`)
}

/** a hidden record of somebody's book, so that we keep our card in it up to date and keep a backup */
async function rememberTheirBook(owner, sharedAddress) {
    const subscriber = { sharedAddress, owner, subscriber: true }
    subscriber._id = await sha256(JSON.stringify(subscriber));
    // their app resends its request: one record is enough
    if (await _dbMyAddressBook.get(subscriber._id)) return
    await _dbMyAddressBook.put(subscriber)
}

/**
 * Transforms entries in the dbMyAddressBook orbitdb into an arraylist consumable e.g. by a datatable component
 * @returns {Promise<void>}
 */
async function getAddressRecords() {
    try {
        const addressRecords = (await _dbMyAddressBook.all()).filter((record) => {
            if (!record.value?.unreadable) return true
            console.log(`could not open ${record.key} in our address book: not sealed to us`)
            return false
        });
        let transformedRecords = addressRecords.map(record => ({
            ...record.value,
            id: record.value._id
        }));
        transformedRecords = transformedRecords.filter((addr)=> {
            return addr.id !==undefined && addr.subscriber===undefined
        })
        myAddressBook.set(transformedRecords);
        showWaiting()
        console.log("records in dbMyAddressBook ",addressRecords)
        return addressRecords
    } catch (e) {
        console.log("exception while opening (reading) dbMyAddressBook",e)
        //await close()
    }
    return []
}

/**
 * Loop through our address book and open all other address books of the people we follow (and replicate them in order to keep a backup)
 * We back up the dbs of the people (the addresses) we follow.
 *
 * In case Bob doesn't follow Alice he keeps an invisible dummy in his address book (which he can decide if he wants to back it up or not)
 *
 * TODO: If a contact db gets too large we still need a solution for that! e.g. all other follower (like us) could agree on only backing up
 * a certain part of the data. E.g. Bob has 100 MB data, Alice wants to backup only 10MB, she could create her own version of Bobs data w ith only slice of his data.
 * Alice could let others know about her slice, so those who want to backup Bobs data can take the next slice.
 * If Bob looses his data, he could open his db address with a slice index as an extension e.g. /orbitdb/address/01 /orbitdb/address/02 etc
 * He could do so right in the moment when his data gets over 10MB and create a new db for new contacts. The new contacts would then automatically backup the correct slice
 * (something like that)
 *
 * @param ourDID our DID
 * @returns {Promise<void>}
 */
async function initReplicationBackup(ourDID) {

    const addressRecords = await _dbMyAddressBook.all();
    const addresses = new Set()
    _followList = addressRecords.filter((addr)=> {
        //sharedAddress undefined for all not decentralized addresses
        if (addr.value.owner === ourDID || addr.value.sharedAddress === undefined) return false
        // a card and the record of the same book (rememberTheirBook): one is enough
        if (addresses.has(addr.value.sharedAddress)) return false
        addresses.add(addr.value.sharedAddress)
        return true
    })

    followList.set(_followList)
    for (const s in _followList) {
        const dbAddress = _followList[s].value.sharedAddress
        try {
            // we keep a backup of their book and write our card into it: sealed to its owner
            const followed = bookOf(await _orbitdb.open(dbAddress, { type: 'documents', sync: true }))
            if (followed.bookOwner !== _followList[s].value.owner) {
                console.log(`not following ${dbAddress}: it is not the address book of ${_followList[s].value.owner}`)
                continue
            }
            _followList[s].db = followed
            logSyncErrors(_followList[s].db)
            _followList[s].db.all().then((records)=> { //replicate the addresses of Bob, Peter etc.
                console.log(`we follow and backup dbAddress: ${dbAddress} records`,records)
            })
        } catch(e){
            // one book we cannot open (a contact may name any address) must not stop the others
            console.log(`error while loading ${dbAddress}:`, e?.message)}
    }
}

/** the vault's identity: the key of our did:key, the DID of our OrbitDB identity */
let _signer
/** its X25519 pair: opens what was sealed to us (#59) */
let _keys

/** an address book whose documents are sealed to its owner (lib/encryption/sealed-book.js) */
function bookOf(db) {
    return sealedBook(db, { me: _orbitdb.identity.id, keys: _keys })
}

/**
 * Documents our book still holds in the clear, from before #59: sealed again. The book's
 * owner may write any document. The log keeps the plaintext entries it had.
 */
async function sealWhatWasPlain(book) {
    try {
        const plain = await book.unsealed()
        for (const { value } of plain) await book.put(value)
        if (plain.length > 0) console.log(`sealed ${plain.length} documents of our address book that were in the clear`)
    } catch (error) {
        console.log('could not seal the documents that were in the clear:', error?.message)
    }
}
async function signer() {
    if (_signer?.did !== _orbitdb.identity.id) throw new Error(`the identity ${_orbitdb.identity.id} has no signer here`)
    return _signer
}

/**
 * A signed address request for `recipient`, sealed to them, carrying our address book, an
 * invitation to write into it and our name (they cannot read our book to see who asks).
 */
async function addressRequest(recipient, { onBoardingToken, nopingpong, twoWay } = {}) {
    const data = { sharedAddress: _dbMyAddressBook.address, invitation: await invite(recipient) }
    const from = ownCard()
    return sealMessage(await signer(), { command: REQUEST_ADDRESS, recipient, data, from, onBoardingToken, nopingpong, twoWay })
}

/** our own card as our address book shows it */
function ownCard() {
    const me = _orbitdb?.identity?.id
    return _myAddressBook?.find((it) => it.owner === me && it.own) ?? _myAddressBook?.find((it) => it.owner === me)
}

let _onboardingTokens
/** the invitation link tokens issued on this device */
function onboardingTokens() {
    _onboardingTokens ??= createOnboardingTokenStore(localStorage)
    return _onboardingTokens
}

/**
 * A one-time token for our invitation link (QR code): the first person who opens the link
 * gets our contact data without us confirming; later or after 24 hours we are asked.
 *
 * @param {{ twoWay?: boolean }} options whether they may share their contact data with us
 *   in return (#86): then we send them an invitation without asking, when they ask for one
 * @returns {Promise<string>}
 */
export async function issueOnboardingToken({ twoWay = true } = {}) {
    const token = await createOnboardingToken(await signer(), { twoWay })
    onboardingTokens().issued(token)
    return token.text
}

let _exchanges
/** the invitation links we opened, as the invitee (exchanges.js) */
function exchanges() {
    _exchanges ??= createExchangeStore(localStorage)
    return _exchanges
}

/** a request dialog would interrupt the onboarding: they wait (#86) */
function holdDialogs() {
    if (releaseDialogs) return
    dialogsAllowed = new Promise((resolve) => (releaseDialogs = resolve))
}

function allowDialogs() {
    releaseDialogs?.()
    releaseDialogs = undefined
    dialogsAllowed = Promise.resolve()
}

/**
 * We opened an invitation link (#86). Nothing is sent yet (sendInvitationLinkRequest),
 * so the person can save and choose before the network is up.
 *
 * @param inviter the DID in the link
 * @param onBoardingToken the token in the link
 * @returns {Promise<{ twoWay: boolean }>} whether we may share our card back: the token
 *   is the inviter's, valid, and allows it
 */
export async function openInvitationLink(inviter, onBoardingToken) {
    onboardingWith = inviter
    holdDialogs()
    const verified = onBoardingToken === undefined
        ? { ok: false, reason: 'has no token' }
        : await verifyOnboardingToken(onBoardingToken, { inviter })
    if (!verified.ok) {
        // their device asks them; a request they send back is asked for in our dialog
        console.log(`the invitation link of ${inviter} ${verified.reason}: they will be asked`)
        return { twoWay: false }
    }
    const exchange = exchanges().opened({ inviter, token: onBoardingToken, expiresAt: verified.token.expiresAt, twoWay: verified.token.twoWay })
    return { twoWay: exchange.twoWay }
}

/**
 * Once the network is up: ask the inviter for their card, and, when the token allows a
 * two-way exchange, for an invitation in case we share ours. Resent until we have what we
 * need (retryExchanges).
 */
export async function sendInvitationLinkRequest(inviter, onBoardingToken) {
    if (!exchanges().get(inviter)) return requestAddress(inviter, false, onBoardingToken) // asked for, as any request
    await writePlaceholder(inviter, onBoardingToken)
    await retryExchanges()
}

/**
 * We saved our card in the onboarding view and chose (#86, exchanges.js CHOICES). A
 * request of the inviter that waited is answered by the choice, and dialogs may appear
 * again.
 */
export async function chooseExchange(inviter, choice) {
    const exchange = exchanges().chose(inviter, choice)
    if (!exchange) console.log(`no valid invitation link of ${inviter}: nothing chosen`)
    // saved before the network was up: the placeholder their card is to replace
    else await writePlaceholder(inviter, exchange.token)
    leaveInvitationLink(inviter)
    await retryExchanges() // with 'share' and no invitation at hand: ask for one now
}

/** the onboarding view is gone: a request that waited is answered, or asked for in the dialog */
export function leaveInvitationLink(inviter) {
    if (onboardingWith !== inviter) return
    onboardingWith = undefined
    allowDialogs()
    const held = heldInvitations.get(inviter)
    heldInvitations.delete(inviter)
    // through the queue, so that one request of theirs is answered at a time
    if (held && !(pendingRequests.get(inviter)?.request.timestamp > held.timestamp)) {
        pendingRequests.set(inviter, { request: held, receivedAt: Date.now() })
        processMessageQueue()
    }
    showWaiting()
}

/** a placeholder card is ours, under the key the contact's card will have */
const isPlaceholder = (card, did) => card?.firstName === 'invited' && card?.lastName === did

/** what we have of each link we opened, and what we still need (exchanges.js) */
function exchangeStates() {
    return exchanges().all().map((exchange) => {
        const card = _myAddressBook?.find((it) => it.owner === exchange.inviter && !isPlaceholder(it, exchange.inviter))
        const needs = exchangeNeeds(exchange, {
            cardArrived: Boolean(card),
            invitationHeld: heldInvitations.has(exchange.inviter),
            declinedByInviter: card?.firstName === 'request canceled'
        })
        return { exchange, card, needs }
    })
}

/** whose phone we wait for: shown as "Waiting for <name>'s phone…" */
function showWaiting() {
    exchangesWaiting.set(exchangeStates().filter(({ needs }) => needs.waiting)
        .map(({ exchange, card }) => ({ inviter: exchange.inviter, name: card?.firstName || card?.lastName || undefined })))
}

let exchangeTimer
/**
 * Resends the request of every link we opened until we have what we need, every
 * EXCHANGE_RETRY_MS until its token expires (#86): the inviter's phone may not answer
 * while their app is in the background.
 */
async function retryExchanges() {
    clearTimeout(exchangeTimer)
    if (!_dbMyAddressBook?.address || !_libp2p) return
    let again = false
    for (const { exchange, needs } of exchangeStates()) {
        if (!needs.send) continue
        again = true
        try {
            // a new message each time: the recipient drops one it has seen before
            const msg = await addressRequest(exchange.inviter, { onBoardingToken: exchange.token, twoWay: needs.twoWay })
            await _libp2p.services.pubsub.publish(CONTENT_TOPIC + "/" + exchange.inviter, new TextEncoder().encode(msg))
            console.log(`sent the request of the invitation link to ${exchange.inviter}${needs.twoWay ? ', asking for an invitation' : ''}`)
        } catch (error) {
            console.log(`could not send the request of the invitation link to ${exchange.inviter}:`, error?.message)
        }
    }
    showWaiting()
    clearTimeout(exchangeTimer)
    if (again) exchangeTimer = setTimeout(() => void retryExchanges(), EXCHANGE_RETRY_MS)
}

/**
 * 1. Alice requests an address from Bob via pub sub
 * 2. Alice adds write permission to Bobs identity //TODO please make sure Alice can only write one address into Bobs db and can only update and delete his own.
 * 3. Bob keeps a backup of Alice (encrypted)
 * 4. If Bob changes his address he is iterating through all of his subscribers, opens their address book and updates writes his data in.
 *
 * @param scannedAddress a DID or any other handle supported by the system (e.g. ethereum addresses=
 * @param nopingpong set to true if Bob should not ask again to exchange the contacts if just happened (prevent the ping pong)
 * @param onBoardingToken if set we send an onBoardingToken back to Alice so she doesn't need a confirmation
 * @returns {Promise<void>}
 */
export const requestAddress = async (_scannedAddress,nopingpong, onBoardingToken) => {
    const scannedAddress = _scannedAddress.trim()

    try {
        console.log("request requestAddress from", _scannedAddress);
        // the invitation lets the recipient write their card into our address book
        const msg = await addressRequest(scannedAddress, { onBoardingToken, nopingpong })

        await writePlaceholder(scannedAddress, onBoardingToken)

        await _libp2p.services.pubsub.publish(CONTENT_TOPIC+"/"+scannedAddress, new TextEncoder().encode(msg))

        startInvitationCheckWorker()
        notify(t('notify.requestSent', { did: scannedAddress }));
    } catch (error) {
        console.error('Error in requestAddress:', error);
    }
}

/** a placeholder under the key their card will have; keep a card we already have */
async function writePlaceholder(did, onBoardingToken) {
    if (await _dbMyAddressBook.get(contactKey(did))) return
    const dummyContact = { _id: contactKey(did), owner: did, firstName: 'invited', lastName: did }
    if (onBoardingToken !== undefined) dummyContact.onBoardingToken = onBoardingToken
    await _dbMyAddressBook.put(dummyContact)
    await getAddressRecords()
}

/**
 * Periodically checks for 'invited' contacts and attempts to resend the address request.
 * The interval increases exponentially: first 10 seconds, then 100 seconds, then 10000 seconds, and so on.
 */
function startInvitationCheckWorker() {

    let iteration = 0; // Track the current iteration
    const executeWorker = async () => {
        console.log("Checking for 'invited' contacts to resend requests...");

        const allContacts = await _dbMyAddressBook.all();
        // the links we opened resend by themselves (retryExchanges)
        const invitedContacts = allContacts.filter(contact => contact.value.firstName === 'invited' && !exchanges().get(contact.value.owner));

        if (invitedContacts.length === 0) {
            console.log("No 'invited' contacts found. Worker will not schedule further checks.");
            return; // Stop scheduling further executions
        }

        for (const contact of invitedContacts) {
            // a new message each time: the recipient drops one it has seen before
            const msg = await addressRequest(contact.value.owner, { onBoardingToken: contact.value.onBoardingToken || undefined })
            await _libp2p.services.pubsub.publish(CONTENT_TOPIC + "/" + contact.value.owner, new TextEncoder().encode(msg));
            console.log(`Resent address request to ${contact.value.owner}`);
        }

        // Schedule the next execution
        iteration++;
        const nextInterval = 10 * iteration * 1000; // Calculate the next interval
        console.log(`Scheduling next check in ${nextInterval / 1000} seconds.`);
        setTimeout(executeWorker, nextInterval);
    }

    // Start the first execution
    executeWorker();
}

/**
 * Now we are writing our address directly into Alice address book (we got write permission)
 *
 * @param recipient
 * @param data
 * @returns {Promise<void>}
 */
const SYNC_WAIT_MS = 30_000

/**
 * The requester wrote a placeholder for us into her address book just before she asked
 * us; our copy of her book (just opened) usually hasn't received it yet. Wait until it
 * has - from her directly or from the relay's replica - or give up after SYNC_WAIT_MS.
 */
async function waitForOurEntries(requesterDB, timeoutMs = SYNC_WAIT_MS) {
    const ours = async () => {
        const entry = await requesterDB.get(contactKey(_orbitdb?.identity?.id))
        return entry ? [entry] : []
    }
    let found = await ours()
    if (found.length > 0) return found
    await new Promise((resolve) => {
        const check = async () => {
            if ((await ours()).length > 0) finish()
        }
        const finish = () => {
            clearTimeout(timer)
            requesterDB.events.off('update', check)
            requesterDB.events.off('join', check)
            resolve()
        }
        const timer = setTimeout(finish, timeoutMs)
        requesterDB.events.on('update', check)
        requesterDB.events.on('join', check)
        void check() // it may have arrived between the first look and subscribing
    })
    return ours()
}

/**
 * @param {{ waitForPlaceholder?: boolean }} options false: the requester wrote no
 *   placeholder for us (the answer to our invitation link, #86)
 * @returns {Promise<string | undefined>} the entry's hash, if we wrote one
 */
export async function writeMyAddressIntoRequesterDB(requesterDB, invitation, { waitForPlaceholder = true } = {}) {
    try {
        const card = ownCard()
        if (!card) {
            console.log("no contact card of our own yet - nothing written")
            return
        }
        if (!invitation) {
            console.log(`no invitation into ${requesterDB.address} - nothing written`)
            return
        }
        // write after the requester's placeholder, so our card replaces it
        if (waitForPlaceholder) {
            const placeholder = await waitForOurEntries(requesterDB)
            if (placeholder.length === 0) console.log(`no placeholder for us in ${requesterDB.address} yet - writing our card anyway`)
        }
        const hash = await requesterDB.put(cardFor(card, invitation))
        notify(t('notify.cardWritten', { hash }));
        return hash
    } catch (error) {
        console.error('Error in writeMyAddressIntoRequesterDB:', error);
    }
}

/**
 * Our own card, saved in the onboarding view (#86): into our book, and into every book we
 * already keep our card in.
 */
export async function saveOwnCard(card) {
    await _dbMyAddressBook.put(card)
    await getAddressRecords()
    await writeMyCardIntoFollowedBooks(card)
}

/**
 * Our contact data changed: replace our card in every address book we were invited into.
 * @param ownCard our card as shown in our own address book
 */
export async function writeMyCardIntoFollowedBooks(ownCard) {
    const me = _orbitdb?.identity?.id
    for (const followed of _followList ?? []) {
        if (!followed.db) continue
        try {
            const ours = await followed.db.get(contactKey(me))
            const invitation = ours?.value?.invitation
            if (!invitation) continue // never invited into this book
            await followed.db.put(cardFor(ownCard, invitation))
            console.log("updated our card in", followed.db.address)
        } catch (error) {
            console.log(`could not update our card in ${followed.db.address}:`, error?.message)
        }
    }
}

/**
 * We remove a contact (#59): our card leaves their address book, so no later change of
 * ours reaches them, and their card, placeholder and the record of their book leave ours.
 * What they already received stays with them. Their invitation into our book stays valid:
 * revoking it needs the access controller (a follow-up of #59).
 *
 * @param did the contact's DID
 */
export async function removeContact(did) {
    const me = _orbitdb?.identity?.id
    if (!did || did === me) return
    const records = (await _dbMyAddressBook.all()).filter((record) => record.value?.owner === did)
    const addresses = new Set(records.map((record) => record.value.sharedAddress).filter((address) => typeof address === 'string'))
    for (const address of addresses) {
        try {
            const followed = _followList?.find((it) => it.value?.sharedAddress === address)?.db
                ?? bookOf(await _orbitdb.open(address, { type: 'documents', sync: true }))
            if (followed.bookOwner !== did) continue // not their book: nothing of ours to take back
            if (await followed.get(contactKey(me))) {
                await followed.del(contactKey(me))
                console.log(`removed our card from the address book of ${did}`)
            }
        } catch (error) {
            console.log(`could not remove our card from ${address}:`, error?.message)
        }
    }
    for (const record of records) await _dbMyAddressBook.del(record.key)
    console.log(`removed ${did} from our address book`)
    await initReplicationBackup(me)
    await getAddressRecords()
}

/** our card as we write it into somebody else's address book */
function cardFor(ownCard, invitation) {
    const me = _orbitdb?.identity?.id
    // eslint-disable-next-line no-unused-vars
    const { own, id, ...card } = ownCard
    return { ...card, _id: contactKey(me), owner: me, invitation }
}

/** an invitation for `did` to write their card into our address book */
async function invite(did) {
    return createInvitation(await signer(), _orbitdb.identity.id, did)
}


/**
 * Subscription to the helia store variable containing the Helia instance
 */
let _helia;
helia.subscribe((val) => {
    _helia = val
});

/**
 * Subscription to the orbitdb store variable containing the OrbitDB instance
 */
let _orbitdb;
orbitdb.subscribe((val) => {
    _orbitdb = val
});

let _dbMessages;
dbMessages.subscribe((val) => {
    _dbMessages = val
});

let _dbMyAddressBook;
dbMyAddressBook.subscribe((val) => {
    _dbMyAddressBook = val
});

let _subscription
subscription.subscribe((val) => {
    _subscription = val
});

let _connectedPeers
connectedPeers.subscribe((val) => {
    _connectedPeers = val
});
let _myAddressBook
myAddressBook.subscribe((val) => {
    _myAddressBook = val
});

let _followList
followList.subscribe((val) => {
    _followList = val
});

let _selectedTab
selectedTab.subscribe((val) => {
    _selectedTab = val
});