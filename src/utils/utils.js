import { notificationMessage, notificationKind, showNotification, libp2p } from "../stores.js";

/**
 * Make an sha256 hash
 * @param (string) input
 * @returns {Promise<string>}
 */
export async function sha256(input) {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

/**
 * A toast for a moment. The message comes from the catalogue (t(), #89), so its kind is
 * said here rather than guessed from its words.
 * @param {string} message
 * @param {'success' | 'warning' | 'error'} [kind]
 */
export function notify(message, kind = 'success') {
    notificationKind.set(kind);
    notificationMessage.set(message);
    showNotification.set(true)

    setTimeout(() => {
        showNotification.set(false)
        notificationMessage.set(undefined);
    }, 2000);
}

let _libp2p

/**
 * {string} _notificationMessage
 */
let _notificationMessage
/**
 * {string} _showNotification
 */
let _showNotification

libp2p.subscribe((value) => {
    _libp2p = value
});

notificationMessage.subscribe((value) => {
    _notificationMessage = value
});
showNotification.subscribe((value) => {
    _showNotification = value
})