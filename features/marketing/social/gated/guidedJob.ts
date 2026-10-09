/**
 * The guided capture job as the app sees it: a `media.capture_handoff` row
 * (GATED-CAPTURE.md §2) mapped to the few words a person reads. Pure.
 *
 *   UI words        row
 *   Waiting for you  needs_drive (rung human_drive)
 *   Capturing        claimed / capturing
 *   Done             captured + extract parsed|partial
 *   Saved, not read  captured + extract needs_agent
 *   Failed           failed
 *   Skipped          dismissed
 */

import type { CaptureHandoff } from "@/features/capture-ladder/types";

export type GuidedPhase =
  | "queued"
  | "waiting_for_you"
  | "capturing"
  | "done"
  | "saved_unread"
  | "failed"
  | "skipped";

export interface GuidedView {
  phase: GuidedPhase;
  /** Short label for a status chip. */
  label: string;
  /** True once nothing more will happen to the row. */
  terminal: boolean;
  /** The Source the capture became (results are attached to it). */
  sourceId: string | null;
  /** The sentence for a failure, else null. */
  failure: string | null;
}

type Row = Pick<
  CaptureHandoff,
  "status" | "metadata" | "captured_processed_document_id" | "failure_note"
>;

function extractStatus(row: Row): string | null {
  const social = row.metadata?.social as { extract?: { status?: unknown } } | undefined;
  const s = social?.extract?.status;
  return typeof s === "string" ? s : null;
}

export function guidedView(row: Row): GuidedView {
  const sourceId = row.captured_processed_document_id ?? null;
  switch (row.status) {
    case "waiting":
      return { phase: "queued", label: "Queued", terminal: false, sourceId, failure: null };
    case "needs_drive":
      return { phase: "waiting_for_you", label: "Waiting for you", terminal: false, sourceId, failure: null };
    case "claimed":
    case "capturing":
      return { phase: "capturing", label: "Capturing", terminal: false, sourceId, failure: null };
    case "captured": {
      const e = extractStatus(row);
      if (e === "needs_agent")
        return { phase: "saved_unread", label: "Saved, not read yet", terminal: true, sourceId, failure: null };
      return { phase: "done", label: "Done", terminal: true, sourceId, failure: null };
    }
    case "dismissed":
      return { phase: "skipped", label: "Skipped", terminal: true, sourceId, failure: null };
    case "failed":
    default:
      return {
        phase: "failed",
        label: "Failed",
        terminal: true,
        sourceId,
        failure:
          row.failure_note?.trim() ||
          "That capture did not finish. You can try again.",
      };
  }
}

/** Where a finished capture's saved page lives. */
export function guidedResultHref(sourceId: string): string {
  return `/knowledge/sources/${sourceId}`;
}

/**
 * The line shown BEFORE the person is sent: what will happen, where, and what
 * they will do. Deliberately generic across platforms — the exact numbered
 * steps come from the server's door once the job exists (one source for the
 * dialog and the on-page guide), and are then listed in the dialog too.
 */
export function guidedIntroBefore(platformLabel: string | null | undefined): string {
  const where = platformLabel?.trim() || "the page";
  return `We'll open ${where} in a new tab. Log in if it asks, scroll until what you want has loaded, then press Capture in the small Matrx guide. The results will be waiting here when you come back.`;
}

/** Platforms the guided path has an on-page guide for (the extension's recipes). */
export const GUIDED_CAPTURE_PLATFORMS: ReadonlySet<string> = new Set([
  "instagram",
  "linkedin",
  "x",
  "facebook",
  "tiktok",
]);
