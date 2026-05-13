/**
 * Launch Agent Execution — Orchestrator Thunk
 *
 * The universal entry point for running any agent from any trigger.
 * Equivalent to the old `openPromptExecution` thunk but built on the
 * new agent execution system with V2 stream events and full source tracking.
 *
 * Three trigger paths:
 *   1. Known agent (agentId) → createManualInstance → execute
 *   2. Shortcut → agent → createInstanceFromShortcut → execute
 *   3. Manual / no-agent → createManualInstanceNoAgent → execute
 *
 * Display routing:
 *   - direct / background → caller manages UI
 *   - All others → OverlayController renders the component
 *
 * All settings (autoRun, showVariables, showPreExecutionGate, callbacks, etc.)
 * are persisted to Redux so components can read them after creation.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type {
  ManagedAgentOptions,
  ResultDisplayMode,
} from "@/features/agents/types/instance.types";
import {
  mapScopeToInstance,
  mapScopeToInstanceWithSurface,
} from "@/features/agents/utils/scope-mapping";
import { createClient as createBrowserSupabase } from "@/utils/supabase/client";
import { isValueMappingMap } from "@/features/tool-registry/surfaces/types";
import type { ValueMappingMap } from "@/features/tool-registry/surfaces/types";
import { fetchAgentExecutionMinimal } from "@/features/agents/redux/agent-definition/thunks";
import { selectAgentExecutionPayload } from "@/features/agents/redux/agent-definition/selectors";
import { getShortcutRecordFromState } from "@/features/agents/redux/agent-shortcuts/selectors";
import { ensureShortcutLoaded } from "@/features/agents/redux/agent-shortcuts/thunks";
import {
  createManualInstance,
  createInstanceFromShortcut,
  createManualInstanceNoAgent,
} from "./create-instance.thunk";
import { executeInstance } from "./execute-instance.thunk";
import { setUserVariableValues } from "../instance-variable-values/instance-variable-values.slice";
import { setContextEntries } from "../instance-context/instance-context.slice";
import { setUserInputText } from "../instance-user-input/instance-user-input.slice";
import { setDisplayMode as setDisplayModeAction } from "../instance-ui-state/instance-ui-state.slice";
import { selectRequest } from "../active-requests/active-requests.selectors";
import { setInstanceStatus } from "../conversations/conversations.slice";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import type { OverlayId } from "@/features/window-panels/registry/overlay-ids";

export interface LaunchResult {
  /** The conversation id — client-generated, honored by the server end-to-end. */
  conversationId: string;
  requestId?: string;
  responseText?: string;
}

// =============================================================================
// Helpers
// =============================================================================

const INTERACTIVE_MODES: ReadonlySet<ResultDisplayMode> = new Set([
  "modal-full",
  "modal-compact",
  "sidebar",
  "flexible-panel",
  "panel",
  "chat-bubble",
]);

function isInteractive(resultDisplayMode: ResultDisplayMode): boolean {
  return INTERACTIVE_MODES.has(resultDisplayMode);
}

const DISPLAY_MODE_TO_OVERLAY_ID: Partial<
  Record<ResultDisplayMode, OverlayId>
> = {
  "modal-full": "agentFullModal",
  "modal-compact": "agentCompactModal",
  "chat-bubble": "agentChatBubble",
  inline: "agentInlineOverlay",
  sidebar: "agentSidebarOverlay",
  "flexible-panel": "agentFlexiblePanel",
  panel: "agentPanelOverlay",
  toast: "agentToastOverlay",
  "floating-chat": "agentFloatingChat",
  "chat-collapsible": "agentChatCollapsible",
  "chat-assistant": "agentChatAssistant",
};

async function pollForCompletion(
  getState: () => unknown,
  requestId: string,
  timeoutMs = 300_000,
  intervalMs = 150,
): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = getState() as RootState;
    const request = selectRequest(requestId)(state);
    if (
      request &&
      (request.status === "complete" || request.status === "error")
    ) {
      return (
        request.renderBlockOrder
          .map((id) => request.renderBlocks[id]?.content ?? "")
          .join("\n") || ""
      );
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return "";
}

// =============================================================================
// Surface value_mappings lookup
//
// Returns the most-specific `agx_agent_surface.value_mappings` JSONB for the
// given (agentId, surfaceName) and the current Redux caller scope:
//   1. user binding for the active auth user (most specific)
//   2. organization binding for the active organization (when one is set)
//   3. global binding (user_id IS NULL AND organization_id IS NULL ...)
//
// Returns `null` when no binding row matches. RLS does the heavy lifting —
// this code only picks the priority order; it cannot read someone else's
// rows even if it tried.
// =============================================================================

