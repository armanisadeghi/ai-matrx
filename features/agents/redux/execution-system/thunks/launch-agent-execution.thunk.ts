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
import { isHeadlessDisplayMode } from "@/features/agents/utils/run-ui-utils";
import type { FeLlmParams } from "@/features/agents/types/agent-api-types";
import {
  resolveMandate,
  assertMandateVariables,
  type ResolvedMandate,
} from "@/features/agents/mandates/service";
import { mapScopeToInstanceWithSurface } from "@/features/agents/utils/scope-mapping";
import type { ApplicationScope } from "@/features/agents/types/scope.types";
import { toast } from "@/lib/toast";
import type { ValueMappingMap } from "@/features/surfaces/types";
import { withBaselineScope } from "@/features/surfaces/utils/baseline-scope";
import {
  getSurfaceRuntime,
  getSurfaceRuntimeForName,
} from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { withSurfaceDocumentEvidence } from "@/features/surfaces/utils/document-evidence";
import { fetchAgentExecutionFull } from "@/features/agents/redux/agent-definition/thunks";
import { selectAgentCustomExecutionPayload } from "@/features/agents/redux/agent-definition/selectors";
import { getShortcutRecordFromState } from "@/features/agents/redux/agent-shortcuts/selectors";
import { ensureShortcutLoaded } from "@/features/agents/redux/agent-shortcuts/thunks";
import { resolveShortcutMappings } from "@/features/agent-shortcuts/utils/resolveShortcutMappings";
import {
  createManualInstance,
  createInstanceFromShortcut,
  createManualInstanceNoAgent,
} from "./create-instance.thunk";
import { executeInstance } from "./execute-instance.thunk";
import {
  replaceSurfaceVariableValues,
  setUserVariableValues,
} from "../instance-variable-values/instance-variable-values.slice";
import {
  replaceSurfaceContextEntries,
  setContextEntries,
} from "../instance-context/instance-context.slice";
import { setUserInputText } from "../instance-user-input/instance-user-input.slice";
import { setDisplayMode as setDisplayModeAction } from "../instance-ui-state/instance-ui-state.slice";
import {
  selectRequest,
  deriveAnswerText,
} from "../active-requests/active-requests.selectors";
import {
  setInstanceStatus,
  setInstanceInitiation,
  patchConversation,
} from "../conversations/conversations.slice";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import type { OverlayId } from "@/features/window-panels/registry/overlay-ids";
import {
  isProjectCreateFlow,
  logProjectCreateAiSnapshot,
  logProjectCreateAiStage,
  warnProjectCreateAi,
} from "@/features/projects/debug/projectCreateAiDebug";
import {
  applyLaunchWritePolicies,
  prepareLaunchMappings,
  resolveLaunchMappingLayers,
  type MergedValueMappings,
} from "./surface-scope-mapping";

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
      // Derive the ANSWER text via the canonical rule — this EXCLUDES
      // `thinking`/`reasoning` blocks. A raw join over renderBlockOrder would
      // leak the model's chain-of-thought into `responseText`, which headless
      // consumers persist verbatim (e.g. the orchestrator's system prompt in
      // an Orchestra). Never hand-roll a parallel block filter here.
      return deriveAnswerText(request);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return "";
}

// =============================================================================
// Orchestrator Thunk
// =============================================================================

export const launchAgentExecution = createAsyncThunk<
  LaunchResult,
  ManagedAgentOptions,
  { state: RootState }
