importScripts("https://favicon-service-2s6k.onrender.com/scram/scramjet.all.js");

const REQUIRED_STORES = ["config", "cookies", "publicSuffixList", "redirectTrackers", "referrerPolicies"];

async function healScramjetDB() {
    if (!indexedDB.databases) return;
    let dbs;
    try { dbs = await indexedDB.databases(); } catch (e) { return; }
    for (const { name } of dbs) {
        if (name !== "$scramjet") continue;
        const corrupt = await new Promise((resolve) => {
            const req = indexedDB.open(name);
            req.onsuccess = () => {
                const stores = Array.from(req.result.objectStoreNames);
                req.result.close();
                resolve(REQUIRED_STORES.some((s) => !stores.includes(s)));
            };
            req.onerror = () => resolve(false);
        });
        if (!corrupt) return;
        await new Promise((resolve) => {
            const del = indexedDB.deleteDatabase(name);
            del.onsuccess = del.onerror = del.onblocked = () => resolve();
        });
        console.warn("sw: removed corrupt $scramjet config DB to self-heal");
    }
}

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) =>
    event.waitUntil(healScramjetDB().then(() => self.clients.claim()))
);

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();

let reactiveHealAttempted = false;

async function handleRequest(event) {
    try {
        await scramjet.loadConfig();
        if (scramjet.route(event)) {
            return scramjet.fetch(event);
        }
    } catch (e) {
        if (e && e.name === "NotFoundError" && !reactiveHealAttempted) {
            reactiveHealAttempted = true;
            await healScramjetDB();
        }
    }
    return fetch(event.request);
}

self.addEventListener("fetch", (event) => {
    event.respondWith(handleRequest(event));
});
