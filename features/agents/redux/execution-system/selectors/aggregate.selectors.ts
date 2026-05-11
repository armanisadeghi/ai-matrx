/**
 * Cross-Cutting Selectors
 *
 * Aggregate selectors that read across multiple slices to produce derived views.
 *
 * CRITICAL: No selector here ever takes agentId as a parameter.
 * Everything needed is owned by the instance slices.
 *
 * SELECTOR RULES (enforced here):
 * - Primitives returned directly — stable by value, safe for useAppSelector.
 * - Arrays/objects from .filter()/.map() ALWAYS wrapped in createSelector.
 * - No ?? [] / ?? {} / ?? null defaults — return undefined, guard in component.
 * - Input selectors: plain state lookups only.
 * - Result functions: all filtering, mapping, and derivation.
 *
 * PATTERN: conversationId → latest request
 *   Every selector that needs the latest ActiveRequest for a conversationId
 *   uses selectLatestRequestForConversation as the shared base so the
 *   byConversationId → byRequestId two-step is never duplicated.
 */

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type { AssembledAgentStartRequest } from "@/features/agents/types/request.types";
import type {
  ActiveRequest,
  PendingToolCall,
  RequestStatus,
  ToolLifecycleEntry,
  TimelineEntry,
} from "@/features/agents/types/request.types";
import type {
  Phase,
  RenderBlockPayload,
  CompletionPayload,
  ErrorPayload,
} from "@/types/python-generated/stream-events";
import type { ShortcutContext } from "@/features/agents/redux/agent-shortcuts/types";
import { selectHasMessages } from "../messages/messages.selectors";
import {
  selectAutoClearConversation,
  selectShowAutoClearToggle,
} from "../instance-ui-state/instance-ui-state.selectors";
import { assembleRequest } from "../thunks/execute-instance.thunk";

// =============================================================================
// Base Primitive — the shared bridge from conversationId → ActiveRequest
// =============================================================================

/**
 * The latest ActiveRequest record for a conversationId.
 * Plain selector — returns the object reference directly from the store.
 * Object ref is stable until the request itself is mutated, making this
 * safe as an input selector in createSelector chains.
 *
 * All conversationId-scoped request selectors chain from this one.
 */
export const selectLatestRequestForConversation =
  (conversationId: string) =>
  (state: RootState): ActiveRequest | undefined => {
    const ids = state.activeRequests?.byConversationId[conversationId];
    if (!ids || ids.length === 0) return undefined;
    return state.activeRequests?.byRequestId[ids[ids.length - 1]];
  };

// =============================================================================
// Instance Status Helpers
// =============================================================================

/** Is this conversation currently executing (in-flight or streaming)? */
export const selectIsExecuting =
  (conversationId: string) =>
  (state: RootState): boolean => {
    const status =
      state.conversations?.byConversationId[conversationId]?.status;
    return status === "running" || status === "streaming";
  };

/** Is this instance actively streaming a response? */
export const selectIsStreaming =
  (conversationId: string) =>
  (state: RootState): boolean =>
    state.conversations?.byConversationId[conversationId]?.status ===
    "streaming";

/** Is this instance paused waiting for client tool results? */
export const selectIsAwaitingTools =
  (conversationId: string) =>
  (state: RootState): boolean =>
    state.conversations?.byConversationId[conversationId]?.status === "paused";

/**
 * True only when auto-clear is enabled and this conversation has at least one
 * history turn. If auto-clear is off, returns false without reading history.
 */
export const selectAutoClearWithConversationHistory =
  (conversationId: string) =>
  (state: RootState): boolean => {
    if (!selectAutoClearConversation(conversationId)(state)) return false;
    return selectHasMessages(conversationId)(state);
  };

/**
 * Surfaces that opt in via `showAutoClearToggle: true` want the icon
 * visible from the first turn — including before any messages exist — so
 * the engineer can flip the mode BEFORE submitting. The earlier
 * `hasMessages` gate hid the icon until a response had streamed in,
 * which made the Agent Builder's "always-on" intent unreachable.
 *
 * Visibility is now driven purely by the instance-level flag, which the
 * route / surface explicitly sets at instance creation
 * (see AgentBuilderRightPanel for the canonical Builder wiring).
 */
