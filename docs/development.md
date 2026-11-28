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
pnpm test            # unit tests, then end-to-end tests (Playwright)
pnpm test:unit       # unit tests only: Vitest, then the ones that need a real browser (Playwright, no app)
pnpm test:e2e        # E2E: starts its own relay and a production build
pnpm test:e2e:manual # E2E headed, with the Playwright inspector
```

| Suite | What it checks |
|---|---|
| `packages/orbitdb-access-controller-decontact/index.spec.js` | invitations verify only for the invitee; who may write what; the owner is read from the manifest |
| `src/lib/identity/*.spec.js` | the vault: the first passkey's PRF output is the root, a second passkey and the recovery words open it as the same DID, also on an empty device; a passkey that opens nothing gets no vault unless asked; removed passkeys and replaced words are refused; nothing secret in storage; the published records |
| `src/lib/encryption/*.spec.js` | the X25519 key is the DID's counterpart and the same for every passkey; seals open for their recipient and context only and refuse what was altered; cards keep only what the access controller checks in the clear, still pass it, open for the book's owner only and cannot pass for the owner's own card |
| `src/lib/photo/photo.spec.js` | the photo's centre square; the quality goes down until it fits 30 KB, JPEG where the browser gives no WebP; only a WebP or JPEG data URL of a sensible size is shown; a card with the biggest photo keeps it sealed, passes the access controller and stays below 60 KB |
| `src/lib/photo/photo.browser.spec.js` | in Chromium, without the app (`playwright.unit.config.js`): a large image of noise becomes a 256 × 256 WebP within the cap, also as JPEG; a JPEG whose EXIF names a place and holds GPS coordinates gives a photo without EXIF; a portrait is cropped to its centre; not an image is refused; a request's thumbnail of a card's photo is 64 × 64 and within its cap (#110) |
| `src/lib/card/entries.spec.js` | a card's entries (#109): a card from before reads as its first email and address, labelled after its category; an older version's change of the flat fields wins for the first entry; anything an app may send is read without throwing, with known labels, at most 5 of a kind and cut to length; which handles, numbers and addresses become links and which stay text; the form edits a copy, a new entry's label, a saved card trimmed with the flat fields written again and the category gone, the limits |
| `src/lib/card/about.spec.js` | what we keep about a contact (#109): a random key that names nobody; a note trimmed and cut, kept in the document we have; found among the book's documents, the later of two counting |
| `src/lib/theme.spec.js` | light and dark (#110): a choice kept in this browser, else the system's; a choice wins over the system's setting; the accent colour kept here, else blue; `static/theme.js`, which `src/app.html` loads in `<head>` (it has no inline script), sets the same keys, Carbon themes and accent before the first paint |
| `src/lib/csp.spec.js` | the Content-Security-Policy: only the app's own scripts, no `eval`; connections to the app, Aleph and relays over TLS, the relay on this machine only for the tests' build and `pnpm dev`; fonts, workers and the manifests from the app, images also as `data:` URLs; no plugin, frame, `<base>` elsewhere or form sent anywhere; Trusted Types with Svelte's and SvelteKit's policies only; the hashes of the two inline styles it lets through match SvelteKit's announcer and the `<style>` of `<qr-scanner>` |
| `scripts/csp-check.spec.js` | the check of a built page's policy (`scripts/csp-check.js`): nothing found in a page as SvelteKit builds it; found: no policy, or one after what it should hold, the tests' relay in a production build, `eval`, inline code or another host allowed, Trusted Types not required or another policy allowed, an inline script, style or event handler without its hash, a file from another host |
| `scripts/carbon-fonts.spec.js` | Carbon's stylesheet without its `@font-face` rules: no address of IBM's CDN left and nothing else taken out, only Carbon's stylesheets touched; the app's own IBM Plex (`src/lib/fonts.css`): Sans 300, 400 and 600 and Mono 400, from `static/fonts`, with the licence |
| `src/lib/card/circles.spec.js` | circles (#100): the four of a new book, the whole card for a new code, Family every field; what Business gets of a full card, also in the flat fields, and what stays (book address, devices); no circle is the whole card; a card from before #109 filtered too; the document of circles checked (unknown fields, 3 to 6, a default among them); moving to a circle that shows less; names and fields in words; a circle we do not have, or circles that cannot be read, give the name only; what a request carries of the card follows the circle; where the members of a removed circle go |
| `src/lib/card/own.spec.js` | our own card: the card of ours marked as our own; none without one, so a contact added by hand never goes out in its place; of several marked (a book from before #123) the one naming our devices, else the first by key, in any order; the others shown as contacts added by hand |
| `src/lib/network/*.spec.js` | whose address book an address names, from its manifest and controller, without opening it; relay selection with fallback, the production-registration filter, browser-dialable addresses, `ws://` from https pages; requests signed by their sender and sealed to the recipient, unreadable for anybody else; a request's photo at the top level and signed, dropped when it is too large, not WebP or JPEG or not a data URL, while the request still counts; malformed, stale, forwarded and replayed requests dropped; invitation link tokens that expire, work for one invitee and say whether a two-way exchange is allowed, and the circle chosen for one, kept on the device and not in the link (#100); the two-way request and its answer; what the invitee asks for before and after its choice, and the choice kept until the token expires |
| `tests/Csp.spec.js` | the Content-Security-Policy: every built page carries it, first in `<head>`, as `src/lib/csp.js` writes it (`scripts/csp-check.js`); the browser refuses `eval`, `new Function`, markup as a string, a Trusted Types policy of its own or Svelte's a second time, an injected script, a script from another host, an event handler, an injected `<style>` and style attribute, an image and a request to another host; IBM Plex Sans loads from the app's own `fonts/`, and no request goes to IBM's CDN (`s81c.com`) |
| `tests/AddressArrives.spec.js` | both cards really arrive in the other book, once with WebRTC allowed and once relay-only, and the test logs which way they travelled |
| `tests/BasicAddressExchange.spec.js` | the request / answer dialogs on both sides |
| `tests/PeersToggletip.spec.js` | the header's network toggletip: two browsers and the local relay; it lists the relay (WebSocket, direct) and the other browser, as direct WebRTC with WebRTC allowed and as relayed with it off, with the sum line, never an IP address; the copy button puts the whole peer id on the clipboard; click, Enter, Space, hover and Escape open and close it; at 344 px it fits the screen; axe at every width, light and dark, with it open; Settings → Network lists the same |
| `tests/ContactRequestSecurity.spec.js` | a third person: an invitation link works once, a used one makes the inviter confirm, a request in someone else's name (sealed to the recipient) is dropped; the sender's book is opened only once the inviter decided, and a request naming a database that is not the sender's address book opens nothing |
| `tests/ExchangeDone.spec.js` | what the person who shows the code learns: Alice keeps *Show my code* open, Bob opens the link; once her card is in his book the dialog closes by itself, the focus is back on *Show my code*, the phone vibrates (`navigator.vibrate`, recorded), and a notice names Bob from his signed request; his card follows, a second notice links to his page and stays; axe on both notices at every width, light and dark. Only the code on screen closes the dialog: not the token of a code issued before another option was chosen (Dave, nameless: "Your business card was received", and Exchange's line that he can send his), not Carol's second use of that link (the request dialog opens over the code), but Bob's of the new code; with *Let them ask first* the request dialog takes over, and the focus comes back to *Show my code* after it |
| `tests/Onboarding.spec.js` | an invitation link (#86): email first and the address collapsed; *Save and share* while the inviter's app does not answer, the request resent until it does; *Save only* with the email alone, and nothing of the invitee reaches the inviter's book; a second person with the same link, for whom the inviter is asked once; a link without a two-way exchange offers only *Save*; the QR dialog's sentence for each choice, and *Let them ask first* showing the contact address without a token; no request dialog during onboarding, and the inviter's book never holds a placeholder card |
| `tests/CardEntries.spec.js` | a card's entries (#109): Alice adds an organisation, two phones, an email and two profiles (a new field has the focus and its label; a profile not of its network's form says it shows as text; an entry removed before saving is gone); her saved card holds them in order with the flat fields for older versions; Bob adds a phone on the onboarding form; on her page the phones and the email are `tel:` and `mailto:` links, the Mastodon profile a link the app built, the other profile text; she sees his phone; a contact she adds by hand and changes does not go out as her card |
| `tests/ContactPanes.spec.js` | Contacts in two panes (#110): on the open Fold and a desktop the list and a contact side by side, level, the contact marked in the list, the pane saying to choose one before; on a phone one at a time with *All contacts*; My card and back keeps the contact open, not our own card; axe at every width, in English and German, with a contact open and without |
| `tests/Layout.spec.js` | where things are at each device width (#110): the navigation at the bottom on a phone and the open Fold, a rail on a desktop; the places 16 px from the edge on a phone, a column in the middle of the open Fold, beside the rail on a desktop; Contacts in two panes from the open Fold on; *Show my code* in the lower half, above the navigation, on a phone and the Fold |
| `tests/Circles.spec.js` | circles (#100): without a circle Bob gets Alice's whole card; in Business only her name and work email, not her home address or private email, also not in the flat fields, and the page says that what he got stays with him; in Family everything again; the circle is not on his copy of her card. Settings shows the matrix and the whole card for a new code; Alice makes Business the default there, and the QR dialog says so; Carol, who opens the code, is in Business and gets the work email, not the home address; Alice lets Business see the home address in Settings, and Carol gets it; Alice removes Business, Settings asks where Carol and new codes go, and Carol gets what that circle shows |
| `tests/OwnCard.spec.js` | our own card: Alice deletes hers and adds Carol by hand, and nothing goes to Bob (Carol's card once went out in its place); her card typed again reaches him, and Carol stays in her list. *Drop Followed & Follower DBs* keeps Alice's own book when she added a contact by hand |
| `tests/Notes.spec.js` | my notes on a contact (#109): Alice saves a note on Bob's page, it is there after a reload; in her book it is sealed, its key does not name Bob; Bob's book, his copy of hers and his browser's storage hold nothing of it; an empty note takes the document away |
| `tests/ContactPhoto.spec.js` | a photo (#87): Alice chooses one (a JPEG with EXIF and GPS), her card gets a small WebP without them; Bob sees it on the onboarding screen, in his list and in her details; a third peer's copy of Bob's book, and no browser's storage, holds a byte of it in the clear; an entry of her card stays below 64 KB; *Remove photo* takes it from Bob's list; Carol's request shows Alice a 64 × 64 copy of Carol's photo in the request dialog (#110) |
| `tests/Encryption.spec.js` | a third peer on the topic reads no request, and its copy of somebody's book (as a backup or relay keeps it) holds no name, city or book address, nor does any browser's storage; a removed contact loses the card and gets no later change |
| `tests/Passkeys.spec.js` | a new address book with two prompts and none after a reload but one; a seed phrase from before is removed; nothing secret (root, identity key, X25519 key, vault key) in IndexedDB or storage; an empty browser restores the DID and the own book with the same passkey (record from the relay); a passkey that opens nothing gets no book without asking |
| `tests/MyDevicesAutoSync.spec.js` | a second device: device link and recovery words, a passkey of its own, writes as the same DID |
| `tests/Theme.spec.js` | light and dark (#110): the first screen follows the system's setting, light and dark, and changes with it without a reload; the look is set before any of the app's code runs (it is blocked); the header has no theme switch; in Settings Alice chooses *Dark* (kept after a reload, the passkey screen included), *Light* over a dark system, *System* again, and *Dunkel* in German; the accent colour: Blue by default, Teal and Purple on buttons and links in light and dark, kept after a reload and before the first paint, *Akzentfarbe* in German, axe on Settings and Exchange in each colour, light and dark, at every width |
| `tests/Screens.spec.js` | a tour (#110), and these checks: that no screen scrolls sideways at any reference width (#98), that the start screen is one column in the middle of a wide screen, below the header, with the version line flush with it, that Exchange, My card, Settings and Contacts are a column in the middle of the room beside the rail at 1280 px with the version line flush with it, and that the navigation's labels fit at every width in English and German (*Meine Visitenkarte*): every screen (the passkey screen of a first start, also in German, with a kept vault and when a passkey opens nothing, My card before and after the first card and while editing, Contacts empty and full, a contact's page, adding a contact by hand, Exchange, *Show my code* before the first card and ready, the header's network toggletip, Settings, the invitee's form, the inviter's Exchange with the notice that the invitee's card arrived, the request dialog, the camera of *Scan a code*) saved as a screenshot at each reference width, light and dark, to compare a UI change before and after. The widths are listed once, in `tests/helpers/devices.js`, which the axe check uses too. The pictures land in `test-results/screens/`, with an `index.html` that shows them side by side and marks a screen that scrolls sideways (which fails the tour); CI keeps them as the artifact *screens* of every run. Alice and Carol get made-up portraits (`tests/helpers/portrait.js`); the camera is a fake one, playing a video of an invitation QR code half out of the picture and then whole (`tests/helpers/qr-video.js`). `node scripts/readme-screens.mjs` copies six of the pictures at 412 px into `docs/screens/`, light and dark, for the README |

Every E2E spec fails on anything the Content-Security-Policy or Trusted Types refuse, in every browser context it opens: the specs import `test` and `expect` from `tests/helpers/policy.js`, not from `@playwright/test` ([what the policy does](how-it-works.md#content-security-policy)). `pnpm dev` runs under the same policy, with the relay on this machine allowed; its console shows one refused `new Function` from cbor-x, a check whether it may compile code, which falls back by itself and runs only in Vite's pre-bundled dependencies.

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
├── lib/photo/
│   └── photo.js                 a contact's photo: centre square, 256 × 256, WebP or JPEG, at most 30 KB, no EXIF (#87)
├── lib/network/
│   ├── p2p-operations.js        start-up, the request/answer protocol, card updates, removing a contact
│   ├── contact-messages.js      signed requests sealed to the recipient, replay guard, one-time invitation link tokens
│   ├── exchanges.js             the invitation links we opened: what we still ask for, and our choice (#86)
│   ├── peer-connectivity.js     dialling discovered peers, WebRTC upgrade, relay reservation
│   └── getIdendityAndCreateOrbitDB.js   the vault's identity → OrbitDB
├── config.js                    libp2p configuration, relays from Aleph and configured ones
└── relay.js                     the relay (orbitdb-relay + deContact's access controller)
packages/
└── orbitdb-access-controller-decontact/   the access controller, published to npm
tests/                           Playwright E2E tests, their server and helpers (generated test images with EXIF)
```
