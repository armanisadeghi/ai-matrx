// features/scopes/types.ts
//
// The scopes module's HOST types. Scope DATA shapes come from `@ai-matrx/records/scopes` (a scope type
// is a Table kept for context, a scope a Record, a context field a Field, a value its cell) — import
// `Scope`, `ScopeTypeWithScopes`, `ContextField`, `ContextValue`, `ContextValueWrite` … from there.
// What lives here is what only this app holds: the org/project/task tree around the scope types, the
// Redux entry shapes, the entity vocabulary re-exports, and the suggestion-target view.

import type {
  ContextField,
  ContextValue,
  Scope,
  ScopeTypeWithScopes,
} from "@ai-matrx/records/scopes";

// Host callers still import this historical name while their result envelopes
// have moved to the record store. Keep the import edge stable by exposing the
// record store's discriminant guard, not a second scopes-shaped result type.
export { isRecordsErr as isScopesRpcErr } from "@ai-matrx/records";

// Re-export the GENERATED entity-token vocabulary so consumers import the
// canonical, type-safe token set from the scopes types module (the single
// place feature code already reaches for association/scope types). The
// vocabulary ships in `@ai-matrx/associations`, generated inside the package
// from `platform.entity_types`.
export type { EntityTypeToken } from "@ai-matrx/associations";
export {
  ENTITY_TYPE_METADATA,
  ENTITY_TYPE_TOKENS,
  isEntityTypeToken,
} from "@ai-matrx/associations";

// ─── Canonical entity vocabulary — `EntityType` ─────────────────────
//
// THE single token set for any entity the app treats as first-class: what can
// be tagged with a scope (`ctx_scope_assignments.entity_type`) AND what can
// participate in the unified association edge (`platform.associations`). One
// vocabulary — there is no separate "scope assignment" union.
//
// The DB registry `platform.entity_types` is the source of truth. The FULL,
// type-safe token set is GENERATED into `@ai-matrx/associations`
// (`EntityTypeToken`) — re-exported above. Prefer `EntityTypeToken`
// for any NEW association/source-type argument; it covers every registered token
// so callers are never forced to widen to a raw string.
//
// `EntityType` below is the narrower, hand-curated "first-class app entity" set
// kept for the existing scope-tagging / favorites consumers. It is being
// converged onto `EntityTypeToken` (and is now a strict subset of it — every
// member is a real `platform.entity_types` token). Do not extend it — add the
// token to `platform.entity_types` (then it appears in `EntityTypeToken`
// automatically).
export type EntityType =
  // ── canonical (platform.entity_types) ──
  | "agent"
  | "note"
  | "file"
  | "conversation"
  // "prompt" was removed when the prompts system was killed (2026-08-13) and
  // `platform.entity_types` dropped the token — keeping it here broke the
  // subset invariant above and made every EntityType -> EntityTypeToken
  // callsite a type error (15 of them, across 8 features).
  | "scope"
  | "scope_type"
  | "context_item"
  | "project"
  | "task"
  | "category"
  | "thread"
  | "war_room"
  | "studio_session"
  | "transcript"
  // ── app entity types (also registered in platform.entity_types) ──
  | "app" //                   an `app.definition` row (packaged agent experience)
  | "agent_surface_binding" // an agent⇄surface binding row
  | "page_extraction_job" //   an extraction dataset (one `page_extraction_jobs` row)
  | "party" //                 a CRM person/company (crm.party) — notes on the record page ride platform.comments
  | "crm_deal"; //             a CRM deal (crm.deal) — notes on the deal record ride platform.comments

// ─── Favorite kinds (presentation vocabulary, folded onto EntityType) ──
//
// A favorite points either at a real ENTITY (any canonical `EntityType`
// token — its per-user state lives in `platform.user_entity_state` keyed by
// the entity's uuid) or at a static NAV destination (an app-area route, NOT
// an entity, so it has no uuid). Folding the entity half into `EntityType`
// keeps the favorites vocabulary 1:1 with the canonical token set; `"nav"`
// is the single non-entity addition. This is the SOLE definition — the
// `userPreferencesSlice` `FavoriteItem.kind` re-exports it (no parallel
// union). The legacy `app`/`podcast`/`other` tokens were dropped: none had a
// favorites callsite, and a new favoritable type is added to
// `platform.entity_types` (then `EntityType`), never invented here.
export type FavoriteKind = EntityType | "nav";


