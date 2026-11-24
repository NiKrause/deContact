/**
 * An https page may not open ws:// (mixed content). Dialling one only fails later, so
 * refuse it up front; ws:// stays allowed for local development over http.
 */
export function isInsecureWebSocketDial(ma, pageProtocol = typeof location === 'undefined' ? '' : location.protocol) {
    if (pageProtocol !== 'https:') return false
    const address = ma.toString().toLowerCase()
    if (!/\/wss?(\/|$)/.test(address)) return false
    return !address.includes('/tls/') && !/\/wss(\/|$)/.test(address)
}
