importScripts("https://favicon-service-2s6k.onrender.com/scram/scramjet.all.js");

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();

async function handleRequest(event) {
    try {
        await scramjet.loadConfig();
        if (scramjet.route(event)) {
            return scramjet.fetch(event);
        }
    } catch (e) {
        // Scramjet config DB not initialized yet (e.g. in the opener, which never inits a
        // controller). Don't let it reject the request — fall through to the network so
        // non-proxied fetches (like loading v2.html) still work.
    }
    return fetch(event.request);
}

self.addEventListener("fetch", (event) => {
    event.respondWith(handleRequest(event));
});
