/// <reference lib="webworker" />

/**
 * Blob-cache Service Worker
 *
 * Layer 2½ of the byte cache. Intercepts fetches for cloud-files byte
 * URLs (and CDN / share-link URLs once URL-mapping is registered) and
 * serves them from IndexedDB when present, falling through to the
 * network otherwise.
 *
 * Compiled to `/public/blob-sw.js` by
 * `features/files/cache/service-worker/build-sw.ts` and registered from
 * the page side by `features/files/cache/register-service-worker.ts`.
 *
 * Why a separate file & not just bundled with the app:
 *   - The SW runs in its own context, no React, no app imports.
 *   - It needs to be served as a static asset at a stable URL so the
 *     browser can register it with `scope: '/'`.
 *
 * URL recognizer (which fetches we intercept):
 *   - GET `${BACKEND_URL}/files/{id}/download`         — cloud-files bytes
 *   - GET `${BACKEND_URL}/files/{id}/download?version=N` — pinned version
 *   - GET `${BACKEND_URL}/share/{token}/download`      — public share-link bytes
 *   - GET URLs registered via `register-url-mapping` postMessage         — CDN URLs, etc.
 *
 * Signed S3 URLs (anything carrying `X-Amz-Signature`) are NEVER cached
 * because they expire. Same rule as the page-side IDB store.
 *
 * Postmessage protocol (page → SW):
 *   - `{ kind: 'set-config', backendUrl, userId }`
 *   - `{ kind: 'invalidate', fileId?, key?, userId? }`
 *   - `{ kind: 'clear-user', userId }`
 *   - `{ kind: 'register-url-mapping', url, fileId, version, checksum }`
 *
 * Postmessage (SW → page):
 *   - `{ kind: 'cache-stat-update', totalBytes, entryCount }`
 *   - `{ kind: 'sw-ready' }` (single shot on `activate`)
 */

// ---------------------------------------------------------------------------
// SW global typing
// ---------------------------------------------------------------------------

declare const self: ServiceWorkerGlobalScope;

const SW_VERSION = "1";
const DB_NAME = "matrx-blob-cache";
const DB_VERSION = 1;
const STORE_BLOBS = "blobs";
const STORE_URL_MAP = "urlMap";

// Runtime config — pushed from the page via `set-config`. Until config
// arrives, the SW falls through every request to the network so we never
// gate startup on a not-yet-configured cache.
const config: {
    backendUrl: string | null;
    userId: string | null;
} = {
    backendUrl: null,
    userId: null,
};

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

self.addEventListener("install", (event) => {
    // skipWaiting so a new SW version takes over without a manual reload.
    // The cache schema is versioned independently inside IndexedDB.
    event.waitUntil((self as ServiceWorkerGlobalScope).skipWaiting());
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        (async () => {
            await (self as ServiceWorkerGlobalScope).clients.claim();
            // Notify every open client that the SW is now active. Useful
            // during dev — page logs show when registration completed.
            const clients = await (
                self as ServiceWorkerGlobalScope
            ).clients.matchAll({ type: "window" });
            for (const client of clients) {
                client.postMessage({ kind: "sw-ready", version: SW_VERSION });
            }
        })(),
    );
});

// ---------------------------------------------------------------------------
// IndexedDB helpers (vanilla, no Dexie — keeps the SW bundle tiny)
// ---------------------------------------------------------------------------

interface BlobRecord {
    key: string;
    userId: string;
    fileId: string | null;
    version: number | null;
    checksum: string | null;
    mimeType: string;
    bytes: number;
    blob: Blob;
    etag: string | null;
    fetchedAt: number;
    lastAccessedAt: number;
    source: string;
}

