/**
 * The Press Room's calls into aidream.
 *
 * Generating angles is an AGENT RUN, not a data read, so it goes to the Python
 * brain — the one case where this surface does not talk to Supabase directly.
 * Rulings are row writes and stay on the direct client path (`data.ts`).
 *
 * "Find my stories" is a DURABLE streamed command (aidream
 * `run_press_angles_command`): the analyst pass is minutes of paid model work
 * and the production gateway severs a synchronous response at 60s — the old
 * JSON call completed server-side behind an HTTP 504 the browser could only
 * read as failure. Same consumption shape as `useFindingFixer`: `callApi`
 * with `stream: true`, milestone events for honest progress, and the terminal
 * `seo.press_angles_completed` event carrying the persisted result document.
 */

import { callApi } from "@/lib/api/call-api";
import type { TypedStreamEvent } from "@/lib/api/types";
import type { AppDispatch } from "@/lib/redux/store";

/** One rejected angle and why. The surface shows these — never a silent thin. */
export interface AngleGate {
  angle_key: string;
  kept: boolean;
  downgraded: boolean;
  reasons: string[];
}

export interface GenerateAnglesResult {
  result_kind: "press.story_angles.generate";
  kept: number;
  dropped: number;
  /** What actually happened to the durable backlog — a converging re-run
   * (everything `unchanged`) must not look identical to a first run. */
  created: number;
  updated: number;
  unchanged: number;
  gates: AngleGate[];
  bundle_stats: {
    fact_count?: number;
    confirmed_fact_count?: number;
    asset_count?: number;
    coverage_count?: number;
    pages_captured?: number;
    pages_failed?: number;
  };
  coverage_assessment: {
    endowments_covered?: string[];
    endowments_absent?: string[];
    evidence_strength?: number;
    notes?: string;
  };
  limitations: string[];
}

export interface GenerateAnglesOptions {
  maxAngles?: number;
  /** Pages of the site's own content to fetch as evidence. */
  capturePages?: number;
  /** Real progress for the surface — the run takes minutes, so a silent
   * spinner would lie about what is happening. */
  onStage?: (stage: string) => void;
}

/** Honest, human words for each milestone the command emits. */
const STAGE_LABELS: Record<string, string> = {
  "seo.command_run": "Reading your confirmed facts, assets and pages",
  "seo.press_evidence_bundle_built":
    "Evidence gathered — asking the analyst what a journalist would care about",
  "seo.press_angles_gated": "Checking every angle against the evidence gates",
  "seo.press_angles_persisted": "Saving what survived",
};

function streamData(event: TypedStreamEvent): Record<string, unknown> | null {
  return event.event === "data" ? (event.data as Record<string, unknown>) : null;
}

/**
 * Analyse a site and persist whatever survives the gates.
 */
export async function generateStoryAngles(
  dispatch: AppDispatch,
  siteId: string,
  options: GenerateAnglesOptions = {},
): Promise<GenerateAnglesResult> {
  let completed: GenerateAnglesResult | undefined;
  const outcome = await dispatch(
    callApi({
      path: "/seo/sites/{site_id}/press/angles/generate",
      pathParams: { site_id: siteId },
      method: "POST",
      body: {
        max_angles: options.maxAngles ?? 12,
        capture_pages: options.capturePages ?? 8,
      },
      stream: true,
      onStreamEvent: (event) => {
        const data = streamData(event);
        if (!data) return;
        const kind = typeof data.kind === "string" ? data.kind : null;
        if (!kind) return;
        if (kind === "seo.press_angles_completed") {
          completed = data.result as GenerateAnglesResult | undefined;
          return;
        }
        const label = STAGE_LABELS[kind];
        if (label) options.onStage?.(label);
      },
    }),
  );
  if (outcome.error) {
    throw new Error(outcome.error.message ?? "Story analysis failed.");
  }
  if (!completed) {
    throw new Error("The analysis finished without returning a result.");
  }
  return completed;
}

/** What happened to one (request, site) pairing during ingest. The screen is
 * LOUD: pairings that got no row are reported with their score and terms. */
