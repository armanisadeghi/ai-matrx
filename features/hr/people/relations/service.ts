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
  fetchHrConfidential,
  fetchHrRelationsList,
  fetchHrRestricted,
  fetchHrRestrictedList,
} from "@/features/hr/service";
import type { HrAuditedRow, HrResult } from "@/features/hr/types";

import {
  HR_CORRECTIVE_ACTION_LEVEL_LABELS,
  HR_CORRECTIVE_ACTION_STATE_LABELS,
  HR_INCIDENT_KIND_LABELS,
  HR_INCIDENT_STATE_LABELS,
  type HrCaseKind,
  type HrCorrectiveActionLevel,
  type HrCorrectiveActionRow,
  type HrCorrectiveActionState,
  type HrIncidentKind,
  type HrIncidentParty,
  type HrIncidentRow,
  type HrIncidentState,
  type HrRelationsCase,
  type HrRestrictedNote,
  correctiveActionState,
} from "./types";

export const HR_CORRECTIVE_ACTION_TOKEN = "hr_corrective_action";
export const HR_INCIDENT_TOKEN = "hr_incident";
export const HR_INCIDENT_PARTY_TOKEN = "hr_incident_party";
export const HR_RESTRICTED_NOTE_TOKEN = "hr_restricted_note";

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

// 🚨 NO `?? state` FALLBACK HERE ANY MORE. Every value this can be given now
// comes from `correctiveActionState`, which returns the union and nothing else —
// so a miss is impossible rather than silently rendered raw. The old fallback is
// exactly what let the literal string `undefined` reach a badge (see
// `correctiveActionState`'s header): a lookup miss that prints the raw value
// looks deliberate, and nobody reading the screen could tell.
function labelActionState(state: HrCorrectiveActionState): string {
  return HR_CORRECTIVE_ACTION_STATE_LABELS[state];
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
    assigneeName: null,
    oshaRecordable: row.osha_recordable ?? null,
    // 🚨 THE COLUMN IS `legal_hold_count`, AND `legal_hold_id` HAS NEVER EXISTED
    // ON EITHER TABLE. Read live from information_schema on 2026-08-30: both
    // carry the `{{RETAIN}}` block's `legal_hold_count integer`. So this cell,
    // and the case page's whole legal-hold banner, were gated on `undefined` and
    // a case under hold rendered as a case under no hold — on the one record
    // class where the hold is the reason the delete action is absent.
    underLegalHold: (row.legal_hold_count ?? 0) > 0,
    // `summary` may be absent for a viewer who only gets the redacted line.
    // Absent → null → the cell renders nothing. Never a placeholder.
    summary: row.summary ?? null,
    voided: Boolean(row.voided_at),
    voidReason: row.void_reason ?? null,
    incident: row,
  };
}

