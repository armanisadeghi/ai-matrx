/**
 * Table style — colors on a user data table, the Airtable way.
 *
 * WHAT IS ALLOWED, AND WHY ONLY THIS. A typed dataset is not a canvas; the
 * platform already has Workbooks (Univer) for arbitrary per-cell formatting.
 * Here, color carries MEANING and stays out of the data:
 *
 *   1. COLOR BY A COLUMN — a choice column's option colors (or a boolean's
 *      true/false) tint the row or that column's cells. Zero configuration:
 *      the Status column already knows "Blocked" is red.
 *   2. RULES — "when Amount > 1000, tint the row amber". Evaluated live, so a
 *      tint is never stale.
 *   3. MANUAL HIGHLIGHTS — a small palette on a cell, a row, or a column, for
 *      the "look at this one" gesture. The same palette the choice chips use,
 *      so the table never has two vocabularies of color.
 *
 * WHERE IT LIVES. `udt_datasets.metadata.style` — ONE place per table, read
 * with the table's own metadata (no extra request), written surgically by
 * path through `udt_set_table_style` so two editors highlighting different
 * cells never overwrite each other. Copy, export, agents and the data itself
 * never see it.
 *
 * PRECEDENCE (most deliberate wins): a manual cell highlight > a cell rule >
 * color-by targeting cells > a manual column highlight, for the CELL; a manual
 * row highlight > a row rule > color-by targeting rows, for the ROW. A cell
 * tint always paints over the row tint underneath it.
 *
 * Pure module: no React, no DOM, no Supabase.
 */

import { CHOICE_COLOR_NAMES, type ChoiceColorName } from "@/lib/field-formats/choices";

export const TABLE_STYLE_VERSION = 1 as const;

/** The highlight palette — the choice-chip palette minus "neutral" (which is "no color"). */
export const STYLE_COLORS = CHOICE_COLOR_NAMES.filter(
  (c): c is Exclude<ChoiceColorName, "neutral"> => c !== "neutral",
);
export type StyleColor = (typeof STYLE_COLORS)[number];

export function isStyleColor(v: unknown): v is StyleColor {
  return typeof v === "string" && (STYLE_COLORS as readonly string[]).includes(v);
}

export const COLOR_RULE_OPS = [
  "is",
  "is_not",
  "contains",
  "is_empty",
  "not_empty",
  "is_true",
  "is_false",
  "gt",
  "gte",
  "lt",
  "lte",
] as const;
export type ColorRuleOp = (typeof COLOR_RULE_OPS)[number];

/** Which ops take a value to compare against. */
export const OPS_WITH_VALUE: readonly ColorRuleOp[] = [
  "is",
  "is_not",
  "contains",
  "gt",
  "gte",
  "lt",
  "lte",
];

export const COLOR_RULE_OP_LABELS: Record<ColorRuleOp, string> = {
  is: "is",
  is_not: "is not",
  contains: "contains",
  is_empty: "is empty",
  not_empty: "is not empty",
  is_true: "is checked",
  is_false: "is unchecked",
  gt: "is greater than",
  gte: "is at least",
  lt: "is less than",
  lte: "is at most",
};

export type StyleTarget = "row" | "cell";

export type ColorRule = {
  id: string;
  /** Machine field name the condition reads. */
  field: string;
  op: ColorRuleOp;
  /** Compared as text for `is` / `is_not` / `contains`, as a number for gt/lt. */
  value?: string;
  color: StyleColor;
  /** Tint the whole row, or only this column's cell. */
  target: StyleTarget;
};

export type ColorBy = { field: string; target: StyleTarget };

export type TableStyle = {
  version: typeof TABLE_STYLE_VERSION;
  colorBy?: ColorBy | null;
  rules?: ColorRule[];
  /** Manual row highlights, by row id. */
  rows?: Record<string, StyleColor>;
  /** Manual cell highlights, by row id then field name. */
  cells?: Record<string, Record<string, StyleColor>>;
  /** Manual column highlights, by field name. */
  columns?: Record<string, StyleColor>;
};

