"use client";

/**
 * TOOL RE-FETCH — the data half.
 *
 * A "repeat" is a tool call whose name + arguments are byte-identical to an
 * earlier call in the SAME conversation. `chat.vw_tool_refetch` emits one row
 * per repeat; `chat.vw_tool_refetch_summary` rolls those up per tool ALL-TIME.
 *
 * 🚨 THE WINDOW PROBLEM, and why this file exists.
 * The summary view has no date column to filter on — its numbers are all-time,
 * period. So a windowed view of the same measures CANNOT be a filtered read of
 * it; it has to be recomputed from the per-repeat rows, and the denominator
 * (total calls in the window) has to come from `chat.tool_call` separately.
 * That is exactly what `loadWindowed` does. "All" reads the summary view
 * directly, because that is the one window it actually answers.
 *
 * 🚨 NULL IS NEVER ZERO. `same_data` is a THREE-state fact — matched hash
 * (the re-fetch bought nothing), changed hash (a legitimate refresh), or the
 * output was never stored (unknown). Same for `first_result_trimmed_before_repeat`:
 * per-iteration trim audits only exist from 2026-09-08 on, so an older repeat
 * is `null` — unknown, not "no". Every rollup below counts those separately and
 * never folds unknown into either answer.
 *
 * Reads go DIRECT to Supabase with the browser client (both views are
 * `security_invoker` with SELECT granted to `authenticated`) — the frontend
 * never routes a data read through the Python server.
 */

import { supabase } from "@/utils/supabase/client";

/** Tool-call rows this report counts as denominator. Matches the views' own scope. */
const COUNTED_TOOL_TYPES: string[] = ["local", "agent", "external"];

/** Supabase's own hard cap per request. */
const PAGE_SIZE = 1000;

/** Ceiling on repeat rows pulled for a windowed rollup. Honesty flag if hit. */
const MAX_REPEAT_ROWS = 20_000;

/** Ceiling on tool_call rows scanned for the windowed denominator. Honesty flag if hit. */
const MAX_CALL_ROWS = 60_000;

/**
 * The date per-iteration context-trim audit coverage widens. NOT a clean line:
 * measured 2026-09-09, repeats before it are partly audited and repeats after it
 * are not all audited, so `first_result_trimmed_before_repeat` is null on both
 * sides and the after-trim count is a floor everywhere. Never render null as No.
 */
export const TRIM_AUDIT_EPOCH = "2026-09-08";

export type RefetchWindow = "7d" | "30d" | "90d" | "all";

export const REFETCH_WINDOWS: { key: RefetchWindow; label: string; days: number | null }[] = [
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
  { key: "all", label: "All time", days: null },
];

export function windowStartIso(w: RefetchWindow): string | null {
  const spec = REFETCH_WINDOWS.find((x) => x.key === w);
  if (!spec?.days) return null;
  return new Date(Date.now() - spec.days * 24 * 60 * 60 * 1000).toISOString();
}

/** One tool's rollup. Every count is a real count; every rate may be null. */
export interface ToolRefetchSummaryRow {
  toolName: string;
  /**
   * Calls in the window. Null ONLY when the denominator could not be
   * established — never coerced to 0, because 0 calls with N repeats is a lie.
   */
  totalCalls: number | null;
  totalConversations: number | null;
  repeats: number;
  repeatRate: number | null;
  sameDataRepeats: number;
  sameDataRate: number | null;
  newDataRepeats: number;
  unknownDataRepeats: number;
  afterTrimRepeats: number;
  medianGapCalls: number | null;
  medianGapSecs: number | null;
  charsRefetchedSameData: number;
  conversations: number;
  lastRepeatAt: string | null;
}

export interface ToolRefetchSummary {
  rows: ToolRefetchSummaryRow[];
  /** True when a row cap was hit and the numbers below are therefore floors. */
  truncated: boolean;
  /** Human sentence naming exactly what was capped. Null when nothing was. */
  truncationNote: string | null;
}

