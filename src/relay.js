/**
 * deContact relay: a circuit relay for the browsers and an OrbitDB replica of every
 * address book a browser opens (orbitdb-relay). Contact data therefore also arrives
 * when two browsers can't reach each other over WebRTC, or aren't online at the same time.
 *
 * Configuration is orbitdb-relay's environment (see its docs), e.g.
 *   RELAY_PRIV_KEY   hex protobuf private key for a stable peer id (otherwise one is
 *                    generated and kept in DATASTORE_PATH)
 *   RELAY_WS_PORT    WebSocket port the browsers dial (default 9092)
 *   DATASTORE_PATH   where blocks, keys and the OrbitDB replicas live
 *
 * Run: node src/relay.js [--test]
 */
import 'dotenv/config'
import { useAccessController } from '@orbitdb/core'
import { startRelay } from 'orbitdb-relay'
import AddressBookAccessController from '@le-space/orbitdb-access-controller-decontact'

// The relay opens an address book from its manifest and checks every entry with the
// database's access controller, so it has to know deContact's: the owner writes
// anything, an invited contact only their own card. (An orbitdb-relay that supports
// RELAY_ACCESS_CONTROLLERS can load the same module from there instead.)
useAccessController(AddressBookAccessController)

// pubsub peer discovery: the app announces itself on orbitdb-relay's default topic
// (todo._peer-discovery._p2p._pubsub), like on Le Space's relays; PUBSUB_TOPICS overrides it
// orbitdb-relay can hand attestations to a local attest bridge; deContact has none
process.env.RELAY_ATTEST_BRIDGE ??= 'off'

const relay = await startRelay({ testMode: process.argv.includes('--test') })

let stopping = false
const stop = async () => {
	if (stopping) process.exit(1)
	stopping = true
	await relay.stop().catch(() => {})
	process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
