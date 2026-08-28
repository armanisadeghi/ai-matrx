// features/hr/me/selfServicePolicy.ts
//
// SELF-SERVICE, THE FIELD POLICY (SPEC-EMPLOYEES §7.1).
//
// 🚨 THREE POLICIES, ENFORCED IN THREE PLACES, AND THE CLIENT IS **UX ONLY**.
//
//   1. Client (this file + `SelfServiceField`): each field renders editable ·
//      editable-with-"needs approval" · read-only-with-"contact HR".
//   2. `hr_self_update` — THE single write path. It splits the patch: `free`
//      keys apply immediately, `request_approval` keys create one workflow
//      request each and apply NOTHING, `hr_only`/`read_only` keys are REJECTED
//      NAMING EACH OFFENDING FIELD. Unknown keys are rejected, never ignored.
//   3. RLS backstop — the subject holds the read lane only.
//
// So the table below is a RENDERING HINT and never a decision. A field this
// file gets wrong is refused by the server and named in the refusal; a field
// this file is missing is refused as `unknown`, not silently dropped.
//
// 🚨 THE ADDRESS EXCEPTION IS A LAW, NOT A DEFAULT. Home and mailing address
// are `request_approval` and an org override to `free` is REJECTED BY THE
// VALIDATION PREDICATE — an address change is a jurisdiction change. And it
// routes to `hr_admin`, NOT the manager: home address is Confidential tier and
// a manager holds no `identity.read`.

/** The four policies. `read_only` is a computed value, not a permission. */
export type HrSelfServicePolicy =
  | "free"
  | "request_approval"
  | "hr_only"
  | "read_only";

/**
 * The platform defaults from §7.1's table. The EFFECTIVE policy is the org's
 * `hr.identity.self_service_field_policy` knob, which arrives with the profile
 * payload once the server carries it; until then this table is the hint and the
 * server is the boundary.
 */
export const HR_SELF_SERVICE_DEFAULTS: Record<string, HrSelfServicePolicy> = {
  // free
  preferred_first_name: "free",
  preferred_last_name: "free",
  pronouns: "free",
  personal_email: "free",
  personal_phone: "free",
  photo_file_id: "free",
  directory_opt_out: "free",

  // request_approval — and address is the one that cannot be loosened
  home_address: "request_approval",
  mailing_address: "request_approval",

  /*
    🚨 THESE ARE `request_approval`, NOT `hr_only` — CORRECTED 2026-08-27 AGAINST THE
    SEEDED `hr.field_policy` ROWS. The platform rows say `self_request_approval` with
    `approver_action_type = 'profile_change_approve'`, and `hr_self_update` routes them
    accordingly. This table said `hr_only`, which is the WRONG DIRECTION of wrong: it
    rendered "contact HR" over a field the server would have accepted as a request, so
    a person correcting a misspelled legal name was told to go and ask somebody instead
    of asking through the form that exists for it.

    A hint that is stricter than the boundary is not "safe" — it is a capability nobody
    can reach, and it fails silently because the server is never asked.
  */
  legal_first_name: "request_approval",
  legal_middle_name: "request_approval",
  legal_last_name: "request_approval",
  legal_name_suffix: "hr_only",
  // Seeded `self_request_approval` (profile_change_approve) — see the note above.
  date_of_birth: "request_approval",
  work_permit_type: "request_approval",
  work_authorization_expires_on: "request_approval",
  ssn_last4: "hr_only",
  employee_number: "hr_only",
  hire_date: "hr_only",
  termination_date: "hr_only",
  job_title_id: "hr_only",
  department_id: "hr_only",
  location_id: "hr_only",
  flsa_status: "hr_only",
  worker_class: "hr_only",
  manager_employment_id: "hr_only",
  work_email: "hr_only",
  /*
    🚨 `work_phone` IS `self_free`, AND SAYING `hr_only` HERE LOCKED IT FOR NOTHING —
    CORRECTED 2026-08-27 against the seeded row (`hr_employee.work_phone = self_free`),
    proved by calling the door: it APPLIED a new work phone immediately.

    This is the third time this exact mistake has been found in this table, and it is
    always the same shape: a hint STRICTER than the boundary. It never fails loudly —
    it renders a padlock and "Contact HR to change this" over a field the server would
    have taken, so the capability is unreachable and nobody sees an error, because the
    server is never asked. Seven controls rendered where eight fields were editable,
    and the missing one looked deliberate.
  */
  work_phone: "free",
};

