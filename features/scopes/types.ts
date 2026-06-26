// features/scopes/types.ts
//
// Canonical types for the scopes module. Every other file under
// features/scopes/ imports from here. Consumer features import these
// types via the public hook/selector surface, not from this file directly.
//
// Aligned with the data model in features/scopes/FEATURE.md.

import type { Database, Json } from "@/types/database.types";

// ─── Database row aliases ───────────────────────────────────────────
//
// We never re-declare table shapes. The Supabase-generated types are
// the source of truth. Aliases here are for ergonomic imports.

export type ScopeTypeRow =
  Database["public"]["Tables"]["ctx_scope_types"]["Row"];
export type ScopeRow = Database["public"]["Tables"]["ctx_scopes"]["Row"];
export type ContextItemRow =
  Database["public"]["Tables"]["ctx_context_items"]["Row"];
export type ContextItemValueRow =
  Database["public"]["Tables"]["ctx_context_item_values"]["Row"];
export type ScopeAssignmentRow =
  Database["public"]["Tables"]["ctx_scope_assignments"]["Row"];
export type TemplateRow = Database["public"]["Tables"]["ctx_templates"]["Row"];
export type ContextAccessLogRow =
  Database["public"]["Tables"]["ctx_context_access_log"]["Row"];

// ─── Canonical entity vocabulary — `EntityType` ─────────────────────
//
// THE single token set for any entity the app treats as first-class: what can
// be tagged with a scope (`ctx_scope_assignments.entity_type`) AND what can
// participate in the unified association edge (`platform.associations`). One
// vocabulary — there is no separate "scope assignment" union.
//
// The DB registry `platform.entity_types` is the source of truth; this union
// mirrors it. New entity types are added to `platform.entity_types` FIRST,
// then mirrored here — never the reverse. (Neither `ctx_scope_assignments`
// nor `platform.associations.source_type` enforce membership at the DB level —
// both are free-text source columns — so this union is the app-side guard that
// stops callers inventing tokens.)
//
// 15 canonical registry tokens + 3 app entity types (`agent_app`,
// `agent_surface_binding`, `page_extraction_job`), registered in the registry
// by migrations/platform_entity_types_app_tokens.sql.
export type EntityType =
  // ── canonical (platform.entity_types) ──
  | "agent"
  | "note"
  | "file"
  | "conversation"
  | "prompt"
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
  | "agent_app" //             an `aga_apps` row (packaged agent experience)
  | "agent_surface_binding" // an agent⇄surface binding row
  | "page_extraction_job"; //  an extraction dataset (one `page_extraction_jobs` row)

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

// Targets allowed by the `platform.associations` CHECK constraint (8). A
// `source_type` is unconstrained free text (any token may be a source), but
// the TARGET of an edge must be one of these. Typed so `add`/`setTargets`
// callers can't request an edge the DB would reject.
export type AssociationTargetType =
  | "scope"
  | "scope_type"
  | "project"
  | "task"
  | "context_item"
  | "thread"
  | "war_room"
  | "category";

// ─── Association edges (per-entity, both-directions cache) ─────────────
//
// One row of `assoc_for_entity(p_type, p_id)` — every edge touching the
// entity in BOTH directions. `direction` is relative to the queried entity:
// "outgoing" = the entity is the edge's source; "incoming" = it is the
// target. `otherType`/`otherId` is the entity on the far end.

export interface AssociationEdge {
  id: string;
  direction: "outgoing" | "incoming";
  otherType: string;
  otherId: string;
  label: string | null;
  metadata: Json;
  orgId: string | null;
  createdAt: string;
}

// One row of `assoc_for_targets(p_target_type, p_target_ids[])` — every INCOMING
// edge (a member → one of the queried containers). `targetId` says which queried
// target the edge points at, so a caller loading MANY containers at once can
// group rows back by container in one pass. The batch counterpart of
// `AssociationEdge` (single entity, both directions).
export interface AssociationTargetEdge {
  id: string;
  targetId: string;
  sourceType: string;
  sourceId: string;
  label: string | null;
  metadata: Json;
  orgId: string | null;
  createdAt: string;
}

