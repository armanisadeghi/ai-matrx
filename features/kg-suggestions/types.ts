// features/kg-suggestions/types.ts
//
// FE model for KG → scope suggestions. As of 2026-06-07 the aidream HTTP API
// (`/api/kg-suggestions`) is DELETED — the frontend reads and decides DIRECTLY
// against Supabase (RLS-scoped tables + the `set_context_value` RPC). See
// `/Users/armanisadeghi/code/aidream/docs/rag_and_ner/handoffs/scope_suggestions_direct_supabase.md`.
//
// There are now TWO ledgers (migration kg_013), each RLS-scoped to
// `auth.uid() = user_id`:
//
//   - `scope_association_suggestions` (Stage A) — "this document belongs to
//     scope X". Produced by the orienter agent, the pure matchers, and the
//     heavy-hitter detector. Accepting = tag the source to the scope (or, for
//     `heavy_hitter`, create a brand-new scope from a recurring entity).
//   - `scope_item_value_suggestions`  (Stage B) — "scope X's slot K should hold
//     value V". Produced by the slot_filler / deep_extractor agents. Accepting
//     = write the value through `set_context_value`.
//
// The two raw rows have DIFFERENT column names (Stage A: target_scope_item_id /
// target_slot_name — both always null for links; Stage B: target_context_item_id
// / target_slot_key). We DON'T share a raw row type across them. Instead the
// service normalizes both into the single `KgSuggestionRow` below, discriminated
// by `stage`, so every existing surface keeps consuming one shape. Suggestions
// are NEVER auto-applied: accept is the explicit user action.

/** Which ledger a normalized row came from. */
export type KgSuggestionStage = "association" | "value";

/** Stage-A (scope-link) match kinds. */
export type KgAssociationMatchKind =
  | "exact"
  | "fuzzy"
  | "semantic"
  | "heavy_hitter"
  | "agent.orienter.association"
  | "agent.orienter.uncertain";

/** Stage-B (slot-value) match kinds. */
export type KgValueMatchKind =
  | "agent.slot_filler.fill_empty"
  | "agent.slot_filler.improve"
  | "agent.slot_filler.flag_conflict"
  | "agent.deep_extractor.extracted";

export type KgMatchKind = KgAssociationMatchKind | KgValueMatchKind;

export type KgSuggestionStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "deferred"
  | "expired";

/** The KG entity a suggestion points at (only `id` survives the new schema). */
export interface KgSuggestionEntity {
  id: string | null;
  kind: string | null;
  name: string | null;
}

/**
 * The scope target. For Stage B (value) `scope_item_id` carries the CONTEXT
 * ITEM id (the slot definition, `target_context_item_id`) and `slot_name` the
 * slot key — the same semantics the enrichment + decision UI already use. For
 * Stage A (link) both are null; `scope_id` may also be null for `heavy_hitter`
 * (no scope exists yet — `suggested_value` is the proposed new scope name).
 */
export interface KgSuggestionTarget {
  scope_id: string | null;
  scope_item_id: string | null;
  slot_name: string | null;
}

/** One normalized suggestion row, the single shape every surface consumes. */
export interface KgSuggestionRow {
  id: string;
  /** Which ledger this came from — drives the accept path. */
  stage: KgSuggestionStage;
  organization_id: string | null;
  source_kind: string;
  source_id: string;
  entity: KgSuggestionEntity;
  target: KgSuggestionTarget;
  suggested_value: string | null;
  /** Stage B only: the cell's value at suggestion time (improve/flag_conflict). */
  current_value_snapshot: string | null;
  match_kind: KgMatchKind;
  confidence: number;
  status: KgSuggestionStatus;
  context_snippet: string | null;
  /** A note the user attached when deferring/rejecting/accepting (manager). */
  decision_note: string | null;
  /** User-flagged for follow-up (manager star column / filter). */
  is_starred: boolean;
  /** When the user first saw this row (FE-stamped); drives "new/unseen". */
  viewed_at: string | null;
  created_at: string;
  decided_at: string | null;
  suppressed_until: string | null;
}

// ── Enriched row (the `v_scope_suggestions` view shape) ──────────────────────
//
// The management table reads the denormalized, RLS-respecting view so it can
// sort/filter/paginate by human-readable names SERVER-SIDE. The enriched row
// extends the normalized `KgSuggestionRow` (so the shared decision card accepts
// it unchanged) with the joined org / scope-type / scope / item labels.

export interface KgEnrichedSuggestionRow extends KgSuggestionRow {
  orgName: string | null;
  orgSlug: string | null;
  scopeTypeId: string | null;
  scopeTypeLabel: string | null;
  scopeTypeSlug: string | null;
  scopeTypeIcon: string | null;
  scopeName: string | null;
  scopeSlug: string | null;
  itemLabel: string | null;
  itemKey: string | null;
}

// ── Management query (the power-user table read) ─────────────────────────────
//
// Distinct from the three cache-keyed `KgSuggestionsFilter` views: the manager
// is a free-form, multi-dimension table with server-side sort + pagination, so
// it has its own query params shape and its own (non-cached) read path.

