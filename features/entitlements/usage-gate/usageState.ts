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
  used: number;
  remaining: number | null;
  resetsAt: string | null;
  state: UsageGateLevel;
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
    used: num(v.used) ?? 0,
    remaining: num(v.remaining),
    resetsAt: str(v.resets_at),
    state,
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
  };
}

/**
 * Accepts the RPC's jsonb, and every envelope a server notification can carry
 * it in (a directive payload, an `info` stream event's `metadata`, a refusal
 * body): the object itself, or nested under `usage` / `usage_state` /
 * `metadata` / `detail` / `serverDetail`. Returns null for anything that is not
 * a usage state — the caller then leaves Redux untouched.
 */
export function parseUsageSnapshot(raw: unknown): UsageSnapshot | null {
  const visit = (v: unknown, depth: number): UsageSnapshot | null => {
    if (!isRecord(v) || depth > 4) return null;
    const flat = parseFlat(v);
    if (flat) return flat;
    for (const key of [
      "usage",
      "usage_state",
      "metadata",
      "detail",
      "serverDetail",
    ]) {
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
    const hit = snapshot.windows.find((w) => w.period === snapshot.bindingPeriod);
    if (hit) return hit;
  }
  return (
    snapshot.windows.find((w) => w.state === snapshot.state) ??
    snapshot.windows[0] ??
    null
  );
}
