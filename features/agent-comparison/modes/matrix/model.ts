/**
 * Matrix Battle — pure logic: cell resolution (mirrors the server, which is
 * authoritative), the setup's wire shape, reading cells from entry rows, paste
 * parsing, and the results math (totals, averages, used-tools split, break-even).
 */

import type { ComparisonEntryRow } from "../../types";
import type {
  MatrixAxis,
  MatrixCell,
  MatrixCellResult,
  MatrixCellStatus,
  MatrixPatch,
  MatrixSetup,
  MatrixVariant,
} from "./types";

export const MATRIX_LEASE_MS = 90_000;
export const MAX_REPEATS = 5;

export function newVariantId(): string {
  return crypto.randomUUID();
}

export function emptySetup(): MatrixSetup {
  return {
    schema_version: 1,
    base: {},
    rows: { label: "Prompts", variants: [] },
    columns: { label: "Arms", variants: [] },
    repeats: 1,
  };
}

// ---------------------------------------------------------------------------
// Resolution — cell = base ⊕ row.patch ⊕ column.patch
// ---------------------------------------------------------------------------

const SCALAR_KEYS = [
  "agent_id",
  "agent_version_id",
  "agent_version_number",
  "surface",
  "auto_tools",
  "model_id",
  "user_input",
] as const;

function has<K extends keyof MatrixPatch>(p: MatrixPatch, k: K): boolean {
  return Object.prototype.hasOwnProperty.call(p, k);
}

export function resolvePatch(...layers: MatrixPatch[]): MatrixPatch {
  const out: MatrixPatch = {};
  const add = new Set<string>();
  const remove = new Set<string>();
  let anyAdd = false;
  let anyRemove = false;
  for (const layer of layers) {
    for (const key of SCALAR_KEYS) {
      if (has(layer, key)) {
        (out as Record<string, unknown>)[key] = layer[key];
      }
    }
    if (layer.settings) out.settings = { ...(out.settings ?? {}), ...layer.settings };
    if (layer.variables) out.variables = { ...(out.variables ?? {}), ...layer.variables };
    if (layer.tools_add) {
      anyAdd = true;
      layer.tools_add.forEach((t) => add.add(t));
    }
    if (layer.tools_remove) {
      anyRemove = true;
      layer.tools_remove.forEach((t) => remove.add(t));
    }
  }
  if (anyAdd) out.tools_add = [...add].filter((t) => !remove.has(t));
  if (anyRemove) out.tools_remove = [...remove];
  return out;
}

export function resolveCellPatch(
  setup: MatrixSetup,
  rowId: string,
  columnId: string,
): MatrixPatch {
  const row = setup.rows.variants.find((v) => v.id === rowId);
  const col = setup.columns.variants.find((v) => v.id === columnId);
  return resolvePatch(setup.base, row?.patch ?? {}, col?.patch ?? {});
}

/** Every structural problem that stops a run, in words. Empty = runnable. */
export function setupProblems(setup: MatrixSetup): string[] {
  const problems: string[] = [];
  if (setup.rows.variants.length === 0) problems.push(`Add at least one ${setup.rows.label || "row"}.`);
  if (setup.columns.variants.length === 0)
    problems.push(`Add at least one ${setup.columns.label || "column"}.`);
  let missingAgent = 0;
  for (const r of setup.rows.variants) {
    for (const c of setup.columns.variants) {
      if (!resolveCellPatch(setup, r.id, c.id).agent_id) missingAgent += 1;
    }
  }
  if (missingAgent > 0) problems.push(`${missingAgent} cells have no agent. Pick one in Base.`);
  return problems;
}

/** The patch fields a variant overrides, as short words for its chips. */
export function patchFieldLabels(patch: MatrixPatch): string[] {
  const out: string[] = [];
  if (has(patch, "agent_id")) out.push("Agent");
  if (has(patch, "agent_version_id") && !has(patch, "agent_id")) out.push("Version");
  if (has(patch, "model_id")) out.push("Model");
  if (patch.settings) {
    for (const k of Object.keys(patch.settings)) out.push(SETTING_LABELS[k] ?? k);
  }
  if (has(patch, "user_input")) out.push("Message");
  if (patch.variables && Object.keys(patch.variables).length > 0) out.push("Variables");
  if (has(patch, "auto_tools")) out.push("Auto tools");
  if (patch.tools_add) out.push("Add tools");
  if (patch.tools_remove) out.push("Remove tools");
  if (has(patch, "surface")) out.push("Surface");
  return out;
}

