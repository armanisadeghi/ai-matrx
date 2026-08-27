// features/hr/service.ts
//
// EVERY HR READ AND WRITE THE BROWSER MAKES. One typed function per shipped RPC.
//
// 🚨 THE `hr` SCHEMA IS NOT EXPOSED TO PostgREST (verified live 2026-08-26 —
// `authenticator`'s `pgrst.db_schemas` carries neither `hr` nor `esign`). So
// Direct browser reads against either an `hr.*` relation or the `hr` schema do not
// work and never will. Every door is a `public.hr_*` SECURITY DEFINER function
// called as `supabase.rpc(...)`. This is still the DIRECT lane — React → Supabase,
// no Next.js API route, no Python hop (CLAUDE.md § Data flow).
//
// 🚨 A REFUSAL IS DATA, NOT AN EXCEPTION. Nothing in this file throws when the
// server says no. Callers get `HrResult<T>` and render the refusal in place, because
// SPEC-EMPLOYEES §2's no-access state is "the persona's nearest legitimate surface
// with one sentence", never a permission wall and never a leak that the record
// exists. The shipped doors speak two refusal dialects and `callHr` flattens both:
//
//   • ENVELOPE — `hr_employee_profile`, `hr_employment_history`, `hr_pending_changes`
//     return `{granted:false, reason:'not_reachable'}` with NO error.
//   • RAISED — `hr_my_context`, `hr_directory_list`, `hr_org_chart`,
//     `hr_structure_list`, `hr_knob_index` `raise … errcode '42501'` when the caller
//     has no standing. supabase-js reports that as `error`, not as data.
//
// Anything else that comes back as an error is a genuine failure and becomes
// `{kind:"failed"}` with a sentence, never a bare Postgres code (§2 error state).

import { supabase } from "@/utils/supabase/client";

import type {
  HrAuditedPage,
  HrDirectoryFilter,
  HrDirectoryPage,
  HrEmployeeProfile,
  HrEmploymentHistory,
  HrKnobIndex,
  HrMyContext,
  HrOrgChart,
  HrPendingChanges,
  HrRefusalEnvelope,
  HrResult,
  HrStructure,
  HrWriteAck,
} from "./types";
import type { HrDirectorySort } from "./constants";

// ── The one transport ───────────────────────────────────────────────────────

/** Postgres `insufficient_privilege`. The raised dialect's refusal code. */
const PG_INSUFFICIENT_PRIVILEGE = "42501";

function denied(
  reason: string,
  detail?: string | null,
  auditId?: string | null,
  field?: string | null,
  door?: string | null,
  payload?: Record<string, unknown> | null,
): HrResult<never> {
  return {
    ok: false,
    kind: "denied",
    reason,
    detail: detail ?? null,
    auditId: auditId ?? null,
    // A write refusal names the offending control and, where one exists, where to go and fix it
    // (`location_without_jurisdiction` carries `/hr/settings/structure`). Dropping these here is
    // how "some fields could not be saved" gets rendered instead of the field.
    field: field ?? null,
    door: door ?? null,
    // Whole, because `rehire_required` carries `existing` and that IS §4.6's panel.
    payload: payload ?? {},
  };
}

function failed(message: string, code?: string | null): HrResult<never> {
  return { ok: false, kind: "failed", message, code: code ?? null };
}

/**
 * 🚨 THERE ARE **TWO** REFUSAL DIALECTS, AND ONLY CHECKING ONE OF THEM READS EVERY WRITE
 * REFUSAL AS A SUCCESS.
 *
 * The `public.hr_*` doors refuse in two shapes, deliberately:
 *
 * - **READ doors** answer `{ granted: false, reason, detail, audit_id }`. `granted` is the
 *   access verdict, and a read that was refused has no row to return.
 * - **WRITE doors** answer `{ ok: false, reason, detail, field?, door?, audit_id }` — the
 *   refusal-envelope law core C3 established: Postgres has no autonomous transactions, so a
 *   door that wrote its audit row and then RAISED would roll the audit back with the
 *   exception. Refusal is DATA; only breakage is an exception.
 *
 * This helper originally tested `granted === false` only. Against a write refusal —
 * `{ ok: false, reason: "location_without_jurisdiction" }` — that test is false, the payload
 * falls through as a success, and `callHr` returns `{ ok: true, data: { ok: false, … } }`.
 * A call site that checks its own `result.ok` then tells an HR admin that somebody was hired
 * when **nothing was written**. That is the worst failure this file can produce, and it is
 * silent.
 *
 * Both dialects are refusals. `ok === false` is checked FIRST because a write envelope also
 * carries `field` and `door`, which the caller needs in order to say which control was wrong
 * and where to go and fix it.
 */
