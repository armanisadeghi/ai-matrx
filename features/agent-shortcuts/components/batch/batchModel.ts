/**
 * Batch shortcut model — the brain behind `/agents/[id]/shortcuts/batch`.
 *
 * One combined flow handles both ADD (new shortcut on a surface) and UPDATE
 * (an existing shortcut). Every row carries a `kind`. A three-level cascade is
 * rendered as a spreadsheet:
 *
 *   Template value  →  Batch "set for all"  →  Per-row override
 *
 * A *field* (any column of `agx_shortcut`) and each *binding target* (an agent
 * variable / context slot) is independently in one of three modes:
 *   - "inherit" : ADD → copy from template (or standard defaults).
 *                 UPDATE → leave the existing value untouched.
 *   - "all"     : one value applied to every row. Not a grid column.
 *   - "row"     : becomes a grid column; each row may differ, defaulting to the
 *                 inherited value.
 *
 * Binding targets default to "row" — that's the whole point of the tool.
 * Nothing is ever locked; every field can be flipped to per-row.
 */

import type {
  AgentShortcut,
  ShortcutFormData,
} from "@/features/agent-shortcuts/types";
import type { AgentDefinition } from "@/features/agents/types/agent-definition.types";
import type { BindingTarget } from "@/features/surfaces/admin/columns/SurfaceVariableBinding";
import type { ValueMapping, ValueMappingMap } from "@/features/surfaces/types";
import {
  RESULT_DISPLAY_META,
  type ResultDisplayMode,
} from "@/features/agents/utils/run-ui-utils";
import {
  VARIABLE_PANEL_STYLE_OPTIONS,
  type VariablesPanelStyle,
} from "@/features/agents/components/inputs/variable-input-variations/variable-input-options";

// ─────────────────────────────────────────────────────────────────────────────
// Field config
// ─────────────────────────────────────────────────────────────────────────────

export type FieldMode = "inherit" | "all" | "row";

/** Scalar (non-binding) columns of the shortcut that the batch UI can drive. */
export type BatchScalarFieldKey =
  | "categoryId"
  | "label"
  | "description"
  | "iconName"
  | "keyboardShortcut"
  | "sortOrder"
  | "useLatest"
  | "displayMode"
  | "showVariablePanel"
  | "variablesPanelStyle"
  | "autoRun"
  | "allowChat"
  | "showDefinitionMessages"
  | "showDefinitionMessageContent"
  | "hideReasoning"
  | "hideToolResults"
  | "responseDensity"
  | "showPreExecutionGate"
  | "preExecutionMessage"
  | "bypassGateSeconds"
  | "defaultUserInput"
  | "isActive"
  | "contextMappings"
  | "contextOverrides"
  | "defaultVariables"
  | "llmOverrides";

export type FieldGroup =
  | "Identity"
  | "Display"
  | "Behavior"
  | "Content"
  | "Advanced";

export type FieldControl =
  | { kind: "select"; options: ReadonlyArray<{ value: string; label: string }> }
  | { kind: "dynamic-select"; source: "category" }
  | { kind: "boolean" }
  | { kind: "text"; multiline?: boolean; placeholder?: string }
  | { kind: "number"; min?: number; max?: number }
  | { kind: "json" };

