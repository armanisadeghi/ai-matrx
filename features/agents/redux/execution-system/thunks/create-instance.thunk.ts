/**
 * Create Instance Thunk
 *
 * The instance factory — handles all three creation paths:
 *   1. Manual: user opens the agent runner
 *   2. Shortcut: triggered by button/keyboard/context menu
 *   3. Test: created as part of parallel testing
 *
 * CRITICAL: This is the ONE moment where agentId is used legitimately.
 * We copy everything the instance needs from the agent definition ONCE.
 * After creation, no component, hook, selector, or thunk ever uses agentId
 * again — the instance is fully self-contained and isolated.
 *
 * If the agent is modified or deleted after this point, this instance
 * does not notice and does not care.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type {
  AgentType,
  VariableDefinition,
} from "@/features/agents/types/agent-definition.types";
import type { LLMParams } from "@/features/agents/types/agent-api-types";
import type { ApiEndpointMode } from "@/features/agents/types/instance.types";
import { getShortcutRecordFromState } from "@/features/agents/redux/agent-shortcuts/selectors";
import { hasField } from "@/features/agents/redux/shared/field-flags";
import { executeInstance } from "./execute-instance.thunk";

import { generateConversationId } from "../utils/ids";
import {
  createInstance,
  destroyInstance,
} from "../conversations/conversations.slice";
import {
  setFocus,
  setInputFocus,
  setDisplayFocus,
} from "../conversation-focus/conversation-focus.slice";
import { initInstanceOverrides } from "../instance-model-overrides/instance-model-overrides.slice";
import { buildInstanceBaseSettings } from "../instance-model-overrides/base-settings";
import {
  initInstanceVariables,
  setUserVariableValues,
} from "../instance-variable-values/instance-variable-values.slice";
import { initInstanceResources } from "../instance-resources/instance-resources.slice";
import {
  initInstanceContext,
  setContextEntries,
} from "../instance-context/instance-context.slice";
import type { InstanceContextEntry } from "@/features/agents/types/instance.types";
import {
  initInstanceUserInput,
  setUserInputText,
} from "../instance-user-input/instance-user-input.slice";
import { initInstanceClientTools } from "../instance-client-tools/instance-client-tools.slice";
import { initInstanceUIState } from "../instance-ui-state/instance-ui-state.slice";
import { initInstanceMessages } from "../messages/messages.slice";
import {
  InstanceOrigin,
  ResultDisplayMode,
  type JsonExtractionConfig,
  type SourceFeature,
  type VariablesPanelStyle,
} from "@/features/agents/types/instance.types";
import {
  mapScopeToInstance,
  mapScopeToInstanceWithSurface,
} from "@/features/agents/utils/scope-mapping";
import type { ValueMappingMap } from "@/features/surfaces/types";

// =============================================================================
// Shared helper — reads agent snapshot data. The ONLY place agentId is used.
// =============================================================================

function readAgentSnapshot(
  state: RootState,
  agentId: string,
): {
  agentType: AgentType;
  variableDefinitions: VariableDefinition[];
  baseSettings: Partial<LLMParams>;
  contextSlots: Array<{ key: string }>;
  isCreator: boolean;
} {
  const agent = state.agentDefinition.agents?.[agentId];
  // Loud recovery signal: snapshotting before the agent's model/settings are
  // loaded seeds an instance with an empty base model, which silently breaks
  // the model picker and the override delta guard. The launch orchestrator
  // (Step 0.5, fetchAgentExecutionFull) guarantees these fields on the
  // direct-agent path — if this fires, a creation path skipped that guarantee.
  if (agent && !hasField(agent._loadedFields, "modelId")) {
    console.warn(
      `[readAgentSnapshot] Agent ${agentId} snapshotted before modelId loaded — ` +
        "instance baseSettings.model will be empty. Ensure the full execution " +
        "payload is fetched before instance creation (launch-agent-execution Step 0.5).",
    );
  }
  return {
    agentType: agent?.agentType ?? "user",
    variableDefinitions: agent?.variableDefinitions ?? [],
    // Fold the agent's model into the snapshot so the per-instance override
    // layer owns it (see buildInstanceBaseSettings for the full invariant).
    baseSettings: buildInstanceBaseSettings(agent?.settings, agent?.modelId),
    contextSlots: agent?.contextSlots ?? [],
    isCreator: agent?.isOwner ?? false,
  };
}

// =============================================================================
// Manual Instance Creation
// =============================================================================

interface CreateManualInstanceArgs {
  agentId: string;
  /** When provided, uses this UUID instead of generating a new one. Useful for
   *  creating an instance keyed by a known server conversation UUID. */
  conversationId?: string;
  /**
   * Pin execution to a specific agx_version row id. When set, executeInstance
   * targets `/ai/agents/{versionId}` with `is_version: true` instead of
   * routing to the live agent. Used by surfaces (agent-comparison, future modes)
   * that let the user freeze a version per column.
   */
  initialAgentVersionId?: string | null;
  agentType?: AgentType;
  autoClearConversation?: boolean;
  showAutoClearToggle?: boolean;
  apiEndpointMode?: ApiEndpointMode;
  sourceFeature?: SourceFeature;
  autoRun?: boolean;
  allowChat?: boolean;
  showPreExecutionGate?: boolean;
  showVariablePanel?: boolean;
  showDefinitionMessages?: boolean;
  showDefinitionMessageContent?: boolean;
  displayMode?: ResultDisplayMode;
  widgetHandleId?: string | null;
  hideReasoning?: boolean;
  hideToolResults?: boolean;
  responseDensity?: "comfortable" | "compact";
  preExecutionMessage?: string | null;
  variablesPanelStyle?: VariablesPanelStyle;
  jsonExtraction?: JsonExtractionConfig | null;
  originalText?: string | null;
  /**
   * When true the conversation runs statelessly — server writes nothing to
   * the DB. Stamped onto the conversation record via `createInstance`; the
   * execute thunks branch on this flag to select endpoints and store flags.
   */
  isEphemeral?: boolean;
}

