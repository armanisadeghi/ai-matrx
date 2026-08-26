// features/hr/people/verifications/types.ts
//
// VERIFICATION LETTERS (SPEC-EMPLOYEES §2.2 route 17, §4.9).
//
// 🚨 A LETTER IS AN ASSERTION THE ORGANIZATION IS HELD TO. Everything in this
// module follows from that one sentence:
//
//   • Generation FREEZES the assertion into `snapshot` jsonb. The letter does
//     not re-derive itself later; it says what was true on its stated as-of
//     date, forever.
//   • A regenerate writes a NEW ROW, never an edit. A delivered letter has been
//     relied on by a lender or an agency and cannot be quietly changed.
//   • Income needs CONSENT, enforced three times: a table CHECK, the aidream
//     endpoint, and the UI. Three, because any one of them alone has failed
//     somewhere before.

export const HR_VERIFICATION_STATES = [
  "received",
  "awaiting-consent",
  "generated",
  "delivered",
  "denied",
  "expired",
] as const;
export type HrVerificationState = (typeof HR_VERIFICATION_STATES)[number];

export const HR_VERIFICATION_STATE_LABELS: Record<HrVerificationState, string> = {
  received: "Received",
  "awaiting-consent": "Awaiting consent",
  generated: "Generated",
  delivered: "Delivered",
  denied: "Denied",
  expired: "Expired",
};

/** The server writes snake_case; the route vocabulary is kebab. */
export function toVerificationState(raw: string): HrVerificationState {
  const normalized = raw.replace(/_/g, "-") as HrVerificationState;
  return normalized in HR_VERIFICATION_STATE_LABELS ? normalized : "received";
}

export const HR_VERIFICATION_SOURCES = [
  "employee",
  "third_party",
  "agency",
  "lender",
] as const;
export type HrVerificationSource = (typeof HR_VERIFICATION_SOURCES)[number];

export const HR_VERIFICATION_SOURCE_LABELS: Record<HrVerificationSource, string> = {
  employee: "The employee",
  third_party: "A third party",
  agency: "An agency",
  lender: "A lender",
};

export const HR_VERIFICATION_KINDS = [
  "employment",
  "employment_and_income",
  "income",
] as const;
export type HrVerificationKind = (typeof HR_VERIFICATION_KINDS)[number];

export const HR_VERIFICATION_KIND_LABELS: Record<HrVerificationKind, string> = {
  employment: "Employment only",
  employment_and_income: "Employment and income",
  income: "Income only",
};

/** Income in any form pulls in the consent gate. */
export function includesCompensation(kind: HrVerificationKind): boolean {
  return kind === "employment_and_income" || kind === "income";
}

export const HR_VERIFICATION_DELIVERY_METHODS = [
  "token_link",
  "email",
  "mail",
  "in_person",
] as const;
export type HrVerificationDeliveryMethod =
  (typeof HR_VERIFICATION_DELIVERY_METHODS)[number];

export const HR_VERIFICATION_DELIVERY_LABELS: Record<
  HrVerificationDeliveryMethod,
  string
> = {
  token_link: "Secure link",
  email: "Email",
  mail: "Post",
  in_person: "In person",
};

/**
 * Why a request was denied. The denial IS the record — a request for somebody
 * who never worked here does not vanish, it resolves to a stated basis that the
 * organization can point at later.
 */
export const HR_VERIFICATION_DENIAL_BASES = [
  "no_employment_record",
  "consent_withheld",
  "requester_unverified",
  "legal_restriction",
  "other",
] as const;
export type HrVerificationDenialBasis =
  (typeof HR_VERIFICATION_DENIAL_BASES)[number];

export const HR_VERIFICATION_DENIAL_LABELS: Record<
  HrVerificationDenialBasis,
  string
> = {
  no_employment_record: "This person has no employment record here",
  consent_withheld: "The employee did not consent",
  requester_unverified: "The requester could not be verified",
  legal_restriction: "A legal restriction applies",
  other: "Other",
};

export type HrVerificationLetterRow = {
  id: string;
  organization_id?: string | null;
  state: string;
  request_source: HrVerificationSource | string;
  verification_kind: HrVerificationKind | string;
  includes_compensation?: boolean | null;
  subject_employee_id?: string | null;
  subject_employment_id?: string | null;
  subject_name?: string | null;
  /**
   * The letter reads in the PAST TENSE when this spell has ended (§4.9 A3), and
   * income for a former employee uses the last compensation row in force on the
   * last day worked.
   */
  subject_employment_ended_on?: string | null;
  requester_name?: string | null;
  requester_organization?: string | null;
  requester_email?: string | null;
  as_of_date?: string | null;
  requested_at?: string | null;
  employee_consent_at?: string | null;
  generated_at?: string | null;
  delivered_at?: string | null;
  delivery_method?: string | null;
  denial_basis?: string | null;
  denial_note?: string | null;
  expires_at?: string | null;
  letter_file_id?: string | null;
  /** The FROZEN assertion. Never re-derived, never edited. */
  snapshot?: Record<string, unknown> | null;
  /** Set when this row replaced an earlier request rather than editing it. */
  supersedes_request_id?: string | null;
};

/**
 * The two server refusals route 17 must render as STATES, not as error toasts.
 *
 * `hr_verification_consent_missing` (403) is the awaiting-consent state: the
 * work is not broken, it is waiting on a person. `hr_verification_letter_delivered`
 * (409) is the create-a-new-request path: the org has already asserted
 * something and is held to it.
 */
export const HR_VERIFICATION_CONSENT_MISSING = "hr_verification_consent_missing";
export const HR_VERIFICATION_ALREADY_DELIVERED = "hr_verification_letter_delivered";
