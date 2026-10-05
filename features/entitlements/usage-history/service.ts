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
  const client = options.client ?? createClient();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) {
    throw new Error("Sign in to view usage history.");
  }
  const snapshotAt = query.snapshotAt ?? now.toISOString();
  const snapshotDate = new Date(snapshotAt);
  const rangeStart = startForRange(
    query.range,
    Number.isNaN(snapshotDate.getTime()) ? now : snapshotDate,
  );

  let request = client
    .schema("billing")
    .from("usage_ledger")
    .select("id, created_at, quantity, metadata")
    .eq("capability", "platform.points")
    .is("deleted_at", null)
    .eq("created_by", auth.user.id)
    .lte("created_at", snapshotAt)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (rangeStart) request = request.gte("created_at", rangeStart);
  if (query.cursor) {
    request = request.or(
      `created_at.lt.${query.cursor.createdAt},and(created_at.eq.${query.cursor.createdAt},id.lt.${query.cursor.id})`,
    );
  }
  if (query.activity === "executions") {
    request = request.eq("metadata->>source", "runtime.global_execution");
  }

  const { data, error } = await request.limit(USAGE_HISTORY_PAGE_SIZE + 1);
  if (error) throw error;
  const rows = data ?? [];
  const pageRows = rows.slice(0, USAGE_HISTORY_PAGE_SIZE);
  const finalRow = pageRows.at(-1);
  return {
    entries: pageRows.map(toUsageHistoryEntry),
    snapshotAt,
    nextCursor: rows.length > USAGE_HISTORY_PAGE_SIZE && finalRow
      ? { createdAt: finalRow.created_at, id: finalRow.id }
      : null,
  };
}
