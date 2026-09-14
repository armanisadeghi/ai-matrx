/**
 * Run history filters — the ONE shape, and its URL codec.
 *
 * Filters live in the URL (`rh_*` search params) so a filtered view, and the
 * run open inside it, is a durable link someone can reload or share. The
 * codec is pure: `parseRunHistoryFilters` never throws on a hand-edited URL —
 * an unknown value is dropped, never guessed into something else.
 *
 * Model followed: Temporal UI's workflow list and GitHub Actions — the query IS
 * the URL, filter-first, and the default view is the useful one.
 */

export const RUN_KINDS = ["sch_run", "seo_collection_run"] as const;
export type RunKind = (typeof RUN_KINDS)[number];

export const RUN_KIND_LABEL: Record<RunKind, string> = {
  sch_run: "Scheduled task",
  seo_collection_run: "SEO command",
};

export const STATUS_GROUPS = [
  "succeeded",
  "failed",
  "interrupted",
  "running",
] as const;
export type StatusGroup = (typeof STATUS_GROUPS)[number];

export const STATUS_GROUP_LABEL: Record<StatusGroup, string> = {
  succeeded: "Succeeded",
  failed: "Failed",
  interrupted: "Interrupted",
  running: "Running",
};

/** `ai` = runs that made AI calls plus every SEO command run (the default);
 * `all` = every run, heartbeats included. */
export type RunActivity = "ai" | "all";

export interface RunHistoryFilters {
  kind: RunKind | null;
  taskId: string | null;
  operation: string | null;
  statuses: StatusGroup[];
  /** Inclusive local calendar day, `YYYY-MM-DD`. */
  from: string | null;
  /** Inclusive local calendar day, `YYYY-MM-DD`. */
  to: string | null;
  runId: string;
  activity: RunActivity;
}

export interface SelectedRunRef {
  kind: RunKind;
  id: string;
}

export const EMPTY_RUN_HISTORY_FILTERS: RunHistoryFilters = {
  kind: null,
  taskId: null,
  operation: null,
  statuses: [],
  from: null,
  to: null,
  runId: "",
  activity: "ai",
};

const P = {
  kind: "rh_kind",
  task: "rh_task",
  op: "rh_op",
  status: "rh_status",
  from: "rh_from",
  to: "rh_to",
  q: "rh_q",
  view: "rh_view",
  run: "rh_run",
} as const;

export const RUN_HISTORY_PARAM_KEYS: readonly string[] = Object.values(P);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function isRunKind(v: string | null): v is RunKind {
  return v !== null && (RUN_KINDS as readonly string[]).includes(v);
}

function isStatusGroup(v: string): v is StatusGroup {
  return (STATUS_GROUPS as readonly string[]).includes(v);
}

type ReadableParams = Pick<URLSearchParams, "get">;

export function parseRunHistoryFilters(
  params: ReadableParams,
): RunHistoryFilters {
  const kind = params.get(P.kind);
  const task = params.get(P.task);
  const from = params.get(P.from);
  const to = params.get(P.to);
  return {
    kind: isRunKind(kind) ? kind : null,
    taskId: task && UUID.test(task) ? task.toLowerCase() : null,
    operation: params.get(P.op) || null,
    statuses: (params.get(P.status) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(isStatusGroup),
    from: from && DAY.test(from) ? from : null,
    to: to && DAY.test(to) ? to : null,
    runId: params.get(P.q) ?? "",
    activity: params.get(P.view) === "all" ? "all" : "ai",
  };
}

export function parseSelectedRun(params: ReadableParams): SelectedRunRef | null {
  const raw = params.get(P.run);
  if (!raw) return null;
  const [kind, id] = raw.split(":");
  if (!isRunKind(kind ?? null) || !id || !UUID.test(id)) return null;
  return { kind: kind as RunKind, id: id.toLowerCase() };
}

/** Writes the filters + selected run onto a copy of `base`, leaving every
 * non-`rh_*` param untouched. Defaults are omitted so the plain URL stays plain. */
export function writeRunHistoryParams(
  base: URLSearchParams,
  filters: RunHistoryFilters,
  selected: SelectedRunRef | null,
): URLSearchParams {
  const next = new URLSearchParams(base);
  for (const key of RUN_HISTORY_PARAM_KEYS) next.delete(key);
  if (filters.kind) next.set(P.kind, filters.kind);
  if (filters.taskId) next.set(P.task, filters.taskId);
  if (filters.operation) next.set(P.op, filters.operation);
  if (filters.statuses.length) next.set(P.status, filters.statuses.join(","));
  if (filters.from) next.set(P.from, filters.from);
  if (filters.to) next.set(P.to, filters.to);
  if (filters.runId.trim()) next.set(P.q, filters.runId.trim());
  if (filters.activity === "all") next.set(P.view, "all");
  if (selected) next.set(P.run, `${selected.kind}:${selected.id}`);
  return next;
}

export function hasRunHistoryParams(params: ReadableParams): boolean {
  return RUN_HISTORY_PARAM_KEYS.some((key) => params.get(key) !== null);
}

/** A local calendar day's start as an ISO instant — `to` is exclusive of the
 * NEXT day, so a one-day range covers that whole day in the viewer's zone. */
export function dayStartIso(day: string | null, addDays = 0): string | null {
  if (!day || !DAY.test(day)) return null;
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(y, m - 1, d + addDays, 0, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function activeFilterCount(filters: RunHistoryFilters): number {
  return (
    (filters.kind ? 1 : 0) +
    (filters.taskId ? 1 : 0) +
    (filters.operation ? 1 : 0) +
    (filters.statuses.length ? 1 : 0) +
    (filters.from ? 1 : 0) +
    (filters.to ? 1 : 0) +
    (filters.runId.trim() ? 1 : 0)
  );
}
