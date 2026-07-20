import type { MatrxDataTableQueryState } from "@/components/official/matrx-data-table/types";
import type {
  OperationsBatchItemRow,
  OperationsBatchRow,
  OperationsPagedResult,
  SiteCostMode,
  SiteCostRow,
  WorkspaceCostMode,
  WorkspaceCostRow,
} from "@/features/marketing/data/operations-types";
import { assertFound } from "@/features/marketing/data/service";
import { supabase } from "@/utils/supabase/client";
import { authenticatedWebDb } from "@/utils/supabase/webDb";

const BATCH_SELECT =
  "id, organization_id, created_at, updated_at, created_by, updated_by, deleted_at, version, metadata, site_id, provider_id, kind, status, external_ref, submitted_at, completed_at, counts, error, provider:provider(label, key, kind), site:site(name, domain, organization_id)";

const BATCH_ITEM_SELECT =
  "id, organization_id, created_at, updated_at, created_by, updated_by, deleted_at, version, metadata, site_id, batch_id, item_id, provider_id, subject_type, subject_id, status, result_id, external_ref, error, item:analysis_item(label, key, category, subcategory), provider:provider(label, key, kind)";

function rangeFor(state: MatrxDataTableQueryState) {
  const from = (state.page - 1) * state.pageSize;
  return { from, to: from + state.pageSize - 1 };
}