function isRefusalEnvelope(value: unknown): value is HrRefusalEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { granted?: unknown; ok?: unknown };
  return v.ok === false || v.granted === false;
}

/**
 * Call one `public.hr_*` door and normalize both refusal dialects.
 *
 * `envelope: true` strips the `granted` flag off the success payload so callers
 * hold a clean shape; `envelope: false` (the raised dialect) passes the object
 * through as-is.
 */
async function callHr<T>(
  fn: string,
  args: Record<string, unknown>,
  options: { envelope: boolean; whatFailed: string },
): Promise<HrResult<T>> {
  // The generated Function types cover the ARGUMENTS; every HR return is `Json`,
  // opaque to `supabase gen types`. The shape is asserted here, once, rather than
  // at each of the ~20 call sites below.
  const { data, error } = await supabase.rpc(fn as never, args as never);

  if (error) {
    if (error.code === PG_INSUFFICIENT_PRIVILEGE) {
      // The raised dialect's "no standing in this employer". Not an error state —
      // the surface renders the picker or the nearest legitimate place.
      return denied("no_standing", error.message ?? null);
    }
    return failed(
      `${options.whatFailed} could not be loaded. ${
        error.message?.trim() || "The database did not say why."
      }`,
      error.code ?? null,
    );
  }

  const payload: unknown = data;

  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return failed(
      `${options.whatFailed} came back in a shape this app does not understand. ` +
        "Retry, and if it keeps happening the HR data door needs a look.",
      null,
    );
  }

  if (isRefusalEnvelope(payload)) {
    return denied(
      payload.reason,
      payload.detail,
      payload.audit_id,
      payload.field,
      payload.door,
      payload as unknown as Record<string, unknown>,
    );
  }

  if (options.envelope) {
    const { granted: _granted, ...rest } = payload as Record<string, unknown> & {
      granted?: boolean;
    };
    return { ok: true, data: rest as T };
  }
  return { ok: true, data: payload as T };
}

// ── Read doors — LIVE ───────────────────────────────────────────────────────

/**
 * Which employers this person can do HR in, and the resolved active one.
 *
 * `p_organization_id` is a **uuid only** — the server does not resolve slugs. When
 * the caller holds a slug, `useHrContext` maps it through `employers[].slug` and
 * calls again. Passing null returns every employer plus, when there is exactly one,
 * that one as `active` — which is SPEC-UI-IA §1 rule 3 implemented server-side.
 *
 * An owner/admin sees an org whose module is OFF, because they are the one person
 * who can turn it on.
 */
export function fetchHrContext(
  organizationId?: string | null,
): Promise<HrResult<HrMyContext>> {
  return callHr<HrMyContext>(
    "hr_my_context",
    { p_organization_id: organizationId ?? null },
    { envelope: false, whatFailed: "Your HR employers" },
  );
}

/**
 * Route 10's one query. The scan is counted and paged from the same CTE, so `total`
 * is the size of the FULL result set — never "showing the first 100" (LAW 3).
 */
export function fetchHrDirectory(args: {
  organizationId: string;
  filter?: HrDirectoryFilter;
  limit?: number;
  offset?: number;
  sort?: HrDirectorySort;
  direction?: "asc" | "desc";
}): Promise<HrResult<HrDirectoryPage>> {
  return callHr<HrDirectoryPage>(
    "hr_directory_list",
    {
      p_organization_id: args.organizationId,
      p_filter: args.filter ?? {},
      p_limit: args.limit ?? 50,
      p_offset: args.offset ?? 0,
      p_sort: args.sort ?? "display_name",
      p_direction: args.direction ?? "asc",
    },
    { envelope: false, whatFailed: "The employee directory" },
  );
}

/**
 * Route 11. `on` is the as-of date — effective dating is what makes history real.
 * `history_available: false` means the as-of control is ABSENT, not disabled.
 */
export function fetchHrOrgChart(args: {
  organizationId: string;
  on?: string | null;
}): Promise<HrResult<HrOrgChart>> {
  return callHr<HrOrgChart>(
    "hr_org_chart",
    { p_organization_id: args.organizationId, p_on: args.on ?? null },
    { envelope: false, whatFailed: "The org chart" },
  );
}

/**
 * Routes 13/14 and route 2. Returns `{granted:false, reason:'not_reachable'}` for a
 * record the viewer has no lane to — **which never distinguishes "does not exist"
 * from "you may not see it"**. Do not add a client-side check that recovers the
 * difference; that is the leak the envelope exists to prevent.
 */
