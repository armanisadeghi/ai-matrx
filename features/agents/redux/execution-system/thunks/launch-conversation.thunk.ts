/**
 * launchConversation — unified entry point for every invocation path.
 *
 * Accepts a `ConversationInvocation` and drives the existing execution
 * machinery. Every surface — Chat, Runner, Shortcut, App, Builder — funnels
 * through this thunk. There is no other way to start an agent conversation
 * from the client.
 *
 * This thunk:
 *   1. Adapts the grouped invocation into the flat `ManagedAgentOptions`
 *      the execution thunk accepts.
 *   2. Forwards the widget handle id (and `originalText`) straight through.
 *      Capability + lifecycle semantics live on the handle — the submit
 *      assembler reads it per-turn to derive `client_tools`; process-stream
 *      fires onComplete/onError at stream end.
 *   3. Delegates to `launchAgentExecution`.
 *
 * Ephemeral routing (no DB writes) is flagged in the adapter so execute
 * thunks can branch to the stateless endpoints.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import type { ConversationInvocation } from "@/features/agents/types/conversation-invocation.types";
import type {
  ManagedAgentOptions,
  ApiEndpointMode,
} from "@/features/agents/types/instance.types";
import {
  launchAgentExecution,
  type LaunchResult,
} from "./launch-agent-execution.thunk";

// =============================================================================
// ConversationInvocation → ManagedAgentOptions adapter
// =============================================================================

/**
 * Maps the grouped `ConversationInvocation` shape onto the flat
 * `ManagedAgentOptions` shape the current execution thunk accepts. This is
 * the translation layer that lets the new contract ship without rewriting
 * every downstream consumer in one go.
 *
 * IMPORTANT: Fields that `launchAgentExecution` reads from `config?.XXX`
 * (all AgentExecutionConfig fields — displayMode, autoRun, allowChat,
 * showVariablePanel, etc.) must be placed in the `config` bundle here, NOT
 * as top-level flat fields on the result. `launchAgentExecution` destructures
 * the flat surface only for the four invocation-level flags:
 *   showAutoClearToggle, autoClearConversation, apiEndpointMode, jsonExtraction.
 * Everything else is read via `config?.field`.
 */
export function invocationToManagedOptions(
  invocation: ConversationInvocation,
): ManagedAgentOptions {
  const {
    identity,
    engine,
    routing,
    origin,
    inputs,
    scope,
    display,
    behavior,
    callbacks,
  } = invocation;

  // The WidgetHandle (capabilities + lifecycle) is stored in CallbackManager;
  // the invocation carries only its id. `launchAgentExecution` threads it
  // through to the instance; the submit assembler reads it per-turn to derive
  // `client_tools`; `process-stream.ts` fires onComplete/onError at stream
  // end by looking up the handle via `callbackManager.get`.

  const managed: ManagedAgentOptions = {
    surfaceKey: identity.surfaceKey,
    sourceFeature: origin.sourceFeature,

    // Engine resolution
    ...(engine.kind === "agent" && engine.agentId
      ? { agentId: engine.agentId }
      : {}),
    ...(engine.kind === "shortcut" && engine.shortcutId
      ? { shortcutId: engine.shortcutId, agentId: engine.agentId }
      : {}),
    ...(engine.kind === "manual" && engine.manual
      ? { manual: engine.manual }
      : {}),

    // Routing — invocation-level flags (read directly by launchAgentExecution)
    apiEndpointMode: routing.apiEndpointMode,

    // Ephemeral — stamped onto the conversation record; execute thunks
    // branch on `instance.isEphemeral` to select endpoints + store flags.
    ...(origin.isEphemeral !== undefined
      ? { isEphemeral: origin.isEphemeral }
      : {}),

    // Display-level invocation flags (read from flat surface by launchAgentExecution)
    ...(display?.showAutoClearToggle !== undefined
      ? { showAutoClearToggle: display.showAutoClearToggle }
      : {}),
    ...(display?.autoClearConversation !== undefined
      ? { autoClearConversation: display.autoClearConversation }
      : {}),

    // jsonExtraction is read from the flat surface by launchAgentExecution
    ...(behavior?.jsonExtraction !== undefined
      ? { jsonExtraction: behavior.jsonExtraction }
      : {}),

    // Runtime bundle — per-call values, never persisted
    runtime: {
      ...(scope?.applicationScope !== undefined
        ? { applicationScope: scope.applicationScope }
        : {}),
      ...(inputs?.userInput !== undefined
        ? { userInput: inputs.userInput }
        : {}),
      ...(inputs?.variables !== undefined
        ? { variables: inputs.variables }
        : {}),
      ...(callbacks?.widgetHandleId !== undefined
        ? { widgetHandleId: callbacks.widgetHandleId }
        : {}),
      ...(callbacks?.originalText !== undefined
        ? { originalText: callbacks.originalText }
        : {}),
    },

    // Config bundle — all AgentExecutionConfig fields. launchAgentExecution reads
    // these via config?.XXX, NOT from flat fields. Placing them here instead of
    // on the flat surface is what makes them take effect.
    config: {
      ...(display?.displayMode !== undefined
        ? { displayMode: display.displayMode }
        : {}),
      ...(display?.showVariablePanel !== undefined
        ? { showVariablePanel: display.showVariablePanel }
        : {}),
      ...(display?.variablesPanelStyle !== undefined
        ? { variablesPanelStyle: display.variablesPanelStyle }
        : {}),
      ...(display?.showDefinitionMessages !== undefined
        ? { showDefinitionMessages: display.showDefinitionMessages }
        : {}),
      ...(display?.showDefinitionMessageContent !== undefined
        ? { showDefinitionMessageContent: display.showDefinitionMessageContent }
        : {}),
      ...(display?.hideReasoning !== undefined
        ? { hideReasoning: display.hideReasoning }
        : {}),
      ...(display?.hideToolResults !== undefined
        ? { hideToolResults: display.hideToolResults }
        : {}),
      ...(display?.preExecutionMessage !== undefined
        ? { preExecutionMessage: display.preExecutionMessage }
        : {}),
      ...(behavior?.allowChat !== undefined
        ? { allowChat: behavior.allowChat }
        : {}),
      ...(behavior?.autoRun !== undefined ? { autoRun: behavior.autoRun } : {}),
      ...(behavior?.showPreExecutionGate !== undefined
        ? { showPreExecutionGate: behavior.showPreExecutionGate }
        : {}),
      ...(inputs?.overrides !== undefined
        ? { llmOverrides: inputs.overrides }
        : {}),
    },
  };

  return managed;
}

