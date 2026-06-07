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

// ─── Entity types that can be tagged with scopes ────────────────────
//
// `ctx_scope_assignments.entity_type` is a string column in the DB.
// Enumerate it here so callers can't pass arbitrary values. New entity
// types must be added here AND on the server-side validation.

export type ScopeAssignmentEntityType =
  | "note"
  | "task"
  | "project"
  | "agent"
  | "agent_app"
  | "agent_shortcut"
  | "agent_surface_binding"
  | "conversation"
  | "project_resource"
  | "file";

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

export type OrgRole = "owner" | "admin" | "member" | "viewer";

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

export type ContextItemValueType =
  | "text"
  | "number"
  | "boolean"
  | "json"
  | "document"
  | "reference";

export interface ContextItemValue {
  context_item_id: string;
  id: string;
  version: number;
  is_current: boolean;
  value_text: string | null;
  value_number: number | null;
  value_boolean: boolean | null;
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
