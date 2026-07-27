/**
 * Surface manifest — Knowledge System (`matrx-user/knowledge`).
 *
 * ONE surface spanning the three WORKING routes of the Matrx Knowledge System:
 *
 *   /knowledge/extractions/[id]  → the extraction-dataset review grid
 *                                  (`features/page-extraction/data-review/
 *                                   ExtractionDatasetClient.tsx`, docproc.*)
 *   /knowledge/graph             → the entity/relationship canvas
 *                                  (`features/kg-graph/components/
 *                                   KgGraphCanvas.tsx`, aidream GET /kg/graph)
 *   /suggestions                 → the KG → scope suggestion review queue
 *                                  (`features/kg-suggestions/components/
 *                                   manager/SuggestionsManager.tsx`)
 *
 * `/knowledge` itself is DELIBERATELY not a value-bearing route: it is an
 * informational showcase (`features/knowledge/components/KnowledgeShowcasePage
 * .tsx`) that loads no data at all. It is the surface's urlPattern only
 * because it is the feature's front door; it emits nothing, and no manifest
 * value should ever be expected there.
 *
 * WHY /suggestions lives on THIS surface and is not a sibling: the suggestion
 * queue is not an independent product — every row in it is an OUTPUT of the
 * same extraction → graph pipeline the other two routes expose. A triage agent
 * needs the same vocabulary (entities, claims, source documents, scope
 * targets) that a graph or extraction agent needs, so one binding surface
 * serves all three. The trigger to split it into a sibling
 * (`matrx-user/knowledge-suggestions`) would be a genuinely different agent
 * fleet acting there — e.g. autonomous accept/reject policy agents that must
 * never be bound onto the graph canvas. That has not happened yet; if it does,
 * split and inherit from this surface rather than forking the vocabulary.
 *
 * Runtime emitters (three, one per working route — each mounts its own
 * `<SurfaceRuntimeProvider surfaceName="matrx-user/knowledge">` and builds
 * scope at trigger time from live state):
 *   - ExtractionDatasetClient.tsx  → extraction_* values
 *   - KgGraphCanvas.tsx            → graph_* values
 *   - SuggestionsManager.tsx       → suggestions_* / focused_suggestion values
 *
 * Because the routes are disjoint, NOTHING is `alwaysAvailable` here: an agent
 * launched on the graph canvas sees no extraction values and vice versa. Read
 * the intro before assuming a value is present.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "extraction_run",
    label: "Extraction run",
    sortOrder: 100,
    description:
      "Identity and status of the structured-extraction job whose dataset the user is reviewing.",
  },
  {
    key: "extraction_data",
    label: "Extraction results",
    sortOrder: 200,
    description:
      "The extracted rows, their derived columns, and the user's row selection.",
  },
  {
    key: "extraction_view",
    label: "Extraction view state",
    sortOrder: 250,
    description:
      "How the review grid is currently filtered, sorted, merged, and paged.",
  },
  {
    key: "graph_scope",
    label: "Graph scope",
    sortOrder: 300,
    description:
      "Which organization / scope neighborhood the knowledge graph is drawn for.",
  },
  {
    key: "graph_data",
    label: "Graph data",
    sortOrder: 400,
    description:
      "The entity/edge payload returned by the knowledge-graph service and the node the user has selected.",
  },
  {
    key: "graph_view",
    label: "Graph view state",
    sortOrder: 450,
    description:
      "Detail level, layout, encodings, and filters the user has applied to the canvas.",
  },
  {
    key: "suggestions_queue",
    label: "Suggestion queue",
    sortOrder: 500,
    description:
      "The KG → scope suggestion review queue: counts, the active query, and the visible rows.",
  },
  {
    key: "suggestion_focus",
    label: "Focused suggestion",
    sortOrder: 600,
    description:
      "The single suggestion the user has expanded, plus any multi-select for bulk triage.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ---------------------------------------------------------------- extraction
  {
    name: "extraction_job_id",
    label: "Extraction job ID",
    description:
      "UUID of the `docproc.page_extraction_jobs` row being reviewed (the `[id]` route param). Empty on every route other than /knowledge/extractions/[id].",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "extraction_run",
    sortOrder: 100,
  },
  {
    name: "extraction_job_name",
    label: "Extraction job name",
    description:
      "User-facing name of the extraction dataset. Empty when the job has not loaded or the user is not on the extraction route.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    group: "extraction_run",
    sortOrder: 110,
  },
  {
    name: "extraction_job_status",
    label: "Extraction job status",
    description:
      "Lifecycle status of the extraction job as stored on the job row (e.g. queued / running / complete / failed). Empty when no job is loaded.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    group: "extraction_run",
    sortOrder: 120,
  },
  {
    name: "extraction_run_id",
    label: "Selected extraction run",
    description:
      "UUID of the single `docproc.page_extraction_runs` row the grid is filtered to. Empty when the user is viewing results from ALL runs of the job.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "extraction_run",
    sortOrder: 130,
  },
  {
    name: "extraction_job",
    label: "Extraction job record",
    description:
      "Composite of the loaded extraction job row (id, name, status, schema/prompt configuration, timestamps). Empty when no job is loaded.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 900,
    group: "extraction_run",
    sortOrder: 140,
  },
  {
    name: "extraction_row_count",
    label: "Extracted row count",
    description:
      "Number of result rows currently displayed after filtering and merging. Zero when the dataset is empty or not loaded.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "extraction_data",
    sortOrder: 200,
  },
  {
    name: "extraction_columns",
    label: "Extracted columns",
    description:
      "The column keys derived from the extracted payloads, in the user's persisted order, with hidden columns marked. Empty when no results are loaded.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 400,
    group: "extraction_data",
    sortOrder: 210,
  },
  {
    name: "extraction_rows",
    label: "Extracted rows",
    description:
      "The visible page of extracted result payloads (entities, claims, and fields the extraction produced). Large — bindable only, never auto-shipped. Empty when no results are loaded.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 20000,
    autoContext: false,
    group: "extraction_data",
    sortOrder: 220,
  },
  {
    name: "extraction_selected_row_ids",
    label: "Selected result rows",
    description:
      "IDs of the result rows the user has checked for a bulk action. Empty array when nothing is selected.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 400,
    group: "extraction_data",
    sortOrder: 230,
  },
  {
    name: "extraction_query",
    label: "Grid search query",
    description:
      "Free-text filter the user typed over the extraction grid. Empty when unfiltered.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    group: "extraction_view",
    sortOrder: 300,
  },
  {
    name: "extraction_sort",
    label: "Grid sort",
    description:
      "Current grid sort as `{ key, direction }`. Empty when the user has not sorted (natural result order).",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 50,
    group: "extraction_view",
    sortOrder: 310,
  },
  {
    name: "extraction_page",
    label: "Grid paging",
    description:
      "Current paging position as `{ pageIndex, pageSize }` over the filtered rows. Empty when no results are loaded.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 40,
    group: "extraction_view",
    sortOrder: 320,
  },
  {
    name: "extraction_merge_duplicates",
    label: "Merge duplicates enabled",
    description:
      "True when the grid is collapsing duplicate extracted rows into one merged row with a count. Absent outside the extraction route.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "extraction_view",
    sortOrder: 330,
  },

  // --------------------------------------------------------------------- graph
  {
    name: "graph_organization_id",
    label: "Graph organization",
    description:
      "UUID of the organization whose knowledge graph is being drawn (from `?org=` or the active context). Empty when unresolved or off the graph route.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "graph_scope",
    sortOrder: 400,
  },
  {
    name: "graph_scope_id",
    label: "Graph scope filter",
    description:
      "UUID of the scope whose neighborhood the graph is limited to. Empty when the user is viewing the whole organization graph.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "graph_scope",
    sortOrder: 410,
  },
  {
    name: "graph_scope_type_id",
    label: "Graph scope type filter",
    description:
      "UUID of the scope TYPE the graph is filtered to (e.g. Client, Case). Empty when no scope-type filter is applied.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "graph_scope",
    sortOrder: 420,
  },
  {
    name: "graph_node_count",
    label: "Visible node count",
    description:
      "Number of entity nodes currently drawn after kind/noise/search filtering. Zero before the payload loads.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "graph_data",
    sortOrder: 500,
  },
  {
    name: "graph_edge_count",
    label: "Visible edge count",
    description:
      "Number of relationship edges currently drawn between visible nodes. Zero before the payload loads.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "graph_data",
    sortOrder: 510,
  },
  {
    name: "graph_entity_kinds",
    label: "Entity kinds present",
    description:
      "Distinct entity kinds found in the loaded payload (person, org, concept, …), used as the kind filter's options. Empty before the payload loads.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 200,
    group: "graph_data",
    sortOrder: 520,
  },
  {
    name: "graph_truncated",
    label: "Graph truncated",
    description:
      "True when more visible nodes existed than the detail level's cap, so the drawn graph is a subset. Absent before the payload loads.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "graph_data",
    sortOrder: 530,
  },
  {
    name: "graph_payload",
    label: "Graph payload",
    description:
      "The full nodes + edges payload returned by the knowledge-graph service for the current scope and detail level. Very large — bindable only, never auto-shipped. Empty before it loads.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 60000,
    autoContext: false,
    group: "graph_data",
    sortOrder: 540,
  },
  {
    name: "graph_selected_entity",
    label: "Selected entity",
    description:
      "The entity node the user clicked, with its kind, label, mention/source counts and average confidence. Empty when nothing is selected.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 400,
    group: "graph_data",
    sortOrder: 550,
  },
  {
    name: "graph_kind_filter",
    label: "Entity kind filter",
    description:
      "The single entity kind the canvas is filtered to. Empty (or the all-kinds sentinel) when unfiltered.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 16,
    group: "graph_view",
    sortOrder: 600,
  },
  {
    name: "graph_search",
    label: "Graph search",
    description:
      "Free-text term the user typed to highlight/narrow nodes on the canvas. Empty when not searching.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    group: "graph_view",
    sortOrder: 610,
  },
  {
    name: "graph_detail_level",
    label: "Graph detail level",
    description:
      "The selected detail tier, which sets the node cap requested from the service. Absent off the graph route.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    group: "graph_view",
    sortOrder: 620,
  },
  {
    name: "graph_layout",
    label: "Graph layout",
    description:
      "The active cytoscape layout algorithm (e.g. fcose). Absent off the graph route.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    group: "graph_view",
    sortOrder: 630,
  },
  {
    name: "graph_view_state",
    label: "Graph view state",
    description:
      "Composite of every canvas control: detail level, layout, colour-by, size-by, kind filter, search, hide-noise, and the community count. Empty off the graph route.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 250,
    group: "graph_view",
    sortOrder: 640,
  },

  // --------------------------------------------------------------- suggestions
  {
    name: "suggestions_total",
    label: "Total suggestions",
    description:
      "Server count of suggestions matching the active query (across all pages). Zero when the queue is empty; absent off /suggestions.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "suggestions_queue",
    sortOrder: 700,
  },
  {
    name: "suggestions_pending_count",
    label: "Pending suggestions",
    description:
      "Number of suggestions still awaiting a decision, from the queue's stats rollup. Absent off /suggestions.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "suggestions_queue",
    sortOrder: 710,
  },
  {
    name: "suggestions_deferred_count",
    label: "Deferred suggestions",
    description:
      "Number of suggestions the user deferred rather than accepting or rejecting. Absent off /suggestions.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "suggestions_queue",
    sortOrder: 720,
  },
  {
    name: "suggestions_starred_count",
    label: "Starred suggestions",
    description:
      "Number of suggestions the user starred for follow-up. Absent off /suggestions.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "suggestions_queue",
    sortOrder: 730,
  },
  {
    name: "suggestions_low_quality_count",
    label: "Low-quality suggestions",
    description:
      "Number of matching suggestions below the low-confidence threshold, held in the collapsed low-quality bucket. Absent off /suggestions.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "suggestions_queue",
    sortOrder: 740,
  },
  {
    name: "suggestions_query",
    label: "Queue query",
    description:
      "The active queue filter as `{ statuses, stage, sortBy, sortDir, page, pageSize, ...scope filters }`. Absent off /suggestions.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 200,
    group: "suggestions_queue",
    sortOrder: 750,
  },
  {
    name: "suggestions_rows",
    label: "Visible suggestions",
    description:
      "The current page of enriched suggestion rows (proposed value or scope link, confidence, match kind, source reference, target scope/item). Large — bindable only. Empty when the queue is empty.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 12000,
    autoContext: false,
    group: "suggestions_queue",
    sortOrder: 760,
  },
  {
    name: "suggestions_stats",
    label: "Queue stats",
    description:
      "The per-organization/status/starred rollup rows behind the queue's counters. Empty before the stats load.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 600,
    group: "suggestions_queue",
    sortOrder: 770,
  },
  {
    name: "focused_suggestion_id",
    label: "Focused suggestion ID",
    description:
      "ID of the single suggestion row the user has expanded for review. Empty when no row is expanded.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "suggestion_focus",
    sortOrder: 800,
  },
  {
    name: "focused_suggestion",
    label: "Focused suggestion",
    description:
      "The expanded suggestion row in full: what is being proposed, its confidence and match kind, the source it came from, and the scope/item it targets. Empty when no row is expanded.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 900,
    group: "suggestion_focus",
    sortOrder: 810,
  },
  {
    name: "suggestions_selected_ids",
    label: "Selected suggestions",
    description:
      "IDs of the suggestions the user has checked for a bulk accept / defer / reject / star. Empty array when nothing is selected.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 400,
    group: "suggestion_focus",
    sortOrder: 820,
  },
];

export const knowledgeManifest: SurfaceManifest = {
  surfaceName: "matrx-user/knowledge",
  readiness: "partial",
  readinessNote:
    "Manifest + all three route emitters are wired (extraction grid, graph canvas, suggestion queue), but the surface has not been live-verified with a non-matching-name binding, no `data-surface-value` anchors are tagged for Locate, and `/knowledge` itself is a data-less showcase page so the feature's front door emits nothing.",
  label: "Knowledge System",
  urlPattern: "/knowledge",
  intro: `<surface_intro>
You are on the Matrx Knowledge System — the pipeline that turns documents into structured extractions, then into an entity/relationship graph, then into reviewable suggestions that attach knowledge to the user's scopes.
This ONE surface spans three separate routes, and WHICH VALUES EXIST DEPENDS ON WHERE THE USER IS. Nothing here is guaranteed; check for emptiness before reasoning about a value.
  - /knowledge/extractions/[id] — the extraction review grid. You get extraction_job_id, extraction_job, extraction_job_status, extraction_run_id, extraction_columns, extraction_row_count, extraction_rows (bindable only), the user's selection, and the grid's query/sort/paging/merge state. NO graph or suggestion values exist here.
  - /knowledge/graph — the entity canvas. You get graph_organization_id, graph_scope_id, graph_node_count, graph_edge_count, graph_entity_kinds, graph_truncated, graph_selected_entity, the view state, and graph_payload (bindable only). NO extraction or suggestion values exist here.
  - /suggestions — the review queue for KG → scope suggestions. You get the counts (total, pending, deferred, starred, low-quality), suggestions_query, suggestions_stats, suggestions_rows (bindable only), suggestions_selected_ids, and the focused_suggestion the user expanded. NO extraction or graph values exist here.
  - /knowledge itself is an informational showcase page that loads no data. It emits nothing.
Two rules for acting here. First, extracted rows, graph nodes, and suggestions are all EVIDENCE derived from the user's own sources — never invent an entity, claim, edge, or source citation that is not present in the values you were given. Second, a suggestion is a PROPOSAL: accepting one writes to the user's scopes, so recommend a decision and explain the evidence behind it rather than asserting a fact.
When graph_truncated is true the drawn graph is a capped subset — say so rather than describing it as the complete picture.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
};

/**
 * Typed scope builder — "a UI cannot lie". Every key is optional because the
 * three routes on this surface are disjoint: no value is emitted on every
 * launch (see the manifest's `alwaysAvailable: false` across the board).
 */
