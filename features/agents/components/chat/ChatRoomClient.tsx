"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { selectAgentExecutionPayload } from "@/features/agents/redux/agent-definition/selectors";
import { fetchAgentExecutionMinimal } from "@/features/agents/redux/agent-definition/thunks";
import { selectAuthReady } from "@/lib/redux/selectors/userSelectors";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { useCreatorOwnershipSync } from "@/features/agents/hooks/useCreatorOwnershipSync";
import { createManualInstance } from "@/features/agents/redux/execution-system/thunks/create-instance.thunk";
import { loadConversation } from "@/features/agents/redux/execution-system/thunks/load-conversation.thunk";
import { waitForConversationPersisted } from "@/features/agents/redux/execution-system/conversations/conversation-persistence";
import { surfaceColdPendingCalls } from "@/features/agents/redux/execution-system/thunks/surface-cold-pending-calls.thunk";
import { selectMessageCount } from "@/features/agents/redux/execution-system/messages/messages.selectors";
import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import {
  setFocus,
  clearFocus,
} from "@/features/agents/redux/execution-system/conversation-focus/conversation-focus.slice";
import { consumeChatDraftTransfer } from "./chat-draft-transfer";
import { selectChatIncognitoActive } from "./chat-incognito.slice";
import { selectChatFreshSessionNonce } from "./chat-route.slice";
import { patchConversation } from "@/features/agents/redux/execution-system/conversations/conversations.slice";
import {
  registerSurface,
  unregisterSurface,
  selectPendingNavigation,
  clearPendingNavigation,
} from "@/features/agents/redux/surfaces/surfaces.slice";
import { AgentConversationColumn } from "@/features/agents/components/shared/AgentConversationColumn";
import { ChatRoomSkeleton } from "./ChatRoomSkeleton";
import {
  buildChatContextData,
  CHAT_CONTEXT_MENU_PROPS,
} from "./agent-context/buildChatContextData";
import { buildApplicationScopeFromMenuContext } from "@/features/context-menu-v2/utils/build-application-scope";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { selectUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.selectors";
import {
  extractFlatText,
  selectConversationMessages,
} from "@/features/agents/redux/execution-system/messages/messages.selectors";
import { selectConversationTitle } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import { selectIsStreaming } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { selectAgentName } from "@/features/agents/redux/agent-definition/selectors";

interface ChatRoomClientProps {
  agentId: string;
  /** When provided, loads this existing conversation. Mounted by
   *  `/chat/[conversationId]`. When absent (mounted by `/chat/a/[agentId]`),
   *  the launcher creates a fresh instance. */
  conversationId?: string;
  /**
   * Optional empty-state surface — rendered in place of the message list
   * while the conversation has zero messages. Forwarded to
   * `AgentConversationColumn`. Used by `/chat/new` to show the greeting +
   * quick-action chips before the user submits their first message.
   */
  landingContent?:
    | React.ReactNode
    | ((conversationId: string) => React.ReactNode);
}

const SOURCE_FEATURE = "chat-route";
const CHAT_INITIAL_MESSAGE_LIMIT = 12;

/**
 * Chat room client — orchestrates one conversation surface.
 *
 * Two mount paths, each with a single source of truth:
 *
 * - `/chat/a/[agentId]` mounts with NO `conversationId` prop. The launcher
 *   creates a fresh instance and owns the active id. After the first user
 *   submit, the streaming thunk's `record_reserved` event yields the canonical
 *   server UUID and a `pendingNavigation` effect calls `router.replace`.
 *
 * - `/chat/[conversationId]` mounts WITH the prop. The launcher is gated off
 *   (`ready: false`) and we load the existing conversation. The prop is the
 *   single source of truth — no parallel state.
 */
export function ChatRoomClient({
  agentId,
  conversationId: conversationIdProp,
  landingContent,
}: ChatRoomClientProps) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const router = useRouter();

  const surfaceKey = `${SOURCE_FEATURE}:${agentId}`;
  const authReady = useAppSelector(selectAuthReady);
  const isIncognito = useAppSelector(selectChatIncognitoActive);
  const freshSessionKey = useAppSelector(selectChatFreshSessionNonce);
  const isFreshRoute = !conversationIdProp;
  useCreatorOwnershipSync(agentId);

  // Register this client as a `page` surface so action bars can route
  // fork / retry navigation outcomes correctly (URL change).
  useEffect(() => {
    dispatch(
      registerSurface({
        surfaceKey,
        kind: "page",
        basePath: "/chat/[conversationId]",
      }),
    );
    return () => {
      dispatch(unregisterSurface(surfaceKey));
    };
  }, [dispatch, surfaceKey]);

  // ── Agent execution minimal fetch ────────────────────────────────────────
  const executionPayload = useAppSelector((state) =>
    selectAgentExecutionPayload(state, agentId),
  );

  const [isInitializing, setIsInitializing] = useState(true);
  const [isColdLoadingConversation, setIsColdLoadingConversation] = useState(
    Boolean(conversationIdProp),
  );
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      setIsInitializing(true);
      try {
        if (!executionPayload.isReady) {
          await dispatch(fetchAgentExecutionMinimal(agentId)).unwrap();
        }
      } catch (err) {
        console.error(
          "[ChatRoomClient] fetchAgentExecutionMinimal failed",
          err,
        );
      } finally {
        if (!cancelled) setIsInitializing(false);
      }
    };
    init();
    return () => {
      cancelled = true;
    };
  }, [agentId, dispatch, executionPayload.isReady]);

  // ── Fresh-start guard (agent route only) ─────────────────────────────────
  // The agent route means "start a NEW conversation with this agent." The
  // surface key is `chat-route:<agentId>`, and the focus slice retains the
  // last conversation per surface across route changes (the launcher uses
  // `retainOnUnmount` so non-empty conversations stay cached). Without this,
  // returning to an agent you recently used would revive that agent's old
  // conversation. Clear the stale per-agent focus whenever we (re)enter a
  // fresh agent route so the launcher mints a brand-new conversation. This
  // effect MUST re-run on every agent/route change — ChatRoomClient is reused
  // (not remounted) across chat navigations, so a once-per-mount guard would
  // miss agent switches and `+` clicks. Skipped when loading an existing
  // conversation (/chat/[conversationId]), where the prop is the source.
  useEffect(() => {
    if (conversationIdProp) return;
    dispatch(clearFocus(surfaceKey));
  }, [conversationIdProp, surfaceKey, dispatch]);

  // ── Launcher (active only on /chat/a/[agentId]) ──────────────────────────
  // When `conversationIdProp` is set, we're loading an existing conversation
  // so the launcher stays gated off. When absent, it creates a fresh instance
  // and owns the conversationId.
  const { conversationId: liveConversationId } = useAgentLauncher(agentId, {
    surfaceKey,
    sourceFeature: SOURCE_FEATURE,
    ready: !isInitializing && isFreshRoute,
    config: { responseDensity: "compact" },
    isEphemeral: isIncognito,
    preferFresh: isFreshRoute,
    freshSessionKey: isFreshRoute ? freshSessionKey : 0,
    // The chat route promotes /chat/new → /chat/[conversationId] right after
    // the first submit, which unmounts this launcher mid-stream. Retain the
    // started conversation so the destination route re-attaches to the live
    // instance instead of re-fetching (and clobbering the stream).
    retainOnUnmount: true,
  });

  // Keep the live instance aligned with the incognito toggle so execute thunks
  // send store:false and sandbox binding stays off for the whole session.
  useEffect(() => {
    if (!liveConversationId || conversationIdProp) return;
    dispatch(
      patchConversation({
        conversationId: liveConversationId,
        isEphemeral: isIncognito,
      }),
    );
  }, [conversationIdProp, dispatch, isIncognito, liveConversationId]);

  // ── Existing-conversation load (only on /chat/[conversationId]) ──────────
  // One in-flight load at a time, cancelled on prop change.
  const loadAbortRef = useRef<AbortController | null>(null);
  const loadedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!conversationIdProp || isInitializing || !authReady) return undefined;
    if (loadedKeyRef.current === conversationIdProp) return undefined;

    // Cancel any in-flight load before starting a new one.
    loadAbortRef.current?.abort();
    const ctrl = new AbortController();
    loadAbortRef.current = ctrl;
    loadedKeyRef.current = conversationIdProp;
    setIsColdLoadingConversation(true);

    (async () => {
      try {
        const state = store.getState();
        const exists =
          !!state.conversations?.byConversationId?.[conversationIdProp];
        // If the conversation is already live in memory with messages, this
        // is a URL promotion from /chat/new or /chat/a/[agentId] right after
        // the user submitted — the stream is in-flight in Redux. Calling
        // loadConversation here would re-fetch from the DB and clobber the
        // active stream (the "stream is missed" bug). Skip the load entirely;
        // the in-memory state is the source of truth. We only hydrate from
        // the server for genuinely cold conversations (deep-link, refresh,
        // sidebar click on a conversation not in memory).
        const alreadyLiveCount =
          state.messages?.byConversationId?.[conversationIdProp]?.orderedIds
            ?.length ?? 0;
        if (exists && alreadyLiveCount > 0) {
          setIsColdLoadingConversation(false);
          // Make sure focus points at this conversation, then bail — unless
          // this load was already superseded by a navigation (don't revert the
          // surface back to the conversation the user just left).
          if (ctrl.signal.aborted) return;
          dispatch(
            setFocus({ surfaceKey, conversationId: conversationIdProp }),
          );
          return;
        }
        if (ctrl.signal.aborted) return;
        if (!exists) {
          await dispatch(
            createManualInstance({
              agentId,
              conversationId: conversationIdProp,
              apiEndpointMode: "agent",
              responseDensity: "compact",
            }),
          ).unwrap();
        }
        if (ctrl.signal.aborted) return;
        await dispatch(
          loadConversation({
            conversationId: conversationIdProp,
            surfaceKey,
            messageLimit: CHAT_INITIAL_MESSAGE_LIMIT,
            signal: ctrl.signal,
          }),
        ).unwrap();
        if (ctrl.signal.aborted) return;
        setIsColdLoadingConversation(false);
        // Cold-resume: if the server left this conversation paused waiting on a
        // client-delegated tool the user never answered (closed the tab
        // mid-prompt), re-surface the prompt(s) now so they can answer and
        // resume the agent. Routed through the SAME path as a live
        // tool_delegated event. Fire-and-forget — must not block the load.
        // (Only the genuinely-cold branch reaches here; the in-memory-live
        // branch above returns early, where prompts arrive over the stream.)
        void dispatch(surfaceColdPendingCalls(conversationIdProp));
      } catch (err) {
        if (!ctrl.signal.aborted) setIsColdLoadingConversation(false);
        if (loadedKeyRef.current === conversationIdProp) {
          loadedKeyRef.current = null;
        }
        console.error("[ChatRoomClient] loadConversation failed", err);
      }
    })();

    return () => {
      ctrl.abort();
    };
  }, [
    agentId,
    conversationIdProp,
    dispatch,
    isInitializing,
    authReady,
    store,
    surfaceKey,
  ]);

  // ── Pending navigation → router.replace ─────────────────────────────────
  // Fork / retry / delete actions set pendingNavigation with the target
  // conversationId; this effect promotes it into a URL change so the user
  // ends up on the right deep-linkable route.
  const pendingNavigation = useAppSelector(selectPendingNavigation(surfaceKey));
  useEffect(() => {
    if (!pendingNavigation) return;
    router.replace(`/chat/${pendingNavigation.conversationId}`);
    dispatch(clearPendingNavigation({ surfaceKey }));
  }, [pendingNavigation, router, dispatch, surfaceKey]);

  // ── Draft transfer from /chat/new chip click ────────────────────────────
  // When a chip on /chat/new is clicked, the source page stashes the user's
  // in-progress draft in sessionStorage keyed to this agent's id. We apply it
  // once the launcher has created the instance entry — `setUserInputText`
  // requires `state.instanceUserInput.byConversationId[cid]` to exist.
  const draftAppliedRef = useRef<string | null>(null);
  useEffect(() => {
    if (conversationIdProp) return; // existing conversation, not a chip target
    if (!liveConversationId) return;
    if (draftAppliedRef.current === liveConversationId) return;
    const transfer = consumeChatDraftTransfer(agentId);
    if (!transfer) {
      draftAppliedRef.current = liveConversationId;
      return;
    }
    draftAppliedRef.current = liveConversationId;
    dispatch(
      setUserInputText({
        conversationId: liveConversationId,
        text: transfer.text,
      }),
    );
  }, [conversationIdProp, liveConversationId, agentId, dispatch]);

  // ── Post-submit URL promotion (only on /chat/new + /chat/a/[agentId]) ─────
  // The launcher pre-creates an instance with a client UUID, but the
  // conversation isn't persisted in chat.conversation until the server writes
  // it. `record_reserved` events only *announce* the reserved UUIDs mid-stream
  // — they are NOT a commit. The backend now persists the whole turn (conv +
  // user + assistant message) atomically at stream-end, so message-count >= 2
  // is NO LONGER a reliable "row committed" signal (it once was, when the row
  // was inserted up front). Promoting before the row is committed makes the
  // /chat/[cid] SSR guard miss and hard-redirect back to /chat/new — the
  // "can't leave /chat/new" bounce.
  //
  // Fix: gate the URL swap on `waitForConversationPersisted`, a client read
  // that mirrors the SSR seed lookup exactly. A `true` there guarantees the
  // SSR guard resolves a seed. Backend-timing-agnostic — instant when the row
  // commits early, deferred to turn-end when it commits atomically.
  const messageCount = useAppSelector((state) =>
    liveConversationId ? selectMessageCount(liveConversationId)(state) : 0,
  );
  // Boolean trigger (not raw count) so later messages in the same turn don't
  // re-fire / churn the effect. Toggles false→true once, then stays true.
  const readyToPromote =
    !conversationIdProp && !!liveConversationId && messageCount >= 2;
  const promotedRef = useRef<string | null>(null);
  const promotionWaitRef = useRef<string | null>(null);
  useEffect(() => {
    promotedRef.current = null;
    promotionWaitRef.current = null;
  }, [freshSessionKey, agentId]);
  useEffect(() => {
    if (!readyToPromote || !liveConversationId) return undefined;
    const target = liveConversationId;
    if (promotedRef.current === target) return undefined;
    if (promotionWaitRef.current === target) return undefined;
    // Stale-closure guard — THE fix for "click + and it snaps back to the old
    // chat". `/chat/[id]`, `/chat/new`, and `/chat/a/[agentId]` share the same
    // surfaceKey, so when you click `+` from an existing conversation this
    // effect can be scheduled with the INHERITED `liveConversationId` (the old
    // conversation, which already has >=2 messages) for one transitional render
    // — before the launcher swaps focus to the fresh conversation. Promoting
    // that would `router.replace` you straight back to the old chat. Only
    // promote the conversation STILL focused on this surface right now.
    const currentInputFocus =
      store.getState().conversationFocus?.bySurface[surfaceKey]?.input ?? null;
    if (currentInputFocus !== target) return undefined;

    promotionWaitRef.current = target;
    const ctrl = new AbortController();
    void (async () => {
      const persisted = await waitForConversationPersisted(target, {
        signal: ctrl.signal,
      });
      if (ctrl.signal.aborted) return;
      if (promotionWaitRef.current === target) promotionWaitRef.current = null;
      if (!persisted) return;
      // Re-check focus: a `+` / agent switch may have moved it while we waited.
      const focusNow =
        store.getState().conversationFocus?.bySurface[surfaceKey]?.input ??
        null;
      if (focusNow !== target) return;
      promotedRef.current = target;
      router.replace(`/chat/${target}`);
    })();

    return () => {
      ctrl.abort();
      if (promotionWaitRef.current === target) promotionWaitRef.current = null;
    };
  }, [readyToPromote, liveConversationId, router, store, surfaceKey]);

  // ── Single source of truth ───────────────────────────────────────────────
  // Prop wins when present (loading existing). Otherwise launcher's id wins.
  const conversationId = conversationIdProp ?? liveConversationId ?? null;

  // The agent picker + new-chat live in the shell header (ChatRunHeader, via
  // <PageHeader> on the route page); conversation history is the shell
  // sidebar's route menu (ChatSidebarMenu). This component renders only the
  // conversation column — exactly like AgentRunnerPage.
  const canRenderLandingDuringInit =
    !!landingContent && !conversationIdProp && !!conversationId;

  if ((isInitializing || !conversationId) && !canRenderLandingDuringInit) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-textured">
        <ChatRoomSkeleton />
      </div>
    );
  }

  if (conversationIdProp && isColdLoadingConversation) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-textured">
        <ChatRoomSkeleton />
      </div>
    );
  }

  // Header Agents chrome — live Run scope from Redux at click time (draft +
  // transcript + agent). Plain fn; React Compiler memoizes. DOM selection in
  // the composer is best-effort via activeElement when it's a textarea.
  const getChatScope = () => {
    const state = store.getState();
    const draft = selectUserInputText(conversationId)(state) ?? "";
    const records = selectConversationMessages(conversationId)(state);
    const messages = records.map((r) => ({
      id: r.id,
      role: r.role,
      text: extractFlatText(r),
      created_at: r.createdAt ?? undefined,
    }));
    let lastUserMessage: string | null = null;
    let lastAssistantMessage: string | null = null;
    for (const m of messages) {
      if (m.role === "user" && m.text) lastUserMessage = m.text;
      if (m.role === "assistant" && m.text) lastAssistantMessage = m.text;
    }

    let selectionStart = 0;
    let selectionEnd = 0;
    const active = document.activeElement;
    if (
      active instanceof HTMLTextAreaElement &&
      (active.value === draft || draft.length === 0)
    ) {
      selectionStart = active.selectionStart ?? 0;
      selectionEnd = active.selectionEnd ?? 0;
    }

    const contextData = buildChatContextData({
      inputDraft: draft,
      selectionStart,
      selectionEnd,
      conversationId,
      conversationTitle: selectConversationTitle(conversationId)(state),
      conversationStatus:
        state.conversations?.byConversationId?.[conversationId]?.status ?? null,
      isStreaming: selectIsStreaming(conversationId)(state),
      agentId,
      agentName: selectAgentName(state, agentId) ?? null,
      lastUserMessage,
      lastAssistantMessage,
      messages,
    });

    const selectedText =
      selectionEnd > selectionStart
        ? draft.slice(selectionStart, selectionEnd)
        : "";

    return buildApplicationScopeFromMenuContext({
      selectedText,
      selectionRange:
        active instanceof HTMLTextAreaElement
          ? {
              type: "editable",
              element: active,
              start: selectionStart,
              end: selectionEnd,
            }
          : null,
      contextData,
    });
  };

  return (
    <SurfaceRuntimeProvider
      surfaceName={CHAT_CONTEXT_MENU_PROPS.surfaceName}
      surfaceLabel="Chat"
      getScope={getChatScope}
      isEditable
    >
      <div className="flex h-full flex-col overflow-hidden bg-textured">
        <div className="flex-1 min-h-0 overflow-hidden flex justify-center">
          <AgentConversationColumn
            conversationId={conversationId}
            surfaceKey={surfaceKey}
            constrainWidth
            edgeToEdgeScroll
            deferColdMarkdown={!!conversationIdProp}
            smartInputProps={{
              sendButtonVariant: "blue",
              // Lives in the Chat Options (+) → Preferences tab now.
              showSubmitOnEnterToggle: false,
            }}
            landingContent={
              typeof landingContent === "function"
                ? landingContent(conversationId)
                : landingContent
            }
          />
        </div>
      </div>
    </SurfaceRuntimeProvider>
  );
}
