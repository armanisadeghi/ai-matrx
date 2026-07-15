// features/education/classes/constants.ts
//
// The Per-Class Hub is SCOPES-NATIVE (W2-class-hub.md): a "class" is a scope
// value under a per-user "Class" scope type, and class↔content is a
// platform.associations edge (source=content → target=('scope', classId)).
// This file holds the reserved identifiers the class layer is built on. It
// invents NO new tables and NO new scope semantics — see
// features/scopes/FEATURE.md.

import type { EntityTypeToken } from "@/types/generated/entity-types.generated";

/**
 * Reserved, stable slug for the auto-seeded "Class" scope type in a student's
 * personal org. The class layer resolves its scope type by THIS slug (never by
 * label, which the user may rename in the generic scopes UI). One per org.
 */
export const CLASS_SCOPE_TYPE_SLUG = "class";

/** Seed labels/appearance for the auto-created Class scope type. */
export const CLASS_SCOPE_TYPE_SEED = {
  labelSingular: "Class",
  labelPlural: "Classes",
  /** Lucide name string — the scope system stores icons by name. */
  icon: "graduation-cap",
  /** Semantic-token-friendly hex the scope system persists on the type. */
  color: "#6366f1",
  description:
    "Your courses. Each class is a workspace that gathers the decks, quizzes, notes, media, and exam dates for that course.",
} as const;

/**
 * The education content tokens a class hub surfaces, in display order. Each is
 * a registered platform.entity_types token that can be tagged to the class
 * scope. Anything else tagged to the class falls into an "Other" group.
 * (Keep in sync with `features/education/classes/data/entityRoutes.ts`.)
 */
export const CLASS_CONTENT_TOKENS: EntityTypeToken[] = [
  "fc_set",
  "assessment",
  "study_media",
  "note",
  "file",
];

/**
 * The `platform.associations` edge role that marks an edge as a class ASSIGNMENT
 * (a deck/quiz assigned to the class with a due date) rather than a plain
 * content-tag edge (role=null). The class content hub excludes this role so an
 * assignment doesn't double-list as generic tagged content.
 */
export const ASSIGNMENT_EDGE_ROLE = "assignment" as const;

/**
 * The resource tokens a class owner can ASSIGN — a deck (fc_set) or a
 * quiz/practice-test (assessment). A subset of CLASS_CONTENT_TOKENS (only the
 * study-spine-backed, completable resources). Kept in sync with the DB
 * `_edu_is_assignable_token` guard.
 */
export const ASSIGNABLE_TOKENS: EntityTypeToken[] = ["fc_set", "assessment"];

/** Keys used inside a class scope's `settings` JSONB. Pure metadata — no table. */
export const CLASS_SETTINGS_KEYS = {
  examDates: "exam_dates",
  teacher: "teacher",
  term: "term",
  period: "period",
  color: "color",
  archived: "archived",
  accessMode: "access_mode",
  priceCents: "price_cents",
} as const;

/**
 * Access-mode presentation metadata (Convergence C). The single source for how
 * open/closed/paid render — badges, form picker, join copy. Lucide icon NAMES
 * (resolved by consumers) so this stays a pure data module.
 */
export const ACCESS_MODES = [
  {
    value: "open",
    label: "Open",
    icon: "globe",
    short: "Anyone can join",
    description:
      "Publicly listed. Anyone can find this class and join instantly — a free public study group or a creator's open class.",
  },
  {
    value: "closed",
    label: "Closed",
    icon: "lock",
    short: "Request to join",
    description:
      "Not publicly listed. People join by invite, or by requesting access that you approve.",
  },
  {
    value: "paid",
    label: "Paid",
    icon: "credit-card",
    short: "Purchase to enroll",
    description:
      "Enrolment is gated by a purchase. Free preview material stays open; full access unlocks after purchase.",
  },
] as const;

/** Default access mode for a newly created class (private/personal-safe). */
export const DEFAULT_ACCESS_MODE = "closed" as const;