export const EMPTY_TABLE_STYLE: TableStyle = { version: TABLE_STYLE_VERSION };

/** The metadata key the style lives under on `udt_datasets.metadata`. */
export const TABLE_STYLE_METADATA_KEY = "style";

/** True when nothing in the style would paint anything. */
export function tableStyleIsEmpty(style: TableStyle): boolean {
  return (
    !style.colorBy &&
    (style.rules?.length ?? 0) === 0 &&
    Object.keys(style.rows ?? {}).length === 0 &&
    Object.keys(style.cells ?? {}).length === 0 &&
    Object.keys(style.columns ?? {}).length === 0
  );
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseColorMap(raw: unknown): Record<string, StyleColor> {
  const out: Record<string, StyleColor> = {};
  if (!isRecord(raw)) return out;
  for (const [k, v] of Object.entries(raw)) if (isStyleColor(v)) out[k] = v;
  return out;
}

function parseRule(raw: unknown): ColorRule | null {
  if (!isRecord(raw)) return null;
  const { id, field, op, value, color, target } = raw;
  if (typeof id !== "string" || typeof field !== "string") return null;
  if (typeof op !== "string" || !(COLOR_RULE_OPS as readonly string[]).includes(op)) return null;
  if (!isStyleColor(color)) return null;
  if (target !== "row" && target !== "cell") return null;
  return {
    id,
    field,
    op: op as ColorRuleOp,
    color,
    target,
    ...(typeof value === "string" || typeof value === "number"
      ? { value: String(value) }
      : {}),
  };
}

/**
 * Read a style off table metadata. Tolerant by design: an unknown key, a
 * retired color name or a malformed rule is dropped, never thrown, because a
 * table must still render when its style is stale.
 */
export function parseTableStyle(raw: unknown): TableStyle {
  if (!isRecord(raw)) return { ...EMPTY_TABLE_STYLE };
  const style: TableStyle = { version: TABLE_STYLE_VERSION };

  const colorBy = raw.colorBy;
  if (
    isRecord(colorBy) &&
    typeof colorBy.field === "string" &&
    (colorBy.target === "row" || colorBy.target === "cell")
  ) {
    style.colorBy = { field: colorBy.field, target: colorBy.target };
  }

  if (Array.isArray(raw.rules)) {
    const rules = raw.rules.map(parseRule).filter((r): r is ColorRule => r !== null);
    if (rules.length > 0) style.rules = rules;
  }

  const rows = parseColorMap(raw.rows);
  if (Object.keys(rows).length > 0) style.rows = rows;

  const columns = parseColorMap(raw.columns);
  if (Object.keys(columns).length > 0) style.columns = columns;

  if (isRecord(raw.cells)) {
    const cells: Record<string, Record<string, StyleColor>> = {};
    for (const [rowId, byField] of Object.entries(raw.cells)) {
      const parsed = parseColorMap(byField);
      if (Object.keys(parsed).length > 0) cells[rowId] = parsed;
    }
    if (Object.keys(cells).length > 0) style.cells = cells;
  }

  return style;
}

/** Style out of a `udt_datasets.metadata` blob (or null / undefined). */
export function tableStyleFromMetadata(metadata: unknown): TableStyle {
  return parseTableStyle(isRecord(metadata) ? metadata[TABLE_STYLE_METADATA_KEY] : null);
}

// ─── Evaluation ─────────────────────────────────────────────────────────────

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map((v) => String(v)).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** Does `value` satisfy `rule`? Text ops compare case-insensitively; number ops parse both sides. */
export function evaluateRule(rule: ColorRule, value: unknown): boolean {
  switch (rule.op) {
    case "is_empty":
      return isEmptyValue(value);
    case "not_empty":
      return !isEmptyValue(value);
    case "is_true":
      return value === true;
    case "is_false":
      return value === false;
    case "is": {
      const want = (rule.value ?? "").trim().toLowerCase();
      if (Array.isArray(value)) {
        return value.some((v) => cellText(v).trim().toLowerCase() === want);
      }
      return cellText(value).trim().toLowerCase() === want;
    }
    case "is_not": {
      const want = (rule.value ?? "").trim().toLowerCase();
      if (Array.isArray(value)) {
        return !value.some((v) => cellText(v).trim().toLowerCase() === want);
      }
      return cellText(value).trim().toLowerCase() !== want;
    }
    case "contains": {
      const want = (rule.value ?? "").trim().toLowerCase();
      if (!want) return false;
      return cellText(value).toLowerCase().includes(want);
    }
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const left = typeof value === "number" ? value : Number(cellText(value));
      const right = Number(rule.value);
      if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
      if (rule.op === "gt") return left > right;
      if (rule.op === "gte") return left >= right;
      if (rule.op === "lt") return left < right;
      return left <= right;
    }
  }
}

