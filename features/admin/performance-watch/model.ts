/**
 * features/admin/performance-watch/model.ts — pure derivations for the performance page.
 *
 * No React, no I/O. Row types are the generated `Database["ops"]` rows (`pnpm db-types`), narrowed
 * to the columns the page selects (service.ts).
 */

import type { Database } from "@/types/database.types";

type ProofCheckRow = Database["ops"]["Tables"]["proof_check"]["Row"];
type PerfSampleRow = Database["ops"]["Tables"]["perf_sample"]["Row"];

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

export type PerfWatch = Pick<
  ProofCheckRow,
  | "id"
  | "slug"
  | "label"
  | "owner"
  | "source_feature"
  | "is_active"
  | "live_every_seconds"
  | "perf_kind"
  | "perf_subject"
  | "budget_ms"
  | "budget_stat"
  | "perf_state"
  | "perf_state_since"
  | "perf_baseline_ms"
  | "perf_baseline_pinned"
  | "perf_last_alert_at"
  | "metadata"
>;

export type PerfSample = Pick<
  PerfSampleRow,
  | "id"
  | "check_id"
  | "measured_at"
  | "source"
  | "n"
  | "p50_ms"
  | "p95_ms"
  | "max_ms"
  | "mean_ms"
  | "calls"
  | "errors"
  | "bytes"
  | "release_sha"
  | "state_after"
  | "note"
  | "metadata"
>;

/** The edit door's arguments (ops.perf_watch_update); undefined leaves a value as it is. */
export type PerfWatchEdit = Database["ops"]["Functions"]["perf_watch_update"]["Args"];

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
    case "p75": {
      // Vitals carry p75 (web.dev's percentile) in the sample's metadata.
      const m = isRecord(sample.metadata) ? sample.metadata.p75_ms : null;
      return typeof m === "number" ? m : null;
    }
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

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Why the watch is in its state (metadata.perf_last_reason, written by the judge). */
export function watchReason(watch: Pick<PerfWatch, "metadata">): string | null {
  const m = isRecord(watch.metadata) ? watch.metadata : null;
  const r = m?.perf_last_reason ?? m?.perf_last_collect_note;
  return typeof r === "string" && r.trim() ? r : null;
}

/** A large-table twin (`door:<fn>@large`). */
export function isLargeTwin(watch: Pick<PerfWatch, "slug">): boolean {
  return watch.slug.endsWith("@large");
}

/** What a watch measures, in one short line. */
export function measuresLine(watch: Pick<PerfWatch, "perf_kind">): string {
  switch (watch.perf_kind) {
    case "door":
      return "Database time, probe seat";
    case "statement":
      return "Mean, all real callers";
    case "job":
      return "Job duration";
    case "vital":
      return "Web vital";
    case "page":
      return "Page load";
    default:
      return "—";
  }
}

export interface SubjectField {
  label: string;
  value: string;
  /** When set, the value names a record that opens (EntityRef token + id). */
  token?: "record" | "organization";
  id?: string;
}

const PROBE_SEAT = "admin@admin.com";
const HIDDEN_ARGS = new Set(["p_organization_id", "p_table_id", "p_source"]);

function shortId(v: unknown): string | null {
  return typeof v === "string" && v ? v.slice(0, 8) : null;
}

function argValue(v: unknown): string {
  if (Array.isArray(v)) {
    const ids = v.every((x) => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x));
    return ids ? `${v.length} ids` : JSON.stringify(v);
  }
  if (isRecord(v)) return JSON.stringify(v);
  return v === null ? "null" : String(v);
}

/** The watch's subject as readable fields (function, table, seat, args) instead of raw JSON. */
export function subjectFields(watch: Pick<PerfWatch, "perf_kind" | "perf_subject" | "metadata">): SubjectField[] {
  const s = isRecord(watch.perf_subject) ? watch.perf_subject : null;
  if (!s) return [];
  const out: SubjectField[] = [];
  if (typeof s.schema === "string" && typeof s.function === "string") {
    out.push({ label: "Function", value: `${s.schema}.${s.function}` });
  }
  const args = isRecord(s.args) ? s.args : {};
  const source = isRecord(args.p_source) ? args.p_source : null;
  // Names come from metadata.perf_subject_names (written by ops.perf_watch_declare).
  const names = isRecord(watch.metadata) && isRecord(watch.metadata.perf_subject_names) ? watch.metadata.perf_subject_names : {};
  const tableId = typeof args.p_table_id === "string" ? args.p_table_id : typeof source?.id === "string" ? source.id : null;
  if (tableId) {
    const records = typeof s.table_records === "number" ? ` · ${s.table_records.toLocaleString("en-US")} records` : "";
    const name = typeof names.table_name === "string" ? names.table_name : shortId(tableId);
    out.push({ label: "Table", value: `${name}${records}`, token: "record", id: tableId });
  }
  const orgId = typeof args.p_organization_id === "string" ? args.p_organization_id : null;
  if (orgId) {
    const name = typeof names.organization_name === "string" ? names.organization_name : (shortId(orgId) ?? orgId);
    out.push({ label: "Organization", value: name, token: "organization", id: orgId });
  }
  if (watch.perf_kind === "door") {
    out.push({ label: "Seat", value: typeof s.seat_email === "string" && s.seat_email ? s.seat_email : PROBE_SEAT });
  }
  if (watch.perf_kind === "job") {
    if (typeof s.scheduler === "string") out.push({ label: "Scheduler", value: s.scheduler });
    if (typeof s.schedule === "string") out.push({ label: "Schedule", value: s.schedule });
    if (typeof s.budget_basis === "string") out.push({ label: "Budget basis", value: s.budget_basis });
  }
  if (watch.perf_kind === "vital") {
    if (typeof s.route === "string") out.push({ label: "Route", value: s.route });
    if (typeof s.unit === "string") out.push({ label: "Unit", value: s.unit });
    out.push({ label: "Callers", value: "Sampled real page loads" });
  }
  if (watch.perf_kind === "statement") {
    out.push({ label: "Callers", value: "All real callers" });
    if (typeof s.match === "string") out.push({ label: "Matches", value: s.match });
  }
  const rest = Object.entries(args).filter(([k]) => !HIDDEN_ARGS.has(k));
  if (rest.length) {
    out.push({ label: "Args", value: rest.map(([k, v]) => `${k.replace(/^p_/, "")}=${argValue(v)}`).join(", ") });
  }
  return out;
}
