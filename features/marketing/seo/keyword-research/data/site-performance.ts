import type { MatrxDataTableQueryState } from "@/components/official/matrx-data-table/types";
import type { Database, Json } from "@/types/database.types";
import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import { guardedUpdate } from "@/utils/supabase/guardedUpdate";

import type {
  SiteKeywordPerformancePage,
  SiteKeywordPerformanceRow,
} from "../types";
import type {
  EditableKeywordWorkflowStatus,
  KeywordWorkflowStatus,
} from "../workflow-status";

type SiteKeywordValueRow =
  Database["seo"]["Tables"]["site_keyword_value"]["Row"];

const SITE_KEYWORD_STAGE_COLUMNS = "id, workflow_status, version" as const;

export interface UpdateSiteKeywordWorkflowInput {
  organizationId: string;
  siteId: string;
  keywordId: string;
  expectedStatus: KeywordWorkflowStatus | null;
  nextStatus: EditableKeywordWorkflowStatus;
}

export class SiteKeywordWorkflowConflictError extends Error {
  constructor() {
    super(
      "This keyword's SEO stage changed in another session. The table has been refreshed; review the current stage and try again.",
    );
    this.name = "SiteKeywordWorkflowConflictError";
  }
}

type SiteKeywordPerformanceRpcArgs =
  Database["seo"]["Functions"]["site_keyword_performance_page"]["Args"];
type SiteKeywordPerformanceRpcRow =
  Database["seo"]["Functions"]["site_keyword_performance_page"]["Returns"][number];

const SORT_COLUMNS = new Set<keyof SiteKeywordPerformanceRow>([
  "query",
  "clicks",
  "impressions",
  "ctr",
  "average_position",
  "search_volume",
  "cpc",
  "competition_index",
  "competition",
  "priority_score",
  "top_page_path",
  "last_date",
  "workflow_status",
]);

