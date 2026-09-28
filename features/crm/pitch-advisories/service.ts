// features/crm/pitch-advisories/service.ts
//
// The PR floor (pitch advisories E1–E17) — the client half.
//
//   checkPitchAdvisories   → aidream `POST /crm/pitch-advisories` (the ONE shared check; it
//                            reads the org's sends, drafts and knobs, so it runs server-side)
//   recordAdvisoryGoAhead  → `platform.log_activity`, DIRECT (a data write: who = auth.uid(),
//                            when = now(), and exactly which warnings the person saw)
//
// A report NEVER refuses. Every surface renders it with <PitchAdvisoryPanel> above its action
// button and lets the action run (common-docs/policies/validation-offers-never-blocks.md).

import { postJson } from "@/lib/python-client";
import { createClient } from "@/utils/supabase/client";

// 🚨 STAND-IN, announced: these shapes mirror aidream
// `aidream/services/pitch_advisories/models.py` (+ `PitchAdvisoryRequest` in
// `aidream/api/routers/crm.py`) BY HAND, because `pnpm sync-types` was refused on
// 2026-09-27 by the drop guard over another lane's in-flight `PanelTrend` change.
// The day `types/python-generated/api-types.ts` carries `PitchAdvisoryReport`,
// replace this block with `components["schemas"][...]` and `postJson` with
// `apiPost("/crm/pitch-advisories", …)`. Every field below exists server-side.
export type PitchAdvisorySurface =
  | "single_send"
  | "list_send"
  | "list_save"
  | "chasebox_review"
  | "followup_runner"
  | "source_request"
  | "crisis_publish";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export interface AdvisoryOffer {
  label: string;
  action:
    | "mandate"
    | "limit_to"
    | "schedule_at"
    | "hold_until"
    | "label_cold"
    | "rewrite_line"
    | "strip_tracking"
    | "flatten_attachments";
  mandate_key?: string | null;
  detail?: { [key: string]: Json };
}

export interface PitchAdvisory {
  rule: string;
  code: string;
  severity: "info" | "warn" | "strong";
  message: string;
  offer?: AdvisoryOffer | null;
  other_offers?: AdvisoryOffer[];
  knob?: string | null;
  evidence?: { [key: string]: Json };
}

export interface PitchAdvisoryReport {
  surface: PitchAdvisorySurface;
  advisories?: PitchAdvisory[];
  action_may_proceed?: true;
  wants_person?: boolean;
}

export interface PitchAdvisoryRequest {
  surface: PitchAdvisorySurface;
  draft_id?: string | null;
  outreach_list_id?: string | null;
  source_request_id?: string | null;
  reputation_case_id?: string | null;
  recipient_party_ids?: string[];
  subject?: string | null;
  body?: string | null;
  recipient_count?: number | null;
  adding_recipients?: number | null;
  attachment_count?: number;
  is_exclusive?: boolean;
  exclusive_expires_at?: string | null;
  embargo_until?: string | null;
  has_new_information?: boolean | null;
  has_direct_standing?: boolean | null;
}

/** The `platform.activity_log.action` a go-ahead is recorded under (aidream `OVERRIDE_ACTION`). */
export const ADVISORY_OVERRIDE_ACTION = "pr.advisory_override";

export async function checkPitchAdvisories(
  organizationId: string,
  request: PitchAdvisoryRequest,
): Promise<PitchAdvisoryReport> {
  const { data } = await postJson<PitchAdvisoryReport, PitchAdvisoryRequest>(
    "/crm/pitch-advisories",
    request,
    { organizationId },
  );
  return data;
}

/** True when the report carries anything a person should have seen before acting. */
export function hasWarnings(report: PitchAdvisoryReport | null | undefined): boolean {
  return Boolean(
    report?.advisories?.some((a) => a.severity === "warn" || a.severity === "strong"),
  );
}

export interface AdvisoryGoAhead {
  organizationId: string;
  surface: PitchAdvisorySurface;
  /** What the person went ahead with, e.g. `crm_interaction` + the draft id. */
  entityType?: string | null;
  entityId?: string | null;
  advisories: readonly PitchAdvisory[];
  /** `go_ahead`, or the offer they took instead (e.g. `label_cold`). */
  choice?: string;
}

/**
 * Record that a person saw these warnings and went ahead. Never blocks the action:
 * a failed write is returned as an Error for the caller to surface, and the action runs.
 */
export async function recordAdvisoryGoAhead(
  goAhead: AdvisoryGoAhead,
): Promise<Error | null> {
  const shown = goAhead.advisories.filter((a) => a.severity !== "info");
  if (shown.length === 0 && (goAhead.choice ?? "go_ahead") === "go_ahead") return null;
  const supabase = createClient();
  const { error } = await supabase.schema("platform").rpc("log_activity", {
    p_org: goAhead.organizationId,
    p_action: ADVISORY_OVERRIDE_ACTION,
    p_entity_type: goAhead.entityType ?? undefined,
    p_entity_id: goAhead.entityId ?? undefined,
    p_metadata: {
      surface: goAhead.surface,
      choice: goAhead.choice ?? "go_ahead",
      advisories: shown.map((a) => ({
        rule: a.rule,
        code: a.code,
        severity: a.severity,
        message: a.message,
      })),
    },
  });
  return error ? new Error(error.message) : null;
}