export const createManualInstance = createAsyncThunk<
  string,
  CreateManualInstanceArgs
>("instances/createManual", async (args, { dispatch, getState }) => {
  const {
    agentId,
    conversationId: providedConversationId,
    initialAgentVersionId = null,
    agentType,
    autoClearConversation = false,
    showAutoClearToggle,
    apiEndpointMode = "manual",
    sourceFeature = "agent-runner",
    autoRun,
    allowChat,
    showPreExecutionGate,
    showVariablePanel,
    showDefinitionMessages,
    showDefinitionMessageContent,
    displayMode,
    widgetHandleId,
    hideReasoning,
    hideToolResults,
    responseDensity,
    preExecutionMessage,
    variablesPanelStyle,
    jsonExtraction,
    originalText,
    isEphemeral,
  } = args;

  const conversationId = providedConversationId ?? generateConversationId();
  const state = getState() as RootState;

  const snapshot = readAgentSnapshot(state, agentId);
  const resolvedAgentType = agentType ?? snapshot.agentType;

  dispatch(
    createInstance({
      conversationId,
      agentId,
      ...(initialAgentVersionId ? { initialAgentVersionId } : {}),
      agentType: resolvedAgentType,
      origin: "manual" as InstanceOrigin,
      sourceFeature,
      ...(isEphemeral !== undefined ? { isEphemeral } : {}),
    }),
  );

  // Manual mode (the Agent Builder) reads `agent.settings` LIVE at submit
  // time and never touches the overrides slice — initialising it here would
  // be dead state and risks future code accidentally reading it as the
  // source of truth. Agent mode keeps the snapshot.
  if (apiEndpointMode !== "manual") {
    dispatch(
      initInstanceOverrides({
        conversationId,
        baseSettings: snapshot.baseSettings,
      }),
    );
  }
  dispatch(
    initInstanceVariables({
      conversationId,
      definitions: snapshot.variableDefinitions,
      scopeValues: {},
    }),
  );
  dispatch(initInstanceResources({ conversationId }));
  dispatch(initInstanceContext({ conversationId }));
  dispatch(initInstanceUserInput({ conversationId }));
  dispatch(initInstanceClientTools({ conversationId }));
  dispatch(
    initInstanceUIState({
      conversationId,
      displayMode,
      isCreator: snapshot.isCreator,
      autoClearConversation,
      showAutoClearToggle,
      autoRun,
      allowChat,
      showPreExecutionGate,
      showVariablePanel:
        showVariablePanel ?? snapshot.variableDefinitions.length > 0,
      showDefinitionMessages,
      showDefinitionMessageContent,
      widgetHandleId,
      hideReasoning,
      hideToolResults,
      responseDensity,
      preExecutionMessage,
      variablesPanelStyle,
      jsonExtraction,
      originalText,
    }),
  );
  dispatch(initInstanceMessages({ conversationId, apiEndpointMode }));

  return conversationId;
});

// =============================================================================
// Shortcut Instance Creation
// =============================================================================

interface CreateShortcutInstanceArgs {
  shortcutId: string;
  uiScopes: Record<string, unknown>;
  sourceFeature?: SourceFeature;
  displayMode?: ResultDisplayMode;
  autoRun?: boolean;
  allowChat?: boolean;
  showPreExecutionGate?: boolean;
  autoClearConversation?: boolean;
  showAutoClearToggle?: boolean;
  apiEndpointMode?: ApiEndpointMode;
  showVariablePanel?: boolean;
  showDefinitionMessages?: boolean;
  showDefinitionMessageContent?: boolean;
  widgetHandleId?: string | null;
  hideReasoning?: boolean;
  hideToolResults?: boolean;
  responseDensity?: "comfortable" | "compact";
  preExecutionMessage?: string | null;
  bypassGateSeconds?: number;
  variablesPanelStyle?: VariablesPanelStyle;
  jsonExtraction?: JsonExtractionConfig | null;
  originalText?: string | null;
  /**
   * Surface value mappings resolved upstream by the launch thunk for the
   * (shortcut.agentId, surfaceName, caller scope) tuple. When present and
   * non-empty, scope→variable resolution runs through
   * `mapScopeToInstanceWithSurface` instead of the legacy
   * `mapScopeToInstance`, applying explicit `ValueMapping` rules from
   * `agx_agent_surface.value_mappings`. `null` (the common case) skips the
   * surface path and uses the shortcut's own scopeMappings.
   */
  surfaceValueMappings?: ValueMappingMap | null;
}

export const createInstanceFromShortcut = createAsyncThunk<
  string,
  CreateShortcutInstanceArgs
