/**
 * PDF Extractor — pure decisions about the clean stage's outcome.
 *
 * Kept free of React and the network so the rules the studio depends on are
 * unit-testable: what a `record_update` status means, when a processing
 * progress event should refetch the doc, and the bounded poll for clean text
 * that the server finished writing just after the stream closed.
 */

/** What a `processed_documents` `record_update` means for the UI. */
export type RecordOutcome = "done" | "failed" | "queued" | "active";

/**
 * Read `record_update.data.status`. `completed` (or a server that sends no
 * status at all) is done; `failed` is an error; `awaiting_batch` is a clean
 * waiting on the batch queue; `active` is mid-run.
 */
export function classifyRecordUpdateStatus(status: unknown): RecordOutcome {
  if (status === "failed") return "failed";
  if (status === "awaiting_batch") return "queued";
  if (status === "active") return "active";
  return "done";
}

export const CLEAN_QUEUED_LABEL = "Cleaning queued";
export const CLEAN_FAILED_MESSAGE = "AI cleanup failed";
export const NO_RECORD_UPDATE_MESSAGE = "Processing did not run";

/** Minimum gap between per-page refetches while the clean stage streams. */
export const CLEAN_PAGE_REFRESH_THROTTLE_MS = 4000;

/**
 * Should a `content.processing.progress` event refetch the doc + pages now?
 * Clean finishing always does (the cleaned text is complete); each cleaned
 * page does too, throttled, so text appears before chunk/embed/NER finish.
 */
export function shouldRefreshOnProcessingProgress(
  evt: { stage?: unknown; phase?: unknown },
  lastRefreshAt: number,
  now: number,
  throttleMs: number = CLEAN_PAGE_REFRESH_THROTTLE_MS,
): boolean {
  if (evt.stage !== "clean") return false;
  if (evt.phase === "done") return true;
  if (evt.phase === "page") return now - lastRefreshAt >= throttleMs;
  return false;
}

/**
 * The stream ended without clean text, but the server often finishes the
 * write seconds later. Poll `read` until it yields text or `timeoutMs` ends;
 * returns the text, or null when it never showed up.
 */
export async function pollForCleanContent(
  read: () => Promise<string | null | undefined>,
  opts: {
    intervalMs?: number;
    timeoutMs?: number;
    sleep?: (ms: number) => Promise<void>;
    isCancelled?: () => boolean;
  } = {},
): Promise<string | null> {
  const {
    intervalMs = 3000,
    timeoutMs = 30_000,
    sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
    isCancelled = () => false,
  } = opts;
  const attempts = Math.max(1, Math.floor(timeoutMs / intervalMs));
  for (let i = 0; i < attempts; i++) {
    if (isCancelled()) return null;
    const text = await read().catch(() => null);
    if (text && text.length > 0) return text;
    if (i < attempts - 1) await sleep(intervalMs);
  }
  return null;
}

/**
 * The Clean pane shows per-page cleaned text, except when the doc-level
 * `clean_content` is the fuller truth: every page empty, or the aggregate
 * carries clearly more text than the pages do (a whole-doc clean landed while
 * some page rows were never filled). A doc with a few genuinely blank pages
 * keeps its per-page view — there the aggregate is no longer than the pages.
 */
export function preferAggregateClean(
  pageCleanedTexts: readonly string[],
  docCleanContent: string | null | undefined,
): boolean {
  if (pageCleanedTexts.length === 0) return false;
  const empty = pageCleanedTexts.filter((t) => !t.trim()).length;
  if (empty === pageCleanedTexts.length) return true;
  if (empty === 0) return false;
  const aggregate = (docCleanContent ?? "").trim().length;
  if (aggregate === 0) return false;
  const pagesChars = pageCleanedTexts.reduce((n, t) => n + t.trim().length, 0);
  return aggregate > pagesChars * 1.1;
}
