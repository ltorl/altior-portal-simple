importScripts("https://favicon-service-2s6k.onrender.com/scram/scramjet.all.js");

// Object stores scramjet 1.1.0 creates in its "$scramjet" config DB. An older scramjet
// version (or a half-created DB) leaves some of these missing; because loadConfig opens the
// DB at a fixed version it never re-runs the upgrade, so every request throws
// NotFoundError ("object store not found") and the page is bricked. We self-heal by deleting
// such a DB so loadConfig recreates it cleanly.
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

// Heal BEFORE claiming clients: at activate time the SW hasn't opened the config DB yet, so
// the delete runs without the open-connection contention that otherwise deadlocks it.
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
        // NotFoundError => corrupt config DB slipped past activate-time healing (e.g. it was
        // blocked by an open connection). Try once more, guarded so we never loop. If it's
        // still blocked the next SW restart's activate handler will clean it up.
        if (e && e.name === "NotFoundError" && !reactiveHealAttempted) {
            reactiveHealAttempted = true;
            await healScramjetDB();
        }
        // Otherwise the config simply isn't loaded yet (the opener never inits a controller).
        // Either way, fall through to the network so non-proxied fetches still work.
    }
    return fetch(event.request);
}

self.addEventListener("fetch", (event) => {
    event.respondWith(handleRequest(event));
});
