/// <reference types="@sveltejs/kit" />
// The app's own files, so that it starts without a network (a PWA). SvelteKit 3 removed
// $service-worker: the build output and the static files come from $app/manifest,
// relative to the base path, and the version from $app/env.
import { immutable, assets } from '$app/manifest';
import { version } from '$app/env';
import { asset, resolve } from '$app/paths';

const CACHE = `cache-${version}`;

/** the app's page: every view is a hash route of it (/deContact/ on GitHub Pages) */
const SHELL = new URL(self.registration.scope).pathname;

const ASSETS = [
    ...immutable.map(({ path }) => resolve(`/${path}`)), // the app itself
    // everything in `static`, but the pictures of the link previews, which the app never shows
    ...assets.filter(({ path }) => !path.startsWith('og-image')).map(({ path }) => asset(path))
];

self.addEventListener('install', (event) => {
    async function addFilesToCache() {
        const cache = await caches.open(CACHE);
        await cache.addAll([...ASSETS, SHELL]);
    }
    self.skipWaiting(); // we automatically install the latest version
    event.waitUntil(addFilesToCache());
});

self.addEventListener('activate', (event) => {
    // Remove previous cached data from disk, and serve the pages open right now
    async function deleteOldCaches() {
        for (const key of await caches.keys()) {
            if (key !== CACHE) await caches.delete(key);
        }
        await self.clients.claim();
    }

    event.waitUntil(deleteOldCaches());
});

self.addEventListener('fetch', (event) => {
    // ignore POST requests etc
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);
    // relays, Aleph and every other origin: the browser asks them itself
    if (url.origin !== self.location.origin) return;

    async function respond() {
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

            return response;
        } catch (err) {
            // offline: a page load gets the app's page, whatever its query
            const response = (event.request.mode === 'navigate' && (await cache.match(SHELL))) || (await cache.match(event.request));

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
