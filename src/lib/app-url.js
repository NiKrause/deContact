/**
 * The address of this app, for links somebody else opens: the invitation link in the QR
 * code, the vault link. It is where the app runs right now (GitHub Pages, a local preview,
 * an IPFS gateway), so a link always leads back to the same app. A build may name another
 * address with VITE_PAGE_URL, e.g. to show a phone a LAN address while developing.
 *
 * Always ends with "/", so `${appUrl()}#/onboarding/...` is a hash route of the app.
 *
 * @param {{ href: string }} [location] defaults to the page's location
 * @param {string} [configured] defaults to VITE_PAGE_URL
 */
export function appUrl(location = globalThis.location, configured = import.meta.env.VITE_PAGE_URL) {
	if (configured) return configured.endsWith('/') ? configured : `${configured}/`;
	// the directory of the page: drops index.html, the query and the hash
	return new URL('.', location.href).href;
}
