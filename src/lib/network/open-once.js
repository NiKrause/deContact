/**
 * OrbitDB's `open`, one at a time per database. OrbitDB keeps a database it has opened and
 * hands it out again, but only once the open is done: two opens of the same address at once
 * both register its heads protocol, and libp2p refuses the second
 * (DuplicateProtocolHandlerError). The app opens a contact's book from more than one place
 * (writing our card after a request, keeping a backup of the books we follow, removing a
 * contact), so an open already under way is shared instead.
 *
 * @param {{ open: (address: string, options?: object) => Promise<any> }} orbitdb changed in place
 * @returns the same orbitdb
 */
export function openingOnce(orbitdb) {
    if (orbitdb.open.openingOnce) return orbitdb
    const open = orbitdb.open.bind(orbitdb)
    const underWay = new Map()
    const shared = (address, options) => {
        const key = String(address)
        if (!underWay.has(key)) underWay.set(key, open(address, options).finally(() => underWay.delete(key)))
        return underWay.get(key)
    }
    shared.openingOnce = true
    orbitdb.open = shared
    return orbitdb
}