export const selectShouldShowAutoClearToggle =
  (conversationId: string) =>
  (state: RootState): boolean =>
    selectShowAutoClearToggle(conversationId)(state);

// =============================================================================
// Derived Request Selectors (conversationId → latest request data)
// =============================================================================

/**
 * The accumulated response text for the latest request on this instance.
 * Derives from render blocks (single source of truth).
 * Memoized — stable reference until render block content changes.
 */
export const selectLatestAccumulatedText = (conversationId: string) =>
  createSelector(
    (state: RootState) =>
      state.activeRequests?.byConversationId[conversationId],
    (state: RootState) => state.activeRequests?.byRequestId,
    (requestIds, byRequestId): string => {
      if (!requestIds || requestIds.length === 0) return "";
      const latest = byRequestId[requestIds[requestIds.length - 1]];
      if (!latest) return "";
      const { renderBlockOrder, renderBlocks } = latest;
      if (!renderBlockOrder || renderBlockOrder.length === 0) return "";
      return renderBlockOrder
        .map((id) => renderBlocks[id]?.content ?? "")
        .filter(Boolean)
        .join("\n");
    },
  );

/**
 * Returns the conversationId once the server has confirmed it exists in the
 * database (cx_conversation row reserved via the stream's record_reserved
 * event, OR loaded from a previous session).
 *
 * The id is always the client-generated UUID — the server honors it. This
 * selector's job is to gate consumers (URL navigation, sidebar highlighting,
 * conversation list sync) until the row exists in the DB so dependent
 * fetches don't race the first write.
 *
 * For routing decisions inside execution thunks, use
 * `selectHasMessages` instead — the agents/{id} vs conversations/{id}
 * choice depends on whether prior turns exist, not on server confirmation.
 */
export const selectLatestConversationId =
  (conversationId: string) =>
  (state: RootState): string | null => {
    const instance = state.conversations?.byConversationId[conversationId];
    if (!instance) return null;
    if (instance.cacheOnly) return null;
    return conversationId;
  };

/** The current apiEndpointMode for this instance (agent | manual). */
export const selectApiEndpointMode =
  (conversationId: string) => (state: RootState) =>
    state.messages?.byConversationId[conversationId]?.apiEndpointMode ??
    "agent";

/**
 * The requestId for the most recent request on this instance.
 * A primitive — safe to use directly with useAppSelector.
 * Returns undefined so components can guard with `if (!requestId)`.
 */
export const selectLatestRequestId =
  (conversationId: string) =>
  (state: RootState): string | undefined => {
    const ids = state.activeRequests?.byConversationId[conversationId];
    return ids && ids.length > 0 ? ids[ids.length - 1] : undefined;
  };

/**
 * The RequestStatus of the most recent request on this instance.
 * A primitive — safe to use directly with useAppSelector.
 * Returns undefined when no request exists yet.
 */
export const selectLatestRequestStatus =
  (conversationId: string) =>
  (state: RootState): RequestStatus | undefined => {
    const ids = state.activeRequests?.byConversationId[conversationId];
    if (!ids || ids.length === 0) return undefined;
    return state.activeRequests?.byRequestId[ids[ids.length - 1]]?.status;
  };

/**
 * Is the instance in the "connecting" sub-state?
 * True from HTTP send until the first chunk or error arrives.
 */
export const selectIsConnecting =
  (conversationId: string) =>
  (state: RootState): boolean => {
    const ids = state.activeRequests?.byConversationId[conversationId];
    if (!ids || ids.length === 0) return false;
    return (
      state.activeRequests?.byRequestId[ids[ids.length - 1]]?.status ===
      "connecting"
    );
  };

/**
 * Is the instance in the pre-first-token waiting phase?
 * True from submit until the first chunk arrives (status: "running" or "connecting").
 */
