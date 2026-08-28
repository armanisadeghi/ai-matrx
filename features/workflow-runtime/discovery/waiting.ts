/**
 * The "waiting on you" projection, parsed — census #38, SPEC-workflow-ui-contract §4.3.
 *
 * `GET /runs/waiting` answers with every run of the caller's that is holding
 * for a PERSON: `interrupted` (a question asked mid-run) and `awaiting_input`
 * (a start-time park for a missing required input). Two statuses, one inbox —
 * a surface that lists one and not the other is wrong.
 *
 * Parsing is defensive for the same reason `result-schema.ts` is: this is a
 * served contract, and a surface that throws on an unexpected field turns a
 * cosmetic drift into a dead inbox. The rows this list carries are the ONLY
 * way to find these runs, so a thin row always beats a blank page.
 *
 * `stale: true` is the server's own honesty flag — that row's snapshot was
 * RECOVERED from the interrupt payload or checkpoint because the run parked
 * before the snapshot contract existed. Such a row is thinner (often no title,
 * no prompt), never hidden: we render what it carries and say so.
 *
 * Pure — no React, no Redux, no fetch.
 */

import type { components } from "@/types/python-generated/api-types";

/**
 * The wire rows, straight from the generated OpenAPI schema — never mirrored.
 *
 * 🚨 These aliases are also a TRIPWIRE. `/runs/waiting` landed in aidream
 * before the deployed server carried it, and a routine regen against
 * production silently deleted the paths and schemas this feature is built on.
 * Referencing the generated schema here turns that regen into a compile error
 * rather than a surface that quietly stops working;
 * `__tests__/waiting-contract.test.ts` says the same thing in CI.
 */
export type WaitingRunWire = components["schemas"]["WaitingRun"];
export type WaitingSnapshotWire = components["schemas"]["WaitingSnapshot"];
export type WaitingGapWire = components["schemas"]["WaitingGap"];

/** One missing input on an `awaiting_input` park. */
export interface WaitingGap {
  name: string;
  label: string | null;
}

/** One inbox row, normalized for rendering. */
export interface WaitingRunRow {
  runId: string;
  definitionId: string | null;
  workflowName: string | null;
  status: string;
  kind: "interrupt" | "awaiting_input";
  title: string | null;
  prompt: string | null;
  missing: WaitingGap[];
  /** The snapshot was recovered, not read — the row may be thin. */
  stale: boolean;
  askedAt: string | null;
  deadline: string | null;
  /** Set when the question lives inside a fan-out or a subgraph call. */
  parentRunId: string | null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function parseGaps(raw: unknown): WaitingGap[] {
  if (!Array.isArray(raw)) return [];
  const gaps: WaitingGap[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    const name = text(record.name);
    if (!name) continue;
    gaps.push({ name, label: text(record.label) });
  }
  return gaps;
}

/**
 * One wire row → one render row, or null when the row carries no run id (which
 * would be a door to nowhere, and this whole surface exists to be a door).
 */
export function parseWaitingRun(raw: unknown): WaitingRunRow | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const runId = text(record.run_id);
  if (!runId) return null;

  const snapshot =
    typeof record.snapshot === "object" && record.snapshot !== null
      ? (record.snapshot as Record<string, unknown>)
      : {};
  const status = text(record.status) ?? "";

  // The KIND decides which half of the row renders. The snapshot declares it;
  // the status is the fallback, because a row we cannot classify still has to
  // land in one of the two shapes rather than nowhere.
  const declared = text(snapshot.kind);
  const kind: WaitingRunRow["kind"] =
    declared === "awaiting_input" || (declared === null && status === "awaiting_input")
      ? "awaiting_input"
      : "interrupt";

  return {
    runId,
    definitionId: text(record.definition_id),
    workflowName: text(record.workflow_name),
    status,
    kind,
    title: text(snapshot.title),
    prompt: text(snapshot.prompt),
    missing: parseGaps(snapshot.missing),
    stale: snapshot.stale === true,
    askedAt: text(record.asked_at),
    deadline: text(record.deadline),
    parentRunId: text(record.parent_run_id),
  };
}

/** The whole response — rows only, in the server's order (newest first). */
export function parseWaitingRuns(raw: unknown): WaitingRunRow[] {
  if (typeof raw !== "object" || raw === null) return [];
  const runs = (raw as Record<string, unknown>).runs;
  if (!Array.isArray(runs)) return [];
  const rows: WaitingRunRow[] = [];
  for (const item of runs) {
    const row = parseWaitingRun(item);
    if (row) rows.push(row);
  }
  return rows;
}

/**
 * The one line that says what this run wants — the whole point of the row.
 *
 * An interrupt speaks for itself (the author's title, else the question). A
 * park has no words of its own, so we name the inputs it is missing: "Needs
 * Topic and Audience" reads as an instruction, where "awaiting_input" reads as
 * a log line. A recovered row that carries neither says so honestly rather
 * than inventing a question nobody asked.
 */
export function waitingSummary(row: WaitingRunRow): string {
  if (row.kind === "awaiting_input") {
    const names = row.missing.map((gap) => gap.label ?? gap.name).filter(Boolean);
    if (names.length === 0) return "Needs the inputs it was started without";
    if (names.length === 1) return `Needs ${names[0]}`;
    if (names.length === 2) return `Needs ${names[0]} and ${names[1]}`;
    return `Needs ${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
  }
  return row.title ?? row.prompt ?? "Asked you a question";
}

/** The verb on the row's door — the two parks want different things. */
export function waitingAction(row: WaitingRunRow): string {
  return row.kind === "awaiting_input" ? "Provide inputs" : "Answer";
}

/**
 * The run's permalink. THE DOOR LAW: every row opens its run, and the run page
 * is where answering lives — this inbox never grows a second answer form.
 */
export function waitingRunHref(row: WaitingRunRow): string {
  return `/workflows/runs/${row.runId}`;
}

/** Past-due deadlines are the one thing this list must not state calmly. */
export function isOverdue(row: WaitingRunRow, now: number = Date.now()): boolean {
  if (!row.deadline) return false;
  const at = Date.parse(row.deadline);
  return Number.isFinite(at) && at < now;
}
