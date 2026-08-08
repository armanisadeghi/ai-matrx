/**
 * Site Intake Wizard — the two compute calls (aidream) plus the stream-event
 * shapes they emit. Server contract: `aidream/services/seo/site_intake.py`
 * (`POST /seo/sites/{site_id}/intake/run` + `/intake/apply`, both durable
 * streamed commands; the run is rejoinable by run id via
 * `POST /seo/collections/{run_id}/rejoin`).
 *
 * Rulings persist server-side through `seo.gsc_set_keyword_class` — the SAME
 * write path the classification-review UI uses — plus the Site Strategy
 * Interviewer (`seo.site_topic_value`) and `web.brand.profile.brand_aliases`.
 */

import { callApi } from "@/lib/api/call-api";
import { parseStreamError } from "@/lib/api/errors";
import type { TypedStreamEvent } from "@/lib/api/types";
import type { AppDispatch } from "@/lib/redux/store";

// ── Proposal shapes (mirror of the `gsc_site_intake_proposal` content-ir kind) ──

export type IntakeConfidence = "high" | "medium" | "low";
export type IntakeClass = "money" | "educational" | "brand" | "mismatch";

export interface IntakeBusinessInference {
  what_they_sell: string;
  business_model: string;
  money_definition: string;
  evidence: string;
  confidence: IntakeConfidence;
}

export interface IntakeTermGroup {
  label: string;
  proposed_class: IntakeClass;
  sample_terms: string[];
  reasoning: string;
  confidence: IntakeConfidence;
}

export interface IntakeQuestion {
  id: string;
  question: string;
  why_it_matters: string;
  suggested_answers: string[];
}

export interface SiteIntakeProposal {
  business_inference: IntakeBusinessInference;
  term_groups: IntakeTermGroup[];
  proposed_brand_aliases: string[];
  key_questions: IntakeQuestion[];
  overall_confidence: IntakeConfidence;
  gaps: string[];
}

export interface IntakeClassifyEstimate {
  unclassified_keywords: number;
  batch_size: number;
  batches: number;
  est_input_tokens: number;
  est_output_tokens: number;
  est_cost_usd: number | null;
}

export interface SiteIntakeRunResult {
  site_id: string;
  proposal: SiteIntakeProposal;
  proposal_doc_id: string | null;
  bundle_periods: string[];
  data_min_date: string | null;
  data_max_date: string | null;
  model_id: string | null;
  cost_usd: number | null;
  classify_estimate: IntakeClassifyEstimate | null;
}

export interface SiteIntakeApplyResult {
  site_id: string;
  keyword_rulings_written: number;
  brand_aliases_added: string[];
  valuations_written: number;
  unknown_topic_slugs: string[];
  open_questions: string[];
  classify_estimate: IntakeClassifyEstimate | null;
}

export interface IntakeKeywordRuling {
  phrase: string;
  ruling: IntakeClass;
  reasoning: string;
}

export interface IntakeAnswer {
  question_id: string;
  question: string;
  answer: string;
}

export interface IntakeStageEvent {
  kind: string;
  label: string;
  at: number;
}

const STAGE_LABELS: Record<string, string> = {
  "seo.command_run": "Interview run claimed",
  "seo.intake_bundle_started": "Reading Search Console history…",
  "seo.intake_bundle_ready": "Data bundle ready — running the analyst…",
  "seo.intake_agent_completed": "Analysis complete",
  "seo.intake_keyword_rulings_applied": "Keyword rulings saved",
  "seo.intake_brand_aliases_applied": "Brand aliases saved",
  "seo.intake_strategy_started": "Valuing your topic tree…",
  "seo.intake_strategy_completed": "Topic valuations saved",
};

export function intakeStageLabel(kind: string): string | null {
  return STAGE_LABELS[kind] ?? null;
}

// ── Run ──────────────────────────────────────────────────────────────────────

export async function runSiteIntake(
  dispatch: AppDispatch,
  siteId: string,
  organizationId: string | null,
  options: { forceRefresh?: boolean } = {},
  callbacks: { signal?: AbortSignal; onEvent?: (event: TypedStreamEvent) => void } = {},
): Promise<{ result: SiteIntakeRunResult; runId: string | null }> {
  let result: SiteIntakeRunResult | null = null;
  let runId: string | null = null;
  let streamError: Error | null = null;
  let inProgress = false;
  const response = await dispatch(
    callApi({
      path: "/seo/sites/{site_id}/intake/run",
      method: "POST",
      pathParams: { site_id: siteId },
      body: { force_refresh: options.forceRefresh ?? false },
      ...(organizationId
        ? { scopeOverrides: { organization_id: organizationId } }
        : {}),
      stream: true,
      signal: callbacks.signal,
      onStreamEvent: (event) => {
        callbacks.onEvent?.(event);
        if (event.event === "data") {
          const data = event.data as {
            kind?: unknown;
            run_id?: unknown;
            result?: unknown;
          };
          if (typeof data.run_id === "string") runId = data.run_id;
          if (
            data.kind === "seo.intake_completed" &&
            data.result &&
            typeof data.result === "object"
          ) {
            result = data.result as SiteIntakeRunResult;
          }
          if (data.kind === "seo.run_in_progress") inProgress = true;
        }
        if (event.event === "error") {
          streamError = parseStreamError(event.data);
        }
      },
    }),
  );
  if (response.error) throw new Error(response.error.message);
  if (streamError) throw streamError;
  if (inProgress && !result) {
    throw new Error(
      "An intake interview is already running for this site. Give it a minute and try again — the result is kept either way.",
    );
  }
  if (!result) {
    throw new Error(
      "The interview stream ended without a result. It may still be running server-side — try again to rejoin it.",
    );
  }
  return { result, runId };
}

// ── Apply ────────────────────────────────────────────────────────────────────

export async function applySiteIntake(
  dispatch: AppDispatch,
  siteId: string,
  organizationId: string | null,
  body: {
    confirmed_summary: string;
    answers: IntakeAnswer[];
    keyword_rulings: IntakeKeywordRuling[];
    brand_aliases_add: string[];
    run_topic_valuation: boolean;
    intake_run_id: string | null;
  },
  callbacks: { signal?: AbortSignal; onEvent?: (event: TypedStreamEvent) => void } = {},
): Promise<SiteIntakeApplyResult> {
  let result: SiteIntakeApplyResult | null = null;
  let streamError: Error | null = null;
  const response = await dispatch(
    callApi({
      path: "/seo/sites/{site_id}/intake/apply",
      method: "POST",
      pathParams: { site_id: siteId },
      body,
      ...(organizationId
        ? { scopeOverrides: { organization_id: organizationId } }
        : {}),
      stream: true,
      signal: callbacks.signal,
      onStreamEvent: (event) => {
        callbacks.onEvent?.(event);
        if (event.event === "data") {
          const data = event.data as { kind?: unknown; result?: unknown };
          if (
            data.kind === "seo.intake_apply_completed" &&
            data.result &&
            typeof data.result === "object"
          ) {
            result = data.result as SiteIntakeApplyResult;
          }
        }
        if (event.event === "error") {
          streamError = parseStreamError(event.data);
        }
      },
    }),
  );
  if (response.error) throw new Error(response.error.message);
  if (streamError) throw streamError;
  if (!result) {
    throw new Error("The apply stream ended without a result — nothing was confirmed as saved.");
  }
  return result;
}
