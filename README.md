[![Basic Tests](https://github.com/silkroadnomad/deContact/actions/workflows/main.yml/badge.svg)](https://github.com/silkroadnomad/deContact/actions/workflows/main.yml)

# deContact
A peer-to-peer address book in Svelte with local first protocol built on libp2p, Helia and OrbitDB

![dcontact-v0.2 (istanbul)](doc/dcontact-v0.2.jpg "dcontact-v0.2")

## Main Use Case
1. Address books on computers and phones are always outdated. We need a way to automatically update contact data as somebody is moving to a new place.
2. I don't like to host my data on Google, Amazon or Facebook any longer. 

## Features
- [x] Onboarding of a new user and account creation 
- [x] Backup seed on new device (Auto Device Sync)
- [x] Add my own contact data (private, business, other)
- [x] Contact List (see my own contact data and others (decentralized and traditional))
    - [x] Search in contact list
- [x] Request contact data by (scanning a) DID
- [x] Answer contact data request and write contact data in requesters db
- [x] Update own contact data and write updates into follower dbs
- [x] Backup of follower dbs (people who requested our contact data)
- [x] Backup of followed dbs (people which's contact data we requested)

## Developing
1. Clone this repository
2. npm i
3. `npm run relay` starts a local relay (`src/relay.js`, see below); put its WebSocket address into `VITE_SEED_NODES_DEV` in `.env` (see `.env.example`)
4. npm run dev

## Relay
`src/relay.js` is [orbitdb-relay](https://www.npmjs.com/package/orbitdb-relay) with deContact's access controller: a circuit relay through which browsers find each other, and a replica of every address book a browser opens. Contact data therefore arrives directly over WebRTC when two browsers can reach each other, and through the relay when they can't or aren't online at the same time.

### Relays on Aleph
Besides the relays in `VITE_SEED_NODES`, the app looks up the orbitdb-relays that Le Space has registered on Aleph (`@le-space/aleph-bootstrap`, profile `orbitdb-relay`).
- It asks `https://api.aleph.im` for the registrations.
- It then dials the relays' WebSocket addresses (`*.2n6.me`, `*.libp2p.direct`).
- If Aleph doesn't answer within 8 s, only `VITE_SEED_NODES` is used.
- `VITE_ALEPH_RELAY_DISCOVERY=false` turns the lookup off; the tests do this.

Browsers find each other on the relays' discovery topic, `todo._peer-discovery._p2p._pubsub`. Other apps' browsers on those relays use the same topic.

### Who may write into an address book
Address books use the access controller `decontact-address-book` (package `@le-space/orbitdb-access-controller-decontact` in `packages/orbitdb-access-controller-decontact`), which the app and the relay both register:
- the owner (every device with the owner's DID) may write anything;
- anybody else may write only their own contact card (key `contact:<their DID>`), and only with an invitation the owner signed with their did:key. A request for contact data carries that invitation.

It is configured through orbitdb-relay's environment variables, e.g. `RELAY_PRIV_KEY` (hex protobuf private key for a stable peer id), `RELAY_WS_PORT`, `DATASTORE_PATH`.

## Building

To create a production version of your app:

```bash
npm run build
```
You can preview the production build with `npm run preview`.


## Tests
```bash
npm test                 # unit tests, then the end-to-end tests
npm run test:e2e         # headless; starts its own relay and a production build
npm run test:e2e:manual  # headed, with the Playwright inspector
```
`tests/AddressArrives.spec.js` checks that both addresses really arrive, once with WebRTC allowed and once relay-only, and logs which way they travelled.