>("instances/createFromShortcut", async (args, { dispatch, getState }) => {
  const {
    shortcutId,
    uiScopes,
    sourceFeature,
    displayMode,
    autoRun,
    allowChat,
    showPreExecutionGate,
    autoClearConversation,
    showAutoClearToggle,
    apiEndpointMode = "agent",
    showVariablePanel,
    showDefinitionMessages,
    showDefinitionMessageContent,
    widgetHandleId,
    hideReasoning,
    hideToolResults,
    responseDensity,
    preExecutionMessage,
    bypassGateSeconds,
    variablesPanelStyle,
    jsonExtraction,
    originalText,
    surfaceValueMappings,
  } = args;

  const conversationId = generateConversationId();
  const state = getState() as RootState;
  const shortcut = getShortcutRecordFromState(state, shortcutId);

  if (!shortcut) throw new Error(`Shortcut ${shortcutId} not found`);

  // ──────────────────────────────────────────────────────────────────────
  // The shortcut is self-sufficient for execution.
  // We never read from state.agentDefinition here. Doing so would:
  //   (1) require the agent to be loaded ahead of time, and
  //   (2) risk reading the CURRENT agent when the shortcut is pinned to
  //       an older frozen version.
  // Everything below comes directly off the shortcut record that was
  // populated by the shortcut-menu RPCs (variable defs + context slots are
  // snapshotted alongside the shortcut).
  // ──────────────────────────────────────────────────────────────────────
  const {
    agentId,
    resolvedId,
    isVersion,
    variableDefinitions: shortcutVariableDefinitions,
    contextSlots: shortcutContextSlots,
  } = shortcut;

  // ── Trace: what the shortcut tells us to do ─────────────────────────────
  if (typeof window !== "undefined") {
    console.groupCollapsed(
      `%c[Shortcut] createInstanceFromShortcut — "${shortcut.label ?? shortcut.id}"`,
      "color:#0ea5e9;font-weight:bold",
    );
    console.log("shortcutId:", shortcut.id);
    console.log(
      "execution target: resolvedId=",
      resolvedId,
      "| isVersion=",
      isVersion,
      "| (agentId=",
      agentId,
      ", agentVersionId=",
      shortcut.agentVersionId,
      ", useLatest=",
      shortcut.useLatest,
      ")",
    );
    console.log(
      "displayMode:",
      shortcut.displayMode,
      "| autoRun:",
      shortcut.autoRun,
      "| allowChat:",
      shortcut.allowChat,
    );
    console.log(
      "scopeMappings (UI key → agent variable):",
      shortcut.scopeMappings ?? "(none)",
    );
    console.log(
      "contextMappings (UI key → context slot):",
      shortcut.contextMappings ?? "(none)",
    );
    console.log("defaultVariables:", shortcut.defaultVariables ?? "(none)");
    console.log("contextOverrides:", shortcut.contextOverrides ?? "(none)");
    console.log("llmOverrides:", shortcut.llmOverrides ?? "(none)");
    console.log("defaultUserInput:", shortcut.defaultUserInput ?? "(none)");
    console.log(
      "agent contract (carried by the shortcut):",
      shortcutVariableDefinitions.length > 0 || shortcutContextSlots.length > 0
        ? `${shortcutVariableDefinitions.length} variables, ${shortcutContextSlots.length} context slots`
        : "⚠ EMPTY — shortcut was loaded without variable defs (probably via REST, not the menu RPC)",
    );
    console.log(
      "agent variables:",
      shortcutVariableDefinitions.map((v) => v.name),
    );
    console.log(
      "agent context slots:",
      shortcutContextSlots.map((s) => s.key),
    );
    console.log("uiScopes (applicationScope) keys:", Object.keys(uiScopes));
    console.log("caller sourceFeature:", sourceFeature ?? "(unset)");
    console.groupEnd();
  }

  dispatch(
    createInstance({
      conversationId,
      agentId,
      // Pass the frozen version id when the shortcut is version-pinned so
      // downstream URL/body construction targets agx_version instead of
      // agx_agent. Leaves `agentId` as the live agent id for display +
      // linking.
      initialAgentVersionId:
        !shortcut.useLatest && shortcut.agentVersionId
          ? shortcut.agentVersionId
          : null,
      // Shortcuts never carry an agentType; "user" is the generic fallback
      // used by everything but the internal system agents. Not load-bearing —
      // it's a classification hint downstream, not a routing decision.
      agentType: "user",
      origin: "shortcut" as InstanceOrigin,
      shortcutId,
      sourceFeature,
    }),
  );

  dispatch(
    initInstanceOverrides({
      conversationId,
      // Shortcuts don't carry the agent's baseSettings — those stay with
      // the agent and are applied server-side. Only `llmOverrides` (the
      // partial delta the shortcut author set) is applied below.
      // INVARIANT for Phase 2+: shortcut llmOverrides are authored deltas and
      // must never include a value (incl. `model`) equal to the agent default —
      // base is empty here, so the override delta guard cannot protect this
      // path. If a runtime model/settings picker is ever shown on a
      // shortcut-launched instance, seed a real base model first.
      baseSettings: {},
    }),
  );
  dispatch(
    initInstanceVariables({
      conversationId,
      definitions: shortcutVariableDefinitions,
      scopeValues: {},
    }),
  );
  dispatch(initInstanceResources({ conversationId }));
  dispatch(initInstanceContext({ conversationId }));
  dispatch(initInstanceUserInput({ conversationId }));
  dispatch(initInstanceClientTools({ conversationId }));
  dispatch(
    initInstanceUIState({
      conversationId,
      displayMode: (displayMode ?? shortcut.displayMode) as ResultDisplayMode,
      autoRun: autoRun ?? shortcut.autoRun,
      allowChat: allowChat ?? shortcut.allowChat,
      showPreExecutionGate:
        showPreExecutionGate ?? shortcut.showPreExecutionGate,
      autoClearConversation,
      showAutoClearToggle,
      showVariablePanel: showVariablePanel ?? shortcut.showVariablePanel,
      showDefinitionMessages:
        showDefinitionMessages ?? shortcut.showDefinitionMessages,
      showDefinitionMessageContent:
        showDefinitionMessageContent ?? shortcut.showDefinitionMessageContent,
      widgetHandleId,
      // `isCreator` tags the instance UI for the Agent Builder's preview.
      // A shortcut always launches a consumer run, never the builder, so
      // this is false by construction.
      isCreator: false,
      hideReasoning: hideReasoning ?? shortcut.hideReasoning,
      hideToolResults: hideToolResults ?? shortcut.hideToolResults,
      responseDensity: responseDensity ?? shortcut.responseDensity,
      preExecutionMessage: preExecutionMessage ?? shortcut.preExecutionMessage,
      bypassGateSeconds: bypassGateSeconds ?? shortcut.bypassGateSeconds ?? 0,
      variablesPanelStyle: variablesPanelStyle ?? shortcut.variablesPanelStyle,
      jsonExtraction,
      originalText,
    }),
  );

  // ── Variable resolution precedence (low → high) ──
  //   1. Agent variableDefinitions[].defaultValue   (already seeded by initInstanceVariables)
  //   2. Shortcut.defaultVariables                  (this dispatch)
  //   3. Scope-mapped values from applicationScope  (next dispatch — overrides 2)
  //   4. User edits via the variable panel          (later, runtime)
  if (
    shortcut.defaultVariables &&
    Object.keys(shortcut.defaultVariables).length > 0
  ) {
    dispatch(
      setUserVariableValues({
        conversationId,
        values: shortcut.defaultVariables,
      }),
    );
  }

  // ── Context resolution precedence (low → high) ──
  //   1. Agent context_slots[].default              (already seeded by initInstanceContext)
  //   2. Shortcut.contextOverrides                  (this dispatch)
  //   3. Runtime context entries from scope-mapping (next dispatch — overrides 2)
  if (
    shortcut.contextOverrides &&
    Object.keys(shortcut.contextOverrides).length > 0
  ) {
    const overrideEntries = Object.entries(shortcut.contextOverrides).map(
      ([key, value]) => {
        const slot = shortcutContextSlots.find((s) => s.key === key);
        return {
          key,
          value,
          slotMatched: !!slot,
          type: slot?.type ?? ("text" as const),
          label: slot?.label ?? key,
        };
      },
    );
    dispatch(setContextEntries({ conversationId, entries: overrideEntries }));
  }

  // Apply LLM overrides from the shortcut config
  if (shortcut.llmOverrides && Object.keys(shortcut.llmOverrides).length > 0) {
    const { setOverrides } =
      await import("../instance-model-overrides/instance-model-overrides.slice");
    dispatch(setOverrides({ conversationId, changes: shortcut.llmOverrides }));
  }

  // Apply shortcut.defaultUserInput (designer's extra instructions)
  if (shortcut.defaultUserInput) {
    dispatch(
      setUserInputText({ conversationId, text: shortcut.defaultUserInput }),
    );
  }

  // Scope → variable / context-slot resolution.
  //
  // Two paths:
  //
  //   A. SURFACE PATH — caller passed `surfaceValueMappings`: the launch
  //      thunk's per-key MERGE of agx_agent_surface bindings (global →
  //      org-by-membership → user) and the shortcut's own mappings
  //      (value_mappings layered over the promoted legacy
  //      scopeMappings/contextMappings), with prompt_user entries already
  //      drained into direct_value answers and required-missing already
  //      pre-checked. Apply via `mapScopeToInstanceWithSurface`.
  //
  //   B. LEGACY PATH — no mappings exist anywhere for this launch; run
  //      `mapScopeToInstance` (pure auto-name-match — the legacy columns
  //      are empty too, or they'd have formed a layer in path A).
  if (surfaceValueMappings && Object.keys(surfaceValueMappings).length > 0) {
    const result = mapScopeToInstanceWithSurface(
      uiScopes,
      null,
      surfaceValueMappings,
      shortcutVariableDefinitions,
      shortcutContextSlots,
    );
    if (result.errors.length > 0) {
      // Backstop only — required-missing is pre-checked by the launch
      // thunk's prepareLaunchMappings before this thunk runs. If this
      // fires, the resolver and the pre-check have diverged.
      console.error(
        "[createInstanceFromShortcut] surface mapping errors (post-precheck — investigate):",
        result.errors,
      );
    }
    if (result.warnings.length > 0) {
      console.warn(
        "[createInstanceFromShortcut] surface mapping warnings:",
        result.warnings,
      );
    }
    if (Object.keys(result.variableValues).length > 0) {
      dispatch(
        setUserVariableValues({
          conversationId,
          values: result.variableValues,
        }),
      );
    }
    if (result.contextEntries.length > 0) {
      dispatch(
        setContextEntries({ conversationId, entries: result.contextEntries }),
      );
    }
    if (result.pendingPrompts.length > 0) {
      // Should be empty — the launch thunk drains prompt_user mappings into
      // direct_value entries (value-prompts dialog) before dispatching this
      // thunk. Loud if not.
      console.warn(
        "[createInstanceFromShortcut] pendingPrompts survived the pre-launch drain — investigate:",
        result.pendingPrompts.map((p) => p.targetName),
      );
    }
  } else {
    const { variableValues, contextEntries } = mapScopeToInstance(
      uiScopes,
      shortcut.scopeMappings,
      shortcutVariableDefinitions,
      shortcutContextSlots,
      shortcut.contextMappings,
    );

    // Always apply scope-mapped variables — they override shortcut defaults.
    // (apply_variables conditional removed in Phase 3.5: defaults always
    // apply, visibility is controlled by show_variable_panel.)
    if (Object.keys(variableValues).length > 0) {
      dispatch(
        setUserVariableValues({ conversationId, values: variableValues }),
      );
    }

    if (contextEntries.length > 0) {
      dispatch(setContextEntries({ conversationId, entries: contextEntries }));
    }
  }

  dispatch(
    initInstanceMessages({ conversationId, apiEndpointMode: apiEndpointMode }),
  );

  // ── Trace: final summary of what got seeded on the instance ────────────
  if (typeof window !== "undefined") {
    const finalState = getState() as RootState;
    const variableEntry =
      finalState.instanceVariableValues?.byConversationId?.[conversationId];
    const userValues = variableEntry?.userValues ?? {};
    const scopeValues = variableEntry?.scopeValues ?? {};
    const contextDict =
      finalState.instanceContext?.byConversationId?.[conversationId] ?? {};
    const finalUserInput =
      finalState.instanceUserInput?.byConversationId?.[conversationId]?.text ??
      "";
    const overrideEntry =
      finalState.instanceModelOverrides?.byConversationId?.[conversationId];
    console.groupCollapsed(
      `%c[Shortcut] instance seeded — conversationId=${conversationId}`,
      "color:#22c55e;font-weight:bold",
    );
    console.log("variables (scope-mapped):", scopeValues);
    console.log("variables (user-edit layer):", userValues);
    console.log("context entries:", contextDict);
    console.log(
      "userInput:",
      finalUserInput
        ? `"${finalUserInput.slice(0, 80)}"${finalUserInput.length > 80 ? "…" : ""}`
        : "(empty)",
    );
    console.log("llm overrides:", overrideEntry ?? "(none)");
    console.groupEnd();
  }

  return conversationId;
});