/**
 * The color a choice / boolean column gives a value, for color-by. The caller
 * supplies the lookup because option colors live on the resolved choice list
 * (which may come from a structured list), not on the style.
 */
export type ChoiceColorLookup = (
  fieldName: string,
  value: unknown,
) => StyleColor | undefined;

/**
 * The color an option paints with. An option that DECLARED a color uses it; an
 * option without one gets a stable color from its position in the list, so
 * "color rows by Status" always paints something — Airtable assigns every
 * option a color for the same reason. A column whose options were never
 * colored would otherwise look like color-by did nothing at all.
 */
export function colorForChoice(
  choices: readonly { value: string; color?: string }[] | undefined,
  value: unknown,
): StyleColor | undefined {
  if (!choices || choices.length === 0) return undefined;
  const wanted = String(value);
  const index = choices.findIndex((c) => c.value === wanted);
  if (index === -1) return undefined;
  const declared = choices[index].color;
  if (isStyleColor(declared)) return declared;
  return STYLE_COLORS[index % STYLE_COLORS.length];
}

/**
 * Boolean columns have no option list; color-by paints true green and leaves
 * false untinted, which is the "done / not done" reading every checklist has.
 */
export const BOOLEAN_TRUE_COLOR: StyleColor = "green";

function colorByFor(
  style: TableStyle,
  target: StyleTarget,
  data: Record<string, unknown>,
  choiceColorFor: ChoiceColorLookup,
): StyleColor | null {
  const cb = style.colorBy;
  if (!cb || cb.target !== target) return null;
  const value = data[cb.field];
  if (value === true) return BOOLEAN_TRUE_COLOR;
  if (value === false || isEmptyValue(value)) return null;
  // A multi-choice cell takes its FIRST option's color — one tint per cell.
  const first = Array.isArray(value) ? value[0] : value;
  return choiceColorFor(cb.field, first) ?? null;
}

function ruleColorFor(
  style: TableStyle,
  target: StyleTarget,
  data: Record<string, unknown>,
  fieldName?: string,
): StyleColor | null {
  for (const rule of style.rules ?? []) {
    if (rule.target !== target) continue;
    if (target === "cell" && rule.field !== fieldName) continue;
    if (evaluateRule(rule, data[rule.field])) return rule.color;
  }
  return null;
}

/** The tint for a whole row, or null for none. */
export function resolveRowColor(
  style: TableStyle,
  row: { id: string; data: Record<string, unknown> },
  choiceColorFor: ChoiceColorLookup,
): StyleColor | null {
  return (
    style.rows?.[row.id] ??
    ruleColorFor(style, "row", row.data) ??
    colorByFor(style, "row", row.data, choiceColorFor)
  );
}

/** The tint for one cell (painted over the row tint), or null for none. */
export function resolveCellColor(
  style: TableStyle,
  row: { id: string; data: Record<string, unknown> },
  fieldName: string,
  choiceColorFor: ChoiceColorLookup,
): StyleColor | null {
  const manual = style.cells?.[row.id]?.[fieldName];
  if (manual) return manual;
  const rule = ruleColorFor(style, "cell", row.data, fieldName);
  if (rule) return rule;
  if (style.colorBy?.target === "cell" && style.colorBy.field === fieldName) {
    const cb = colorByFor(style, "cell", row.data, choiceColorFor);
    if (cb) return cb;
  }
  return style.columns?.[fieldName] ?? null;
}

