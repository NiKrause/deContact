/**
 * Which relays the browser dials first.
 *
 * With Aleph discovery on, the app asks the Aleph network (api.aleph.im, through
 * @le-space/aleph-bootstrap) for the orbitdb-relays registered there, and dials those
 * besides the ones configured in VITE_SEED_NODES. When discovery fails or takes too
 * long, the configured ones are all there is.
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

const DISCOVERY_TIMEOUT_MS = 8_000

/**
 * @param {{ configured: string[], enabled: boolean, discover?: () => Promise<string[]>, timeoutMs?: number }} options
 * @returns {Promise<string[]>} discovered relays first, then the configured ones, without duplicates
 */
export async function selectSeedNodes({ configured, enabled, discover = discoverAlephRelays, timeoutMs = DISCOVERY_TIMEOUT_MS }) {
    if (!enabled) return configured
    let timer
    try {
        const discovered = await Promise.race([
            discover(),
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error(`no answer within ${timeoutMs} ms`)), timeoutMs)
            })
        ])
        const relays = [...new Set([...(discovered ?? []).map(String), ...configured])]
        console.log(`relays: ${discovered?.length ?? 0} found on Aleph, ${configured.length} configured`)
        return relays
    } catch (error) {
        console.log('finding relays on Aleph failed, using the configured ones:', error?.message)
        return configured
    } finally {
        clearTimeout(timer)
    }
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
