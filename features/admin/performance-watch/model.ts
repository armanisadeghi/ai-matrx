/**
 * features/admin/performance-watch/model.ts — pure derivations for the performance page.
 *
 * No React, no I/O. Row types are LOCAL and narrow: `ops.perf_sample` and the perf columns on
 * `ops.proof_check` were not in types/database.types.ts when this shipped (wave 1); swap these for
 * `Database["ops"]` after `pnpm db-types` once they are.
 */

export const PERF_STATES = [
  "learning",
  "ok",
  "over_budget",
  "regressed",
  "erroring",
  "stale",
  "probe_broken",
  "paused",
] as const;
export type PerfState = (typeof PERF_STATES)[number];

export const PERF_STATE_LABELS: Record<PerfState, string> = {
  learning: "Learning",
  ok: "OK",
  over_budget: "Over budget",
  regressed: "Regressed",
  erroring: "Erroring",
  stale: "Stale",
  probe_broken: "Probe broken",
  paused: "Paused",
};

export type BudgetStat = "p50" | "p95" | "mean" | "p75";

export interface PerfWatch {
  id: string;
  slug: string;
  label: string;
  owner: string | null;
  source_feature: string | null;
  is_active: boolean;
  live_every_seconds: number | null;
  perf_kind: string | null;
  perf_subject: unknown;
  budget_ms: number | null;
  budget_stat: string | null;
  perf_state: string | null;
  perf_state_since: string | null;
  perf_baseline_ms: number | null;
  perf_baseline_pinned: boolean | null;
  perf_last_alert_at: string | null;
}

export interface PerfSample {
  id: string;
  check_id: string;
  measured_at: string;
  source: string;
  n: number | null;
  p50_ms: number | null;
  p95_ms: number | null;
  max_ms: number | null;
  mean_ms: number | null;
  calls: number | null;
  errors: number | null;
  bytes: number | null;
  release_sha: string | null;
  state_after: string | null;
  note: string | null;
}

export type Tone = "over" | "ok" | "none";
export type AgeTone = "fresh" | "stale" | "none";

export const SPARK_WINDOW_MS = 7 * 24 * 3_600_000;

/** The number the budget binds: the column of the sample named by `budget_stat`. */
export function judgedValue(sample: PerfSample, stat: string | null): number | null {
  switch (stat) {
    case "p50":
      return sample.p50_ms;
    case "p95":
      return sample.p95_ms;
    case "mean":
      return sample.mean_ms;
    default:
      return null;
  }
}

export function budgetTone(value: number | null, budget: number | null): Tone {
  if (value == null || budget == null) return "none";
  return value > budget ? "over" : "ok";
}

/** Stale when the newest sample is older than 3x the cadence. */
export function sampleAgeTone(ageMs: number | null, cadenceSeconds: number | null): AgeTone {
  if (ageMs == null || !cadenceSeconds) return "none";
  return ageMs > cadenceSeconds * 3 * 1000 ? "stale" : "fresh";
}

export function watchState(watch: Pick<PerfWatch, "perf_state">): PerfState {
  const s = watch.perf_state;
  return (PERF_STATES as readonly string[]).includes(s ?? "") ? (s as PerfState) : "learning";
}

export interface WatchRow {
  watch: PerfWatch;
  state: PerfState;
  latest: PerfSample | null;
  judged: number | null;
  tone: Tone;
  /** Judged number of every sample in the last 7 days, oldest first. */
  spark: number[];
  ageMs: number | null;
  age: AgeTone;
}

export function summarizeWatches(
  watches: readonly PerfWatch[],
  samples: readonly PerfSample[],
  now: number,
): WatchRow[] {
  const byWatch = new Map<string, PerfSample[]>();
  for (const s of samples) {
    const list = byWatch.get(s.check_id);
    if (list) list.push(s);
    else byWatch.set(s.check_id, [s]);
  }
  return watches.map((watch) => {
    const own = (byWatch.get(watch.id) ?? [])
      .slice()
      .sort((a, b) => Date.parse(a.measured_at) - Date.parse(b.measured_at));
    const latest = own.length ? own[own.length - 1] : null;
    const judged = latest ? judgedValue(latest, watch.budget_stat) : null;
    const spark = own
      .filter((s) => now - Date.parse(s.measured_at) <= SPARK_WINDOW_MS)
      .map((s) => judgedValue(s, watch.budget_stat))
      .filter((v): v is number => v != null);
    const ageMs = latest ? Math.max(0, now - Date.parse(latest.measured_at)) : null;
    return {
      watch,
      state: watchState(watch),
      latest,
      judged,
      tone: budgetTone(judged, watch.budget_ms),
      spark,
      ageMs,
      age: sampleAgeTone(ageMs, watch.live_every_seconds),
    };
  });
}

export function stateCounts(watches: readonly Pick<PerfWatch, "perf_state">[]): Partial<Record<PerfState, number>> {
  const counts: Partial<Record<PerfState, number>> = {};
  for (const w of watches) {
    const s = watchState(w);
    counts[s] = (counts[s] ?? 0) + 1;
  }
  return counts;
}

export interface StateTransition {
  state: string;
  at: string;
  sampleId: string;
}

/** Each change of `state_after` across the samples, newest first. */
export function stateHistory(samples: readonly PerfSample[]): StateTransition[] {
  const ordered = samples.slice().sort((a, b) => Date.parse(a.measured_at) - Date.parse(b.measured_at));
  const out: StateTransition[] = [];
  let prev: string | null = null;
  for (const s of ordered) {
    if (!s.state_after || s.state_after === prev) continue;
    out.push({ state: s.state_after, at: s.measured_at, sampleId: s.id });
    prev = s.state_after;
  }
  return out.reverse();
}

/** SVG polyline points scaled into width x height (low values at the bottom); "" under two points. */
export function sparklinePoints(values: readonly number[], width: number, height: number): string {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = max === min ? height / 2 : height - ((v - min) / span) * height;
      return `${+x.toFixed(1)},${+y.toFixed(1)}`;
    })
    .join(" ");
}