export function fetchHrEmployeeProfile(args: {
  employeeId: string;
  asOf?: string | null;
}): Promise<HrResult<HrEmployeeProfile>> {
  return callHr<HrEmployeeProfile>(
    "hr_employee_profile",
    { p_employee_id: args.employeeId, p_as_of: args.asOf ?? null },
    { envelope: true, whatFailed: "This employee record" },
  );
}

/** The Job tab's spells, assignments, reporting lines, external ids and engagements. */
export function fetchHrEmploymentHistory(
  employeeId: string,
): Promise<HrResult<HrEmploymentHistory>> {
  return callHr<HrEmploymentHistory>(
    "hr_employment_history",
    { p_employee_id: employeeId },
    { envelope: true, whatFailed: "This person's employment history" },
  );
}

/** §6.2 — every future-dated row for one employment, plus what is still in flight. */
export function fetchHrPendingChanges(
  employmentId: string,
): Promise<HrResult<HrPendingChanges>> {
  return callHr<HrPendingChanges>(
    "hr_pending_changes",
    { p_employment_id: employmentId },
    { envelope: true, whatFailed: "Pending changes" },
  );
}

/** Route 69's three tables, plus everything the other settings routes reference. */
export function fetchHrStructure(
  organizationId: string,
): Promise<HrResult<HrStructure>> {
  return callHr<HrStructure>(
    "hr_structure_list",
    { p_organization_id: organizationId },
    { envelope: false, whatFailed: "This employer's departments, locations and job titles" },
  );
}

/**
 * Route 67. Every configuration key with its effective value AND its origin.
 * A key whose `origin` is `missing` is rendered as a hard error naming the key —
 * a silent fallback is how a knob becomes a constant.
 */
export function fetchHrKnobs(args: {
  organizationId: string;
  overriddenOnly?: boolean;
}): Promise<HrResult<HrKnobIndex>> {
  return callHr<HrKnobIndex>(
    "hr_knob_index",
    {
      p_organization_id: args.organizationId,
      p_overridden_only: args.overriddenOnly ?? false,
    },
    { envelope: false, whatFailed: "This employer's HR settings" },
  );
}

// ── Audited confidential / restricted doors — LIVE ──────────────────────────

/**
 * One Confidential-tier row through the audited door. `purpose` is recorded; a read
 * without a real purpose is an audit finding, so callers pass what they are doing
 * ("profile", "verification_letter"), never a constant.
 */
export function fetchHrConfidential<T = Record<string, unknown>>(args: {
  token: string;
  id: string;
  purpose: string;
}): Promise<HrResult<{ row: T; audit_id: string | null }>> {
  return callHr<{ row: T; audit_id: string | null }>(
    "hr_confidential_get",
    { p_token: args.token, p_id: args.id, p_purpose: args.purpose },
    { envelope: true, whatFailed: "That record" },
  );
}

/**
 * The LIST half of the Confidential door (SPEC-EMPLOYEES §2.2 route 17).
 *
 * 🚨 THERE IS NO CLIENT-DIRECT SELECT ON A CONFIDENTIAL TABLE. `hr` is not in
 * PostgREST's exposed schema list, and even if it were, every read of this tier
 * must land in `hr.access_audit`. This door and `fetchHrConfidential` are the
 * only two ways a browser sees one of these rows.
 */
export function fetchHrConfidentialList<T = Record<string, unknown>>(args: {
  token: string;
  filter?: Record<string, unknown>;
  limit?: number;
  offset?: number;
  purpose: string;
}): Promise<HrResult<HrAuditedPage<T>>> {
  return callHr<HrAuditedPage<T>>(
    "hr_confidential_list",
    {
      p_token: args.token,
      p_filter: args.filter ?? {},
      p_limit: args.limit ?? 100,
      p_offset: args.offset ?? 0,
      p_purpose: args.purpose,
    },
    { envelope: true, whatFailed: "That list" },
  );
}

/**
 * The LIST half of the Restricted door (SPEC-EMPLOYEES §2.2 route 15).
 *
 * 🚨 THE SUBJECT EXCLUSION APPLIES TO THE LIST ITSELF. `hr.incident_excluded()`
 * is evaluated per row on the server, after every allow lane, and it overrides
 * `incident.read`, `hr_owner` and break-glass. An excluded row is not in `rows`
 * AND its count is not in `total`. A result count that changes with the viewer
 * is CORRECT here — never "fix" it with a viewer-independent cache.
 *
 * Unlike `fetchHrRestricted` (one row) this door takes no `justification`: a
 * queue read is not a targeted read of a named person's file. The `purpose` is
 * still recorded.
 */