export type KgSuggestionSortField =
  | "created_at"
  | "confidence"
  | "status"
  | "scope_name"
  | "item_label"
  | "org_name";

export interface KgSuggestionsQuery {
  /** Empty / undefined = every status. */
  statuses?: KgSuggestionStatus[];
  stage?: KgSuggestionStage | "all";
  orgId?: string | null;
  scopeTypeId?: string | null;
  scopeId?: string | null;
  itemId?: string | null;
  sourceKind?: string | null;
  matchKind?: KgMatchKind | null;
  minConfidence?: number | null;
  starredOnly?: boolean;
  unseenOnly?: boolean;
  /** ilike across item_label / scope_name / suggested_value. */
  search?: string | null;
  sortBy?: KgSuggestionSortField;
  sortDir?: "asc" | "desc";
  /** 0-based page index. */
  page?: number;
  pageSize?: number;
}

// ── Row predicates ───────────────────────────────────────────────────────────

/** `heavy_hitter`: no scope yet — accepting creates one (HeavyHitterAcceptDialog). */
export function isHeavyHitter(row: KgSuggestionRow): boolean {
  return row.stage === "association" && row.match_kind === "heavy_hitter";
}

/** A Stage-A link to an EXISTING scope — accepting tags the source to it. */
export function isAssociationLink(row: KgSuggestionRow): boolean {
  return (
    row.stage === "association" &&
    row.match_kind !== "heavy_hitter" &&
    !!row.target.scope_id
  );
}

/** A Stage-B slot-value proposal — accepting writes the cell. */
export function isValueSuggestion(row: KgSuggestionRow): boolean {
  return row.stage === "value";
}

// ── Decision result aliases ──────────────────────────────────────────────────
//
// Decisions now write directly to Supabase and resolve to nothing meaningful
// for the caller (the optimistic slice update is what the UI reacts to). These
// aliases keep the long-standing `(id) => Promise<KgAcceptResult>` prop
// signatures across surfaces intact without each one importing `void`.

export type KgAcceptResult = void;
export type KgDecisionResponse = void;

// ── Source-kind → taggable entity-type mapping ───────────────────────────────
//
// A suggestion's `source_kind` is a RAG source kind (note | task | project |
// cld_file | transcript | scraped | code_file | …). Only a subset maps to a
// taggable `ScopeAssignmentEntityType` (features/scopes/types.ts). Used by both
// the Stage-A link accept (tag the source to its target scope) and the
// heavy-hitter accept (tag the source to the freshly-created scope). The string
// values MUST match the `ScopeAssignmentEntityType` union; kept as a plain
// record (not importing the union) to avoid a cross-feature type cycle — the
// caller validates at the `setEntityScopes` boundary.

export const KG_SOURCE_KIND_TO_ENTITY_TYPE: Record<string, string> = {
  note: "note",
  task: "task",
  project: "project",
  conversation: "conversation",
  cld_file: "file",
};

/** Map a RAG source_kind to a taggable entity type, or `null` if untaggable. */
export function kgSourceKindToEntityType(sourceKind: string): string | null {
  return KG_SOURCE_KIND_TO_ENTITY_TYPE[sourceKind] ?? null;
}

// ── Filters ────────────────────────────────────────────────────────────────
//
// A suggestion list is always scoped to ONE of three views. The discriminated
// union below is the public addressing scheme the hook + chip + drawer share.
// `sourceKind` mirrors the row `source_kind` (a broad string, NOT the narrower
// `ScopeAssignmentEntityType` union — a suggestion's source is broader than the
// set of taggable entities).

export interface KgSourceFilter {
  /** Suggestions whose source is this entity (chip drop-in surfaces). */
  sourceKind: string;
  sourceId: string;
  status?: KgSuggestionStatus | "all";
}

export interface KgScopeItemFilter {
  /** Suggestions targeting one context-item slot (the per-slot panel; Stage B). */
  scopeItemId: string;
  status?: KgSuggestionStatus | "all";
}

export interface KgGlobalFilter {
  /** Every pending suggestion across the user's data (the global drawer). */
  global: true;
  status?: KgSuggestionStatus | "all";
}

export type KgSuggestionsFilter =
  | KgSourceFilter
  | KgScopeItemFilter
  | KgGlobalFilter;

// ── Filter-key derivation ────────────────────────────────────────────────────
//
// The slice caches lists keyed by a stable string derived from the filter.
// Every consumer (slice, hook, selector) derives the same key from the same
// filter so reads and writes line up.

export function kgFilterKey(filter: KgSuggestionsFilter): string {
  const status = filter.status ?? "pending";
  if ("global" in filter) return `global:${status}`;
  if ("scopeItemId" in filter)
    return `scopeItem:${filter.scopeItemId}:${status}`;
  return `source:${filter.sourceKind}:${filter.sourceId}:${status}`;
}
