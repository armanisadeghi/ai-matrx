/**
 * row-actions.ts — ONE-CLICK ACTIONS ON A ROW of a user data table.
 *
 * Arman, 2026-09-21: "I track some settings and if I had a button for 'New
 * Week' I would have it increment the reset date by 7 days, clear the values
 * for total and fable columns and then set the status to AVAILABLE."
 *
 * Airtable's button field + automation "Update record", Notion's database
 * button (2023): a named button on the row that applies a fixed set of
 * changes. Stored on the table as `metadata.row_actions` (an array), set
 * through `udt_set_table_row_actions`:
 *
 *   {
 *     id: "a1b2", name: "New Week", color: "green", confirm: false,
 *     kind: "update",
 *     steps: [
 *       { field: "status",     set: "value",   value: "AVAILABLE" },
 *       { field: "total",      set: "clear" },
 *       { field: "fable",      set: "clear" },
 *       { field: "reset_date", set: "formula", expression: 'DATEADD({Reset date}, 7, "days")' },
 *     ],
 *   }
 *   { id: "c3d4", name: "Summarize", kind: "agent", prompt: "Write a one-line summary of this account…" }
 *
 * THE ONE PRIMITIVE. Arman's classes 1–3 are all `update` actions:
 *   1. "set the row to a template row"        = a `value` step per column, captured from a row;
 *   2. "…but skip / keep certain columns"      = the same list with steps removed;
 *   3. "…plus an intelligent update"           = a `formula` step, evaluated against the row
 *      as it is BEFORE the action, with the whole formula language (DATEADD, IF, TODAY, …).
 * Class 5 is an `agent` action: the row goes to an agent with a prompt and the
 * table surface's tools. Class 4 (actions that read other rows or other
 * tables) is deliberately NOT here — it belongs to the workflow / automation
 * primitives, never inside data-tables (FEATURE.md, "what stays out").
 *
 * Pure module. `compileRowAction` turns one action + one row into the patch to
 * write, or the reason it cannot be applied; `buildRowActionOps` maps it over a
 * selection into ONE `udt_bulk_write` transaction, so a 40-row "New Week"
 * either happens or does not. Computed columns (formula, created/modified
 * time, autonumber) are refused at compile time: nothing is ever written to
 * them and the action editor never offers them.
 */

import {
  evaluateFormula,
  isComputedColumn,
  parseFormula,
  type ComputedColumnField,
  type ResolveCell,
} from "./formulas";
import type { BulkOp } from "./types";
import { isStyleColor, type StyleColor } from "./table-style";

// ─── model ───────────────────────────────────────────────────────────────────

export type RowActionStep =
  | { field: string; set: "value"; value: unknown }
  | { field: string; set: "clear" }
  | { field: string; set: "formula"; expression: string };

export type RowActionKind = "update" | "agent";

export type RowAction = {
  id: string;
  name: string;
  /** Button tint; `null` is the neutral button. */
  color?: StyleColor | null;
  /** Ask before running. Off by default: an update is one bulk write, and cell history keeps the old values. */
  confirm?: boolean;
  kind: RowActionKind;
  /** `update` only. */
  steps?: RowActionStep[];
  /** `agent` only: what the agent is asked to do with the row. */
  prompt?: string;
};

export type RowActionField = ComputedColumnField & {
  display_name: string;
  data_type: string;
  field_order?: number;
};

export const MAX_ROW_ACTIONS = 24;
export const MAX_ROW_ACTION_STEPS = 60;

export function newRowActionId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ─── reading what is stored ──────────────────────────────────────────────────

function readStep(raw: unknown): RowActionStep | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.field !== "string" || !r.field) return null;
  if (r.set === "clear") return { field: r.field, set: "clear" };
  if (r.set === "value") return { field: r.field, set: "value", value: r.value ?? null };
  if (r.set === "formula" && typeof r.expression === "string" && r.expression.trim()) {
    return { field: r.field, set: "formula", expression: r.expression };
  }
  return null;
}

/** Read `metadata.row_actions`; anything malformed is skipped, never thrown. */
export function readRowActions(metadata: unknown): RowAction[] {
  if (!metadata || typeof metadata !== "object") return [];
  const raw = (metadata as { row_actions?: unknown }).row_actions;
  if (!Array.isArray(raw)) return [];
  const out: RowAction[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (typeof r.id !== "string" || !r.id) continue;
    if (typeof r.name !== "string" || !r.name.trim()) continue;
    const kind: RowActionKind = r.kind === "agent" ? "agent" : "update";
    const action: RowAction = {
      id: r.id,
      name: r.name.trim(),
      color: isStyleColor(r.color) ? r.color : null,
      confirm: r.confirm === true,
      kind,
    };
    if (kind === "update") {
      action.steps = Array.isArray(r.steps)
        ? r.steps.map(readStep).filter((s): s is RowActionStep => s !== null)
        : [];
    } else {
      action.prompt = typeof r.prompt === "string" ? r.prompt : "";
    }
    out.push(action);
  }
  return out.slice(0, MAX_ROW_ACTIONS);
}

