// features/kg-suggestions/types.ts
//
// TS mirror of the aidream /kg-suggestions wire shapes
// (aidream/api/schemas/kg_suggestions.py). React → Python directly; these
// types must stay in sync with the Pydantic models. There is no generated
// OpenAPI types file for this surface yet (the kg-inspector sibling — Phase
// C.5 — hand-mirrors its shapes the same way; we follow that convention),
// so the inspector-specific shapes are declared here.
//
// A suggestion is a proposal to fill ONE scope-item slot (slot-fill) OR — for
// match_kind === "heavy_hitter" — to create a brand-new scope from a
// recurring unaffiliated entity. Suggestions are NEVER auto-applied: accept
// is the explicit user action.

/** Mirrors `MatchKind` Literal in the Python schema. */
export type KgMatchKind = "exact" | "fuzzy" | "semantic" | "heavy_hitter";

/** Mirrors `SuggestionStatus` Literal in the Python schema. */
export type KgSuggestionStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "deferred"
  | "expired";

/** The KG entity a suggestion points at (`SuggestionEntity`). */
export interface KgSuggestionEntity {
  id: string | null;
  kind: string | null;
  name: string | null;
}

/** The scope-item slot a suggestion proposes to fill (`SuggestionTarget`). */
export interface KgSuggestionTarget {
  scope_id: string | null;
  scope_item_id: string | null;
  slot_name: string | null;
}

/** One suggestion row (`SuggestionRow`). */
export interface KgSuggestionRow {
  id: string;
  source_kind: string;
  source_id: string;
  entity: KgSuggestionEntity;
  target: KgSuggestionTarget;
  suggested_value: string | null;
  match_kind: KgMatchKind;
  confidence: number;
  status: KgSuggestionStatus;
  context_snippet: string | null;
  created_at: string;
  decided_at: string | null;
  suppressed_until: string | null;
}

/** Paginated suggestion list (`SuggestionsPage`). */
export interface KgSuggestionsPage {
  suggestions: KgSuggestionRow[];
  total: number;
  limit: number;
  offset: number;
}

/** The scope-item cell value written on accept (`AcceptedValue`). */
export interface KgAcceptedValue {
  id: string;
  context_item_id: string;
  scope_id: string;
  version: number;
  value_text: string | null;
  source_type: string;
}

/** `POST /{id}/accept` response (`AcceptResponse`). */
export interface KgAcceptResponse {
  suggestion: KgSuggestionRow;
  value: KgAcceptedValue;
}

/** `POST /{id}/reject` and `/defer` response (`DecisionResponse`). */
export interface KgDecisionResponse {
  suggestion: KgSuggestionRow;
}

// ── Filters ────────────────────────────────────────────────────────────────
//
// A suggestion list is always scoped to ONE of three views. The discriminated
// union below is the public addressing scheme the hook + chip + drawer share.
// `sourceKind` mirrors the backend `source_kind` (note | task | project |
// transcript | scraped | cld_file | conversation | …) — it is deliberately a
// broad string, NOT the narrower `ScopeAssignmentEntityType` union, because a
// suggestion's source is broader than the set of taggable entities.

export interface KgSourceFilter {
  /** Suggestions whose source is this entity (chip drop-in surfaces). */
  sourceKind: string;
  sourceId: string;
  status?: KgSuggestionStatus | "all";
}

export interface KgScopeItemFilter {
  /** Suggestions targeting one scope-item slot (the per-slot panel). */
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

/** Server-side query params for `GET /kg-suggestions`. */
export interface KgSuggestionsListParams {
  status?: KgSuggestionStatus | "all";
  scopeItemId?: string | null;
  sourceKind?: string | null;
  sourceId?: string | null;
  limit?: number;
  offset?: number;
}

// ── Filter-key derivation ────────────────────────────────────────────────────
//
// The slice caches lists keyed by a stable string derived from the filter.
// Every consumer (slice, hook, selector) derives the same key from the same
// filter so reads and writes line up. Heavy-hitter accept needs a scope_type
// — see service for the request shape.

export function kgFilterKey(filter: KgSuggestionsFilter): string {
  const status = filter.status ?? "pending";
  if ("global" in filter) return `global:${status}`;
  if ("scopeItemId" in filter) return `scopeItem:${filter.scopeItemId}:${status}`;
  return `source:${filter.sourceKind}:${filter.sourceId}:${status}`;
}

export function kgFilterToParams(
  filter: KgSuggestionsFilter,
): KgSuggestionsListParams {
  const status = filter.status ?? "pending";
  if ("global" in filter) return { status };
  if ("scopeItemId" in filter) return { status, scopeItemId: filter.scopeItemId };
  return { status, sourceKind: filter.sourceKind, sourceId: filter.sourceId };
}