// ─── Denormalized scope display (scope + its type) ────────────────────
//
// A scope joined to its scope-type's presentation fields. Returned by
// `scopesService.getEntityScopeDetails` / `listEntityScopeTags` so display
// surfaces (AssignedScopesDisplay, the notes scope sidebar) never join
// ctx_scopes / ctx_scope_types themselves — the chokepoint owns those tables.

export interface ScopeTypeDisplay {
  id: string;
  label_singular: string;
  label_plural: string;
  icon: string | null;
  color: string | null;
}

export interface ScopeWithType {
  id: string;
  name: string;
  scope_type: ScopeTypeDisplay | null;
}

// One row of `assoc_for_sources` — the source-side batch counterpart of
// `AssociationTargetEdge`. Every OUTGOING edge from a set of sources of one
// type (optionally filtered to one target type). `sourceId` lets callers
// group results back by source.
export interface AssociationSourceEdge {
  id: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  label: string | null;
  metadata: Json;
  orgId: string | null;
  createdAt: string;
}

// Cache entry for one `${type}:${id}` endpoint — mirrors `EntityScopesEntry`.
export interface AssociationsEntry {
  status: "idle" | "loading" | "ready" | "error";
  edges: AssociationEdge[];
  fetchedAt: number | null;
  error: string | null;
}

// ─── Per-user entity state (platform.user_entity_state) ────────────────
//
// One row of the canonical per-user state ledger — the caller's favorite /
// pinned / hidden flags + recency on a single entity. Reached ONLY via the
// `ues_*` SECURITY-DEFINER RPCs; `favoritesService` is the sole chokepoint.
// `entityType` is FREE TEXT in the DB (per-user state is tracked for non-
// graph things too — e.g. `"nav"` destinations — so the table has no
// entity_type CHECK), hence `string` here rather than the constrained
// `EntityType`.
export interface UserEntityState {
  entityType: string;
  entityId: string;
  isFavorite: boolean;
  isPinned: boolean;
  isHidden: boolean;
  lastViewedAt: string | null;
}

// ─── Categories (platform.categories) ─────────────────────────────────
//
// The canonical faceted taxonomy. ONE table, partitioned by `dimension`
// (the facet — `agent-shortcut`, `skill`, `industry`, …), replacing the
// fragmented per-feature category systems. `orgId === null` is a system /
// global category visible to everyone; a non-null `orgId` is an org-owned
// category. The client has NO direct grant on `platform.categories`; every
// read/write goes through `cat_list` / `cat_create` (PUBLIC SECURITY-DEFINER
// RPCs), and every call to those RPCs goes through `categoriesService.ts` —
// the sibling chokepoint to `associationsService`.
//
// ASSIGNMENT of a category to an entity is NOT a category concern: it reuses
// the association edge (`assoc_add(source, 'category', categoryId, orgId)` via
// `associationsService` / `useAssociations`). `category` is already a valid
// `AssociationTargetType`. A category is the noun; the association is the verb.

/**
 * The facet a category belongs to. Open vocabulary (new dimensions need no
 * migration — `dimension` is free text in the DB), but the known dimensions
 * are enumerated in `CATEGORY_DIMENSIONS` so callsites use a constant, not a
 * stray string literal.
 */
export type CategoryDimension = string;

/** One `platform.categories` row, camelCased (mirrors `cat_list`'s return). */
export interface PlatformCategory {
  id: string;
  /** `null` = system / global category (visible to everyone). */
  orgId: string | null;
  dimension: CategoryDimension;
  name: string;
  slug: string | null;
  parentId: string | null;
  isSystem: boolean;
  color: string | null;
  icon: string | null;
  position: number | null;
}

/** Cache entry for one `dimension` — mirrors `AssociationsEntry`. */
export interface CategoriesEntry {
  status: "idle" | "loading" | "ready" | "error";
  categories: PlatformCategory[];
  fetchedAt: number | null;
  error: string | null;
}

// ─── Tree shape (returned by the boot RPC and stored in scopesSlice) ───

export interface ScopeNode {
  id: string;
  scope_type_id: string;
  organization_id: string;
  name: string;
  description: string;
  parent_scope_id: string | null;
  settings: Json;
}