// ─── validation (the editor's live checks; the door re-checks server-side) ──

export type RowActionProblem = { actionId: string; message: string };

export function validateRowActions(
  actions: readonly RowAction[],
  fields: readonly RowActionField[],
): RowActionProblem[] {
  const problems: RowActionProblem[] = [];
  const byName = new Map(fields.map((f) => [f.field_name, f] as const));
  const seen = new Set<string>();
  for (const a of actions) {
    if (!a.name.trim()) problems.push({ actionId: a.id, message: "The action needs a name." });
    const key = a.name.trim().toLowerCase();
    if (key && seen.has(key)) {
      problems.push({ actionId: a.id, message: `Two actions are called "${a.name.trim()}".` });
    }
    seen.add(key);
    if (a.kind === "agent") {
      if (!a.prompt?.trim()) problems.push({ actionId: a.id, message: "Say what the agent should do with the row." });
      continue;
    }
    const steps = a.steps ?? [];
    if (steps.length === 0) problems.push({ actionId: a.id, message: "Add at least one change." });
    if (steps.length > MAX_ROW_ACTION_STEPS) {
      problems.push({ actionId: a.id, message: `An action can change at most ${MAX_ROW_ACTION_STEPS} columns.` });
    }
    const touched = new Set<string>();
    for (const s of steps) {
      const f = byName.get(s.field);
      if (!f) {
        problems.push({ actionId: a.id, message: `The column "${s.field}" no longer exists.` });
        continue;
      }
      if (isComputedColumn(f)) {
        problems.push({ actionId: a.id, message: `"${f.display_name}" is calculated and cannot be set.` });
      }
      if (touched.has(s.field)) {
        problems.push({ actionId: a.id, message: `"${f.display_name}" is changed twice in the same action.` });
      }
      touched.add(s.field);
      if (s.set === "formula") {
        const parsed = parseFormula(s.expression);
        if (!parsed.ok) problems.push({ actionId: a.id, message: `"${f.display_name}": ${parsed.error}` });
        else {
          for (const ref of parsed.references) {
            if (!resolveReference(ref, fields)) {
              problems.push({ actionId: a.id, message: `"${f.display_name}": no column is called {${ref}}.` });
            }
          }
        }
      }
    }
  }
  return problems;
}

function resolveReference(name: string, fields: readonly RowActionField[]): RowActionField | null {
  const lower = name.trim().toLowerCase();
  return (
    fields.find((f) => f.field_name.toLowerCase() === lower) ??
    fields.find((f) => f.display_name.toLowerCase() === lower) ??
    null
  );
}

// ─── compiling one action against one row ────────────────────────────────────

export type CompiledRowAction =
  | { ok: true; patch: Record<string, unknown> }
  | { ok: false; error: string };

/**
 * The patch an `update` action writes to `row`, computed against the row AS IT
 * IS NOW — every formula step sees the pre-action values, so "Reset date + 7
 * days" and "clear Total" in the same action cannot see each other's results.
 * That is what a person expects of a button and what Airtable does.
 */
export function compileRowAction(
  action: RowAction,
  row: { id: string; data: Record<string, unknown> },
  fields: readonly RowActionField[],
): CompiledRowAction {
  if (action.kind !== "update") return { ok: false, error: `"${action.name}" asks an agent; it has no fixed changes to apply.` };
  const steps = action.steps ?? [];
  if (steps.length === 0) return { ok: false, error: `"${action.name}" has no changes to apply.` };
  const byName = new Map(fields.map((f) => [f.field_name, f] as const));
  const data = row.data ?? {};
  const resolve: ResolveCell = (name) => {
    if (name in data) return data[name];
    const f = resolveReference(name, fields);
    if (!f) return undefined;
    return data[f.field_name] ?? null;
  };
  const patch: Record<string, unknown> = {};
  for (const step of steps) {
    const field = byName.get(step.field);
    if (!field) return { ok: false, error: `The column "${step.field}" no longer exists.` };
    if (isComputedColumn(field)) return { ok: false, error: `"${field.display_name}" is calculated and cannot be set.` };
    if (step.set === "clear") {
      patch[field.field_name] = null;
    } else if (step.set === "value") {
      patch[field.field_name] = coerceForColumn(step.value, field.data_type);
    } else {
      const parsed = parseFormula(step.expression);
      if (!parsed.ok) return { ok: false, error: `"${field.display_name}": ${parsed.error}` };
      const result = evaluateFormula(parsed.ast, resolve);
      if (!result.ok) return { ok: false, error: `"${field.display_name}": ${result.error}` };
      patch[field.field_name] = coerceForColumn(result.value, field.data_type);
    }
  }
  return { ok: true, patch };
}

