# Relays

[README](../README.md) · [How it works](how-it-works.md) · **Relays** · [Configuration](configuration.md) · [Development](development.md)

Relays let browsers find each other, carry a connection when WebRTC can't, and keep a replica of the address books for people who are offline. They can't change what's in a book: every entry is checked with the [access controller](how-it-works.md#who-may-write-into-an-address-book).

- **Le Space's relays on Aleph.** The app dials the `orbitdb-relay` instances registered on [Aleph](https://aleph.cloud) under `relay:orbitdb-relay:orbitdb-relay`, over their secure WebSocket addresses. Browsers find each other on the relays' discovery topic, `todo._peer-discovery._p2p._pubsub`. See [Finding the relays](#finding-the-relays).
- **Your own relay.** `src/relay.js` is [orbitdb-relay](https://github.com/NiKrause/orbitdb-relay) with deContact's access controller. Run it yourself and put its address into `VITE_SEED_NODES`.
- **When the relay keeps replicas.** It replicates address books only if it knows the access controller: deContact's own relay always does, and Le Space's relays from orbitdb-relay 0.11.0 on (via `RELAY_ACCESS_CONTROLLERS`). Without that, contact data arrives only over a direct WebRTC connection between the browsers.
- **The vault records.** Relays also keep the public vault record that lets a new device open the vault with a second passkey or the recovery words ([#60](how-it-works.md#a-device-that-has-nothing-yet)). It lives in an OrbitDB event log with OrbitDB's own `ipfs` access controller, which every orbitdb-relay knows.
- **Identities.** Every entry, in an address book or a vault log, is written by the vault's Ed25519 identity, an OrbitDB identity of type `webauthn`. A relay verifies it with `@le-space/orbitdb-identity-provider-webauthn-did`, which orbitdb-relay registers. deContact's relay and Le Space's relays run orbitdb-relay 0.11.1, with the provider's security release 0.14.0, the version the app uses.

## Finding the relays

The app finds Le Space's relays with the libp2p discovery service of [`@le-space/aleph-bootstrap`](https://www.npmjs.com/package/@le-space/aleph-bootstrap):

- **First start.** The app asks Aleph (`api.aleph.im`) and dials the relays it lists. The app does not wait for the answer: it starts at once, and the relays connect when Aleph has answered.
- **Every later start.** The app dials the relays it found last time at once. It asks Aleph again only when that list is older than six hours, or when none of those relays answers within 10 s. New relays are dialled as soon as Aleph names them.
- **What is kept.** The browser keeps the relays' signed registrations in `localStorage`, under a key starting with `le-space:aleph-bootstrap:relays:v1:`. Each one is verified again when it is loaded. A registration older than 24 h is not dialled, and neither is a relay that failed three dials in a row.
- **Redeployed relays.** A deployed relay registers as `relay:orbitdb-relay:orbitdb-relay:<instance hash>`. The app matches the name, so it still finds the relay after a redeploy brings a new instance. Smoke-test and E2E relays in the same channel have other names and are left out.

## Run your own relay

```bash
pnpm relay                                   # in a second terminal:
curl -s http://127.0.0.1:9090/multiaddrs     # copy the /ws address
```
Put that address into `VITE_SEED_NODES` (or `VITE_SEED_NODES_DEV` for `pnpm dev`); see [Configuration](configuration.md).

### With Docker
```bash
docker build -t decontact-relay .
# RELAY_PRIV_KEY is optional: without it the relay generates a key and keeps it in the volume
docker run -p 12345:12345 -e RELAY_PRIV_KEY=<hex protobuf private key> -v relay-data:/data decontact-relay
```