// =============================================================================
// Warnings for not-yet-supported invocation fields
// =============================================================================

function warnUnsupported(invocation: ConversationInvocation): void {
  if (process.env.NODE_ENV === "production") return;

  if (invocation.identity.conversationId) {
    // eslint-disable-next-line no-console
    console.warn(
      "[launchConversation] identity.conversationId is passed through to the " +
        "execution thunk, but turn-2+ routing currently still goes through " +
        "executeInstance's existing `selectHasMessages` branch. " +
        "The explicit conversationId-in-invocation path lands in Phase 3.",
    );
  }

  // Ephemeral routing is wired end-to-end. The invocation's `isEphemeral`
  // flag is stamped on the ConversationRecord via `createInstance` and
  // `execute-instance` branches on `instance.isEphemeral`:
  //   Turn 1:  POST /ai/agents/{id} with `is_new:false, store:false`.
  //   Turn 2+: POST /ai/conversations/{id} with `store:false`. The server
  //            still streams the next iteration; nothing is persisted.
  // No warning needed here — the flag is honored. See
  // `features/agents/types/conversation-invocation.types.ts` for the
  // endpoint routing table.

  if (
    invocation.relation?.parentConversationId ||
    invocation.relation?.forkedFromId
  ) {
    // eslint-disable-next-line no-console
    console.warn(
      "[launchConversation] relation.* fields (parentConversationId, " +
        "forkedFromId) are accepted but not yet stamped onto the server-side " +
        "conversation record via this thunk. Set them via the conversations " +
        "slice patchConversation action or wait for the loadConversation bundle.",
    );
  }
}

// =============================================================================
// The thunk
// =============================================================================

interface ThunkApi {
  dispatch: AppDispatch;
  state: RootState;
}

/**
 * Launch a new or continuing conversation from a `ConversationInvocation`.
 *
 * Behavior:
 *   - identity.conversationId absent → new conversation, turn 1.
 *   - identity.conversationId present → continuing conversation, turn 2+.
 *   - origin.isEphemeral → (future) stateless routing; see warnUnsupported.
 *   - routing.apiEndpointMode === "manual" → Builder/prompts endpoint.
 *
 * Returns the `LaunchResult` from `launchAgentExecution`:
 *   - conversationId (authoritative id, mirrored server-side)
 *   - requestId (for live stream tracking)
 *   - responseText (resolved after stream completes)
 */
export const launchConversation = createAsyncThunk<
  LaunchResult,
  ConversationInvocation,
  ThunkApi
>("conversations/launch", async (invocation, { dispatch }) => {
  warnUnsupported(invocation);
  const managed = invocationToManagedOptions(invocation);
  const result = await dispatch(launchAgentExecution(managed)).unwrap();
  return result;
});

// =============================================================================
// Re-exports for convenience
// =============================================================================

export type { ConversationInvocation, ApiEndpointMode };
export type { LaunchResult };
