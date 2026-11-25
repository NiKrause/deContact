/**
 * Which relays the browser dials first.
 *
 * With Aleph discovery on, the app asks the Aleph network (api.aleph.im, through
 * @le-space/aleph-bootstrap) for the orbitdb-relays registered there, and dials those
 * besides the ones configured in VITE_SEED_NODES. If Aleph answers slowly, the app
 * starts with the configured ones and dials the Aleph relays once they are found.
 */

/**
 * Le Space's production orbitdb-relays. Relays register as `relay:<profile>:<name>:<suffix>`;
 * matching the name keeps out other relay kinds and the throwaway relays smoke and E2E runs
 * register in the same channel (`relay:orbitdb-relay:smoke-…`), whose addresses are dead.
 */
export const ALEPH_RELAY_PROFILE = 'orbitdb-relay'
export const ALEPH_RELAY_REGISTRATION = 'relay:orbitdb-relay:orbitdb-relay'

/** registration ids of the production relays among Aleph relay posts */
export function productionRegistrations(posts, registration = ALEPH_RELAY_REGISTRATION) {
    const ids = (posts ?? [])
        .map((post) => post?.content?.registrationId)
        .filter((id) => typeof id === 'string' && (id === registration || id.startsWith(`${registration}:`)))
    return [...new Set(ids)]
}

const DISCOVERY_TIMEOUT_MS = 20_000
const STILL_LOOKING = Symbol('still looking')

/**
 * The relays to start with.
 *
 * Waits up to `timeoutMs` for Aleph. If Aleph answers later, the app starts with the
 * configured relays and `later` delivers the ones found on Aleph, to dial then: a slow
 * answer must not leave the app without relays.
 *
 * @param {{ configured: string[], enabled: boolean, discover?: () => Promise<string[]>, timeoutMs?: number }} options
 * @returns {Promise<{ relays: string[], later: Promise<string[]> | null }>} relays: found on Aleph first,
 *   then the configured ones, without duplicates
 */
export async function selectSeedNodes({ configured, enabled, discover = discoverAlephRelays, timeoutMs = DISCOVERY_TIMEOUT_MS }) {
    if (!enabled) return { relays: configured, later: null }
    const lookup = Promise.resolve()
        .then(discover)
        .then((found) => (found ?? []).map(String))
    let timer
    try {
        const found = await Promise.race([
            lookup,
            new Promise((resolve) => { timer = setTimeout(() => resolve(STILL_LOOKING), timeoutMs) })
        ])
        if (found === STILL_LOOKING) {
            console.log(`no answer from Aleph within ${timeoutMs} ms; starting with ${configured.length} configured relays and still looking`)
            const later = lookup.then(
                (relays) => { console.log(`relays: ${relays.length} found on Aleph (late)`); return relays },
                (error) => { console.log('finding relays on Aleph failed:', error?.message); return [] }
            )
            return { relays: configured, later }
        }
        console.log(`relays: ${found.length} found on Aleph, ${configured.length} configured`)
        return { relays: [...new Set([...found, ...configured])], later: null }
    } catch (error) {
        console.log('finding relays on Aleph failed, using the configured ones:', error?.message)
        return { relays: configured, later: null }
    } finally {
        clearTimeout(timer)
    }
}

/** relay multiaddrs grouped by relay peer id, so each relay is dialled once with all its addresses */
export function groupByPeer(multiaddrs) {
    const groups = new Map()
    for (const addr of multiaddrs) {
        const peerId = addr.split('/p2p/').at(-1)
        if (!peerId) continue
        groups.set(peerId, [...(groups.get(peerId) ?? []), addr])
    }
    return groups
}

/** registered production relays a browser can dial (wss / tls/ws only), signatures verified */
export async function discoverAlephRelays() {
    // loaded only when discovery is on, so a build without it stays small
    const aleph = await import('@le-space/aleph-bootstrap')
    const posts = await aleph.fetchAlephBootstrapPosts({})
    const registrationId = productionRegistrations(aleph.filterRelayBootstrapPostsByProfile(posts, ALEPH_RELAY_PROFILE))
    if (registrationId.length === 0) return []
    const addrs = await aleph.discoverAlephBootstrapMultiaddrs({ profile: ALEPH_RELAY_PROFILE, registrationId, browserDialableOnly: true })
    return (addrs ?? []).map(String)
}

/** the relay peer ids in a list of multiaddrs */
export const peerIdsOf = (multiaddrs) => [...new Set(multiaddrs.map((addr) => addr.split('/p2p/').at(-1)).filter(Boolean))]