export function fetchHrRestrictedList<T = Record<string, unknown>>(args: {
  token: string;
  filter?: Record<string, unknown>;
  limit?: number;
  offset?: number;
  purpose: string;
}): Promise<HrResult<HrAuditedPage<T>>> {
  return callHr<HrAuditedPage<T>>(
    "hr_restricted_list",
    {
      p_token: args.token,
      p_filter: args.filter ?? {},
      p_limit: args.limit ?? 100,
      p_offset: args.offset ?? 0,
      p_purpose: args.purpose,
    },
    { envelope: true, whatFailed: "That list" },
  );
}

/** A Restricted-tier row. `justification` is REQUIRED and is shown in the subject's access log. */
export function fetchHrRestricted<T = Record<string, unknown>>(args: {
  token: string;
  id: string;
  purpose: string;
  justification: string;
}): Promise<HrResult<{ row: T; audit_id: string | null }>> {
  return callHr<{ row: T; audit_id: string | null }>(
    "hr_restricted_get",
    {
      p_token: args.token,
      p_id: args.id,
      p_purpose: args.purpose,
      p_justification: args.justification,
    },
    { envelope: true, whatFailed: "That record" },
  );
}

/**
 * Break glass — the audited emergency door (§2.3.5). It notifies the org owner and
 * every `hr_owner` immediately and the surface must say when the grant expires.
 * This is a DOOR the user opens deliberately, never a toggle that quietly widens
 * what a page shows.
 */
export function hrBreakGlass(args: {
  token: string;
  id: string;
  purpose: string;
  justification: string;
}): Promise<HrResult<HrWriteAck>> {
  return callHr<HrWriteAck>(
    "hr_break_glass",
    {
      p_token: args.token,
      p_id: args.id,
      p_purpose: args.purpose,
      p_justification: args.justification,
    },
    { envelope: true, whatFailed: "The emergency access request" },
  );
}

/** Why this person can (or cannot) reach that record — the access-explain door. */
export function explainHrAccess(args: {
  userId: string;
  token: string;
  id: string;
}): Promise<HrResult<Record<string, unknown>>> {
  return callHr<Record<string, unknown>>(
    "hr_access_explain",
    { p_user: args.userId, p_token: args.token, p_id: args.id },
    { envelope: true, whatFailed: "The access explanation" },
  );
}

// ── Activation — LIVE ───────────────────────────────────────────────────────

/**
 * §2.4's three-step wizard, committed. Gated on org owner/admin — the ONE place org
 * standing confers HR standing — one-shot, audited, and refused once any `hr_owner`
 * assignment exists. `hr_my_context().active.can_activate` is the gate to render it.
 */
export function activateHrEmployer(
  payload: Record<string, unknown>,
): Promise<HrResult<HrWriteAck>> {
  return callHr<HrWriteAck>(
    "hr_activate_employer",
    { p_payload: payload },
    { envelope: true, whatFailed: "HR setup" },
  );
}

// ── Writes — SIGNATURES SHIPPING WITH THE L1 SERVER LANE ────────────────────
//
// 🚨 NOT LIVE YET (verified against `pg_proc` 2026-08-26). These are the agreed
// signatures; the server lane owner is shipping them. Every one returns the same
// envelope, so `HrResult` already covers them and no call site changes at cutover.
// A call made before the function exists comes back as `{kind:"failed"}` with
// Postgres's "could not find the function" — which is a real, visible error rather
// than a silent no-op, and that is the correct behaviour for a half-shipped lane.

export function createHrEmployee(
  payload: Record<string, unknown>,
): Promise<HrResult<HrWriteAck>> {
  return callHr<HrWriteAck>("hr_employee_create", { p_payload: payload }, {
    envelope: true,
    whatFailed: "Creating this employee",
  });
}

export function updateHrEmployee(args: {
  employeeId: string;
  patch: Record<string, unknown>;
}): Promise<HrResult<HrWriteAck>> {
  return callHr<HrWriteAck>(
    "hr_employee_update",
    { p_employee_id: args.employeeId, p_patch: args.patch },
    { envelope: true, whatFailed: "Saving this change" },
  );
}

/** Self-service. The field policy is enforced HERE, never by the client alone (§7.1). */
export function updateHrSelf(args: {
  token: string;
  id: string;
  patch: Record<string, unknown>;
}): Promise<HrResult<HrWriteAck>> {
  return callHr<HrWriteAck>(
    "hr_self_update",
    { p_token: args.token, p_id: args.id, p_patch: args.patch },
    { envelope: true, whatFailed: "Saving your change" },
  );
}