async function fetchSurfaceValueMappingsForLaunch(
  agentId: string,
  surfaceName: string,
  state: RootState,
): Promise<ValueMappingMap | null> {
  const supabase = createBrowserSupabase();
  const userId = state.userAuth?.id ?? null;
  // Active org id, when the user has one selected. Read defensively — slice
  // shape varies across feature flags. `organizationId` is the canonical key
  // on most slices that expose it.
  const orgState = (
    state as unknown as {
      organizations?: { activeOrganizationId?: string | null };
    }
  ).organizations;
  const orgId = orgState?.activeOrganizationId ?? null;

  // One query returns every row visible under RLS; pick the best match in JS
  // to avoid a chain of conditional queries.
  const { data, error } = await supabase
    .from("agx_agent_surface")
    .select("user_id, organization_id, project_id, task_id, value_mappings")
    .eq("agent_id", agentId)
    .eq("surface_name", surfaceName);

  if (error) throw error;
  if (!data || data.length === 0) return null;

  const userRow = userId ? data.find((r) => r.user_id === userId) : undefined;
  if (userRow && isValueMappingMap(userRow.value_mappings)) {
    return userRow.value_mappings;
  }

  const orgRow = orgId
    ? data.find((r) => r.organization_id === orgId)
    : undefined;
  if (orgRow && isValueMappingMap(orgRow.value_mappings)) {
    return orgRow.value_mappings;
  }

  const globalRow = data.find(
    (r) =>
      r.user_id === null &&
      r.organization_id === null &&
      r.project_id === null &&
      r.task_id === null,
  );
  if (globalRow && isValueMappingMap(globalRow.value_mappings)) {
    return globalRow.value_mappings;
  }

  return null;
}

// =============================================================================
// Orchestrator Thunk
// =============================================================================

export const launchAgentExecution = createAsyncThunk<
  LaunchResult,
  ManagedAgentOptions
