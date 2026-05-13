/**
 * Agent Execution Config — the single canonical customization bundle.
 *
 * Every surface that customizes an agent produces this same shape:
 *   - shortcuts (agx_shortcut row, persisted)
 *   - agent apps (agent_apps row, persisted)
 *   - widget tester / creator run panel (in-memory)
 *   - inline caller-supplied (launchAgent({ config: {...} }))
 *
 * The launchAgentExecution thunk merges:
 *   defaults → shortcut.config → agent_app.config → caller.config
 * and hands the resolved bundle to the execution pipeline.
 *
 * NOTHING in this type is runtime state. Runtime values (userInput,
 * applicationScope, widgetHandleId, originalText) live on
 * AgentExecutionRuntime, not here. Derived UI flags (showVariables,
 * etc.) live in instance-ui-state and are computed from this + the
 * current execution stage.
 */

import type { LLMParams } from "./agent-api-types";
import type { ResultDisplayMode } from "@/features/agents/utils/run-ui-utils";
import type { VariablesPanelStyle } from "../components/inputs/variable-input-variations/variable-input-options";
import type { ApplicationScope } from "./scope.types";
import type { JsonExtractionConfig } from "./instance.types";

/**
 * ============================================================================
 * CATEGORY HELPERS — documentation-only groupings
 * ============================================================================
 * AgentExecutionConfig is deliberately flat for ergonomics (easy merging,
 * easy form binding, easy DB column mapping). These three sub-interfaces
 * exist only to document the semantic categories of the flat shape and to
 * give form/selector code a type-safe way to pick a subset of fields.
 * They are composed into AgentExecutionConfig below.
 */

/** How the agent APPEARS and WHAT THE USER CAN DO with it. */
export interface AgentPresentationConfig {
  /** How the launched agent is presented. Default: "modal-full". */
  displayMode: ResultDisplayMode;

  /** When true, show the variable panel so the user can edit resolved variable values. */
  showVariablePanel: boolean;
  /** UI style for the variable panel. App validates values; unknowns fall back to "inline". */
  variablesPanelStyle: VariablesPanelStyle;

  /** When true, execute automatically (once the pre-gate resolves if any). */
  autoRun: boolean;
  /** When false, the run is single-shot — no follow-up chat. */
  allowChat: boolean;

  /** Reveal agent-definition messages to the user. Secret-sensitive. */
  showDefinitionMessages: boolean;
  /** When showDefinitionMessages is true, whether to also reveal interpolated content. */
  showDefinitionMessageContent: boolean;
  /** Hide reasoning/thinking blocks from output. */
  hideReasoning: boolean;
  /** Hide tool-call result blocks from output. */
  hideToolResults: boolean;
  /**
   * Density of the assistant transcript chrome (tool call cards, thinking
   * blocks, action bar).
   *   - "comfortable" (default): full chrome, persistent action bar.
   *   - "compact": one-line tool/thinking strips, hover-revealed controls,
   *     action bar appears only on hover unless this message is the latest.
   *
   * Designed for highly agentic / coding-style runs where many tool calls
   * + reasoning blocks would otherwise drown the actual model output. Per
   * conversation so a single surface (e.g. the code-editor agent runner)
   * can opt in without affecting other chat surfaces.
   *
   * NOT to be confused with the input-layer `compact: boolean` prop or
   * the `"modal-compact"` ResultDisplayMode — those operate at unrelated
   * scopes (input rendering and modal sizing respectively).
   */
  responseDensity: "comfortable" | "compact";

  /** Show a pre-execution input gate before autoRun fires. */
  showPreExecutionGate: boolean;
  /** Custom message rendered inside the gate. */
  preExecutionMessage: string | null;
  /** Seconds before the gate auto-executes. 0 = wait for user indefinitely. */
  bypassGateSeconds: number;
}

/** How the agent BINDS to the surrounding UI (scope/context key routing). */
export interface AgentEnvironmentBindings {
  /**
   * Map from UI-scope keys to agent variable names.
   * Example: `{ selection: "highlighted_code", content: "file_contents" }`
   */
  scopeMappings: Record<string, string> | null;
  /**
   * Map from UI-scope keys to agent context-slot keys.
   * Parity with scopeMappings but for context slots. Takes precedence over
   * contextOverrides and over ad-hoc context entries.
   * Example: `{ file_path: "target_file", task_id: "current_task" }`
   */
  contextMappings: Record<string, string> | null;
}