export const selectIsWaitingForFirstToken =
  (conversationId: string) =>
  (state: RootState): boolean => {
    const instanceStatus =
      state.conversations?.byConversationId[conversationId]?.status;
    if (instanceStatus === "running") return true;

    const ids = state.activeRequests?.byConversationId[conversationId];
    if (!ids || ids.length === 0) return false;
    const latestStatus =
      state.activeRequests?.byRequestId[ids[ids.length - 1]]?.status;
    return latestStatus === "connecting";
  };

/**
 * When the most recent request on this instance was submitted (ISO string).
 * Returns undefined if no request exists yet.
 */
export const selectLatestRequestStartedAt =
  (conversationId: string) =>
  (state: RootState): string | undefined => {
    const ids = state.activeRequests?.byConversationId[conversationId];
    if (!ids || ids.length === 0) return undefined;
    return state.activeRequests?.byRequestId[ids[ids.length - 1]]?.startedAt;
  };

/**
 * The full backend `ErrorPayload` for the most recent request, if it failed.
 * Returns undefined when no error exists. Consumers MUST decide which of
 * `error.message` (technical) or `error.user_message` (optional human-friendly)
 * to display — we deliberately do not collapse them in the selector.
 */
export const selectLatestError =
  (conversationId: string) =>
  (state: RootState): ErrorPayload | undefined => {
    const ids = state.activeRequests?.byConversationId[conversationId];
    if (!ids || ids.length === 0) return undefined;
    return (
      state.activeRequests?.byRequestId[ids[ids.length - 1]]?.error ?? undefined
    );
  };

/**
 * Unresolved pending tool calls for the most recent request on this instance.
 *
 * Memoized — returns a stable array reference when the pending calls haven't
 * changed, preventing re-renders on every chunk arrival.
 * Returns undefined (not []) when no request exists — guard in component.
 */
export const selectPendingToolCallsForInstance = (conversationId: string) =>
  createSelector(
    (state: RootState) =>
      state.activeRequests?.byConversationId[conversationId],
    (state: RootState) => state.activeRequests?.byRequestId,
    (requestIds, byRequestId): PendingToolCall[] | undefined => {
      if (!requestIds || requestIds.length === 0) return undefined;
      const latest = byRequestId[requestIds[requestIds.length - 1]];
      if (!latest) return undefined;
      return latest.pendingToolCalls.filter((c) => !c.resolved);
    },
  );

// =============================================================================
// Send-Button Logic
// =============================================================================

/**
 * Does this instance have anything to send?
 * True if the text input is non-empty OR there are attached resources.
 */
export const selectHasAnyContent =
  (conversationId: string) =>
  (state: RootState): boolean => {
    const userInput = state.instanceUserInput?.byConversationId[conversationId];
    const hasText = (userInput?.text?.trim().length ?? 0) > 0;
    if (hasText) return true;

    const resources = state.instanceResources?.byConversationId[conversationId];
    return resources != null && Object.keys(resources).length > 0;
  };

// =============================================================================
// Instance Ready Check
// =============================================================================

/**
 * Is this instance ready to execute?
 * Checks: all resources resolved, no missing required variables.
 */
export const selectIsInstanceReady =
  (conversationId: string) =>
  (state: RootState): { ready: boolean; reasons: string[] } => {
    const reasons: string[] = [];
    const instance = state.conversations?.byConversationId[conversationId];

    if (!instance) {
      return { ready: false, reasons: ["Instance not found"] };
    }

    const resources = state.instanceResources?.byConversationId[conversationId];
    if (resources) {
      const pending = Object.values(resources).filter(
        (r) => r.status === "pending" || r.status === "resolving",
      );
      if (pending.length > 0) {
        reasons.push(`${pending.length} resource(s) still resolving`);
      }

      const errored = Object.values(resources).filter(
        (r) => r.status === "error" && !r.options.optionalContext,
      );
      if (errored.length > 0) {
        reasons.push(`${errored.length} required resource(s) failed`);
      }
    }

    const varEntry =
      state.instanceVariableValues?.byConversationId[conversationId];
    const definitions = varEntry?.definitions;
    const userValues = varEntry?.userValues;
    const scopeValues = varEntry?.scopeValues;

    if (!definitions || !userValues || !scopeValues) {
      return { ready: reasons.length === 0, reasons };
    }

    for (const def of definitions) {
      if (!def.required) continue;
      const hasValue =
        def.name in userValues ||
        def.name in scopeValues ||
        (def.defaultValue !== undefined && def.defaultValue !== null);
      if (!hasValue) {
        reasons.push(`Required variable "${def.name}" is missing`);
      }
    }

    return { ready: reasons.length === 0, reasons };
  };

