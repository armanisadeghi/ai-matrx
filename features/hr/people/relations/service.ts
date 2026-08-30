// features/hr/people/relations/service.ts
//
// ROUTE 15's LIST AND ROUTE 16's READ.
//
// 🚨 AUDITED RPCs ONLY. There is no client-direct select on `hr.incident` or
// `hr.corrective_action`, and there never will be: `hr` is not exposed to
// PostgREST, and every read of a RESTRICTED row must land in `hr.access_audit`.
//
// 🚨 A REFUSAL IS DATA. `supabase.rpc()` does not throw on `{granted:false}`.
// Every function here returns `HrResult`, and the surfaces must render the
// refusal — NEVER let a refusal look like an empty list. "No cases" and "not
// yours to see" are different sentences and the second one must never render
// as the first.

import {
  fetchHrRelationsList,
  fetchHrRestricted,
} from "@/features/hr/service";
import type { HrResult } from "@/features/hr/types";

import {
  HR_CORRECTIVE_ACTION_LEVEL_LABELS,
  HR_CORRECTIVE_ACTION_STATE_LABELS,
  HR_INCIDENT_KIND_LABELS,
  HR_INCIDENT_STATE_LABELS,
  type HrCaseDetail,
  type HrCaseKind,
  type HrCorrectiveActionLevel,
  type HrCorrectiveActionRow,
  type HrCorrectiveActionState,
  type HrIncidentKind,
  type HrIncidentRow,
  type HrIncidentState,
  type HrRelationsCase,
} from "./types";

export const HR_CORRECTIVE_ACTION_TOKEN = "hr_corrective_action";
export const HR_INCIDENT_TOKEN = "hr_incident";

/**
 * Why the whole union comes back in one answer.
 *
 * Route 15 is a UNION of two record families, so "page 2" has no server-side
 * meaning: rows 26–50 of the merged, date-sorted list can come from either side in
 * any proportion. The repo law is that a list paginates over the FULL result set,
 * so the honest implementation is to pull the union complete and page it in the
 * browser. That is affordable here and nowhere else in HR — an employer's whole
 * relations history is tens to low hundreds of rows, not the directory's thousands.
 *
 * 🚨 THIS USED TO BE A CLIENT-SIDE SWEEP OVER TWO CALLS TO `hr_restricted_list`,
 * AND IT COULD NEVER HAVE WORKED. See the header on `fetchHrRelationsCases`: one of
 * the two tokens is not on that door's tier, so that half 400'd on every render and
 * the failure was swallowed while the surface claimed completeness. The union is
 * `public.hr_relations_list`'s job and it does it in one round trip.
 */
const SWEEP_PAGE = 200;
const SWEEP_MAX_PAGES = 25;

function labelIncidentKind(kind: string): string {
  return (
    HR_INCIDENT_KIND_LABELS[kind as HrIncidentKind] ??
    kind.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
  );
}

function labelIncidentState(state: string): string {
  return (
    HR_INCIDENT_STATE_LABELS[state as HrIncidentState] ??
    HR_INCIDENT_STATE_LABELS[state.replace(/_/g, "-") as HrIncidentState] ??
    (state === "intake" ? HR_INCIDENT_STATE_LABELS.open : state)
  );
}

function labelActionLevel(level: string): string {
  return (
    HR_CORRECTIVE_ACTION_LEVEL_LABELS[level as HrCorrectiveActionLevel] ??
    level.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
  );
}

function labelActionState(state: string): string {
  return (
    HR_CORRECTIVE_ACTION_STATE_LABELS[state as HrCorrectiveActionState] ??
    HR_CORRECTIVE_ACTION_STATE_LABELS[
      state.replace(/_/g, "-") as HrCorrectiveActionState
    ] ??
    state
  );
}

export function incidentToCase(row: HrIncidentRow): HrRelationsCase {
  return {
    id: row.id,
    caseKind: "incident",
    occurredOn: row.reported_at ?? row.occurred_at ?? null,
    kindLabel: labelIncidentKind(String(row.incident_kind)),
    state: String(row.state),
    stateLabel: labelIncidentState(String(row.state)),
    subjectName: row.subject_name ?? null,
    subjectEmploymentId: row.subject_employment_id ?? null,
    assigneeName: row.assignee_name ?? null,
    oshaRecordable: row.osha_recordable ?? null,
    underLegalHold: Boolean(row.legal_hold_id),
    // `summary` may be absent for a viewer who only gets the redacted line.
    // Absent → null → the cell renders nothing. Never a placeholder.
    summary: row.summary ?? row.redacted_summary ?? null,
    incident: row,
  };
}

