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
  fetchHrRestricted,
  fetchHrRestrictedList,
} from "@/features/hr/service";
import type { HrAuditedPage, HrResult } from "@/features/hr/types";

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
 * Why this list sweeps instead of paging server-side.
 *
 * Route 15 is a UNION of two independently-paged doors, so "page 2" has no
 * server-side meaning: rows 26–50 of the merged, date-sorted list can come from
 * either side in any proportion. The repo law is that a list paginates over the
 * FULL result set, so the honest implementation is to pull both sides complete
 * and page the union in the browser.
 *
 * That is affordable here and nowhere else in HR: an employer's whole relations
 * history is tens to low hundreds of rows, not the directory's thousands. The
 * sweep is bounded so a bad `total` can never spin.
 */
const SWEEP_PAGE = 200;
const SWEEP_MAX_PAGES = 25;

async function sweep<T>(
  token: string,
  filter: Record<string, unknown>,
  purpose: string,
): Promise<HrResult<{ rows: T[]; total: number }>> {
  const rows: T[] = [];
  let offset = 0;
  let total = 0;

  for (let page = 0; page < SWEEP_MAX_PAGES; page += 1) {
    const result = await fetchHrRestrictedList<T>({
      token,
      filter,
      limit: SWEEP_PAGE,
      offset,
      purpose,
    });
    // A refusal ANYWHERE in the sweep is the answer for the whole list. Never
    // return the pages that happened to succeed — a half-list is a lie.
    if (!result.ok) return result;

    const pageData: HrAuditedPage<T> = result.data;
    rows.push(...(pageData.rows ?? []));
    total = pageData.total ?? rows.length;
    offset += pageData.rows?.length ?? 0;

    if (!pageData.rows?.length || rows.length >= total) break;
  }

  return { ok: true, data: { rows, total } };
}

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
  /** True when one side of the union refused while the other answered. */
  partial: boolean;
};

/**
 * Route 15. Both doors, unioned, sorted `reported_at`/`issued_on` desc.
 *
 * `hr_admin` holds corrective actions but NOT incidents (SPEC-ACCESS §3.2), so
 * a viewer legitimately gets one side and a refusal on the other. That is not
 * an error and it is not an empty list — it is `partial: true`, and the surface
 * says so in words.
 */
export async function fetchHrRelationsCases(
  filter: HrRelationsFilter = {},
): Promise<HrResult<HrRelationsList>> {
  const serverFilter: Record<string, unknown> = {};
  if (filter.state) serverFilter.state = filter.state;
  if (filter.assigneeEmploymentId) {
    serverFilter.assignee_employment_id = filter.assigneeEmploymentId;
  }
  if (filter.subjectEmploymentId) {
    serverFilter.subject_employment_id = filter.subjectEmploymentId;
  }
  if (filter.from) serverFilter.from = filter.from;
  if (filter.to) serverFilter.to = filter.to;

  const wantActions = filter.caseKind !== "incident";
  const wantIncidents = filter.caseKind !== "corrective_action";

  const incidentFilter =
    filter.oshaRecordable === null || filter.oshaRecordable === undefined
      ? serverFilter
      : { ...serverFilter, osha_recordable: filter.oshaRecordable };

  const [actions, incidents] = await Promise.all([
    wantActions
      ? sweep<HrCorrectiveActionRow>(
          HR_CORRECTIVE_ACTION_TOKEN,
          serverFilter,
          "relations_case_list",
        )
      : null,
    wantIncidents
      ? sweep<HrIncidentRow>(HR_INCIDENT_TOKEN, incidentFilter, "relations_case_list")
      : null,
  ]);

  const answered = [actions, incidents].filter((r) => r?.ok);
  if (answered.length === 0) {
    // Both refused (or both were skipped by the filter, which cannot happen —
    // `caseKind` is one of two values). Hand the refusal straight back so the
    // surface renders the no-access state, NOT an empty table.
    return (actions ?? incidents) as HrResult<HrRelationsList>;
  }

  const cases: HrRelationsCase[] = [];
  let total = 0;

  if (actions?.ok) {
    cases.push(...actions.data.rows.map(correctiveActionToCase));
    total += actions.data.total;
  }
  if (incidents?.ok) {
    cases.push(...incidents.data.rows.map(incidentToCase));
    total += incidents.data.total;
  }

  cases.sort((a, b) => (b.occurredOn ?? "").localeCompare(a.occurredOn ?? ""));

  const asked = [wantActions, wantIncidents].filter(Boolean).length;
  return {
    ok: true,
    data: { cases, total, partial: answered.length < asked },
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
}): Promise<HrResult<{ row: HrCaseDetail; audit_id: string | null }>> {
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
