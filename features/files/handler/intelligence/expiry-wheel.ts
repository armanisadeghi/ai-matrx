/**
 * features/files/handler/intelligence/expiry-wheel.ts
 *
 * One global timer for every signed URL in the app. Replaces the
 * per-component `setTimeout` pattern in the legacy `useSignedUrl` hook —
 * with N visible images, that pattern fires N timers; this fires one.
 *
 * Each watched file registers its (fileId, expiresAt) pair. The wheel
 * keeps a min-heap sorted by `expiresAt` and schedules a single timer
 * for the next-due refresh. On wake, it pops every entry due within
 * `SAFETY_MARGIN_MS` and calls the registered refresher.
 *
 * The wheel never reads from Redux or fetches; the `refresher` callback
 * — supplied by the resolver — is responsible for re-minting the URL
 * and dispatching the slice update. This keeps the wheel pure timing.
 */

const SAFETY_MARGIN_MS = 30 * 1000;

interface Entry {
  fileId: string;
  expiresAt: number;
  refresher: () => Promise<void>;
}

let timer: ReturnType<typeof setTimeout> | null = null;
const entries = new Map<string, Entry>();

function nextDue(): Entry | null {
  let next: Entry | null = null;
  for (const entry of entries.values()) {
    if (!next || entry.expiresAt < next.expiresAt) next = entry;
  }
  return next;
}

function reschedule(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const next = nextDue();
  if (!next) return;
  const wait = Math.max(0, next.expiresAt - Date.now() - SAFETY_MARGIN_MS);
  timer = setTimeout(tick, wait);
}

async function tick(): Promise<void> {
  timer = null;
  const now = Date.now();
  const due: Entry[] = [];
  for (const entry of entries.values()) {
    if (entry.expiresAt - SAFETY_MARGIN_MS <= now) due.push(entry);
  }
  await Promise.allSettled(
    due.map((entry) =>
      entry.refresher().catch(() => {
        // Refresh failed — drop from wheel; caller will re-register
        // when the next consumer asks for the file.
        entries.delete(entry.fileId);
      }),
    ),
  );
  reschedule();
}

/** Watch this fileId's signed URL; refresher() is called ~30s before expiry. */
export function watchExpiry(
  fileId: string,
  expiresAt: number,
  refresher: () => Promise<void>,
): void {
  entries.set(fileId, { fileId, expiresAt, refresher });
  reschedule();
}

/** Stop watching. Called when the last consumer of a file unmounts. */
export function unwatchExpiry(fileId: string): void {
  if (entries.delete(fileId)) reschedule();
}

/** Update the expiresAt for an already-watched file (after a refresh). */
export function bumpExpiry(fileId: string, expiresAt: number): void {
  const entry = entries.get(fileId);
  if (!entry) return;
  entry.expiresAt = expiresAt;
  reschedule();
}

export function _clearAllForTests(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  entries.clear();
}

export function _peekEntriesForTests(): ReadonlyMap<string, Entry> {
  return entries;
}