export function correctiveActionToCase(
  row: HrCorrectiveActionRow,
): HrRelationsCase {
  return {
    id: row.id,
    caseKind: "corrective_action",
    occurredOn: row.issued_on ?? row.incident_on ?? null,
    kindLabel: labelActionLevel(String(row.level)),
    state: String(row.state),
    stateLabel: labelActionState(String(row.state)),
    subjectName: row.subject_name ?? null,
    subjectEmploymentId: row.subject_employment_id ?? null,
    assigneeName: row.issuer_name ?? null,
    oshaRecordable: null,
    underLegalHold: Boolean(row.legal_hold_id),
    summary: row.summary ?? null,
    correctiveAction: row,
  };
}

export type HrRelationsFilter = {
  caseKind?: HrCaseKind | null;
  state?: string | null;
  assigneeEmploymentId?: string | null;
  subjectEmploymentId?: string | null;
  from?: string | null;
  to?: string | null;
  oshaRecordable?: boolean | null;
};

export type HrRelationsList = {
  cases: HrRelationsCase[];
  /**
   * 🚨 THE COUNT THE SERVER GAVE **THIS** VIEWER, after `hr.incident_excluded()`
   * removed every row they are a respondent in. Two people with identical
   * capabilities can legitimately see different totals for the same filter.
   * That is CORRECT and must never be "fixed" with a shared cache.
   */
  total: number;
  /**
   * True when one side of the union REFUSED — a real access verdict — while the
   * other answered. `hr_admin` holds corrective actions but not incidents
   * (SPEC-ACCESS §3.2), so this is a normal, honest state.
   */
  partial: boolean;
  /** Which side, so the banner can name it instead of gesturing at "one of the two". */
  correctiveActionsGranted: boolean;
  incidentsGranted: boolean;
};

/**
 * Route 15. Both doors, unioned, sorted `reported_at`/`issued_on` desc.
 *
 * `hr_admin` holds corrective actions but NOT incidents (SPEC-ACCESS §3.2), so
 * a viewer legitimately gets one side and a refusal on the other. That is not
 * an error and it is not an empty list — it is `partial: true`, and the surface
 * says so in words.
 */
/**
 * 🚨 `organizationId` IS REQUIRED, AND OMITTING IT DID NOT MEAN "EVERY EMPLOYER" —
 * IT MEANT "WHICHEVER ONE THE VIEWER HAPPENS TO WORK FOR FIRST".
 *
 * `hr._door_list` resolves the employer in three steps, verified live in its body:
 *
 *     v_org := nullif(p_filter ->> 'organization_id','')::uuid;
 *     if v_org is null then
 *       select em.organization_id into v_org
 *         from hr.employment em where em.id = any(hr.employments_of(v_uid)) limit 1;
 *     end if;
 *     if v_org is null then raise …
 *
 * That middle fallback is a `limit 1` with **no ORDER BY**. So a call with no
 * `organization_id` was silently scoped to an arbitrary one of the VIEWER's own
 * employments — not to the employer whose page they are looking at. For an HR
 * admin who is employed by one company and administers another, this queue showed
 * the wrong company's cases or, as observed live on 2026-08-27, none at all:
 * `row_count: 0` with **`granted: true`**, so it did not even look like a refusal.
 * The surface rendered its "nothing here" empty state over a real, existing row.
 *
 * The organization is now always passed explicitly. Both call sites already held
 * it and already guarded on it — they simply never sent it.
 */
