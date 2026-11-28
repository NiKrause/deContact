import { describe, expect, it } from 'vitest';
// the code that writes the inline styles the policy lets through, as text (node:fs is
// polyfilled away under Vite)
import sveltekitRoot from '../../node_modules/@sveltejs/kit/src/runtime/components/root.svelte?raw';
import qrScannerSource from '../../node_modules/@le-space/libp2p-webrtc-qr/src/elements/qr-scanner.js?raw';
import qrElementsBundle from '../../node_modules/@le-space/libp2p-webrtc-qr/dist/elements.js?raw';
import qrPackage from '../../node_modules/@le-space/libp2p-webrtc-qr/package.json';
import {
	ALEPH_API,
	INLINE_STYLES,
	INLINE_STYLE_ATTRIBUTES,
	TRUSTED_TYPES_POLICIES,
	cspDirectives
} from './csp.js';

/** @param {string} text @returns {Promise<string>} its hash, as a policy names it (without the quotes) */
async function sha256(text) {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
	return `sha256-${Buffer.from(digest).toString('base64')}`;
}

describe('the policy', () => {
	const production = cspDirectives();
	const sources = Object.values(production).flat();

	it("runs the app's own scripts only: no eval, no inline script, no other host", () => {
		expect(production['script-src']).toEqual(['self']);
		expect(sources).not.toContain('unsafe-eval');
		expect(sources).not.toContain('wasm-unsafe-eval');
		expect(sources).not.toContain('unsafe-inline');
	});

	it("talks to the app's origin, Aleph and relays over TLS, and nothing in the clear", () => {
		expect(production['connect-src']).toEqual(['self', ALEPH_API, 'wss:']);
		expect(sources.join(' ')).not.toMatch(/\bws:|127\.0\.0\.1|localhost/);
	});

	it('adds the relay on this machine for the end-to-end tests and `vite dev`, and nothing else', () => {
		const local = cspDirectives({ localRelay: true });
		expect(local['connect-src']).toEqual([
			'self',
			ALEPH_API,
			'wss:',
			'ws://127.0.0.1:*',
			'ws://localhost:*'
		]);
		expect({ ...local, 'connect-src': production['connect-src'] }).toEqual(production);
	});

	it('loads fonts, images, workers and the manifest from the app, plus images as data: URLs', () => {
		expect(production['font-src']).toEqual(['self']);
		expect(production['img-src']).toEqual(['self', 'data:']);
		expect(production['worker-src']).toEqual(['self']);
		expect(production['manifest-src']).toEqual(['self']);
	});

	it('allows no plugin, no frame, no other <base>, no form sent anywhere', () => {
		expect(production).toMatchObject({
			'default-src': ['self'],
			'object-src': ['none'],
			'frame-src': ['none'],
			'base-uri': ['self'],
			'form-action': ['none']
		});
	});

	it("requires Trusted Types, with Svelte's and SvelteKit's policies and no default one", () => {
		expect(production['require-trusted-types-for']).toEqual(['script']);
		expect(production['trusted-types']).toEqual(TRUSTED_TYPES_POLICIES);
		expect(TRUSTED_TYPES_POLICIES).toEqual(['svelte-trusted-html', 'sveltekit-trusted-url']);
	});

	it('lets through inline styles only by their hashes', () => {
		expect(production['style-src']).toEqual(['self', ...Object.values(INLINE_STYLES)]);
		expect(production['style-src-attr']).toEqual([
			'unsafe-hashes',
			...Object.values(INLINE_STYLE_ATTRIBUTES)
		]);
		for (const hash of [
			...Object.values(INLINE_STYLES),
			...Object.values(INLINE_STYLE_ATTRIBUTES)
		]) {
			expect(hash).toMatch(/^sha256-[A-Za-z0-9+/]{43}=$/);
		}
	});
});

describe('the inline styles it lets through are the ones the dependencies write', () => {
	it("SvelteKit's announcer: its style attribute", async () => {
		const style = /id="svelte-announcer"[\s\S]*?style="([^"]*)"/.exec(sveltekitRoot)?.[1];
		expect(style, "SvelteKit's root.svelte has its announcer").toBeTypeOf('string');
		// an update that changes it: put this hash in src/lib/csp.js, INLINE_STYLE_ATTRIBUTES
		expect(await sha256(String(style))).toBe(INLINE_STYLE_ATTRIBUTES.sveltekitAnnouncer);
	});

	it("<qr-scanner>'s <style>, in the bundle the app loads", async () => {
		const style = /\nconst STYLE = `([^`]*)`/.exec(qrScannerSource)?.[1];
		expect(style, "<qr-scanner>'s STYLE").toBeTypeOf('string');
		// the text as it runs: no substitution, no escape in the template literal
		expect(style).not.toMatch(/\$\{|\\/);
		expect(qrElementsBundle).toContain(`\`${style}\``);
		// an update that changes it: put this hash in src/lib/csp.js, INLINE_STYLES
		expect(qrPackage.version).toBe('0.14.4');
		expect(await sha256(String(style))).toBe(INLINE_STYLES.qrScanner);
	});
});