function cleanSearch(value: string): string {
  return value.trim().replace(/[(),"'\\]/g, " ");
}

function textFilter(
  state: MatrxDataTableQueryState,
  column: string,
): string | null {
  const filter = state.columnFilters[column];
  return filter?.kind === "text" && filter.value.trim()
    ? cleanSearch(filter.value)
    : null;
}

function selectFilter(
  state: MatrxDataTableQueryState,
  column: string,
): string | null {
  const filter = state.columnFilters[column];
  return filter?.kind === "select" && filter.value ? filter.value : null;
}

function numberFilter(
  state: MatrxDataTableQueryState,
  column: string,
): { min?: number; max?: number } | null {
  const filter = state.columnFilters[column];
  return filter?.kind === "number" ? filter : null;
}

function assertData<T>(data: T | null, error: unknown): T {
  if (error) throw error;
  if (data === null) throw new Error("Supabase returned no data.");
  return data;
}

/** List accessible batch jobs across the workspace. */
export async function listBatches(
  state: MatrxDataTableQueryState,
  signal?: AbortSignal,
): Promise<OperationsPagedResult<OperationsBatchRow>> {
  const { from, to } = rangeFor(state);
  const sortColumns = {
    created_at: "created_at",
    submitted_at: "submitted_at",
    completed_at: "completed_at",
    status: "status",
    kind: "kind",
    external_ref: "external_ref",
  } as const;
  const requestedSort = state.sort?.id ?? "created_at";
  const sortColumn =
    sortColumns[requestedSort as keyof typeof sortColumns] ?? "created_at";
  const ascending = state.sort?.direction === "asc";
  let query = (await authenticatedWebDb(supabase))
    .from("batch_job")
    .select(BATCH_SELECT, { count: "exact" })
    .is("deleted_at", null);
  const search = cleanSearch(state.search);
  if (search) {
    query = query.or(`external_ref.ilike.%${search}%,error.ilike.%${search}%`);
  }
  const status = selectFilter(state, "status");
  const kind = selectFilter(state, "kind");
  const externalRef = textFilter(state, "external_ref");
  if (status) query = query.eq("status", status);
  if (kind) query = query.eq("kind", kind);
  if (externalRef) query = query.ilike("external_ref", `%${externalRef}%`);
  query = query.order(sortColumn, { ascending, nullsFirst: false });
  query = query.order("id", { ascending });
  const response = await query
    .range(from, to)
    .abortSignal(signal ?? new AbortController().signal);
  return {
    rows: assertData(response.data, response.error),
    total: response.count ?? 0,
  };
}

/** Resolve one accessible batch and its site/provider context. */
export async function getBatch(
  batchId: string,
  signal?: AbortSignal,
): Promise<OperationsBatchRow> {
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("batch_job")
    .select(BATCH_SELECT)
    .eq("id", batchId)
    .is("deleted_at", null)
    .abortSignal(signal ?? new AbortController().signal)
    .maybeSingle();
  return assertFound(response.data, response.error, "batch");
}

/** List execution units for one batch and attach bounded per-item costs. */
export async function listBatchItems(
  siteId: string,
  batchId: string,
  state: MatrxDataTableQueryState,
  signal?: AbortSignal,
): Promise<OperationsPagedResult<OperationsBatchItemRow>> {
  const { from, to } = rangeFor(state);
  const sortColumns = {
    created_at: "created_at",
    updated_at: "updated_at",
    status: "status",
    subject_type: "subject_type",
    external_ref: "external_ref",
  } as const;
  const requestedSort = state.sort?.id ?? "created_at";
  const sortColumn =
    sortColumns[requestedSort as keyof typeof sortColumns] ?? "created_at";
  const ascending = state.sort?.direction === "asc";
  const db = await authenticatedWebDb(supabase);
  let query = db
    .from("batch_item")
    .select(BATCH_ITEM_SELECT, { count: "exact" })
    .eq("site_id", siteId)
    .eq("batch_id", batchId)
    .is("deleted_at", null);
  const search = cleanSearch(state.search);
  if (search) {
    query = query.or(`external_ref.ilike.%${search}%,error.ilike.%${search}%`);
  }
  const status = selectFilter(state, "status");
  const subjectType = selectFilter(state, "subject_type");
  const externalRef = textFilter(state, "external_ref");
  if (status) query = query.eq("status", status);
  if (subjectType) query = query.eq("subject_type", subjectType);
  if (externalRef) query = query.ilike("external_ref", `%${externalRef}%`);
  query = query.order(sortColumn, { ascending, nullsFirst: false });
  query = query.order("id", { ascending });
  const abortSignal = signal ?? new AbortController().signal;
  const response = await query.range(from, to).abortSignal(abortSignal);
  const items = assertData(response.data, response.error);
  if (items.length === 0) return { rows: [], total: response.count ?? 0 };
  const costResponse = await db
    .from("v_cost_by_item")
    .select("batch_item_id, cost")
    .eq("site_id", siteId)
    .eq("batch_id", batchId)
    .in(
      "batch_item_id",
      items.map((item) => item.id),
    )
    .abortSignal(abortSignal);
  const costs = assertData(costResponse.data, costResponse.error);
  const costByItem = new Map<string, number>();
  for (const row of costs) {
    if (!row.batch_item_id) continue;
    costByItem.set(
      row.batch_item_id,
      (costByItem.get(row.batch_item_id) ?? 0) + Number(row.cost ?? 0),
    );
  }
  return {
    rows: items.map((item) => ({
      ...item,
      cost: costByItem.get(item.id) ?? 0,
    })),
    total: response.count ?? 0,
  };
}

async function listSitePageCosts(
  siteId: string,
  state: MatrxDataTableQueryState,
  signal?: AbortSignal,
): Promise<OperationsPagedResult<SiteCostRow>> {
  const { from, to } = rangeFor(state);
  const ascending = state.sort?.direction === "asc";
  let query = (await authenticatedWebDb(supabase))
    .from("v_cost_by_page")
    .select("site_id, page_id, cost, page:page(url)", { count: "exact" })
    .eq("site_id", siteId);
  const cost = numberFilter(state, "cost");
  if (cost?.min !== undefined) query = query.gte("cost", cost.min);
  if (cost?.max !== undefined) query = query.lte("cost", cost.max);
  query = query.order("cost", { ascending, nullsFirst: false });
  query = query.order("page_id", { ascending });
  const response = await query
    .range(from, to)
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertData(response.data, response.error);
  return {
    rows: rows.map((row) => ({
      id: `page:${row.page_id ?? "unattributed"}`,
      mode: "page",
      label: row.page?.url ?? row.page_id ?? "Unattributed page",
      cost: Number(row.cost ?? 0),
      page_id: row.page_id,
      run_id: null,
      batch_id: null,
      batch_item_id: null,
    })),
    total: response.count ?? 0,
  };
}

async function listSiteRunCosts(
  siteId: string,
  state: MatrxDataTableQueryState,
  signal?: AbortSignal,
): Promise<OperationsPagedResult<SiteCostRow>> {
  const { from, to } = rangeFor(state);
  const ascending = state.sort?.direction === "asc";
  let query = (await authenticatedWebDb(supabase))
    .from("v_cost_by_run")
    .select("site_id, run_id, cost", { count: "exact" })
    .eq("site_id", siteId);
  const cost = numberFilter(state, "cost");
  if (cost?.min !== undefined) query = query.gte("cost", cost.min);
  if (cost?.max !== undefined) query = query.lte("cost", cost.max);
  query = query.order("cost", { ascending, nullsFirst: false });
  query = query.order("run_id", { ascending });
  const response = await query
    .range(from, to)
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertData(response.data, response.error);
  return {
    rows: rows.map((row) => ({
      id: `run:${row.run_id ?? "unattributed"}`,
      mode: "run",
      label: row.run_id ?? "Independent execution",
      cost: Number(row.cost ?? 0),
      page_id: null,
      run_id: row.run_id,
      batch_id: null,
      batch_item_id: null,
    })),
    total: response.count ?? 0,
  };
}

async function listSiteItemCosts(
  siteId: string,
  state: MatrxDataTableQueryState,
  signal?: AbortSignal,
): Promise<OperationsPagedResult<SiteCostRow>> {
  const { from, to } = rangeFor(state);
  const ascending = state.sort?.direction === "asc";
  let query = (await authenticatedWebDb(supabase))
    .from("v_cost_by_item")
    .select("site_id, batch_id, batch_item_id, page_id, run_id, cost", {
      count: "exact",
    })
    .eq("site_id", siteId);
  const cost = numberFilter(state, "cost");
  if (cost?.min !== undefined) query = query.gte("cost", cost.min);
  if (cost?.max !== undefined) query = query.lte("cost", cost.max);
  query = query.order("cost", { ascending, nullsFirst: false });
  query = query.order("batch_item_id", { ascending });
  const response = await query
    .range(from, to)
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertData(response.data, response.error);
  return {
    rows: rows.map((row) => ({
      id: `item:${row.batch_item_id ?? "unattributed"}`,
      mode: "item",
      label: row.batch_item_id ?? "Unattributed execution item",
      cost: Number(row.cost ?? 0),
      page_id: row.page_id,
      run_id: row.run_id,
      batch_id: row.batch_id,
      batch_item_id: row.batch_item_id,
    })),
    total: response.count ?? 0,
  };
}

/** List one site's cost rollup using the selected canonical cost view. */
export function listSiteCosts(
  siteId: string,
  mode: SiteCostMode,
  state: MatrxDataTableQueryState,
  signal?: AbortSignal,
) {
  if (mode === "run") return listSiteRunCosts(siteId, state, signal);
  if (mode === "item") return listSiteItemCosts(siteId, state, signal);
  return listSitePageCosts(siteId, state, signal);
}

/** Read the one-row site total projected by the runtime cost view. */
export async function getSiteCostTotal(
  siteId: string,
  signal?: AbortSignal,
): Promise<number> {
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("v_cost_by_site")
    .select("cost")
    .eq("site_id", siteId)
    .abortSignal(signal ?? new AbortController().signal)
    .maybeSingle();
  if (response.error) throw response.error;
  return Number(response.data?.cost ?? 0);
}

async function listWorkspaceSiteCosts(
  state: MatrxDataTableQueryState,
  signal?: AbortSignal,
): Promise<OperationsPagedResult<WorkspaceCostRow>> {
  const { from, to } = rangeFor(state);
  const ascending = state.sort?.direction === "asc";
  let query = (await authenticatedWebDb(supabase))
    .from("v_cost_by_site")
    .select("site_id, cost, site:site(name, domain, organization_id)", {
      count: "exact",
    });
  const cost = numberFilter(state, "cost");
  if (cost?.min !== undefined) query = query.gte("cost", cost.min);
  if (cost?.max !== undefined) query = query.lte("cost", cost.max);
  query = query.order("cost", { ascending, nullsFirst: false });
  query = query.order("site_id", { ascending });
  const response = await query
    .range(from, to)
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertData(response.data, response.error);
  return {
    rows: rows.map((row) => ({
      id: `site:${row.site_id ?? "unattributed"}`,
      mode: "site",
      label: row.site?.name ?? row.site_id ?? "Unattributed site",
      detail: row.site?.domain ?? null,
      cost: Number(row.cost ?? 0),
      site_id: row.site_id,
      client_org_id: row.site?.organization_id ?? null,
    })),
    total: response.count ?? 0,
  };
}

async function listWorkspaceClientCosts(
  state: MatrxDataTableQueryState,
  signal?: AbortSignal,
): Promise<OperationsPagedResult<WorkspaceCostRow>> {
  const { from, to } = rangeFor(state);
  const ascending = state.sort?.direction === "asc";
  let query = (await authenticatedWebDb(supabase))
    .from("v_cost_by_client")
    .select("client_org_id, cost", { count: "exact" });
  const cost = numberFilter(state, "cost");
  if (cost?.min !== undefined) query = query.gte("cost", cost.min);
  if (cost?.max !== undefined) query = query.lte("cost", cost.max);
  query = query.order("cost", { ascending, nullsFirst: false });
  query = query.order("client_org_id", { ascending });
  const response = await query
    .range(from, to)
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertData(response.data, response.error);
  return {
    rows: rows.map((row) => ({
      id: `client:${row.client_org_id ?? "unattributed"}`,
      mode: "client",
      label: row.client_org_id ?? "Unattributed client",
      detail: null,
      cost: Number(row.cost ?? 0),
      site_id: null,
      client_org_id: row.client_org_id,
    })),
    total: response.count ?? 0,
  };
}

/** List workspace cost rollups by accessible site or client organization. */
export function listWorkspaceCosts(
  mode: WorkspaceCostMode,
  state: MatrxDataTableQueryState,
  signal?: AbortSignal,
) {
  return mode === "client"
    ? listWorkspaceClientCosts(state, signal)
    : listWorkspaceSiteCosts(state, signal);
}
