/**
 * What deContact keeps in localStorage beside the vault: the invitation links we opened
 * (exchanges.js) and the ones we issued (contact-messages.js).
 *
 * While the identity is temporary (#97), none of it is written: it is held in this page's
 * memory, written out once a passkey secures the identity (`keep`), and gone with the tab
 * otherwise. A device that never secured its identity keeps nothing of it.
 */

/**
 * @param {Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>} backing e.g. localStorage
 */
export function createHeldStorage(backing) {
    /** key -> value (null: removed) while held, else undefined @type {Map<string, string | null> | undefined} */
    let held
    return {
        /** from now on, nothing reaches `backing` until `keep` */
        hold() {
            held ??= new Map()
        },
        get holding() {
            return held !== undefined
        },
        /** what was held goes to `backing`; later writes go there directly */
        keep() {
            if (!held) return
            const writes = held
            held = undefined
            for (const [key, value] of writes) {
                if (value === null) backing.removeItem(key)
                else backing.setItem(key, value)
            }
        },
        // while held, `backing` is not read either: what is in it belongs to no identity of this page
        getItem(key) {
            if (held) return held.get(key) ?? null
            return backing.getItem(key)
        },
        setItem(key, value) {
            if (held) held.set(key, String(value))
            else backing.setItem(key, value)
        },
        removeItem(key) {
            if (held) held.set(key, null)
            else backing.removeItem(key)
        }
    }
}

/** this page's: localStorage, held while the identity is temporary */
export const deviceStorage = createHeldStorage({
    getItem: (key) => globalThis.localStorage.getItem(key),
    setItem: (key, value) => globalThis.localStorage.setItem(key, value),
    removeItem: (key) => globalThis.localStorage.removeItem(key)
})