export function correctiveActionToCase(
  row: HrCorrectiveActionRow,
): HrRelationsCase {
  // DERIVED, because there is no `state` column to read. See
  // `correctiveActionState` — `String(row.state)` used to hand the literal
  // `"undefined"` to both of these lines.
  const state = correctiveActionState(row);
  return {
    id: row.id,
    caseKind: "corrective_action",
    occurredOn: row.issued_on ?? row.incident_on ?? null,
    kindLabel: labelActionLevel(String(row.level)),
    state,
    stateLabel: labelActionState(state),
    subjectName: row.subject_name ?? null,
    // `hr.corrective_action` names its subject `employment_id`; only
    // `hr.incident` calls it `subject_employment_id`, and reading the incident's
    // name here produced a null on every row.
    subjectEmploymentId: row.employment_id ?? null,
    // 🚨 THERE IS NO `issuer_name` ON THE WIRE AND THERE NEVER WAS.
    // `hr._project_row` resolves a display name for the SUBJECT only
    // (`subject_employment_id` / `employment_id`); the issuer arrives as
    // `issued_by_employment_id`, a uuid. Absent stays absent — a uuid in a
    // column headed "Issued by" is worse than an empty cell.
    assigneeName: null,
    oshaRecordable: null,
    underLegalHold: (row.legal_hold_count ?? 0) > 0,
    summary: row.summary ?? null,
    // A corrective action is not voided; it is RESCINDED, which is an outcome
    // on its own ladder (§4.8) and already carried by `outcome`.
    voided: false,
    voidReason: null,
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
 * Route 16. One case, EACH KIND THROUGH ITS OWN TIER'S DOOR.
 *
 * 🚨 THIS IS THE SAME DISEASE THE ROUTE-15 LIST HAD, AND THE CASE READ KEPT IT
 * FOR A WHOLE BUILD. Both kinds used to go through `hr_restricted_get`. The two
 * case kinds are NOT on the same registry tier — `hr._door_spec` returns
 * **confidential** for `hr_corrective_action` and **restricted** for
 * `hr_incident` — and the shared door RAISES rather than refusing, by design,
 * because asking the wrong family is a caller mistake and not an access verdict.
 * Verified live 2026-08-29 in a rolled-back transaction as the issuer:
 *
 *     hr_restricted_get('hr_corrective_action', …)
 *       → 22023  "hr audited door: hr_corrective_action is the confidential
 *                 tier; use the hr_confidential_get door"
 *     hr_confidential_get('hr_corrective_action', …)
 *       → granted: true, basis: 'self', 36 keys
 *
 * The error names the fix in as many words. What the defect produced: the
 * corrective-action case page could not load AT ALL, for ANY viewer, on
 * production and on main — the 400 was swallowed into the "a refusal is DATA"
 * transport and the surface rendered a no-access state over a record the caller
 * was fully entitled to. Every control below the header — the acknowledgment,
 * the wet signature and its witness, the refusal, the outcome — was unreachable
 * by anybody, while the doors beneath them were correct the entire time.
 *
 * 🚨 THE TIER IS THE REGISTRY'S ANSWER, NOT OURS. §13 D-4 is still open
 * (SPEC-ACCESS makes `hr.corrective_action` confidential so the subject can read
 * what they are asked to sign; SPEC-DATA-MODEL §10.1 says restricted). When that
 * ruling lands the registry moves and `scripts/hr/hrb026_rpc_conformance.ts`
 * turns THIS call site red on the next push — which is the point of teaching the
 * guard the pairing.
 *
 * 🚨 THE TWO DOORS DO NOT TAKE THE SAME ARGUMENTS, and that is a real difference
 * rather than an oversight. `justification` is REQUIRED on the restricted door
 * and is shown to the subject in their own access log; `hr_confidential_get`
 * declares no `p_justification` at all (`p_token, p_id, p_purpose` — read off
 * `pg_proc` 2026-08-29) and sending one would be PGRST202, not a wider audit
 * row. So the confidential lane records `purpose`, and the caller's
 * justification is carried only where a door exists to carry it.
 *
 * 🚨 THE RETURN TYPE IS THE ROW, NOT `HrCaseDetail`. Both doors answer
 * `{ granted, row, basis, is_self_access, audit_id }` and `row` is
 * `hr._project_row`'s output — the FLAT table row plus `subject_name`. A generic
 * that names the composed shape is how the case page came to read four keys that
 * were never on the wire; the composition happens in the hook, out of three
 * separate audited reads, and it is typed there.
 */
export function fetchHrRelationsCase(args: {
  caseKind: HrCaseKind;
  caseId: string;
  justification: string;
}): Promise<HrResult<HrAuditedRow<HrIncidentRow | HrCorrectiveActionRow>>> {
  if (args.caseKind === "corrective_action") {
    return fetchHrConfidential<HrIncidentRow | HrCorrectiveActionRow>({
      token: HR_CORRECTIVE_ACTION_TOKEN,
      id: args.caseId,
      purpose: "relations_case_open",
    });
  }
  return fetchHrRestricted<HrIncidentRow | HrCorrectiveActionRow>({
    token: HR_INCIDENT_TOKEN,
    id: args.caseId,
    purpose: "relations_case_open",
    justification: args.justification,
  });
}

/**
 * One case's party rows — §2.2 route 16's "component, conveyed by the parent's
 * reach".
 *
 * `hr_incident_party` is its own registered RESTRICTED token with its own door
 * spec, and `hr._door_verdict` runs §5's veto over it exactly as it does over
 * the parent: an accused person is refused their own party row, and an
 * investigator with no `incident.read` still reaches it through the party lane.
 * So this is not a widening — it is the same gate, asked about the component.
 *
 * A refusal comes straight back. The panel renders NOTHING for an absent list
 * and "Nobody recorded yet" only for a list it was actually given.
 */
export async function fetchHrIncidentParties(
  organizationId: string | null,
  incidentId: string,
): Promise<HrResult<HrIncidentParty[]>> {
  const result = await fetchHrRestrictedList<Record<string, unknown>>({
    token: HR_INCIDENT_PARTY_TOKEN,
    filter: {
      ...(organizationId ? { organization_id: organizationId } : {}),
      incident_id: incidentId,
    },
    limit: 200,
    purpose: "relations_case_open",
  });
  if (!result.ok) return result;

  return {
    ok: true,
    // Mapped off the wire, never cast. The column is `party_role`, the person's
    // name arrives as `subject_name` (hr._project_row adds it from
    // `employment_id`), and there is no `note` column on this table at all — the
    // panel used to render `party.note` and `party.role`, neither of which the
    // door has ever emitted.
    data: result.data.rows.map((row) => ({
      id: String(row.id),
      role: String(row.party_role ?? ""),
      employment_id: (row.employment_id as string | null) ?? null,
      display_name: (row.subject_name as string | null) ?? null,
      external_name: (row.external_name as string | null) ?? null,
      interviewed_at: (row.interviewed_at as string | null) ?? null,
      added_at: (row.created_at as string | null) ?? null,
    })),
  };
}

/**
 * The case's restricted notes, through their OWN lane.
 *
 * 🚨 A NOTE IS NEVER A COMPONENT OF THE CASE. `hr.restricted_note` resolves its
 * reader PER NOTE KIND inside `hr._door_verdict` (`hr._note_kind_caps`), plus
 * the author's own owner lane — an `executive_only` note and an `investigation`
 * note on the same case have different readers, and no org admin reaches either
 * through the org. Asking for them here, as their own audited list, is what
 * keeps that true: the door drops every row this viewer may not have, and what
 * comes back is exactly their lane.
 *
 * THE BYLINE. `hr.restricted_note` names its person `author_employment_id` — the
 * WRITER, not the subject — and `hr._project_row` used to resolve a display name
 * off `subject_employment_id` / `employment_id` only, so every note rendered
 * unsigned. hr_l3_120a gave the projection its own author branch, through the same
 * `hr._subject_display_name` door the subject branch uses: `author_name` arrives
 * on the row, and it is NULL — never a uuid — when the viewer may not see that
 * person's name, which the panel renders as no byline at all.
 */
export async function fetchHrCaseRestrictedNotes(
  organizationId: string | null,
  caseKind: HrCaseKind,
  caseId: string,
): Promise<HrResult<HrRestrictedNote[]>> {
  const result = await fetchHrRestrictedList<Record<string, unknown>>({
    token: HR_RESTRICTED_NOTE_TOKEN,
    filter: {
      ...(organizationId ? { organization_id: organizationId } : {}),
      subject_token:
        caseKind === "incident"
          ? HR_INCIDENT_TOKEN
          : HR_CORRECTIVE_ACTION_TOKEN,
      subject_id: caseId,
    },
    limit: 200,
    purpose: "relations_case_open",
  });
  if (!result.ok) return result;

  return {
    ok: true,
    data: result.data.rows.map((row) => ({
      id: String(row.id),
      note_kind: String(row.note_kind ?? ""),
      title: (row.title as string | null) ?? null,
      body: (row.body as string | null) ?? null,
      redacted_summary: (row.redacted_summary as string | null) ?? null,
      author_name: (row.author_name as string | null) ?? null,
      created_at: (row.created_at as string | null) ?? null,
    })),
  };
}
