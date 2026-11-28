/**
 * Installing deContact (#146): Chrome and Edge fire `beforeinstallprompt` when the app can
 * be installed. The layout keeps that event here, so a button can open Chrome's own install
 * dialog (with the manifest's screenshots) when the person asks. iOS Safari has no such
 * event: there the button explains Share → Add to Home Screen. Once the app runs installed,
 * there is no button.
 */
import { readable, writable } from 'svelte/store'

/** Chrome's install prompt, once it offered one @type {import('svelte/store').Writable<any>} */
export const installPrompt = writable(undefined)

/** whether the app runs installed (a window of its own) */
export const installed = readable(false, (set) => {
    if (typeof window === 'undefined') return
    const standalone = window.matchMedia?.('(display-mode: standalone)')
    const update = () => set(Boolean(standalone?.matches || /** @type {any} */ (navigator).standalone))
    update()
    standalone?.addEventListener?.('change', update)
    window.addEventListener('appinstalled', update)
    return () => {
        standalone?.removeEventListener?.('change', update)
        window.removeEventListener('appinstalled', update)
    }
})

/** keeps Chrome's prompt for our button instead of its own banner */
export function keepInstallPrompt(event) {
    event.preventDefault()
    installPrompt.set(event)
}

/** an iPhone or iPad, where Safari installs through Share → Add to Home Screen */
export function isIos(nav = globalThis.navigator) {
    if (!nav) return false
    return /iPhone|iPad|iPod/.test(nav.userAgent ?? '') || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)
}

/** opens Chrome's install dialog; the prompt can be used once */
export async function install(prompt) {
    if (!prompt) return false
    installPrompt.set(undefined)
    await prompt.prompt()
    const choice = await prompt.userChoice
    return choice?.outcome === 'accepted'
}