export interface IngestOutcome {
  query_title: string;
  site_id: string;
  outcome:
    | "created"
    | "duplicate"
    | "rescored"
    | "screened_out"
    | "evaluate_failed"
    | "evaluation_deferred";
  request_id: string | null;
  screen_score: number;
  matched_terms: string[];
  status: string | null;
  match_score: number | null;
}

export interface IngestRequestsResult {
  result_kind: "press.source_requests.ingest";
  parsed: number;
  sites_considered: number;
  created: number;
  duplicates: number;
  rescored: number;
  screened_out: number;
  evaluated: number;
  drafted: number;
  /** Rows created but not yet scored — the per-run model ceiling was spent. */
  evaluations_deferred: number;
  /** Entries beyond the per-run entry knob, dropped loudly; re-paste the rest. */
  truncated_requests: number;
  outcomes: IngestOutcome[];
}

export interface IngestRequestsOptions {
  platform?: string;
  /** Only score+draft when true; false lands rows as `new` without model spend. */
  evaluate?: boolean;
  siteIds?: string[];
  onStage?: (stage: string) => void;
}

const INGEST_STAGE_LABELS: Record<string, string> = {
  "seo.command_run": "Reading what each of your sites can speak to",
  "seo.press_ingest_started": "Matching every request against your sites",
  "seo.press_ingest_request_done": "Scoring matches and drafting where the fit is real",
};

/**
 * Land a pasted digest (HARO-style) as site-scoped journalist requests.
 *
 * One row per matched site (the 2026-08-22 scoping ruling); the responder
 * mandate scores each row, so a big digest is minutes of model work — hence
 * the same durable stream shape as `generateStoryAngles`.
 */
export async function ingestSourceRequests(
  dispatch: AppDispatch,
  rawText: string,
  options: IngestRequestsOptions = {},
): Promise<IngestRequestsResult> {
  let completed: IngestRequestsResult | undefined;
  const outcome = await dispatch(
    callApi({
      path: "/seo/press/source-requests/ingest",
      method: "POST",
      body: {
        platform: options.platform ?? "haro",
        raw_text: rawText,
        site_ids: options.siteIds ?? null,
        evaluate: options.evaluate ?? true,
      },
      stream: true,
      onStreamEvent: (event) => {
        const data = streamData(event);
        if (!data) return;
        const kind = typeof data.kind === "string" ? data.kind : null;
        if (!kind) return;
        if (kind === "seo.press_source_requests_ingested") {
          completed = data.result as IngestRequestsResult | undefined;
          return;
        }
        const label = INGEST_STAGE_LABELS[kind];
        if (label) options.onStage?.(label);
      },
    }),
  );
  if (outcome.error) {
    throw new Error(outcome.error.message ?? "Ingest failed.");
  }
  if (!completed) {
    throw new Error("The ingest finished without returning a result.");
  }
  return completed;
}

export interface EvaluateRequestResult {
  id: string;
  status: string;
  match_score: number;
  drafted: boolean;
}

/**
 * Score (or re-score) one existing request — the recovery door for rows that
 * landed unscored (`new`) or need a fresh judgement (`matched`). One responder
 * pass is ~30-90s of paid model work, so it rides the same durable stream.
 */
export async function evaluateSourceRequest(
  dispatch: AppDispatch,
  requestId: string,
): Promise<EvaluateRequestResult> {
  let completed: EvaluateRequestResult | undefined;
  const outcome = await dispatch(
    callApi({
      path: "/seo/press/source-requests/{request_id}/evaluate",
      method: "POST",
      pathParams: { request_id: requestId },
      body: {},
      stream: true,
      onStreamEvent: (event) => {
        const data = streamData(event);
        if (!data) return;
        if (data.kind === "seo.press_source_request_evaluated") {
          completed = data.result as EvaluateRequestResult | undefined;
        }
      },
    }),
  );
  if (outcome.error) {
    throw new Error(outcome.error.message ?? "Scoring failed.");
  }
  if (!completed) {
    throw new Error("Scoring finished without returning a result.");
  }
  return completed;
}