export function createKnowledgeScope(values: {
  // extraction
  extraction_job_id?: string;
  extraction_job_name?: string;
  extraction_job_status?: string;
  extraction_run_id?: string;
  extraction_job?: Record<string, unknown>;
  extraction_row_count?: number;
  extraction_columns?: Array<Record<string, unknown>>;
  extraction_rows?: Array<Record<string, unknown>>;
  extraction_selected_row_ids?: string[];
  extraction_query?: string;
  extraction_sort?: Record<string, unknown>;
  extraction_page?: Record<string, unknown>;
  extraction_merge_duplicates?: boolean;
  // graph
  graph_organization_id?: string;
  graph_scope_id?: string;
  graph_scope_type_id?: string;
  graph_node_count?: number;
  graph_edge_count?: number;
  graph_entity_kinds?: string[];
  graph_truncated?: boolean;
  graph_payload?: Record<string, unknown>;
  graph_selected_entity?: Record<string, unknown>;
  graph_kind_filter?: string;
  graph_search?: string;
  graph_detail_level?: string;
  graph_layout?: string;
  graph_view_state?: Record<string, unknown>;
  // suggestions
  suggestions_total?: number;
  suggestions_pending_count?: number;
  suggestions_deferred_count?: number;
  suggestions_starred_count?: number;
  suggestions_low_quality_count?: number;
  suggestions_query?: Record<string, unknown>;
  suggestions_rows?: Array<Record<string, unknown>>;
  suggestions_stats?: Array<Record<string, unknown>>;
  focused_suggestion_id?: string;
  focused_suggestion?: Record<string, unknown>;
  suggestions_selected_ids?: string[];
  // baselines
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