/** §4.2 promotion / reclass / FTE change, and §4.3 transfer. Both write a NEW row. */
export function recordHrPositionChange(
  payload: Record<string, unknown>,
): Promise<HrResult<HrWriteAck>> {
  return callHr<HrWriteAck>("hr_position_change", { p_payload: payload }, {
    envelope: true,
    whatFailed: "This position change",
  });
}

/** §4.4 pay change. Always the `pay_change` flow — no page approves a raise itself. */
export function upsertHrCompensation(
  payload: Record<string, unknown>,
): Promise<HrResult<HrWriteAck>> {
  return callHr<HrWriteAck>("hr_compensation_upsert", { p_payload: payload }, {
    envelope: true,
    whatFailed: "This compensation change",
  });
}

/**
 * §6.2 — cancel a future-dated row before its effective date. Soft-deletes the
 * future row and re-opens the prior row's `effective_to` in ONE audited action.
 * It is never a delete of history, and the cancellation is itself a recorded event.
 */
export function cancelHrPendingChange(args: {
  kind: "position" | "compensation" | "reporting_line";
  id: string;
  reason: string;
}): Promise<HrResult<HrWriteAck>> {
  return callHr<HrWriteAck>(
    "hr_pending_change_cancel",
    { p_kind: args.kind, p_id: args.id, p_reason: args.reason },
    { envelope: true, whatFailed: "Cancelling this scheduled change" },
  );
}

export function recordHrSeparation(
  payload: Record<string, unknown>,
): Promise<HrResult<HrWriteAck>> {
  return callHr<HrWriteAck>("hr_separation_record", { p_payload: payload }, {
    envelope: true,
    whatFailed: "This separation",
  });
}

export function upsertHrEngagement(
  payload: Record<string, unknown>,
): Promise<HrResult<HrWriteAck>> {
  return callHr<HrWriteAck>("hr_engagement_upsert", { p_payload: payload }, {
    envelope: true,
    whatFailed: "This engagement",
  });
}

export function upsertHrEmergencyContact(
  payload: Record<string, unknown>,
): Promise<HrResult<HrWriteAck>> {
  return callHr<HrWriteAck>("hr_emergency_contact_upsert", { p_payload: payload }, {
    envelope: true,
    whatFailed: "This emergency contact",
  });
}

export function upsertHrExternalIdentity(
  payload: Record<string, unknown>,
): Promise<HrResult<HrWriteAck>> {
  return callHr<HrWriteAck>("hr_external_identity_upsert", { p_payload: payload }, {
    envelope: true,
    whatFailed: "This external system id",
  });
}

/** §4.1 — is this person already here? Asked BEFORE a create, never after. */
export function scanHrDuplicates(args: {
  organizationId: string;
  probe: Record<string, unknown>;
}): Promise<HrResult<Record<string, unknown>>> {
  return callHr<Record<string, unknown>>(
    "hr_duplicate_scan",
    { p_organization_id: args.organizationId, p_probe: args.probe },
    { envelope: true, whatFailed: "The duplicate check" },
  );
}

export function createHrIncident(
  payload: Record<string, unknown>,
): Promise<HrResult<HrWriteAck>> {
  return callHr<HrWriteAck>("hr_incident_create", { p_payload: payload }, {
    envelope: true,
    whatFailed: "This incident report",
  });
}

export function issueHrCorrectiveAction(
  payload: Record<string, unknown>,
): Promise<HrResult<HrWriteAck>> {
  return callHr<HrWriteAck>("hr_corrective_action_issue", { p_payload: payload }, {
    envelope: true,
    whatFailed: "This corrective action",
  });
}

export function createHrVerificationRequest(
  payload: Record<string, unknown>,
): Promise<HrResult<HrWriteAck>> {
  return callHr<HrWriteAck>("hr_verification_request_create", { p_payload: payload }, {
    envelope: true,
    whatFailed: "This verification request",
  });
}

// ── Employee relations — the case-working doors (SPEC-EMPLOYEES §2.2 route 16)
//
// Same NOT-LIVE caveat as the block above. Every one of these is a write to a
// RESTRICTED-tier record, so every one is audited server-side and every one
// re-runs the veto: a call that succeeded a minute ago can legitimately refuse
// now, because adding an `accused` party re-materializes the exclusion set in
// the SAME transaction and the new respondent loses reach immediately —
// including when the new respondent is the caller.

