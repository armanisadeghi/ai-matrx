// features/entitlements/usage-gate/usageState.ts
//
// THE CLIENT SHAPE of a person's usage state — what `billing.user_usage_state`
// returns, normalised once. The function is the ONE answer (USAGE-GATE.md "The
// one answer"): this module only READS its fields. It never derives a state, a
// remaining balance or a percentage — `state`, `remaining` and `near_ratio`
// all come from the server as written.
//
// Pure: no Redux, no Supabase, no React — the slice, the gate, the stream
// handler and the directive handler all share it.

export type UsageGateLevel = "ok" | "near" | "over";

export interface UsageWindow {
  period: string;
  limit: number | null;
  /** Null when billing supplied no finite usage count; never coerced to zero. */
  used: number | null;
  remaining: number | null;
  resetsAt: string | null;
  state: UsageGateLevel;
}

/**
 * The free time governing the person's plan (`billing._free_period_state`), or
 * null when they pay or hold none. Free time is never endless (rule 18): an
 * `active` period carries its end, an `ended` one prompts a paid plan.
 */
export interface FreePeriod {
  status: "active" | "ended";
  planKey: string | null;
  /** Null only for an undated legacy grant. */
  endsAt: string | null;
  daysLeft: number | null;
  source: string | null;
}

export interface UsageSnapshot {
  state: UsageGateLevel;
  planKey: string | null;
  planName: string | null;
  /** The window that decided `state` (the server's `binding_period`). */
  bindingPeriod: string | null;
  resetsAt: string | null;
  windows: UsageWindow[];
  /** The server's `computed_at`. */
  computedAt: string | null;
  /**
   * The enforcement switch (billing.capability 'platform.points'.enforced), as
   * the server read it. Absent = false: a state never blocks unless the server
   * says enforcement is on.
   */
  enforced: boolean;
  /** The server's `free_period`; null when paying or none. */
  freePeriod: FreePeriod | null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function level(v: unknown): UsageGateLevel | null {
  return v === "ok" || v === "near" || v === "over" ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function parseWindow(v: unknown): UsageWindow | null {
  if (!isRecord(v)) return null;
  const state = level(v.state);
  const period = str(v.period);
  if (!state || !period) return null;
  return {
    period,
    limit: num(v.limit),
    used: num(v.used),
    remaining: num(v.remaining),
    resetsAt: str(v.resets_at),
    state,
  };
}

export function parseFreePeriod(v: unknown): FreePeriod | null {
  if (!isRecord(v)) return null;
  const status =
    v.status === "active" || v.status === "ended" ? v.status : null;
  if (!status) return null;
  return {
    status,
    planKey: str(v.plan_key),
    endsAt: str(v.ends_at),
    daysLeft: num(v.days_left),
    source: str(v.source),
  };
}

function parseFlat(v: Record<string, unknown>): UsageSnapshot | null {
  const state = level(v.state);
  if (!state) return null;
  const windows = Array.isArray(v.windows)
    ? v.windows.map(parseWindow).filter((w): w is UsageWindow => w !== null)
    : [];
  return {
    state,
    planKey: str(v.plan_key),
    planName: str(v.plan_name),
    bindingPeriod: str(v.binding_period),
    resetsAt: str(v.resets_at),
    windows,
    computedAt: str(v.computed_at),
    enforced: v.enforced === true,
    freePeriod: parseFreePeriod(v.free_period),
  };
}

/**
 * Accepts the RPC's jsonb, and every envelope a server notification can carry
 * it in (a directive payload, an `info` stream event's `metadata`, a refusal
 * body, a stream `error` event's `details`): the object itself, or nested
 * under `usage` / `usage_state` / `metadata` / `detail` / `details` /
 * `serverDetail`. Returns null for anything that is not
 * a usage state — the caller then leaves Redux untouched.
 */
export function parseUsageSnapshot(raw: unknown): UsageSnapshot | null {
  const visit = (v: unknown, depth: number): UsageSnapshot | null => {
    if (!isRecord(v) || depth > 4) return null;
    // A refusal body carries `state: "over"` and the binding window's numbers
    // at its top level AND the full state under `usage` — the full one wins,
    // or the windows would be lost.
    for (const key of ["usage", "usage_state"]) {
      const hit = visit(v[key], depth + 1);
      if (hit) return hit;
    }
    const flat = parseFlat(v);
    if (flat) return flat;
    for (const key of ["metadata", "detail", "details", "serverDetail"]) {
      const hit = visit(v[key], depth + 1);
      if (hit) return hit;
    }
    return null;
  };
  return visit(raw, 0);
}

/** The window that decided the state — the one a notice or refusal names. */
export function bindingWindow(snapshot: UsageSnapshot): UsageWindow | null {
  if (snapshot.bindingPeriod) {
    const hit = snapshot.windows.find(
      (w) => w.period === snapshot.bindingPeriod,
    );
    if (hit) return hit;
  }
  return (
    snapshot.windows.find((w) => w.state === snapshot.state) ??
    snapshot.windows[0] ??
    null
  );
}

/** Windows whose reset slides forward with every recompute. */
function isRollingPeriod(period: string | null): boolean {
  return period !== null && period.startsWith("rolling_");
}

/**
 * The once-per-session key of the near / over notice: the level plus the
 * window that decided it. A fixed window (day / week / month) adds its reset —
 * stable for the whole calendar period, new when the next one starts. A
 * rolling window's reset moves on every recompute, so it is left out: one
 * notice per level per rolling window per session.
 */
export function usageNoticeKey(
  level: UsageGateLevel,
  bindingPeriod: string | null,
  resetsAt: string | null,
): string {
  const period = bindingPeriod ?? "";
  const periodStart = isRollingPeriod(bindingPeriod) ? "" : (resetsAt ?? "");
  return `${level}:${period}:${periodStart}`;
}

/** Which limit a reset belongs to, for the notice's one line ("Weekly limit resets …"). */
export function resetSubject(period: string | null | undefined): string {
  switch (period) {
    case "day":
      return "Daily limit";
    case "week":
      return "Weekly limit";
    case "month":
      return "Monthly limit";
    case "rolling_1h":
      return "Hourly limit";
    case "rolling_5h":
      return "5-hour limit";
    default:
      return "Limit";
  }
}
