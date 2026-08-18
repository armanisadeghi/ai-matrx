/**
 * Desk mutations, as PURE reducers over generated row types.
 *
 * The reducers are the real ones: they set the same columns and the same
 * timestamps a server write would (`accepted_at`, `pitched_at`, `version`),
 * so wiring persistence later is a matter of posting the produced row — not
 * of rewriting this logic. The workspace applies them optimistically.
 *
 * They are deliberately separate from React so the transition rules can be
 * read, reviewed, and unit-tested in one place.
 */

import type { Json } from "@/types/database.types";

import type { SourceRequestRow, StoryAngleRow } from "../types";

export type AngleAction =
  | "accept"
  | "develop"
  | "pitch"
  | "land"
  | "dismiss"
  | "reopen";

export const ANGLE_ACTION_LABEL: Record<AngleAction, string> = {
  accept: "Accept angle",
  develop: "Start developing",
  pitch: "Mark pitched",
  land: "Mark landed",
  dismiss: "Dismiss",
  reopen: "Reopen",
};

/** Which transitions the current status actually allows. */
export function allowedAngleActions(angle: StoryAngleRow): AngleAction[] {
  switch (angle.status) {
    case "proposed":
      return ["accept", "develop", "dismiss"];
    case "accepted":
      return ["develop", "pitch", "dismiss"];
    case "developing":
      return ["pitch", "dismiss"];
    case "pitched":
      return ["land", "dismiss"];
    case "landed":
      return [];
    case "dismissed":
      return ["reopen"];
    default:
      return ["dismiss"];
  }
}

export function applyAngleAction(
  angle: StoryAngleRow,
  action: AngleAction,
  at: string = new Date().toISOString(),
): StoryAngleRow {
  const base: StoryAngleRow = {
    ...angle,
    updated_at: at,
    version: angle.version + 1,
    human_reviewed_at: at,
  };
  switch (action) {
    case "accept":
      return { ...base, status: "accepted", accepted_at: at };
    case "develop":
      return {
        ...base,
        status: "developing",
        accepted_at: angle.accepted_at ?? at,
      };
    case "pitch":
      return { ...base, status: "pitched", pitched_at: at };
    case "land":
      return { ...base, status: "landed", landed_at: at };
    case "dismiss":
      return { ...base, status: "dismissed", dismissed_at: at };
    case "reopen":
      return { ...base, status: "proposed", dismissed_at: null };
    default:
      return base;
  }
}

/**
 * One-click human enrichment: the operator supplies the fact the analyzer
 * could not find. The note becomes a real `evidence_refs` element, the
 * matching `missing_evidence` element is retired, and `evidence_quality`
 * climbs proportionally — the same write the server would make.
 */
export function attachEvidence(
  angle: StoryAngleRow,
  input: { label: string; note: string; source?: string | null },
  at: string = new Date().toISOString(),
): StoryAngleRow {
  const evidence = Array.isArray(angle.evidence_refs)
    ? [...angle.evidence_refs]
    : [];
  const entry: Json = {
    label: input.label,
    detail: input.note,
    source: input.source ?? "Supplied by the operator",
    satisfied: true,
    supplied_at: at,
  };
  evidence.push(entry);

  const missing = Array.isArray(angle.missing_evidence)
    ? angle.missing_evidence.filter((element) => !matchesLabel(element, input.label))
    : [];

  const before = Array.isArray(angle.missing_evidence)
    ? angle.missing_evidence.length
    : 0;
  const closed = before - missing.length;
  const required = Array.isArray(angle.proof_required)
    ? angle.proof_required.length
    : 0;
  const lift = required > 0 ? Math.round((closed / required) * 100) : 0;

  return {
    ...angle,
    evidence_refs: evidence,
    missing_evidence: missing,
    evidence_quality: Math.max(
      angle.evidence_quality,
      Math.min(100, angle.evidence_quality + lift),
    ),
    requires_human_review: missing.length > 0 ? angle.requires_human_review : false,
    human_reviewed_at: at,
    updated_at: at,
    version: angle.version + 1,
  };
}

function matchesLabel(element: Json, label: string): boolean {
  const target = label.toLowerCase().trim();
  if (typeof element === "string") return element.toLowerCase().trim() === target;
  if (element && typeof element === "object" && !Array.isArray(element)) {
    for (const key of ["label", "claim", "requirement", "title", "text", "name"]) {
      const value = (element as { [key: string]: Json })[key];
      if (typeof value === "string" && value.toLowerCase().trim() === target) {
        return true;
      }
    }
  }
  return false;
}

export type RequestAction = "draft" | "submit" | "win" | "pass";

export const REQUEST_ACTION_LABEL: Record<RequestAction, string> = {
  draft: "Draft response",
  submit: "Mark submitted",
  win: "Mark won",
  pass: "Pass on this",
};

export function allowedRequestActions(
  request: SourceRequestRow,
): RequestAction[] {
  switch (request.status) {
    case "new":
    case "matched":
      return ["draft", "pass"];
    case "drafted":
      return ["submit", "pass"];
    case "submitted":
      return ["win", "pass"];
    default:
      return [];
  }
}

export function applyRequestAction(
  request: SourceRequestRow,
  action: RequestAction,
  at: string = new Date().toISOString(),
): SourceRequestRow {
  const base: SourceRequestRow = {
    ...request,
    updated_at: at,
    version: request.version + 1,
  };
  switch (action) {
    case "draft":
      return { ...base, status: "drafted", draft_generated_at: at };
    case "submit":
      return { ...base, status: "submitted", submitted_at: at };
    case "win":
      return { ...base, status: "won", won_at: at };
    case "pass":
      return { ...base, status: "passed" };
    default:
      return base;
  }
}

export function saveRequestDraft(
  request: SourceRequestRow,
  draft: string,
  at: string = new Date().toISOString(),
): SourceRequestRow {
  return {
    ...request,
    draft_response: draft,
    draft_generated_at: at,
    status: request.status === "new" || request.status === "matched" ? "drafted" : request.status,
    updated_at: at,
    version: request.version + 1,
  };
}