/** Advance one incident: `intake → investigating → action_pending → resolved → closed`; `referred` from any state. */
export function advanceHrIncident(args: {
  incidentId: string;
  toState: string;
  /** REQUIRED to reach `resolved`. The server refuses without it. */
  resolutionSummary?: string | null;
  /** REQUIRED to reach `closed`. Starts the retention clock. */
  resolvedAt?: string | null;
  referralNote?: string | null;
}): Promise<HrResult<HrWriteAck>> {
  return callHr<HrWriteAck>(
    "hr_incident_advance",
    {
      p_incident_id: args.incidentId,
      p_to_state: args.toState,
      p_resolution_summary: args.resolutionSummary ?? null,
      p_resolved_at: args.resolvedAt ?? null,
      p_referral_note: args.referralNote ?? null,
    },
    { envelope: true, whatFailed: "Advancing this case" },
  );
}

/**
 * Add one party to an incident. Either `employmentId` or `externalName` is
 * required — a witness who does not work here is still a witness.
 *
 * 🚨 Adding an `accused` party re-materializes `hr.incident.excluded_actor_ids`
 * in the SAME transaction. If the caller is the person just accused, THIS CALL
 * SUCCEEDS AND THEIR NEXT READ REFUSES. The surface must handle that by
 * redirecting with a neutral message, never by explaining what happened.
 */
export function addHrIncidentParty(args: {
  incidentId: string;
  role: string;
  employmentId?: string | null;
  externalName?: string | null;
  note?: string | null;
}): Promise<HrResult<HrWriteAck>> {
  return callHr<HrWriteAck>(
    "hr_incident_party_add",
    {
      p_incident_id: args.incidentId,
      p_role: args.role,
      p_employment_id: args.employmentId ?? null,
      p_external_name: args.externalName ?? null,
      p_note: args.note ?? null,
    },
    { envelope: true, whatFailed: "Adding this party" },
  );
}

/** A restricted note. Reachable through its OWN owner lane only — no org admin can read one. */
export function addHrRestrictedNote(args: {
  targetToken: string;
  targetId: string;
  noteKind: string;
  body: string;
  redactedSummary?: string | null;
}): Promise<HrResult<HrWriteAck>> {
  return callHr<HrWriteAck>(
    "hr_restricted_note_add",
    {
      p_target_token: args.targetToken,
      p_target_id: args.targetId,
      p_note_kind: args.noteKind,
      p_body: args.body,
      p_redacted_summary: args.redactedSummary ?? null,
    },
    { envelope: true, whatFailed: "Saving this note" },
  );
}

/**
 * OSHA recordability. 🚨 A HUMAN DECISION WITH A RULES ASSIST, NEVER AUTO-SET.
 * `oshaPrivacyCase` suppresses the name in the 300-log rendering.
 */
export function setHrOshaDetermination(args: {
  incidentId: string;
  recordable: boolean;
  privacyCase: boolean;
  basis: string;
}): Promise<HrResult<HrWriteAck>> {
  return callHr<HrWriteAck>(
    "hr_incident_osha_set",
    {
      p_incident_id: args.incidentId,
      p_osha_recordable: args.recordable,
      p_osha_privacy_case: args.privacyCase,
      p_basis: args.basis,
    },
    { envelope: true, whatFailed: "Recording the OSHA determination" },
  );
}

/**
 * Record how a corrective action was acknowledged — or that it was REFUSED.
 *
 * 🚨 A REFUSAL TO ACKNOWLEDGE IS A VALID OUTCOME, recorded as such, never a
 * stuck flow. And `employeeStatement` is THE EMPLOYEE'S OWN WORDS: the issuer
 * can never edit it, which is why it only ever travels on the subject's own
 * call and never on an issuer's patch.
 */
export function acknowledgeHrCorrectiveAction(args: {
  correctiveActionId: string;
  kind: "esign" | "wet_signature" | "verbal_witnessed" | "refused";
  witnessEmploymentId?: string | null;
  signedFileId?: string | null;
  employeeStatement?: string | null;
  refusalNote?: string | null;
}): Promise<HrResult<HrWriteAck>> {
  return callHr<HrWriteAck>(
    "hr_corrective_action_acknowledge",
    {
      p_corrective_action_id: args.correctiveActionId,
      p_kind: args.kind,
      p_witness_employment_id: args.witnessEmploymentId ?? null,
      p_signed_file_id: args.signedFileId ?? null,
      p_employee_statement: args.employeeStatement ?? null,
      p_refusal_note: args.refusalNote ?? null,
    },
    { envelope: true, whatFailed: "Recording the acknowledgment" },
  );
}

