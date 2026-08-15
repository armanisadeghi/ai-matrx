// features/scheduling/lib/copy.ts
//
// The ONE place scheduling surfaces build their Copy / Copy-for-AI / export
// payloads (components/agent-copy doctrine — see the `agent-copy` skill).
//
// THE WHAT-I-SEE LAW: these builders mirror what the schedule surfaces
// RENDER, not the raw wire rows. They do that by reusing the surface scope
// fragments in `schedules-scope.ts` — the same functions that feed the
// `matrx-user/schedules` agent surface — so the payload an agent gets from a
// copy button and the context an agent gets from the surface can never drift
// into two different views of the same page. Never fork them.
//
// The page KPIs (`N schedules · M enabled`, rendered by the /schedules route
// header) ride in every payload's attributes AND body, so no variant is
// interpretable without what the page leads with.
//
// Pure — no React, no fetching. Callsites pass these as functions to
// CopyButtons/ExportMenu so they resolve against live data at click time.

import type { AgentPayloadInput } from "@/components/agent-copy/buildAgentPayload";
import type { AiVariant } from "@/components/agent-copy/AiCopyMenu";
import { humanizeRelative, humanizeTrigger } from "../utils/triggerHumanize";
import {
  buildOpenScheduleValues,
  buildScheduleRosterValues,
  buildScheduleRunValues,
} from "./schedules-scope";
import type { AgendaTask, RunStatus, SchRunRow } from "../types";

export const SCHEDULES_LOCATION = "AI Matrx — Schedules (/schedules)";

export function scheduleDetailLocation(task: AgendaTask): string {
  return `AI Matrx — Schedule "${task.title}" (/schedules/${task.id})`;
}

/** `label: value` lines, empties skipped — the human copy flavor. */
export function humanLines(
  lines: Array<[string, string | number | boolean | null | undefined]>,
): string {
  return lines
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");
}

/** The roster KPIs the /schedules header renders, verbatim. */
export interface ScheduleKpis {
  total: number;
  enabled: number;
  disabled: number;
}

export function scheduleKpis(tasks: AgendaTask[]): ScheduleKpis {
  const enabled = tasks.filter((t) => t.enabled).length;
  return { total: tasks.length, enabled, disabled: tasks.length - enabled };
}

export function scheduleKpiLine(kpis: ScheduleKpis): string {
  return `${kpis.total} schedule${kpis.total === 1 ? "" : "s"} · ${kpis.enabled} enabled · ${kpis.disabled} paused`;
}

// ── Human summaries ────────────────────────────────────────────────────────

/** One schedule, as the row renders it. */
export function scheduleSummary(task: AgendaTask): string {
  const trigger = task.triggers[0];
  return humanLines([
    ["Schedule", task.title],
    ["Description", task.description],
    ["State", task.enabled ? "Enabled" : "Paused"],
    [
      "Trigger",
      trigger ? humanizeTrigger(trigger.type, trigger.config) : "No trigger",
    ],
    ["Surfaces", task.surfaces.join(", ")],
    ["Next", humanizeRelative(task.nextDueAt)],
    ["Last run", humanizeRelative(task.lastRunAt)],
    ["Tags", task.tags.join(", ")],
  ]);
}

export function scheduleListHuman(tasks: AgendaTask[]): string {
  const kpis = scheduleKpis(tasks);
  return [scheduleKpiLine(kpis), "", ...tasks.map(scheduleSummary)].join(
    "\n\n",
  );
}

/** One run, as RunRow renders it — the error message verbatim when present. */
export function runSummary(run: SchRunRow): string {
  return humanLines([
    ["Run", run.id],
    ["Status", run.status],
    ["Surface", run.surface],
    ["Due", run.due_at],
    ["Started", run.started_at],
    ["Finished", run.finished_at],
    ["Result", run.result_summary],
    ["Error", run.error_message],
  ]);
}

export function runListHuman(runs: SchRunRow[], task?: AgendaTask): string {
  const head = task
    ? `Run history — ${task.title} (${runs.length} run${runs.length === 1 ? "" : "s"} loaded)`
    : `Run history (${runs.length} run${runs.length === 1 ? "" : "s"} loaded)`;
  return [head, "", ...runs.map(runSummary)].join("\n\n");
}

// ── CSV rows (flat, ALL rows — never the visible slice) ────────────────────

