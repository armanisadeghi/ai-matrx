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
} as const;

export type KnownCategoryDimension =
  (typeof CATEGORY_DIMENSIONS)[keyof typeof CATEGORY_DIMENSIONS];
