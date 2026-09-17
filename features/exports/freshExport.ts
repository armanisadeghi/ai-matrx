// features/exports/freshExport.ts
//
// A one-hop handoff from the drop zone to the Library page.
//
// 🚨 IT IS A HEAD START, NEVER THE SOURCE OF TRUTH. The Library page ALWAYS
// re-reads from the server on mount (the index keeps running whether or not
// anybody is connected, so a page that trusted what the previous screen knew
// would be stale within seconds). This only lets the first paint after an
// upload show the detection sentence immediately instead of a spinner, and it
// is read once and cleared.

import type { CreateExportResponse } from "./types";

const KEY = "matrx.exports.fresh.v1";

export function rememberFreshExport(created: CreateExportResponse): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(created));
  } catch {
    // Private mode, blocked storage — the Library page reads the server anyway.
  }
}

/**
 * Read, without clearing. Returns null unless it is about THIS library.
 *
 * Deliberately NOT destructive: the Library page seeds its first render from
 * this, and a render must be repeatable — a read that consumed the value would
 * hand back the export on one render and nothing on the next. Clearing is
 * `forgetFreshExport`, called from an effect once the page has mounted.
 */
export function peekFreshExport(libraryId: string): CreateExportResponse | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CreateExportResponse;
    return parsed?.library?.id === libraryId ? parsed : null;
  } catch {
    return null;
  }
}

export function forgetFreshExport(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clean up where storage is blocked.
  }
}
