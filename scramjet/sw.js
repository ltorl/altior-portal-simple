importScripts("https://favicon-service-2s6k.onrender.com/scram/scramjet.all.js");

const REQUIRED_STORES = ["config", "cookies", "publicSuffixList", "redirectTrackers", "referrerPolicies"];

function probeStores(name) {
    return new Promise((resolve) => {
        const req = indexedDB.open(name);
        req.onupgradeneeded = (e) => { e.target.transaction.abort(); resolve(null); };
        req.onsuccess = () => {
            const stores = Array.from(req.result.objectStoreNames);
            req.result.close();
            resolve(stores);
        };
        req.onerror = () => resolve(null);
    });
}

function deleteDB(name) {
    return new Promise((resolve) => {
        const del = indexedDB.deleteDatabase(name);
        del.onsuccess = del.onerror = del.onblocked = () => resolve();
    });
}

function createDB(name) {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(name, 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            for (const store of REQUIRED_STORES) {
                if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
            }
        };
        req.onsuccess = () => { req.result.close(); resolve(); };
        req.onerror = () => reject(req.error);
    });
}

async function ensureScramjetDB() {
    let exists = false;
    if (indexedDB.databases) {
        let dbs = [];
        try { dbs = await indexedDB.databases(); } catch (e) { dbs = []; }
        exists = dbs.some((d) => d.name === "$scramjet");
    }
    if (exists) {
        const stores = await probeStores("$scramjet");
        if (stores && REQUIRED_STORES.every((s) => stores.includes(s))) return;
        await deleteDB("$scramjet");
    }
    await createDB("$scramjet");
}

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) =>
    event.waitUntil(ensureScramjetDB().then(() => self.clients.claim()))
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
            await ensureScramjetDB();
        }
    }
    return fetch(event.request);
}

self.addEventListener("fetch", (event) => {
    event.respondWith(handleRequest(event));
});
