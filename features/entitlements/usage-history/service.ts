import { createClient } from "@/utils/supabase/client";
import { USAGE_HISTORY_PAGE_SIZE, toUsageHistoryEntry, type UsageHistoryPage, type UsageHistoryQuery } from "./types";

function startForRange(range: UsageHistoryQuery["range"], now: Date): string | null {
  const days = range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : null;
  if (days === null) return null;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Reads one stable, server-paginated page of the signed-in person's point
 * ledger. RLS remains the authorization boundary; `created_by` mirrors the
 * canonical personal usage-state calculation (never nullable `user_id`).
 */
export async function fetchPersonalUsageHistory(
  query: UsageHistoryQuery,
  options: { now?: Date; client?: ReturnType<typeof createClient> } = {},
): Promise<UsageHistoryPage> {
  const now = options.now ?? new Date();
  const from = query.page * USAGE_HISTORY_PAGE_SIZE;
  const to = from + USAGE_HISTORY_PAGE_SIZE;
  const rangeStart = startForRange(query.range, now);
  const client = options.client ?? createClient();

  let request = client
    .schema("billing")
    .from("usage_ledger")
    .select("id, created_at, quantity, metadata")
    .eq("capability", "platform.points")
    .is("deleted_at", null)
    .eq("created_by", (await client.auth.getUser()).data.user?.id ?? "")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (rangeStart) request = request.gte("created_at", rangeStart);
  if (query.activity === "executions") {
    request = request.eq("metadata->>source", "runtime.global_execution");
  }

  const { data, error } = await request.range(from, to);
  if (error) throw error;
  const rows = data ?? [];
  return {
    entries: rows.slice(0, USAGE_HISTORY_PAGE_SIZE).map(toUsageHistoryEntry),
    page: query.page,
    hasNextPage: rows.length > USAGE_HISTORY_PAGE_SIZE,
  };
}