// =============================================================================
// Debug / Summary
// =============================================================================

/**
 * Memoized assembled API request preview for a conversation.
 *
 * Tracks only the top-level Redux slices consulted by {@link assembleRequest}.
 * When those slice references are unchanged (Immer structural sharing), the
 * cached assembled result is returned — avoids rerenders and spurious allocations on unrelated
 * store updates.
 *
 * **IMPORTANT:** If `assembleRequest` starts reading additional slices, add those
 * inputs here so the preview stays reactive.
 *
 * Usage — stabilize selector identity with `useMemo`:
 * `useMemo(() => makeSelectAssembledRequest(conversationId), [conversationId])`.
 */
export function makeSelectAssembledRequest(conversationId: string) {
  return createSelector(
    [
      (s: RootState) => s.conversations,
      (s: RootState) => s.instanceUIState,
      (s: RootState) => s.instanceUserInput,
      (s: RootState) => s.instanceResources,
      (s: RootState) => s.instanceVariableValues,
      (s: RootState) => s.instanceModelOverrides,
      (s: RootState) => s.instanceContext,
      (s: RootState) => s.instanceClientTools,
      (s: RootState) => s.appContext,
    ],
    (
      conversations,
      instanceUIState,
      instanceUserInput,
      instanceResources,
      instanceVariableValues,
      instanceModelOverrides,
      instanceContext,
      instanceClientTools,
      appContext,
    ): AssembledAgentStartRequest | null => {
      const state = {
        conversations,
        instanceUIState,
        instanceUserInput,
        instanceResources,
        instanceVariableValues,
        instanceModelOverrides,
        instanceContext,
        instanceClientTools,
        appContext,
      } as RootState;
      return assembleRequest(state, conversationId);
    },
  );
}

/** @deprecated Use {@link makeSelectAssembledRequest}; same underlying factory (alias). */
export const selectAssembledRequest = makeSelectAssembledRequest;

/**
 * Complete summary of an instance's current state.
 * Uses only instance-owned data — agentDefinition is never read here.
 * Memoized — only recomputes when any of the input slices change.
 */
export const selectInstanceSummary = (conversationId: string) =>
  createSelector(
    (state: RootState) => state.conversations?.byConversationId[conversationId],
    (state: RootState) =>
      state.instanceModelOverrides?.byConversationId[conversationId],
    (state: RootState) =>
      state.instanceResources?.byConversationId[conversationId],
    (state: RootState) =>
      state.instanceContext?.byConversationId[conversationId],
    (state: RootState) =>
      state.instanceUserInput?.byConversationId[conversationId],
    (state: RootState) =>
      state.instanceUIState?.byConversationId[conversationId],
    (state: RootState) =>
      state.activeRequests?.byConversationId[conversationId],
    (state: RootState) => state.activeRequests?.byRequestId,
    (
      instance,
      overrides,
      resources,
      context,
      userInput,
      uiState,
      requestIds,
      byRequestId,
    ) => {
      if (!instance) return null;

      const ids = requestIds;
      const latestRequestStatus =
        ids && ids.length > 0
          ? (byRequestId[ids[ids.length - 1]]?.status ?? null)
          : null;

      return {
        conversationId,
        agentId: instance.agentId,
        origin: instance.origin,
        status: instance.status,
        overrideCount:
          Object.keys(overrides?.overrides ?? {}).length +
          (overrides?.removals.length ?? 0),
        resourceCount: Object.keys(resources ?? {}).length,
        contextCount: Object.keys(context ?? {}).length,
        hasUserInput:
          (userInput?.text?.trim().length ?? 0) > 0 ||
          (userInput?.messageParts?.length ?? 0) > 0,
        displayMode: uiState?.displayMode ?? "direct",
        requestCount: ids?.length ?? 0,
        latestRequestStatus,
      };
    },
  );

