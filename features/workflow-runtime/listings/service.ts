// features/workflow-runtime/listings/service.ts
//
// What the workflow PICKER reads. Nothing new: the canonical list RPC
// (`wfx_list_scoped`, already behind /workflows/all) answers the list, its
// siblings answer the tab counts and the category/tag options, and the runs
// list's batched `fetchWorkflowFacts` decorates each page with the one field
// the RPC does not return — the declared `output_kind`.
//
// A picker with its own query would be a second reading of "which workflows
// exist", and the two would drift the first time a scope predicate changed.

import {
  fetchWorkflowBrowsePage,
  fetchWorkflowFacets,
  fetchWorkflowScopeCounts,
} from "../browse/service";
import { fetchWorkflowFacts } from "../discovery/service";
import { fetchWorkflowDefinition } from "../surface/service";
import type { WorkflowDefinitionLike } from "../trigger-points";
import { supabase } from "@/utils/supabase/client";
import type {
  EntityFilters,
  EntityListQuery,
  EntityScopeCounts,
} from "@/lib/entity-list/types";
import type { ListScope } from "@/lib/list-scope/types";
import {
  sortArgs,
  toWorkflowListRecord,
  type WorkflowListRecord,
  type WorkflowSortOption,
  type WorkflowTab,
} from "./types";

/** How many rows one popover page holds. Deliberately generous — the list
 *  scrolls, and a picker that silently stops at 25 reads as "that is all". */
export const WORKFLOW_PICKER_PAGE_SIZE = 200;

function scopeOf(tab: WorkflowTab): ListScope {
  return tab === "orgs" ? { kind: "orgs", organizationId: null } : { kind: tab };
}

export interface WorkflowPickerQuery {
  tab: WorkflowTab;
  search: string;
  /** Reach inside the steps as well as the name/description. Opt-in. */
  deep: boolean;
  includedCats: string[];
  includedTags: string[];
  /** "all" (default), "yes" (favorites only), "no" (non-favorites only). */
  favFilter: "all" | "yes" | "no";
  archived: "active" | "archived" | "all";
  sortBy: WorkflowSortOption;
  favoritesFirst: boolean;
}

function filtersOf(query: WorkflowPickerQuery): EntityFilters {
  const filters: EntityFilters = {};
  if (query.includedCats.length > 0) {
    filters.category = { kind: "select", values: query.includedCats };
  }
  if (query.includedTags.length > 0) {
    filters.tags = { kind: "select", values: query.includedTags };
  }
  if (query.favFilter !== "all") {
    filters.favorite = { kind: "boolean", value: query.favFilter === "yes" };
  }
  return filters;
}

function listQueryOf(query: WorkflowPickerQuery): EntityListQuery {
  return {
    scope: scopeOf(query.tab),
    search: query.search,
    deep: query.deep,
    archived: query.archived,
    filters: filtersOf(query),
    page: 1,
  };
}

export interface WorkflowPickerPage {
  records: WorkflowListRecord[];
  total: number;
}

/**
 * ONE page of the picker's list, decorated with declared output kinds.
 *
 * The kind read is best-effort DECORATION: a workflow whose kind cannot be
 * read still lists and still selects — it simply shows no kind badge, which is
 * the honest rendering of "not known here" rather than an empty list.
 */
export async function fetchWorkflowPickerPage(
  query: WorkflowPickerQuery,
): Promise<WorkflowPickerPage> {
  const { sort, direction } = sortArgs(query.sortBy);
  const page = await fetchWorkflowBrowsePage(listQueryOf(query), {
    sort,
    direction,
    favoritesFirst: query.favoritesFirst,
    pageSize: WORKFLOW_PICKER_PAGE_SIZE,
  });

  let kinds = new Map<string, { outputKind: string | null }>();
  try {
    kinds = await fetchWorkflowFacts(page.rows.map((row) => row.id));
  } catch {
    // Decoration, not the record — see the doc comment above.
  }

  return {
    records: page.rows.map((row) =>
      toWorkflowListRecord(row, kinds.get(row.id)?.outputKind ?? null),
    ),
    total: page.total,
  };
}

