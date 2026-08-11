/** Typed narrowers for first-party backlink/domain assessments. */

import type { Json } from "@/types/database.types";

export function jsonRecord(
  value: Json | null | undefined,
): Record<string, Json> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json>)
    : {};
}

/**
 * User-facing capture evidence. Internal cache identifiers are deliberately
 * excluded: they are implementation details, not backlink evidence.
 */
export function backlinkCaptureForUi(
  value: Json | null | undefined,
): Record<string, Json> {
  const capture = { ...jsonRecord(value) };
  delete capture.cache_key;
  delete capture.cacheKey;
  return capture;
}

function text(value: Json | undefined): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function score(value: Json | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function providerExtras(providerEvidence: Json | null): Json | null {
  const evidence = jsonRecord(providerEvidence);
  return evidence.extras ?? null;
}

/** Whether a persisted evidence JSONB value contains an actual assessment. */
export function hasBacklinkAssessment(value: Json | null): boolean {
  return Object.keys(jsonRecord(value)).length > 0;
}

export interface BacklinkAnalysisActionState {
  disabled: boolean;
  inProgress: boolean;
  label: "Analyze" | "Analyzing" | "Re-analyze";
  title: string;
}

/**
 * One action-state contract for every place that offers single-backlink
 * capture and analysis (table row, drawer, and row window).
 */
export function backlinkAnalysisActionState(
  enrichmentStatus: string,
  running: boolean,
  globallyDisabled: boolean,
): BacklinkAnalysisActionState {
  const inProgress =
    enrichmentStatus === "capturing" || enrichmentStatus === "analyzing";
  const rerun =
    enrichmentStatus === "completed" || enrichmentStatus === "dead_letter";

  return {
    disabled: globallyDisabled || running || inProgress,
    inProgress,
    label:
      running || inProgress ? "Analyzing" : rerun ? "Re-analyze" : "Analyze",
    title:
      running || inProgress
        ? "This source page is already being analyzed"
        : rerun
          ? "Capture and analyze this source page again"
          : "Capture and analyze this source page now",
  };
}

export interface BacklinkAssessmentView {
  overallScore: number | null;
  pageType: string | null;
  pageSummary: string | null;
  relevanceScore: number | null;
  relevanceVerdict: string | null;
  contextVerdict: string | null;
  anchorVerdict: string | null;
  editorialKind: string | null;
  controlLevel: string | null;
  controlReason: string | null;
  action: string | null;
  actionReason: string | null;
  priority: string | null;
  riskVerdict: string | null;
  confidence: number | null;
  topics: string[];
}

export function parseBacklinkAssessment(
  value: Json | null,
): BacklinkAssessmentView {
  const root = jsonRecord(value);
  const relevance = jsonRecord(root.source_target_relevance);
  const context = jsonRecord(root.context_quality);
  const anchor = jsonRecord(root.anchor_quality);
  const editorial = jsonRecord(root.editorial_nature);
  const control = jsonRecord(root.controllability);
  const risk = jsonRecord(root.risk);
  return {
    overallScore: score(root.overall_score),
    pageType: text(root.page_type) ?? text(root.page_type_guess),
    pageSummary: text(root.page_summary),
    relevanceScore: score(relevance.score),
    relevanceVerdict: text(relevance.verdict),
    contextVerdict: text(context.verdict),
    anchorVerdict: text(anchor.verdict),
    editorialKind: text(editorial.kind),
    controlLevel: text(control.level) ?? text(root.control_likelihood),
    controlReason: text(control.reasoning) ?? text(root.control_reason),
    action: text(root.recommended_action),
    actionReason: text(root.action_reason),
    priority: text(root.priority),
    riskVerdict: text(risk.verdict),
    confidence: score(root.confidence),
    topics: Array.isArray(root.topics)
      ? root.topics.filter((item): item is string => typeof item === "string")
      : [],
  };
}

export function humanizeAssessmentValue(value: string | null): string {
  if (!value) return "—";
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