/** Close the loop: `resolved | escalated | expired | rescinded | led_to_separation`. */
export function recordHrCorrectiveActionOutcome(args: {
  correctiveActionId: string;
  outcome: string;
  note?: string | null;
}): Promise<HrResult<HrWriteAck>> {
  return callHr<HrWriteAck>(
    "hr_corrective_action_outcome",
    {
      p_corrective_action_id: args.correctiveActionId,
      p_outcome: args.outcome,
      p_note: args.note ?? null,
    },
    { envelope: true, whatFailed: "Recording this outcome" },
  );
}

/**
 * What the REPORTER may see: state, last-updated, and the declared next step.
 * **Nothing from the notes, ever.** This is a separate door precisely so the
 * notes cannot leak through a widened case read.
 */
export function fetchHrIncidentStatus(
  incidentId: string,
): Promise<HrResult<Record<string, unknown>>> {
  return callHr<Record<string, unknown>>(
    "hr_incident_status",
    { p_incident_id: incidentId },
    { envelope: true, whatFailed: "The status of your report" },
  );
}

// ── Verification letters (SPEC-EMPLOYEES §4.9) ──────────────────────────────
//
// Generation is NOT here — it is `POST /api/hr/verification-letters/{id}/generate`
// on aidream, because a letter is a rendered PDF frozen into `files.files`.
// See `features/hr/people/verifications/service.ts`.

/** The subject grants or withholds consent. A withheld consent is itself the record. */
export function setHrVerificationConsent(args: {
  letterId: string;
  granted: boolean;
  note?: string | null;
}): Promise<HrResult<HrWriteAck>> {
  return callHr<HrWriteAck>(
    "hr_verification_consent_set",
    {
      p_letter_id: args.letterId,
      p_granted: args.granted,
      p_note: args.note ?? null,
    },
    { envelope: true, whatFailed: "Recording your consent decision" },
  );
}

/** Deny a request with a basis. A request for someone who never worked here ends HERE. */
export function denyHrVerification(args: {
  letterId: string;
  denialBasis: string;
  note?: string | null;
}): Promise<HrResult<HrWriteAck>> {
  return callHr<HrWriteAck>(
    "hr_verification_deny",
    {
      p_letter_id: args.letterId,
      p_denial_basis: args.denialBasis,
      p_note: args.note ?? null,
    },
    { envelope: true, whatFailed: "Denying this request" },
  );
}

/** Record delivery: `token_link | email | mail | in_person`. */
export function deliverHrVerification(args: {
  letterId: string;
  method: string;
  recipient?: string | null;
}): Promise<HrResult<HrWriteAck>> {
  return callHr<HrWriteAck>(
    "hr_verification_deliver",
    {
      p_letter_id: args.letterId,
      p_method: args.method,
      p_recipient: args.recipient ?? null,
    },
    { envelope: true, whatFailed: "Recording the delivery" },
  );
}

// ── Route 3 — my own compensation (SPEC-EMPLOYEES §2.1) ─────────────────────

/**
 * The caller's OWN pay: the current stack as of today, plus the full history.
 *
 * ⚠️ WHY A SEPARATE DOOR AND NOT `hr_confidential_list('hr_compensation', …)`.
 * That door filters by `organization_id` only, so reading one person's pay
 * through it records a WHOLE-ORG audited list read against the caller — for a
 * viewer who is entitled to exactly one row. That corrupts the audit trail this
 * tier exists to produce, and the subject's own access log would show them
 * apparently reading everybody's pay. A self-scoped door is the honest shape.
 *
 * 🚨 IT RETURNS EVERY CONCURRENT COMPONENT SEPARATELY. Base, shift differential
 * and any allowance each keep their own window. Nothing sums them, here or
 * anywhere downstream — a summed figure is not true on any day and somebody
 * will quote it in a wage claim.
 *
 * A person with NO compensation row (a volunteer) gets a refusal, and the nav
 * item is ABSENT for them — never an empty pay page.
 */
export function fetchHrMyCompensation(args: {
  employmentId: string;
  asOf?: string | null;
}): Promise<
  HrResult<{
    as_of: string;
    /** Concurrent components in force on `as_of`. Never summed. */
    current: Record<string, unknown>[];
    /** Every row, `effective_from desc`, including approved-but-future ones. */
    history: Record<string, unknown>[];
    currency: string | null;
  }>
