# Development

[README](../README.md) · [How it works](how-it-works.md) · [Relays](relays.md) · [Configuration](configuration.md) · **Development**

## Prerequisites
- Node.js **22** or newer
- [pnpm](https://pnpm.io) 10 (`corepack enable`)

## Run it locally
```bash
git clone https://github.com/NiKrause/deContact.git
cd deContact
pnpm install
pnpm dev
```
By default the app finds Le Space's relays on Aleph. To work offline, or against your own relay, start one ([Relays](relays.md#run-your-own-relay)) and point the app at it in `.env`:

```bash
VITE_SEED_NODES_DEV=/ip4/127.0.0.1/tcp/9092/ws/p2p/<peer id of your relay>
VITE_ALEPH_RELAY_DISCOVERY=false
```

## Build
```bash
pnpm build      # static build into build/ (adapter-static)
pnpm preview    # serve it locally
```
For hosting below a path (e.g. GitHub Pages), set `BASE_PATH=/deContact` when building.

## Testing

```bash
pnpm test            # unit tests (Vitest), then end-to-end tests (Playwright)
pnpm test:unit       # unit tests only
pnpm test:e2e        # E2E: starts its own relay and a production build
pnpm test:e2e:manual # E2E headed, with the Playwright inspector
```

| Suite | What it checks |
|---|---|
| `packages/orbitdb-access-controller-decontact/index.spec.js` | invitations verify only for the invitee; who may write what; the owner is read from the manifest |
| `src/lib/identity/*.spec.js` | the vault: the first passkey's PRF output is the root, a second passkey and the recovery words open it as the same DID, also on an empty device; a passkey that opens nothing gets no vault unless asked; removed passkeys and replaced words are refused; nothing secret in storage; the published records |
| `src/lib/encryption/*.spec.js` | the X25519 key is the DID's counterpart and the same for every passkey; seals open for their recipient and context only and refuse what was altered; cards keep only what the access controller checks in the clear, still pass it, open for the book's owner only and cannot pass for the owner's own card |
| `src/lib/network/*.spec.js` | relay selection with fallback, the production-registration filter, browser-dialable addresses, `ws://` from https pages; requests signed by their sender and sealed to the recipient, unreadable for anybody else; malformed, stale, forwarded and replayed requests dropped; invitation link tokens that expire and work for one invitee |
| `tests/AddressArrives.spec.js` | both cards really arrive in the other book, once with WebRTC allowed and once relay-only, and the test logs which way they travelled |
| `tests/BasicAddressExchange.spec.js` | the request / answer dialogs on both sides |
| `tests/ContactRequestSecurity.spec.js` | a third person: an invitation link works once, a used one makes the inviter confirm, a request in someone else's name (sealed to the recipient) is dropped |
| `tests/Encryption.spec.js` | a third peer on the topic reads no request, and its copy of somebody's book (as a backup or relay keeps it) holds no name, city or book address, nor does any browser's storage; a removed contact loses the card and gets no later change |
| `tests/Passkeys.spec.js` | a new address book with two prompts and none after a reload but one; a seed phrase from before is removed; nothing secret (root, identity key, X25519 key, vault key) in IndexedDB or storage; an empty browser restores the DID and the own book with the same passkey (record from the relay); a passkey that opens nothing gets no book without asking |
| `tests/MyDevicesAutoSync.spec.js` | a second device: device link and recovery words, a passkey of its own, writes as the same DID |

The E2E tests use a virtual authenticator with PRF (Chromium's CDP `WebAuthn` domain) and open the app on `localhost`: WebAuthn does not accept an IP address as relying party. They never contact Aleph or public relays: `tests/start-e2e-server.mjs` starts a fresh local relay and builds the app against it. CI runs the same suite on every push and pull request, and deploys to GitHub Pages only from `main` after the tests pass.

## Project structure
```
src/
├── routes/                      SvelteKit pages, onboarding, device links
├── lib/components/              contact list and form, QR code, settings, passkey gate and settings, dialogs
├── lib/identity/
│   ├── vault.js                 the vault (keeper, root, slots, recovery words) and the identity from its root
│   ├── vault-directory.js       the vault record published and found over OrbitDB; OrbitDB with the vault's identity
│   ├── passkeys.js              passkey prompts: register, read the PRF output
│   ├── recovery-words.js        24 BIP39 words for the recovery slot
│   └── session.js               the open vault of the page: unlock, add/remove passkeys, publish
├── lib/encryption/
│   ├── sealing.js               seal to a did:key's X25519 key, open with ours (#59)
│   ├── cards.js                 documents of an address book, sealed to the book's owner
│   └── sealed-book.js           an address book that seals what is put and opens what is read
├── lib/network/
│   ├── p2p-operations.js        start-up, the request/answer protocol, card updates, removing a contact
│   ├── contact-messages.js      signed requests sealed to the recipient, replay guard, one-time invitation link tokens
│   ├── peer-connectivity.js     dialling discovered peers, WebRTC upgrade, relay reservation
│   └── getIdendityAndCreateOrbitDB.js   the vault's identity → OrbitDB
├── config.js                    libp2p configuration, relays from Aleph and configured ones
└── relay.js                     the relay (orbitdb-relay + deContact's access controller)
packages/
└── orbitdb-access-controller-decontact/   the access controller, published to npm
tests/                           Playwright E2E tests and their server
```
