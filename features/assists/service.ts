"use client";

/**
 * Assists service — the ONE browser read/write path for `platform.assists`.
 *
 * THE VIEW LAW: every list read declares its own scope. Assists are personal
 * nudges, so the scope is always MINE (user_id = the caller), pending, live
 * (unexpired, unsuppressed, not soft-deleted).
 *
 * Producers use `emitAssist` — the only browser write is
 * `platform.emit_pending_assist` (idempotent by `dedupe_key`; re-noticing
 * updates the live pending chip, never stacks a duplicate, never 409s).
 */

import { createClient } from "@/utils/supabase/client";
import {
  isMissingSessionError,
  runWithSessionRetry,
  SessionUnavailableError,
} from "@/lib/supabase/authRetry";
import type { Database, Json } from "@/types/database.types";
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
import {
  groupAssistSourceSuppressions,
  SOURCE_SUPPRESSED_UNTIL,
  sourceSuppressionMetadata,
  type AssistSourceSuppression,
} from "./source-suppression";

const TABLE = "assists" as const;

const ALL_STATUSES: readonly AssistStatus[] = [
  "pending",
  "accepted",
  "dismissed",
  "expired",
  "superseded",
  "resolved",
];

const SORT_COLUMNS = {
  created_at: "created_at",
  decided_at: "decided_at",
  priority: "priority",
  confidence: "confidence",
  status: "status",
  source_key: "source_key",
  first_seen_at: "first_seen_at",
  occurrences: "occurrences",
} as const;

/** Narrow rows, screaming (never silently dropping) on an unaddressable one. */
export function narrowRows(rows: AssistRow[]): Assist[] {
  return narrowRowsCounted(rows).rows;
}

/**
 * The same narrowing, plus HOW MANY IT REFUSED. Callers that print a count a
 * person reads need that number: the server's `count` includes rows nothing can
 * render, so a header built on it claims work nobody can see (round-2
 * verification of the approval queue, § A-ii).
 */
export function narrowRowsCounted(rows: AssistRow[]): {
  rows: Assist[];
  unreadable: number;
} {
  const assists: Assist[] = [];
  let unreadable = 0;
  for (const row of rows) {
    const assist = toAssist(row);
    if (assist) {
      assists.push(assist);
    } else {
      unreadable += 1;
      // Invalid/stale ledger data is expected validation fallout: keep it loud
      // for developers without turning a safely skipped row into a durable
      // application incident through the global console.error capture.
      console.warn(
        `[assists] row ${row.id} (${row.source_key}) has an action that does not narrow — skipped`,
      );
    }
  }
  return { rows: assists, unreadable };
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * THE ONE WRITE PATH FOR AN ASSIST ADDRESSED TO ME.
 *
 * Schema `platform` is doors-only: `authenticated` holds SELECT on
 * `platform.assists` and no write privilege at all, so every `.update()` this
 * service used to make answered `42501 permission denied for table assists`
 * over PostgREST — a 403 and a console line on every page that mounts the
 * capture ladder, swallowed (VERIFIER-10 F14, 2026-09-22). The door
 * `platform.act_on_my_assists` is the sanctioned path: it derives the addressee
 * from `auth.uid()` and every arm carries `user_id = <the caller>` in its own
 * WHERE, so it can only ever touch rows addressed to the person calling it.
 *
 * It returns the ids it changed, because several callers report a count a
 * person reads.
 */
async function actOnMyAssists(
  verb:
    | "accept"
    | "dismiss"
    | "snooze"
    | "restore"
    | "star"
    | "viewed"
    | "resolve"
    | "set_metadata"
    | "suppress_source"
    | "unsuppress_source",
  args: {
    ids?: string[];
    dedupeKeys?: string[];
    sourceKey?: string;
    until?: string | null;
    note?: string;
    flag?: boolean;
    result?: Json;
    metadata?: Json;
  } = {},
): Promise<{ ids: string[]; error: { message: string } | null }> {
  const supabase = createClient();
  const { data, error } = await supabase.schema("platform").rpc(
    "act_on_my_assists",
    {
      p_verb: verb,
      p_ids: args.ids ?? null,
      p_dedupe_keys: args.dedupeKeys ?? null,
      p_source_key: args.sourceKey ?? null,
      p_until: args.until ?? null,
      p_note: args.note ?? null,
      p_flag: args.flag ?? null,
      p_result: args.result ?? null,
      p_metadata: args.metadata ?? null,
    } as never,
  );
  if (error) return { ids: [], error };
  return { ids: (data as string[] | null) ?? [], error: null };
}

/**
 * My ambient-eligible assists, highest priority first.
 *
 * The full ledger remains available through `queryAssists`. This narrow read
 * is governed by the producer registry so a report/notification/task can stay
 * in history without claiming one of the three ambient presentation slots.
 */
export async function listMyPendingAssists(userId: string): Promise<Assist[]> {
  const supabase = createClient();
  const { data, error } = await runWithSessionRetry(() =>
    supabase
      .schema("platform")
      .rpc("list_my_presentable_assists", { p_limit: 50 }),
  );
  if (error) {
    if (isMissingSessionError(error)) throw new SessionUnavailableError();
    throw new Error(`[assists] list failed: ${error.message}`);
  }
  // The RPC is auth.uid()-scoped. Keep the explicit argument in this browser
  // API so callers cannot accidentally turn a mine-scope read into a global
  // one; the mismatch is a loud programming error, never ignored.
  if (!userId) throw new Error("[assists] list requires a user id");
  return narrowRows(data ?? []);
}

/** Read the shared admission gate before a producer does optional work. */
export async function canProduceAssist(sourceKey: string): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("platform")
    .rpc("my_assist_admission_decision", { p_source_key: sourceKey });
  if (error) {
    console.error(`[assists] admission policy failed: ${error.message}`);
    return false;
  }
  return data?.[0]?.allowed === true;
}