/** The value as the column stores it: "" is empty, numbers are numbers, a date stays ISO. */
export function coerceForColumn(value: unknown, dataType: string): unknown {
  if (value === "" || value === undefined || value === null) return null;
  switch (dataType) {
    case "number": {
      const n = typeof value === "number" ? value : Number(value);
      return Number.isFinite(n) ? n : null;
    }
    case "integer": {
      const n = typeof value === "number" ? value : Number(value);
      return Number.isFinite(n) ? Math.trunc(n) : null;
    }
    case "boolean":
      if (typeof value === "boolean") return value;
      if (typeof value === "string") return ["true", "yes", "1"].includes(value.trim().toLowerCase());
      return Boolean(value);
    case "date": {
      // A formula's DATEADD on a date-only cell returns date-only; anything
      // else with a time part is trimmed to the day.
      const s = String(value);
      return /^\d{4}-\d{2}-\d{2}T/.test(s) ? s.slice(0, 10) : s;
    }
    default:
      return value;
  }
}

/**
 * One `merge` op per row: only the columns the action names change, every
 * other cell is preserved. One list = one transaction. A row the action cannot
 * be compiled for is reported, and NOTHING is written — a button that changed
 * 39 of 40 rows and said nothing is worse than one that refused.
 */
export function buildRowActionOps(
  action: RowAction,
  rows: readonly { id: string; data: Record<string, unknown> }[],
  fields: readonly RowActionField[],
): { ok: true; ops: BulkOp[]; patches: Map<string, Record<string, unknown>> } | { ok: false; error: string; rowId: string } {
  const ops: BulkOp[] = [];
  const patches = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const compiled = compileRowAction(action, row, fields);
    if (!compiled.ok) return { ok: false, error: compiled.error, rowId: row.id };
    ops.push({ op: "merge", row_id: row.id, data: compiled.patch });
    patches.set(row.id, compiled.patch);
  }
  return { ok: true, ops, patches };
}

// ─── the "start from a row" shortcut (classes 1 and 2) ───────────────────────

/**
 * Value steps for every ordinary column, captured from one row — the template
 * row. The user then removes the columns to keep as they are. Computed columns
 * are never captured (they cannot be set).
 */
export function stepsFromRow(
  row: { data: Record<string, unknown> },
  fields: readonly RowActionField[],
): RowActionStep[] {
  return [...fields]
    .sort((a, b) => (a.field_order ?? 0) - (b.field_order ?? 0))
    .filter((f) => !isComputedColumn(f))
    .map((f) => {
      const v = row.data?.[f.field_name];
      return v === undefined || v === null || v === ""
        ? { field: f.field_name, set: "clear" as const }
        : { field: f.field_name, set: "value" as const, value: v };
    });
}

// ─── plain English ───────────────────────────────────────────────────────────

function shortValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "empty";
  if (typeof v === "string") return `"${v.length > 40 ? `${v.slice(0, 37)}…` : v}"`;
  if (typeof v === "object") return "structured data";
  return String(v);
}

/** "Sets Status to "AVAILABLE", clears Total and Fable, calculates Reset date" — the tooltip. */
export function describeRowAction(action: RowAction, fields: readonly RowActionField[]): string {
  if (action.kind === "agent") {
    const p = (action.prompt ?? "").trim();
    return p ? `Asks an agent: ${p.length > 90 ? `${p.slice(0, 87)}…` : p}` : "Asks an agent about this row.";
  }
  const name = (fieldName: string) => fields.find((f) => f.field_name === fieldName)?.display_name ?? fieldName;
  const sets = (action.steps ?? []).filter((s) => s.set === "value") as Extract<RowActionStep, { set: "value" }>[];
  const clears = (action.steps ?? []).filter((s) => s.set === "clear");
  const calcs = (action.steps ?? []).filter((s) => s.set === "formula");
  const parts: string[] = [];
  if (sets.length) parts.push(`sets ${sets.map((s) => `${name(s.field)} to ${shortValue(s.value)}`).join(", ")}`);
  if (clears.length) parts.push(`clears ${clears.map((s) => name(s.field)).join(", ")}`);
  if (calcs.length) parts.push(`calculates ${calcs.map((s) => name(s.field)).join(", ")}`);
  if (parts.length === 0) return "Changes nothing yet.";
  const sentence = parts.join("; ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + ".";
}

/**
 * The message an `agent` action sends: the prompt, then the row exactly as
 * stored, named by its label. The table itself reaches the agent through the
 * data-tables surface scope (columns, visible rows, write tools), so the
 * message only needs to say WHICH row and WHAT to do.
 */
export function agentActionMessage(args: {
  action: RowAction;
  tableName: string;
  rowLabel: string;
  row: { id: string; data: Record<string, unknown> };
  fields: readonly RowActionField[];
}): string {
  const lines = args.fields
    .slice()
    .sort((a, b) => (a.field_order ?? 0) - (b.field_order ?? 0))
    .map((f) => {
      const v = args.row.data?.[f.field_name];
      const shown = v === null || v === undefined || v === "" ? "(empty)" : typeof v === "object" ? JSON.stringify(v) : String(v);
      return `- ${f.display_name}: ${shown}`;
    });
  return [
    (args.action.prompt ?? "").trim(),
    "",
    `Row "${args.rowLabel || args.row.id}" (id ${args.row.id}) from the table "${args.tableName}":`,
    ...lines,
    "",
    "The table is open in front of me; use the data-table tools here to read more of it or to change cells of this row.",
  ].join("\n");
}
