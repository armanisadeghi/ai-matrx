"use client";

/**
 * useAgentLauncher — Universal hook for agent execution.
 *
 * Two usage modes:
 *
 * 1. **Managed** — pass an agentId + surfaceKey to auto-create and track a conversation:
 *    ```tsx
 *    const { conversationId, launchShortcut, close } = useAgentLauncher(agentId, {
 *      surfaceKey: "agent-builder",
 *      sourceFeature: "agent-builder",
 *      apiEndpointMode: "agent",
 *    });
 *    ```
 *
 * 2. **Imperative** — call with no arguments for on-demand launching:
 *    ```tsx
 *    const { launchAgent, launchShortcut, launchChat, close } = useAgentLauncher();
 *    const result = await launchAgent("agent-uuid", { config: { displayMode: "modal-full" } });
 *    ```
 *
 * All paths delegate to the `launchAgentExecution` orchestrator thunk which
 * handles conversation creation, source tracking, display-mode routing, and execution.
 */

import { useCallback, useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import {
  destroyInstanceIfAllowed,
  destroyInstanceIfAbandoned,
} from "@/features/agents/redux/execution-system/conversations/conversations.thunks";
import { setFocus } from "@/features/agents/redux/execution-system/conversation-focus/conversation-focus.slice";
import {
  selectFocusedConversation,
  selectDisplayConversation,
} from "@/features/agents/redux/execution-system/conversation-focus/conversation-focus.selectors";
import { generateConversationId } from "../redux/execution-system/utils/ids";
import type { ApplicationScope } from "@/features/agents/utils/scope-mapping";
import type { ManagedAgentOptions } from "../types/instance.types";
import type { ConversationInvocation } from "../types/conversation-invocation.types";
import { invocationToManagedOptions } from "../redux/execution-system/thunks/launch-conversation.thunk";
import {
  launchAgentExecution,
  LaunchResult,
} from "../redux/execution-system/thunks/launch-agent-execution.thunk";
import {
  isProjectCreateFlow,
  logProjectCreateAiStage,
  warnProjectCreateAi,
} from "@/features/projects/debug/projectCreateAiDebug";

// =============================================================================
// ConversationInvocation type guard
// =============================================================================

/**
 * Discriminates `ConversationInvocation` from the legacy `ManagedAgentOptions`
 * by checking for the four required top-level object properties that exist only
 * on the new type (`identity`, `engine`, `routing`, `origin`).
 */
function isConversationInvocation(
  options: ManagedAgentOptions | ConversationInvocation,
): options is ConversationInvocation {
  return (
    "identity" in options &&
    "engine" in options &&
    "routing" in options &&
    "origin" in options
  );
}

/**
 * Normalises the caller-supplied options into the `ManagedAgentOptions` shape
 * the hook's internals expect. Accepts either the legacy flat envelope or the
 * new grouped `ConversationInvocation` type — output is identical either way.
 */
function normaliseOptions(
  input: ManagedAgentOptions | ConversationInvocation | undefined,
): ManagedAgentOptions | undefined {
  if (!input) return undefined;
  return isConversationInvocation(input)
    ? invocationToManagedOptions(input)
    : input;
}

// =============================================================================
// Return types
// =============================================================================

interface ImperativeMethods {
  launchAgent: (
    agentId: string,
    options?: ManagedAgentOptions,
  ) => Promise<LaunchResult>;

  launchShortcut: (
    shortcutId: string,
    applicationScope: ApplicationScope,
    options?: Partial<ManagedAgentOptions>,
  ) => Promise<LaunchResult>;

  launchChat: (options?: ManagedAgentOptions) => Promise<LaunchResult>;

  close: (conversationId: string) => void;
}

interface ManagedReturn extends ImperativeMethods {
  /**
   * The "input-bound" conversation id — what the smart input / variables
   * panel targets. In the default case this equals `displayConversationId`;
   * under autoclear split this is the NEXT-turn conversation.
   */
  conversationId: string | null;
  /** Alias of `conversationId` for explicit callers. */
  inputConversationId: string | null;
  /**
   * The "display-bound" conversation id — what the conversation column
   * shows. Diverges from `conversationId` only while autoclear split is
   * active (between submit and the next submit).
   */
  displayConversationId: string | null;
}

// =============================================================================
// Overloads
// =============================================================================

export function useAgentLauncher(): ImperativeMethods;
export function useAgentLauncher(
  agentId: string,
  options: ManagedAgentOptions,
): ManagedReturn;
export function useAgentLauncher(
  agentId: string,
  options: ConversationInvocation,
): ManagedReturn;

// =============================================================================
// Implementation
// =============================================================================

export function useAgentLauncher(
  agentId?: string,
  optionsInput?: ManagedAgentOptions | ConversationInvocation,
): ImperativeMethods | ManagedReturn {
  const options = normaliseOptions(optionsInput);
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const surfaceKey = options?.surfaceKey;
  const focusedConversationId = useAppSelector(
    selectFocusedConversation(surfaceKey),
  );
  const displayConversationId = useAppSelector(
    selectDisplayConversation(surfaceKey ?? ""),
  );

  // Stable per-surface conversation id. Resolve it synchronously DURING render
  // (reuse the focused id, else mint once into a ref and keep it) so the managed
  // consumer renders against a real id from the very first paint — never null,
  // never re-minted on re-render. The effect below performs the actual create
  // (or reuse) using this same id. The id is client-authoritative end-to-end:
  // the server honors it (turn-1 body `conversation_id` + `X-Conversation-ID`).
  const isManagedHook = agentId != null && surfaceKey != null;
  const mintedIdRef = useRef<string | null>(null);
  const mintedForKeyRef = useRef<string | undefined>(undefined);
  if (isManagedHook && mintedForKeyRef.current !== surfaceKey) {
    // First run, or the surface changed (incl. an agent swap that re-keys the
    // surfaceKey) → resolve a fresh stable id for this surface: reuse its
    // focused id if one exists, else mint once.
    mintedForKeyRef.current = surfaceKey;
    mintedIdRef.current = focusedConversationId ?? generateConversationId();
  }
  const conversationId = isManagedHook
    ? (focusedConversationId ?? mintedIdRef.current)
    : focusedConversationId;

  // ── Imperative methods (always created) ──────────────────────────────────

  const launchAgent = useCallback(
    async (id: string, opts?: ManagedAgentOptions): Promise<LaunchResult> => {
      const payload: ManagedAgentOptions = {
        agentId: id,
        conversationId: opts?.conversationId,
        surfaceKey: opts?.surfaceKey,
        sourceFeature: opts?.sourceFeature,
        config: opts?.config,
        runtime: opts?.runtime,
        apiEndpointMode: opts?.apiEndpointMode,
        showAutoClearToggle: opts?.showAutoClearToggle,
        autoClearConversation: opts?.autoClearConversation,
        ready: opts?.ready,
        isEphemeral: opts?.isEphemeral,
        jsonExtraction: opts?.jsonExtraction,
        onConversationCreated: opts?.onConversationCreated,
      };
      return dispatch(launchAgentExecution(payload)).unwrap();
    },
    [dispatch],
  );

  const launchShortcut = useCallback(
    async (
      shortcutId: string,
      applicationScope: ApplicationScope,
      opts?: Partial<ManagedAgentOptions>,
    ): Promise<LaunchResult> => {
      // The shortcut's persisted AgentExecutionConfig is loaded by
      // createInstanceFromShortcut. We forward only:
      //   - identity (surfaceKey, sourceFeature)
      //   - config: caller-provided overrides on top of the shortcut's bundle
      //   - runtime: live data from the UI (applicationScope, originalText, …)
      const runtime = {
        applicationScope,
        ...(opts?.runtime ?? {}),
      };
      const payload: ManagedAgentOptions = {
        shortcutId,
        surfaceKey: opts?.surfaceKey ?? `shortcut:${shortcutId}`,
        sourceFeature: opts?.sourceFeature ?? "context-menu",
        config: opts?.config,
        runtime,
        apiEndpointMode: opts?.apiEndpointMode,
        showAutoClearToggle: opts?.showAutoClearToggle,
        autoClearConversation: opts?.autoClearConversation,
        jsonExtraction: opts?.jsonExtraction,
      };
      return dispatch(launchAgentExecution(payload)).unwrap();
    },
    [dispatch],
  );

  const launchChat = useCallback(
    async (opts?: ManagedAgentOptions): Promise<LaunchResult> => {
      const payload: ManagedAgentOptions = {
        manual: {
          label: "Chat",
          baseSettings: opts?.config?.llmOverrides,
        },
        surfaceKey: opts?.surfaceKey,
        sourceFeature: opts?.sourceFeature,
        // allowChat defaults to true for chat mode; caller's config wins.
        config: { allowChat: true, ...opts?.config },
        runtime: opts?.runtime,
        apiEndpointMode: opts?.apiEndpointMode ?? "agent",
        showAutoClearToggle: opts?.showAutoClearToggle,
        autoClearConversation: opts?.autoClearConversation,
        jsonExtraction: opts?.jsonExtraction,
      };
      return dispatch(launchAgentExecution(payload)).unwrap();
    },
    [dispatch],
  );

  const close = useCallback(
    (id: string) => {
      dispatch(destroyInstanceIfAllowed(id));
    },
    [dispatch],
  );

  // ── Managed lifecycle (only active when agentId + surfaceKey are provided) ──

  const isManaged = agentId != null && surfaceKey != null;
  const {
    ready = true,
    config,
    runtime,
    sourceFeature,
    showAutoClearToggle,
    autoClearConversation,
    apiEndpointMode,
    jsonExtraction,
    retainOnUnmount = false,
    isEphemeral,
  } = options ?? {};

  useEffect(() => {
    if (!isManaged || !ready || !surfaceKey) return;

    // The id resolved synchronously during render — the instance is created
    // (or reused) under THIS id, so the surface never re-keys.
    const targetId = mintedIdRef.current!;
    let cancelled = false;

    // Reuse branch: a live instance already exists for this surface's id (e.g.
    // a remount where the conversation was retained). Re-point focus if needed
    // and do nothing else — no create, no destroy, no dispatch storm.
    const existing = store.getState().conversations.byConversationId[targetId];
    if (existing) {
      if (
        selectFocusedConversation(surfaceKey)(store.getState()) !== targetId
      ) {
        dispatch(setFocus({ surfaceKey, conversationId: targetId }));
      }
      return;
    }

    // Create branch: launch with the known id threaded through. We deliberately
    // do NOT dispatch setFocus here — `createInstanceFull` sets this surface's
    // focus IN THE SAME COMMIT as the instance creation (see conversation-focus
    // extraReducer), so creation + focus are one atomic store mutation / one
    // render. A separate setFocus would land a beat earlier and cost one wasted
    // "PARENT-DRIVEN" runner re-render. The hook already returns `targetId`
    // synchronously via the minted-id ref, so the consumer has the id from the
    // first render regardless.
    if (isProjectCreateFlow(sourceFeature, agentId)) {
      logProjectCreateAiStage(
        "useAgentLauncher → launchAgentExecution starting",
        {
          agentId,
          sourceFeature,
          surfaceKey,
          conversationId: targetId,
          apiEndpointMode,
        },
      );
    }

    launchAgent(agentId!, {
      surfaceKey,
      conversationId: targetId,
      sourceFeature,
      // Managed-mode defaults: direct display, no auto-run.
      // Caller's config takes precedence via the spread.
      config: { displayMode: "direct", autoRun: false, ...config },
      runtime,
      apiEndpointMode,
      showAutoClearToggle,
      autoClearConversation,
      jsonExtraction,
      isEphemeral,
    })
      .then((result) => {
        if (isProjectCreateFlow(sourceFeature, agentId)) {
          logProjectCreateAiStage(
            "useAgentLauncher → launchAgentExecution succeeded",
            {
              agentId,
              conversationId: result.conversationId,
              requestId: result.requestId ?? "(none yet)",
            },
          );
        }
        // Torn down before the create resolved (close / route change): the
        // instance just landed under targetId but nothing is mounted on it —
        // reap it per the unmount policy so we don't orphan a Redux record.
        if (cancelled) {
          if (retainOnUnmount) dispatch(destroyInstanceIfAbandoned(targetId));
          else dispatch(destroyInstanceIfAllowed(targetId));
        }
      })
      .catch((err) => {
        if (isProjectCreateFlow(sourceFeature, agentId)) {
          warnProjectCreateAi(
            "useAgentLauncher → launchAgentExecution FAILED",
            {
              agentId,
              sourceFeature,
              surfaceKey,
              conversationId: targetId,
              error: err instanceof Error ? err.message : String(err),
            },
          );
        } else {
          console.error("Failed to create agent conversation:", err);
        }
      });

    return () => {
      cancelled = true;
      // retainOnUnmount surfaces (chat route) keep started conversations alive
      // across the route change that promotes /chat/new → /chat/[id]; only
      // abandoned (empty) instances are reaped. Everyone else destroys.
      if (retainOnUnmount) {
        dispatch(destroyInstanceIfAbandoned(targetId));
      } else {
        dispatch(destroyInstanceIfAllowed(targetId));
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, ready, isManaged, surfaceKey]);

  if (isManaged) {
    return {
      conversationId,
      inputConversationId: conversationId,
      displayConversationId: displayConversationId ?? conversationId,
      launchAgent,
      launchShortcut,
      launchChat,
      close,
    };
  }

  return { launchAgent, launchShortcut, launchChat, close };
}

// =============================================================================
// Imperative API (for use outside React components)
// =============================================================================

export async function launchAgentImperative(
  dispatch: ReturnType<typeof useAppDispatch>,
  options: ManagedAgentOptions,
): Promise<LaunchResult> {
  return dispatch(launchAgentExecution(options)).unwrap();
}
