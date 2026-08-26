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

  // hr_only
  legal_first_name: "hr_only",
  legal_middle_name: "hr_only",
  legal_last_name: "hr_only",
  legal_name_suffix: "hr_only",
  date_of_birth: "hr_only",
  work_permit_type: "hr_only",
  work_authorization_expires_on: "hr_only",
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
  work_phone: "hr_only",
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

/** What `hr_self_update` returns when it accepted (some of) the patch. */
export type HrSelfUpdateAck = {
  ok: true;
  /** Field keys written immediately (the `free` half). */
  applied: string[];
  /** Field keys that became requests instead (the `request_approval` half). */
  requested: string[];
  requests: { instance_id: string; flow_key: string; fields: string[] }[];
};

export function isSelfUpdateAck(value: unknown): value is HrSelfUpdateAck {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return record.ok === true && Array.isArray(record.applied);
}

/** Turn `home_address` into "Home address" for a sentence a person reads. */
export function humanFieldName(field: string): string {
  return field
    .replace(/_id$/, "")
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}