export const SETTING_LABELS: Record<string, string> = {
  temperature: "Temperature",
  max_output_tokens: "Max output",
  reasoning_effort: "Reasoning",
};

// ---------------------------------------------------------------------------
// Wire shape (set metadata) — write and read
// ---------------------------------------------------------------------------

export function setupToMetadata(setup: MatrixSetup): Record<string, unknown> {
  return {
    mode: "matrix",
    matrix: {
      schema_version: 1,
      base: setup.base,
      rows: setup.rows,
      columns: setup.columns,
      repeats: clampRepeats(setup.repeats),
    },
  };
}

export function clampRepeats(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : 1;
  return Math.min(MAX_REPEATS, Math.max(1, v));
}

function readAxis(raw: unknown, fallbackLabel: string): MatrixAxis {
  const obj = (raw ?? {}) as { label?: unknown; variants?: unknown };
  const variants = Array.isArray(obj.variants) ? obj.variants : [];
  return {
    label: typeof obj.label === "string" ? obj.label : fallbackLabel,
    variants: variants
      .filter((v): v is Record<string, unknown> => !!v && typeof v === "object")
      .map((v) => ({
        id: typeof v.id === "string" ? v.id : newVariantId(),
        label: typeof v.label === "string" ? v.label : "",
        patch: (v.patch && typeof v.patch === "object" ? v.patch : {}) as MatrixPatch,
      })),
  };
}

/** Throws when the row is not a matrix battle. */
export function metadataToSetup(metadata: Record<string, unknown> | null): MatrixSetup {
  if (!metadata || metadata.mode !== "matrix") {
    throw new Error("This saved battle is not a matrix battle.");
  }
  const m = (metadata.matrix ?? {}) as Record<string, unknown>;
  return {
    schema_version: 1,
    base: (m.base && typeof m.base === "object" ? m.base : {}) as MatrixPatch,
    rows: readAxis(m.rows, "Prompts"),
    columns: readAxis(m.columns, "Arms"),
    repeats: clampRepeats(m.repeats),
  };
}

// ---------------------------------------------------------------------------
// Cells — read from entry rows (server-owned)
// ---------------------------------------------------------------------------

const STATUSES: MatrixCellStatus[] = ["queued", "running", "completed", "failed", "cancelled"];

export function entryToCell(row: ComparisonEntryRow, now: number): MatrixCell | null {
  const md = (row.metadata ?? {}) as Record<string, unknown>;
  if (md.kind !== "matrix_cell") return null;
  const status = STATUSES.includes(md.status as MatrixCellStatus)
    ? (md.status as MatrixCellStatus)
    : "queued";
  const heartbeat = typeof md.heartbeat_at === "string" ? Date.parse(md.heartbeat_at) : NaN;
  const started = typeof md.started_at === "string" ? Date.parse(md.started_at) : NaN;
  const lastSign = Number.isFinite(heartbeat) ? heartbeat : started;
  return {
    entryId: row.id,
    conversationId: row.conversation_id,
    rowId: String(md.row_id ?? ""),
    columnId: String(md.column_id ?? ""),
    repeat: typeof md.repeat === "number" ? md.repeat : 0,
    status,
    stalled:
      status === "running" && Number.isFinite(lastSign) && now - lastSign > MATRIX_LEASE_MS,
    attempt: typeof md.attempt === "number" ? md.attempt : 1,
    startedAt: typeof md.started_at === "string" ? md.started_at : null,
    finishedAt: typeof md.finished_at === "string" ? md.finished_at : null,
    error: typeof md.error === "string" ? md.error : null,
    request: (md.request && typeof md.request === "object" ? md.request : null) as MatrixPatch | null,
    result: (md.result && typeof md.result === "object" ? md.result : null) as MatrixCellResult | null,
  };
}

export function isLive(cell: MatrixCell): boolean {
  return (cell.status === "queued" || cell.status === "running") && !cell.stalled;
}

export function cellKey(rowId: string, columnId: string, repeat = 0): string {
  return `${rowId}|${columnId}|${repeat}`;
}

// ---------------------------------------------------------------------------
// Paste — one prompt per line, or blank-line separated blocks
// ---------------------------------------------------------------------------

export function parsePastedPrompts(text: string): string[] {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [];
  const blocks = normalized.split(/\n\s*\n/);
  const parts = blocks.length > 1 ? blocks : normalized.split("\n");
  return parts.map((p) => p.trim()).filter(Boolean);
}

