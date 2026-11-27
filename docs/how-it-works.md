# How deContact works

[README](../README.md) · **How it works** · [Relays](relays.md) · [Configuration](configuration.md) · [Development](development.md)

- [Architecture](#architecture)
- [Identity: passkeys and the vault](#identity-passkeys-and-the-vault)
- [Encryption: sealed to the reader](#encryption-sealed-to-the-reader)
- [Exchanging contact data](#exchanging-contact-data)
- [Who may write into an address book](#who-may-write-into-an-address-book)

## Architecture

```mermaid
flowchart LR
    subgraph Browser["Browser (SvelteKit PWA)"]
        UI["UI<br/>contacts, QR, settings"]
        ODB["OrbitDB 4<br/>documents DB per address book"]
        H["Helia 7<br/>bitswap + LevelDB blockstore"]
        L["libp2p 3<br/>WebSockets · WebRTC · circuit relay<br/>gossipsub · pubsub peer discovery<br/>/decontact/request/1.0.0"]
        UI --> ODB --> H --> L
    end

    subgraph Relay["orbitdb-relay"]
        CR["circuit relay v2"]
        REP["replicas of the address books<br/>(sealed; checked with the same access controller)"]
    end

    ALEPH[("Aleph network<br/>relay registrations")]

    L -- "wss / relayed circuit" --> CR
    L -. "WebRTC (direct)" .-> L2["another browser"]
    L -- "find relays<br/>@le-space/aleph-bootstrap" --> ALEPH
    ODB -- "heads + blocks" --> REP
```

| Layer | Used for |
|---|---|
| **libp2p** | Connections between browsers and relays: WebSockets to the relay, WebRTC between browsers, circuit relay as fallback, gossipsub for OrbitDB and peer discovery, and deContact's own protocol for [contact requests](#requests), peer to peer |
| **Helia** | Content-addressed blocks (OrbitDB entries, manifests) over bitswap, stored in IndexedDB (LevelDB) |
| **OrbitDB** | One `documents` database per address book, a CRDT log that merges concurrent writes. 4.0.0 with a [sync patch](#orbitdb-sync-patch) |
| **Passkey vault** | One root secret, opened by any of your passkeys or your recovery words ([below](#identity-passkeys-and-the-vault)) |
| **did:key** | Ed25519 identity derived from the vault's root. It signs OrbitDB entries, requests and invitations; its X25519 counterpart is the key cards and requests are sealed to |
| **orbitdb-relay** | Circuit relay, discovery hub and an always-on replica of the address books |

### OrbitDB sync patch

Until [orbitdb/orbitdb#1260](https://github.com/orbitdb/orbitdb/pull/1260) is released, deContact applies it to `@orbitdb/core` 4.0.0 as a pnpm patch ([`patches/@orbitdb__core@4.0.0.patch`](../patches/@orbitdb__core@4.0.0.patch), `pnpm.patchedDependencies`). It changes only `src/sync.js`, for a reader that reaches a writer only through a third peer such as a relay ([orbitdb#1255](https://github.com/orbitdb/orbitdb/issues/1255)), which is the usual case at a conference, with a phone on mobile data:

- heads learnt through the heads exchange are announced on the topic once, so a peer in the middle passes them on;
- on opening a database, the heads are exchanged with peers that were already subscribed, the relay included;
- the heads handler is registered before subscribing, so an early dial finds it;
- `join` is emitted once per peer;
- heads dials run outside the database's queue: a dial that hangs on a peer reachable only through a relay circuit no longer holds up the exchange with the relay.

The patch applies to every OrbitDB in this repository, the E2E tests' local relay included. Le Space's relays on Aleph run orbitdb-relay with its own OrbitDB, which republishes the heads it syncs by itself.

## Identity: passkeys and the vault

deContact has no seed phrase any more ([#60](https://github.com/NiKrause/deContact/issues/60)). A passkey opens a **vault** that holds one 32-byte root, and the identity is derived from that root. The vault, the keeper and the signer come from [`@le-space/orbitdb-identity-provider-webauthn-did`](https://github.com/Le-Space/orbitdb-identity-provider-webauthn-did) (0.14.0); Le-Space/belege keeps its books in the same vault. The glue is in [`src/lib/identity`](../src/lib/identity).

```mermaid
flowchart LR
    PK1["passkey 1<br/>(the first)"] -- "PRF output" --> S1["slot 1"]
    PK2["passkey 2<br/>(security key, other device)"] -- "PRF output" --> S2["slot 2"]
    W["24 recovery words<br/>(BIP39, on paper)"] -- "BIP39 seed" --> S3["words slot"]
    S1 & S2 & S3 --> VK["vault key"] --> ROOT["root<br/>= passkey 1's PRF output,<br/>or a temporary identity's"]
    ROOT -- "HKDF 'decontact/identity/v1'" --> DID["Ed25519 did:key<br/>OrbitDB identity, signs requests and invitations"]
    DID -- "its X25519 counterpart" --> X["X25519 key<br/>opens what is sealed to the DID"]
```

- **One prompt per session.** Unlocking reads the passkey's PRF output once (`readPrfOutput`). The same output opens the vault slot, and the identity comes from the root inside; nothing asks the passkey again. Creating an address book takes two prompts (register, read the PRF output); the second is announced by `<passkey-step-dialog>`.
- **The root.** A new vault takes the first passkey's PRF output as its root, as Belege does. That passkey alone restores everything on an empty device, whether it is synced (iCloud, Google, a password manager) or a security key. An identity that began without a passkey after an invitation link has a random root instead ([below](#starting-without-a-passkey)).
- **One identity for every passkey.** `createSecretSigner(root, { info: 'decontact/identity/v1' })` gives an Ed25519 `did:key` that belongs to no single passkey. Every slot opens the same root, so every passkey writes as the same DID: the DID that owns the address book in the access controller and under which contacts keep the card (`contact:<DID>`). OrbitDB gets it through `OrbitDBWebAuthnIdentityProviderFunction({ signer })`; peers and relays verify it as the provider's `webauthn` identity type.
- **Memory only.** OrbitDB's keystore is `createSessionKeystore({ signer })`: no key lands in IndexedDB. The vault key, the root, the identity's key and its X25519 key ([below](#encryption-sealed-to-the-reader)) live in the page's memory until it closes.
- **What the browser keeps.** The vault record in `localStorage` (`decontact.vaults.v1`): public JSON with the root sealed under a random vault key and one slot per passkey (the vault key sealed under a key derived from that passkey's PRF output). It names each slot's credential id and label, nothing secret. The E2E tests scan `localStorage`, `sessionStorage` and IndexedDB for the root, the identity's key, its X25519 key and the vault key.
- **More passkeys.** Under **Settings** a passkey can be added (two prompts) and removed. A removed passkey is refused on this device, but it has seen the root: removing revokes nothing it already opened.
- **Recovery words.** Under **Settings**, 24 BIP39 words become one more slot (filed under a fixed id, so one set per vault). They are shown once and never stored; replacing them makes the old words useless.

### Starting without a passkey

At a conference stand the exchange should take seconds, and creating a passkey on a new phone does not ([#97](https://github.com/NiKrause/deContact/issues/97)). So a browser that keeps no vault and opens an [invitation link](#invitation-links) shows the form at once, and the passkey comes after the exchange.

```mermaid
sequenceDiagram
    autonumber
    actor Bob
    participant BB as Bob's browser
    participant AB as Alice's browser

    Bob->>BB: opens Alice's link: the form, no passkey prompt
    Bob->>BB: starts on the form
    BB->>BB: random root in memory → did:key, X25519 key
    BB->>AB: the exchange as always, under that DID
    AB->>BB: Alice's card
    BB->>Bob: "Keep this contact? Secure it with a passkey."
    Bob->>BB: Secure with a passkey (two prompts)
    BB->>BB: the root sealed into a new vault, its record published:<br/>same DID, same books, nothing migrated
```

- **A temporary identity.** Once the person starts on the form, the app takes a random 32-byte root, in the page's memory only, and derives the Ed25519 `did:key` and its X25519 key from it as from a vault's root (`createSecretSigner(root, { info: 'decontact/identity/v1' })`). OrbitDB runs with `createSessionKeystore`, as for a vault identity. Only then is Alice asked: **Already have a deContact passkey? Sign in** on the form, before that, opens the link again with the passkey screen first, and the link's one-time token is still unused.
- **The exchange as always**, under that DID: Alice invites it, Bob's card goes to `contact:<DID>` in her book, and his book is the book of that DID.
- **The passkey afterwards.** Once a contact's card has arrived, the app offers: "Keep this contact? Secure it with a passkey." *Not now* puts the offer away until another contact arrives or three minutes pass; **Settings** offers it all the time. Creating the passkey (two prompts) seals the temporary root into a new vault (`rootPayload(root)` in that passkey's slot), publishes the vault record as after every change, and turns the session into a vault session without opening anything again. The DID stays, so Alice's invitation, Bob's book and his card in hers stay valid.
- **Two more ways back in**, offered right after and skippable: recovery words, should the passkey be lost, and the vault file, should the network not have the record. The passkey's PRF output is not this vault's root, so restoring it on an empty device needs the record ([below](#a-device-that-has-nothing-yet)).
- **Nothing kept while temporary.** No vault is written, and what the app otherwise keeps in `localStorage` (the links opened, `decontact.exchanges.v1`, and the links issued) is held in memory too ([`held-storage.js`](../src/lib/identity/held-storage.js)), and written once the identity is secured. IndexedDB holds what OrbitDB and Helia write for any identity: the public identity document and the book's entries, whose cards are sealed. The E2E test scans `localStorage`, `sessionStorage` and IndexedDB during the temporary phase, and checks that scan against the root once the passkey has sealed it.
- **Closing the tab** before the passkey loses Bob's side of the exchange; Alice keeps his card. Once his book holds something, the app warns before the tab closes (`beforeunload`), until the identity is secured.
- **A browser that keeps a vault** opens an invitation link with the passkey screen, as before.

### A device that has nothing yet

A new device finds the vault record in one of three places, and the keeper's `find` asks all of them on every unlock:

| Where | How it gets there |
|---|---|
| **OrbitDB, through the relay** | After every unlock and every change the record is published in an OrbitDB event log per slot, named after the slot's lookup id (derived from the slot's secret, so only its holder can name it). The relay replicates it like an address book. Anybody may append, but only a record that opens with the slot's key is taken. |
| **Device link** | **Settings → Link another device**: a link (and QR code) with the record in the URL fragment, which never reaches a server. |
| **Vault file** | **Settings → Download vault file**, imported on the new device's first screen. |

- With the **first passkey**: its PRF output is the root, so the identity comes back even if no record is found - except for an identity that [began without a passkey](#starting-without-a-passkey), whose record must be found as for any other slot.
- With a **second passkey** or the **recovery words**: the record must be found, then it opens. A device whose passkey does not sync opens it with the words and adds its own passkey under **Settings**.
- A passkey that opens nothing gets no new address book without the person saying so.

### Moving from the seed phrase

A browser that still has a seed phrase loses it on the first start: `seedPhrase`, `seed` and the old OrbitDB keystore (`./orbitdb/identities`) are deleted, and the first screen says so. The seed's DID is not the vault's, so the old identity and its address book are not carried over (deContact is a prototype).

## Encryption: sealed to the reader

Only the owner of an address book reads it ([#59](https://github.com/NiKrause/deContact/issues/59)). Bob writes his card into Alice's book, but he reads Alice's card in **his own** book, where she wrote it. Followers and relays replicate a book to keep it available, never to read it. So every document is sealed to the owner of the book it sits in, whoever writes it, and every request to its recipient. The code is in [`src/lib/encryption`](../src/lib/encryption).

| In Alice's book | Written by | Sealed to | Read by |
|---|---|---|---|
| her own card, placeholders, the books she was invited into | Alice | Alice | Alice's devices |
| Bob's card (`contact:<Bob's DID>`, with Alice's invitation) | Bob | Alice | Alice's devices |
| the whole log | | | replicated by the relay and by followers as a backup: ciphertext |

- **The key is the DID.** The X25519 counterpart of an Ed25519 `did:key` is its key-agreement key (the did:key method defines it, libsodium calls it `crypto_sign_ed25519_pk_to_curve25519`). Anybody works it out from the DID alone. So there is no key directory, nothing to look up before the first request, and no key anybody could register under somebody else's DID. The private half comes from the same seed as the identity's Ed25519 key (`deriveSubkey(root, 'decontact/identity/v1')`), so every passkey and every device has it. It is imported into WebCrypto as a key that cannot be extracted.
- **A seal.** A fresh ephemeral X25519 key pair; HKDF-SHA256 over the shared secret, with both public keys as salt and `decontact/seal/v1` as info; AES-GCM-256 with a fresh nonce. The additional data names what was sealed and where it belongs (the book's owner and the document's `_id`, or the request's recipient): a seal moved elsewhere does not open there. Ported from simple-todo `privacy01` (`key-wrapping.js`, `db-encryption.js`).
- **Cards.** A document keeps in the clear what the [access controller](#who-may-write-into-an-address-book) checks: its `_id`, and on a contact's card also `owner` and `invitation`. Everything else (names, address, email, [photo](#what-a-card-holds), the address of the writer's own book) goes into `sealed`. The controller and its rules did not change, so relays still check every entry without a key. OrbitDB's own `encryption.data` is not used: it seals the whole payload, and a relay without the key would see no key, owner or invitation and would refuse every contact's card.
- **Requests.** The signed request is sealed to the recipient and [delivered to their device](#requests) as `{ v: 3, sealed }`. Inside are the signed request and the sender's name (first name, last name, city), because the recipient can no longer read the sender's book to see who asks.
- **Removing a contact.** Deleting somebody's card under **Contacts** removes our card from their book, so no later change of ours reaches them, and removes their card, placeholder and book from ours. It also [revokes their invitation](#removing-a-contact-revokes-their-invitation) into our book. What they already received stays with them.
- **Entries from before.** Documents of the own book that were written in the clear before this change are sealed again when the app starts. The log keeps the old plaintext entries.

### What a card holds

| Field | | In the clear? |
|---|---|---|
| `_id` | `contact:<DID>` on a contact's card | yes |
| `owner`, `invitation` | the writer's DID and the owner's signed invitation, on a contact's card | yes |
| `firstName`, `lastName`, `email`, `street`, `postalCode`, `city`, `countryRegion`, `category` | what the person typed | no, sealed |
| `photo` | a small photo, see below | no, sealed |
| `sharedAddress` | the address of the writer's own book | no, sealed |
| `own` | marks the owner's own card, only in the owner's book | no, sealed |

**The photo** ([#87](https://github.com/NiKrause/deContact/issues/87)). Under **My Address**, *Choose photo* takes a picture from the phone's camera or gallery, or a file. The app crops it to its centre square, scales it to 256 × 256 pixels on a canvas and encodes it as WebP, or as JPEG where the browser does not encode WebP (Safari). It lowers the quality until the image fits into 30 KB. Encoding a canvas writes the pixels and nothing else, so the EXIF block of the original, with any location, does not survive. The card carries the photo as a data URL (`data:image/webp;base64,…`) under `photo`, sealed with the name and the address: it travels through the relays like the rest of the card, arrives while its owner is offline, and only the card's reader opens it. *Remove photo* and *Update* take it off the card in every book. The photo shows in the contact list, in a contact's details and on the [onboarding](#invitation-links) screen once the inviter's card has arrived ([`photo.js`](../src/lib/photo/photo.js)).

- **Size.** A card with a photo of 30 KB is below 60 KB sealed (base64 twice: the data URL, then the seal). libp2p streams, gossipsub and bitswap accept 4 MiB for one message, and orbitdb-relay sets no limit of its own on entries. Every update of a card writes the photo into the log again; the cap keeps that small.
- **Only a photo is shown.** A card comes from its owner's app, which may be any app. A `photo` is shown only if it is a WebP or JPEG data URL of at most 64 KB; a link (which would load something from elsewhere when shown), an SVG or anything bigger is not.
- **Later.** A separate block over IPFS/Bitswap, encrypted with its own key that goes into the sealed card, would allow bigger images and avoid rewriting the photo on every update. A relay would need to keep such blocks, which it cannot see inside a sealed card.

What stays visible:

- **Who writes into whose book, and when.** An address book's address follows from its owner's DID. Whoever opens it sees which identities wrote entries, the `_id`s (a contact's card is `contact:<their DID>`), the invitations and the entry sizes. A request shows its recipient (the topic), its time and the sender's libp2p peer id.
- **What a contact received stays theirs.** Removing them stops the updates; it cannot take back what they saw.
- **Whom we removed.** A [revocation](#removing-a-contact-revokes-their-invitation) is the document `revoked:<their DID>`: whoever opens our book sees that we removed that DID, and when the entry was written ([#85](https://github.com/NiKrause/deContact/issues/85)).
- **One secret for signing and decrypting.** The identity's Ed25519 key and its X25519 key are one secret. If it leaks, both leak. Reusing it this way is established practice (did:key, libsodium, age), and both would come from the same root anyway.

## Exchanging contact data

Bob scans Alice's DID. Each then writes their own card into the other's address book. (Opening Alice's [invitation link](#invitation-links) instead goes without a dialog.)

```mermaid
sequenceDiagram
    autonumber
    actor Alice
    participant AB as Alice's browser
    participant R as orbitdb-relay
    participant BB as Bob's browser
    actor Bob

    Note over AB,BB: On start: passkey → vault → root → did:key → OrbitDB identity + own address book
    AB->>R: connect (wss), reserve a circuit slot
    BB->>R: connect (wss), reserve a circuit slot
    AB-->>BB: find each other via pubsub peer discovery,<br/>connect over WebRTC (or the relayed circuit)

    Bob->>BB: scan Alice's QR code: her DID and her device (peer id)
    BB->>BB: write placeholder contact:did(Alice) into Bob's book
    BB->>AB: stream /decontact/request/1.0.0 to Alice's peer (WebRTC or the relayed circuit):<br/>REQUEST_ADDRESS {Bob's book address, invitation for Alice, Bob's name},<br/>signed with Bob's did:key, sealed to Alice
    AB-->>BB: receipt: received

    AB->>R: open Bob's book by its address
    R-->>AB: manifest + entries (from the relay's replica or from Bob)
    AB->>Alice: "Bob requests your contact data"
    Alice->>AB: Send my contact data
    AB->>AB: wait until the placeholder has synced
    AB->>BB: write card contact:did(Alice) + invitation into Bob's book,<br/>sealed to Bob (OrbitDB sync: directly or through the relay)
    Note over R: the relay checks the entry with the same<br/>access controller and keeps its replica (ciphertext)

    AB->>BB: REQUEST_ADDRESS {Alice's book address, invitation for Bob, Alice's name}, sealed to Bob,<br/>to the peer Bob's request came from
    BB->>Bob: "Alice requests your contact data"
    Bob->>BB: Send my contact data
    BB->>AB: write card contact:did(Bob) + invitation into Alice's book, sealed to Alice

    Note over AB,BB: Later: Bob changes his address → BB rewrites contact:did(Bob)<br/>in every book he was invited into, using the stored invitation
```

### Requests

Every request is signed with the sender's `did:key`, the identity of their vault, then sealed to the recipient ([above](#encryption-sealed-to-the-reader)). The signature covers the sender, the recipient, the time, a random nonce, the sender's book address, the invitation, the sender's name and, for an [invitation link](#invitation-links), its token and whether the sender asks for an invitation (`twoWay`) ([`contact-messages.js`](../src/lib/network/contact-messages.js)). The recipient drops, without a dialog:

- anything that is not sealed to them, or does not have the shape of a request (`twoWay` without a token, for example);
- a request whose signature does not belong to the DID it names as sender;
- a request for somebody else, older or newer than 10 minutes, or seen before;
- a request whose book is not the sender's own (the owner in the book's manifest) or whose invitation is not the sender's.

From each sender only the newest request waits for an answer.

**Peer to peer.** A request goes to the recipient's device on deContact's own libp2p protocol, `/decontact/request/1.0.0` ([`contact-protocol.js`](../src/lib/network/contact-protocol.js)): one stream, over WebRTC or a relay's circuit, carrying the sealed request and, back, a receipt that it arrived and opened. There is no topic per DID any more, so no relay subscribes to anything for it and no third peer sees a request go by. A relay that carries the circuit sees that two peers talk, when and how much; the request itself is sealed end to end.

- **Whom to dial.** A DID does not say where its owner's app runs. The QR code names the device: the invitation link carries `&peer=<peer id>`, and the contact address for the Scan field is `<DID>?peer=<peer id>` ([`contact-address.js`](../src/lib/network/contact-address.js)). A DID alone reaches nobody; the app says so. The recipient answers to the peer the request came from. Where libp2p knows no address of that peer yet (pubsub peer discovery announces browsers every few seconds), it is dialled through each relay we are connected to: `<relay>/p2p-circuit/p2p/<peer>`, where browsers hold their reservations.
- **Resends.** An app in the background does not answer the protocol, so the sender's app tries again, with growing pauses, until a receipt comes back; after that, the card comes by OrbitDB. A resend names the request it repeats (`resentOf`, that request's timestamp by the sender's clock, signed with the rest; the placeholder keeps it across a reload). The recipient remembers the timestamp of the last request of that sender it answered in the dialog: a resend of that request or an earlier one asks nobody again, while a request made anew (scanning again, asking back) always asks ([`answered.js`](../src/lib/network/answered.js)).

### Invitation links

The onboarding at a conference ([#86](https://github.com/NiKrause/deContact/issues/86)): Alice shows a QR code, Bob opens the link, gets Alice's card at once, quickly types his own and decides whether Alice gets it too.

The QR code can carry a link instead of the bare DID: `#/onboarding/<Alice's DID>?onBoardingToken=…`. Its token is signed by Alice and holds a random nonce, an expiry (24 hours) and whether a **two-way exchange** is allowed: the option *Two-way exchange* in the QR dialog, on by default, says "Whoever scans this code can also share their contact details with you. They decide whether to." The device that created the link remembers it. Alice's card is not in the QR code: anybody who photographs the code would have it.

```mermaid
sequenceDiagram
    autonumber
    actor Alice
    participant AB as Alice's browser
    participant BB as Bob's browser
    actor Bob

    Alice->>AB: QR code, "Two-way exchange" on
    AB->>AB: sign a token {nonce, expiry, two-way}, remember it
    Bob->>BB: scan, open #/onboarding/did(Alice)?onBoardingToken=…
    BB->>BB: identity (a temporary one on a new device, #97), check the token against did(Alice),<br/>placeholder contact:did(Alice) into Bob's book
    loop every 15 s until Bob's app has what it needs, at most until the token expires
        BB->>AB: REQUEST_ADDRESS {Bob's book, invitation for Alice, token, twoWay},<br/>signed by Bob, sealed to Alice
    end
    Note over AB: Alice's own token, valid, two-way, Bob is its first invitee: no dialog
    AB->>BB: REQUEST_ADDRESS {Alice's book, invitation for Bob, token, nopingpong}, sealed to Bob
    AB->>BB: card contact:did(Alice) + invitation into Bob's book, sealed to Bob
    BB->>Bob: "Alice … was added to your address book", her invitation waits
    Bob->>BB: email, first and last name → "Save and share with Alice"
    BB->>AB: card contact:did(Bob) + invitation into Alice's book, sealed to Alice
    Note over BB: "Save only": the invitation is dropped,<br/>nothing of Bob's goes into Alice's book
```

- **The first person** who sends a request with the token gets Alice's card without a dialog. Anybody else, anybody after 24 hours, and a link created on another of Alice's devices make her app ask, as for any other request; the resends of a request she answered in the dialog ask her no second time.
- **The form.** While Alice's card is on its way, Bob's app shows the form; once it is there, her name and [photo](#what-a-card-holds) above it: email, first name and last name first, the address behind *Add address*. The email alone is enough. Bob chooses **Save and share with Alice** or **Save only**; a link without a two-way exchange, or one whose token does not check out against the DID in it, offers only **Save**. No request dialog appears during the onboarding: a request of Alice's that arrives before Bob saves waits for his choice, and *Save only* declines it, as Cancel does in the dialog. Bob's app writes no placeholder card of his own (his DID as the last name) anywhere.
- **Sharing back without being asked.** Bob may write into Alice's book only with an invitation she signed for his DID, and she cannot sign one before she knows it. So, when the token allows a two-way exchange, Bob's request carries `twoWay: true`: "send me an invitation, in case I share". For her own valid token and its first invitee, Alice's device answers without asking: a request with her invitation, `nopingpong` and the same token, which tells Bob's app what it answers. It writes no placeholder for Bob into her book and does not resend. Bob's app asks for the invitation together with the card, so that it is there while Alice still holds her phone, and uses it only if he shares. After *Save and share* it asks until the invitation has arrived.
- **Waiting for Alice's phone.** A PWA in the background does not answer the protocol. Bob's app resends the request with the same token every 15 seconds until Alice's card (and, after *Save and share*, her invitation) has arrived, until the token expires, and says "Waiting for Alice's phone…" (with her DID until her card is there). His choice is kept in `localStorage` (`decontact.exchanges.v1`; in memory until a [temporary identity](#starting-without-a-passkey) is secured) until the token expires: an invitation that comes after a reload is used, or declined, without asking him again ([`exchanges.js`](../src/lib/network/exchanges.js)).
- **Both ways stay current.** Alice remembers Bob's book (a hidden record in hers), so a later change of her card reaches him even when he saved only. After *Save and share* his changes reach her the same way.
- **Apps from before #86.** The token's format did not change; its last field was "request address from peer". An older app that opens a new link gets Alice's card only. A request from an older app of Alice's, which asked Bob back on its own, waits for his choice like any request of hers.

## Who may write into an address book

Every address book uses the OrbitDB access controller `decontact-address-book`, published as [`@le-space/orbitdb-access-controller-decontact`](../packages/orbitdb-access-controller-decontact). The app and the relays register the same controller, so all of them accept the same entries:

| Writer | May write |
|---|---|
| The owner, on any device with the owner's DID | anything |
| An invited contact | only their own card: key `contact:<their DID>`, `owner` set to their DID, carrying an **invitation the owner signed** with the Ed25519 key of their `did:key`. These fields stay in the clear; the rest of the card is sealed to the owner |
| Anybody else | nothing |

A request for contact data carries the invitation for the recipient. The owner's DID is stored in the database manifest, so a relay can check entries without asking anybody.

The end-to-end test [`WriteAccess.spec.js`](../tests/WriteAccess.spec.js) proves these rules through the app and the relay ([#81](https://github.com/NiKrause/deContact/issues/81)): somebody who was not invited cannot write their own card, the owner's card or any other document, nor delete one; an invited contact cannot overwrite the owner's card or write a card under another DID. Each write is refused in the writer's browser, and a fresh browser that opens the book through the relay alone finds none of them. It writes through `window.__decontactE2E`, a hook only the build for the tests has ([`e2e-hook.js`](../src/lib/network/e2e-hook.js)); CI checks that the production build, and the one GitHub Pages publishes, contains none ([`check-production-build.mjs`](../scripts/check-production-build.mjs)).

### Removing a contact revokes their invitation

An invitation never expires: the access controller checks only that the owner signed it. So removing Bob ([#82](https://github.com/NiKrause/deContact/issues/82)) also revokes the invitation Alice once gave him, in the app and without changing the controller, the invitation format or the relays ([`revocations.js`](../src/lib/network/revocations.js)):

- **The revocation.** Alice's app writes `revoked:<Bob's DID>` into her own book: `_id`, her DID as `owner`, the time. It is sealed to her like every document, so only the `_id` stays in the clear. Only the owner may write a key other than `contact:<own DID>`, so Bob can neither write nor delete it.
- **Alice's app ignores Bob's card.** While the revocation is there, her address list and her backups leave out `contact:<Bob's DID>`, whenever and however often he writes it. That is sound because only Bob, or Alice herself, may write under that key.
- **Bob's app stops writing.** It sees `revoked:<Bob's DID>` in its copy of Alice's book, writes no update of his card there any more and shows no message. Alice's card, if he still has it, stays in his book. A link of Bob's that Alice opened is no longer resent to him: every resend would invite him again.
- **Inviting again.** Every request that carries an invitation for Bob (Alice scans him, answers his request and asks him back, or sends him an invitation for a two-way exchange) deletes the revocation first. His card counts again, the one he wrote in the meantime too, until his app replaces it.
- **What the relays do.** They check entries with the same controller and still accept a card under a revoked invitation; they store it, and Alice's app ignores it. Refusing it there needs the controller to see the book's state, a release of the package and of orbitdb-relay, and a redeploy ([#93](https://github.com/NiKrause/deContact/issues/93)). It would save storage only: an invited contact can write their card as often as they like anyway.

Where those replicas live, and when a relay keeps one: [Relays](relays.md).