>("instances/launch", async (options, { dispatch, getState }) => {
  const {
    agentId,
    shortcutId,
    manual,
    sourceFeature,
    showAutoClearToggle,
    autoClearConversation,
    apiEndpointMode = "agent",
    jsonExtraction,
    isEphemeral,
    runtime,
    config,
    onConversationCreated,
  } = options;

  // ── Read all config/runtime values from the nested bundles ────────────────
  //
  // CRITICAL: do NOT default boolean/scalar fields to concrete values here.
  // Down in createInstanceFromShortcut every field does
  //   `autoRun ?? shortcut.autoRun`
  // to let the shortcut's persisted config win when the caller didn't
  // override. A default like `autoRun = false` would replace "caller did
  // not specify" with a concrete `false`, and `false ?? shortcut.autoRun`
  // resolves to `false` (?? only falls through on null/undefined). Leave
  // these undefined on purpose so the shortcut's own value survives.
  const applicationScope = runtime?.applicationScope;
  const userInput = runtime?.userInput;
  const originalText = runtime?.originalText;
  const widgetHandleId = runtime?.widgetHandleId;
  const variables = runtime?.variables;
  const surfaceName = runtime?.surfaceName;

  const displayModeOverride = config?.displayMode;
  const autoRun = config?.autoRun;
  const allowChat = config?.allowChat;
  const showVariablePanel = config?.showVariablePanel;
  const showDefinitionMessages = config?.showDefinitionMessages;
  const showDefinitionMessageContent = config?.showDefinitionMessageContent;
  const showPreExecutionGate = config?.showPreExecutionGate;
  const preExecutionMessage = config?.preExecutionMessage;
  const bypassGateSeconds = config?.bypassGateSeconds;
  const hideReasoning = config?.hideReasoning;
  const hideToolResults = config?.hideToolResults;
  const responseDensity = config?.responseDensity;
  const variablesPanelStyle = config?.variablesPanelStyle;

  // ── Trace: launch envelope ────────────────────────────────────────────────
  // One line summarizing what the caller actually sent, then a structured
  // view of the live runtime/scope so "variable didn't map" bugs surface
  // immediately in the console.
  // if (typeof window !== "undefined") {
  //   console.groupCollapsed(
  //     `%c[Shortcut] launchAgentExecution ${shortcutId ? `shortcut=${shortcutId}` : agentId ? `agent=${agentId}` : "manual"}`,
  //     "color:#6366f1;font-weight:bold",
  //   );
  //   console.log("source:", sourceFeature ?? "(unset)");
  //   console.log(
  //     "applicationScope (keys):",
  //     applicationScope ? Object.keys(applicationScope) : "(none)",
  //   );
  //   if (applicationScope) {
  //     for (const [k, v] of Object.entries(applicationScope)) {
  //       const preview =
  //         typeof v === "string"
  //           ? `"${v.slice(0, 80)}"${v.length > 80 ? "…" : ""} (${v.length} chars)`
  //           : v && typeof v === "object"
  //             ? `<${Array.isArray(v) ? "array" : "object"} ${Object.keys(v as object).length} keys>`
  //             : String(v);
  //       console.log(`  ${k} →`, preview);
  //     }
  //   }
  //   console.log(
  //     "userInput:",
  //     userInput ? `"${userInput.slice(0, 80)}"${userInput.length > 80 ? "…" : ""}` : "(none)",
  //   );
  //   console.log(
  //     "caller config override:",
  //     config ? Object.keys(config) : "(none)",
  //   );
  //   console.log("apiEndpointMode:", apiEndpointMode);
  //   console.groupEnd();
  // }

  // =========================================================================
  // Step 0: Resolve visibility.
  //
  // Widget handle: the caller passes `widgetHandleId` (returned by
  // `useWidgetHandle` at the widget). The submit-body assembler reads the
  // handle live per-turn via `callbackManager.get` to derive `client_tools`;
  // `process-stream.ts` fires `handle.onComplete` / `handle.onError` at
  // stream end. Nothing to register or wrap here.
  // =========================================================================

  const resolvedShowVariablePanel = showVariablePanel;
  const resolvedShowDefinitionMessages = showDefinitionMessages;
  const resolvedShowDefinitionMessageContent = showDefinitionMessageContent;

  let conversationId: string;
  let resolvedDisplayMode: ResultDisplayMode = displayModeOverride ?? "direct";

  // =========================================================================
  // Step 0.5: Ensure the agent's execution payload is in Redux — but only
  // for the DIRECT-AGENT path. Shortcuts are self-sufficient: they carry
  // their own variableDefinitions + contextSlots pinned to the frozen
  // version, and `createInstanceFromShortcut` reads them off the shortcut
  // record. Calling an agent fetch on the shortcut path would risk loading
  // the WRONG (current) version of the agent.
  // =========================================================================
  if (agentId && !shortcutId) {
    const preState = getState() as RootState;
    const payload = selectAgentExecutionPayload(preState, agentId);
    if (!payload.isReady) {
      await dispatch(fetchAgentExecutionMinimal(agentId)).unwrap();
    }
  }

  // =========================================================================
  // Step 1: Route by trigger type and create instance
  // =========================================================================

  if (shortcutId) {
    // Guarantee the shortcut is in Redux before we try to use it. This is
    // a no-op when the unified menu already loaded it; otherwise it kicks
    // off a single-flight menu fetch and re-checks. Only a truly missing
    // shortcut (stale id, inactive, no access) reaches the throw below.
    await dispatch(ensureShortcutLoaded(shortcutId)).unwrap();

    const state = getState() as RootState;
    const shortcut = getShortcutRecordFromState(state, shortcutId);

    if (!shortcut) {
      throw new Error(`Shortcut ${shortcutId} not found in Redux`);
    }

    resolvedDisplayMode =
      displayModeOverride ??
      (shortcut.displayMode as ResultDisplayMode) ??
      "direct";

    // jsonExtraction precedence: caller-supplied (rare; back-compat for
    // pre-DB-column callers) wins, otherwise the persisted shortcut row's
    // value. Once every legacy caller stops passing this explicitly, the
    // first leg of the ?? becomes dead code and we can drop it.
    const resolvedJsonExtraction =
      jsonExtraction ?? shortcut.jsonExtraction ?? undefined;

    conversationId = await dispatch(
      createInstanceFromShortcut({
        shortcutId,
        uiScopes: applicationScope ?? {},
        sourceFeature,
        displayMode: resolvedDisplayMode,
        autoRun,
        allowChat: allowChat ?? shortcut.allowChat,
        showPreExecutionGate,
        showAutoClearToggle,
        autoClearConversation,
        apiEndpointMode,
        showVariablePanel: resolvedShowVariablePanel,
        showDefinitionMessages: resolvedShowDefinitionMessages,
        showDefinitionMessageContent: resolvedShowDefinitionMessageContent,
        widgetHandleId,
        variablesPanelStyle,
        hideReasoning,
        hideToolResults,
        responseDensity,
        preExecutionMessage,
        bypassGateSeconds,
        jsonExtraction: resolvedJsonExtraction,
        originalText,
      }),
    ).unwrap();

    // Fire the "instance exists" hook NOW — before the stream runs — so
    // streaming UIs can mount their Redux selectors and show feedback
    // immediately instead of waiting the full 30-60s until the Promise
    // resolves.
    onConversationCreated?.(conversationId);

    if (variables && Object.keys(variables).length > 0) {
      dispatch(setUserVariableValues({ conversationId, values: variables }));
    }

    const shortcutLlmOverrides = config?.llmOverrides;
    if (shortcutLlmOverrides && Object.keys(shortcutLlmOverrides).length > 0) {
      const { setOverrides } =
        await import("../instance-model-overrides/instance-model-overrides.slice");
      dispatch(setOverrides({ conversationId, changes: shortcutLlmOverrides }));
    }
  } else if (agentId) {
    conversationId = await dispatch(
      createManualInstance({
        agentId,
        sourceFeature,
        autoClearConversation,
        showAutoClearToggle,
        apiEndpointMode,
        displayMode: resolvedDisplayMode,
        autoRun,
        allowChat,
        showPreExecutionGate,
        showVariablePanel: resolvedShowVariablePanel,
        showDefinitionMessages: resolvedShowDefinitionMessages,
        showDefinitionMessageContent: resolvedShowDefinitionMessageContent,
        widgetHandleId,
        variablesPanelStyle,
        hideReasoning,
        hideToolResults,
        responseDensity,
        preExecutionMessage,
        jsonExtraction,
        originalText,
        ...(isEphemeral !== undefined ? { isEphemeral } : {}),
      }),
    ).unwrap();

    onConversationCreated?.(conversationId);

    if (applicationScope) {
      const agState = getState() as RootState;
      const agent = agState.agentDefinition.agents?.[agentId];
      if (agent) {
        // When the caller passed `surfaceName`, look up the most-specific
        // `agx_agent_surface` binding for (agentId, surfaceName, caller scope)
        // and apply its `value_mappings` JSONB. The legacy auto-name-match
        // still runs as a fallback for keys the binding didn't address.
        let surfaceValueMappings: ValueMappingMap | null = null;
        if (surfaceName) {
          try {
            surfaceValueMappings = await fetchSurfaceValueMappingsForLaunch(
              agentId,
              surfaceName,
              agState,
            );
          } catch (err) {
            console.warn(
              "[launchAgentExecution] surface value_mappings lookup failed; falling back to legacy resolver",
              err,
            );
          }
        }

        if (
          surfaceValueMappings &&
          Object.keys(surfaceValueMappings).length > 0
        ) {
          const result = mapScopeToInstanceWithSurface(
            applicationScope,
            null,
            surfaceValueMappings,
            agent.variableDefinitions ?? [],
            agent.contextSlots ?? [],
          );
          if (result.errors.length > 0) {
            console.error(
              "[launchAgentExecution] surface mapping errors:",
              result.errors,
            );
            // Phase 1: surface the errors via console; user-facing remediation
            // (pre-launch dialog for `prompt_user`, blocking on `required`)
            // lands in Phase 2 alongside the mapping editor.
          }
          if (result.warnings.length > 0) {
            console.warn(
              "[launchAgentExecution] surface mapping warnings:",
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
              setContextEntries({
                conversationId,
                entries: result.contextEntries,
              }),
            );
          }
          if (result.pendingPrompts.length > 0) {
            console.info(
              "[launchAgentExecution] pendingPrompts deferred to Phase 2 UI:",
              result.pendingPrompts.map((p) => p.targetName),
            );
          }
        } else {
          const { variableValues, contextEntries } = mapScopeToInstance(
            applicationScope,
            null,
            agent.variableDefinitions ?? [],
            agent.contextSlots ?? [],
          );
          if (Object.keys(variableValues).length > 0) {
            dispatch(
              setUserVariableValues({ conversationId, values: variableValues }),
            );
          }
          if (contextEntries.length > 0) {
            dispatch(
              setContextEntries({ conversationId, entries: contextEntries }),
            );
          }
        }
      }
    }

    if (variables && Object.keys(variables).length > 0) {
      dispatch(setUserVariableValues({ conversationId, values: variables }));
    }

    const llmOverrides = config?.llmOverrides;
    if (llmOverrides && Object.keys(llmOverrides).length > 0) {
      const { setOverrides } =
        await import("../instance-model-overrides/instance-model-overrides.slice");
      dispatch(setOverrides({ conversationId, changes: llmOverrides }));
    }

    if (displayModeOverride) {
      dispatch(
        setDisplayModeAction({
          conversationId,
          displayMode: resolvedDisplayMode,
        }),
      );
    }
  } else {
    conversationId = await dispatch(
      createManualInstanceNoAgent({
        label: manual?.label,
        baseSettings: manual?.baseSettings,
        sourceFeature,
        widgetHandleId,
      }),
    ).unwrap();

    onConversationCreated?.(conversationId);

    if (variables && Object.keys(variables).length > 0) {
      dispatch(setUserVariableValues({ conversationId, values: variables }));
    }

    if (displayModeOverride) {
      dispatch(
        setDisplayModeAction({
          conversationId,
          displayMode: resolvedDisplayMode,
        }),
      );
    }
  }

  // =========================================================================
  // Step 1b: Promote status to ready for overlay-managed modes
  // =========================================================================

  if (
    resolvedDisplayMode !== "direct" &&
    resolvedDisplayMode !== "background"
  ) {
    dispatch(setInstanceStatus({ conversationId, status: "ready" }));
  }

  // =========================================================================
  // Step 2: Set user input if provided
  // =========================================================================

  if (userInput) {
    dispatch(setUserInputText({ conversationId, text: userInput }));
  }

  // =========================================================================
  // Step 3: Open the gate window if pre-execution input is required.
  //
  // The gate is opened here (not in a component) to avoid a chicken-and-egg
  // problem: the real overlay widgets only mount after their overlay is open,
  // so they can't be responsible for opening the gate.
  //
  // The gate blocks thunk execution only — the real overlay still opens so
  // the component is always ready to render once the user continues.
  //
  // NOTE: createInstanceFromShortcut has already merged caller overrides
  // with the shortcut's own config into instance-ui-state. Read back from
  // there as the source of truth so a shortcut that sets showPreExecutionGate
  // doesn't get ignored just because the caller didn't re-specify it.
  // =========================================================================

  const seededUiState = (getState() as RootState).instanceUIState
    .byConversationId[conversationId];
  const effectiveShowPreExecutionGate =
    showPreExecutionGate ?? seededUiState?.showPreExecutionGate ?? false;
  const effectiveAutoRun = autoRun ?? seededUiState?.autoRun ?? false;

  if (effectiveShowPreExecutionGate) {
    const downstreamOverlayId = DISPLAY_MODE_TO_OVERLAY_ID[resolvedDisplayMode];
    dispatch(
      openOverlay({
        overlayId: "agentGateWindow",
        instanceId: `gate-${conversationId}`,
        data: {
          conversationId,
          downstreamOverlayId,
        },
      }),
    );
    return { conversationId };
  }

  // =========================================================================
  // Step 4: Open the overlay for the resolved display Mode.
  // Always runs (regardless of autoRun) so the component renders immediately.
  // =========================================================================

  const overlayId = DISPLAY_MODE_TO_OVERLAY_ID[resolvedDisplayMode];
  if (overlayId) {
    dispatch(
      openOverlay({
        overlayId,
        instanceId: conversationId,
        data: { conversationId: conversationId },
      }),
    );
  }

  // =========================================================================
  // Step 5: autoRun=false — component is open, user triggers execution manually.
  // Uses the resolved autoRun (caller override → instance-ui-state →
  // hard default false) so shortcut-level `autoRun: true` actually fires.
  // =========================================================================

  if (!effectiveAutoRun) {
    if (typeof window !== "undefined") {
      // console.log(
      //   "%c[Shortcut]%c autoRun=false — waiting for user to trigger execution (conversationId=%s)",
      //   "color:#6366f1;font-weight:bold",
      //   "color:inherit",
      //   conversationId,
      // );
    }
    return { conversationId };
  }

  if (
    resolvedDisplayMode === "direct" ||
    resolvedDisplayMode === "background" ||
    resolvedDisplayMode === "inline"
  ) {
    const result = await dispatch(executeInstance({ conversationId })).unwrap();

    const responseText = await pollForCompletion(getState, result.requestId);

    // Note: widget handle's onComplete is fired from process-stream.ts at
    // stream-end, not here — so it also fires for non-direct/non-background
    // modes (sidebar, panel, modal-full, etc.) which previously missed it.
    return {
      conversationId,
      requestId: result.requestId,
      responseText,
    };
  }

  if (isInteractive(resolvedDisplayMode) || resolvedDisplayMode === "toast") {
    const result = await dispatch(executeInstance({ conversationId })).unwrap();

    return {
      conversationId,
      requestId: result.requestId,
    };
  }

  return { conversationId };
});
