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
 * status at all) is done; `failed` is an error; `active` is mid-run. The
 * record_update contract only carries active/completed/failed, so the server
 * marks a clean parked on the batch queue as `status: "active"` with
 * `metadata.run_status: "awaiting_batch"` — that reads as queued.
 */
export function classifyRecordUpdateStatus(
  status: unknown,
  metadata?: unknown,
): RecordOutcome {
  if (status === "failed") return "failed";
  if (status === "awaiting_batch" || recordRunStatus(metadata) === "awaiting_batch")
    return "queued";
  if (status === "active") return "active";
  return "done";
}

/** `metadata.run_status` of a record_update, when the server sent one. */
export function recordRunStatus(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const v = (metadata as Record<string, unknown>).run_status;
  return typeof v === "string" ? v : null;
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

export const USAGE_LIMIT_MESSAGE = "AI usage limit reached";
const USAGE_LIMIT_PATTERN = /usage[\s_-]*limit|limit[\s_-]*reached|quota|rate[\s_-]*limit|insufficient[\s_-]*(credits|points|balance)|\b402\b/i;

/**
 * A short, readable reason for a failed run, from the run record's error
 * column. A usage limit reads as one fixed sentence; otherwise the first
 * message with a real reason, minus the machine code prefix
 * ("pdfclean_error: …") and any dangling colon. Null when nothing readable
 * is left — the banner then shows just "Failed".
 */
export function describeRunError(
  error: Record<string, unknown> | null | undefined,
): string | null {
  if (!error) return null;
  const texts: string[] = [];
  for (const key of ["user_message", "message", "detail", "reason", "error", "code", "error_type"]) {
    const v = error[key];
    if (typeof v === "string" && v.trim()) texts.push(v.trim());
  }
  if (texts.some((t) => USAGE_LIMIT_PATTERN.test(t))) return USAGE_LIMIT_MESSAGE;
  for (const raw of texts) {
    const cleaned = raw
      .replace(/^[a-z][a-z0-9]*(?:_[a-z0-9]+)+\s*:\s*/i, "")
      .replace(/[\s:;,-]+$/, "")
      .trim();
    // A bare machine code ("pdfclean_error") is not a reason.
    if (!cleaned || /^[a-z0-9]+(?:_[a-z0-9]+)+$/i.test(cleaned)) continue;
    return cleaned.length > 120 ? `${cleaned.slice(0, 117)}…` : cleaned;
  }
  return null;
}

/**
 * Is the doc really cleaned? Page rows are the truth: a page with
 * `cleaned_text` or a `section_kind` was cleaned. With no page rows at all
 * (legacy doc) the aggregate `clean_content` is all there is. A `clean_content`
 * beside page rows that were never cleaned is NOT cleaned.
 */
export function isDocCleaned(
  pages: ReadonlyArray<{ cleanedText: string; sectionKind: string | null }>,
  docCleanContent: string | null | undefined,
): boolean {
  if (pages.length === 0) return Boolean(docCleanContent && docCleanContent.trim());
  return pages.some((p) => p.cleanedText.trim().length > 0 || Boolean(p.sectionKind));
}