// =============================================================================
// Variable Display
// =============================================================================

/**
 * Should the variable input UI be shown for this instance right now?
 *
 * True only when ALL of the following hold:
 *   1. The instance has at least one variable definition.
 *   2. No turns have been committed yet (first message not sent).
 *   3. The instance is not currently executing (mid-stream = too late).
 */
export const selectShouldShowVariables =
  (conversationId: string) =>
  (state: RootState): boolean => {
    const definitions =
      state.instanceVariableValues?.byConversationId[conversationId]
        ?.definitions;
    if (!definitions || definitions.length === 0) return false;

    const orderedIds =
      state.messages?.byConversationId[conversationId]?.orderedIds;
    if (orderedIds && orderedIds.length > 0) return false;

    const status =
      state.conversations?.byConversationId[conversationId]?.status;
    if (status === "running" || status === "streaming") return false;

    return true;
  };

// =============================================================================
// Conversation → Instance Lookup
// =============================================================================

/**
 * Check if a conversationId exists in the execution system.
 * Returns the conversationId if found, or null.
 *
 * With client-generated conversationIds honored end-to-end, the slice key IS
 * the canonical id — no secondary lookup through active requests is needed.
 */
export const selectConversationExists =
  (conversationId: string) =>
  (state: RootState): string | null =>
    state.conversations?.byConversationId[conversationId]
      ? conversationId
      : null;

/** @deprecated Use selectConversationExists */
export const selectInstanceIdByConversationId = selectConversationExists;

// =============================================================================
// Display Mode — Cross-Slice Rendering Selectors
// =============================================================================

/**
 * Factory for a selector that returns a combined snapshot of an instance's
 * display mode and execution status together.
 *
 * Use `useMemo(makeSelectInstanceDisplaySnapshot, [])` in a component so each
 * instance gets its own memoized selector (createSelector cache size = 1).
 *
 * Returns undefined when the instance doesn't exist.
 */
export const makeSelectInstanceDisplaySnapshot = () =>
  createSelector(
    (state: RootState, conversationId: string) =>
      state.instanceUIState?.byConversationId[conversationId],
    (state: RootState, conversationId: string) =>
      state.conversations?.byConversationId[conversationId],
    (uiState, instance) => {
      if (!uiState || !instance) return undefined;
      return {
        displayMode: uiState.displayMode,
        isExpanded: uiState.isExpanded,
        allowChat: uiState.allowChat,
        instanceStatus: instance.status,
        agentId: instance.agentId,
        origin: instance.origin,
      } as const;
    },
  );

/**
 * All conversationIds that have an active execution grouped by their display mode.
 * Memoized — only recomputes when the instance or UI state maps change.
 * Returns undefined (not {}) when there are no active instances.
 */
export const selectActiveInstancesByDisplayMode = createSelector(
  (state: RootState) => state.conversations?.byConversationId,
  (state: RootState) => state.instanceUIState?.byConversationId,
  (executionByConversationId, uiByConversationId) => {
    type DisplayModeMap = Record<string, string[]>;
    const result: DisplayModeMap = {};
    let hasAny = false;

    for (const cid of Object.keys(executionByConversationId)) {
      const instance = executionByConversationId[cid];
      if (!instance) continue;
      const { status } = instance;
      if (
        status !== "running" &&
        status !== "streaming" &&
        status !== "paused" &&
        status !== "complete"
      )
        continue;

      const mode = uiByConversationId[cid]?.displayMode;
      if (!mode) continue;

      if (!result[mode]) result[mode] = [];
      result[mode].push(cid);
      hasAny = true;
    }

    return hasAny ? result : undefined;
  },
);

/**
 * Returns overlay-managed instances grouped by display mode.
 * "direct" and "background" are excluded — rendered by their host component.
 */
