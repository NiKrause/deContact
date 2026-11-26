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
        L["libp2p 3<br/>WebSockets · WebRTC · circuit relay<br/>gossipsub · pubsub peer discovery"]
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
| **libp2p** | Connections between browsers and relays: WebSockets to the relay, WebRTC between browsers, circuit relay as fallback, gossipsub for messages and peer discovery |
| **Helia** | Content-addressed blocks (OrbitDB entries, manifests) over bitswap, stored in IndexedDB (LevelDB) |
| **OrbitDB** | One `documents` database per address book, a CRDT log that merges concurrent writes |
| **Passkey vault** | One root secret, opened by any of your passkeys or your recovery words ([below](#identity-passkeys-and-the-vault)) |
| **did:key** | Ed25519 identity derived from the vault's root. It signs OrbitDB entries, requests and invitations; its X25519 counterpart is the key cards and requests are sealed to |
| **orbitdb-relay** | Circuit relay, discovery hub and an always-on replica of the address books |

## Identity: passkeys and the vault

deContact has no seed phrase any more ([#60](https://github.com/NiKrause/deContact/issues/60)). A passkey opens a **vault** that holds one 32-byte root, and the identity is derived from that root. The vault, the keeper and the signer come from [`@le-space/orbitdb-identity-provider-webauthn-did`](https://github.com/Le-Space/orbitdb-identity-provider-webauthn-did) (0.14.0); Le-Space/belege keeps its books in the same vault. The glue is in [`src/lib/identity`](../src/lib/identity).

```mermaid
flowchart LR
    PK1["passkey 1<br/>(the first)"] -- "PRF output" --> S1["slot 1"]
    PK2["passkey 2<br/>(security key, other device)"] -- "PRF output" --> S2["slot 2"]
    W["24 recovery words<br/>(BIP39, on paper)"] -- "BIP39 seed" --> S3["words slot"]
    S1 & S2 & S3 --> VK["vault key"] --> ROOT["root<br/>= passkey 1's PRF output"]
    ROOT -- "HKDF 'decontact/identity/v1'" --> DID["Ed25519 did:key<br/>OrbitDB identity, signs requests and invitations"]
    DID -- "its X25519 counterpart" --> X["X25519 key<br/>opens what is sealed to the DID"]
```

- **One prompt per session.** Unlocking reads the passkey's PRF output once (`readPrfOutput`). The same output opens the vault slot, and the identity comes from the root inside; nothing asks the passkey again. Creating an address book takes two prompts (register, read the PRF output); the second is announced by `<passkey-step-dialog>`.
- **The root.** A new vault takes the first passkey's PRF output as its root, as Belege does. That passkey alone restores everything on an empty device, whether it is synced (iCloud, Google, a password manager) or a security key.
- **One identity for every passkey.** `createSecretSigner(root, { info: 'decontact/identity/v1' })` gives an Ed25519 `did:key` that belongs to no single passkey. Every slot opens the same root, so every passkey writes as the same DID: the DID that owns the address book in the access controller and under which contacts keep the card (`contact:<DID>`). OrbitDB gets it through `OrbitDBWebAuthnIdentityProviderFunction({ signer })`; peers and relays verify it as the provider's `webauthn` identity type.
- **Memory only.** OrbitDB's keystore is `createSessionKeystore({ signer })`: no key lands in IndexedDB. The vault key, the root, the identity's key and its X25519 key ([below](#encryption-sealed-to-the-reader)) live in the page's memory until it closes.
- **What the browser keeps.** The vault record in `localStorage` (`decontact.vaults.v1`): public JSON with the root sealed under a random vault key and one slot per passkey (the vault key sealed under a key derived from that passkey's PRF output). It names each slot's credential id and label, nothing secret. The E2E tests scan `localStorage`, `sessionStorage` and IndexedDB for the root, the identity's key, its X25519 key and the vault key.
- **More passkeys.** Under **Settings** a passkey can be added (two prompts) and removed. A removed passkey is refused on this device, but it has seen the root: removing revokes nothing it already opened.
- **Recovery words.** Under **Settings**, 24 BIP39 words become one more slot (filed under a fixed id, so one set per vault). They are shown once and never stored; replacing them makes the old words useless.

### A device that has nothing yet

A new device finds the vault record in one of three places, and the keeper's `find` asks all of them on every unlock:

| Where | How it gets there |
|---|---|
| **OrbitDB, through the relay** | After every unlock and every change the record is published in an OrbitDB event log per slot, named after the slot's lookup id (derived from the slot's secret, so only its holder can name it). The relay replicates it like an address book. Anybody may append, but only a record that opens with the slot's key is taken. |
| **Device link** | **Settings → Link another device**: a link (and QR code) with the record in the URL fragment, which never reaches a server. |
| **Vault file** | **Settings → Download vault file**, imported on the new device's first screen. |

- With the **first passkey**: its PRF output is the root, so the identity comes back even if no record is found.
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
- **Cards.** A document keeps in the clear what the [access controller](#who-may-write-into-an-address-book) checks: its `_id`, and on a contact's card also `owner` and `invitation`. Everything else (names, address, email, the address of the writer's own book) goes into `sealed`. The controller and its rules did not change, so relays still check every entry without a key. OrbitDB's own `encryption.data` is not used: it seals the whole payload, and a relay without the key would see no key, owner or invitation and would refuse every contact's card.
- **Requests.** The signed request is sealed to the recipient and published as `{ v: 3, sealed }` on the recipient's topic. Inside are the signed request and the sender's name (first name, last name, city), because the recipient can no longer read the sender's book to see who asks.
- **Removing a contact.** Deleting somebody's card under **Contacts** removes our card from their book, so no later change of ours reaches them, and removes their card, placeholder and book from ours. What they already received stays with them.
- **Entries from before.** Documents of the own book that were written in the clear before this change are sealed again when the app starts. The log keeps the old plaintext entries.

What stays visible:

- **Who writes into whose book, and when.** An address book's address follows from its owner's DID. Whoever opens it sees which identities wrote entries, the `_id`s (a contact's card is `contact:<their DID>`), the invitations and the entry sizes. A request shows its recipient (the topic), its time and the sender's libp2p peer id.
- **What a contact received stays theirs.** Removing them stops the updates; it cannot take back what they saw. Their invitation into our book also stays valid: revoking it needs a change of the access controller.
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

    Bob->>BB: scan / paste Alice's DID
    BB->>BB: write placeholder contact:did(Alice) into Bob's book
    BB->>AB: REQUEST_ADDRESS {Bob's book address, invitation for Alice, Bob's name},<br/>signed with Bob's did:key, sealed to Alice's<br/>gossipsub topic /dContact/3/message/proto/did(Alice)

    AB->>R: open Bob's book by its address
    R-->>AB: manifest + entries (from the relay's replica or from Bob)
    AB->>Alice: "Bob requests your contact data"
    Alice->>AB: Send my contact data
    AB->>AB: wait until the placeholder has synced
    AB->>BB: write card contact:did(Alice) + invitation into Bob's book,<br/>sealed to Bob (OrbitDB sync: directly or through the relay)
    Note over R: the relay checks the entry with the same<br/>access controller and keeps its replica (ciphertext)

    AB->>BB: REQUEST_ADDRESS {Alice's book address, invitation for Bob, Alice's name}, sealed to Bob
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

A peer subscribed to the topic sees that something was sent to the recipient, when, and from which libp2p peer; not who sent it, the sender's book or their name ([#58](https://github.com/NiKrause/deContact/issues/58), finding 3).

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
    BB->>BB: passkey → identity, check the token against did(Alice),<br/>placeholder contact:did(Alice) into Bob's book
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
- **The form.** While Alice's card is on its way, Bob's app shows the form: email, first name and last name first, the address behind *Add address*. The email alone is enough. Bob chooses **Save and share with Alice** or **Save only**; a link without a two-way exchange, or one whose token does not check out against the DID in it, offers only **Save**. No request dialog appears during the onboarding: a request of Alice's that arrives before Bob saves waits for his choice, and *Save only* declines it, as Cancel does in the dialog. Bob's app writes no placeholder card of his own (his DID as the last name) anywhere.
- **Sharing back without being asked.** Bob may write into Alice's book only with an invitation she signed for his DID, and she cannot sign one before she knows it. So, when the token allows a two-way exchange, Bob's request carries `twoWay: true`: "send me an invitation, in case I share". For her own valid token and its first invitee, Alice's device answers without asking: a request with her invitation, `nopingpong` and the same token, which tells Bob's app what it answers. It writes no placeholder for Bob into her book and does not resend. Bob's app asks for the invitation together with the card, so that it is there while Alice still holds her phone, and uses it only if he shares. After *Save and share* it asks until the invitation has arrived.
- **Waiting for Alice's phone.** A PWA in the background misses pubsub messages. Bob's app resends the request with the same token every 15 seconds until Alice's card (and, after *Save and share*, her invitation) has arrived, until the token expires, and says "Waiting for Alice's phone…" (with her DID until her card is there). His choice is kept in `localStorage` (`decontact.exchanges.v1`) until the token expires: an invitation that comes after a reload is used, or declined, without asking him again ([`exchanges.js`](../src/lib/network/exchanges.js)).
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

Where those replicas live, and when a relay keeps one: [Relays](relays.md).