export interface BatchFieldDef {
  key: BatchScalarFieldKey;
  label: string;
  group: FieldGroup;
  control: FieldControl;
  hint?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Option lists
// ─────────────────────────────────────────────────────────────────────────────

export const DISPLAY_MODE_OPTIONS: ReadonlyArray<{
  value: ResultDisplayMode;
  label: string;
}> = (Object.keys(RESULT_DISPLAY_META) as ResultDisplayMode[]).map((m) => ({
  value: m,
  label: RESULT_DISPLAY_META[m].label,
}));

export const PANEL_STYLE_OPTIONS: ReadonlyArray<{
  value: VariablesPanelStyle;
  label: string;
}> = VARIABLE_PANEL_STYLE_OPTIONS.map((o) => ({
  value: o.value,
  label: o.label,
}));

export const DENSITY_OPTIONS = [
  { value: "comfortable", label: "Comfortable" },
  { value: "compact", label: "Compact" },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Field catalog — data-driven so any column is reachable
// ─────────────────────────────────────────────────────────────────────────────

export const BATCH_FIELDS: readonly BatchFieldDef[] = [
  // Identity
  {
    key: "categoryId",
    label: "Category",
    group: "Identity",
    control: { kind: "dynamic-select", source: "category" },
    hint: "Required. Where the shortcut is grouped in menus.",
  },
  {
    key: "label",
    label: "Label",
    group: "Identity",
    control: { kind: "text", placeholder: "Shown in menus" },
  },
  {
    key: "description",
    label: "Description",
    group: "Identity",
    control: { kind: "text", multiline: true },
  },
  {
    key: "iconName",
    label: "Icon",
    group: "Identity",
    control: { kind: "text", placeholder: "Lucide icon name" },
  },
  {
    key: "keyboardShortcut",
    label: "Hotkey",
    group: "Identity",
    control: { kind: "text", placeholder: "e.g. mod+shift+k" },
  },
  {
    key: "sortOrder",
    label: "Sort order",
    group: "Identity",
    control: { kind: "number", min: 0 },
  },
  {
    key: "isActive",
    label: "Active",
    group: "Identity",
    control: { kind: "boolean" },
  },
  {
    key: "useLatest",
    label: "Follow latest version",
    group: "Identity",
    control: { kind: "boolean" },
    hint: "Off = pinned to the template's version (safer).",
  },
  // Display
  {
    key: "displayMode",
    label: "Display mode",
    group: "Display",
    control: { kind: "select", options: DISPLAY_MODE_OPTIONS },
  },
  {
    key: "responseDensity",
    label: "Response density",
    group: "Display",
    control: { kind: "select", options: DENSITY_OPTIONS },
  },
  {
    key: "showVariablePanel",
    label: "Show variable panel",
    group: "Display",
    control: { kind: "boolean" },
  },
  {
    key: "variablesPanelStyle",
    label: "Variable panel style",
    group: "Display",
    control: { kind: "select", options: PANEL_STYLE_OPTIONS },
  },
  {
    key: "hideReasoning",
    label: "Hide reasoning",
    group: "Display",
    control: { kind: "boolean" },
  },
  {
    key: "hideToolResults",
    label: "Hide tool results",
    group: "Display",
    control: { kind: "boolean" },
  },
  {
    key: "showDefinitionMessages",
    label: "Show definition messages",
    group: "Display",
    control: { kind: "boolean" },
  },
  {
    key: "showDefinitionMessageContent",
    label: "Show definition message content",
    group: "Display",
    control: { kind: "boolean" },
  },
  // Behavior
  {
    key: "autoRun",
    label: "Auto-run",
    group: "Behavior",
    control: { kind: "boolean" },
  },
  {
    key: "allowChat",
    label: "Allow chat",
    group: "Behavior",
    control: { kind: "boolean" },
  },
  {
    key: "showPreExecutionGate",
    label: "Pre-execution gate",
    group: "Behavior",
    control: { kind: "boolean" },
  },
  {
    key: "bypassGateSeconds",
    label: "Gate bypass (sec)",
    group: "Behavior",
    control: { kind: "number", min: 0 },
  },
  // Content
  {
    key: "preExecutionMessage",
    label: "Pre-execution message",
    group: "Content",
    control: { kind: "text", multiline: true },
  },
  {
    key: "defaultUserInput",
    label: "Default user input",
    group: "Content",
    control: { kind: "text", multiline: true },
  },
  // Advanced (JSON blobs — reachable but rarely batched)
  {
    key: "contextMappings",
    label: "Context mappings",
    group: "Advanced",
    control: { kind: "json" },
  },
  {
    key: "contextOverrides",
    label: "Context overrides",
    group: "Advanced",
    control: { kind: "json" },
  },
  {
    key: "defaultVariables",
    label: "Default variables",
    group: "Advanced",
    control: { kind: "json" },
  },
  {
    key: "llmOverrides",
    label: "LLM overrides",
    group: "Advanced",
    control: { kind: "json" },
  },
];

export const FIELD_GROUP_ORDER: readonly FieldGroup[] = [
  "Identity",
  "Display",
  "Behavior",
  "Content",
  "Advanced",
];

const FIELD_BY_KEY = new Map<BatchScalarFieldKey, BatchFieldDef>(
  BATCH_FIELDS.map((f) => [f.key, f]),
);

export function getFieldDef(key: BatchScalarFieldKey): BatchFieldDef {
  const def = FIELD_BY_KEY.get(key);
  if (!def) throw new Error(`Unknown batch field: ${key}`);
  return def;
}

// ─────────────────────────────────────────────────────────────────────────────
// Standard defaults (used when no template is chosen)
// ─────────────────────────────────────────────────────────────────────────────

export const STANDARD_DEFAULTS: Record<BatchScalarFieldKey, unknown> = {
  categoryId: "",
  label: "",
  description: null,
  iconName: null,
  keyboardShortcut: null,
  sortOrder: 0,
  useLatest: false,
  displayMode: "modal-full",
  showVariablePanel: true,
  variablesPanelStyle: "inline",
  autoRun: false,
  allowChat: true,
  showDefinitionMessages: false,
  showDefinitionMessageContent: false,
  hideReasoning: false,
  hideToolResults: false,
  responseDensity: "comfortable",
  showPreExecutionGate: false,
  preExecutionMessage: null,
  bypassGateSeconds: 3,
  defaultUserInput: null,
  isActive: true,
  contextMappings: null,
  contextOverrides: null,
  defaultVariables: null,
  llmOverrides: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// Editor state shapes
// ─────────────────────────────────────────────────────────────────────────────

export interface ScalarFieldState {
  mode: FieldMode;
  /** Value used when mode === "all". */
  allValue: unknown;
}

export type FieldStateMap = Partial<
  Record<BatchScalarFieldKey, ScalarFieldState>
>;

export interface BindingFieldState {
  mode: FieldMode;
  /** Mapping used when mode === "all". */
  allValue: ValueMapping;
}

/** Keyed by agent variable / context-slot name. */
export type BindingStateMap = Record<string, BindingFieldState>;

export type RowKind = "create" | "update";

export interface BatchRow {
  /** Stable react key: `create:<surfaceName>` or `update:<shortcutId>`. */
  key: string;
  kind: RowKind;
  surfaceName: string;
  /** Present only when kind === "update". */
  shortcutId?: string;
  /** Display label of the existing shortcut (update rows). */
  existingLabel?: string;
  /** The existing shortcut (update rows) — used so per-row cells default to its
   *  current value instead of the template's. */
  existing?: AgentShortcut;
  /** Per-row scalar overrides (consulted for fields whose mode === "row"). */
  overrides: Partial<Record<BatchScalarFieldKey, unknown>>;
  /** Per-row value mappings (agent variable/slot name → ValueMapping). */
  valueMappings: ValueMappingMap;
}

export interface BatchContext {
  agent: AgentDefinition;
  template: AgentShortcut | null;
  fieldStates: FieldStateMap;
  bindingStates: BindingStateMap;
}

// ─────────────────────────────────────────────────────────────────────────────
// Binding targets (constant across the whole batch — they come from the agent)
// ─────────────────────────────────────────────────────────────────────────────

export function buildBindingTargets(agent: AgentDefinition): BindingTarget[] {
  const out: BindingTarget[] = [];
  const seen = new Set<string>();
  for (const v of agent.variableDefinitions ?? []) {
    if (seen.has(v.name)) continue;
    seen.add(v.name);
    out.push({
      name: v.name,
      description: v.helpText,
      required: v.required ?? false,
    });
  }
  for (const slot of agent.contextSlots ?? []) {
    if (seen.has(slot.key)) continue;
    seen.add(slot.key);
    out.push({
      name: slot.key,
      label: slot.label,
      description: slot.description ?? undefined,
    });
  }
  return out;
}

/** Initial per-target binding state — defaults every target to per-row. */
export function defaultBindingStates(
  targets: readonly BindingTarget[],
  template: AgentShortcut | null,
): BindingStateMap {
  const out: BindingStateMap = {};
  for (const t of targets) {
    const fromTemplate = template?.valueMappings?.[t.name];
    out[t.name] = {
      mode: "row",
      allValue: fromTemplate
        ? ({ ...fromTemplate } as ValueMapping)
        : { mapType: "unmapped" },
    };
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapping seeding / cloning
// ─────────────────────────────────────────────────────────────────────────────

export function cloneMappings(map: ValueMappingMap | null): ValueMappingMap {
  const out: ValueMappingMap = {};
  if (!map) return out;
  for (const [k, v] of Object.entries(map)) out[k] = { ...v } as ValueMapping;
  return out;
}

/**
 * Seed a NEW (add) row's per-row mappings from the template — a full inherit.
 *
 * Every mapping (including `surface_value`) copies verbatim, target and all.
 * The template's surface_value target is very often a universally-available
 * value name (`content`, `selection`, …) that the new surface also declares, so
 * inheriting it is right far more often than blanking it. The grid cell then
 * validates each inherited target against the row's actual surface values and
 * only clears / re-matches the ones that genuinely don't exist there (see
 * `BatchBindingCell`). This is the "inherit, then only change on mismatch"
 * contract.
 */
export function seedCreateMappings(
  templateMappings: ValueMappingMap | null,
): ValueMappingMap {
  return cloneMappings(templateMappings);
}

// ─────────────────────────────────────────────────────────────────────────────
// Cascade resolution — scalars
// ─────────────────────────────────────────────────────────────────────────────

export function inheritedScalarValue(
  ctx: BatchContext,
  key: BatchScalarFieldKey,
): unknown {
  if (ctx.template && key in ctx.template) {
    return (ctx.template as unknown as Record<string, unknown>)[key];
  }
  return STANDARD_DEFAULTS[key];
}

/**
 * The value a per-row cell defaults to before any edit:
 *   ADD    → the template / standard default.
 *   UPDATE → the existing shortcut's current value (so the user edits from
 *            what's already there instead of from scratch).
 */
export function rowInheritedScalar(
  ctx: BatchContext,
  row: BatchRow,
  key: BatchScalarFieldKey,
): unknown {
  if (row.kind === "update" && row.existing && key in row.existing) {
    return (row.existing as unknown as Record<string, unknown>)[key];
  }
  return inheritedScalarValue(ctx, key);
}

/** Resolve a single scalar field for a given row through the cascade. */
export function resolveScalar(
  ctx: BatchContext,
  row: BatchRow,
  key: BatchScalarFieldKey,
): unknown {
  const fs = ctx.fieldStates[key];
  if (!fs || fs.mode === "inherit") return rowInheritedScalar(ctx, row, key);
  if (fs.mode === "all") return fs.allValue;
  const override = row.overrides[key];
  return override !== undefined ? override : rowInheritedScalar(ctx, row, key);
}

export function fieldIsTouched(
  ctx: BatchContext,
  key: BatchScalarFieldKey,
): boolean {
  const fs = ctx.fieldStates[key];
  return !!fs && fs.mode !== "inherit";
}

export function perRowFields(ctx: BatchContext): BatchScalarFieldKey[] {
  return BATCH_FIELDS.filter((f) => ctx.fieldStates[f.key]?.mode === "row").map(
    (f) => f.key,
  );
}

export function perRowBindingTargets(
  ctx: BatchContext,
  targets: readonly BindingTarget[],
): BindingTarget[] {
  return targets.filter(
    (t) => (ctx.bindingStates[t.name]?.mode ?? "row") === "row",
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cascade resolution — bindings
// ─────────────────────────────────────────────────────────────────────────────

/** Inherited mapping for a target (ADD → template; UPDATE → existing on the row). */
export function inheritedMapping(
  ctx: BatchContext,
  row: BatchRow,
  targetName: string,
): ValueMapping | undefined {
  return row.kind === "create"
    ? ctx.template?.valueMappings?.[targetName]
    : row.valueMappings[targetName];
}

export function resolveMapping(
  ctx: BatchContext,
  row: BatchRow,
  targetName: string,
): ValueMapping | undefined {
  const st = ctx.bindingStates[targetName];
  const mode = st?.mode ?? "row";
  if (mode === "all") return st?.allValue;
  if (mode === "row") return row.valueMappings[targetName];
  return inheritedMapping(ctx, row, targetName);
}

export function assembleValueMappings(
  ctx: BatchContext,
  row: BatchRow,
  targets: readonly BindingTarget[],
): ValueMappingMap {
  const out: ValueMappingMap = {};
  for (const t of targets) {
    const m = resolveMapping(ctx, row, t.name);
    if (m) out[t.name] = m;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Build write payloads
// ─────────────────────────────────────────────────────────────────────────────

function resolveVersionFields(
  ctx: BatchContext,
  row: BatchRow,
): {
  useLatest: boolean;
  agentVersionId: string | null;
  resolvedId: string | null;
  isVersion: boolean;
} {
  const useLatest = resolveScalar(ctx, row, "useLatest") === true;
  const pinnedVersionId = ctx.template?.agentVersionId ?? null;
  return {
    useLatest,
    agentVersionId: pinnedVersionId,
    resolvedId: useLatest ? ctx.agent.id : (pinnedVersionId ?? ctx.agent.id),
    isVersion: !useLatest && pinnedVersionId != null,
  };
}

/** Full create payload for one ADD row. */
export function buildCreateFormData(
  ctx: BatchContext,
  row: BatchRow,
  targets: readonly BindingTarget[],
): ShortcutFormData {
  const v = (k: BatchScalarFieldKey) => resolveScalar(ctx, row, k);
  const version = resolveVersionFields(ctx, row);

  return {
    categoryId: String(v("categoryId") ?? ""),
    label: String(v("label") ?? ctx.agent.name ?? ""),
    description: (v("description") as string | null) ?? null,
    iconName: (v("iconName") as string | null) ?? null,
    keyboardShortcut: (v("keyboardShortcut") as string | null) ?? null,
    sortOrder: Number(v("sortOrder") ?? 0),

    agentId: ctx.agent.id,
    agentVersionId: version.agentVersionId,
    useLatest: version.useLatest,
    resolvedId: version.resolvedId,
    isVersion: version.isVersion,

    agentName: ctx.agent.name,
    variableDefinitions: ctx.agent.variableDefinitions ?? [],
    contextSlots: ctx.agent.contextSlots ?? [],

    enabledFeatures: ctx.template?.enabledFeatures ?? [],
    surfaceName: row.surfaceName,
    scopeMappings: null,
    valueMappings: assembleValueMappings(ctx, row, targets),
    contextMappings:
      (v("contextMappings") as Record<string, string> | null) ?? null,

    displayMode: v("displayMode") as ResultDisplayMode,
    showVariablePanel: v("showVariablePanel") === true,
    variablesPanelStyle: v("variablesPanelStyle") as VariablesPanelStyle,
    autoRun: v("autoRun") === true,
    allowChat: v("allowChat") === true,
    showDefinitionMessages: v("showDefinitionMessages") === true,
    showDefinitionMessageContent: v("showDefinitionMessageContent") === true,
    hideReasoning: v("hideReasoning") === true,
    hideToolResults: v("hideToolResults") === true,
    responseDensity:
      (v("responseDensity") as "comfortable" | "compact") ?? "comfortable",
    showPreExecutionGate: v("showPreExecutionGate") === true,
    preExecutionMessage: (v("preExecutionMessage") as string | null) ?? null,
    bypassGateSeconds: Number(v("bypassGateSeconds") ?? 3),
    defaultUserInput: (v("defaultUserInput") as string | null) ?? null,
    defaultVariables:
      (v("defaultVariables") as Record<string, unknown> | null) ?? null,
    contextOverrides:
      (v("contextOverrides") as Record<string, unknown> | null) ?? null,
    llmOverrides: (v("llmOverrides") as AgentShortcut["llmOverrides"]) ?? null,
    jsonExtraction: ctx.template?.jsonExtraction ?? null,

    isActive: v("isActive") !== false,

    userId: null,
    organizationId: null,
    projectId: null,
    taskId: null,
  };
}

/** Partial patch for one UPDATE row — only the columns the user actually touched. */
export function buildUpdatePatch(
  ctx: BatchContext,
  row: BatchRow,
  targets: readonly BindingTarget[],
): Partial<AgentShortcut> {
  const patch: Partial<AgentShortcut> = {};
  for (const f of BATCH_FIELDS) {
    if (!fieldIsTouched(ctx, f.key)) continue;
    (patch as Record<string, unknown>)[f.key] = resolveScalar(ctx, row, f.key);
  }
  if (fieldIsTouched(ctx, "useLatest")) {
    const version = resolveVersionFields(ctx, row);
    patch.agentVersionId = version.agentVersionId;
    patch.resolvedId = version.resolvedId;
    patch.isVersion = version.isVersion;
  }
  const anyBindingTouched = targets.some(
    (t) => (ctx.bindingStates[t.name]?.mode ?? "row") !== "inherit",
  );
  if (anyBindingTouched) {
    patch.valueMappings = assembleValueMappings(ctx, row, targets);
  }
  return patch;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-row attention (the worklist)
// ─────────────────────────────────────────────────────────────────────────────

export interface RowAttention {
  /** surface_value bindings still missing a target. */
  unmapped: number;
  /** Of the unmapped, how many are on required targets. */
  requiredUnmapped: number;
}

export function rowAttention(
  ctx: BatchContext,
  row: BatchRow,
  targets: readonly BindingTarget[],
): RowAttention {
  const assembled = assembleValueMappings(ctx, row, targets);
  let unmapped = 0;
  let requiredUnmapped = 0;
  for (const t of targets) {
    const m = assembled[t.name];
    if (m && m.mapType === "surface_value" && !m.target) {
      unmapped += 1;
      if (t.required) requiredUnmapped += 1;
    }
  }
  return { unmapped, requiredUnmapped };
}
