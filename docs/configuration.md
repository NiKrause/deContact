# Configuration

[README](../README.md) · [How it works](how-it-works.md) · [Relays](relays.md) · **Configuration** · [Development](development.md)

## App

Set at build time through Vite (see [`.env.example`](../.env.example)):

| Variable | Default | Meaning |
|---|---|---|
| `VITE_SEED_NODES` / `VITE_SEED_NODES_DEV` | *(empty)* | Comma-separated relay multiaddrs dialled first, in production / in `pnpm dev` |
| `VITE_ALEPH_RELAY_DISCOVERY` | `true` | Also dial Le Space's relays on Aleph: the ones from the last start at once, new ones as soon as Aleph names them ([Finding the relays](relays.md#finding-the-relays)) |
| `VITE_P2P_PUPSUB` / `VITE_P2P_PUPSUB_DEV` | `todo._peer-discovery._p2p._pubsub` | Comma-separated pubsub peer-discovery topics |
| `BASE_PATH` | *(empty)* | Base path of the build, e.g. `/deContact` |

## Relay

`src/relay.js` reads the [orbitdb-relay environment](https://github.com/NiKrause/orbitdb-relay), among others:

| Variable | Meaning |
|---|---|
| `RELAY_PRIV_KEY` | Hex protobuf private key for a stable peer id (otherwise one is generated and kept in `DATASTORE_PATH`) |
| `RELAY_WS_PORT` | WebSocket port browsers dial (default `9092`, Docker `12345`) |
| `DATASTORE_PATH` | Where keys, blocks and replicas are stored |
| `PUBSUB_TOPICS` | Discovery topics to forward (default `todo._peer-discovery._p2p._pubsub`) |

## In the app

In **Settings**, *WebRTC* can be switched off. After a reload, other browsers are then reached only through the relay.

At the bottom of **Settings**, the collapsed section **Developer** shows the DID, this device's peer id and the number of connected peers, and offers two drop actions, each behind a confirmation: *Drop Followed & Follower DBs* (this device's copies of the contacts' books; the own book stays, also when a contact added by hand names it) and *Drop AddressDB* (this device's copy of the own book).
