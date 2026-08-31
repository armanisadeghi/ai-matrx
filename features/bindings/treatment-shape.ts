// features/bindings/treatment-shape.ts
//
// 🚨 THE ONE CLIENT CODEC for `mandate.treatment.config` — a job's PRESENTATION.
//
// THE-MODEL law 4 splits a job in two: CONSUMPTION (what feeds the holder —
// `mandate.binding.consumption_map`, written by `consumption-writer.ts`) and
// TREATMENT (how the job shows itself — widget, variable panel, reveal toggles,
// gate, menu placement, agent write access). This file is treatment's half.
//
// NOTHING HERE IS INVENTED. The shape is `schema_version: 1`, the exact object
// `mandate.shortcut_treatment_config(p_row)` writes and `mandate.vw_shortcut`
// reads back — the storage the 208 migrated shortcuts have been serving out of
// since the cutover (`lib/supabase/shortcutStorage.ts`,
// `SHORTCUT_WRITE_POLICIES_ON_TREATMENT`). A job authored in the one binding UI
// and a shortcut authored in the Gen-A editor land in the SAME columns with the
// SAME keys; `__tests__/treatment-shape.test.ts` pins every one of them against
// the view's own COALESCE defaults, so a drift here is a failing test, not a
// silent fork.
//
// The DB's `mandate.validate_treatment_config(tier, config)` is the authority on
// what is storable and rejects anything this codec could get wrong; the enums
// below are its list, not a second opinion.

import { isJsonObject, type JsonObject, type JsonValue } from "@/types/json";
import type { ResultDisplayMode } from "@/features/agents/utils/run-ui-utils";
import type { VariablesPanelStyle } from "@/features/agents/components/inputs/variable-input-variations/variable-input-options";
import type { WritePolicyMap } from "@/features/surfaces/types";

/** The tier every treatment in the platform carries today. */
export const TREATMENT_TIER_WIDGET = "widget";

/** The schema version this codec reads and writes. */
export const TREATMENT_SCHEMA_VERSION = 1;

/**
 * A job's presentation, in the shapes the editors already speak — so
 * `WidgetPicker`, `SettingsSection`, `AdvancedSection`, `CategoryPicker` and
 * `WritePolicyEditor` are consumed VERBATIM against it, with no adapter.
 */
export interface BindingPresentation {
  displayMode: ResultDisplayMode;
  allowChat: boolean;
  responseDensity: "comfortable" | "compact";

  showVariablePanel: boolean;
  variablesPanelStyle: VariablesPanelStyle;

  showDefinitionMessages: boolean;
  showDefinitionMessageContent: boolean;
  hideReasoning: boolean;
  hideToolResults: boolean;

  showPreExecutionGate: boolean;
  preExecutionMessage: string | null;
  bypassGateSeconds: number;

  defaultUserInput: string | null;
  defaultVariables: JsonValue | null;
  contextOverrides: JsonValue | null;
  llmOverrides: JsonValue | null;
  jsonExtraction: JsonValue | null;

  /** Menu placement — which category this job appears under, and where. */
  categoryId: string | null;
  sortOrder: number;
  enabledFeatures: string[];
  /** The surface whose write targets `WritePolicyEditor` governs, if any. */
  surfaceName: string | null;

  iconName: string | null;
  keyboardShortcut: string | null;

  writePolicies: WritePolicyMap;
}

/**
 * The presentation a job has when NO treatment row exists — every value the
 * view's own COALESCE would hand a reader. A job with no treatment and a job
 * with a default-valued treatment must be indistinguishable downstream, or
 * "save" would silently change behaviour by merely existing.
 */
export function defaultPresentation(): BindingPresentation {
  return {
    displayMode: "modal-full",
    allowChat: true,
    responseDensity: "comfortable",
    showVariablePanel: false,
    variablesPanelStyle: "inline",
    showDefinitionMessages: false,
    showDefinitionMessageContent: false,
    hideReasoning: false,
    hideToolResults: false,
    showPreExecutionGate: false,
    preExecutionMessage: null,
    bypassGateSeconds: 3,
    defaultUserInput: null,
    defaultVariables: null,
    contextOverrides: null,
    llmOverrides: null,
    jsonExtraction: null,
    categoryId: null,
    sortOrder: 0,
    enabledFeatures: ["general"],
    surfaceName: null,
    iconName: null,
    keyboardShortcut: null,
    writePolicies: {},
  };
}

// ── Reading ──────────────────────────────────────────────────────────────────

function obj(source: JsonObject, key: string): JsonObject {
  const value = source[key];
  return isJsonObject(value) ? value : {};
}

function str(source: JsonObject, key: string): string | null {
  const value = source[key];
  return typeof value === "string" && value !== "" ? value : null;
}

function bool(source: JsonObject, key: string, fallback: boolean): boolean {
  const value = source[key];
  return typeof value === "boolean" ? value : fallback;
}

function int(source: JsonObject, key: string, fallback: number): number {
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value)
    ? Math.trunc(value)
    : fallback;
}

function json(source: JsonObject, key: string): JsonValue | null {
  const value = source[key];
  return value === undefined || value === null ? null : value;
}

