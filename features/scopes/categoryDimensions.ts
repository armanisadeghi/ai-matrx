// features/scopes/categoryDimensions.ts
//
// The known facets of the canonical taxonomy (`platform.categories.dimension`).
// `dimension` is free text in the DB so new facets need NO migration — but
// every callsite should reference a constant here instead of a bare string
// literal, so the set of live dimensions is greppable from one place.
//
// Server-safe (no "use client"): seed scripts, RPC callers, and UI all import
// the same tokens. As each fragmented category system migrates onto
// `categoriesService`, its dimension is added here.

export const CATEGORY_DIMENSIONS = {
  /** Agent shortcut groupings (was `shortcut_categories`). */
  agentShortcut: "agent-shortcut",
  /** Agent skill taxonomy (was `skill.category`). */
  skill: "skill",
  /** Industry verticals for context templates (was hardcoded INDUSTRY_CATEGORIES). */
  industry: "industry",
  /** Context-item groupings (was hardcoded DEFAULT_CATEGORIES). */
  contextItem: "context-item",
  /** Flashcard set folders/tags (fc_set → category via EDGE_ROLE.theme). */
  flashcardFolder: "flashcard-folder",
  /** Content Planning (`plan` schema) — plan.node.page_type_id. System seeds, public. */
  planPageType: "plan_page_type",
  /** Content Planning — plan.node.status_id (idea → … → retired). System seeds, public. */
  planStatus: "plan_status",
  /** Content Planning — person roles for plan.entity (author/reviewer/…). System seeds, public. */
  planPersonRole: "plan_person_role",
  /** Content Planning — plan.entity.source_type_id. System seeds, public. */
  planSourceType: "plan_source_type",
} as const;

export type KnownCategoryDimension =
  (typeof CATEGORY_DIMENSIONS)[keyof typeof CATEGORY_DIMENSIONS];
