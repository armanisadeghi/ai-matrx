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
import { toast } from "sonner";
import type { ValueMapping, ValueMappingMap } from "@/features/surfaces/types";
import { fetchSurfaceBindingLayers } from "@/features/surfaces/services/agent-surface-bindings.service";
import {
  mergeValueMappingLayers,
  type MappingLayer,
  type MergedValueMappings,
} from "@/features/surfaces/utils/merge-value-mappings";
import { resolveShortcutMappings } from "@/features/agent-shortcuts/utils/resolveShortcutMappings";
import { withBaselineScope } from "@/features/surfaces/utils/baseline-scope";
import {
  promptForValues,
  type ValuePromptField,
} from "@/components/dialogs/value-prompts/ValuePromptsDialogHost";
import { fetchAgentExecutionFull } from "@/features/agents/redux/agent-definition/thunks";
import { selectAgentCustomExecutionPayload } from "@/features/agents/redux/agent-definition/selectors";
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
import { resolveAgentRuntime } from "@/features/agents/runtime/runtime-resolver";
import { launchRealtimeSession } from "@/features/agents/runtime/realtime/launchRealtimeSession.thunk";
import { isRealtimeRuntime } from "@/features/agents/runtime/pickRuntime";

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
// Surface value_mappings — layered launch resolution
//
// Layers, weakest → strongest (later wins PER KEY):
//   1. agx_agent_surface global binding
//   2. agx_agent_surface org bindings — by MEMBERSHIP: RLS only returns
//      member-org rows, so every visible org row applies. There is no
//      "active org" filter (the old read targeted a field the organizations
//      slice never defined, so the org tier could never fire).
//   3. agx_agent_surface user binding
//   4. the shortcut's own mappings (value_mappings layered over the promoted
//      legacy scope_mappings / context_mappings) — the most specific intent.
//
// `prepareLaunchMappings` then makes the merged map runnable:
//   - required surface_value entries missing from the live scope ABORT the
//     launch loudly (toast + throw) before any instance is created;
//   - prompt_user entries drain through the global value-prompts dialog
//     (interactive modes) or hard-error/skip (direct & background);
//   - inert layers (present but fully shadowed) console.warn with full
//     provenance, so a misconfigured binding is never silent.
// =============================================================================

interface ShortcutMappingSource {
  valueMappings: ValueMappingMap | null;
  scopeMappings: Record<string, string> | null;
  contextMappings: Record<string, string> | null;
}

async function resolveLaunchMappingLayers(
  agentId: string,
  surfaceName: string | undefined,
  shortcut: ShortcutMappingSource | null,
): Promise<MergedValueMappings | null> {
  const layers: MappingLayer[] = [];
  if (surfaceName) {
    layers.push(...(await fetchSurfaceBindingLayers(agentId, surfaceName)));
  }
  if (shortcut) {
    const shortcutMappings = resolveShortcutMappings(shortcut);
    if (Object.keys(shortcutMappings).length > 0) {
      layers.push({ name: "shortcut", mappings: shortcutMappings });
    }
  }
  if (layers.length === 0) return null;

  const result = mergeValueMappingLayers(layers);
  if (Object.keys(result.merged).length === 0) return null;

  for (const inert of result.inertLayers) {
    console.warn(
      `[surfaces] mapping layer "${inert}" for (agent=${agentId}, surface=${surfaceName ?? "none"}) exists but contributed no keys — fully shadowed by more specific layers`,
      { provenance: result.provenance },
    );
  }
  return result;
}

