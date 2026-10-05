// features/cx-dashboard/explorer/service.ts — THE ADMIN CONVERSATION EXPLORER's one client.
//
// Every query runs in the database over the WHOLE platform: search, every column filter, sort and
// paging go to `chat.admin_explore_conversations` (super-admin gated, admin lane), never over a
// page already in the browser. The table is in `controlled` mode with every query control
// source-owned, so what the person filters is what the database filtered.
//
// Filter choices (people, organizations, agents, models, sources, statuses) come with counts from
// `chat.admin_explore_conversation_facets`, so an admin picks a person by NAME or EMAIL — never an id.

import { supabase } from "@/utils/supabase/client";
import { dateFilterBounds } from "@ai-matrx/design-system/data-table";
import type {
  ColumnFiltersState,
  ColumnFilterValue,
  MatrxDataTableQueryState,
} from "@ai-matrx/design-system/data-table/types";

export interface ExplorerConversation {
  id: string;
  title: string | null;
  status: string | null;
  message_count: number;
  request_count: number;
  total_tokens: number;
  total_cost: number;
  created_at: string;
  updated_at: string;
  owner_id: string | null;
  owner_label: string | null;
  owner_email: string | null;
  organization_id: string | null;
  organization_name: string | null;
  agent_id: string | null;
  agent_name: string | null;
  last_model_id: string | null;
  last_model_name: string | null;
  model_names: string[];
  source_app: string | null;
  source_feature: string | null;
  origin_class: string | null;
  conversation_type: string | null;
  parent_conversation_id: string | null;
  last_request_status: string | null;
}

export interface FacetOption {
  value: string;
  label: string;
  count: number;
  hint?: string | null;
}

export interface ExplorerFacets {
  owners: FacetOption[];
  organizations: FacetOption[];
  agents: FacetOption[];
  models: FacetOption[];
  source_apps: FacetOption[];
  source_features: FacetOption[];
  origin_classes: FacetOption[];
  statuses: FacetOption[];
}

export const EMPTY_FACETS: ExplorerFacets = {
  owners: [],
  organizations: [],
  agents: [],
  models: [],
  source_apps: [],
  source_features: [],
  origin_classes: [],
  statuses: [],
};

/** Table column id → the explorer's filter key, by filter kind. */
const SELECT_KEYS: Record<string, string> = {
  owner: "owner_ids",
  organization: "organization_ids",
  agent: "agent_ids",
  model: "model_ids",
  source_app: "source_apps",
  source_feature: "source_features",
  origin_class: "origin_classes",
  status: "statuses",
};
const NUMBER_KEYS: Record<string, string> = {
  message_count: "messages",
  request_count: "requests",
  total_tokens: "tokens",
  total_cost: "cost",
};
const DATE_KEYS: Record<string, string> = { created_at: "created", updated_at: "updated" };

/** The column ids the database can sort by (everything else keeps the default order). */
const SORTABLE: Record<string, string> = {
  title: "title",
  owner: "owner_label",
  organization: "organization_name",
  agent: "agent_name",
  model: "last_model_name",
  message_count: "message_count",
  request_count: "request_count",
  total_tokens: "total_tokens",
  total_cost: "total_cost",
  created_at: "created_at",
  updated_at: "updated_at",
  source_app: "source_app",
  source_feature: "source_feature",
  origin_class: "origin_class",
  status: "status",
};

function selectValues(f: ColumnFilterValue): string[] {
  if (f.kind !== "select") return [];
  return f.values ?? (f.value ? [f.value] : []);
}

/** The table's controlled query state → the database function's filter bag. */
export function explorerFilters(state: MatrxDataTableQueryState, topLevelOnly: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (state.search.trim()) out.search = state.search.trim();
  if (topLevelOnly) out.top_level_only = true;
  const filters: ColumnFiltersState = state.columnFilters;
  for (const [id, f] of Object.entries(filters)) {
    if (!f) continue;
    if (id === "title" && f.kind === "text" && f.value.trim()) out.title = f.value.trim();
    else if (SELECT_KEYS[id] && f.kind === "select") {
      const values = selectValues(f);
      if (values.length) out[SELECT_KEYS[id]] = values;
    } else if (NUMBER_KEYS[id] && f.kind === "number") {
      const key = NUMBER_KEYS[id];
      const op = f.op ?? "between";
      // eq = both bounds; lt / gt are strict in the table, inclusive here by one unit of
      // the column's scale, which is close enough for counts and never hides the bound row.
      if ((op === "between" || op === "eq" || op === "gt") && f.min !== undefined) out[`min_${key}`] = f.min;
      if ((op === "between" || op === "eq" || op === "lt") && f.max !== undefined) out[`max_${key}`] = f.max;
    } else if (DATE_KEYS[id] && f.kind === "date") {
      const bounds = dateFilterBounds(f);
      if (bounds.since) out[`${DATE_KEYS[id]}_since`] = bounds.since;
      if (bounds.until) out[`${DATE_KEYS[id]}_until`] = bounds.until;
    }
  }
  return out;
}

export async function exploreConversations(
  state: MatrxDataTableQueryState,
  topLevelOnly: boolean,
): Promise<{ rows: ExplorerConversation[]; total: number }> {
  const sortColumn = state.sort ? SORTABLE[state.sort.id] : undefined;
  const { data, error } = await supabase.schema("chat").rpc("admin_explore_conversations", {
    p_filters: explorerFilters(state, topLevelOnly) as never,
    p_sort: sortColumn ?? "updated_at",
    p_dir: sortColumn ? state.sort?.direction ?? "desc" : "desc",
    p_limit: state.pageSize,
    p_offset: (Math.max(state.page, 1) - 1) * state.pageSize,
  });
  if (error) throw new Error(error.message);
  const answer = (data ?? {}) as { rows?: ExplorerConversation[]; total?: number };
  return { rows: answer.rows ?? [], total: Number(answer.total ?? 0) };
}

export async function exploreConversationFacets(): Promise<ExplorerFacets> {
  const { data, error } = await supabase
    .schema("chat")
    .rpc("admin_explore_conversation_facets", { p_filters: {} as never });
  if (error) throw new Error(error.message);
  return { ...EMPTY_FACETS, ...((data ?? {}) as Partial<ExplorerFacets>) };
}
