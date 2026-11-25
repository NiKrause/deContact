<div align="center">

# deContact

**A local-first, peer-to-peer address book. Your contacts keep themselves up to date — without a server that owns them.**

[![Tests](https://github.com/NiKrause/deContact/actions/workflows/main.yml/badge.svg?branch=main)](https://github.com/NiKrause/deContact/actions/workflows/main.yml)
[![Release](https://img.shields.io/github/v/tag/NiKrause/deContact?sort=semver&label=release)](https://github.com/NiKrause/deContact/tags)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![npm: access controller](https://img.shields.io/npm/v/@le-space/orbitdb-access-controller-decontact?label=%40le-space%2Forbitdb-access-controller-decontact)](https://www.npmjs.com/package/@le-space/orbitdb-access-controller-decontact)

[![libp2p](https://img.shields.io/badge/libp2p-3.5-blueviolet)](https://libp2p.io)
[![Helia](https://img.shields.io/badge/Helia-7.1-65c2cb)](https://helia.io)
[![OrbitDB](https://img.shields.io/badge/OrbitDB-4.0-orange)](https://orbitdb.org)
[![DID](https://img.shields.io/badge/identity-did%3Akey-informational)](https://w3c-ccg.github.io/did-method-key/)
[![SvelteKit](https://img.shields.io/badge/SvelteKit-2-FF3E00?logo=svelte&logoColor=white)](https://kit.svelte.dev)

</div>

---

## Why deContact
- **Address books go stale.** People move, change their phone number or their email. Whoever has your card keeps the old one until you tell everybody, one by one.
- **Contacts don't belong in someone else's cloud.** They shouldn't live on a platform's servers, tied to its account.

deContact gives every person a self-owned address book. It lives in the browser and syncs peer-to-peer with the people they exchanged cards with. When you change your address, you rewrite your card in every address book you were invited into. Relays only help peers find each other and keep a replica for when you are offline; they can't change what's in your book.

## Features
- 🔑 **Self-sovereign identity.** A BIP39 seed phrase gives you a `did:key` (Ed25519), which serves as your OrbitDB identity. No account, no server-side login.
- 📇 **Your own address book.** An OrbitDB documents database for your card and the cards others write into it (private, business or other).
- 🤝 **Exchange cards by DID.** Scan a QR code or paste a DID. The other person confirms, and each side writes their card into the other's book.
- 🔄 **Updates follow you.** A changed card is rewritten in every book you were invited into.
- 🛡️ **Signed invitations.** Only invited contacts may write, and only their own card (see [who may write](docs/how-it-works.md#who-may-write-into-an-address-book)).
- 🌐 **Direct and relayed.** WebRTC between browsers when possible, a circuit relay otherwise. Relays found through Aleph, or your own.
- 💾 **Offline-friendly.** The relay keeps a replica, so updates reach you after you've been offline.
- 📱 **Multiple devices.** The same seed phrase on another device gives the same DID, and the same address book syncs between your devices.
- 🔍 **Contact list with search.** A Progressive Web App built with SvelteKit and Carbon.

## How it works
1. Bob scans Alice's DID (QR code or text) and sends her a request over libp2p. The request carries the address of his book and a signed invitation.
2. Alice confirms and writes her card into Bob's book. Bob does the same in hers.
3. When either of them changes their card, it is rewritten in every book they were invited into.
4. An [orbitdb-relay](docs/relays.md) connects the browsers when WebRTC can't and keeps a replica for when someone is offline. It checks every entry with the same access controller as the browsers.

→ Step by step, with a sequence diagram and the architecture: [How it works](docs/how-it-works.md)

## Quick start
```bash
git clone https://github.com/NiKrause/deContact.git
cd deContact
pnpm install        # Node.js 22+, pnpm 10 (corepack enable)
pnpm dev
```
The app finds Le Space's relays on Aleph by itself. To try it with two people:
1. Open the app in two separate browsers or browser profiles.
2. In each, choose **Continue**, then **Generate New**, then enter your card under **My Address**.
3. In browser A, copy the DID from **Settings**. In browser B, paste it under **Contacts** and press **Scan**.
4. Confirm **Send My Contact Data** in both browsers.
5. Each contact list now shows the other person's card.

## Documentation
| Page | Contents |
|---|---|
| [How it works](docs/how-it-works.md) | architecture, the exchange of contact data step by step, who may write into an address book |
| [Relays](docs/relays.md) | Le Space's relays on Aleph, when a relay keeps replicas, running your own (also with Docker) |
| [Configuration](docs/configuration.md) | environment variables of the app and the relay, the WebRTC switch |
| [Development](docs/development.md) | local setup with your own relay, build, tests, project structure |
| [Access controller package](packages/orbitdb-access-controller-decontact) | `@le-space/orbitdb-access-controller-decontact` on npm |

## Known limitations
- **Experimental.** Data formats and protocols may still change; the address book format changed in 0.5.0.
- **Not encrypted.** Contact data in address books is not encrypted yet. Anybody who knows a book's address can read it.
- **Keys in the browser.** The seed phrase is kept in browser storage. Use a separate test seed phrase.
- **WebRTC.** In automated headless tests, browsers only reach each other through the relay. Direct WebRTC between real browsers still needs confirming.

## Contributing
Issues and pull requests are welcome.
- Please run `pnpm test` before opening a PR, and use made-up names and addresses in tests and examples.
- If you find a security issue, please report it privately to the maintainer instead of opening a public issue.

## License
[MIT](LICENSE) © Nico Krause

Built on [libp2p](https://libp2p.io), [Helia](https://helia.io), [OrbitDB](https://orbitdb.org), [SvelteKit](https://kit.svelte.dev) and [Carbon](https://carbon-components-svelte.onrender.com), with relays by [Le Space](https://le-space.de) on [Aleph](https://aleph.cloud).
