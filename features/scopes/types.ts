// features/scopes/types.ts
//
// Canonical types for the scopes module. Every other file under
// features/scopes/ imports from here. Consumer features import these
// types via the public hook/selector surface, not from this file directly.
//
// Aligned with the data model in features/scopes/FEATURE.md.

import type { Database, Json } from "@/types/database.types";
import type { EntityTypeToken } from "@/types/generated/entity-types.generated";

// Re-export the GENERATED entity-token vocabulary so consumers import the
// canonical, type-safe token set from the scopes types module (the single
// place feature code already reaches for association/scope types). The
// generated file is the source of truth — mirrored from `platform.entity_types`
// via `pnpm gen:entity-types`; never hand-edit it.
export type { EntityTypeToken } from "@/types/generated/entity-types.generated";
export {
  ENTITY_TYPE_METADATA,
  ENTITY_TYPE_TOKENS,
  isEntityTypeToken,
} from "@/types/generated/entity-types.generated";

// ─── Database row aliases ───────────────────────────────────────────
//
// We never re-declare table shapes. The Supabase-generated types are
// the source of truth. Aliases here are for ergonomic imports.

export type ScopeTypeRow = Database["context"]["Tables"]["scope_types"]["Row"];
export type ScopeRow = Database["context"]["Tables"]["scopes"]["Row"];
export type ContextItemRow =
  Database["context"]["Tables"]["context_items"]["Row"];
export type ContextItemValueRow =
  Database["context"]["Tables"]["context_item_values"]["Row"];
// `ctx_scope_assignments` is GRAVEYARDED — scope tags now live in
// `platform.associations` (reached via scopesService / associationsService).
// The table is slated for drop, so its row vanishes from the generated types
// on the next `pnpm db-types`. We hand-write the shape (identical to the old
// generated row) so the build doesn't break when the table disappears.
export interface ScopeAssignmentRow {
  id: string;
  scope_id: string;
  entity_id: string;
  entity_type: string;
  created_by: string | null;
  created_at: string;
}
export type TemplateRow = Database["context"]["Tables"]["templates"]["Row"];
export type ContextAccessLogRow =
  Database["context"]["Tables"]["context_access_log"]["Row"];

// ─── Canonical entity vocabulary — `EntityType` ─────────────────────
//
// THE single token set for any entity the app treats as first-class: what can
// be tagged with a scope (`ctx_scope_assignments.entity_type`) AND what can
// participate in the unified association edge (`platform.associations`). One
// vocabulary — there is no separate "scope assignment" union.
//
// The DB registry `platform.entity_types` is the source of truth. The FULL,
// type-safe token set is GENERATED at `types/generated/entity-types.generated.ts`
// (`EntityTypeToken`, 216 tokens) — re-exported above. Prefer `EntityTypeToken`
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
  | "working_document" //      a chat working document (workbench.working_documents)
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
  abbreviation: string;
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
  "unfetched" | "loading" | "ready" | "empty" | "error";

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

/** The `public.context_value_type` enum — generated types are the source of truth. */
export type ContextItemValueType =
  Database["public"]["Enums"]["context_value_type"];

/** Migration alias for the legacy agent-context/scope-system `ContextValueType`. */
export type ContextValueType = ContextItemValueType;

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

/**
 * One row from `public.list_context_value_refs` — a context item value whose
 * reference fence points at the queried `(ref_type, ref_key)` (e.g. "which
 * matters point at this file?"). Reverse of the forward lookup on the cell
 * itself; see `scopesService.listReferencingValues`.
 */