// =============================================================================
// Test Instance Creation (parallel testing)
// =============================================================================

interface CreateTestInstanceArgs {
  agentId: string;
  agentType?: AgentType;
  variables?: Record<string, unknown>;
  overrides?: Partial<LLMParams>;
  userInput?: string;
  sourceFeature?: SourceFeature;
}

export const createTestInstance = createAsyncThunk<
  string,
  CreateTestInstanceArgs
>(
  "instances/createTest",
  async (
    {
      agentId,
      agentType,
      variables,
      overrides,
      userInput,
      sourceFeature = "agent-builder",
    },
    { dispatch, getState },
  ) => {
    const conversationId = generateConversationId();
    const state = getState() as RootState;

    const snapshot = readAgentSnapshot(state, agentId);
    const resolvedAgentType = agentType ?? snapshot.agentType;

    dispatch(
      createInstance({
        conversationId,
        agentId,
        agentType: resolvedAgentType,
        origin: "test" as InstanceOrigin,
        sourceFeature,
      }),
    );

    dispatch(
      initInstanceOverrides({
        conversationId,
        baseSettings: snapshot.baseSettings,
      }),
    );
    dispatch(
      initInstanceVariables({
        conversationId,
        definitions: snapshot.variableDefinitions,
        scopeValues: {},
      }),
    );
    dispatch(initInstanceResources({ conversationId }));
    dispatch(initInstanceContext({ conversationId }));
    dispatch(initInstanceUserInput({ conversationId, text: userInput }));
    dispatch(initInstanceClientTools({ conversationId }));
    dispatch(
      initInstanceUIState({
        conversationId,
        isCreator: snapshot.isCreator,
        showVariablePanel: snapshot.variableDefinitions.length > 0,
      }),
    );
    dispatch(initInstanceMessages({ conversationId }));

    if (variables && Object.keys(variables).length > 0) {
      dispatch(setUserVariableValues({ conversationId, values: variables }));
    }

    if (overrides && Object.keys(overrides).length > 0) {
      const { setOverrides } =
        await import("../instance-model-overrides/instance-model-overrides.slice");
      dispatch(setOverrides({ conversationId, changes: overrides }));
    }

    return conversationId;
  },
);

