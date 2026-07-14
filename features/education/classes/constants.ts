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

/** Keys used inside a class scope's `settings` JSONB. Pure metadata — no table. */
export const CLASS_SETTINGS_KEYS = {
  examDates: "exam_dates",
  teacher: "teacher",
  term: "term",
  period: "period",
  color: "color",
  archived: "archived",
} as const;
