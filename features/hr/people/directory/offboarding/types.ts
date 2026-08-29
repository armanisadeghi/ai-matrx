// features/hr/people/directory/offboarding/types.ts
//
// The separation vocabularies and the reason-category shape for the offboarding dialog.
//
// 🚨 THESE TWO CLOSED VOCABULARIES ARE VERIFIED AGAINST THE LIVE CHECK CONSTRAINTS on
// `hr.separation`, not assumed — a list that disagrees with the door's CHECK silently breaks
// every submission carrying the wrong value (the failure the verification-kinds list shipped once):
//   separation_category  CHECK … ANY (ARRAY['voluntary','involuntary','other'])
//   initiator            CHECK … ANY (ARRAY['employee','employer','mutual','third_party'])
// (measured 2026-08-29 via pg_constraint.)

export const HR_SEPARATION_CATEGORIES = [
  "voluntary",
  "involuntary",
  "other",
] as const;
export type HrSeparationCategory = (typeof HR_SEPARATION_CATEGORIES)[number];

export const HR_SEPARATION_CATEGORY_LABELS: Record<HrSeparationCategory, string> = {
  voluntary: "Voluntary — they chose to leave",
  involuntary: "Involuntary — the employer ended it",
  other: "Other",
};

export const HR_SEPARATION_INITIATORS = [
  "employee",
  "employer",
  "mutual",
  "third_party",
] as const;
export type HrSeparationInitiator = (typeof HR_SEPARATION_INITIATORS)[number];

export const HR_SEPARATION_INITIATOR_LABELS: Record<HrSeparationInitiator, string> = {
  employee: "The employee",
  employer: "The employer",
  mutual: "Mutual",
  third_party: "A third party",
};

/**
 * `hr.separation.reason_category_id` is an FK into `platform.categories` on this dimension.
 * The reasons are system rows, loaded client-side like every other reason menu in HR (the
 * leave and time lanes read `platform.categories` the same way — `platform` is exposed to
 * PostgREST, `hr` is not). Rendered by NAME, submitted by id.
 */
export const HR_SEPARATION_REASON_DIMENSION = "hr_separation_reason";

export type HrSeparationReasonCategory = {
  id: string;
  slug: string;
  name: string;
  position: number | null;
};