// =============================================================================
// Manual Instance Creation (no agent — direct chat/custom)
// =============================================================================

interface CreateManualInstanceNoAgentArgs {
  label?: string;
  agentType?: AgentType;
  variableDefinitions?: VariableDefinition[];
  baseSettings?: Partial<LLMParams>;
  userInput?: string;
  sourceFeature?: SourceFeature;
  widgetHandleId?: string | null;
}

export const createManualInstanceNoAgent = createAsyncThunk<
  string,
  CreateManualInstanceNoAgentArgs
>(
  "instances/createManualNoAgent",
  async (
    {
      agentType = "user",
      variableDefinitions = [],
      baseSettings = {},
      userInput,
      sourceFeature,
      widgetHandleId,
    },
    { dispatch },
  ) => {
    const conversationId = generateConversationId();

    dispatch(
      createInstance({
        conversationId,
        agentId: "",
        agentType,
        origin: "manual" as InstanceOrigin,
        sourceFeature,
      }),
    );

    dispatch(initInstanceOverrides({ conversationId, baseSettings }));
    dispatch(
      initInstanceVariables({
        conversationId,
        definitions: variableDefinitions,
        scopeValues: {},
      }),
    );
    dispatch(initInstanceResources({ conversationId }));
    dispatch(initInstanceContext({ conversationId }));
    dispatch(initInstanceUserInput({ conversationId, text: userInput }));
    dispatch(initInstanceClientTools({ conversationId }));
    dispatch(
      initInstanceUIState({
        conversationId,
        widgetHandleId,
        showVariablePanel: variableDefinitions.length > 0,
      }),
    );
    dispatch(initInstanceMessages({ conversationId }));

    return conversationId;
  },
);

