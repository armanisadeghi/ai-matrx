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
  /**
   * Agent shortcut groupings (was the `shortcut_categories` table; migrated
   * onto platform.categories, and 65 of the 66 live rows still carry
   * `metadata.legacy_table = "shortcut_categories"` from that move).
   *
   * 🚨 THE VALUE IS `shortcut`, NOT `agent-shortcut`. This constant said
   * `agent-shortcut` until 2026-08-24 — a dimension with ZERO rows in it. No
   * caller had used it yet, so it never broke anything; the first one to wire
   * the canonical picker to it would have got a silently empty dropdown and no
   * error, which is the worst way for a name to be wrong. Verified live:
   * `shortcut` = 66 rows and all 207 shortcuts point into it, `agent-shortcut`
   * = 0.
   */
  agentShortcut: "shortcut",
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
  /** CRM — party roles (expert/lead/vendor/…): party → category edge, role 'member'. System seeds, public. */
  partyRole: "party_role",
  /** CRM — crm.party.lifecycle_stage_id (FK column). System seeds, public. */
  crmLifecycleStage: "crm_lifecycle_stage",
  /** CRM — crm.party.rating_id (FK column). System seeds, public. */
  crmRating: "crm_rating",
  /** Web/entity classification — category + subcategory (the first canonical two-level facet). */
  webEntityType: "web_entity_type",
} as const;

export type KnownCategoryDimension =
  (typeof CATEGORY_DIMENSIONS)[keyof typeof CATEGORY_DIMENSIONS];
