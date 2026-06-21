importScripts("https://favicon-service-2s6k.onrender.com/scram/scramjet.all.js");

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();

async function handleRequest(event) {
    await scramjet.loadConfig();
    if (scramjet.route(event)) {
        return scramjet.fetch(event);
    }
    return fetch(event.request);
}

self.addEventListener("fetch", (event) => {
    event.respondWith(handleRequest(event));
});