// =============================================================================
// Start New Conversation (non-destructive — old conversation stays cached)
// =============================================================================

interface StartNewConversationArgs {
  currentConversationId: string;
  surfaceKey: string;
}

/**
 * Creates a fresh conversation for the same agent without destroying the old one.
 * Re-snapshots the agent definition so any unsaved builder edits are picked up.
 * Dispatches setFocus to switch the surface to the new conversation.
 * The old conversation remains fully cached in Redux.
 */
export const startNewConversation = createAsyncThunk<
  string,
  StartNewConversationArgs
>(
  "instances/startNewConversation",
  async ({ currentConversationId, surfaceKey }, { dispatch, getState }) => {
    const state = getState() as RootState;

    const instance =
      state.conversations.byConversationId[currentConversationId];
    if (!instance) {
      throw new Error(`Conversation ${currentConversationId} not found`);
    }

    const { agentId, sourceFeature } = instance;
    const currentUIState =
      state.instanceUIState.byConversationId[currentConversationId];
    const currentInputEntry =
      state.instanceUserInput.byConversationId[currentConversationId];

    const snapshot = agentId ? readAgentSnapshot(state, agentId) : null;
    const newConversationId = generateConversationId();

    dispatch(
      createInstance({
        conversationId: newConversationId,
        agentId,
        agentType: snapshot?.agentType ?? instance.agentType,
        origin: instance.origin as InstanceOrigin,
        sourceFeature: sourceFeature as SourceFeature,
      }),
    );

    dispatch(
      initInstanceOverrides({
        conversationId: newConversationId,
        baseSettings: snapshot?.baseSettings ?? {},
      }),
    );
    dispatch(
      initInstanceVariables({
        conversationId: newConversationId,
        definitions: snapshot?.variableDefinitions ?? [],
        scopeValues: {},
      }),
    );
    dispatch(initInstanceResources({ conversationId: newConversationId }));
    dispatch(initInstanceContext({ conversationId: newConversationId }));
    // Carry the last-submitted snapshot across reset so /build engineers can
    // re-apply the same input with tweaked settings.
    dispatch(
      initInstanceUserInput({
        conversationId: newConversationId,
        lastSubmittedText: currentInputEntry?.lastSubmittedText,
        lastSubmittedUserValues: currentInputEntry?.lastSubmittedUserValues,
      }),
    );
    dispatch(initInstanceClientTools({ conversationId: newConversationId }));
    dispatch(
      initInstanceUIState({
        conversationId: newConversationId,
        displayMode: currentUIState?.displayMode,
        isCreator: snapshot?.isCreator ?? currentUIState?.isCreator ?? false,
        autoClearConversation: currentUIState?.autoClearConversation ?? true,
        showAutoClearToggle: currentUIState?.showAutoClearToggle,
        autoRun: currentUIState?.autoRun,
        allowChat: currentUIState?.allowChat,
        showPreExecutionGate: currentUIState?.showPreExecutionGate,
        showVariablePanel:
          (snapshot?.variableDefinitions?.length ?? 0) > 0 ||
          (currentUIState?.showVariablePanel ?? false),
        showDefinitionMessages: currentUIState?.showDefinitionMessages,
        showDefinitionMessageContent:
          currentUIState?.showDefinitionMessageContent,
        hiddenMessageCount: currentUIState?.hiddenMessageCount,
        widgetHandleId: currentUIState?.widgetHandleId,
        submitOnEnter: currentUIState?.submitOnEnter,
        reuseConversationId: currentUIState?.reuseConversationId,
        builderAdvancedSettings: currentUIState?.builderAdvancedSettings,
        hideReasoning: currentUIState?.hideReasoning,
        hideToolResults: currentUIState?.hideToolResults,
        responseDensity: currentUIState?.responseDensity,
        preExecutionMessage: currentUIState?.preExecutionMessage,
        variablesPanelStyle: currentUIState?.variablesPanelStyle,
        jsonExtraction: currentUIState?.jsonExtraction,
        originalText: currentUIState?.originalText,
      }),
    );
    dispatch(
      initInstanceMessages({
        conversationId: newConversationId,
        apiEndpointMode: "agent",
      }),
    );

    dispatch(setFocus({ surfaceKey, conversationId: newConversationId }));

    return newConversationId;
  },
);

// =============================================================================
// Start New Conversation and Execute (autoClearConversation path)
// =============================================================================

interface StartNewConversationAndExecuteArgs {
  currentConversationId: string;
  surfaceKey: string;
  debug?: boolean;
}

interface StartNewConversationAndExecuteResult {
  newConversationId: string;
  requestId: string;
}

/**
 * Non-destructive auto-clear submit path.
 *
 * When `autoClearConversation` is ON and the conversation already has history,
 * submitting creates a NEW conversation alongside the old one:
 *   1. Read current variable values and user input text from the old conversation
 *   2. Create a new conversation by re-snapshotting the agent definition
 *   3. Transfer variable values and user input into the new conversation
 *   4. Switch focus to the new conversation via setFocus (no callback needed)
 *   5. Execute on the new conversation (fresh agent call)
 *
 * The old conversation stays fully cached in Redux.
 */
export const startNewConversationAndExecute = createAsyncThunk<
  StartNewConversationAndExecuteResult,
  StartNewConversationAndExecuteArgs