export const selectOverlayInstancesByDisplayMode = createSelector(
  (state: RootState) => state.conversations?.byConversationId,
  (state: RootState) => state.instanceUIState?.byConversationId,
  (executionByConversationId, uiByConversationId) => {
    type DisplayModeMap = Record<string, string[]>;
    const result: DisplayModeMap = {};
    let hasAny = false;

    for (const cid of Object.keys(executionByConversationId)) {
      const instance = executionByConversationId[cid];
      if (!instance) continue;

      const { status } = instance;
      if (status === "draft") continue;

      const mode = uiByConversationId[cid]?.displayMode;
      if (!mode || mode === "direct" || mode === "background") continue;

      if (!result[mode]) result[mode] = [];
      result[mode].push(cid);
      hasAny = true;
    }

    return hasAny ? result : undefined;
  },
);

/**
 * All conversationIds that should be rendered as modals right now.
 */
export const selectActiveModalInstanceIds = createSelector(
  (state: RootState) => state.conversations?.byConversationId,
  (state: RootState) => state.instanceUIState?.byConversationId,
  (executionByConversationId, uiByConversationId): string[] | undefined => {
    const ids = Object.keys(executionByConversationId).filter((id) => {
      const status = executionByConversationId[id]?.status;
      if (status === "draft" || status === undefined) return false;
      const mode = uiByConversationId[id]?.displayMode;
      return mode === "modal-full" || mode === "modal-compact";
    });
    return ids.length > 0 ? ids : undefined;
  },
);

/**
 * All conversationIds that should be rendered as persistent panels or chat bubbles.
 */
export const selectActivePanelInstanceIds = createSelector(
  (state: RootState) => state.conversations?.byConversationId,
  (state: RootState) => state.instanceUIState?.byConversationId,
  (executionByConversationId, uiByConversationId): string[] | undefined => {
    const ids = Object.keys(executionByConversationId).filter((id) => {
      const status = executionByConversationId[id]?.status;
      if (status === "draft" || status === undefined) return false;
      const mode = uiByConversationId[id]?.displayMode;
      return mode === "panel" || mode === "chat-bubble";
    });
    return ids.length > 0 ? ids : undefined;
  },
);

// =============================================================================
// Instance-Level Bridges — Phase (V2 — replaces status updates)
// =============================================================================

/**
 * The latest phase for this instance's most recent request.
 * Returns null when no phase events have arrived yet.
 */
export const selectLatestCurrentPhase =
  (conversationId: string) =>
  (state: RootState): Phase | null => {
    const ids = state.activeRequests?.byConversationId[conversationId];
    if (!ids || ids.length === 0) return null;
    return (
      state.activeRequests?.byRequestId[ids[ids.length - 1]]?.currentPhase ??
      null
    );
  };

/**
 * The latest info event's userMessage for the most recent request.
 */
export const selectLatestInfoUserMessage =
  (conversationId: string) =>
  (state: RootState): string | null => {
    const ids = state.activeRequests?.byConversationId[conversationId];
    if (!ids || ids.length === 0) return null;
    const request = state.activeRequests?.byRequestId[ids[ids.length - 1]];
    if (!request || request.infoEvents.length === 0) return null;
    return (
      request.infoEvents[request.infoEvents.length - 1]?.user_message ?? null
    );
  };

// =============================================================================
// Instance-Level Bridges — Render Blocks
// =============================================================================

/**
 * All render blocks from the latest request on this instance, in order.
 * Memoized — stable reference until a new block arrives.
 * Returns undefined when no request exists — guard in component.
 */
export const selectLatestRenderBlocks = (conversationId: string) =>
  createSelector(
    (state: RootState) =>
      state.activeRequests?.byConversationId[conversationId],
    (state: RootState) => state.activeRequests?.byRequestId,
    (requestIds, byRequestId): RenderBlockPayload[] | undefined => {
      if (!requestIds || requestIds.length === 0) return undefined;
      const latest = byRequestId[requestIds[requestIds.length - 1]];
      if (!latest) return undefined;
      return latest.renderBlockOrder
        .map((id) => latest.renderBlocks[id])
        .filter((b): b is RenderBlockPayload => b != null);
    },
  );

/**
 * Render block count for the latest request. Primitive — safe for useAppSelector.
 */
export const selectLatestRenderBlockCount =
  (conversationId: string) =>
  (state: RootState): number => {
    const ids = state.activeRequests?.byConversationId[conversationId];
    if (!ids || ids.length === 0) return 0;
    return (
      state.activeRequests?.byRequestId[ids[ids.length - 1]]?.renderBlockOrder
        .length ?? 0
    );
  };