/**
 * Same-tab collapse for one addressee + dedupe key. Two mounts in one tick
 * used to both miss the pending SELECT and both INSERT; the door below makes
 * that race silent, and this map keeps it from becoming two RPCs as well.
 */
const emitInFlight = new Map<string, Promise<string | null>>();

/**
 * Emit (or refresh) an assist. Idempotent by `dedupe_key`: the database door
 * `platform.emit_pending_assist` inserts, or updates the caller's own live
 * pending row, or returns null when someone else already holds the key.
 * Returns the row id, or null when the write was refused (surfaced loudly,
 * never thrown into UI).
 */
export async function emitAssist(
  userId: string,
  input: EmitAssistInput,
  organizationId: string,
): Promise<string | null> {
  const flightKey = `${userId}\0${input.dedupeKey}`;
  const existing = emitInFlight.get(flightKey);
  if (existing) return existing;
  const flight = emitAssistOnce(userId, input, organizationId).finally(() => {
    if (emitInFlight.get(flightKey) === flight) emitInFlight.delete(flightKey);
  });
  emitInFlight.set(flightKey, flight);
  return flight;
}

async function emitAssistOnce(
  userId: string,
  input: EmitAssistInput,
  organizationId: string,
): Promise<string | null> {
  if (!(await canProduceAssist(input.sourceKey))) return null;
  // 🚨 NO NULL ORG (owner ruling 2026-08-21, db-rules §2). `organizationId` is a
  // REQUIRED positional argument, not an optional field, so a producer cannot
  // forget it quietly — which is exactly what happened before 2026-08-29: this
  // payload simply had no `organization_id` key, `platform.assists` has no
  // `_stamp_org_default` backstop (migration 0135 attaches it only where the
  // column is already NOT NULL), and every row this client wrote landed NULL.
  // The database will not catch a regression here for us, so this check is the
  // guard: refuse loudly rather than write a NULL scope.
  if (!organizationId) {
    console.error(
      `[assists] NO NULL ORG: refusing to emit '${input.sourceKey}' with no organization. ` +
        `An assist must state its owning org (db-rules §2); NULL is never a scope.`,
    );
    return null;
  }
  if (!userId) {
    console.error(`[assists] emit requires a user id`);
    return null;
  }
  const supabase = createClient();
  // supabase-js codegen marks every SQL argument required-non-null. The door
  // accepts NULL for the fields a producer may omit; that is the live
  // signature, and passing empty strings / zero UUIDs would write fakes.
  const emitArgs = {
    p_organization_id: organizationId,
    p_source_kind: input.sourceKind ?? "deterministic",
    p_source_key: input.sourceKey,
    p_title: input.title,
    p_body: input.body ?? null,
    p_action: input.action,
    p_surface_name: input.surfaceName ?? null,
    p_entity_type: input.entityType ?? null,
    p_entity_id: input.entityId ?? null,
    p_dedupe_key: input.dedupeKey,
    p_expires_at: input.expiresAt ?? null,
    p_priority: input.priority ?? 0,
    p_evidence: (input.evidence ?? null) as Json,
    p_confidence: input.confidence ?? null,
    p_reasoning: input.reasoning ?? null,
  };
  const { data, error } = await supabase.schema("platform").rpc(
    "emit_pending_assist",
    emitArgs as Database["platform"]["Functions"]["emit_pending_assist"]["Args"],
  );
  if (error) {
    console.error(`[assists] emit failed: ${error.message}`);
    return null;
  }
  return data ?? null;
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
 * The ONE status that means "stop showing me this": the person dismissed it.
 *
 * Everything else is not a standing instruction. `accepted` means they DID the
 * thing once — the opposite of "never again". `expired`, `superseded` and
 * `resolved` happened to the row without anybody deciding anything.
 */
const SILENCED_BY_A_PERSON: readonly AssistStatus[] = ["dismissed"];

/**
 * Like {@link filterUndecidedKeys}, but only a DISMISSAL blocks a key. Use it
 * when the producer's condition genuinely RECURS under the same dedupe key.
 *
 * 🚨 WHY THIS EXISTS, and what the live ledger taught it. `filterUndecidedKeys`
 * treats any non-pending status as decided. For a producer whose key is stable
 * — one row per workspace, say — that makes a one-shot notice in two different
 * ways, and both were real:
 *
 *   * `resolved` means "the condition stopped reproducing and NOBODY had to
 *     decide anything". A producer that resolves its own row when the work is
 *     finished would then be silenced by its own success, and the queue could
 *     fill up for ever with nobody told.
 *   * `accepted` means the person PRESSED THE BUTTON. Reading that as "stop
 *     showing me this" silences the one person who proved the notice works.
 *     Two workspaces reached exactly that state within minutes of the feature
 *     going live, which is how this was caught.
 *
 * A dismissal is different, and durable: it is the only one the person issued
 * as an instruction about the future, and it is what "Dismiss for good"
 * promises on the card.
 */
export async function filterKeysNotSilencedByAPerson(
  keys: string[],
): Promise<string[]> {
  if (keys.length === 0) return [];
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("platform")
    .from(TABLE)
    .select("dedupe_key")
    .in("dedupe_key", keys)
    .in("status", SILENCED_BY_A_PERSON as unknown as string[]);
  if (error) {
    // Fail CLOSED: an unreadable ledger must not resurrect something the
    // person told us to stop showing.
    console.error(`[assists] silenced-key lookup failed: ${error.message}`);
    return [];
  }
  const silenced = new Set((data ?? []).map((r) => r.dedupe_key));
  return keys.filter((k) => !silenced.has(k));
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
  if (query.surfaceName)
    request = request.eq("surface_name", query.surfaceName);
  if (typeof query.maxConfidence === "number") {
    request = request.lt("confidence", query.maxConfidence);
  }
  if (typeof query.minConfidence === "number") {
    request = request.gte("confidence", query.minConfidence);
  }
  // Urgency is a band over `priority` (see `urgencyFromPriority`), filtered
  // server-side so the count and the paging agree with what is on screen.
  if (typeof query.minPriority === "number") {
    request = request.gte("priority", query.minPriority);
  }
  if (typeof query.maxPriority === "number") {
    request = request.lt("priority", query.maxPriority);
  }
  if (!query.includeSnoozed) {
    const now = nowIso();
    request = request.or(`suppressed_until.is.null,suppressed_until.lt.${now}`);
  }
  if (query.starredOnly) request = request.eq("is_starred", true);
  if (query.unseenOnly) request = request.is("viewed_at", null);
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
  const narrowed = narrowRowsCounted(response.data ?? []);
  return {
    rows: narrowed.rows,
    total: response.count ?? 0,
    unreadable: narrowed.unreadable,
  };
}

/**
 * ONE assist of mine, by id — the row a deep link names.
 *
 * Mine-scoped like every read here (THE VIEW LAW), and `null` when there is no
 * such live row of mine. Every status is in range on purpose: the caller asks
 * precisely because it needs to know whether the row was already decided.
 */
export async function getAssistById(
  userId: string,
  id: string,
): Promise<Assist | null> {
  if (!userId) throw new Error("[assists] read requires a user id");
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("platform")
    .from(TABLE)
    .select("*")
    .eq("user_id", userId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    if (isMissingSessionError(error)) throw new SessionUnavailableError();
    throw new Error(`[assists] read failed: ${error.message}`);
  }
  if (!data) return null;
  return toAssist(data as AssistRow);
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
  const { error } = await actOnMyAssists("snooze", { ids: [id], until });
  if (error) {
    throw new Error(`[assists] snooze failed: ${error.message}`);
  }
}

function requireSuppressionReason(reason: string): string {
  const trimmed = reason.trim();
  if (!trimmed) {
    throw new Error(
      "Say why this should stay quiet — the reason is the record.",
    );
  }
  return trimmed;
}

/**
 * Every producer/check the user has silenced, collapsed to one visible record.
 *
 * Exactly one affected row carries the required reason in metadata; every row
 * carries `suppressed_until='infinity'`. That keeps this read proportional to
 * the number of silenced sources rather than the number of assists they cover.
 */
export async function listMySourceSuppressions(
  userId: string,
): Promise<AssistSourceSuppression[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("platform")
    .from(TABLE)
    .select("source_key, metadata, updated_at, suppressed_until")
    .eq("user_id", userId)
    // Everything still muted — permanently or inside a window. A source quiet
    // is NOT identified by its timestamp (an ordinary per-assist snooze writes
    // a finite one too); `groupAssistSourceSuppressions` is what requires the
    // `metadata.source_suppression` record, so the two can never be confused.
    // That test lives in TS on purpose: it is the same predicate the grouping
    // already applies, and one place to be right beats two.
    .or(
      `suppressed_until.eq.${SOURCE_SUPPRESSED_UNTIL},suppressed_until.gt.${nowIso()}`,
    )
    .order("updated_at", { ascending: false });
  if (error) {
    throw new Error(
      `[assists] source suppression list failed: ${error.message}`,
    );
  }
  const suppressions = groupAssistSourceSuppressions(data ?? []);
  return Promise.all(
    suppressions.map(async (suppression) => {
      const { count, error: countError } = await supabase
        .schema("platform")
        .from(TABLE)
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("source_key", suppression.sourceKey)
        .eq("suppressed_until", suppression.until);
      if (countError) {
        throw new Error(
          `[assists] source suppression count failed: ${countError.message}`,
        );
      }
      return { ...suppression, affectedRows: count ?? 0 };
    }),
  );
}

/**
 * Quiet one producer/check as a class — every current pending row and every
 * future row (the DB insert trigger inherits the window).
 *
 * `until` is either `SOURCE_SUPPRESSED_UNTIL` ("until I turn it back on") or a
 * finite ISO timestamp from one of the standard windows in `quiet.ts`. A timed
 * source quiet reverses ITSELF, which is why the reason is optional for one
 * and required for the permanent form: a mute that ends on its own does not
 * need a record for the future to interpret, and demanding an essay for
 * "quiet for an hour" is how a control stops being used.
 *
 * The first write makes the clicked assist the ONE visible record; if the
 * class update fails, its metadata is rolled back so the manager never
 * advertises a mute that did not land. Decision notes remain untouched.
 */
export async function suppressAssistSource(
  userId: string,
  assistId: string,
  sourceKey: string,
  reason: string,
  until: string = SOURCE_SUPPRESSED_UNTIL,
): Promise<number> {
  const supabase = createClient();
  const permanent = until === SOURCE_SUPPRESSED_UNTIL;
  const suppressionReason = permanent
    ? requireSuppressionReason(reason)
    : reason.trim() || `Quiet until ${until}`;
  const { data: record, error: recordError } = await supabase
    .schema("platform")
    .from(TABLE)
    .select("id, metadata")
    .eq("id", assistId)
    .eq("user_id", userId)
    .eq("source_key", sourceKey)
    .eq("status", "pending")
    .is("deleted_at", null)
    .maybeSingle();
  if (recordError) {
    throw new Error(
      `[assists] source suppression record failed: ${recordError.message}`,
    );
  }
  if (!record) {
    throw new Error("[assists] source suppression record was not writable");
  }
  const { error: metadataError } = await actOnMyAssists("set_metadata", {
    ids: [record.id],
    metadata: sourceSuppressionMetadata(
      record.metadata,
      suppressionReason,
      nowIso(),
      until,
    ),
  });
  if (metadataError) {
    throw new Error(
      `[assists] source suppression record failed: ${metadataError.message}`,
    );
  }

  const { ids, error } = await actOnMyAssists("suppress_source", {
    sourceKey,
    until,
  });
  if (error) {
    const rollback = await actOnMyAssists("set_metadata", {
      ids: [assistId],
      metadata: record.metadata as Json,
    });
    if (rollback.error) {
      console.error(
        `[assists] source suppression note rollback failed: ${rollback.error.message}`,
      );
    }
    throw new Error(`[assists] source suppression failed: ${error.message}`);
  }
  const count = ids.length;
  if (count === 0) {
    throw new Error("[assists] source suppression changed no rows");
  }
  return count;
}

/**
 * Reverse a producer/check quiet, permanent or timed. Scoped by the exact
 * `until` the group carries so an ordinary per-assist snooze on a row of the
 * same source is never swept up with it.
 */
export async function unsuppressAssistSource(
  userId: string,
  sourceKey: string,
  until: string = SOURCE_SUPPRESSED_UNTIL,
): Promise<number> {
  const { ids, error } = await actOnMyAssists("unsuppress_source", {
    sourceKey,
    until,
  });
  if (error) {
    throw new Error(`[assists] source unsuppression failed: ${error.message}`);
  }
  return ids.length;
}

/**
 * Put a decided assist back in play (kg-suggestions' `restore`). Clears the
 * decision AND any snooze, so a restored row is genuinely live again rather
 * than pending-but-invisible.
 */
export async function restoreAssist(id: string): Promise<void> {
  // `assists_resolution_valid` makes status and resolved_at inseparable — the
  // door clears the timestamp with the status, in one statement.
  const { error } = await actOnMyAssists("restore", { ids: [id] });
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
  const { ids: changed, error } = await actOnMyAssists("dismiss", { ids });
  if (error) {
    throw new Error(`[assists] bulk dismiss failed: ${error.message}`);
  }
  return changed.length;
}

/** Snooze many at once — the other half of the bulk bar. */
export async function bulkSnoozeAssists(
  ids: string[],
  until: string,
): Promise<number> {
  if (ids.length === 0) return 0;
  const { ids: changed, error } = await actOnMyAssists("snooze", {
    ids,
    until,
  });
  if (error) {
    throw new Error(`[assists] bulk snooze failed: ${error.message}`);
  }
  return changed.length;
}

/**
 * Decide an assist (accept / dismiss) with an optional receipt and the user's
 * own words.
 *
 * `note` is written ONLY when supplied — kg-suggestions' exact rule, and for
 * its exact reason: a later plain decide must never erase the explanation
 * someone typed when they put the thing off.
 */
export async function decideAssist(
  id: string,
  status: Extract<AssistStatus, "accepted" | "dismissed">,
  result?: Json,
  note?: string,
): Promise<void> {
  const trimmed = note?.trim();
  const { error } = await actOnMyAssists(
    status === "accepted" ? "accept" : "dismiss",
    { ids: [id], result: result ?? null, ...(trimmed ? { note: trimmed } : {}) },
  );
  if (error) {
    throw new Error(`[assists] decide failed: ${error.message}`);
  }
}

/** Flag (or unflag) an assist for triage — the manager sorts starred first. */
export async function setAssistStarred(
  id: string,
  starred: boolean,
): Promise<void> {
  const { error } = await actOnMyAssists("star", {
    ids: [id],
    flag: starred,
  });
  if (error) {
    throw new Error(`[assists] star failed: ${error.message}`);
  }
}

/**
 * Stamp rows as seen (best-effort — a failed stamp must never break a list
 * render, it only means the unseen dot stays a little longer).
 */
export async function markAssistsViewed(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await actOnMyAssists("viewed", { ids });
  if (error) {
    console.error(`[assists] viewed stamp failed: ${error.message}`);
  }
}

/**
 * THE CONDITION WENT AWAY — close live pending assists whose thing no longer
 * reproduces, with nobody deciding anything.
 *
 * Absorbed from `web.finding`'s analyzer-owned resolve (`reconcile_findings`).
 * A producer that swept and did NOT re-notice a key calls this with that key:
 * the chip leaves the dock honestly instead of forcing the user to accept
 * something that no longer applies or to dismiss it forever. Because
 * `resolved` is a decided status, `filterUndecidedKeys` also stops the
 * producer from resurrecting the row if the condition returns — a genuine
 * recurrence gets a NEW dedupe key or an explicit restore, never a silent
 * re-open of a row the user already saw close.
 */
export async function resolveAssistsByDedupeKeys(
  keys: string[],
): Promise<number> {
  if (keys.length === 0) return 0;
  // No `decided_at`: nobody decided. The door stamps `resolved_at` instead.
  const { ids, error } = await actOnMyAssists("resolve", { dedupeKeys: keys });
  if (error) {
    console.error(`[assists] resolve failed: ${error.message}`);
    return 0;
  }
  return ids.length;
}
