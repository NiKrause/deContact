import { describe, expect, it } from 'vitest';
import { isInsecureWebSocketDial } from './dial-policy.js';

const relay = '/p2p/12D3KooWRelayRelayRelayRelayRelayRelayRelayRelay';

describe('isInsecureWebSocketDial', () => {
	it('refuses ws:// from an https page', () => {
		expect(isInsecureWebSocketDial(`/ip4/192.0.2.1/tcp/9092/ws${relay}`, 'https:')).toBe(true);
	});

	it('allows wss and /tls/ws from an https page', () => {
		expect(isInsecureWebSocketDial(`/dns4/relay.example.com/tcp/443/wss${relay}`, 'https:')).toBe(false);
		expect(isInsecureWebSocketDial(`/dns4/relay.example.com/tcp/443/tls/ws${relay}`, 'https:')).toBe(false);
	});

	it('allows ws:// from an http page (local development)', () => {
		expect(isInsecureWebSocketDial(`/ip4/127.0.0.1/tcp/9092/ws${relay}`, 'http:')).toBe(false);
	});

	it('leaves other transports alone', () => {
		expect(isInsecureWebSocketDial(`/ip4/192.0.2.1/udp/9093/webrtc-direct${relay}`, 'https:')).toBe(false);
	});
});
