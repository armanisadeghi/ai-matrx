/**
 * A removal's bulk parts follow it in the background.
 *
 * Removing (or restoring) a record is one fast UPDATE: the record leaves every
 * list at once. Parts declared `cascade_deferred` in `platform.soft_delete_edge`
 * (a website's pages, links, crawl history…) and overflowing associations are
 * queued in `platform.soft_delete_cascade_job` and stamped in bounded batches —
 * see `migrations/platform_soft_delete_cascade_deferred.sql`.
 *
 * `followRemoval` drives that job one bounded step at a time while this tab is
 * open (`soft_delete_cascade_advance`, each call ≤ ~3 s) and reports progress
 * from server state. Closing the tab loses nothing: the job stays queued and
 * the scheduled drain (or the next open screen) finishes it.
 */
import { supabase } from "@/utils/supabase/client";
import { toast } from "@/lib/toast";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";

export interface RemovalProgress {
  jobId: string;
  direction: "trash" | "restore";
  state: "pending" | "done" | "cancelled" | "failed";
  rowsDone: number;
  rowsTotal: number | null;
  lastError: string | null;
}

function parseProgress(value: unknown): RemovalProgress | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.job_id !== "string") return null;
  return {
    jobId: row.job_id,
    direction: row.direction === "restore" ? "restore" : "trash",
    state:
      row.state === "done" || row.state === "cancelled" || row.state === "failed"
        ? row.state
        : "pending",
    rowsDone: typeof row.rows_done === "number" ? row.rows_done : 0,
    rowsTotal: typeof row.rows_total === "number" ? row.rows_total : null,
    lastError: typeof row.last_error === "string" ? row.last_error : null,
  };
}

/** The latest removal/restore job of one record, or null when it never had one. */
export async function readRemovalProgress(
  entityToken: string,
  id: string,
): Promise<RemovalProgress | null> {
  const { data, error } = await supabase.rpc("soft_delete_cascade_progress", {
    p_token: entityToken,
    p_id: id,
  });
  if (error) throw error;
  return parseProgress(data);
}

/** Runs one bounded step of the record's pending job and returns its state. */
export async function advanceRemoval(
  entityToken: string,
  id: string,
): Promise<RemovalProgress | null> {
  const { data, error } = await supabase.rpc("soft_delete_cascade_advance", {
    p_token: entityToken,
    p_id: id,
  });
  if (error) throw error;
  return parseProgress(data);
}

/** A stuck job stops the loop; the queue and the conformance check own it from there. */
const MAX_STEPS = 400;
const following = new Map<string, Promise<RemovalProgress | null>>();

/**
 * Drive a record's pending removal/restore to the end while this tab is open.
 * One loop per record — a second caller joins the first.
 */
export function followRemoval(
  entityToken: string,
  id: string,
  onProgress?: (progress: RemovalProgress) => void,
): Promise<RemovalProgress | null> {
  const key = `${entityToken}:${id}`;
  const running = following.get(key);
  if (running) return running;

  const run = (async () => {
    let progress = await readRemovalProgress(entityToken, id);
    for (let step = 0; progress?.state === "pending" && step < MAX_STEPS; step += 1) {
      onProgress?.(progress);
      const next = await advanceRemoval(entityToken, id);
      if (!next) break;
      // Same error twice in a row: the job is failing, not progressing.
      if (next.lastError && next.lastError === progress.lastError && next.rowsDone === progress.rowsDone) {
        progress = next;
        break;
      }
      progress = next;
    }
    return progress;
  })().finally(() => following.delete(key));

  following.set(key, run);
  return run;
}

/**
 * How long a removal's parts may keep following before progress earns its own toast. The screen
 * that removed or restored the record already said so ("Restored 1 Source."); parts that finish
 * within this grace are not news, and a second "Item restored" beside the host's sentence was a
 * duplicate (V6-B, 2026-10-01).
 */
export const FOLLOW_TOAST_GRACE_MS = 2_500;

/**
 * `followRemoval` with a progress toast — shown only when the job outlives the
 * removing request by the grace period (a large record); a small one says nothing.
 */
export async function followRemovalWithToast(
  entityToken: string,
  id: string,
  noun: string,
): Promise<void> {
  let toastId: string | number | undefined;
  const startedAt = Date.now();
  let followed = false;
  try {
    const final = await followRemoval(entityToken, id, (progress) => {
      followed = true;
      if (toastId === undefined && Date.now() - startedAt < FOLLOW_TOAST_GRACE_MS) return;
      const verb = progress.direction === "restore" ? "Restoring" : "Removing";
      const count = progress.rowsDone.toLocaleString();
      const total = progress.rowsTotal ? ` of ${progress.rowsTotal.toLocaleString()}` : "";
      toastId = toast.loading(`${verb} ${noun} — ${count}${total} parts`, { id: toastId });
    });
    // A failure is always said, grace or not; success and "still going" only after a progress toast.
    if (!final || !followed || (toastId === undefined && final.state !== "failed")) return;
    if (final.state === "done") {
      toast.success(
        final.direction === "restore" ? `${noun} restored` : `${noun} removed`,
        { id: toastId },
      );
    } else if (final.state === "pending") {
      toast.info(`${noun}: the rest finishes in the background`, { id: toastId });
    } else if (final.state === "failed") {
      toast.error(`${noun}: some parts could not be removed`, {
        id: toastId,
        description: final.lastError ?? undefined,
      });
    }
  } catch (error) {
    // The record itself is already removed or restored; only following its
    // parts failed. The queued job still finishes them.
    const message = error instanceof Error ? error.message : String(error);
    captureError({
      source: "runtime-exception",
      operation: "rpc",
      relation: "soft_delete_cascade_advance",
      message: `Following ${entityToken} ${id} failed: ${message}`,
      userMessage: "Progress unavailable; it finishes in the background.",
      recoverable: true,
      raw: error,
    });
    if (toastId !== undefined) {
      toast.warning(`${noun}: progress unavailable — it finishes in the background`, {
        id: toastId,
      });
    }
  }
}
