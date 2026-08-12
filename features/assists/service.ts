"use client";

/**
 * Assists service — the ONE browser read/write path for `platform.assists`.
 *
 * THE VIEW LAW: every list read declares its own scope. Assists are personal
 * nudges, so the scope is always MINE (user_id = the caller), pending, live
 * (unexpired, unsuppressed, not soft-deleted).
 *
 * Producers use `emitAssist` — idempotent by `dedupe_key` (re-noticing the
 * same thing updates the live pending chip, never stacks a duplicate).
 */

import { createClient } from "@/utils/supabase/client";
import type { Json } from "@/types/database.types";
import {
  toAssist,
  type Assist,
  type AssistRow,
  type AssistsPage,
  type AssistsQuery,
  type AssistStats,
  type AssistStatus,
  type EmitAssistInput,
} from "./types";

const TABLE = "assists" as const;

const ALL_STATUSES: readonly AssistStatus[] = [
  "pending",
  "accepted",
  "dismissed",
  "expired",
  "superseded",
];

const SORT_COLUMNS = {
  created_at: "created_at",
  decided_at: "decided_at",
  priority: "priority",
  confidence: "confidence",
  status: "status",
  source_key: "source_key",
} as const;

/** Narrow rows, screaming (never silently dropping) on an unaddressable one. */
function narrowRows(rows: AssistRow[]): Assist[] {
  const assists: Assist[] = [];
  for (const row of rows) {
    const assist = toAssist(row);
    if (assist) {
      assists.push(assist);
    } else {
      console.error(
        `[assists] row ${row.id} (${row.source_key}) has an action that does not narrow — skipped`,
      );
    }
  }
  return assists;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** My live pending assists, highest priority first. */
export async function listMyPendingAssists(userId: string): Promise<Assist[]> {
  const supabase = createClient();
  const now = nowIso();
  const { data, error } = await supabase
    .schema("platform")
    .from(TABLE)
    .select("*")
    .eq("user_id", userId)
    .eq("status", "pending")
    .is("deleted_at", null)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .or(`suppressed_until.is.null,suppressed_until.lt.${now}`)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    throw new Error(`[assists] list failed: ${error.message}`);
  }
  return narrowRows(data ?? []);
}

/**
 * Emit (or refresh) an assist. Idempotent by `dedupe_key`: an existing live
 * pending row with the same key is UPDATED in place. Returns the row id, or
 * null when the write was refused (surfaced loudly, never thrown into UI).
 */
export async function emitAssist(
  userId: string,
  input: EmitAssistInput,
): Promise<string | null> {
  const supabase = createClient();
  const payload = {
    user_id: userId,
    // Producers address the assist; created_by = addressee keeps RLS honest
    // even when a service-role producer writes on someone's behalf.
    created_by: userId,
    source_kind: input.sourceKind ?? "deterministic",
    source_key: input.sourceKey,
    title: input.title,
    body: input.body ?? null,
    action: input.action as unknown as Json,
    surface_name: input.surfaceName ?? null,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    dedupe_key: input.dedupeKey,
    expires_at: input.expiresAt ?? null,
    priority: input.priority ?? 0,
  };

  const { data: existing, error: findError } = await supabase
    .schema("platform")
    .from(TABLE)
    .select("id")
    .eq("dedupe_key", input.dedupeKey)
    .eq("status", "pending")
    .is("deleted_at", null)
    .maybeSingle();
  if (findError) {
    console.error(`[assists] emit lookup failed: ${findError.message}`);
    return null;
  }

  if (existing) {
    const { error } = await supabase
      .schema("platform")
      .from(TABLE)
      .update({
        title: payload.title,
        body: payload.body,
        action: payload.action,
        expires_at: payload.expires_at,
        priority: payload.priority,
      })
      .eq("id", existing.id);
    if (error) {
      console.error(`[assists] emit refresh failed: ${error.message}`);
      return null;
    }
    return existing.id;
  }

  const { data, error } = await supabase
    .schema("platform")
    .from(TABLE)
    .insert(payload)
    .select("id")
    .single();
  if (error) {
    // 23505 = a concurrent producer won the dedupe race — that's success.
    if (error.code === "23505") return null;
    console.error(`[assists] emit failed: ${error.message}`);
    return null;
  }
  return data.id;
}

/**
 * Has this dedupe key EVER been decided (dismissed/accepted/…)? Producers use
 * this so a user's dismissal is durable — re-noticing the same thing must not
 * resurrect the chip.
 */
export async function wasAssistDecided(dedupeKey: string): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("platform")
    .from(TABLE)
    .select("id")
    .eq("dedupe_key", dedupeKey)
    .neq("status", "pending")
    .limit(1);
  if (error) {
    console.error(`[assists] decided lookup failed: ${error.message}`);
    return false;
  }
  return (data ?? []).length > 0;
}

/**
 * Batch form of `wasAssistDecided` — returns the subset of keys with NO
 * decided row (safe to emit). One query, producers call it before a sweep.
 */
export async function filterUndecidedKeys(keys: string[]): Promise<string[]> {
  if (keys.length === 0) return [];
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("platform")
    .from(TABLE)
    .select("dedupe_key")
    .in("dedupe_key", keys)
    .neq("status", "pending");
  if (error) {
    console.error(`[assists] decided batch lookup failed: ${error.message}`);
    return [];
  }
  const decided = new Set((data ?? []).map((r) => r.dedupe_key));
  return keys.filter((k) => !decided.has(k));
}