interface UrlMapRecord {
    urlHash: string;
    fileId: string;
    version: number | null;
    checksum: string | null;
    registeredAt: number;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
        try {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onerror = () => resolve(null);
            req.onsuccess = () => resolve(req.result);
            req.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(STORE_BLOBS)) {
                    const store = db.createObjectStore(STORE_BLOBS, {
                        keyPath: "key",
                    });
                    store.createIndex("userId", "userId", { unique: false });
                    store.createIndex("lastAccessedAt", "lastAccessedAt", {
                        unique: false,
                    });
                    store.createIndex("bytes", "bytes", { unique: false });
                }
                if (!db.objectStoreNames.contains(STORE_URL_MAP)) {
                    db.createObjectStore(STORE_URL_MAP, { keyPath: "urlHash" });
                }
            };
        } catch {
            resolve(null);
        }
    });
    return dbPromise;
}

async function idbGet<T>(
    storeName: string,
    key: string,
): Promise<T | null> {
    const db = await openDb();
    if (!db) return null;
    return new Promise((resolve) => {
        try {
            const tx = db.transaction(storeName, "readonly");
            const req = tx.objectStore(storeName).get(key);
            req.onsuccess = () => resolve((req.result as T) ?? null);
            req.onerror = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
}

async function idbGetByIndex<T>(
    storeName: string,
    indexName: string,
    value: IDBValidKey,
): Promise<T[]> {
    const db = await openDb();
    if (!db) return [];
    return new Promise((resolve) => {
        try {
            const tx = db.transaction(storeName, "readonly");
            const req = tx.objectStore(storeName).index(indexName).getAll(value);
            req.onsuccess = () => resolve((req.result as T[]) ?? []);
            req.onerror = () => resolve([]);
        } catch {
            resolve([]);
        }
    });
}

async function idbUpdate(
    storeName: string,
    key: string,
    updater: (record: Record<string, unknown>) => Record<string, unknown>,
): Promise<void> {
    const db = await openDb();
    if (!db) return;
    return new Promise((resolve) => {
        try {
            const tx = db.transaction(storeName, "readwrite");
            const store = tx.objectStore(storeName);
            const getReq = store.get(key);
            getReq.onsuccess = () => {
                const existing = getReq.result as
                    | Record<string, unknown>
                    | undefined;
                if (!existing) {
                    resolve();
                    return;
                }
                const updated = updater(existing);
                const putReq = store.put(updated);
                putReq.onsuccess = () => resolve();
                putReq.onerror = () => resolve();
            };
            getReq.onerror = () => resolve();
        } catch {
            resolve();
        }
    });
}

async function idbDelete(storeName: string, key: string): Promise<void> {
    const db = await openDb();
    if (!db) return;
    return new Promise((resolve) => {
        try {
            const tx = db.transaction(storeName, "readwrite");
            const req = tx.objectStore(storeName).delete(key);
            req.onsuccess = () => resolve();
            req.onerror = () => resolve();
        } catch {
            resolve();
        }
    });
}

async function idbDeleteByIndex(
    storeName: string,
    indexName: string,
    value: IDBValidKey,
): Promise<void> {
    const db = await openDb();
    if (!db) return;
    return new Promise((resolve) => {
        try {
            const tx = db.transaction(storeName, "readwrite");
            const store = tx.objectStore(storeName);
            const idx = store.index(indexName);
            const req = idx.openCursor(IDBKeyRange.only(value));
            req.onsuccess = () => {
                const cursor = req.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                } else {
                    resolve();
                }
            };
            req.onerror = () => resolve();
        } catch {
            resolve();
        }
    });
}

// ---------------------------------------------------------------------------
// URL recognizer
// ---------------------------------------------------------------------------

const FILES_DOWNLOAD_RE = /^\/files\/([0-9a-f-]{36})\/download(?:\?|$)/i;
const SHARE_DOWNLOAD_RE = /^\/share\/([^/]+)\/download(?:\?|$)/i;

interface RecognizedUrl {
    kind: "files-download" | "share-download" | "url-mapped";
    key: string;
    fileId?: string;
    version?: number | null;
    checksum?: string | null;
}

async function recognize(request: Request): Promise<RecognizedUrl | null> {
    if (!config.userId) return null;
    if (!config.backendUrl) return null;
    if (request.method !== "GET") return null;

    let parsed: URL;
    try {
        parsed = new URL(request.url);
    } catch {
        return null;
    }

    // Signed S3 URLs are never cached — they expire.
    if (parsed.searchParams.has("X-Amz-Signature")) return null;

    // Backend `/files/{id}/download`
    if (parsed.origin === config.backendUrl) {
        const filesMatch = FILES_DOWNLOAD_RE.exec(parsed.pathname);
        if (filesMatch) {
            const fileId = filesMatch[1];
            const versionParam = parsed.searchParams.get("version");
            const version = versionParam ? Number(versionParam) : null;
            const versionSegment = version != null ? String(version) : "current";
            // The checksum lives in IDB on existing entries; we can't know
            // it before reading. For lookup we scan by-userId for matching
            // (fileId, version) — same as the page-side hydrate path.
            return {
                kind: "files-download",
                key: `${config.userId}:${fileId}:${versionSegment}:lookup`,
                fileId,
                version,
            };
        }
        const shareMatch = SHARE_DOWNLOAD_RE.exec(parsed.pathname);
        if (shareMatch) {
            const urlHash = await sha256Hex(request.url);
            return {
                kind: "share-download",
                key: `${config.userId}:url:${urlHash}`,
            };
        }
    }

    // URL-mapping registered via postMessage — public CDN URLs etc.
    const urlHash = await sha256Hex(request.url);
    const mapping = await idbGet<UrlMapRecord>(STORE_URL_MAP, urlHash);
    if (mapping) {
        const versionSegment =
            mapping.version != null ? String(mapping.version) : "current";
        const checksumSegment = mapping.checksum ?? "unknown";
        return {
            kind: "url-mapped",
            key: `${config.userId}:${mapping.fileId}:${versionSegment}:${checksumSegment}`,
            fileId: mapping.fileId,
            version: mapping.version,
            checksum: mapping.checksum,
        };
    }

    return null;
}

async function sha256Hex(input: string): Promise<string> {
    const data = new TextEncoder().encode(input);
    const buf = await crypto.subtle.digest("SHA-256", data);
    const bytes = new Uint8Array(buf);
    let hex = "";
    for (let i = 0; i < bytes.length; i++) {
        hex += bytes[i].toString(16).padStart(2, "0");
    }
    return hex;
}

// ---------------------------------------------------------------------------
// Fetch handler
// ---------------------------------------------------------------------------

self.addEventListener("fetch", (event) => {
    // Wrap async work in an IIFE so we can hand the Promise to respondWith
    // only when we intend to handle the request. Unmatched requests fall
    // through to default browser fetch semantics.
    const responsePromise = handleFetch(event.request);
    event.respondWith(
        responsePromise.then((response) => response ?? fetch(event.request)),
    );
});

async function handleFetch(request: Request): Promise<Response | null> {
    const recognized = await recognize(request);
    if (!recognized) return null;

    const rangeHeader = request.headers.get("Range");

    // For `files-download` keys we don't know the checksum a priori; scan
    // by-userId for a matching (fileId, version) entry.
    let entry: BlobRecord | null = null;
    if (recognized.kind === "files-download" && recognized.fileId) {
        const candidates = await idbGetByIndex<BlobRecord>(
            STORE_BLOBS,
            "userId",
            config.userId as string,
        );
        const wantVersion = recognized.version ?? null;
        const matches = candidates.filter(
            (e) => e.fileId === recognized.fileId && e.version === wantVersion,
        );
        if (matches.length > 0) {
            entry = matches.reduce((best, candidate) =>
                candidate.lastAccessedAt > best.lastAccessedAt ? candidate : best,
            );
        }
    } else {
        entry = await idbGet<BlobRecord>(STORE_BLOBS, recognized.key);
    }

    if (!entry) {
        return null; // miss — fall through to network
    }

    // Bump LRU position (fire-and-forget).
    void idbUpdate(STORE_BLOBS, entry.key, (rec) => ({
        ...rec,
        lastAccessedAt: Date.now(),
    }));

    // Serve a Range response when requested (PDF.js progressive rendering,
    // <video> seek, etc.). The cached blob slices cheaply.
    if (rangeHeader) {
        return serveRangeFromBlob(entry, rangeHeader);
    }

    return new Response(entry.blob, {
        status: 200,
        headers: {
            "Content-Type": entry.mimeType,
            "Content-Length": String(entry.bytes),
            "Accept-Ranges": "bytes",
            ETag: entry.etag ? `"${entry.etag}"` : "",
            "X-Matrx-Cache": "hit",
        },
    });
}

function serveRangeFromBlob(entry: BlobRecord, rangeHeader: string): Response {
    const total = entry.bytes;
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
    if (!match) {
        return new Response(entry.blob, {
            status: 200,
            headers: {
                "Content-Type": entry.mimeType,
                "Content-Length": String(total),
                "Accept-Ranges": "bytes",
                "X-Matrx-Cache": "hit",
            },
        });
    }
    let start = match[1] ? Number(match[1]) : 0;
    let end = match[2] ? Number(match[2]) : total - 1;
    if (start >= total) {
        return new Response(null, {
            status: 416,
            headers: {
                "Content-Range": `bytes */${total}`,
                "X-Matrx-Cache": "hit",
            },
        });
    }
    end = Math.min(end, total - 1);
    if (start < 0) start = 0;
    const slice = entry.blob.slice(start, end + 1);
    return new Response(slice, {
        status: 206,
        headers: {
            "Content-Type": entry.mimeType,
            "Content-Range": `bytes ${start}-${end}/${total}`,
            "Content-Length": String(end - start + 1),
            "Accept-Ranges": "bytes",
            "X-Matrx-Cache": "hit",
        },
    });
}

// ---------------------------------------------------------------------------
// Page → SW messages
// ---------------------------------------------------------------------------

interface MessageBase {
    kind: string;
}
interface SetConfigMsg extends MessageBase {
    kind: "set-config";
    backendUrl: string;
    userId: string | null;
}
interface InvalidateMsg extends MessageBase {
    kind: "invalidate";
    fileId?: string;
    key?: string;
}
interface ClearUserMsg extends MessageBase {
    kind: "clear-user";
    userId: string;
}
interface RegisterUrlMappingMsg extends MessageBase {
    kind: "register-url-mapping";
    url: string;
    fileId: string;
    version: number | null;
    checksum: string | null;
}

type IncomingMessage =
    | SetConfigMsg
    | InvalidateMsg
    | ClearUserMsg
    | RegisterUrlMappingMsg;

self.addEventListener("message", async (event) => {
    const msg = event.data as IncomingMessage;
    if (!msg || typeof msg !== "object" || !("kind" in msg)) return;
    switch (msg.kind) {
        case "set-config":
            config.backendUrl = msg.backendUrl.replace(/\/$/, "");
            config.userId = msg.userId;
            return;
        case "invalidate":
            if (msg.key) {
                await idbDelete(STORE_BLOBS, msg.key);
            } else if (msg.fileId && config.userId) {
                // Drop every cached version of this file for the current user.
                const entries = await idbGetByIndex<BlobRecord>(
                    STORE_BLOBS,
                    "userId",
                    config.userId,
                );
                for (const entry of entries) {
                    if (entry.fileId === msg.fileId) {
                        await idbDelete(STORE_BLOBS, entry.key);
                    }
                }
            }
            return;
        case "clear-user":
            await idbDeleteByIndex(STORE_BLOBS, "userId", msg.userId);
            return;
        case "register-url-mapping": {
            const urlHash = await sha256Hex(msg.url);
            const db = await openDb();
            if (!db) return;
            try {
                const tx = db.transaction(STORE_URL_MAP, "readwrite");
                tx.objectStore(STORE_URL_MAP).put({
                    urlHash,
                    fileId: msg.fileId,
                    version: msg.version,
                    checksum: msg.checksum,
                    registeredAt: Date.now(),
                } as UrlMapRecord);
            } catch {
                // ignore
            }
            return;
        }
        default:
            return;
    }
});

export {}; // keep TS treating this as a module
