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

/**
 * `POST /{id}/accept` response for a cell-value (slot-fill) suggestion
 * (`AcceptResponse`). Distinguished from the heavy-hitter plan below by the
 * presence of `value` (the heavy-hitter plan has none).
 */
export interface KgAcceptResponse {
  suggestion: KgSuggestionRow;
  value: KgAcceptedValue;
}

/**
 * One source the heavy-hitter entity was mentioned in (`HeavyHitterSource`).
 * The FE tags each of these to the newly-created scope via
 * ctx_scope_assignments after creation. `source_kind` is a RAG source kind
 * (note | task | project | cld_file | transcript | scraped | code_file |
 * repository | library_doc) — only a subset maps to a taggable
 * `ScopeAssignmentEntityType`; see `kgSourceKindToEntityType`.
 */
export interface KgHeavyHitterSource {
  source_kind: string;
  source_id: string;
  mention_count: number;
}

/**
 * `POST /{id}/accept` response for a `match_kind="heavy_hitter"` suggestion
 * (`HeavyHitterAcceptPlan`). Heavy-hitter acceptance CREATES A NEW SCOPE
 * (not a cell value): the backend flips the suggestion to `accepted` and
 * returns this plan; the FE creates the scope (canonical `create_scope` RPC)
 * and tags every `sources` mention to it via `ctx_scope_assignments`.
 *
 * The discriminator `kind === "heavy_hitter_plan"` lets the accept caller
 * branch without inspecting other fields.
 */
export interface KgHeavyHitterAcceptPlan {
  kind: "heavy_hitter_plan";
  suggestion: KgSuggestionRow;
  entity_id: string;
  entity_kind: string;
  suggested_scope_name: string;
  sources: KgHeavyHitterSource[];
}

/**
 * Union returned by `POST /{id}/accept`. A slot-fill accept yields
 * `KgAcceptResponse`; a heavy-hitter accept yields `KgHeavyHitterAcceptPlan`.
 * Narrow on the `"kind"` discriminator (only the plan carries it).
 */
export type KgAcceptResult = KgAcceptResponse | KgHeavyHitterAcceptPlan;

/** Type guard: is this accept response the heavy-hitter scope-creation plan? */
export function isHeavyHitterPlan(
  res: KgAcceptResult,
): res is KgHeavyHitterAcceptPlan {
  return "kind" in res && res.kind === "heavy_hitter_plan";
}

// ── Source-kind → taggable entity-type mapping ───────────────────────────────
//
// Heavy-hitter sources carry a RAG `source_kind` (note | task | project |
// cld_file | transcript | scraped | code_file | repository | library_doc —
// matrx-rag/sources.py). Only a subset corresponds to a taggable
// `ScopeAssignmentEntityType` (features/scopes/types.ts). Sources without a
// taggable counterpart are NOT silently dropped — the accept flow counts and
// reports them so the user knows N mentions couldn't be tagged. The string
// values below MUST match the `ScopeAssignmentEntityType` union; we keep this
// as a plain record (not importing the union here) to avoid a cross-feature
// type cycle — the caller passes the result straight into `setEntityScopes`,
// which validates against the union at its own boundary.

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
// filter so reads and writes line up. Heavy-hitter accept takes no request
// body — it returns a KgHeavyHitterAcceptPlan the FE drives (create scope +
// tag sources). See service + useHeavyHitterAccept for the flow.

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