/**
 * 🚨 THE ADDRESS FIELDS. An org override to `free` is rejected by the server's
 * validation predicate — this set is the client's matching refusal to offer it.
 */
export const HR_ADDRESS_FIELDS: ReadonlySet<string> = new Set([
  "home_address",
  "mailing_address",
]);

export function resolveSelfServicePolicy(
  field: string,
  overrides?: Record<string, HrSelfServicePolicy> | null,
): HrSelfServicePolicy {
  // The address law wins over any override, in both directions.
  if (HR_ADDRESS_FIELDS.has(field)) return "request_approval";
  return overrides?.[field] ?? HR_SELF_SERVICE_DEFAULTS[field] ?? "hr_only";
}

/**
 * Who decides an approval for this field.
 *
 * 🚨 AN ADDRESS CHANGE GOES TO `hr_admin`, NOT THE MANAGER — deliberately. Home
 * address is Confidential tier and a manager holds no `identity.read`, so
 * routing it to them would hand a manager a field they may not read. Governed
 * by `hr.address_change_approver`, platform default `hr_admin`.
 */
export function approverForField(field: string): "hr_admin" | "manager" {
  return HR_ADDRESS_FIELDS.has(field) ? "hr_admin" : "hr_admin";
}

/** The workflow a change to this field opens. Address moves jurisdiction, so it has its own. */
export function flowKeyForField(field: string): "address_change" | "profile_edit_request" {
  return HR_ADDRESS_FIELDS.has(field) ? "address_change" : "profile_edit_request";
}

export const HR_SELF_SERVICE_HINTS: Record<HrSelfServicePolicy, string | null> = {
  free: null,
  request_approval: "Needs approval",
  hr_only: "Contact HR to change this",
  read_only: "Worked out from your records",
};

/**
 * The refusal `hr_self_update` returns when the patch touched something it will
 * not take. 🚨 EVERY OFFENDING FIELD IS NAMED. "Some fields could not be saved"
 * is the exact defect this shape replaces.
 */
export type HrSelfUpdateRefusal = {
  ok: false;
  reason: "fields_not_self_writable";
  rejected: { field: string; policy: string }[];
  unknown: string[];
};

export function isSelfUpdateRefusal(
  value: unknown,
): value is HrSelfUpdateRefusal {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return record.ok === false && record.reason === "fields_not_self_writable";
}

/**
 * What `hr_self_update` returns when it accepted (some of) the patch.
 *
 * 🚨 `applied` AND `requested` ARE OBJECTS KEYED BY FIELD, NOT ARRAYS OF NAMES.
 * They were declared as `string[]` and never checked against the door, so
 * `isSelfUpdateAck` demanded `Array.isArray(applied)` and answered false on every
 * SUCCESSFUL save — and the hook then told the person *"The change came back in a
 * shape this app does not understand"* about a change that had just been written
 * and audited. Verified against the live envelope, which is:
 *
 *     {"ok": true, "applied": {"directory_opt_out": true},
 *      "requested": {}, "requests": [], "audit_id": "…"}
 *
 * The server sends the VALUES as well as the names because the split is per key —
 * `v_free` and `v_req` are the two halves of the patch it actually acted on. The
 * field names are the keys, which is what every message here needs.
 */
export type HrSelfUpdateAck = {
  ok: true;
  /** Field → value, written immediately (the `free`/`self_free` half). */
  applied: Record<string, unknown>;
  /** Field → value, turned into requests instead (the `request_approval` half). */
  requested: Record<string, unknown>;
  requests: { action_type: string; instance: unknown }[];
  audit_id?: string | null;
};

/** The field names out of either half, in the order the server sent them. */
export function selfUpdateFields(half: Record<string, unknown> | undefined): string[] {
  return half ? Object.keys(half) : [];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function isSelfUpdateAck(value: unknown): value is HrSelfUpdateAck {
  if (!isPlainObject(value)) return false;
  // `applied` is an object; an ARRAY here is the old wrong shape and must not pass.
  return value.ok === true && isPlainObject(value.applied);
}

/** Turn `home_address` into "Home address" for a sentence a person reads. */
export function humanFieldName(field: string): string {
  return field
    .replace(/_id$/, "")
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}