export interface ScopeTypeNode {
  id: string;
  organization_id: string;
  label_singular: string;
  label_plural: string;
  icon: string;
  color: string;
  max_assignments_per_entity: number | null;
  sort_order: number;
  parent_type_id: string | null;
  default_variable_keys: string[];
  scopes: ScopeNode[];
}

export interface ProjectNode {
  id: string;
  organization_id: string | null;
  name: string;
  slug: string | null;
  /** scope_ids associated with this project via ctx_scope_assignments. */
  scope_ids: string[];
}

/** Mirrors the `public.org_role` enum exactly — there is no read-only role. */
export type OrgRole = "owner" | "admin" | "member";

export interface OrgNode {
  id: string;
  name: string;
  slug: string;
  is_personal: boolean;
  role: OrgRole;
  scope_types: ScopeTypeNode[];
  projects: ProjectNode[];
}

export interface ScopeTreeResponse {
  organizations: OrgNode[];
  fetched_at: string;
}

// ─── Task bucket (loaded per-level on demand) ──────────────────────────

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

// ─── Orphan buckets (separate lifecycle from the tree) ────────────────

export type OrphanBucketStatus =
  | "unfetched"
  | "loading"
  | "ready"
  | "empty"
  | "error";

export interface OrphanBucket<T> {
  status: OrphanBucketStatus;
  items: T[];
  fetchedAt: number | null;
  error: string | null;
}

// ─── Entity scope assignments (per-entity M2M cache) ──────────────────
//
// Cached per `${entityType}:${entityId}` key — populated lazily by
// `ensureEntityScopes` and kept up-to-date by `setEntityScopes`. Read by
// Surface B components (EntityScopeTagger) and the local-vs-global
// resolution layer.

export interface EntityScopesEntry {
  status: "idle" | "loading" | "ready" | "error";
  scope_ids: string[];
  fetchedAt: number | null;
  error: string | null;
}

// ─── Context item values (high-churn sidecar slice) ───────────────────

/** Mirrors the `public.context_value_type` enum exactly. */
export type ContextItemValueType =
  | "string"
  | "number"
  | "boolean"
  | "object"
  | "array"
  | "document"
  | "reference"
  | "date";

export interface ContextItemValue {
  context_item_id: string;
  id: string;
  version: number;
  is_current: boolean;
  value_text: string | null;
  value_number: number | null;
  value_boolean: boolean | null;
  value_date: string | null;
  value_json: Json | null;
  value_document_url: string | null;
  value_document_size_bytes: number | null;
  value_reference_id: string | null;
  value_reference_type: string | null;
  source_type: string;
  authored_by: string | null;
  created_at: string;
}

export interface ScopeValuesEntry {
  status: "idle" | "loading" | "ready" | "error";
  fetchedAt: number | null;
  /** Keyed by context_item_id. */
  values: Record<string, ContextItemValue>;
  /** Unsaved drafts keyed by context_item_id. */
  drafts: Record<string, Partial<ContextItemValue>>;
  error: string | null;
}

// ─── Templates (read-only catalog) ─────────────────────────────────────

export interface ContextTemplate {
  id: string;
  key: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  is_active: boolean;
  sort_order: number;
  scope_type_count: number;
  context_item_count: number;
}

// ─── Resolution shapes ─────────────────────────────────────────────────

export type ContextSourceKind = "scope" | "project" | "task" | "user" | "org";
export type ContextSourceOrigin = "local" | "global";

export interface ContextSource {
  kind: ContextSourceKind;
  /** id of the contributing entity (scope_id, project_id, etc.) */
  id: string;
  origin: ContextSourceOrigin;
  /** lower = closer to the action; sorted ascending in resolution. */
  priority: number;
}

export interface ResolvedValue {
  context_item_id: string;
  key: string;
  display_name: string;
  value_type: ContextItemValueType;
  value: string | number | boolean | Json | null;
  document_url?: string | null;
  reference_id?: string | null;
  reference_type?: string | null;
  version: number;
}

export interface ScopeContradiction {
  scope_type_id: string;
  global_scope_id: string;
  local_scope_id: string;
}

export interface ResolvedContext {
  values: Record<string, ResolvedValue>;
  sourcePerKey: Record<string, ContextSource>;
  contradictions: ScopeContradiction[];
  activeScopes: ContextSource[];
  organizationId: string | null;
  userId: string;
}