>(
  "instances/startNewConversationAndExecute",
  async (
    { currentConversationId, surfaceKey, debug = false },
    { dispatch, getState },
  ) => {
    const state = getState() as RootState;

    const currentInput =
      state.instanceUserInput.byConversationId[currentConversationId];
    const currentVariables =
      state.instanceVariableValues.byConversationId[currentConversationId];
    const currentUIState =
      state.instanceUIState.byConversationId[currentConversationId];

    // Read the authoritative apiEndpointMode from the history slice — kept
    // for downstream consumers (initInstanceMessages, instance bookkeeping)
    // even though execution itself now always flows through executeInstance.
    const currentMode =
      state.messages.byConversationId[currentConversationId]?.apiEndpointMode ??
      "agent";

    const userInputText = currentInput?.text ?? "";
    const userValues = currentVariables?.userValues ?? {};

    const instance =
      state.conversations.byConversationId[currentConversationId];
    if (!instance) {
      throw new Error(`Conversation ${currentConversationId} not found`);
    }
    const { agentId, origin, sourceFeature } = instance;

    const newConversationId = generateConversationId();
    const snapshot = agentId ? readAgentSnapshot(state, agentId) : null;

    dispatch(
      createInstance({
        conversationId: newConversationId,
        agentId,
        agentType: snapshot?.agentType ?? instance.agentType,
        origin: origin as InstanceOrigin,
        sourceFeature: sourceFeature as SourceFeature,
      }),
    );

    dispatch(
      initInstanceOverrides({
        conversationId: newConversationId,
        baseSettings: snapshot?.baseSettings ?? {},
      }),
    );
    dispatch(
      initInstanceVariables({
        conversationId: newConversationId,
        definitions: snapshot?.variableDefinitions ?? [],
        scopeValues: {},
      }),
    );
    dispatch(initInstanceResources({ conversationId: newConversationId }));
    dispatch(initInstanceContext({ conversationId: newConversationId }));
    // Carry the last-submitted snapshot across the autoClear boundary so the
    // re-apply affordance remains available on the new conversation.
    dispatch(
      initInstanceUserInput({
        conversationId: newConversationId,
        lastSubmittedText: currentInput?.lastSubmittedText,
        lastSubmittedUserValues: currentInput?.lastSubmittedUserValues,
      }),
    );
    dispatch(initInstanceClientTools({ conversationId: newConversationId }));
    dispatch(
      initInstanceUIState({
        conversationId: newConversationId,
        displayMode: currentUIState?.displayMode,
        isCreator: snapshot?.isCreator ?? currentUIState?.isCreator ?? false,
        autoClearConversation: true,
        showAutoClearToggle: currentUIState?.showAutoClearToggle,
        autoRun: currentUIState?.autoRun,
        allowChat: currentUIState?.allowChat,
        showPreExecutionGate: currentUIState?.showPreExecutionGate,
        showVariablePanel:
          (snapshot?.variableDefinitions?.length ?? 0) > 0 ||
          (currentUIState?.showVariablePanel ?? false),
        showDefinitionMessages: currentUIState?.showDefinitionMessages,
        showDefinitionMessageContent:
          currentUIState?.showDefinitionMessageContent,
        hiddenMessageCount: currentUIState?.hiddenMessageCount,
        widgetHandleId: currentUIState?.widgetHandleId,
        submitOnEnter: currentUIState?.submitOnEnter ?? true,
        reuseConversationId: currentUIState?.reuseConversationId ?? false,
        builderAdvancedSettings: currentUIState?.builderAdvancedSettings,
        hideReasoning: currentUIState?.hideReasoning,
        hideToolResults: currentUIState?.hideToolResults,
        responseDensity: currentUIState?.responseDensity,
        preExecutionMessage: currentUIState?.preExecutionMessage,
        variablesPanelStyle: currentUIState?.variablesPanelStyle,
        jsonExtraction: currentUIState?.jsonExtraction,
        originalText: currentUIState?.originalText,
      }),
    );
    dispatch(
      initInstanceMessages({
        conversationId: newConversationId,
        apiEndpointMode: currentMode,
      }),
    );

    if (Object.keys(userValues).length > 0) {
      dispatch(
        setUserVariableValues({
          conversationId: newConversationId,
          values: userValues,
        }),
      );
    }
    if (userInputText) {
      dispatch(
        setUserInputText({
          conversationId: newConversationId,
          text: userInputText,
        }),
      );
    }

    dispatch(setFocus({ surfaceKey, conversationId: newConversationId }));

    const result = await dispatch(
      executeInstance({ conversationId: newConversationId, debug }),
    ).unwrap();

    return {
      newConversationId,
      requestId: result.requestId,
    };
  },
);

/** @deprecated Use startNewConversationAndExecute */
export const reInstanceAndExecute = startNewConversationAndExecute;

// =============================================================================
// Split Input Into New Conversation
// =============================================================================

interface SplitInputIntoNewConversationArgs {
  /**
   * The conversation the user just submitted. Becomes the "display" id;
   * continues streaming. We read the submitted text + userValues from its
   * `lastSubmittedText` / `lastSubmittedUserValues` snapshot (captured by
   * `markInputSubmitted` a moment earlier in the smart-execute flow).
   */
  currentConversationId: string;
  surfaceKey: string;
}

interface SplitInputIntoNewConversationResult {
  newConversationId: string;
}

/**
 * Autoclear's "split" step — called immediately after a submit.
 *
 * Creates a fresh conversation (same agent snapshot, same UI state) pre-populated
 * with the text + variables the user just submitted, then points ONLY the input
 * focus slot at it. The display slot stays on `currentConversationId` so the
 * user watches the stream land into the previous conversation while typing the
 * next turn into the new one.
 *
 * Nothing is executed here — this is pure preparation for the NEXT turn.
 */
export const splitInputIntoNewConversation = createAsyncThunk<
  SplitInputIntoNewConversationResult,
  SplitInputIntoNewConversationArgs
