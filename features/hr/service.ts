// features/hr/service.ts
//
// EVERY HR READ AND WRITE THE BROWSER MAKES. One typed function per shipped RPC.
//
// 🚨 THE `hr` SCHEMA IS NOT EXPOSED TO PostgREST (verified live 2026-08-26 —
// `authenticator`'s `pgrst.db_schemas` carries neither `hr` nor `esign`). So
// `supabase.from("hr.employee")` and `supabase.schema("hr")` do not work from a
// browser and never will. Every door is a `public.hr_*` SECURITY DEFINER function
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
): HrResult<never> {
  return { ok: false, kind: "denied", reason, detail: detail ?? null, auditId: auditId ?? null };
}

function failed(message: string, code?: string | null): HrResult<never> {
  return { ok: false, kind: "failed", message, code: code ?? null };
}

function isRefusalEnvelope(value: unknown): value is HrRefusalEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    "granted" in value &&
    (value as { granted: unknown }).granted === false
  );
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
    return denied(payload.reason, payload.detail, payload.audit_id);
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