// ─── Suggestion target resolution ──────────────────────────────────────
//
// The fully-resolved, human-readable picture behind a KG suggestion's
// target. Returned by `scopesService.resolveSuggestionTarget`; consumed by
// the kg-suggestions decision UI so it can show the org → type → scope →
// item path, every item on the scope, and the CURRENT value each item holds
// (so a suggestion that would overwrite a manually-entered value is obvious).

export interface ResolvedSuggestionValue {
  value_text: string | null;
  value_number: number | null;
  value_boolean: boolean | null;
  value_json: Json | null;
  /** e.g. "manual" | "ai" | "import" — how the current value was authored. */
  source_type: string | null;
  version: number | null;
  created_at: string | null;
}

export interface ResolvedSuggestionItem {
  id: string;
  slug: string | null;
  key: string;
  display_name: string;
  value_type: string;
  sort_order: number;
  /** Current value on this scope, or null if the cell is empty. */
  current: ResolvedSuggestionValue | null;
}

export interface ResolvedSuggestionTarget {
  org: {
    id: string;
    name: string;
    slug: string;
    is_personal: boolean;
  };
  scope_type: {
    id: string;
    slug: string | null;
    label_singular: string;
    label_plural: string;
    icon: string | null;
    color: string | null;
  };
  scope: {
    id: string;
    slug: string | null;
    name: string;
    description: string | null;
  };
  /** The specific item the suggestion proposes to fill (null if unresolved). */
  target_item: ResolvedSuggestionItem | null;
  /** Every active item on the scope type, in sort order (for context). */
  items: ResolvedSuggestionItem[];
}

// ─── set_context_value (the sanctioned ctx_context_item_values write) ──────
//
// `public.set_context_value` is the ONLY sanctioned mutation path for
// `ctx_context_item_values` (atomic version-flip-then-insert with the scope
// write-access check inside the SECURITY DEFINER function). EXECUTE is granted
// to `authenticated`, so the chokepoint calls it directly. The suggestion
// ledger only stores text, so callers typically send `value_text`; typed slots
// may instead send the matching typed key.

/** Mirrors the `public.context_source_type` enum. */
export type ContextSourceType =
  | "manual"
  | "ai_generated"
  | "ai_enriched"
  | "imported"
  | "scraped"
  | "system";

export interface SetContextValuePayload {
  context_item_id: string;
  scope_id: string;
  value_text?: string | null;
  value_number?: number | null;
  value_boolean?: boolean | null;
  value_date?: string | null;
  value_json?: Json | null;
  value_document_url?: string | null;
  value_reference_id?: string | null;
  /** Defaults to `ai_enriched` server-side when omitted. */
  source_type?: ContextSourceType;
  change_summary?: string;
}

/** The cell row `set_context_value` writes and returns on success. */
export interface SetContextValueResult {
  id: string;
  context_item_id: string;
  scope_id: string;
  version: number;
  value_text: string | null;
  source_type: string;
}

// ─── Service result envelope ───────────────────────────────────────────
//
// Mirrors the RpcResult shape specified in features/scopes/docs/RPC_CONTRACTS.md.
// Service methods always return this — they never throw to callers.

export type ScopesRpcErrorCode =
  | "unauthorized"
  | "forbidden_org"
  | "forbidden_role"
  | "not_found"
  | "conflict_in_use"
  | "invalid_argument"
  | "version_conflict"
  | "quota_exceeded"
  | "template_missing"
  | "internal";

export interface ScopesRpcError {
  code: ScopesRpcErrorCode;
  message: string;
  hint?: string;
  detail?: unknown;
}

export type ScopesRpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ScopesRpcError };

/**
 * Type-guard narrowing helper for {@link ScopesRpcResult}. The repo runs with
 * `strictNullChecks: false`, which breaks TypeScript's default control-flow
 * narrowing for boolean discriminants (`if (!res.ok)` reverts to the wide
 * union). Callers should use this guard so the `ok: true` branch surfaces
 * `data` and the `ok: false` branch surfaces `error`.
 */
export function isScopesRpcErr<T>(
  r: ScopesRpcResult<T>,
): r is { ok: false; error: ScopesRpcError } {
  return r.ok === false;
}