// =============================================================================
// Instance-Level Bridges — Tool Lifecycle
// =============================================================================

/**
 * All active (in-progress) tools for this instance's latest request.
 * Memoized. Returns undefined when no request exists — guard in component.
 */
export const selectLatestActiveTools = (conversationId: string) =>
  createSelector(
    (state: RootState) =>
      state.activeRequests?.byConversationId[conversationId],
    (state: RootState) => state.activeRequests?.byRequestId,
    (requestIds, byRequestId): ToolLifecycleEntry[] | undefined => {
      if (!requestIds || requestIds.length === 0) return undefined;
      const latest = byRequestId[requestIds[requestIds.length - 1]];
      if (!latest) return undefined;
      return Object.values(latest.toolLifecycle).filter(
        (t) =>
          t.status === "started" ||
          t.status === "progress" ||
          t.status === "step",
      );
    },
  );

/**
 * All tool lifecycle entries for this instance's latest request.
 * Memoized. Returns undefined when no request exists — guard in component.
 */
export const selectLatestToolLifecycles = (conversationId: string) =>
  createSelector(
    (state: RootState) =>
      state.activeRequests?.byConversationId[conversationId],
    (state: RootState) => state.activeRequests?.byRequestId,
    (requestIds, byRequestId): ToolLifecycleEntry[] | undefined => {
      if (!requestIds || requestIds.length === 0) return undefined;
      const latest = byRequestId[requestIds[requestIds.length - 1]];
      if (!latest) return undefined;
      return Object.values(latest.toolLifecycle);
    },
  );

// =============================================================================
// Instance-Level Bridges — Completion
// =============================================================================

/**
 * The completion payload for this instance's latest request.
 * null until the stream finishes.
 */
export const selectLatestCompletion =
  (conversationId: string) =>
  (state: RootState): CompletionPayload | null => {
    const ids = state.activeRequests?.byConversationId[conversationId];
    if (!ids || ids.length === 0) return null;
    return (
      state.activeRequests?.byRequestId[ids[ids.length - 1]]?.completion ?? null
    );
  };

// =============================================================================
// Instance-Level Bridges — Errors
// =============================================================================

/**
 * Whether the latest request on this instance ended in a fatal error
 * (stream killed). The backend has no `is_fatal` field on the wire — error
 * events ARE fatal by definition, so we derive this purely from
 * `request.status === "error"`.
 */
export const selectLatestErrorIsFatal =
  (conversationId: string) =>
  (state: RootState): boolean => {
    const ids = state.activeRequests?.byConversationId[conversationId];
    if (!ids || ids.length === 0) return false;
    return (
      state.activeRequests?.byRequestId[ids[ids.length - 1]]?.status === "error"
    );
  };

// =============================================================================
// Instance-Level Bridges — Timeline
// =============================================================================

/**
 * The full timeline for this instance's latest request.
 * Stable reference — array only grows, never shrinks mid-stream.
 * Returns undefined when no request exists — guard in component.
 */
export const selectLatestTimeline =
  (conversationId: string) =>
  (state: RootState): TimelineEntry[] | undefined => {
    const ids = state.activeRequests?.byConversationId[conversationId];
    if (!ids || ids.length === 0) return undefined;
    return state.activeRequests?.byRequestId[ids[ids.length - 1]]?.timeline;
  };

/**
 * Whether the latest request is currently inside a text-streaming run.
 */
export const selectIsInTextRun =
  (conversationId: string) =>
  (state: RootState): boolean => {
    const ids = state.activeRequests?.byConversationId[conversationId];
    if (!ids || ids.length === 0) return false;
    return (
      state.activeRequests?.byRequestId[ids[ids.length - 1]]?.isTextStreaming ??
      false
    );
  };

/** Whether reasoning tokens are currently streaming for the latest request. */
export const selectIsReasoningStreaming =
  (conversationId: string) =>
  (state: RootState): boolean => {
    const ids = state.activeRequests?.byConversationId[conversationId];
    if (!ids || ids.length === 0) return false;
    return (
      state.activeRequests?.byRequestId[ids[ids.length - 1]]
        ?.isReasoningStreaming ?? false
    );
  };