> {
  return callHr(
    "hr_my_compensation",
    { p_employment_id: args.employmentId, p_as_of: args.asOf ?? null },
    { envelope: true, whatFailed: "Your pay record" },
  );
}

/**
 * Is this CRM party an employee here? (SPEC-UI-IA §6, `PartyRecordPage`.)
 *
 * `hr.employee` is 1:1 with `crm.party`, but the directory door filters by
 * NAME, not by party id — searching the directory for a uuid would silently
 * match nothing and the card would render "not an employee" for somebody who
 * is. So the seam gets its own door rather than a lookup that looks right and
 * is wrong.
 *
 * Returns DIRECTORY-TIER FIELDS ONLY. Nothing confidential may reach a CRM
 * surface; that is a separate, audited read on a different page. A refusal —
 * or a party who is not an employee — renders the card as ABSENT.
 */
export function fetchHrEmployeeByParty(args: {
  organizationId: string;
  partyId: string;
}): Promise<
  HrResult<{
    employee_id: string | null;
    display_name: string | null;
    directory_status: string | null;
    job_title: string | null;
    department: string | null;
    manager_employee_id: string | null;
    manager_name: string | null;
    hire_date: string | null;
  }>
> {
  return callHr(
    "hr_employee_by_party",
    { p_organization_id: args.organizationId, p_party_id: args.partyId },
    { envelope: true, whatFailed: "This person's employee record" },
  );
}

// ── The member ⇄ employee seam (SPEC-UI-IA §6, MemberManagement) ────────────

/**
 * Which org members have an `hr.employee` here.
 *
 * A member and an employee are related but DISTINCT, and `hr.employee` is not
 * PostgREST-reachable, so this is the only way the members list can draw the
 * seam. Until this door ships, the seam renders ABSENT rather than a broken
 * link — which is the correct fallback under §1.3 anyway.
 */
export function fetchHrMemberEmployeeLinks(args: {
  organizationId: string;
  userIds: string[];
}): Promise<
  HrResult<{
    links: {
      user_id: string;
      employee_id: string | null;
      display_name: string | null;
      directory_status: string | null;
      /** true when someone explicitly marked this member as not an employee. */
      marked_not_employee: boolean;
    }[];
    can_link: boolean;
  }>
> {
  return callHr(
    "hr_member_employee_links",
    { p_organization_id: args.organizationId, p_user_ids: args.userIds },
    { envelope: true, whatFailed: "The employee links for these members" },
  );
}

/**
 * Headcount + module state for one org, cheap enough for an org-settings card
 * and an org-workspace strip that are NOT inside the HR shell.
 *
 * Deliberately not `hr_directory_list` with `limit: 0`: those surfaces must
 * render for an owner/admin who holds no HR capability at all, and a directory
 * read would refuse for them.
 */
export function fetchHrOrgSummary(
  organizationId: string,
): Promise<
  HrResult<{
    organization_id: string;
    module_enabled: boolean;
    is_activated: boolean;
    headcount: number;
    prehire_count: number;
    pending_approvals: number;
    can_enable: boolean;
  }>
> {
  return callHr(
    "hr_org_summary",
    { p_organization_id: organizationId },
    { envelope: true, whatFailed: "This organization's HR summary" },
  );
}

/** Route 69's writes — departments, locations, job titles, and the rest of §2.4. */
export function upsertHrStructure(args: {
  kind: string;
  payload: Record<string, unknown>;
}): Promise<HrResult<HrWriteAck>> {
  return callHr<HrWriteAck>(
    "hr_structure_upsert",
    { p_kind: args.kind, p_payload: args.payload },
    { envelope: true, whatFailed: "Saving this" },
  );
}

/** Set an org override on one configuration key (§10 / D13). */
export function setHrKnob(args: {
  organizationId: string;
  feature: string;
  key: string;
  value: unknown;
}): Promise<HrResult<HrWriteAck>> {
  return callHr<HrWriteAck>(
    "hr_knob_set",
    {
      p_organization_id: args.organizationId,
      p_feature: args.feature,
      p_key: args.key,
      p_value: args.value,
    },
    { envelope: true, whatFailed: "Saving this setting" },
  );
}

/** Clear an override — which REMOVES the key, never writes a null. */
export function clearHrKnob(args: {
  organizationId: string;
  feature: string;
  key: string;
}): Promise<HrResult<HrWriteAck>> {
  return callHr<HrWriteAck>(
    "hr_knob_clear",
    {
      p_organization_id: args.organizationId,
      p_feature: args.feature,
      p_key: args.key,
    },
    { envelope: true, whatFailed: "Clearing this override" },
  );
}