/**
 * 🚨 THE UNION IS THE SERVER'S JOB, AND ASKING FOR IT CLIENT-SIDE WAS PRODUCING A
 * LIST THAT LIED. This function used to call `hr_restricted_list` TWICE — once per
 * token — and merge the answers here. Against `hr_corrective_action` that call can
 * only ever fail: `hr._door_spec` returns **confidential** for that token and
 * **restricted** for `hr_incident`, and the shared door RAISES `22023` on a tier
 * mismatch by design, because asking the wrong family is a caller mistake and not a
 * refusal.
 *
 * What that produced on production v0.4.1474, verified: a 400 on the
 * corrective-action side, swallowed into `log_client_error` where nobody looks; the
 * incident side answering normally; `partial: true`; and the queue rendering
 * "1-2 of 2" incidents under a banner reading *"Nothing is hidden inside what you
 * can see."* — while TWO corrective actions for that same admin sat unlisted. A
 * completeness claim printed over a door that had just refused is the worst thing
 * this surface can do, and it is a strictly worse failure than showing nothing.
 *
 * 🚨 SO THE FIX IS NOT A THIRD TOKEN GUESS. `public.hr_relations_list` is the
 * purpose-built route-15 door and it already solves every part of this: it asks each
 * side at ITS OWN registry tier (so the tier can be re-ruled without touching this
 * file — see SPEC-EMPLOYEES §13 D-4, still open), it checks standing in the employer
 * BEFORE consulting the door so a stranger gets `granted:false` rather than a polite
 * empty list, and it returns `corrective_actions_granted` / `incidents_granted`
 * separately so a partial answer can be described in words instead of gestured at.
 *
 * It is not cursor-paged and needs no sweep: it takes `p_limit` and answers the
 * whole union at once, which is the same bounded-history assumption the sweep was
 * built on. `sweep()` is gone with it.
 */
export async function fetchHrRelationsCases(
  organizationId: string,
  filter: HrRelationsFilter = {},
): Promise<HrResult<HrRelationsList>> {
  const serverFilter: Record<string, unknown> = {};
  if (filter.caseKind) serverFilter.case_kind = filter.caseKind;
  if (filter.state) serverFilter.state = filter.state;
  if (filter.assigneeEmploymentId) {
    serverFilter.assignee_employment_id = filter.assigneeEmploymentId;
  }
  if (filter.subjectEmploymentId) {
    serverFilter.subject_employment_id = filter.subjectEmploymentId;
  }
  if (filter.from) serverFilter.from = filter.from;
  if (filter.to) serverFilter.to = filter.to;
  if (filter.oshaRecordable !== null && filter.oshaRecordable !== undefined) {
    serverFilter.osha_recordable = filter.oshaRecordable;
  }

  const result = await fetchHrRelationsList({
    organizationId,
    filter: serverFilter,
    // The whole bounded history in one answer; the table pages it in the browser.
    limit: SWEEP_PAGE * SWEEP_MAX_PAGES,
  });
  // A refusal is handed straight back so the surface renders the no-access state.
  // It is NEVER flattened into an empty list.
  if (!result.ok) return result;

  const raw = result.data;
  const cases = raw.rows.map((row) =>
    row.case_kind === "incident"
      ? incidentToCase(row as unknown as HrIncidentRow)
      : correctiveActionToCase(row as unknown as HrCorrectiveActionRow),
  );
  cases.sort((a, b) => (b.occurredOn ?? "").localeCompare(a.occurredOn ?? ""));

  const asked =
    filter.caseKind === "incident" || filter.caseKind === "corrective_action" ? 1 : 2;
  const answered =
    (raw.correctiveActionsGranted ? 1 : 0) + (raw.incidentsGranted ? 1 : 0);

  return {
    ok: true,
    data: {
      cases,
      total: raw.total,
      partial: answered < asked,
      correctiveActionsGranted: raw.correctiveActionsGranted,
      incidentsGranted: raw.incidentsGranted,
    },
  };
}

/**
 * Route 16. One case, either kind.
 *
 * `justification` is REQUIRED on the restricted door and it is shown to the
 * subject in their own access log — so the caller passes what they are actually
 * doing. A constant string here would be an audit finding.
 */
export function fetchHrRelationsCase(args: {
  caseKind: HrCaseKind;
  caseId: string;
  justification: string;
}): ReturnType<typeof fetchHrRestricted<HrCaseDetail>> {
  return fetchHrRestricted<HrCaseDetail>({
    token:
      args.caseKind === "incident"
        ? HR_INCIDENT_TOKEN
        : HR_CORRECTIVE_ACTION_TOKEN,
    id: args.caseId,
    purpose: "relations_case_open",
    justification: args.justification,
  });
}
