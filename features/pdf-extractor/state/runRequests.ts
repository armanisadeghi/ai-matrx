/**
 * The server run each PDF document has in flight from THIS tab — its
 * `X-Request-ID`, kept in sessionStorage so a refresh (same tab) can reconnect
 * to exactly the run it started. Another tab or device finds the run through
 * the server's `processed_document` link instead; this is the fast, exact path.
 *
 * Entries are dropped once the run settles, and expire after a day so a tab
 * left open never points at an ancient run.
 */

const STORAGE_KEY = "pdf-extractor:runs";
const MAX_AGE_MS = 24 * 60 * 60_000;

export type PdfRunKind = "upload" | "clean";

export interface PdfRunRequest {
  requestId: string;
  kind: PdfRunKind;
  at: number;
}

type RunMap = Record<string, PdfRunRequest>;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function readAll(now: number): RunMap {
  const store = storage();
  if (!store) return {};
  try {
    const parsed = JSON.parse(store.getItem(STORAGE_KEY) ?? "{}") as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: RunMap = {};
    for (const [docId, entry] of Object.entries(parsed as Record<string, unknown>)) {
      const e = entry as Partial<PdfRunRequest>;
      if (
        typeof e?.requestId === "string" &&
        (e.kind === "upload" || e.kind === "clean") &&
        typeof e.at === "number" &&
        now - e.at < MAX_AGE_MS
      ) {
        out[docId] = { requestId: e.requestId, kind: e.kind, at: e.at };
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeAll(map: RunMap): void {
  const store = storage();
  if (!store) return;
  try {
    if (Object.keys(map).length === 0) store.removeItem(STORAGE_KEY);
    else store.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Storage full or blocked: the server's document link still finds the run.
  }
}

export function savePdfRunRequest(
  docId: string,
  requestId: string | null | undefined,
  kind: PdfRunKind,
  now: number = Date.now(),
): void {
  if (!docId || !requestId) return;
  const map = readAll(now);
  map[docId] = { requestId, kind, at: now };
  writeAll(map);
}

export function readPdfRunRequest(
  docId: string | null | undefined,
  now: number = Date.now(),
): PdfRunRequest | null {
  if (!docId) return null;
  return readAll(now)[docId] ?? null;
}

/** Forget a doc's run — only when it is still the one named (a newer run keeps its entry). */
export function clearPdfRunRequest(docId: string, requestId?: string | null): void {
  const map = readAll(Date.now());
  const entry = map[docId];
  if (!entry) return;
  if (requestId && entry.requestId !== requestId) return;
  delete map[docId];
  writeAll(map);
}