function cleanSearch(value: string): string {
  return value
    .trim()
    .replace(/[(),"'\\%]/g, " ")
    .trim();
}

function appendNumberFilter(
  filters: Record<string, Json>,
  column: string,
  state: MatrxDataTableQueryState,
  displayScale = 1,
): void {
  const filter = state.columnFilters[column];
  if (filter?.kind !== "number") return;
  if (filter.min !== undefined)
    filters[`${column}_min`] = filter.min / displayScale;
  if (filter.max !== undefined)
    filters[`${column}_max`] = filter.max / displayScale;
}

function selectValues(
  state: MatrxDataTableQueryState,
  column: string,
): string[] {
  const filter = state.columnFilters[column];
  if (filter?.kind !== "select") return [];
  if (filter.values?.length) return filter.values;
  return filter.value ? [filter.value] : [];
}

/** Translate the canonical table state into the one bounded database call. */
export function buildSiteKeywordPerformanceRpcArgs(
  siteId: string,
  state: MatrxDataTableQueryState,
): SiteKeywordPerformanceRpcArgs {
  const filters: Record<string, Json> = {};

  for (const column of ["query", "top_page_path"]) {
    const filter = state.columnFilters[column];
    if (filter?.kind !== "text") continue;
    const mode = filter.mode ?? "contains";
    const value = cleanSearch(filter.value);
    if (mode === "contains" && !value) continue;
    filters[`${column}_mode`] = mode;
    if (mode === "contains") filters[`${column}_value`] = value;
  }

  for (const column of ["workflow_status", "provider", "competition"]) {
    const values = selectValues(state, column);
    if (values.length) filters[column] = values;
  }

  for (const column of [
    "clicks",
    "impressions",
    "ctr",
    "average_position",
    "search_volume",
    "cpc",
    "competition_index",
    "priority_score",
  ]) {
    appendNumberFilter(filters, column, state, column === "ctr" ? 100 : 1);
  }

  const sortColumn =
    state.sort &&
    SORT_COLUMNS.has(state.sort.id as keyof SiteKeywordPerformanceRow)
      ? state.sort.id
      : "clicks";
  const args: SiteKeywordPerformanceRpcArgs = {
    p_site_id: siteId,
    p_filters: filters,
    p_sort: sortColumn,
    p_sort_dir: state.sort?.direction ?? "desc",
    p_limit: state.pageSize,
    p_offset: (state.page - 1) * state.pageSize,
  };
  const search = cleanSearch(state.search);
  if (search) args.p_search = search;
  return args;
}

/** Remove the repeated count field without weakening the generated row type. */
export function siteKeywordPerformancePageFromRpc(
  data: SiteKeywordPerformanceRpcRow[],
): SiteKeywordPerformancePage {
  const rows = data.map(({ total_count: _totalCount, ...row }) => row);
  return {
    rows,
    total: data[0]?.total_count ?? 0,
  };
}

/** Direct read of persisted search performance + market intelligence. */
export async function listSiteKeywordPerformance(
  siteId: string,
  state: MatrxDataTableQueryState,
  signal?: AbortSignal,
): Promise<SiteKeywordPerformancePage> {
  await requireAuthenticatedSupabaseSession(supabase);
  const response = await supabase
    .schema("seo")
    .rpc(
      "site_keyword_performance_page",
      buildSiteKeywordPerformanceRpcArgs(siteId, state),
    )
    .abortSignal(signal ?? new AbortController().signal);

  if (response.error) throw response.error;
  return siteKeywordPerformancePageFromRpc(response.data);
}

/**
 * Persist one user-selected SEO stage directly to the site/keyword ledger.
 *
 * The paged projection does not expose its ledger row version, so this first
 * compares the current field with the value the user saw. It then performs the
 * canonical version compare-and-swap, closing the race between that comparison
 * and the UPDATE. A missing ledger row is created only when the user edited an
 * untracked keyword.
 */
export async function updateSiteKeywordWorkflow(
  input: UpdateSiteKeywordWorkflowInput,
): Promise<void> {
  const session = await requireAuthenticatedSupabaseSession(supabase);
  const seo = supabase.schema("seo");
  const current = await seo
    .from("site_keyword_value")
    .select(SITE_KEYWORD_STAGE_COLUMNS)
    .eq("site_id", input.siteId)
    .eq("keyword_id", input.keywordId)
    .is("deleted_at", null)
    .maybeSingle();

  if (current.error) throw current.error;

  if (!current.data) {
    if (input.expectedStatus !== null) {
      throw new SiteKeywordWorkflowConflictError();
    }
    const inserted = await seo
      .from("site_keyword_value")
      .insert({
        organization_id: input.organizationId,
        site_id: input.siteId,
        keyword_id: input.keywordId,
        workflow_status: input.nextStatus,
        metadata: {},
        created_by: session.user.id,
        updated_by: session.user.id,
      })
      .select(SITE_KEYWORD_STAGE_COLUMNS)
      .single();
    if (inserted.error) {
      if (inserted.error.code === "23505") {
        throw new SiteKeywordWorkflowConflictError();
      }
      throw inserted.error;
    }
    return;
  }

  const currentRow = current.data;
  if (currentRow.workflow_status !== input.expectedStatus) {
    throw new SiteKeywordWorkflowConflictError();
  }

  const result = await guardedUpdate<
    Pick<SiteKeywordValueRow, "id" | "workflow_status" | "version">
  >({
    expectedVersion: currentRow.version,
    applyUpdate: ({ expectedVersion, nextVersion }) =>
      seo
        .from("site_keyword_value")
        .update({
          workflow_status: input.nextStatus,
          suppression_reason: null,
          updated_by: session.user.id,
          version: nextVersion,
        })
        .eq("id", currentRow.id)
        .eq("version", expectedVersion)
        .is("deleted_at", null)
        .select(SITE_KEYWORD_STAGE_COLUMNS)
        .maybeSingle(),
    fetchCurrent: () =>
      seo
        .from("site_keyword_value")
        .select(SITE_KEYWORD_STAGE_COLUMNS)
        .eq("id", currentRow.id)
        .is("deleted_at", null)
        .maybeSingle(),
  });

  if (result.status !== "saved") {
    throw new SiteKeywordWorkflowConflictError();
  }
}