>(
  "instances/splitInputIntoNewConversation",
  async ({ currentConversationId, surfaceKey }, { dispatch, getState }) => {
    const state = getState() as RootState;

    const currentInput =
      state.instanceUserInput.byConversationId[currentConversationId];
    const currentUIState =
      state.instanceUIState.byConversationId[currentConversationId];
    const instance =
      state.conversations.byConversationId[currentConversationId];
    if (!instance) {
      throw new Error(`Conversation ${currentConversationId} not found`);
    }
    const { agentId, origin, sourceFeature } = instance;
    const snapshot = agentId ? readAgentSnapshot(state, agentId) : null;

    // The text + userValues the user just submitted. These are captured onto
    // the current conversation by markInputSubmitted BEFORE smart-execute
    // kicks off execution, so they're guaranteed to be present here.
    const carryText = currentInput?.lastSubmittedText ?? "";
    const carryUserValues = currentInput?.lastSubmittedUserValues ?? {};

    const currentMode =
      state.messages.byConversationId[currentConversationId]?.apiEndpointMode ??
      "agent";

    const newConversationId = generateConversationId();

    dispatch(
      createInstance({
        conversationId: newConversationId,
        agentId,
        agentType: snapshot?.agentType ?? instance.agentType,
        origin: origin as InstanceOrigin,
        sourceFeature: sourceFeature as SourceFeature,
      }),
    );
    dispatch(
      initInstanceOverrides({
        conversationId: newConversationId,
        baseSettings: snapshot?.baseSettings ?? {},
      }),
    );
    dispatch(
      initInstanceVariables({
        conversationId: newConversationId,
        definitions: snapshot?.variableDefinitions ?? [],
        scopeValues: {},
      }),
    );
    dispatch(initInstanceResources({ conversationId: newConversationId }));
    dispatch(initInstanceContext({ conversationId: newConversationId }));

    // Carry context entries forward onto the fresh conversation so the
    // engineer's slot values persist across the autoclear boundary. The
    // builder-side localStorage seed will also attempt this, but doing it
    // here removes the race with the hook's useEffect.
    const currentContextMap =
      state.instanceContext.byConversationId[currentConversationId];
    if (currentContextMap) {
      const carriedEntries: InstanceContextEntry[] =
        Object.values(currentContextMap);
      if (carriedEntries.length > 0) {
        dispatch(
          setContextEntries({
            conversationId: newConversationId,
            entries: carriedEntries.map((e) => ({
              key: e.key,
              value: e.value,
              slotMatched: e.slotMatched,
              type: e.type,
              label: e.label,
            })),
          }),
        );
      }
    }

    dispatch(
      initInstanceUserInput({
        conversationId: newConversationId,
        text: carryText,
        lastSubmittedText: currentInput?.lastSubmittedText,
        lastSubmittedUserValues: currentInput?.lastSubmittedUserValues,
      }),
    );
    dispatch(initInstanceClientTools({ conversationId: newConversationId }));
    dispatch(
      initInstanceUIState({
        conversationId: newConversationId,
        displayMode: currentUIState?.displayMode,
        isCreator: snapshot?.isCreator ?? currentUIState?.isCreator ?? false,
        autoClearConversation: true,
        showAutoClearToggle: currentUIState?.showAutoClearToggle,
        autoRun: currentUIState?.autoRun,
        allowChat: currentUIState?.allowChat,
        showPreExecutionGate: currentUIState?.showPreExecutionGate,
        showVariablePanel:
          (snapshot?.variableDefinitions?.length ?? 0) > 0 ||
          (currentUIState?.showVariablePanel ?? false),
        showDefinitionMessages: currentUIState?.showDefinitionMessages,
        showDefinitionMessageContent:
          currentUIState?.showDefinitionMessageContent,
        hiddenMessageCount: currentUIState?.hiddenMessageCount,
        widgetHandleId: currentUIState?.widgetHandleId,
        submitOnEnter: currentUIState?.submitOnEnter ?? true,
        reuseConversationId: currentUIState?.reuseConversationId ?? false,
        builderAdvancedSettings: currentUIState?.builderAdvancedSettings,
        hideReasoning: currentUIState?.hideReasoning,
        hideToolResults: currentUIState?.hideToolResults,
        responseDensity: currentUIState?.responseDensity,
        preExecutionMessage: currentUIState?.preExecutionMessage,
        variablesPanelStyle: currentUIState?.variablesPanelStyle,
        jsonExtraction: currentUIState?.jsonExtraction,
        originalText: currentUIState?.originalText,
      }),
    );
    dispatch(
      initInstanceMessages({
        conversationId: newConversationId,
        apiEndpointMode: currentMode,
      }),
    );

    if (Object.keys(carryUserValues).length > 0) {
      dispatch(
        setUserVariableValues({
          conversationId: newConversationId,
          values: carryUserValues,
        }),
      );
    }

    // initInstanceUserInput sets `text` but the setUserInputText path is what
    // the undo stack uses — re-apply via setUserInputText so the snapshot is
    // consistent and the input slice's phase/undo invariants hold.
    if (carryText) {
      dispatch(
        setUserInputText({
          conversationId: newConversationId,
          text: carryText,
          userValues: carryUserValues,
        }),
      );
    }

    // Catch the display up to the conversation that's now streaming, and
    // move ONLY the input focus onto the fresh conversation.
    dispatch(
      setDisplayFocus({
        surfaceKey,
        conversationId: currentConversationId,
      }),
    );
    dispatch(setInputFocus({ surfaceKey, conversationId: newConversationId }));

    return { newConversationId };
  },
);