export interface ReferencingContextValue {
  scope_id: string;
  scope_name: string;
  scope_type_id: string;
  organization_id: string;
  context_item_id: string;
  item_key: string;
  item_display_name: string;
  value_id: string;
  is_current: boolean;
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

/**
 * Cache entry for one scope type's ACTIVE context-item catalog (the item
 * DEFINITIONS, not per-scope values — those live in `ScopeValuesEntry`).
 * Mirrors `CategoriesEntry`.
 */
export interface ContextItemsEntry {
  status: "idle" | "loading" | "ready" | "error";
  items: ContextItemRow[];
  fetchedAt: number | null;
  error: string | null;
}

// ─── Templates (read-only catalog) ─────────────────────────────────────

/** One context-item column defined inside a template scope type. */
export interface TemplateItemField {
  key: string;
  display_name: string;
}

/** One scope type inside a template, with its context-item columns. */
export interface TemplateScopeTypeDetail {
  id: string;
  key: string;
  icon: string;
  label_singular: string;
  label_plural: string;
  sort_order: number;
  max_assignments_per_entity: number | null;
  parent_template_type_id: string | null;
  /** Resolved label of the parent template scope type (client-side join). */
  parent_type_label: string | null;
  fields: TemplateItemField[];
}

export interface ContextTemplate {
  id: string;
  key: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  is_active: boolean;
  is_personal: boolean;
  sort_order: number;
  scope_type_count: number;
  context_item_count: number;
  /** Full nested detail — what applying this template creates. */
  scope_types: TemplateScopeTypeDetail[];
}

/**
 * A template scope type flattened out of its template — the "Individual
 * scopes" borrow list in the gallery. Carries the source template identity.
 */
export interface FlatTemplateScopeType extends TemplateScopeTypeDetail {
  template_id: string;
  template_key: string;
  template_name: string;
  template_category: string;
  template_is_personal: boolean;
}

// ─── Mutation params (the sanctioned SECURITY DEFINER write family) ────

export interface CreateScopeTypeParams {
  org_id: string;
  label_singular: string;
  label_plural: string;
  parent_type_id?: string;
  icon?: string;
  description?: string;
  sort_order?: number;
  max_assignments?: number;
  default_variable_keys?: string[];
  color?: string;
  slug?: string;
}

export interface UpdateScopeTypeParams {
  type_id: string;
  label_singular?: string;
  label_plural?: string;
  icon?: string;
  description?: string;
  sort_order?: number;
  max_assignments?: number;
  color?: string;
  slug?: string;
}

export interface CreateScopeParams {
  org_id: string;
  type_id: string;
  name: string;
  parent_scope_id?: string;
  description?: string;
  settings?: Json;
  slug?: string;
  sort_order?: number;
}

export interface UpdateScopeParams {
  scope_id: string;
  name?: string;
  description?: string;
  settings?: Json;
  slug?: string;
  sort_order?: number;
}

export interface CreateContextItemParams {
  scope_type_id: string;
  key: string;
  display_name: string;
  value_type?: ContextItemValueType;
  description?: string;
  category?: string;
  fetch_hint?: Database["public"]["Enums"]["context_fetch_hint"];
  sensitivity?: Database["public"]["Enums"]["context_sensitivity"];
  tags?: string[];
  slug?: string;
  sort_order?: number;
  allowed_reference_types?: string[];
  max_items?: number;
  allowed_scope_type_ids?: string[];
  reference_source?: Json;
}

export interface UpdateContextItemParams {
  item_id: string;
  display_name?: string;
  description?: string;
  category?: string;
  value_type?: ContextItemValueType;
  fetch_hint?: Database["public"]["Enums"]["context_fetch_hint"];
  sensitivity?: Database["public"]["Enums"]["context_sensitivity"];
  tags?: string[];
  sort_order?: number;
  status?: Database["public"]["Enums"]["context_item_status"];
  status_note?: string;
}

/** What `apply_template` reports back (jsonb envelope from the RPC). */
export interface ApplyTemplateResult {
  template_id: string;
  organization_id: string;
  /** The created `context.scope_types` rows (jsonb array from the RPC). */
  scope_types_created: Json;
  context_items_count: number;
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
  "manual" | "ai_generated" | "ai_enriched" | "imported" | "scraped" | "system";

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
  /** `datetime` items — the RPC routes it to `value_timestamp` (timestamptz). */
  value_timestamp?: string | null;
  /** `time` items — the RPC routes it to `value_time`. */
  value_time?: string | null;
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
// Mirrors the RpcResult shape this module's service returns. Contract of record:
// /Users/armanisadeghi/code/common-docs/systems/scopes-context/STATE.md (the RPC_CONTRACTS.md spec was deleted 2026-08-25 — most of it was never built).
// Service methods always return this — they never throw to callers.

export type ScopesRpcErrorCode =
  // access-errors: ok — error-code union member mirroring the RPC contract, never rendered as copy
  | "unauthorized"
  | "forbidden_org"
  | "forbidden_role"
  | "not_found"
  | "conflict_in_use"
  | "invalid_argument"
  | "version_conflict"
  | "quota_exceeded"
  | "template_missing"
  /**
   * THE DEMANDED-SCHEMA SCREAM from `@ai-matrx/associations` (W5 swap): a
   * PostgREST missing-function error (PGRST202) on a demanded association
   * RPC. Present here so the package's `AssociationsRpcError` stays
   * assignable to `ScopesRpcError` at the service wiring boundary.
   */
  | "demanded_schema_violation"
  | "internal";

export interface ScopesRpcError {
  code: ScopesRpcErrorCode;
  message: string;
  hint?: string;
  detail?: unknown;
}

export type ScopesRpcResult<T> =
  { ok: true; data: T } | { ok: false; error: ScopesRpcError };

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
