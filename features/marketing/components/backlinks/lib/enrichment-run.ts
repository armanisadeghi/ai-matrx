import type {
  BacklinkEnrichmentResult,
  SeoStreamEvent,
} from "@/features/marketing/seo/dataforseo/types";

export type BacklinkEnrichmentRunStatus =
  "running" | "completed" | "partial" | "failed";

/**
 * A run over ONE backlink vs a batch over many. This decides which events may
 * end the run: `seo.backlink_enriched` / `_enrichment_failed` are PER ITEM, so
 * for a batch the first settled item must not finish the whole run — only the
 * run-level completion may. (Reusing the single-record reducer for the
 * workspace batch is exactly how the panel once read 100% after link one.)
 */
export type BacklinkEnrichmentRunScope = "single" | "batch";

export interface BacklinkEnrichmentRunState {
  status: BacklinkEnrichmentRunStatus;
  scope: BacklinkEnrichmentRunScope;
  label: string;
  runId: string | null;
  candidateCount: number;
  claimedIds: string[];
  settledIds: string[];
  completed: number;
  failed: number;
  skipped: number;
  message: string;
  events: SeoStreamEvent[];
  result: BacklinkEnrichmentResult | null;
  error: string | null;
}

export function startBacklinkEnrichmentRun(
  label: string,
  scope: BacklinkEnrichmentRunScope = "single",
): BacklinkEnrichmentRunState {
  return {
    status: "running",
    scope,
    label,
    runId: null,
    candidateCount: 0,
    claimedIds: [],
    settledIds: [],
    completed: 0,
    failed: 0,
    skipped: 0,
    message: "Starting to read the pages that link to you…",
    events: [],
    result: null,
    error: null,
  };
}

function addUnique(values: string[], value: string | undefined): string[] {
  return value && !values.includes(value) ? [...values, value] : values;
}

function eventMessage(event: SeoStreamEvent): string | null {
  switch (event.kind) {
    case "seo.command_run":
      return "Request accepted.";
    case "seo.backlink_enrichment_started":
      return `Found ${event.candidate_count ?? 0} page${event.candidate_count === 1 ? "" : "s"} to read.`;
    case "seo.backlink_capture_started":
      return `Reading ${event.source_url ?? "the linking page"}…`;
    case "seo.backlink_capture_completed":
      return `Read ${event.source_url ?? "the linking page"} — preparing it for review.`;
    case "seo.backlink_analysis_started":
      return `Reviewing ${(event.backlink_ids ?? []).length || 1} page${(event.backlink_ids ?? []).length === 1 ? "" : "s"}.`;
    case "seo.backlink_enriched":
      return `Finished ${event.source_url ?? "the linking page"}.`;
    case "seo.backlink_enrichment_failed":
      return `Could not finish ${event.source_url ?? "the linking page"}: ${event.message ?? "something went wrong"}`;
    case "seo.backlink_enrichment_finished":
    case "seo.backlink_enrichment_completed":
      return "All done.";
    default:
      return null;
  }
}

/**
 * The run said it ended but sent no result payload, so the counters are all we
 * have. Success is claimed ONLY when everything we expected actually settled —
 * a batch of 5 that ends with 2 done and no failures is `partial`, never a
 * green "completed" over copy that reads "2 of 5".
 */
function finishStatusWithoutResult(
  run: BacklinkEnrichmentRunState,
): BacklinkEnrichmentRunStatus {
  if (run.failed > 0) return run.completed > 0 ? "partial" : "failed";
  const settled = run.completed + run.failed;
  // candidateCount 0 means there was nothing to do — that IS a clean finish.
  if (run.candidateCount > 0 && settled < run.candidateCount) return "partial";
  return "completed";
}

export function applyBacklinkEnrichmentEvent(
  current: BacklinkEnrichmentRunState,
  event: SeoStreamEvent,
): BacklinkEnrichmentRunState {
  const message = eventMessage(event);
  const backlinkId = event.backlink_id;
  const claimedIds =
    event.kind === "seo.backlink_capture_started"
      ? addUnique(current.claimedIds, backlinkId)
      : current.claimedIds;
  const settledIds =
    event.kind === "seo.backlink_enriched" ||
    event.kind === "seo.backlink_enrichment_failed"
      ? addUnique(current.settledIds, backlinkId)
      : current.settledIds;
  const result =
    event.kind === "seo.backlink_enrichment_completed" && event.result
      ? event.result
      : current.result;
  // The run ends on its OWN completion event; per-item events end it only for
  // a single-record run, where the one item IS the run. A batch without a
  // result payload still settles on the run-level event rather than hanging.
  const runLevelFinish =
    event.kind === "seo.backlink_enrichment_completed" ||
    event.kind === "seo.backlink_enrichment_finished";
  const terminalStatus: BacklinkEnrichmentRunStatus = result
    ? result.failed > 0
      ? result.completed > 0
        ? "partial"
        : "failed"
      : "completed"
    : runLevelFinish
      ? finishStatusWithoutResult(current)
      : current.scope === "single"
        ? event.kind === "seo.backlink_enriched"
          ? "completed"
          : event.kind === "seo.backlink_enrichment_failed"
            ? "failed"
            : current.status
        : current.status;

  return {
    ...current,
    runId:
      event.kind === "seo.command_run" && typeof event.run_id === "string"
        ? event.run_id
        : current.runId,
    candidateCount:
      event.kind === "seo.backlink_enrichment_started" &&
      typeof event.candidate_count === "number"
        ? event.candidate_count
        : current.candidateCount === 0 &&
            event.kind === "seo.backlink_capture_started"
          ? 1
          : current.candidateCount,
    claimedIds,
    settledIds,
    completed:
      result?.completed ??
      (event.kind === "seo.backlink_enriched"
        ? current.completed + (settledIds === current.settledIds ? 0 : 1)
        : current.completed),
    failed:
      result?.failed ??
      (event.kind === "seo.backlink_enrichment_failed"
        ? current.failed + (settledIds === current.settledIds ? 0 : 1)
        : current.failed),
    skipped: result?.skipped ?? current.skipped,
    status: terminalStatus,
    message: message ?? current.message,
    events: message ? [...current.events, event].slice(-12) : current.events,
    result,
  };
}

export function failBacklinkEnrichmentRun(
  current: BacklinkEnrichmentRunState,
  error: string,
): BacklinkEnrichmentRunState {
  return {
    ...current,
    status: "failed",
    message: "Stopped before finishing.",
    error,
  };
}

export function backlinkEnrichmentProgress(
  run: BacklinkEnrichmentRunState,
): number {
  if (run.status !== "running") return 100;
  if (run.candidateCount === 0) return run.status === "running" ? 4 : 0;
  return Math.min(
    96,
    Math.round((run.settledIds.length / run.candidateCount) * 100),
  );
}
