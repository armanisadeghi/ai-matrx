// GENERATED FILE — DO NOT EDIT BY HAND.
//   source: scripts/hr/generate_self_service_policy.py
//   from:   information_schema.columns (existence) + hr.field_policy (policy)
//
// 🚨 THIS FILE EXISTS SO THE CLIENT HINT CANNOT DISAGREE WITH THE DOOR.
// The hand-kept table it replaces was wrong four separate times — legal names, work_phone,
// work_permit_type (never a real column), and worker_class (which is not on the employee
// record at all; it lives on the position assignment). Each was a second copy of a rule the
// database already states, and each failed SILENTLY, because a hint stricter than the
// boundary renders a padlock over a capability nobody can reach and the server is never
// asked.
//
// KEYED BY TOKEN, deliberately. A flat column-name map is what made `worker_class` look
// like a field of the employee record; the same name means different things on different
// tables, and only the pair (token, column) has an answer.
//
// A column ABSENT from a token's block does not exist on that table, which is exactly what
// the door means by "… is not a field on your record". A column PRESENT with `hr_only` may
// exist and be held by HR — the two are different answers and the UI renders them
// differently, so they must not be collapsed.

import type { HrSelfServicePolicy } from "./selfServicePolicy";

export const HR_SELF_SERVICE_POLICY: Record<
  string,
  Record<string, HrSelfServicePolicy>
> = {
  // hr.employee — 36 columns
  hr_employee: {
    created_at: "hr_only",
    created_by: "hr_only",
    current_department_id: "hr_only",
    current_employment_id: "hr_only",
    current_job_title_id: "hr_only",
    current_manager_employee_id: "hr_only",
    current_position_assignment_id: "hr_only",
    custom: "hr_only",
    deleted_at: "hr_only",
    directory_opt_out: "free",
    display_name: "hr_only",
    employee_number: "hr_only",
    former_names: "hr_only",
    id: "hr_only",
    legal_first_name: "request_approval",
    legal_hold_count: "hr_only",
    legal_last_name: "request_approval",
    legal_middle_name: "request_approval",
    legal_name_suffix: "hr_only",
    login_user_id: "hr_only",
    metadata: "hr_only",
    organization_id: "hr_only",
    party_id: "hr_only",
    photo_file_id: "free",
    preferred_first_name: "free",
    preferred_last_name: "free",
    primary_location_id: "hr_only",
    pronouns: "free",
    record_class_key: "hr_only",
    retention_trigger_at: "hr_only",
    updated_at: "hr_only",
    updated_by: "hr_only",
    version: "hr_only",
    visibility: "hr_only",
    work_email: "hr_only",
    work_phone: "free",
  },
  // hr.employee_private — 28 columns
  hr_employee_private: {
    created_at: "hr_only",
    created_by: "hr_only",
    date_of_birth: "request_approval",
    deleted_at: "hr_only",
    employee_id: "hr_only",
    home_address: "request_approval",
    home_address_effective_from: "hr_only",
    id: "hr_only",
    legal_hold_count: "hr_only",
    mailing_address: "request_approval",
    metadata: "hr_only",
    national_id_ciphertext: "hr_only",
    national_id_kind: "hr_only",
    organization_id: "hr_only",
    personal_email: "free",
    personal_phone: "free",
    record_class_key: "hr_only",
    retention_trigger_at: "hr_only",
    ssn_ciphertext: "hr_only",
    ssn_hmac: "hr_only",
    ssn_key_id: "hr_only",
    ssn_last4: "hr_only",
    updated_at: "hr_only",
    updated_by: "hr_only",
    version: "hr_only",
    visibility: "hr_only",
    work_authorization_expires_on: "request_approval",
    work_authorization_kind: "request_approval",
  },
  // hr.emergency_contact — 19 columns
  hr_emergency_contact: {
    address: "free",
    alt_phone: "free",
    created_at: "hr_only",
    created_by: "hr_only",
    deleted_at: "hr_only",
    email: "free",
    employee_id: "hr_only",
    full_name: "free",
    id: "hr_only",
    is_primary: "hr_only",
    metadata: "hr_only",
    organization_id: "hr_only",
    phone: "free",
    position: "hr_only",
    relationship_category_id: "hr_only",
    updated_at: "hr_only",
    updated_by: "hr_only",
    version: "hr_only",
    visibility: "hr_only",
  },
};
