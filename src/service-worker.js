/// <reference types="@sveltejs/kit" />
// SvelteKit 3 removed $service-worker: the build output and the static files come
// from $app/manifest, relative to the base path, and the version from $app/env
import { immutable, assets } from '$app/manifest';
import { version } from '$app/env';
import { asset, resolve } from '$app/paths';

const CACHE = `cache-${version}`;

const ASSETS = [
    ...immutable.map(({ path }) => resolve(`/${path}`)), // the app itself
    ...assets.map(({ path }) => asset(path))  // everything in `static`
];

self.addEventListener('install', (event) => {
    async function addFilesToCache() {

        const cache = await caches.open(CACHE);
        await cache.addAll(ASSETS);
    }
    self.skipWaiting(); //we automatically install the latest version
    event.waitUntil(addFilesToCache());
});

self.addEventListener('activate', (event) => {
    // Remove previous cached data from disk
    async function deleteOldCaches() {
        for (const key of await caches.keys()) {
            if (key !== CACHE) await caches.delete(key);
        }
    }

    event.waitUntil(deleteOldCaches());
});
self.addEventListener('put', (event) => { console.log("put was called",event)})
self.addEventListener('fetch', (event) => {
    // ignore POST requests etc
    if (event.request.method !== 'GET') return;

    async function respond() {
        const url = new URL(event.request.url);
        const cache = await caches.open(CACHE);

        // `build`/`files` can always be served from the cache
        if (ASSETS.includes(url.pathname)) {
            const response = await cache.match(url.pathname);

            if (response) {
                return response;
            }
        }

        // for everything else, try the network first, but
        // fall back to the cache if we're offline
        try {
            const response = await fetch(event.request);

            // if we're offline, fetch can return a value that is not a Response
            // instead of throwing - and we can't pass this non-Response to respondWith
            if (!(response instanceof Response)) {
                throw new Error('invalid response from fetch');
            }

            if (response.status === 200) {
                //cache.put(event.request, response.clone());
            }

            return response;
        } catch (err) {
            const response = await cache.match(event.request);

            if (response) {
                return response;
            }

            // if there's no cache, then just error out
            // as there is nothing we can do to respond to this request
            throw err;
        }
    }

    event.respondWith(respond());
});