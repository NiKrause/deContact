# Relays

[README](../README.md) · [How it works](how-it-works.md) · **Relays** · [Configuration](configuration.md) · [Development](development.md)

Relays let browsers find each other, carry a connection when WebRTC can't, and keep a replica of the address books for people who are offline. They can't change what's in a book: every entry is checked with the [access controller](how-it-works.md#who-may-write-into-an-address-book).

- **Le Space's relays on Aleph.** At start the app looks up the `orbitdb-relay` instances registered on [Aleph](https://aleph.cloud) (via `api.aleph.im`, [`@le-space/aleph-bootstrap`](https://www.npmjs.com/package/@le-space/aleph-bootstrap)) and dials their secure WebSocket addresses. Browsers find each other on the relays' discovery topic, `todo._peer-discovery._p2p._pubsub`.
- **Your own relay.** `src/relay.js` is [orbitdb-relay](https://github.com/NiKrause/orbitdb-relay) with deContact's access controller. Run it yourself and put its address into `VITE_SEED_NODES`.
- **When the relay keeps replicas.** It replicates address books only if it knows the access controller: deContact's own relay always does, and Le Space's relays from orbitdb-relay 0.11.0 on (via `RELAY_ACCESS_CONTROLLERS`). Without that, contact data arrives only over a direct WebRTC connection between the browsers.

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