/** `mandate.treatment.config` → the editors' shapes. Absent = the default. */
export function parseTreatmentConfig(
  config: unknown | null | undefined,
): BindingPresentation {
  const base = defaultPresentation();
  if (!isJsonObject(config)) return base;

  const variables = obj(config, "variables");
  const reveal = obj(config, "reveal");
  const gate = obj(config, "gate");
  const seeds = obj(config, "seeds");
  const menu = obj(config, "menu");
  const rawFeatures = menu.enabled_features;
  const rawPolicies = config.write_policies;

  return {
    displayMode:
      (str(config, "display_mode") as ResultDisplayMode | null) ??
      base.displayMode,
    allowChat: bool(config, "allow_chat", base.allowChat),
    responseDensity:
      (str(config, "response_density") as "comfortable" | "compact" | null) ??
      base.responseDensity,

    showVariablePanel: bool(variables, "show_panel", base.showVariablePanel),
    variablesPanelStyle:
      (str(variables, "panel_style") as VariablesPanelStyle | null) ??
      base.variablesPanelStyle,

    showDefinitionMessages: bool(
      reveal,
      "show_definition_messages",
      base.showDefinitionMessages,
    ),
    showDefinitionMessageContent: bool(
      reveal,
      "show_definition_message_content",
      base.showDefinitionMessageContent,
    ),
    hideReasoning: bool(reveal, "hide_reasoning", base.hideReasoning),
    hideToolResults: bool(reveal, "hide_tool_results", base.hideToolResults),

    showPreExecutionGate: bool(gate, "enabled", base.showPreExecutionGate),
    preExecutionMessage: str(gate, "message"),
    bypassGateSeconds: int(gate, "bypass_seconds", base.bypassGateSeconds),

    defaultUserInput: str(seeds, "default_user_input"),
    defaultVariables: json(seeds, "default_variables"),
    contextOverrides: json(seeds, "context_overrides"),
    llmOverrides: json(seeds, "llm_overrides"),
    jsonExtraction: json(config, "json_extraction"),

    categoryId: str(menu, "category_id"),
    sortOrder: int(menu, "sort_order", base.sortOrder),
    enabledFeatures: Array.isArray(rawFeatures)
      ? rawFeatures.filter((f): f is string => typeof f === "string")
      : base.enabledFeatures,
    surfaceName: str(menu, "surface_name"),

    iconName: str(config, "icon_name"),
    keyboardShortcut: str(config, "keyboard_shortcut"),

    writePolicies: isJsonObject(rawPolicies)
      ? (rawPolicies as WritePolicyMap)
      : {},
  };
}

// ── Writing ──────────────────────────────────────────────────────────────────

/** Drop keys the SQL twin omits rather than storing an explicit null. */
function compact(entries: Record<string, JsonValue | null>): JsonObject {
  const out: JsonObject = {};
  for (const [key, value] of Object.entries(entries)) {
    if (value === null || value === undefined) continue;
    out[key] = value;
  }
  return out;
}

/**
 * The editors' shapes → `mandate.treatment.config`.
 *
 * Key-for-key the object `mandate.shortcut_treatment_config` builds, including
 * its omissions: an absent gate message, an absent seed and an EMPTY write-policy
 * map are all left OUT rather than written as null, so a job with no overrides
 * carries a config byte-identical to a migrated shortcut with none.
 */
export function buildTreatmentConfig(
  presentation: BindingPresentation,
): JsonObject {
  return {
    schema_version: TREATMENT_SCHEMA_VERSION,
    display_mode: presentation.displayMode,
    allow_chat: presentation.allowChat,
    // `auto_run` is a stored treatment key for shortcut parity, but on a JOB the
    // promise lives on `mandate.binding.auto_run`, where the bar narrates it,
    // the write refuses it and the resolver re-checks it. Writing a second copy
    // here would be a fact with two homes and one reader, so this codec pins it
    // to the view's own default and the AutoRunBar stays the only author.
    auto_run: true,
    response_density: presentation.responseDensity,
    variables: {
      show_panel: presentation.showVariablePanel,
      panel_style: presentation.variablesPanelStyle,
    },
    reveal: {
      show_definition_messages: presentation.showDefinitionMessages,
      show_definition_message_content: presentation.showDefinitionMessageContent,
      hide_reasoning: presentation.hideReasoning,
      hide_tool_results: presentation.hideToolResults,
    },
    gate: {
      enabled: presentation.showPreExecutionGate,
      bypass_seconds: presentation.bypassGateSeconds,
      ...compact({ message: presentation.preExecutionMessage }),
    },
    seeds: compact({
      default_user_input: presentation.defaultUserInput,
      default_variables: presentation.defaultVariables,
      context_overrides: presentation.contextOverrides,
      llm_overrides: presentation.llmOverrides,
    }),
    menu: {
      sort_order: presentation.sortOrder,
      enabled_features: presentation.enabledFeatures,
      ...compact({
        category_id: presentation.categoryId,
        surface_name: presentation.surfaceName,
      }),
    },
    ...compact({
      icon_name: presentation.iconName,
      keyboard_shortcut: presentation.keyboardShortcut,
      json_extraction: presentation.jsonExtraction,
    }),
    ...(Object.keys(presentation.writePolicies).length > 0
      ? { write_policies: presentation.writePolicies as unknown as JsonValue }
      : {}),
  };
}

/**
 * Whether a presentation says anything at all. A job whose drawer was opened
 * and closed without a change must not acquire a stored row — an empty answer
 * is not an answer, and a row that exists is a row someone has to explain.
 */
export function presentationIsDefault(
  presentation: BindingPresentation,
): boolean {
  return (
    JSON.stringify(buildTreatmentConfig(presentation)) ===
    JSON.stringify(buildTreatmentConfig(defaultPresentation()))
  );
}