/**
 * The manager read — EVERY status, server-side filter / sort / paginate.
 *
 * Deliberately NOT the chip read: a triage surface must reach decided and
 * snoozed history, while a chip must only ever see live pending work. Two read
 * paths, ONE decision UX — the same shape kg-suggestions arrived at (its
 * manager reads a view, its inbox reads the shared cache, and both render the
 * same card).
 */
export async function queryAssists(
  userId: string,
  query: AssistsQuery,
): Promise<AssistsPage> {
  const supabase = createClient();
  const from = Math.max(0, (query.page - 1) * query.pageSize);
  const to = from + query.pageSize - 1;

  let request = supabase
    .schema("platform")
    .from(TABLE)
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .is("deleted_at", null);

  const statuses =
    query.statuses.length > 0 ? query.statuses : [...ALL_STATUSES];
  request = request.in("status", statuses);

  if (query.sourceKey) request = request.eq("source_key", query.sourceKey);
  if (query.sourceKind) request = request.eq("source_kind", query.sourceKind);
  if (query.surfaceName) request = request.eq("surface_name", query.surfaceName);
  if (typeof query.maxConfidence === "number") {
    request = request.lt("confidence", query.maxConfidence);
  }
  if (typeof query.minConfidence === "number") {
    request = request.gte("confidence", query.minConfidence);
  }
  if (!query.includeSnoozed) {
    const now = nowIso();
    request = request.or(`suppressed_until.is.null,suppressed_until.lt.${now}`);
  }
  const search = query.search.trim();
  if (search) {
    // PostgREST splits an `or` list on commas — a comma in free text would
    // corrupt the filter list, so it is stripped rather than mis-querying.
    const safe = search.replace(/[,()*]/g, " ").trim();
    if (safe) {
      request = request.or(
        `title.ilike.%${safe}%,body.ilike.%${safe}%,source_key.ilike.%${safe}%`,
      );
    }
  }

  const column = SORT_COLUMNS[query.sortField] ?? "created_at";
  const response = await request
    .order(column, { ascending: query.sortAscending, nullsFirst: false })
    .order("id", { ascending: query.sortAscending })
    .range(from, to);

  if (response.error) {
    throw new Error(`[assists] query failed: ${response.error.message}`);
  }
  return { rows: narrowRows(response.data ?? []), total: response.count ?? 0 };
}

/**
 * Per-status counts for the manager's summary strip. One head-only count per
 * status — honest about totals beyond the current page, and no rows on the
 * wire to get them.
 */
export async function fetchAssistStats(userId: string): Promise<AssistStats> {
  const supabase = createClient();
  const entries = await Promise.all(
    ALL_STATUSES.map(async (status) => {
      const { count, error } = await supabase
        .schema("platform")
        .from(TABLE)
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", status)
        .is("deleted_at", null);
      if (error) {
        console.error(`[assists] stats(${status}) failed: ${error.message}`);
        return [status, 0] as const;
      }
      return [status, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(entries) as AssistStats;
}

/**
 * "Remind me later" — the row stays `pending` and goes quiet until `until`.
 *
 * Absorbed from kg-suggestions' defer. The distinction that matters: a snooze
 * is NOT a decision, so `filterUndecidedKeys` still reports the key as
 * un-answered and a producer's re-notice refreshes the same row. Dismissal is
 * the durable "never again"; snooze is "not now".
 */
export async function snoozeAssist(id: string, until: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .schema("platform")
    .from(TABLE)
    .update({ suppressed_until: until })
    .eq("id", id);
  if (error) {
    throw new Error(`[assists] snooze failed: ${error.message}`);
  }
}

/**
 * Put a decided assist back in play (kg-suggestions' `restore`). Clears the
 * decision AND any snooze, so a restored row is genuinely live again rather
 * than pending-but-invisible.
 */
export async function restoreAssist(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .schema("platform")
    .from(TABLE)
    .update({
      status: "pending",
      decided_at: null,
      result: null,
      suppressed_until: null,
    })
    .eq("id", id);
  if (error) {
    throw new Error(`[assists] restore failed: ${error.message}`);
  }
}

/**
 * Dismiss many at once (kg-suggestions' bulk bar). Bulk NEVER accepts —
 * running N real actions from one click is the opposite of THE
 * INTENTIONAL-ACTION LAW. Triage in bulk, act one at a time.
 */
export async function bulkDismissAssists(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("platform")
    .from(TABLE)
    .update({ status: "dismissed", decided_at: nowIso() })
    .in("id", ids)
    .select("id");
  if (error) {
    throw new Error(`[assists] bulk dismiss failed: ${error.message}`);
  }
  return (data ?? []).length;
}

/** Snooze many at once — the other half of the bulk bar. */
export async function bulkSnoozeAssists(
  ids: string[],
  until: string,
): Promise<number> {
  if (ids.length === 0) return 0;
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("platform")
    .from(TABLE)
    .update({ suppressed_until: until })
    .in("id", ids)
    .select("id");
  if (error) {
    throw new Error(`[assists] bulk snooze failed: ${error.message}`);
  }
  return (data ?? []).length;
}

/** Decide an assist (accept / dismiss) with an optional receipt. */
export async function decideAssist(
  id: string,
  status: Extract<AssistStatus, "accepted" | "dismissed">,
  result?: Json,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .schema("platform")
    .from(TABLE)
    .update({
      status,
      decided_at: nowIso(),
      result: result ?? null,
    })
    .eq("id", id);
  if (error) {
    throw new Error(`[assists] decide failed: ${error.message}`);
  }
}

