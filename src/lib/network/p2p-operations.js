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
import { liftRevocation, removedUs, revoke, withoutRevoked } from "./revocations.js";
import { answeredBefore } from "./answered.js";
import { answerContactRequests, deliverContactRequest } from "./contact-protocol.js";
import { devicesOf, withDevice } from "./devices.js";
// localStorage, held in memory while the identity is temporary (#97)
import { deviceStorage } from "#lib/identity/held-storage.js";
import { thumbnailOf } from "#lib/photo/photo.js";

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
/** the timestamp of each sender's request we answered in the dialog, by their clock: its resends ask nobody again (answered.js) */
const answeredRequests = new Map();
/** the timestamp of our own latest request to each recipient: what our resends name (answered.js) */
const requestedAt = new Map();
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
 * The device of each DID we heard from: the peer their request came from
 * (contact-protocol.js). Our answers and our own requests go there.
 */
const peerOf = new Map();
/** the recipients our request reached: the app resends no more (startInvitationCheckWorker) */
const delivered = new Set();
/** whether requests are answered (the end-to-end tests turn it off: an app in the background) */
let answeringRequests = true;

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

    // contact requests come peer to peer, on deContact's own protocol: no topic, nothing
    // for a relay or a third peer to subscribe to (contact-protocol.js)
    await answerContactRequests(_libp2p, (text, from) => {
        // an app in the background answers nothing: no receipt (the end-to-end tests' pause)
        if (!answeringRequests) throw new Error('not answering requests')
        return handleMessage(text, from).catch((error) => {
            console.log("could not handle a contact message:", error?.message)
            return false
        })
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
    // the end-to-end tests' hook (#81): only in a build for them, never in production
    if (import.meta.env.VITE_E2E === 'true') {
        (await import('./e2e-hook.js')).installE2EHook(_orbitdb, {
            // an app in the background: its peer does not answer the protocol
            pauseRequests: () => (answeringRequests = false),
            resumeRequests: () => (answeringRequests = true),
            // a message of the test's own making, delivered as the app delivers requests
            deliver: async (peer, text) => deliverContactRequest(_libp2p, peer, text, { relayPeers: await relayPeerIds() })
        })
    }
    await getAddressRecords()

    // this device in our own card, once the books we keep our card in are open (devices.js)
    initReplicationBackup(_orbitdb.identity.id).then(() => ensureOwnDevice())

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
 * A request arrived from the peer `from`. Anything that is not a request signed by its
 * sender, for us, recent and not seen before is dropped (contact-messages.js).
 *
 * @returns {Promise<boolean>} whether it was a request for us: the receipt says so
 */
async function handleMessage(text, from) {
    const opened = await openMessage(text, { me: _orbitdb?.identity?.id, keys: _keys })
    if (!opened.ok) {
        console.log(`dropped contact message${opened.sender ? ` from ${opened.sender}` : ''}: ${opened.reason}`)
        return false
    }
    const request = opened.message
    // the device of the sender: where our answer goes
    peerOf.set(request.sender, from)
    if (!replayGuard.firstTime(request)) {
        console.log(`dropped contact message from ${request.sender}: seen before`)
        return true
    }
    // keep only the newest request of each sender
    const queued = pendingRequests.get(request.sender)
    if (queued && queued.request.timestamp > request.timestamp) return
    pendingRequests.set(request.sender, { request, receivedAt: Date.now() })
    processMessageQueue()
    return true
}

/** the relays we hold a connection to: a peer is dialled through them (contact-protocol.js) */
async function relayPeerIds() {
    const ids = new Set()
    for (const connection of _libp2p.getConnections()) {
        try {
            const peer = await _libp2p.peerStore.get(connection.remotePeer)
            if (RELAY_TAGS.some((tag) => peer.tags.has(tag))) ids.add(connection.remotePeer.toString())
        } catch {
            // not in the peer store: not one of our relays
        }
    }
    return ids
}

/**
 * A request for `did`, to their device: `peer`, or the one their own request came from.
 *
 * @returns {Promise<{ delivered: boolean, received?: boolean, error?: string }>}
 */
async function deliver(did, peer, msg) {
    const targets = devicesFor(did, peer)
    if (targets.length === 0) return { delivered: false, error: 'we know no device of theirs' }
    const relayPeers = await relayPeerIds()
    let result
    for (const target of targets) {
        result = await deliverContactRequest(_libp2p, target, msg, { relayPeers })
        if (result.delivered) {
            peerOf.set(did, target)
            return result
        }
    }
    return result
}

/**
 * Where to ask `did`, in order: the device named (a QR code, a placeholder), the one their
 * own request came from, then the devices their card names, most recently seen first
 * (devices.js).
 */
function devicesFor(did, peer) {
    const card = _myAddressBook?.find((it) => it.owner === did && !isPlaceholder(it, did))
    const named = [peer, peerOf.get(did), ...devicesOf(card).map((device) => device.peer)]
    return [...new Set(named.filter((it) => typeof it === 'string' && it))]
}

/**
 * This device in our own card (devices.js): written, and passed on to every book we keep
 * our card in, only when the card does not name it recently enough. Contacts then reach
 * this device with their requests.
 */
export async function ensureOwnDevice() {
    const me = _orbitdb?.identity?.id
    const peer = _libp2p?.peerId?.toString()
    if (!me || !peer || !_dbMyAddressBook) return
    // the card ownCard() writes into other books: the one marked as ours, else the first of ours
    const records = (await countingRecords()).filter((record) => record.value?.owner === me)
    const own = records.find((record) => record.value.own) ?? records[0]
    if (!own) return
    const next = withDevice(own.value, peer)
    if (!next) return
    await _dbMyAddressBook.put(next)
    await getAddressRecords()
    await writeMyCardIntoFollowedBooks(next)
    console.log(`our card names this device now: ${peer}`)
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
            await writeMyAddressIntoRequesterDB(requesterDB, data.invitation, { to: request.from });
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
    // their app resends until our card has arrived in their book: a resend of a request we answered asks nobody (answered.js)
    if (answeredBefore({ resentOf: request.resentOf, answered: answeredRequests.get(sender) })) {
        console.log(`dropped contact message from ${sender}: we answered their request already`)
        return
    }
    // no dialog while the onboarding view is open (#86)
    await dialogsAllowed
    console.log(`asking to confirm the request of ${sender}`)
    const result = await confirm({ data: request });
    answeredRequests.set(sender, Math.max(request.timestamp, answeredRequests.get(sender) ?? 0))

    if(result){
        if(result==='ONLY_HANDOUT'){
            //As Bob updates his contact data (without requesting contact data of Alice), Bob needs to remember Alice db address so he can
            //1) update his contact data in her address book
            //2) keep a backup of her data
            await rememberTheirBook(sender, data.sharedAddress)
            await writeMyAddressIntoRequesterDB(requesterDB, data.invitation, { to: request.from }); //Bob writes his address into Alice address book
        }
        else {
            await writeMyAddressIntoRequesterDB(requesterDB, data.invitation, { to: request.from });
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
            console.log(`declined the request in ${requesterDB.address}:`, hash)
            notify(t('notify.requestDeclined'));
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
            if (await writeMyAddressIntoRequesterDB(requesterDB, data.invitation, { waitForPlaceholder: !answersOurLink, to: request.from })) {
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
    const result = await deliver(invitee, undefined, msg)
    if (result.delivered) console.log(`sent an invitation to ${invitee} for the two-way exchange`)
    else console.log(`could not send an invitation to ${invitee}: ${result.error}`)
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
        const addressRecords = (await countingRecords()).filter((record) => {
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
 * The documents of our address book that count: a revocation and the card of a contact we
 * removed do not (#82, revocations.js), whenever they write it.
 */
async function countingRecords() {
    const { visible, ignored } = withoutRevoked(await _dbMyAddressBook.all())
    for (const did of ignored) console.log(`ignored the card of ${did}: we removed them`)
    return visible
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

    const addressRecords = await countingRecords();
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
async function addressRequest(recipient, { onBoardingToken, nopingpong, twoWay, resentOf, now = Date.now() } = {}) {
    const data = { sharedAddress: _dbMyAddressBook.address, invitation: await invite(recipient) }
    const from = ownCard()
    const photo = await requestPhotoOf(from)
    return sealMessage(await signer(), { command: REQUEST_ADDRESS, recipient, data, from, photo, onBoardingToken, nopingpong, twoWay, resentOf }, { now })
}

/** the last thumbnail made for a request, and the card photo it was made from */
let requestPhoto = { of: undefined, thumbnail: undefined }
/** a small copy of our card's photo for the request dialog (#110); made once per photo */
async function requestPhotoOf(card) {
    const photo = card?.photo
    if (!photo) return undefined
    if (requestPhoto.of !== photo) {
        const thumbnail = await thumbnailOf(photo).catch((error) => {
            console.log('no photo for the request:', error?.message)
            return undefined
        })
        requestPhoto = { of: photo, thumbnail }
    }
    return requestPhoto.thumbnail
}

/** our own card as our address book shows it */
function ownCard() {
    const me = _orbitdb?.identity?.id
    return _myAddressBook?.find((it) => it.owner === me && it.own) ?? _myAddressBook?.find((it) => it.owner === me)
}

let _onboardingTokens
/** the invitation link tokens issued on this device */
function onboardingTokens() {
    _onboardingTokens ??= createOnboardingTokenStore(deviceStorage)
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
    _exchanges ??= createExchangeStore(deviceStorage)
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
 * @param peer the inviter's device in the link: where requests go (contact-protocol.js)
 * @returns {Promise<{ twoWay: boolean }>} whether we may share our card back: the token
 *   is the inviter's, valid, and allows it
 */
export async function openInvitationLink(inviter, onBoardingToken, peer) {
    onboardingWith = inviter
    holdDialogs()
    if (peer) peerOf.set(inviter, peer)
    const verified = onBoardingToken === undefined
        ? { ok: false, reason: 'has no token' }
        : await verifyOnboardingToken(onBoardingToken, { inviter })
    if (!verified.ok) {
        // their device asks them; a request they send back is asked for in our dialog
        console.log(`the invitation link of ${inviter} ${verified.reason}: they will be asked`)
        return { twoWay: false }
    }
    const exchange = exchanges().opened({ inviter, token: onBoardingToken, expiresAt: verified.token.expiresAt, twoWay: verified.token.twoWay, peer })
    return { twoWay: exchange.twoWay }
}

/**
 * Once the network is up: ask the inviter for their card, and, when the token allows a
 * two-way exchange, for an invitation in case we share ours. Resent until we have what we
 * need (retryExchanges).
 */
export async function sendInvitationLinkRequest(inviter, onBoardingToken) {
    if (!exchanges().get(inviter)) return requestAddress(inviter, false, onBoardingToken, peerOf.get(inviter)) // asked for, as any request
    await writePlaceholder(inviter, onBoardingToken, peerOf.get(inviter))
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
    else await writePlaceholder(inviter, exchange.token, exchange.peer)
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
            const result = await deliver(exchange.inviter, exchange.peer, msg)
            if (result.delivered) {
                console.log(`sent the request of the invitation link to ${exchange.inviter}${needs.twoWay ? ', asking for an invitation' : ''}`)
            } else {
                // their app is in the background, or not reachable yet: the next round tries again
                console.log(`could not deliver the request of the invitation link to ${exchange.inviter}: ${result.error}`)
            }
        } catch (error) {
            console.log(`could not send the request of the invitation link to ${exchange.inviter}:`, error?.message)
        }
    }
    showWaiting()
    clearTimeout(exchangeTimer)
    if (again) exchangeTimer = setTimeout(() => void retryExchanges(), EXCHANGE_RETRY_MS)
}

/**
 * We ask somebody for their card: our request, with our book and an invitation into it,
 * goes peer to peer to their device (contact-protocol.js). A placeholder under the key of
 * their card waits in our book until the card arrives, and names the device and the time
 * of the request, so that a resend after a reload still names it (answered.js).
 *
 * @param _scannedAddress their DID
 * @param nopingpong set to true if Bob should not ask again to exchange the contacts if just happened (prevent the ping pong)
 * @param onBoardingToken if set we send an onBoardingToken back to Alice so she doesn't need a confirmation
 * @param peer their device (contact-address.js); else the one their own request came from
 * @returns {Promise<void>}
 */
export const requestAddress = async (_scannedAddress, nopingpong, onBoardingToken, peer) => {
    const scannedAddress = _scannedAddress.trim()

    try {
        console.log("request requestAddress from", scannedAddress);
        const device = devicesFor(scannedAddress, peer)[0]
        if (!device) {
            console.log(`could not ask ${scannedAddress}: we know no device of theirs`)
            notify(t('notify.noDevice'), 'warning')
            return
        }
        // the invitation lets the recipient write their card into our address book
        const now = Date.now()
        const msg = await addressRequest(scannedAddress, { onBoardingToken, nopingpong, now })
        requestedAt.set(scannedAddress, now)
        delivered.delete(scannedAddress)

        await writePlaceholder(scannedAddress, onBoardingToken, device, now)

        const result = await deliver(scannedAddress, device, msg)
        if (result.delivered) {
            delivered.add(scannedAddress)
            console.log(`sent a request to ${scannedAddress}`)
            notify(t('notify.requestSent'));
        } else {
            // their app is in the background, or not reachable yet: the worker tries again
            console.log(`could not deliver the request to ${scannedAddress}: ${result.error}`)
            notify(t('notify.requestNotDelivered'), 'warning');
        }
        startInvitationCheckWorker()
    } catch (error) {
        console.error('Error in requestAddress:', error);
    }
}

/**
 * A placeholder under the key their card will have, naming their device and when we
 * asked; a card we already have stays. A placeholder of an earlier request is renewed.
 */
async function writePlaceholder(did, onBoardingToken, peer, askedAt) {
    const existing = await _dbMyAddressBook.get(contactKey(did))
    if (existing && !isPlaceholder(existing.value, did)) return
    const dummyContact = { _id: contactKey(did), owner: did, firstName: 'invited', lastName: did }
    if (onBoardingToken !== undefined) dummyContact.onBoardingToken = onBoardingToken
    if (peer !== undefined) dummyContact.peer = peer
    if (askedAt !== undefined) dummyContact.requestedAt = askedAt
    if (existing && JSON.stringify({ ...existing.value, ...dummyContact }) === JSON.stringify(existing.value)) return
    await _dbMyAddressBook.put({ ...(existing?.value ?? {}), ...dummyContact })
    await getAddressRecords()
}

/**
 * Resends our requests that did not reach their recipient: their app was in the
 * background, or not reachable yet. One that arrived (a receipt came back) is not resent;
 * the card comes by OrbitDB. The interval grows: 10 seconds, then 20, 30 and so on.
 */
function startInvitationCheckWorker() {

    let iteration = 0; // Track the current iteration
    const executeWorker = async () => {
        console.log("Checking for 'invited' contacts to resend requests...");

        // a card of somebody we removed is no placeholder, whatever it says: a resend would invite them again (#82)
        const allContacts = await countingRecords();
        // the links we opened resend by themselves (retryExchanges)
        const invitedContacts = allContacts.filter((contact) =>
            contact.value.firstName === 'invited' &&
            !exchanges().get(contact.value.owner) &&
            !delivered.has(contact.value.owner) &&
            devicesFor(contact.value.owner, contact.value.peer).length > 0)

        if (invitedContacts.length === 0) {
            console.log("No 'invited' contacts found. Worker will not schedule further checks.");
            return; // Stop scheduling further executions
        }

        for (const contact of invitedContacts) {
            const owner = contact.value.owner
            // a new message each time: the recipient drops one it has seen before; it names the
            // request it repeats, so a recipient who answered that one is not asked again
            const msg = await addressRequest(owner, {
                onBoardingToken: contact.value.onBoardingToken || undefined,
                resentOf: contact.value.requestedAt ?? requestedAt.get(owner)
            })
            const result = await deliver(owner, contact.value.peer, msg)
            if (result.delivered) {
                delivered.add(owner)
                console.log(`Resent address request to ${owner}`);
            } else {
                console.log(`could not resend the request to ${owner}: ${result.error}`);
            }
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
 * @param {{ waitForPlaceholder?: boolean, to?: { firstName?: string, lastName?: string } }} options
 *   waitForPlaceholder false: the requester wrote no placeholder for us (the answer to our
 *   invitation link, #86); to: the name their request carries, for the notice
 *   ("Your card is on its way to Carol.")
 * @returns {Promise<string | undefined>} the entry's hash, if we wrote one
 */
export async function writeMyAddressIntoRequesterDB(requesterDB, invitation, { waitForPlaceholder = true, to } = {}) {
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
        console.log(`wrote our card into ${requesterDB.address}:`, hash)
        // the name their signed request carries
        const name = to?.firstName || to?.lastName
        notify(name ? t('notify.cardWritten', { name }) : t('notify.cardWrittenNameless'));
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
    // with this device in it, so that contacts reach it (devices.js)
    const withThisDevice = withDevice(card, _libp2p?.peerId?.toString()) ?? card
    await _dbMyAddressBook.put(withThisDevice)
    await getAddressRecords()
    await writeMyCardIntoFollowedBooks(withThisDevice)
}

/**
 * Our contact data changed: replace our card in every address book we were invited into.
 *
 * The books are looked up again first. The list was made when we last answered or opened
 * a request; a contact's card that arrived since (with the address of their book) was not
 * in it, so a change of ours did not reach them until the app was opened again.
 *
 * @param ownCard our card as shown in our own address book
 */
export async function writeMyCardIntoFollowedBooks(ownCard) {
    const me = _orbitdb?.identity?.id
    if (me) await initReplicationBackup(me)
    for (const followed of _followList ?? []) {
        if (!followed.db) continue
        try {
            // its owner removed us (#82): our card stays out, the one we have of theirs stays here
            if (await removedUs(followed.db, me)) {
                console.log(`not updating our card in ${followed.db.address}: its owner removed us`)
                continue
            }
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
 * What they already received stays with them.
 *
 * Their invitation into our book is revoked first (#82, revocations.js): a card they write
 * back with it does not count, until we invite them again.
 *
 * @param did the contact's DID
 */
export async function removeContact(did) {
    const me = _orbitdb?.identity?.id
    if (!did || did === me) return
    await revoke(_dbMyAddressBook, did, { owner: me })
    console.log(`revoked the invitation of ${did}`)
    // a link of theirs we opened is resent no more: each resend would invite them again
    exchanges().forget(did)
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

/**
 * An invitation for `did` to write their card into our address book. Inviting somebody
 * we removed lifts the revocation (#82): their card counts again.
 */
async function invite(did) {
    const invitation = await createInvitation(await signer(), _orbitdb.identity.id, did)
    if (await liftRevocation(_dbMyAddressBook, did)) {
        console.log(`lifted the revocation of ${did}: we invite them again`)
        await getAddressRecords()
    }
    return invitation
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