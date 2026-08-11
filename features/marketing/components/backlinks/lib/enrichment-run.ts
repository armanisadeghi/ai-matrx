import type {
  BacklinkEnrichmentResult,
  SeoStreamEvent,
} from "@/features/marketing/seo/dataforseo/types";

export type BacklinkEnrichmentRunStatus =
  "running" | "completed" | "partial" | "failed";

export interface BacklinkEnrichmentRunState {
  status: BacklinkEnrichmentRunStatus;
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
): BacklinkEnrichmentRunState {
  return {
    status: "running",
    label,
    runId: null,
    candidateCount: 0,
    claimedIds: [],
    settledIds: [],
    completed: 0,
    failed: 0,
    skipped: 0,
    message: "Starting source-page analysis…",
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
      return "Run accepted by AI Dream.";
    case "seo.backlink_enrichment_started":
      return `Found ${event.candidate_count ?? 0} source page${event.candidate_count === 1 ? "" : "s"} to analyze.`;
    case "seo.backlink_capture_started":
      return `Capturing ${event.source_url ?? "source page"}…`;
    case "seo.backlink_capture_completed":
      return `Captured ${event.source_url ?? "source page"}; preparing its content.`;
    case "seo.backlink_analysis_started":
      return `AI is assessing ${(event.backlink_ids ?? []).length || 1} captured page${(event.backlink_ids ?? []).length === 1 ? "" : "s"}.`;
    case "seo.backlink_enriched":
      return `Analysis complete for ${event.source_url ?? "source page"}.`;
    case "seo.backlink_enrichment_failed":
      return `${event.stage ?? "Analysis"} failed for ${event.source_url ?? "source page"}: ${event.message ?? "Unknown error"}`;
    case "seo.backlink_enrichment_finished":
    case "seo.backlink_enrichment_completed":
      return "Source-page analysis finished.";
    default:
      return null;
  }
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
  const terminalStatus: BacklinkEnrichmentRunStatus = result
    ? result.failed > 0
      ? result.completed > 0
        ? "partial"
        : "failed"
      : "completed"
    : event.kind === "seo.backlink_enriched"
      ? "completed"
      : event.kind === "seo.backlink_enrichment_failed"
        ? "failed"
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
    message: "Source-page analysis stopped.",
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