/** Direct VALUE INJECTION regardless of UI context. */
export interface AgentValueDefaults {
  /**
   * Designer-provided extra instructions appended to the user template.
   * NOT user-editable. NOT visible. The user never sees this text.
   */
  defaultUserInput: string | null;
  /**
   * Override the agent's variable defaultValues for this shortcut/app.
   * Keyed by variable NAME. scopeMappings + user edits still override.
   */
  defaultVariables: Record<string, unknown> | null;
  /**
   * Add and/or seed context slots on launch.
   * Keyed by context-slot KEY. Can introduce brand-new slots not declared
   * on the agent, or override defaults for declared slots.
   */
  contextOverrides: Record<string, unknown> | null;
  /**
   * Partial LLMParams delta applied on top of the agent's base settings.
   * Only the keys provided are sent (temperature, model_id, max_output_tokens, …).
   */
  llmOverrides: Partial<LLMParams> | null;
}

/**
 * How the agent's stream is processed for structured output.
 *
 * Direct-mode UIs (and any caller that consumes parsed JSON via
 * `selectFirstExtractedObject` / `selectJsonExtractionComplete`) need this
 * set. When `enabled: true` the request's StreamingJsonTracker is wired up
 * and parsed objects land in active_requests as the model emits them.
 *
 * NULL = no extraction (text-only flow). Default for shortcuts that emit
 * normal AI text into the system overlays.
 */
export interface AgentOutputProcessing {
  jsonExtraction: JsonExtractionConfig | null;
}

export interface AgentExecutionConfig
  extends
    AgentPresentationConfig,
    AgentEnvironmentBindings,
    AgentValueDefaults,
    AgentOutputProcessing {}

/**
 * Runtime — per-invocation data that is never persisted on a shortcut/app.
 */
export interface AgentExecutionRuntime {
  /** Data captured from the UI at launch time (selection, text_before, content, etc.) */
  applicationScope?: ApplicationScope;
  /** Live user input — from the pre-execution gate or chat input. */
  userInput?: string;
  /** CallbackManager id for a WidgetHandle registered via useWidgetHandle. */
  widgetHandleId?: string;
  /** Original text the user had selected before the shortcut launched (for widget handoff). */
  originalText?: string;
  /**
   * Per-invocation variable values to inject into the instance on launch.
   * Keyed by variable NAME. Takes precedence over defaultVariables from config.
   * Never persisted on a shortcut — these are caller-supplied at runtime.
   */
  variables?: Record<string, unknown>;
  /**
   * The `ui_surface.name` of the surface that initiated the launch. Used by
   * the launch thunk to look up an `agx_agent_surface` binding row and
   * apply its `value_mappings` JSONB via `resolveValueMappings` before
   * delegating to the legacy scope-mapping pass. Optional — when absent,
   * the launcher behaves exactly as before (legacy auto-name-match only).
   */
  surfaceName?: string;
}

/**
 * Default execution config. Every merge starts here; every optional field in
 * Partial<AgentExecutionConfig> falls back to the corresponding value here.
 */
export const DEFAULT_AGENT_EXECUTION_CONFIG: AgentExecutionConfig = {
  displayMode: "modal-full",
  showVariablePanel: false,
  variablesPanelStyle: "inline",
  autoRun: true,
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
  defaultVariables: null,
  contextOverrides: null,
  llmOverrides: null,
  scopeMappings: null,
  contextMappings: null,
  jsonExtraction: null,
};

/**
 * Merge layered partial configs into a complete AgentExecutionConfig.
 * Later layers win. null in a later layer means "clear it"; undefined means "inherit".
 */
export function resolveExecutionConfig(
  ...layers: Array<Partial<AgentExecutionConfig> | null | undefined>
): AgentExecutionConfig {
  const out: AgentExecutionConfig = { ...DEFAULT_AGENT_EXECUTION_CONFIG };
  for (const layer of layers) {
    if (!layer) continue;
    for (const key of Object.keys(layer) as Array<keyof AgentExecutionConfig>) {
      assignIfDefined(out, key, layer[key]);
    }
  }
  return out;
}

/**
 * Per-key copy that preserves the K → AgentExecutionConfig[K] relationship.
 * Without the generic K, `target[key] = value` would require the intersection
 * of every field's value type (which collapses to `never`) because `key`
 * would carry the full `keyof AgentExecutionConfig` union.
 */
function assignIfDefined<K extends keyof AgentExecutionConfig>(
  target: AgentExecutionConfig,
  key: K,
  value: AgentExecutionConfig[K] | undefined,
): void {
  if (value !== undefined) {
    target[key] = value;
  }
}