/** One repeat, for the drill-down. */
export interface ToolRefetchDetailRow {
  repeatToolCallId: string;
  conversationId: string | null;
  toolName: string;
  repeatAt: string | null;
  repeatIteration: number | null;
  repeatOutputChars: number | null;
  firstAt: string | null;
  firstIteration: number | null;
  firstOutputChars: number | null;
  priorIdenticalCalls: number | null;
  sameData: boolean | null;
  gapCalls: number | null;
  gapSecs: number | null;
  gapIterations: number | null;
  trimmedBeforeRepeat: boolean | null;
  args: unknown;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function rate(numerator: number, denominator: number | null): number | null {
  if (denominator === null || denominator <= 0) return null;
  return numerator / denominator;
}

/**
 * A read that blew the API's per-statement time limit, not a bug in the caller.
 * Carried as its own class so the UI can say what actually happened and offer
 * the window that does fit, instead of a generic red box or a spinner forever.
 */
export class RefetchTimeoutError extends Error {
  readonly window: RefetchWindow;
  constructor(w: RefetchWindow, detail: string) {
    super(detail);
    this.name = "RefetchTimeoutError";
    this.window = w;
  }
}

/** Postgres 57014 = canceling statement due to statement timeout. */
function isStatementTimeout(err: { code?: string | null; message?: string | null }): boolean {
  return (
    err.code === "57014" ||
    (typeof err.message === "string" && /statement timeout/i.test(err.message))
  );
}

/** ── ALL-TIME: the hourly materialized rollup answers this directly. ──────── */

async function loadAllTime(): Promise<ToolRefetchSummary> {
  // chat.vw_tool_refetch_summary plans at ~17s over the full history (over
  // the data API's 8s statement limit), so all-time reads the materialized
  // snapshot chat.mv_tool_refetch_summary, refreshed hourly by pg_cron
  // (aidream db/migrations/0605). refreshed_at says how old the snapshot is.
  const { data, error } = await supabase
    .schema("chat")
    .from("mv_tool_refetch_summary")
    .select("*")
    .order("same_data_repeats", { ascending: false })
    .limit(PAGE_SIZE);
  if (error) {
    if (isStatementTimeout(error)) {
      throw new RefetchTimeoutError(
        "all",
        "Reading the all-time snapshot (chat.mv_tool_refetch_summary) exceeded the data API's 8-second statement limit — it should be a single indexed table scan, so this is a real defect; report it.",
      );
    }
    throw new Error(error.message);
  }
  const refreshedAt = (data ?? []).find((r) => typeof r.refreshed_at === "string")?.refreshed_at ?? null;

  const rows: ToolRefetchSummaryRow[] = (data ?? [])
    .filter((r) => typeof r.tool_name === "string" && r.tool_name.length > 0)
    .map((r) => ({
      toolName: r.tool_name as string,
      totalCalls: r.total_calls ?? null,
      totalConversations: r.total_conversations ?? null,
      repeats: r.repeats ?? 0,
      repeatRate: r.repeat_rate ?? null,
      sameDataRepeats: r.same_data_repeats ?? 0,
      sameDataRate: r.same_data_rate ?? null,
      newDataRepeats: r.new_data_repeats ?? 0,
      unknownDataRepeats: r.unknown_data_repeats ?? 0,
      afterTrimRepeats: r.after_trim_repeats ?? 0,
      medianGapCalls: r.median_gap_calls ?? null,
      medianGapSecs: r.median_gap_secs ?? null,
      charsRefetchedSameData: r.chars_refetched_same_data ?? 0,
      conversations: r.conversations ?? 0,
      lastRepeatAt: r.last_repeat_at ?? null,
    }));

  return {
    rows,
    truncated: false,
    truncationNote: refreshedAt
      ? `All-time figures are an hourly snapshot, last refreshed ${new Date(refreshedAt).toLocaleString()}.`
      : null,
  };
}

/** ── WINDOWED: recompute from the per-repeat rows + a windowed denominator. ─ */

type RawRepeat = {
  tool_name: string | null;
  conversation_id: string | null;
  repeat_at: string | null;
  same_data: boolean | null;
  first_result_trimmed_before_repeat: boolean | null;
  gap_calls: number | null;
  gap_secs: number | null;
  first_output_chars: number | null;
};

async function pageRepeats(sinceIso: string): Promise<{ rows: RawRepeat[]; truncated: boolean }> {
  const rows: RawRepeat[] = [];
  for (let offset = 0; offset < MAX_REPEAT_ROWS; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .schema("chat")
      .from("vw_tool_refetch")
      .select(
        "tool_name, conversation_id, repeat_at, same_data, first_result_trimmed_before_repeat, gap_calls, gap_secs, first_output_chars",
      )
      .gte("repeat_at", sinceIso)
      .order("repeat_at", { ascending: false })
      .order("repeat_tool_call_id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      if (isStatementTimeout(error)) {
        throw new RefetchTimeoutError(
          "all",
          "Reading the repeats for this window exceeded the data API's 8-second statement limit. chat.vw_tool_refetch recomputes each repeat's same-data and trim verdicts on read, so the cost grows with the window. Try a shorter window.",
        );
      }
      throw new Error(error.message);
    }
    const batch = (data ?? []) as RawRepeat[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

async function pageCallCounts(
  sinceIso: string,
  toolNames: string[],
): Promise<{ counts: Map<string, number>; truncated: boolean }> {
  const counts = new Map<string, number>();
  if (toolNames.length === 0) return { counts, truncated: false };

  for (let offset = 0; offset < MAX_CALL_ROWS; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .schema("chat")
      .from("tool_call")
      .select("tool_name")
      .in("tool_name", toolNames)
      .in("tool_type", COUNTED_TOOL_TYPES)
      .is("deleted_at", null)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    for (const row of batch) {
      const name = row.tool_name;
      if (!name) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    if (batch.length < PAGE_SIZE) return { counts, truncated: false };
  }
  return { counts, truncated: true };
}

async function loadWindowed(sinceIso: string): Promise<ToolRefetchSummary> {
  const { rows: raw, truncated: repeatsTruncated } = await pageRepeats(sinceIso);

  type Acc = {
    repeats: number;
    same: number;
    newData: number;
    unknown: number;
    afterTrim: number;
    gapCalls: number[];
    gapSecs: number[];
    chars: number;
    conversations: Set<string>;
    lastRepeatAt: string | null;
  };
  const byTool = new Map<string, Acc>();

  for (const r of raw) {
    const name = r.tool_name;
    if (!name) continue;
    let acc = byTool.get(name);
    if (!acc) {
      acc = {
        repeats: 0,
        same: 0,
        newData: 0,
        unknown: 0,
        afterTrim: 0,
        gapCalls: [],
        gapSecs: [],
        chars: 0,
        conversations: new Set<string>(),
        lastRepeatAt: null,
      };
      byTool.set(name, acc);
    }
    acc.repeats += 1;
    // Three states, never two.
    if (r.same_data === true) {
      acc.same += 1;
      acc.chars += r.first_output_chars ?? 0;
    } else if (r.same_data === false) {
      acc.newData += 1;
    } else {
      acc.unknown += 1;
    }
    if (r.first_result_trimmed_before_repeat === true) acc.afterTrim += 1;
    if (typeof r.gap_calls === "number") acc.gapCalls.push(r.gap_calls);
    if (r.gap_secs !== null && r.gap_secs !== undefined) acc.gapSecs.push(Number(r.gap_secs));
    if (r.conversation_id) acc.conversations.add(r.conversation_id);
    if (r.repeat_at && (!acc.lastRepeatAt || r.repeat_at > acc.lastRepeatAt)) {
      acc.lastRepeatAt = r.repeat_at;
    }
  }

  const toolNames = [...byTool.keys()];
  const { counts, truncated: callsTruncated } = await pageCallCounts(sinceIso, toolNames);

  const rows: ToolRefetchSummaryRow[] = [...byTool.entries()].map(([toolName, acc]) => {
    // A tool with repeats necessarily had calls; a missing count means the scan
    // could not establish the denominator, not that the denominator is zero.
    const countedCalls = counts.get(toolName);
    const totalCalls = typeof countedCalls === "number" ? countedCalls : null;
    return {
      toolName,
      totalCalls,
      totalConversations: null,
      repeats: acc.repeats,
      repeatRate: rate(acc.repeats, totalCalls),
      sameDataRepeats: acc.same,
      sameDataRate: rate(acc.same, totalCalls),
      newDataRepeats: acc.newData,
      unknownDataRepeats: acc.unknown,
      afterTrimRepeats: acc.afterTrim,
      medianGapCalls: median(acc.gapCalls),
      medianGapSecs: median(acc.gapSecs),
      charsRefetchedSameData: acc.chars,
      conversations: acc.conversations.size,
      lastRepeatAt: acc.lastRepeatAt,
    };
  });

  rows.sort((a, b) => b.sameDataRepeats - a.sameDataRepeats);

  const notes: string[] = [];
  if (repeatsTruncated)
    notes.push(`only the newest ${MAX_REPEAT_ROWS.toLocaleString()} repeats in this window were read`);
  if (callsTruncated)
    notes.push(
      `the total-call scan stopped at ${MAX_CALL_ROWS.toLocaleString()} rows, so total calls and both rates are floors, not exact`,
    );

  return {
    rows,
    truncated: notes.length > 0,
    truncationNote: notes.length > 0 ? `Capped read — ${notes.join("; ")}.` : null,
  };
}

export async function getToolRefetchSummary(w: RefetchWindow): Promise<ToolRefetchSummary> {
  const since = windowStartIso(w);
  return since === null ? loadAllTime() : loadWindowed(since);
}

/** ── DRILL-DOWN: the individual repeats behind one tool's row. ───────────── */

export async function getToolRefetchDetail(
  toolName: string,
  w: RefetchWindow,
  offset: number,
  limit: number,
): Promise<ToolRefetchDetailRow[]> {
  const since = windowStartIso(w);
  let q = supabase
    .schema("chat")
    .from("vw_tool_refetch")
    .select("*")
    .eq("tool_name", toolName);
  if (since !== null) q = q.gte("repeat_at", since);

  const { data, error } = await q
    .order("repeat_at", { ascending: false })
    .order("repeat_tool_call_id", { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) {
    if (isStatementTimeout(error)) {
      throw new RefetchTimeoutError(
        w,
        "Listing this tool's individual repeats exceeded the data API's 8-second statement limit. chat.vw_tool_refetch recomputes each repeat's same-data and trim verdicts on read, so an unbounded window cannot answer. Pick a shorter window.",
      );
    }
    throw new Error(error.message);
  }

  return (data ?? []).map((r, i) => ({
    repeatToolCallId: r.repeat_tool_call_id ?? `${toolName}:${offset + i}`,
    conversationId: r.conversation_id ?? null,
    toolName: r.tool_name ?? toolName,
    repeatAt: r.repeat_at ?? null,
    repeatIteration: r.repeat_iteration ?? null,
    repeatOutputChars: r.repeat_output_chars ?? null,
    firstAt: r.first_at ?? null,
    firstIteration: r.first_iteration ?? null,
    firstOutputChars: r.first_output_chars ?? null,
    priorIdenticalCalls: r.prior_identical_calls ?? null,
    sameData: r.same_data ?? null,
    gapCalls: r.gap_calls ?? null,
    gapSecs: r.gap_secs === null || r.gap_secs === undefined ? null : Number(r.gap_secs),
    gapIterations: r.gap_iterations ?? null,
    trimmedBeforeRepeat: r.first_result_trimmed_before_repeat ?? null,
    args: r.arguments ?? null,
  }));
}

export const DETAIL_PAGE_SIZE = 50;
