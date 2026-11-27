/**
 * The end-to-end tests' hook (#81), as in Le-Space/belege: `window.__decontactE2E`.
 *
 * p2p-operations.js loads this module only when the build sets VITE_E2E
 * (tests/start-e2e-server.mjs does), so a production build contains neither the module
 * nor the global (scripts/check-production-build.mjs fails the build otherwise).
 *
 * It writes into any address book by its address the way any copy of the app could: as
 * the page's OrbitDB identity, through the access controller, but without the app's
 * rules and without sealing (tests/WriteAccess.spec.js). Every call says what happened
 * instead of throwing, so the test can tell a refused write from a broken page.
 */

/** @param {any} orbitdb the page's OrbitDB */
export function installE2EHook(orbitdb) {
    const open = (address) => orbitdb.open(address, { type: 'documents', sync: true })
    const attempt = async (write) => {
        try {
            return { ok: true, hash: await write() }
        } catch (error) {
            return { ok: false, error: String(error?.message ?? error) }
        }
    }
    window.__decontactE2E = {
        /** opens a book by its address: its owner and access controller, from its manifest */
        async open(address) {
            const db = await open(address)
            return { address: db.address, type: db.access?.type, owner: db.access?.owner }
        },
        /** puts a document as it is: `{ ok: true, hash }` or `{ ok: false, error }` */
        put: (address, doc) => attempt(async () => (await open(address)).put(doc)),
        /** deletes a document: `{ ok: true, hash }` or `{ ok: false, error }` */
        del: (address, key) => attempt(async () => (await open(address)).del(key)),
        /** the documents as this page stores them, sealed or not: `[{ key, value, hash }]` */
        async all(address) {
            const records = await (await open(address)).all()
            return records.map(({ key, value, hash }) => ({ key, value, hash }))
        },
        /** the hashes of every entry in the book's log, the ones a newer one replaced too */
        async entries(address) {
            const entries = await (await open(address)).log.values()
            return entries.map((entry) => entry.hash)
        }
    }
}
