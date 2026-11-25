# How deContact works

[README](../README.md) · **How it works** · [Relays](relays.md) · [Configuration](configuration.md) · [Development](development.md)

- [Architecture](#architecture)
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
        REP["replicas of the address books<br/>(checked with the same access controller)"]
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
| **did:key** | Identity derived from the seed phrase. It signs OrbitDB entries and invitations |
| **orbitdb-relay** | Circuit relay, discovery hub and an always-on replica of the address books |

## Exchanging contact data

Bob scans Alice's DID. Each then writes their own card into the other's address book:

```mermaid
sequenceDiagram
    autonumber
    actor Alice
    participant AB as Alice's browser
    participant R as orbitdb-relay
    participant BB as Bob's browser
    actor Bob

    Note over AB,BB: On start: seed phrase → did:key → OrbitDB identity + own address book
    AB->>R: connect (wss), reserve a circuit slot
    BB->>R: connect (wss), reserve a circuit slot
    AB-->>BB: find each other via pubsub peer discovery,<br/>connect over WebRTC (or the relayed circuit)

    Bob->>BB: scan / paste Alice's DID
    BB->>BB: write placeholder contact:did(Alice) into Bob's book
    BB->>AB: REQUEST_ADDRESS {Bob's book address, invitation for Alice},<br/>signed with Bob's did:key<br/>gossipsub topic /dContact/3/message/proto/did(Alice)

    AB->>R: open Bob's book by its address
    R-->>AB: manifest + entries (from the relay's replica or from Bob)
    AB->>Alice: "Bob requests your contact data"
    Alice->>AB: Send my contact data
    AB->>AB: wait until the placeholder has synced
    AB->>BB: write card contact:did(Alice) + invitation into Bob's book<br/>(OrbitDB sync: directly or through the relay)
    Note over R: the relay checks the entry with the same<br/>access controller and keeps its replica

    AB->>BB: REQUEST_ADDRESS {Alice's book address, invitation for Bob}
    BB->>Bob: "Alice requests your contact data"
    Bob->>BB: Send my contact data
    BB->>AB: write card contact:did(Bob) + invitation into Alice's book

    Note over AB,BB: Later: Bob changes his address → BB rewrites contact:did(Bob)<br/>in every book he was invited into, using the stored invitation
```

### Requests

Every request is signed with the sender's `did:key`. The signature covers the sender, the recipient, the time, a random nonce, the sender's book address and the invitation ([`contact-messages.js`](../src/lib/network/contact-messages.js)). The recipient drops, without a dialog:

- anything that does not have the shape of a request;
- a request whose signature does not belong to the DID it names as sender;
- a request for somebody else, older or newer than 10 minutes, or seen before;
- a request whose book is not the sender's own (the owner in the book's manifest) or whose invitation is not the sender's.

From each sender only the newest request waits for an answer.

Requests are not encrypted yet: who asks whom, and the address of the requester's book, can be read by anybody subscribed to the topic ([#58](https://github.com/NiKrause/deContact/issues/58)).

### Invitation links

The QR code can carry a link instead of the bare DID. Its token is signed by the inviter and holds a random nonce, an expiry (24 hours) and whether the inviter asks back for the invitee's card. The device that created the link remembers it. The first person who sends a request with it gets the inviter's card without a dialog; their app may resend the request with the same token. Anybody else, and anybody after 24 hours, makes the inviter's app ask as for any other request. So does a link created on another of the inviter's devices.

## Who may write into an address book

Every address book uses the OrbitDB access controller `decontact-address-book`, published as [`@le-space/orbitdb-access-controller-decontact`](../packages/orbitdb-access-controller-decontact). The app and the relays register the same controller, so all of them accept the same entries:

| Writer | May write |
|---|---|
| The owner, on any device with the owner's DID | anything |
| An invited contact | only their own card: key `contact:<their DID>`, `owner` set to their DID, carrying an **invitation the owner signed** with the Ed25519 key of their `did:key` |
| Anybody else | nothing |

A request for contact data carries the invitation for the recipient. The owner's DID is stored in the database manifest, so a relay can check entries without asking anybody.

Where those replicas live, and when a relay keeps one: [Relays](relays.md).