/**
 * Accumulated reasoning text for the latest request.
 * Returns "" when no request exists — string literal default is safe.
 */
export const selectLatestAccumulatedReasoning =
  (conversationId: string) =>
  (state: RootState): string => {
    const ids = state.activeRequests?.byConversationId[conversationId];
    if (!ids || ids.length === 0) return "";
    const latest = state.activeRequests?.byRequestId[ids[ids.length - 1]];
    if (!latest) return "";
    return latest.accumulatedReasoning || "";
  };

/** Record reservations for the latest request. */
export const selectLatestReservations =
  (conversationId: string) =>
  (
    state: RootState,
  ):
    | Record<
        string,
        import("@/features/agents/types/request.types").ReservationRecord
      >
    | undefined => {
    const ids = state.activeRequests?.byConversationId[conversationId];
    if (!ids || ids.length === 0) return undefined;
    return state.activeRequests?.byRequestId[ids[ids.length - 1]]?.reservations;
  };

// =============================================================================
// Stream Phase — unified rendering state
// =============================================================================

/**
 * Which visual phase the stream is in. Components render different UI for each.
 *
 * - idle: no active request
 * - connecting: HTTP request in flight, no server events yet
 * - pre_token: server events arriving (status updates, data) but no text yet
 * - reasoning: reasoning/thinking tokens streaming
 * - text_streaming: text chunks actively flowing
 * - interstitial: between text runs (tools, status updates, more planning)
 * - complete: stream finished
 * - error: fatal error
 */
export type StreamPhase =
  | "idle"
  | "connecting"
  | "pre_token"
  | "reasoning"
  | "text_streaming"
  | "interstitial"
  | "complete"
  | "error";

export const selectStreamPhase =
  (conversationId: string) =>
  (state: RootState): StreamPhase => {
    const instance = state.conversations?.byConversationId[conversationId];
    if (!instance) return "idle";

    const instanceStatus = instance.status;

    if (instanceStatus === "draft" || instanceStatus === "ready") return "idle";
    if (instanceStatus === "complete") return "complete";
    if (instanceStatus === "error") return "error";

    const ids = state.activeRequests?.byConversationId[conversationId];
    if (!ids || ids.length === 0) return "idle";

    const request = state.activeRequests?.byRequestId[ids[ids.length - 1]];
    if (!request) return "idle";

    if (request.status === "error") return "error";
    if (request.status === "complete") return "complete";
    if (request.status === "connecting") return "connecting";

    if (request.isReasoningStreaming) return "reasoning";
    if (request.isTextStreaming) return "text_streaming";

    if (request.chunkCount > 0 && request.status === "streaming") {
      return "interstitial";
    }

    if (request.status === "streaming" || request.status === "pending") {
      return "pre_token";
    }

    return "idle";
  };

// =============================================================================
// Shortcut Selectors
// =============================================================================

/**
 * Get shortcuts available for the current UI context.
 * Memoized — stable reference when shortcuts map hasn't changed.
 */
export const makeSelectAvailableShortcuts = (context: ShortcutContext) =>
  createSelector(
    (state: RootState) => state.agentShortcut.shortcuts,
    (shortcuts) =>
      Object.values(shortcuts)
        .filter(
          (s) => s != null && s.isActive && s.enabledFeatures.includes(context),
        )
        .sort((a, b) => (a?.sortOrder ?? 0) - (b?.sortOrder ?? 0)),
  );

/**
 * @deprecated Use makeSelectAvailableShortcuts(context) factory instead.
 * This non-memoized version creates a new array on every call.
 */
export const selectAvailableShortcuts =
  (context: ShortcutContext) => (state: RootState) => {
    return Object.values(state.agentShortcut.shortcuts)
      .filter(
        (s) => s != null && s.isActive && s.enabledFeatures.includes(context),
      )
      .sort((a, b) => (a?.sortOrder ?? 0) - (b?.sortOrder ?? 0));
  };