/** Every tab's true total, one round trip — the numbers on the tab strip. */
export async function fetchWorkflowPickerCounts(
  query: WorkflowPickerQuery,
): Promise<EntityScopeCounts> {
  return fetchWorkflowScopeCounts(listQueryOf(query));
}

export interface WorkflowPickerFacetOptions {
  categories: string[];
  tags: string[];
}

/** Category + tag OPTIONS for the current scope, most-used first. */
export async function fetchWorkflowPickerFacets(
  query: WorkflowPickerQuery,
): Promise<WorkflowPickerFacetOptions> {
  const facets = await fetchWorkflowFacets(listQueryOf(query));
  return {
    categories: (facets.byKind.category ?? []).map((v) => v.value),
    tags: (facets.byKind.tag ?? []).map((v) => v.value),
  };
}

/** Everything the sneak peek shows about one workflow. */
export interface WorkflowPeek {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  tags: string[];
  version: number | null;
  inputKind: string | null;
  outputKind: string | null;
  variables: unknown[];
  definition: WorkflowDefinitionLike;
}

/**
 * The peek read. The graph comes from the canonical `fetchWorkflowDefinition`
 * (which owns the tolerant node/edge parse); the scalar declarations ride a
 * second narrow select on the same row.
 */
export async function fetchWorkflowPeek(
  workflowId: string,
): Promise<WorkflowPeek | null> {
  const [graph, scalars] = await Promise.all([
    fetchWorkflowDefinition(workflowId),
    supabase
      .schema("workflow")
      .from("definition")
      .select(
        "id,name,description,category,tags,version,input_kind,output_kind,variables",
      )
      .eq("id", workflowId)
      .is("deleted_at", null)
      .maybeSingle(),
  ]);

  if (scalars.error) throw scalars.error;
  const row = scalars.data;
  if (!row) return null;

  return {
    id: row.id,
    name: row.name || "Untitled",
    description: row.description ?? null,
    category: row.category ?? null,
    tags: row.tags ?? [],
    version: row.version ?? null,
    inputKind: row.input_kind ?? null,
    outputKind: row.output_kind ?? null,
    variables: Array.isArray(row.variables) ? row.variables : [],
    definition: graph?.definition ?? { nodes: [], edges: [] },
  };
}

/**
 * ONE workflow, read directly, for the record the picker must name even when
 * the current tab/filter does not contain it — the assigned holder.
 *
 * 🚨 Everything this read cannot know stays `null`, never 0: it does not go
 * through `wfx_list_scoped`, so it has no access level, owner email or org
 * name to report, and the detail card omits those rows rather than inventing
 * them. Step count IS knowable here (the graph is on the row) and the run
 * count rides a `head` count, so neither is faked.
 */
export async function fetchWorkflowRecordById(
  workflowId: string,
): Promise<WorkflowListRecord | null> {
  const [definition, runs] = await Promise.all([
    supabase
      .schema("workflow")
      .from("definition")
      .select(
        "id,name,description,category,tags,is_favorite,is_archived,is_active,visibility,version,created_at,updated_at,output_kind,nodes",
      )
      .eq("id", workflowId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .schema("workflow")
      .from("run")
      .select("id", { count: "exact", head: true })
      .eq("definition_id", workflowId),
  ]);

  if (definition.error) throw definition.error;
  const row = definition.data;
  if (!row) return null;

  return {
    id: row.id,
    name: row.name || "Untitled",
    description: row.description ?? null,
    category: row.category ?? null,
    tags: row.tags ?? [],
    isFavorite: Boolean(row.is_favorite),
    isOwner: null,
    accessLevel: null,
    visibility: row.visibility ?? null,
    organizationName: null,
    ownerEmail: null,
    version: row.version ?? null,
    stepCount: Array.isArray(row.nodes) ? row.nodes.length : null,
    runCount: runs.error ? null : (runs.count ?? null),
    lastRunAt: null,
    lastRunStatus: null,
    lastRunId: null,
    isArchived: Boolean(row.is_archived),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    outputKind: row.output_kind ?? null,
  };
}