// ─── Classes ────────────────────────────────────────────────────────────────
//
// Tailwind needs literal class strings. Row tints are a whisper (they cover a
// lot of area); cell tints are a shade stronger so a highlighted cell reads
// against a highlighted row.

export const ROW_TINT_CLASS: Record<StyleColor, string> = {
  slate: "bg-slate-100/70 dark:bg-slate-800/40",
  green: "bg-green-50 dark:bg-green-950/40",
  amber: "bg-amber-50 dark:bg-amber-950/40",
  red: "bg-red-50 dark:bg-red-950/40",
  blue: "bg-blue-50 dark:bg-blue-950/40",
  violet: "bg-violet-50 dark:bg-violet-950/40",
  teal: "bg-teal-50 dark:bg-teal-950/40",
};

export const CELL_TINT_CLASS: Record<StyleColor, string> = {
  slate: "bg-slate-200/70 dark:bg-slate-700/50",
  green: "bg-green-100 dark:bg-green-900/50",
  amber: "bg-amber-100 dark:bg-amber-900/50",
  red: "bg-red-100 dark:bg-red-900/50",
  blue: "bg-blue-100 dark:bg-blue-900/50",
  violet: "bg-violet-100 dark:bg-violet-900/50",
  teal: "bg-teal-100 dark:bg-teal-900/50",
};

/** A solid swatch for palette menus. */
export const SWATCH_CLASS: Record<StyleColor, string> = {
  slate: "bg-slate-400",
  green: "bg-green-500",
  amber: "bg-amber-400",
  red: "bg-red-500",
  blue: "bg-blue-500",
  violet: "bg-violet-500",
  teal: "bg-teal-500",
};

export const STYLE_COLOR_LABELS: Record<StyleColor, string> = {
  slate: "Gray",
  green: "Green",
  amber: "Amber",
  red: "Red",
  blue: "Blue",
  violet: "Violet",
  teal: "Teal",
};

// ─── Write paths ────────────────────────────────────────────────────────────
//
// `udt_set_table_style(p_table_id, p_path, p_value)` sets ONE path under
// `metadata.style`; a null value deletes the key. These helpers name the paths
// so a caller can never mistype one.

export type StylePath = readonly string[];

export const stylePath = {
  colorBy: (): StylePath => ["colorBy"],
  rules: (): StylePath => ["rules"],
  row: (rowId: string): StylePath => ["rows", rowId],
  cell: (rowId: string, fieldName: string): StylePath => ["cells", rowId, fieldName],
  column: (fieldName: string): StylePath => ["columns", fieldName],
};

/** Apply a path write locally, so the grid repaints before the round trip returns. */
export function applyStylePath(
  style: TableStyle,
  path: StylePath,
  value: unknown,
): TableStyle {
  const next: TableStyle = { ...style };
  const [head, a, b] = path;
  switch (head) {
    case "colorBy":
      next.colorBy = value === null ? null : (parseTableStyle({ colorBy: value }).colorBy ?? null);
      break;
    case "rules":
      next.rules = value === null ? [] : (parseTableStyle({ rules: value }).rules ?? []);
      break;
    case "rows": {
      const rows = { ...(style.rows ?? {}) };
      if (a === undefined) break;
      if (isStyleColor(value)) rows[a] = value;
      else delete rows[a];
      next.rows = rows;
      break;
    }
    case "columns": {
      const columns = { ...(style.columns ?? {}) };
      if (a === undefined) break;
      if (isStyleColor(value)) columns[a] = value;
      else delete columns[a];
      next.columns = columns;
      break;
    }
    case "cells": {
      if (a === undefined || b === undefined) break;
      const cells = { ...(style.cells ?? {}) };
      const byField = { ...(cells[a] ?? {}) };
      if (isStyleColor(value)) byField[b] = value;
      else delete byField[b];
      if (Object.keys(byField).length === 0) delete cells[a];
      else cells[a] = byField;
      next.cells = cells;
      break;
    }
  }
  return next;
}
