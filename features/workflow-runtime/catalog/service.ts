/**
 * The workflow catalog read — direct supabase-js over
 * `workflow.v_definition_catalog`, per platform doctrine (pure UI↔DB; the
 * Python server is the brain, never a database gateway).
 *
 * The demo this replaced listed workflows through `callApi("/workflows")`,
 * paying two extra hops through an agent-saturated server for rows the
 * browser can read itself. The view exists so a catalog row can carry its
 * step count and last-run facts WITHOUT shipping the nodes/edges jsonb.
 *
 * RLS is the ceiling (security_invoker view); this is a browse list, so a
 * bounded page is the correct answer and `readAllRows` is deliberately not
 * used — nothing here is an existence check or a set diff.
 */

import { supabase } from "@/utils/supabase/client";

export interface WorkflowCatalogRow {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  tags: string[];
  isFavorite: boolean;
  stepCount: number;
  runCount: number;
  lastRunId: string | null;
  lastRunStatus: string | null;
  lastRunAt: string | null;
  updatedAt: string | null;
}

const CATALOG_COLUMNS =
  "id,name,description,category,tags,is_favorite,step_count,run_count,last_run_id,last_run_status,last_run_at,updated_at";

/** Newest-activity-first catalog page. `limit` bounds the browse, never truth. */
export async function fetchWorkflowCatalog(
  limit = 200,
): Promise<WorkflowCatalogRow[]> {
  const { data, error } = await supabase
    .schema("workflow")
    .from("v_definition_catalog")
    .select(CATALOG_COLUMNS)
    .eq("is_archived", false)
    .order("last_run_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id ?? "",
    name: row.name ?? "Untitled workflow",
    description: row.description,
    category: row.category,
    tags: Array.isArray(row.tags) ? row.tags : [],
    isFavorite: row.is_favorite === true,
    stepCount: typeof row.step_count === "number" ? row.step_count : 0,
    runCount: typeof row.run_count === "number" ? row.run_count : 0,
    lastRunId: row.last_run_id,
    lastRunStatus: row.last_run_status,
    lastRunAt: row.last_run_at,
    updatedAt: row.updated_at,
  }));
}