async function prepareLaunchMappings(args: {
  merged: ValueMappingMap;
  applicationScope: Record<string, unknown>;
  /** False for direct/background — no UI may interrupt those launches. */
  interactive: boolean;
  /** Dialog title — the shortcut/agent label. */
  title: string;
}): Promise<ValueMappingMap> {
  const { merged, applicationScope, interactive, title } = args;

  // Required surface_value pre-check — abort BEFORE creating the instance.
  const missingRequired: string[] = [];
  for (const [key, mapping] of Object.entries(merged)) {
    if (
      mapping.mapType === "surface_value" &&
      mapping.required &&
      applicationScope[mapping.target] === undefined
    ) {
      missingRequired.push(`"${key}" needs surface value "${mapping.target}"`);
    }
  }
  if (missingRequired.length > 0) {
    const message = `Cannot run "${title}" — required values are missing from this page: ${missingRequired.join("; ")}`;
    toast.error(message);
    throw new Error(message);
  }

  const promptEntries = Object.entries(merged).filter(
    (
      entry,
    ): entry is [string, Extract<ValueMapping, { mapType: "prompt_user" }>] =>
      entry[1].mapType === "prompt_user",
  );
  if (promptEntries.length === 0) return merged;

  const out: ValueMappingMap = { ...merged };

  if (!interactive) {
    const requiredNames = promptEntries
      .filter(([, m]) => m.required)
      .map(([k]) => `"${k}"`);
    if (requiredNames.length > 0) {
      const message = `Cannot run "${title}" in the background — required input(s) ${requiredNames.join(", ")} must be entered by a user. Use an interactive display mode.`;
      toast.error(message);
      throw new Error(message);
    }
    for (const [key] of promptEntries) {
      console.warn(
        `[surfaces] optional prompt_user mapping "${key}" skipped — non-interactive display mode`,
      );
      delete out[key];
    }
    return out;
  }

  const fields: ValuePromptField[] = promptEntries.map(([name, m]) => ({
    name,
    prompt: m.prompt,
    defaultValue: m.defaultValue,
    required: m.required,
  }));
  const answers = await promptForValues({ title, fields });
  if (answers === null) {
    // Cancel is only offered when nothing is required — drop the optional keys.
    for (const [key] of promptEntries) delete out[key];
    return out;
  }
  for (const [key] of promptEntries) {
    out[key] = { mapType: "direct_value", target: answers[key] ?? "" };
  }
  return out;
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
    conversationId: providedConversationId,
    surfaceKey,
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
  // Surface launches ALWAYS carry the generic baseline values (selection,
  // text_before, text_after, content, context), empty-floored when the surface
  // didn't emit them, so an agent variable bound to a generic value never
  // silently resolves to nothing (the v2 regression that left ~14 surfaces
  // without text_before/text_after). A context-free launch — no scope AND no
  // surface — is left untouched so we don't fabricate a surface where there is
  // none. See features/surfaces/utils/baseline-scope.ts.
  const surfaceName = runtime?.surfaceName;
  const applicationScope =
    runtime?.applicationScope !== undefined || surfaceName
      ? withBaselineScope(runtime?.applicationScope)
      : undefined;
  const userInput = runtime?.userInput;
  const originalText = runtime?.originalText;
  const widgetHandleId = runtime?.widgetHandleId;
  const variables = runtime?.variables;

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
  // Step 0.5: Ensure the agent's FULL execution payload is in Redux — but
  // only for the DIRECT-AGENT path. Shortcuts are self-sufficient: they carry
  // their own variableDefinitions + contextSlots pinned to the frozen
  // version, and `createInstanceFromShortcut` reads them off the shortcut
  // record. Calling an agent fetch on the shortcut path would risk loading
  // the WRONG (current) version of the agent.
  //
  // Full (not minimal) is required here: `createManualInstance` immediately
  // snapshots `baseSettings` from agent.settings + agent.modelId
  // (buildInstanceBaseSettings). The minimal payload carries neither, so a
  // cold launch (e.g. /chat/new with no prior agent fetch) would seed an
  // instance whose base model is empty — breaking the model picker and the
  // override delta guard. See base-settings.ts for the invariant.
  // =========================================================================
  if (agentId && !shortcutId) {
    const preState = getState() as RootState;
    const payload = selectAgentCustomExecutionPayload(preState, agentId);
    if (!payload.isReady) {
      await dispatch(fetchAgentExecutionFull(agentId)).unwrap();
    }
  }

  // =========================================================================
  // Step 0.6: Runtime selection — pick the transport (python-stream by
  // default, browser-realtime for voice / realtime models on
  // realtime-capable surfaces). If the model declares
  // `interaction: "realtime"` AND the surface is `browser-realtime`,
  // hand off to `launchRealtimeSession` and skip the regular instance
  // creation + executeInstance path entirely.
  //
  // Inert by default — `ui_surface.execution_mode` defaults to
  // `python-stream` for every existing surface row, so today this path
  // never fires. The voice migration (Step 4) is what flips the
  // `/chat/voice` surface to `browser-realtime`.
  // =========================================================================
  if (agentId) {
    const runtimeResult = await resolveAgentRuntime(
      () => getState() as RootState,
      { agentId, surfaceName },
    );
    if ("error" in runtimeResult) {
      throw new Error(runtimeResult.error);
    }
    if (isRealtimeRuntime(runtimeResult.runtime)) {
      if (!surfaceName) {
        throw new Error(
          "Realtime agents must be launched from a surface with a name.",
        );
      }
      await dispatch(
        launchRealtimeSession({ agentId, surfaceName }),
      ).unwrap();
      // The realtime path mounts the session on the voice surface
      // rather than creating a cx_conversation here. Return a marker
      // conversationId so the caller's contract (a string) is honored;
      // callers that need real ids on the realtime path will key off
      // the surface's own slice in Step 4.
      return { conversationId: "" };
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

    // ── Surface mapping resolution for shortcuts ────────────────────────
    // Layered per-key merge: agx_agent_surface bindings (global → org-by-
    // membership → user) under the shortcut's own mappings (value_mappings
    // over promoted legacy scopeMappings/contextMappings). The merged map
    // is applied via `mapScopeToInstanceWithSurface` inside
    // `createInstanceFromShortcut`; when no layer exists anywhere, the
    // legacy `mapScopeToInstance` path runs unchanged. Required-missing and
    // prompt_user handling happen HERE, before the instance exists.
    let shortcutSurfaceMappings: ValueMappingMap | null = null;
    if (shortcut.agentId) {
      let resolvedLayers: MergedValueMappings | null = null;
      try {
        resolvedLayers = await resolveLaunchMappingLayers(
          shortcut.agentId,
          surfaceName,
          shortcut,
        );
      } catch (err) {
        // Binding lookup is a network read — degrade to the shortcut's own
        // mappings rather than blocking the launch, but say so.
        console.warn(
          "[launchAgentExecution] surface binding lookup failed; continuing with shortcut-only mappings",
          err,
        );
        const shortcutOnly = resolveShortcutMappings(shortcut);
        resolvedLayers =
          Object.keys(shortcutOnly).length > 0
            ? { merged: shortcutOnly, provenance: {}, inertLayers: [] }
            : null;
      }
      if (resolvedLayers) {
        // Validation/prompt failures here are intentional launch aborts.
        shortcutSurfaceMappings = await prepareLaunchMappings({
          merged: resolvedLayers.merged,
          applicationScope: (applicationScope ?? {}) as Record<
            string,
            unknown
          >,
          interactive:
            typeof window !== "undefined" &&
            resolvedDisplayMode !== "direct" &&
            resolvedDisplayMode !== "background",
          title: shortcut.label ?? "Provide values",
        });
      }
    }

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
        surfaceValueMappings: shortcutSurfaceMappings,
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
        ...(providedConversationId
          ? { conversationId: providedConversationId }
          : {}),
        ...(surfaceKey ? { surfaceKey } : {}),
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
        // When the caller passed `surfaceName`, resolve the layered
        // `agx_agent_surface` bindings (global → org-by-membership → user)
        // and apply the merged map. The legacy auto-name-match still runs
        // as a fallback for keys the bindings didn't address.
        let surfaceValueMappings: ValueMappingMap | null = null;
        if (surfaceName) {
          let resolvedLayers: MergedValueMappings | null = null;
          try {
            resolvedLayers = await resolveLaunchMappingLayers(
              agentId,
              surfaceName,
              null,
            );
          } catch (err) {
            console.warn(
              "[launchAgentExecution] surface binding lookup failed; falling back to legacy resolver",
              err,
            );
          }
          if (resolvedLayers) {
            // Validation/prompt failures are intentional launch aborts.
            surfaceValueMappings = await prepareLaunchMappings({
              merged: resolvedLayers.merged,
              applicationScope: applicationScope as Record<string, unknown>,
              interactive:
                typeof window !== "undefined" &&
                resolvedDisplayMode !== "direct" &&
                resolvedDisplayMode !== "background",
              title: agent.name ?? "Provide values",
            });
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
            // Backstop only — required-missing is pre-checked in
            // prepareLaunchMappings before the instance exists. If this
            // fires, the resolver and the pre-check have diverged.
            toast.error(result.errors.join("\n"));
            console.error(
              "[launchAgentExecution] surface mapping errors (post-precheck — investigate):",
              result.errors,
            );
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
            // Should be empty — prompts were drained into direct_value
            // entries by prepareLaunchMappings. Loud if not.
            console.warn(
              "[launchAgentExecution] pendingPrompts survived the pre-launch drain — investigate:",
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
