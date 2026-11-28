// The page's Content-Security-Policy: what the app may load, run and talk to. SvelteKit
// writes it into every built page as a `<meta http-equiv>` (vite.config.js, `kit.csp`) and
// adds the hash of its own start script, the only inline script there is. GitHub Pages sends
// no headers of ours, so a meta tag is all there is: it cannot forbid being framed
// (`frame-ancestors`) and cannot report (`report-uri`, `report-to`). docs/how-it-works.md,
// "Content-Security-Policy", says what it does and what it does not do.
//
// Written without the quotes: SvelteKit adds them to the keywords (`'self'`, `'none'`,
// `'script'`, …) and the hashes. Follows Le-Space/belege's app/csp.js.

/** where @le-space/aleph-bootstrap asks for the relays' registrations (its DEFAULT_ALEPH_API_HOST) */
export const ALEPH_API = 'https://api.aleph.im';

/**
 * The Trusted Types policies the page may create, each by the code that needs it:
 * - `svelte-trusted-html`: Svelte's own, for the markup of its compiled templates
 *   (svelte/src/internal/client/dom/reconciler.js);
 * - `sveltekit-trusted-url`: SvelteKit's, for the address of the service worker its start
 *   script registers.
 * No `default` policy: a string handed to any other sink (`innerHTML`, a script's `src`,
 * `eval`) is refused. `<passkey-step-dialog>` set its markup as a string; deContact's patch
 * builds it with DOM calls (patches/@le-space__orbitdb-identity-provider-webauthn-did@0.14.0.patch).
 */
export const TRUSTED_TYPES_POLICIES = ['svelte-trusted-html', 'sveltekit-trusted-url'];

/**
 * The inline styles the policy lets through, by the hash of their exact text: these and no
 * other. src/lib/csp.spec.js checks each against the code that writes it, so an update that
 * changes one fails there first.
 */
export const INLINE_STYLES = {
	// the `<style>` that `<qr-scanner>` (@le-space/libp2p-webrtc-qr 0.14.4,
	// src/elements/qr-scanner.js, `STYLE`) puts into its shadow root
	qrScanner: 'sha256-Z3Wzpjr7UsIbVGVKqneWa361kWsrdzJpYt40Xk24R1U='
};

/** the style attributes the policy lets through, by the hash of their exact text */
export const INLINE_STYLE_ATTRIBUTES = {
	// SvelteKit's announcer of the page title after a navigation, hidden by its style
	// attribute (@sveltejs/kit, src/runtime/components/root.svelte, `#svelte-announcer`)
	sveltekitAnnouncer: 'sha256-S8qMpvofolR8Mpjy4kQvEm7m1q8clzU4dfDH0AmvZjo='
};

/**
 * @param {{ localRelay?: boolean }} [options] `localRelay`: a relay on this machine, without
 *   TLS: the end-to-end tests' (tests/start-e2e-server.mjs, VITE_E2E) and `vite dev`'s
 *   (VITE_SEED_NODES_DEV). Never in a production build (scripts/check-production-build.mjs).
 * @returns {Record<string, string[]>}
 */
export function cspDirectives({ localRelay = false } = {}) {
	return {
		// Anything not named below: the app's own files only.
		'default-src': ['self'],
		// The app's own scripts, and SvelteKit's start script by its hash (SvelteKit adds it).
		// No `unsafe-inline`, no `unsafe-eval`, no `wasm-unsafe-eval` (no dependency compiles
		// WebAssembly in the browser), nothing from another host.
		'script-src': ['self'],
		// The app's own stylesheets (Carbon's and the components', bundled by Vite), and the
		// one `<style>` a dependency writes, by its hash. No `unsafe-inline`: an injected
		// `<style>` does not apply.
		'style-src': ['self', ...Object.values(INLINE_STYLES)],
		// Style attributes: none but the one SvelteKit writes, by its hash (`unsafe-hashes`
		// is what lets a hash name an attribute; here it applies to styles only). Svelte sets
		// dynamic styles through the CSSOM (`style:` directives, `style={…}`), which no policy
		// governs.
		'style-src-attr': ['unsafe-hashes', ...Object.values(INLINE_STYLE_ATTRIBUTES)],
		// QR codes (lib/qr/qr-image.js) and contact photos (lib/photo) are data: URLs. No
		// blob:: the vCard and vault files saved through a blob: URL are downloads, which no
		// image policy governs, and no picture is shown from one.
		'img-src': ['self', 'data:'],
		// IBM Plex from static/fonts (lib/fonts.css): no request to IBM's CDN
		'font-src': ['self'],
		'connect-src': [
			'self',
			// the relays' registrations on Aleph
			ALEPH_API,
			// The relays. Their addresses are signed registrations found on Aleph at run time
			// (`*.2n6.me` and `*.libp2p.direct` today), so: any host over TLS. No `ws:` in a
			// production build: an https page dials no WebSocket in the clear anyway
			// (lib/network/dial-policy.js). WebRTC between browsers is outside any policy.
			'wss:',
			...(localRelay ? ['ws://127.0.0.1:*', 'ws://localhost:*'] : [])
		],
		// the service worker, the app's own file
		'worker-src': ['self'],
		// the web app manifest of each language (lib/web-manifest.js)
		'manifest-src': ['self'],
		// no plugins, no frames, no `<base>` pointing elsewhere, no form sent anywhere (every
		// form of the app is handled in the page)
		'object-src': ['none'],
		'frame-src': ['none'],
		'base-uri': ['self'],
		'form-action': ['none'],
		// Trusted Types: markup and script addresses only through the policies named above
		'require-trusted-types-for': ['script'],
		'trusted-types': [...TRUSTED_TYPES_POLICIES]
	};
}
