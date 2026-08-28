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

import { HR_SELF_SERVICE_POLICY } from "./selfServicePolicy.generated";

/** The four policies. `read_only` is a computed value, not a permission. */
export type HrSelfServicePolicy =
  | "free"
  | "request_approval"
  | "hr_only"
  | "read_only";

/**
 * 🚨 THE HINT NO LONGER HAS ITS OWN OPINION.
 *
 * This used to be a hand-kept table, and it disagreed with the doors FOUR times:
 * legal names said `hr_only` where the door accepted a request; `work_phone` said
 * `hr_only` where the door applied it freely; `work_permit_type` was not a column
 * name at all (`work_authorization_kind` is); and `worker_class` claimed HR holds
 * a field that is not on the employee record — it lives on the position
 * assignment. Each was the same defect: a second copy of a rule the database
 * already states, and each failed SILENTLY, because a hint stricter than the
 * boundary renders a padlock over a capability nobody can reach and the server is
 * never asked.
 *
 * `HR_SELF_SERVICE_POLICY` is now GENERATED from the two sources the door itself
 * reads — the catalog for existence, `hr.field_policy` for policy — by
 * `scripts/hr/generate_self_service_policy.py`. It is still a RENDERING HINT and
 * still never the boundary; it simply can no longer hold a different opinion.
 */

/**
 * The policy for one column ON ONE TOKEN, or `null` when the column does not exist
 * on that token's table.
 *
 * 🚨 `null` IS A DIFFERENT ANSWER FROM `hr_only` AND MUST NOT BE COLLAPSED INTO IT.
 * `hr_only` means the field is real and HR holds it — render it read-only with
 * "contact HR". `null` means there is no such field on this record, which is what
 * the door says in words, and the surface should render nothing at all. Treating
 * the second as the first is exactly how `worker_class` got a padlock.
 */
export function selfServicePolicyFor(
  token: string,
  field: string,
): HrSelfServicePolicy | null {
  // The address law wins over anything the table says, in both directions: an org
  // override to `free` is rejected by the server's own validation predicate.
  if (HR_ADDRESS_FIELDS.has(field)) return "request_approval";
  return HR_SELF_SERVICE_POLICY[token]?.[field] ?? null;
}

/**
 * 🚨 THE ADDRESS FIELDS. An org override to `free` is rejected by the server's
 * validation predicate — this set is the client's matching refusal to offer it.
 */
export const HR_ADDRESS_FIELDS: ReadonlySet<string> = new Set([
  "home_address",
  "mailing_address",
]);

export function resolveSelfServicePolicy(
  token: string,
  field: string,
  overrides?: Record<string, HrSelfServicePolicy> | null,
): HrSelfServicePolicy {
  // The address law wins over any override, in both directions.
  if (HR_ADDRESS_FIELDS.has(field)) return "request_approval";
  // Fail closed on an unknown pair — but callers that must tell "held by HR" from
  // "not a field here" should use `selfServicePolicyFor`, which keeps them apart.
  return overrides?.[field] ?? selfServicePolicyFor(token, field) ?? "hr_only";
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

/**
 * Names a column carries in a sentence somebody reads. The mechanical rule —
 * strip `_id`, swap underscores, capitalise — is right for most fields and
 * WRONG whenever the column name is not the thing's name.
 *
 * 🚨 `photo_file_id` was rendering as "Photo file", so a successful save said
 * "Photo file updated." A person has a photo; the file is our storage detail
 * leaking into their sentence. Override the ones where that happens rather than
 * teaching every call site to special-case them.
 */
const HR_FIELD_LABELS: Record<string, string> = {
  photo_file_id: "Photo",
  ssn_last4: "Social Security number",
  directory_opt_out: "Directory listing",
};

export function humanFieldName(field: string): string {
  const override = HR_FIELD_LABELS[field];
  if (override) return override;
  return field
    .replace(/_id$/, "")
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}
