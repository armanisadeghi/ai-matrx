import { createClient } from "@/utils/supabase/client";
import { browserAdminLaneOpen } from "@/utils/supabase/adminLane";
import { requireUserId } from "@/utils/auth/getUserId";
import type {
  ExecutionListFilters,
  ExecutionRecord,
} from "../types/executionTypes";

const COLUMNS =
  "id, type, status, cost, error, link_kind, link_id, started_at, ended_at, created_at, updated_at, organization_id, context";

function contextUserId(context: unknown): string | null {
  if (typeof context !== "object" || context === null) return null;
  const value = (context as Record<string, unknown>)["user_id"];
  return typeof value === "string" ? value : null;
}

/** The ONE mapping from a `runtime.global_execution` row to the page's record. */
export function mapExecutionRow(row: {
  id: string;
  type: string | null;
  status: string;
  cost: number;
  error: unknown;
  link_kind: string | null;
  link_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
  organization_id: string | null;
  context: unknown;
}): ExecutionRecord {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    cost: row.cost,
    error:
      row.error === null || row.error === undefined
        ? null
        : typeof row.error === "string"
          ? row.error
          : JSON.stringify(row.error),
    link_kind: row.link_kind,
    link_id: row.link_id,
    started_at: row.started_at,
    ended_at: row.ended_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    organization_id: row.organization_id,
    user_id: contextUserId(row.context),
  };
}

/**
 * Executions the signed-in person may read. On the ADMIN SEAT
 * (/administration) there is no owner filter — the platform_admin_read policy
 * admits every row behind the lane, and the page's job is to show them all. On
 * every user page the list is the caller's own runs.
 */
export const executionsService = {
  async list(
    filters: ExecutionListFilters = {},
  ): Promise<{ executions: ExecutionRecord[]; total: number }> {
    const limit = filters.limit || 20;
    const offset = filters.offset || 0;
    const orderBy = filters.order_by || "created_at";
    const orderDirection = filters.order_direction || "desc";

    let query = createClient()
      .schema("runtime")
      .from("global_execution")
      .select(COLUMNS, { count: "estimated" });

    if (!browserAdminLaneOpen()) {
      query = query.eq("context->>user_id", requireUserId());
    }
    if (filters.status) query = query.eq("status", filters.status);

    const { data, error, count } = await query
      .order(orderBy, { ascending: orderDirection === "asc" })
      .range(offset, offset + limit - 1);
    if (error) throw error;

    const executions = (data ?? []).map(mapExecutionRow);
    return { executions, total: count ?? executions.length };
  },
};