// ─── Association / category / per-user-state types — PACKAGE-OWNED ─────
//
// W5 swap (2026-08-29): these shapes ship in `@ai-matrx/associations`
// (src/edges.ts there carries the full per-token container commentary that
// used to live here — targets list, edge direction semantics, the category
// taxonomy contract). Re-exported under their historical names so the many
// existing `@/features/scopes/types` imports keep working. NOTE
// `AssociationEdge.metadata` is `unknown` (the package's independence
// posture for jsonb) — narrow with a guard at the point of use.
export {
  ASSOCIATION_TARGET_TYPES,
} from "@ai-matrx/associations";
export type {
  AssociationTargetType,
  AssociationEdge,
  AssociationTargetEdge,
  AssociationSourceEdge,
  AssociationsEntry,
  UserEntityState,
  CategoryDimension,
  PlatformCategory,
  CategoriesEntry,
} from "@ai-matrx/associations";

// ─── The tree the holder keeps ─────────────────────────────────────────

export interface ProjectNode {
  id: string;
  organization_id: string | null;
  name: string;
  slug: string | null;
  scope_ids: string[];
}

export type OrgRole = "owner" | "admin" | "member";

/** An organization the person can see, with its scope types (each with its scopes) and projects. */
export interface OrgNode {
  id: string;
  name: string;
  abbreviation: string;
  logo_url?: string | null;
  slug: string;
  is_test_fixture?: boolean;
  created_by?: string | null;
  is_own?: boolean;
  role: OrgRole;
  scope_types: ScopeTypeWithScopes[];
  projects: ProjectNode[];
  /** Loaded through the admin lane (not a membership). */
  admin_lane?: boolean;
}

export interface ScopeTreeResponse {
  organizations: OrgNode[];
  fetched_at: string;
}

export interface TaskNode {
  id: string;
  title: string;
  status: string;
  project_id: string | null;
  organization_id: string | null;
  scope_ids: string[];
  updated_at: string;
}

export type TaskBucketLevel = "scope" | "project" | "org";

export interface TaskBucketEntry {
  status: "idle" | "loading" | "ready" | "empty" | "error";
  taskIds: string[];
  fetchedAt: number | null;
  error: string | null;
}

export type OrphanBucketStatus = "unfetched" | "loading" | "ready" | "empty" | "error";

export interface OrphanBucket<T> {
  status: OrphanBucketStatus;
  items: T[];
  fetchedAt: number | null;
  error: string | null;
}

export interface EntityScopesEntry {
  status: "idle" | "loading" | "ready" | "error";
  scope_ids: string[];
  fetchedAt: number | null;
  error: string | null;
}

/** One scope's values, keyed by FIELD id. */
export interface ScopeValuesEntry {
  status: "idle" | "loading" | "ready" | "error";
  fetchedAt: number | null;
  values: Record<string, ContextValue>;
  error: string | null;
  /** The scope's type, when the tree did not hold the scope (learned from the scope door). */
  scopeTypeId?: string;
}

/** One scope type's context fields. */
export interface ContextItemsEntry {
  status: "idle" | "loading" | "ready" | "error";
  items: ContextField[];
  fetchedAt: number | null;
  error: string | null;
}

/** Who wrote a value (`ContextValueWrite.source_type`). */
export type ContextSourceType =
  "manual" | "ai_generated" | "ai_enriched" | "imported" | "scraped" | "system";

// ─── Suggestion target (kg-suggestions decision view) ──────────────────
//
// The org → type → scope → field path behind a knowledge-graph suggestion, every field of the scope's
// type and the value each holds now (so a suggestion that would overwrite a person's value shows).

export interface ResolvedSuggestionItem {
  field: ContextField;
  current: ContextValue | null;
}

export interface ResolvedSuggestionTarget {
  org: { id: string; name: string; slug: string };
  scope_type: {
    id: string;
    slug: string | null;
    label_singular: string;
    label_plural: string;
    icon: string | null;
    color: string | null;
  };
  scope: Pick<Scope, "id" | "slug" | "name" | "description">;
  target_item: ResolvedSuggestionItem | null;
  items: ResolvedSuggestionItem[];
}
