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
import { selectMessageCount } from "@/features/agents/redux/execution-system/messages/messages.selectors";
import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import {
  setFocus,
  clearFocus,
} from "@/features/agents/redux/execution-system/conversation-focus/conversation-focus.slice";
import { consumeChatDraftTransfer } from "./chat-draft-transfer";
import { selectChatIncognitoActive } from "./chat-incognito.slice";
import { patchConversation } from "@/features/agents/redux/execution-system/conversations/conversations.slice";
import {
  registerSurface,
  unregisterSurface,
  selectPendingNavigation,
  clearPendingNavigation,
} from "@/features/agents/redux/surfaces/surfaces.slice";
import { AgentConversationColumn } from "@/features/agents/components/shared/AgentConversationColumn";
import { ChatRoomSkeleton } from "./ChatRoomSkeleton";

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
  landingContent?: React.ReactNode;
}

const SOURCE_FEATURE = "chat-route";

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
    ready: !isInitializing && !conversationIdProp,
    config: { responseDensity: "compact" },
    isEphemeral: isIncognito,
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
    if (!conversationIdProp || isInitializing || !authReady) return;
    if (loadedKeyRef.current === conversationIdProp) return;

    // Cancel any in-flight load before starting a new one.
    loadAbortRef.current?.abort();
    const ctrl = new AbortController();
    loadAbortRef.current = ctrl;
    loadedKeyRef.current = conversationIdProp;

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
            signal: ctrl.signal,
          }),
        ).unwrap();
      } catch (err) {
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

  // ── Post-submit URL promotion (only on /chat/a/[agentId]) ────────────────
  // On /chat/a/[agentId] the launcher pre-creates an instance with a client
  // UUID, but the conversation isn't persisted in cx_conversation until the
  // server processes the first request and emits its initial `record_reserved`
  // events. Promoting on the user's optimistic local message alone races the
  // server — the SSR query at /chat/[cid] would 404-redirect back to /chat/new.
  // The agent's reserved message arrives only AFTER the cx_conversation row
  // exists, so message-count >= 2 is the reliable post-persistence signal.
  const messageCount = useAppSelector((state) =>
    liveConversationId ? selectMessageCount(liveConversationId)(state) : 0,
  );
  const promotedRef = useRef<string | null>(null);
  useEffect(() => {
    if (conversationIdProp) return; // already at /chat/[cid]
    if (!liveConversationId || messageCount < 2) return;
    if (promotedRef.current === liveConversationId) return;
    // Stale-closure guard — THE fix for "click + and it snaps back to the old
    // chat". `/chat/[id]` and `/chat/a/[agentId]` share the same surfaceKey, so
    // when you click `+` from an existing conversation this effect can be
    // scheduled with the INHERITED `liveConversationId` (the old conversation,
    // which already has >=2 messages) for one transitional render — before the
    // launcher swaps focus to the fresh conversation. Promoting that would
    // `router.replace` you straight back to the old chat. Only promote the
    // conversation that is STILL the focused one on this surface right now.
    const currentInputFocus =
      store.getState().conversationFocus?.bySurface[surfaceKey]?.input ?? null;
    if (currentInputFocus !== liveConversationId) return;
    promotedRef.current = liveConversationId;
    router.replace(`/chat/${liveConversationId}`);
  }, [
    conversationIdProp,
    liveConversationId,
    messageCount,
    router,
    store,
    surfaceKey,
  ]);

  // ── Single source of truth ───────────────────────────────────────────────
  // Prop wins when present (loading existing). Otherwise launcher's id wins.
  const conversationId = conversationIdProp ?? liveConversationId ?? null;

  // The agent picker + new-chat live in the shell header (ChatRunHeader, via
  // <PageHeader> on the route page); conversation history is the shell
  // sidebar's route menu (ChatSidebarMenu). This component renders only the
  // conversation column — exactly like AgentRunnerPage.
  if (isInitializing || !conversationId) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-textured">
        <ChatRoomSkeleton />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-textured">
      <div className="flex-1 min-h-0 overflow-hidden flex justify-center">
        <AgentConversationColumn
          conversationId={conversationId}
          surfaceKey={surfaceKey}
          constrainWidth
          edgeToEdgeScroll
          smartInputProps={{
            sendButtonVariant: "blue",
            // Lives in the Chat Options (+) → Preferences tab now.
            showSubmitOnEnterToggle: false,
          }}
          landingContent={landingContent}
        />
      </div>
    </div>
  );
}