>("instances/launch", async (options, { dispatch, getState }) => {
  const {
    agentId: providedAgentId,
    mandateKey,
    shortcutId,
    manual,
    sourceFeature,
    showAutoClearToggle,
    autoClearConversation,
    apiEndpointMode = "agent",
    jsonExtraction,
    isEphemeral,
    callerExecutes,
    runtime,
    config,
    onConversationCreated,
    onRequestId,
    conversationId: providedConversationId,
    surfaceKey,
    organizationId,
    contextAnchor,
    initiation,
  } = options;

  // ── Mandate-first identity — resolve BOTH halves of the binding ──────────────
  // A mandate binding can swap the agent AND/OR override settings (model,
  // thinking_level, temperature …). Resolving inside the one launch funnel is
  // what makes a settings-only binding effective on this path: the resolved
  // config_overrides merge over the caller's `config.llmOverrides` (the
  // binding wins per key — same precedence as useMandateRunner) and are seeded
  // into the instance-model-overrides slice below, so every turn's request
  // carries them as `config_overrides`. Resolution is LOUD: an unresolvable
  // mandate throws here and nothing launches — never a hardcoded fallback.
  let agentId = providedAgentId;
  let mandateLlmOverrides: Partial<FeLlmParams> | null = null;
  let resolvedMandate: ResolvedMandate | null = null;
  if (mandateKey) {
    if (providedAgentId || shortcutId) {
      throw new Error(
        `launchAgentExecution: mandateKey ("${mandateKey}") is mutually exclusive with agentId/shortcutId`,
      );
    }
    const resolved = await resolveMandate(mandateKey);
    resolvedMandate = resolved;
    agentId = resolved.agentId;
    mandateLlmOverrides = resolved.configOverrides;
  }

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
  // without text_before/text_after). A context-free launch — no scope, no
  // surface, and no mounted surface runtime — is left untouched so we don't
  // fabricate a surface where there is none. See
  // features/surfaces/utils/baseline-scope.ts.
  //
  // Surface auto-adoption: a launch that carries no applicationScope adopts a
  // mounted <SurfaceRuntimeProvider> — name AND live scope together. With no
  // surfaceName the deepest provider wins; WITH one, only that surface's own
  // provider is adopted. A mounted provider is a live, DECLARED surface, so
  // this is not fabrication; the route-prefix guess (detectActiveSurface)
  // stays out of this path because a name without a mounted runtime has no
  // scope and would fabricate one. An explicit caller scope always wins, and a
  // scope-only launch (scope without name) is left exactly as the caller
  // built it.
  //
  // `runtime.surfaceName: null` is the EXPLICIT OPT-OUT: this launch IS the
  // surface's own primary conversation (the live /chat route), so adopting
  // the page's mounted provider would feed the conversation its OWN
  // transcript/identity back to itself as "surface context" — a
  // self-referential loop. Skip adoption entirely and stamp nothing.
  const surfaceOptOut = runtime?.surfaceName === null;
  let surfaceName = runtime?.surfaceName ?? undefined;
  let adoptedScope: ApplicationScope | undefined;
  if (runtime?.applicationScope === undefined && !surfaceOptOut) {
    // A caller that NAMES a surface and supplies no scope used to launch with
    // nothing but the empty baseline floor — the surface's own values (a
    // Rulebook's rules, a document's text) never reached the agent even though
    // the provider was mounted three lines up the tree. That is the same
    // failure class as disease D4: values that exist and don't arrive. Adopt
    // the LIVE provider for THAT SAME surface (never a different one — the
    // name the caller wrote is the authority).
    const mounted = surfaceName
      ? getSurfaceRuntimeForName(surfaceName)
      : getSurfaceRuntime();
    if (mounted) {
      surfaceName = mounted.surfaceName;
      try {
        adoptedScope = await mounted.getScope();
      } catch (err) {
        // Loud, non-fatal: the launch proceeds surface-named but scope-less.
        console.error(
          `[surfaces] auto-adopted runtime "${mounted.surfaceName}" threw in getScope() — launching without its scope`,
          err,
        );
      }
    }
  }
  const callerOrAdoptedScope = runtime?.applicationScope ?? adoptedScope;
  const baselineApplicationScope =
    callerOrAdoptedScope !== undefined || surfaceName
      ? withBaselineScope(callerOrAdoptedScope)
      : undefined;
  const applicationScope =
    surfaceName && baselineApplicationScope
      ? withSurfaceDocumentEvidence(surfaceName, baselineApplicationScope)
      : baselineApplicationScope;
  const userInput = runtime?.userInput;
  const originalText = runtime?.originalText;
  const widgetHandleId = runtime?.widgetHandleId;
  // Two caller channels reach the SAME injection point: `runtime.variables`
  // (per-invocation) and `config.defaultVariables` (the ad-hoc launch's twin of
  // a persisted shortcut's defaults). Only the first was ever read, so every
  // caller that used the second silently launched with NO variables at all and
  // the agent ran on its own defaults — measured 2026-08-15 on
  // /agent-apps/new, where the whole `prompt_object` (the source agent the app
  // is built from) was dropped and the generator invented an app out of the
  // ambient org context instead (FOUND_DEFECTS D152). Merge both; runtime wins.
  const configDefaultVariables = config?.defaultVariables ?? undefined;
  const variables =
    runtime?.variables || configDefaultVariables
      ? { ...(configDefaultVariables ?? {}), ...(runtime?.variables ?? {}) }
      : undefined;
  const runtimeContext = runtime?.context;

  // ── THE DOCUMENT-VARIABLE PRECONDITION (disease D4) ───────────────────────
  // A Mandate's `required_variables` bind the CALLER too, not only the bound
  // agent. Arman, 2026-08-19, after the Masterwork Conductor fetched its
  // Rulebook with a tool call on turn 1 and admitted it had skimmed it:
  // "this agent should never have even started without getting the rules in
  // place." No seed fallback — the launch REFUSES. Checked here rather than at
  // resolution time because `variables` merges two caller channels above.
  if (resolvedMandate) {
    assertMandateVariables(resolvedMandate, variables);
  }

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
  // their own variableDefinitions + contextPolicies pinned to the frozen
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
    const debugProjectCreate = isProjectCreateFlow(sourceFeature, agentId);

    if (debugProjectCreate) {
      logProjectCreateAiStage("Step 0.5 — agent execution payload pre-check", {
        agentId,
        payloadReady: payload.isReady,
        existingVariableDefinitionCount:
          payload.variableDefinitions?.length ?? 0,
      });
    }

    if (!payload.isReady) {
      if (debugProjectCreate) {
        logProjectCreateAiStage(
          "Step 0.5 — calling agx_get_execution_full (RLS-sensitive)",
          { agentId },
        );
      }
      try {
        await dispatch(fetchAgentExecutionFull(agentId)).unwrap();
      } catch (err) {
        if (debugProjectCreate) {
          warnProjectCreateAi("Step 0.5 — agx_get_execution_full FAILED", {
            agentId,
            rpc: "agx_get_execution_full",
            error: err instanceof Error ? err.message : String(err),
            hint: "System/builtin agents need agx_get_execution_full RLS or SECURITY DEFINER access. Empty variable fields usually mean this RPC returned nothing.",
          });
        }
        throw err;
      }

      const postState = getState() as RootState;
      const postPayload = selectAgentCustomExecutionPayload(postState, agentId);
      const agentError =
        postState.agentDefinition.agents?.[agentId]?._error ?? null;

      if (debugProjectCreate) {
        if (!postPayload.isReady) {
          warnProjectCreateAi(
            "Step 0.5 — RPC succeeded but execution payload still NOT ready",
            {
              agentId,
              agentError: agentError ?? "(none)",
              variableDefinitionCount:
                postPayload.variableDefinitions?.length ?? 0,
              hint: "RPC returned no row or missing fields (variable_definitions, model_id, settings, …).",
            },
          );
        } else {
          logProjectCreateAiSnapshot("Step 0.5 — agent loaded for execution", {
            agentId,
            variableDefinitionCount:
              postPayload.variableDefinitions?.length ?? 0,
            variableNames:
              postPayload.variableDefinitions?.map((v) => v.name) ?? [],
            contextPolicyCount: postPayload.contextPolicies?.length ?? 0,
            modelId: postPayload.modelId,
          });
        }
      }
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
      // access-errors: ok — browser-local Redux lookup after ensureShortcutLoaded; absence verified in the store, no claim about the record itself
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
    // Layered per-key merge: agent↔surface binding edges bindings (global → org-by-
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
        const shortcutOnlyPolicies = shortcut.writePolicies ?? {};
        resolvedLayers =
          Object.keys(shortcutOnly).length > 0 ||
          Object.keys(shortcutOnlyPolicies).length > 0
            ? {
                merged: shortcutOnly,
                provenance: {},
                inertLayers: [],
                writePolicies: shortcutOnlyPolicies,
              }
            : null;
      }
      applyLaunchWritePolicies(resolvedLayers, shortcut.agentId, surfaceName);
      if (resolvedLayers) {
        // Validation/prompt failures here are intentional launch aborts.
        shortcutSurfaceMappings = await prepareLaunchMappings({
          merged: resolvedLayers.merged,
          applicationScope: (applicationScope ?? {}) as Record<string, unknown>,
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
        ...(organizationId !== undefined ? { organizationId } : {}),
        ...(contextAnchor !== undefined ? { contextAnchor } : {}),
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
    if (runtimeContext && Object.keys(runtimeContext).length > 0) {
      // Deferred tier: these land in the request's `context` dict, not the
      // prompt — the model pulls them through its context tool on demand.
      dispatch(
        setContextEntries({
          conversationId,
          entries: Object.entries(runtimeContext).map(([key, value]) => ({
            key,
            value,
          })),
        }),
      );
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
        ...(organizationId !== undefined ? { organizationId } : {}),
        ...(contextAnchor !== undefined ? { contextAnchor } : {}),
      }),
    ).unwrap();

    onConversationCreated?.(conversationId);

    if (isProjectCreateFlow(sourceFeature, agentId)) {
      const postCreateState = getState() as RootState;
      const instanceDefs =
        postCreateState.instanceVariableValues?.byConversationId[conversationId]
          ?.definitions ?? [];
      const uiState =
        postCreateState.instanceUIState?.byConversationId[conversationId];
      logProjectCreateAiStage("createManualInstance finished", {
        conversationId,
        instanceVariableDefinitionCount: instanceDefs.length,
        variableNames: instanceDefs.map((v) => v.name),
        showVariablePanel: uiState?.showVariablePanel,
        showFreeformInput: uiState?.showFreeformInput,
        variablesPanelStyle: uiState?.variablesPanelStyle,
        callerShowVariablePanelOverride: resolvedShowVariablePanel,
      });
    }

    if (applicationScope) {
      const agState = getState() as RootState;
      const agent = agState.agentDefinition.agents?.[agentId];
      if (agent) {
        // When the caller passed `surfaceName`, resolve the layered
        // agent↔surface binding edges bindings (global → org-by-membership → user)
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
          applyLaunchWritePolicies(resolvedLayers, agentId, surfaceName);
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

        {
          const result = mapScopeToInstanceWithSurface(
            applicationScope,
            null,
            surfaceValueMappings ?? {},
            agent.variableDefinitions ?? [],
            agent.contextPolicies ?? [],
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
          dispatch(
            replaceSurfaceVariableValues({
              conversationId,
              values: result.variableValues,
            }),
          );
          dispatch(
            replaceSurfaceContextEntries({
              conversationId,
              entries: result.contextEntries,
            }),
          );
          if (result.pendingPrompts.length > 0) {
            // Should be empty — prompts were drained into direct_value
            // entries by prepareLaunchMappings. Loud if not.
            console.warn(
              "[launchAgentExecution] pendingPrompts survived the pre-launch drain — investigate:",
              result.pendingPrompts.map((p) => p.targetName),
            );
          }
        }
      }
    }

    if (variables && Object.keys(variables).length > 0) {
      dispatch(setUserVariableValues({ conversationId, values: variables }));
    }
    if (runtimeContext && Object.keys(runtimeContext).length > 0) {
      // Deferred tier: these land in the request's `context` dict, not the
      // prompt — the model pulls them through its context tool on demand.
      dispatch(
        setContextEntries({
          conversationId,
          entries: Object.entries(runtimeContext).map(([key, value]) => ({
            key,
            value,
          })),
        }),
      );
    }

    // The caller's llmOverrides are the feature's defaults; the mandate binding's
    // config_overrides (the USER's choice) win per key.
    const llmOverrides = { ...config?.llmOverrides, ...mandateLlmOverrides };
    if (Object.keys(llmOverrides).length > 0) {
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
    if (runtimeContext && Object.keys(runtimeContext).length > 0) {
      // Deferred tier: these land in the request's `context` dict, not the
      // prompt — the model pulls them through its context tool on demand.
      dispatch(
        setContextEntries({
          conversationId,
          entries: Object.entries(runtimeContext).map(([key, value]) => ({
            key,
            value,
          })),
        }),
      );
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

  // ── Provenance attestation ────────────────────────────────────────────────
  // Stamp the launch's `initiation` onto the conversation record so every send
  // this conversation makes carries it (assembleRequest reads it). Default
  // "user": launchAgentExecution is the interactive launch path; programmatic
  // schedulers / auto-triggers must declare `initiation: "auto"` themselves.
  dispatch(
    setInstanceInitiation({ conversationId, initiation: initiation ?? "user" }),
  );

  // ── Surface attribution ───────────────────────────────────────────────────
  // Stamp the surface this run LAUNCHED from onto the conversation record, so
  // `buildToolInjection` can send it as `client.surface` instead of guessing
  // from the route on every turn.
  //
  // Only an OVERLAY surface actually changes value here: its window renders on
  // top of a mapped route, so `detectActiveSurface()` reports the ROUTE
  // (`matrx-user/chat` under the Quick Save Note window) and the launch's own
  // surface had no way to win. For a normal route surface the two agree, so
  // this stamps the same name the route guess would have produced.
  //
  // Deliberately NOT stamped when the launch resolved no surface: a plain chat
  // send keeps the route-derived behavior untouched, which is what keeps
  // `matrx-user/chat`'s `surface_defaults.always_include_tools` attached to
  // chat runs.
  if (surfaceName) {
    dispatch(patchConversation({ conversationId, surfaceName }));
  }

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
  //
  // WHAT autoRun IS, because getting this wrong keeps breaking the app:
  // autoRun is a USER-INTERFACE control and NOTHING else. It answers exactly
  // one question — "does the UI stop and let the person touch anything before
  // the request goes out?" It has never had, and must never be given, any
  // authority over whether a run HAPPENS. Clicking a button that is wired to
  // an agent runs that agent, full stop; Step 4 above therefore opens the
  // component unconditionally, and this early return only defers the SEND to
  // whatever the user presses next.
  //
  // Which is why it cannot apply to a display mode that has no interface.
  // `background` renders nothing: no component, no composer, no button. There
  // is no UI to pause, nobody to offer the choice to, and nothing that could
  // ever fire the run later — so honoring `false` there does not "wait for the
  // user", it silently deletes the run and leaves a seeded conversation that
  // can never execute. A caller asking for it is describing an interface that
  // does not exist, so the run proceeds and the mistake is made LOUD instead
  // of swallowed. (Live example when this landed: image-studio's DESCRIBE
  // launch passed `{ autoRun: false, displayMode: "background" }` and never
  // ran.) Uses the resolved autoRun (caller override → instance-ui-state →
  // hard default false) so shortcut-level `autoRun: true` actually fires.
  // =========================================================================

  const isHeadlessMode = isHeadlessDisplayMode(resolvedDisplayMode);

  // Deferring the send is only meaningful when SOMETHING will send it later.
  // On a mode that paints an interface, that something is the user. On a
  // headless mode there is no user to wait for, so the only thing that can is
  // the caller — and it has to say so.
  const somethingWillSendIt = !isHeadlessMode || callerExecutes === true;

  // Only scream when someone actually ASSERTED false. Omitting a
  // user-interface flag on a mode that has no user interface is not a mistake,
  // it is the sane thing to write — the hard default is what makes it read as
  // false here, and the run proceeds either way.
  // `seededUiState.autoRun` is always a concrete boolean (instance-ui-state
  // seeds the hard default), so it cannot tell "someone chose false" from
  // "nobody said anything" — only the caller's own literal can. That is the
  // one worth scolding anyway: the scream names a CALL SITE to go fix.
  const autoRunWasAssertedFalse = autoRun === false;

  if (isHeadlessMode && autoRunWasAssertedFalse && !callerExecutes) {
    console.error(
      `[launchAgentExecution] IGNORING autoRun=false: it was passed with displayMode="${resolvedDisplayMode}" (conversationId=${conversationId}), which renders no interface. autoRun decides whether the UI pauses for the user; with no UI there is nobody to pause for and nothing that would ever start this run, so honoring it would silently throw the run away. Running it. Fix the call site: drop autoRun, or pass autoRun: true. If you genuinely intend to dispatch executeInstance yourself after seeding something the launch cannot carry, declare it with callerExecutes: true.`,
    );
  }

  if (somethingWillSendIt && !effectiveAutoRun) {
    return { conversationId };
  }

  if (
    resolvedDisplayMode === "direct" ||
    resolvedDisplayMode === "background" ||
    resolvedDisplayMode === "inline"
  ) {
    // `onRequestId` is handed to executeInstance, not called after it:
    // executeInstance stays pending for the whole stream, so awaiting it and
    // then announcing would publish the id only once the run had finished —
    // exactly the "spinner for 60s, then the whole answer at once" bug.
    const result = await dispatch(
      executeInstance({ conversationId, onRequestId }),
    ).unwrap();

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
    const result = await dispatch(
      executeInstance({ conversationId, onRequestId }),
    ).unwrap();

    return {
      conversationId,
      requestId: result.requestId,
    };
  }

  return { conversationId };
});