export function promptLabel(text: string, index: number): string {
  const one = text.replace(/\s+/g, " ").trim();
  if (!one) return `#${index + 1}`;
  return one.length > 48 ? `${one.slice(0, 47)}…` : one;
}

export function variantsFromPrompts(prompts: string[], startIndex: number): MatrixVariant[] {
  return prompts.map((p, i) => ({
    id: newVariantId(),
    label: promptLabel(p, startIndex + i),
    patch: { user_input: p },
  }));
}

// ---------------------------------------------------------------------------
// Results math
// ---------------------------------------------------------------------------

/** A bundle lister (`bundle:list_<slug>`) only lists tools; calling it is not using one. */
export function isBundleLister(toolName: string): boolean {
  return /^bundle:list_/.test(toolName);
}

/** Tool calls that did real work (bundle listers excluded). */
export function realToolCalls(result: MatrixCellResult | null): number {
  if (!result) return 0;
  if (Array.isArray(result.tools_used)) {
    return result.tools_used
      .filter((t) => !isBundleLister(t.name))
      .reduce((s, t) => s + (t.count || 0), 0);
  }
  return 0;
}

export interface Metrics {
  n: number;
  input: number;
  output: number;
  total: number;
  cost: number;
  toolCalls: number;
}

export const ZERO_METRICS: Metrics = { n: 0, input: 0, output: 0, total: 0, cost: 0, toolCalls: 0 };

export function cellMetrics(cell: MatrixCell): Metrics | null {
  if (cell.status !== "completed" || !cell.result) return null;
  const r = cell.result;
  const input = r.input_tokens ?? 0;
  const output = r.output_tokens ?? 0;
  return {
    n: 1,
    input,
    output,
    total: r.total_tokens ?? input + output,
    cost: r.cost ?? 0,
    toolCalls: r.tool_calls ?? 0,
  };
}

export function sumMetrics(list: (Metrics | null)[]): Metrics {
  const out = { ...ZERO_METRICS };
  for (const m of list) {
    if (!m) continue;
    out.n += m.n;
    out.input += m.input;
    out.output += m.output;
    out.total += m.total;
    out.cost += m.cost;
    out.toolCalls += m.toolCalls;
  }
  return out;
}

export function avgMetrics(m: Metrics): Metrics | null {
  if (m.n === 0) return null;
  return {
    n: m.n,
    input: m.input / m.n,
    output: m.output / m.n,
    total: m.total / m.n,
    cost: m.cost / m.n,
    toolCalls: m.toolCalls / m.n,
  };
}

/**
 * A row "used tools" when any completed cell in it made a real tool call
 * (bundle listers excluded). Null while the row has no completed cell.
 */
export function rowUsedTools(cells: MatrixCell[]): boolean | null {
  const done = cells.filter((c) => c.status === "completed");
  if (done.length === 0) return null;
  return done.some((c) => realToolCalls(c.result) > 0);
}

/**
 * Break-even share of tool-using prompts between two columns A and B.
 *
 * With p = share of prompts that use tools, the expected per-prompt value of a
 * column is p·T + (1−p)·N (T = its average on tool rows, N = on no-tool rows).
 * A and B are equal at p* = (N_B − N_A) / ((T_A − N_A) − (T_B − N_B)).
 */
export type BreakEven =
  | { kind: "share"; p: number; cheaperBelow: "a" | "b" }
  | { kind: "always"; cheaper: "a" | "b" | "tie" }
  | { kind: "unknown" };

export function breakEven(
  a: { tools: number | null; none: number | null },
  b: { tools: number | null; none: number | null },
): BreakEven {
  if (a.tools == null || a.none == null || b.tools == null || b.none == null) {
    return { kind: "unknown" };
  }
  const at0 = a.none - b.none; // A − B when no prompt uses tools
  const at1 = a.tools - b.tools; // A − B when every prompt uses tools
  const eps = 1e-12;
  if (Math.abs(at0 - at1) < eps) {
    if (Math.abs(at0) < eps) return { kind: "always", cheaper: "tie" };
    return { kind: "always", cheaper: at0 < 0 ? "a" : "b" };
  }
  const p = at0 / (at0 - at1);
  if (p <= 0 || p >= 1) {
    // The sign of A − B does not change inside [0, 1]; mid-point decides.
    const mid = (at0 + at1) / 2;
    if (Math.abs(mid) < eps) return { kind: "always", cheaper: "tie" };
    return { kind: "always", cheaper: mid < 0 ? "a" : "b" };
  }
  return { kind: "share", p, cheaperBelow: at0 < 0 ? "a" : "b" };
}