export function scheduleCsvRows(
  tasks: AgendaTask[],
): Array<Record<string, unknown>> {
  return tasks.map((t) => {
    const trigger = t.triggers[0];
    return {
      id: t.id,
      title: t.title,
      description: t.description ?? "",
      enabled: t.enabled,
      trigger_type: trigger?.type ?? "",
      trigger_summary: trigger
        ? humanizeTrigger(trigger.type, trigger.config)
        : "",
      next_due_at: t.nextDueAt ?? "",
      last_run_at: t.lastRunAt ?? "",
      surfaces: t.surfaces.join("|"),
      tags: t.tags.join("|"),
      queue: t.queue,
      auth_mode: t.authMode,
      agent_id: t.agentId ?? "",
      created_at: t.createdAt,
      updated_at: t.updatedAt,
    };
  });
}

export function runCsvRows(runs: SchRunRow[]): Array<Record<string, unknown>> {
  return runs.map((r) => ({
    id: r.id,
    status: r.status,
    surface: r.surface ?? "",
    queue: r.queue ?? "",
    due_at: r.due_at,
    claimed_at: r.claimed_at ?? "",
    started_at: r.started_at ?? "",
    finished_at: r.finished_at ?? "",
    result_summary: r.result_summary ?? "",
    error_message: r.error_message ?? "",
    output_ref_kind: r.output_ref?.kind ?? "",
    output_ref_id: r.output_ref?.id ?? "",
  }));
}

// ── Agent payloads ─────────────────────────────────────────────────────────

/**
 * The roster as the list renders it: KPIs + one entry per schedule, built from
 * the surface's own roster fragment.
 */
export function buildScheduleListPayload(
  tasks: AgendaTask[],
  status: string,
  error: string | null,
): AgentPayloadInput {
  const kpis = scheduleKpis(tasks);
  return {
    kind: "schedules-list",
    location: SCHEDULES_LOCATION,
    description:
      "Every schedule on the user's schedules list, as rendered — trigger, next/last run, surfaces and enabled state.",
    data: buildScheduleRosterValues(tasks, status, error),
    summary: scheduleKpiLine(kpis),
    attributes: {
      rows: tasks.length,
      enabled: kpis.enabled,
      disabled: kpis.disabled,
      load_status: status,
      load_error: error ?? undefined,
    },
  };
}

/** A single schedule row — the list KPIs ride along as parent context. */
export function buildScheduleRowPayload(
  task: AgendaTask,
  kpis: ScheduleKpis,
): AgentPayloadInput {
  return {
    kind: "schedule",
    location: SCHEDULES_LOCATION,
    description: "One schedule row from the schedules list.",
    data: buildOpenScheduleValues(task).open_schedule,
    summary: scheduleSummary(task),
    attributes: {
      id: task.id,
      title: task.title,
      enabled: task.enabled,
      trigger_type: task.triggers[0]?.type,
    },
    context: {
      list_total: kpis.total,
      list_enabled: kpis.enabled,
      list_disabled: kpis.disabled,
    },
  };
}

interface ScheduleRecordInput {
  task: AgendaTask;
  runs: SchRunRow[];
  runsStatus: string;
  runsError: string | null;
  kpis: ScheduleKpis;
}

function runAttributes(runs: SchRunRow[]) {
  const byStatus: Partial<Record<RunStatus, number>> = {};
  for (const run of runs)
    byStatus[run.status] = (byStatus[run.status] ?? 0) + 1;
  return {
    runs_loaded: runs.length,
    runs_failed: byStatus.failed ?? 0,
    last_run_status: runs[0]?.status,
    last_run_error: runs[0]?.error_message ?? undefined,
  };
}

/**
 * The detail page as rendered: the schedule record, its trigger and spec, and
 * its run history — errors verbatim. This is the DEFAULT (plain-click) payload.
 */
