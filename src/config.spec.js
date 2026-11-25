import { describe, expect, it } from 'vitest';
import { ALEPH_RELAY_REGISTRATION, RELAY_TAGS, createLibp2pConfig } from './config.js';

const relay = '/ip4/127.0.0.1/tcp/9092/ws/p2p/12D3KooWQmMRcN42peG5wDCpEp4DyDfygxaArF3fN7CgzCra9sHf';

describe('createLibp2pConfig', () => {
	it('finds relays on Aleph through a discovery service when Aleph discovery is on', () => {
		const config = createLibp2pConfig({ relays: [], alephRelays: true });
		expect(typeof config.services.alephRelays).toBe('function');
		// @libp2p/bootstrap refuses an empty list
		expect(config.peerDiscovery).toHaveLength(1);
	});

	it('leaves Aleph out when Aleph discovery is off, and dials the configured relays', () => {
		const config = createLibp2pConfig({ relays: [relay], alephRelays: false });
		expect(config.services.alephRelays).toBeUndefined();
		expect(config.peerDiscovery).toHaveLength(2);
	});
});

describe('relay scope on Aleph', () => {
	it("names the production relays by name, so a redeployed relay's new instance is found", () => {
		expect(ALEPH_RELAY_REGISTRATION).toBe('relay:orbitdb-relay:orbitdb-relay');
	});

	it('recognises the relays both discoveries tag', () => {
		expect(RELAY_TAGS).toEqual(['bootstrap', 'aleph-bootstrap']);
	});
});
