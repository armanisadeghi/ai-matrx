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

import type { components } from "@/types/python-generated/api-types";
import { apiPost } from "@/lib/api/typed-client";
import { createClient } from "@/utils/supabase/client";

export type PitchAdvisoryReport = components["schemas"]["PitchAdvisoryReport"];
export type PitchAdvisory = components["schemas"]["PitchAdvisory"];
export type AdvisoryOffer = components["schemas"]["AdvisoryOffer"];
export type PitchAdvisoryRequest = components["schemas"]["PitchAdvisoryRequest"];
export type PitchAdvisorySurface = PitchAdvisoryRequest["surface"];

/** The `platform.activity_log.action` a go-ahead is recorded under (aidream `OVERRIDE_ACTION`). */
export const ADVISORY_OVERRIDE_ACTION = "pr.advisory_override";

export async function checkPitchAdvisories(
  organizationId: string,
  request: PitchAdvisoryRequest,
): Promise<PitchAdvisoryReport> {
  const { data } = await apiPost("/crm/pitch-advisories", request, {
    organizationId,
  });
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