export function buildScheduleRecordPayload(
  input: ScheduleRecordInput,
): AgentPayloadInput {
  const { task, runs, runsStatus, runsError, kpis } = input;
  return {
    kind: "schedule-record",
    location: scheduleDetailLocation(task),
    description:
      "The open schedule as the detail page renders it: spec, trigger, and run history.",
    data: {
      ...buildOpenScheduleValues(task),
      ...buildScheduleRunValues(runs, runsStatus, runsError),
    },
    summary: [scheduleSummary(task), "", runListHuman(runs, task)].join("\n"),
    attributes: {
      id: task.id,
      title: task.title,
      enabled: task.enabled,
      trigger_type: task.triggers[0]?.type,
      ...runAttributes(runs),
    },
    context: {
      list_total: kpis.total,
      list_enabled: kpis.enabled,
      list_disabled: kpis.disabled,
      runs_load_status: runsStatus,
      runs_load_error: runsError ?? undefined,
    },
  };
}

/**
 * Detail-page variants. A schedule with a long prompt plus a full run history
 * is medium-sized data with two genuinely separate reasons to copy it — "why
 * isn't this firing right" (spec + trigger) versus "what happened when it ran"
 * (runs) — so the menu is shaped by that usage, not by arbitrary slicing.
 * `buildScheduleRecordPayload` stays the never-lossy "Everything".
 */
export function scheduleRecordVariants(
  get: () => ScheduleRecordInput,
): AiVariant[] {
  return [
    {
      id: "spec",
      label: "Spec + trigger",
      hint: "What this schedule runs and when — no run history",
      build: () => {
        const { task, kpis } = get();
        return {
          kind: "schedule-spec",
          location: scheduleDetailLocation(task),
          description:
            "The schedule's agent spec and trigger, without run history.",
          data: buildOpenScheduleValues(task),
          summary: scheduleSummary(task),
          attributes: {
            id: task.id,
            title: task.title,
            enabled: task.enabled,
            trigger_type: task.triggers[0]?.type,
            detail: "spec",
          },
          context: {
            list_total: kpis.total,
            list_enabled: kpis.enabled,
            list_disabled: kpis.disabled,
          },
        };
      },
    },
    {
      id: "runs",
      label: "Run history",
      hint: "Every loaded run with its error text — no prompt or spec",
      build: () => {
        const { task, runs, runsStatus, runsError, kpis } = get();
        return {
          kind: "schedule-runs",
          location: scheduleDetailLocation(task),
          description:
            "The open schedule's run history as rendered, error messages verbatim.",
          data: {
            schedule: { id: task.id, title: task.title, enabled: task.enabled },
            ...buildScheduleRunValues(runs, runsStatus, runsError),
          },
          summary: runListHuman(runs, task),
          attributes: {
            id: task.id,
            title: task.title,
            detail: "runs",
            ...runAttributes(runs),
          },
          context: {
            list_total: kpis.total,
            list_enabled: kpis.enabled,
            list_disabled: kpis.disabled,
            runs_load_status: runsStatus,
            runs_load_error: runsError ?? undefined,
          },
        };
      },
    },
  ];
}

/** The run-history card's own list payload. */
export function buildRunListPayload(input: {
  task: AgendaTask | null;
  runs: SchRunRow[];
  runsStatus: string;
  runsError: string | null;
}): AgentPayloadInput {
  const { task, runs, runsStatus, runsError } = input;
  return {
    kind: "schedule-runs",
    location: task ? scheduleDetailLocation(task) : SCHEDULES_LOCATION,
    description: "The run history list as rendered, error messages verbatim.",
    data: {
      schedule: task
        ? { id: task.id, title: task.title, enabled: task.enabled }
        : null,
      ...buildScheduleRunValues(runs, runsStatus, runsError),
    },
    summary: runListHuman(runs, task ?? undefined),
    attributes: {
      schedule_id: task?.id,
      ...runAttributes(runs),
    },
    context: {
      runs_load_status: runsStatus,
      runs_load_error: runsError ?? undefined,
    },
  };
}

/** A single run row — the schedule identity rides in the envelope. */
export function buildRunRowPayload(
  run: SchRunRow,
  task: AgendaTask | null,
): AgentPayloadInput {
  return {
    kind: "schedule-run",
    location: task ? scheduleDetailLocation(task) : SCHEDULES_LOCATION,
    description: "One run from a schedule's run history.",
    data: run,
    summary: runSummary(run),
    attributes: {
      id: run.id,
      status: run.status,
      failed: run.status === "failed",
      error: run.error_message ?? undefined,
    },
    context: {
      schedule_id: task?.id,
      schedule_title: task?.title,
      schedule_enabled: task?.enabled,
    },
  };
}
