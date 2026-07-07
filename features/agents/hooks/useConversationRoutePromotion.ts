"use client";

// features/agents/hooks/useConversationRoutePromotion.ts
//
// The canonical "conversation route" navigation primitive, extracted from
// ChatRoomClient so ANY agent-conversation surface (chat, education tutor, …)
// gets the same battle-tested URL behavior instead of re-deriving it:
//
//  1. registerSurface  — so fork/retry/delete action bars can route their
//     navigation outcomes to the right deep-linkable URL.
//  2. pendingNavigation — fork/retry/delete set a target conversationId; this
//     promotes it to a router.replace.
//  3. post-submit promotion — a fresh route (no conversationId prop) that has
//     started streaming (messageCount >= 2) promotes /<base>/new-style URL to
//     /<base>/[conversationId] ONLY after the row is committed & readable
//     (waitForConversationPersisted), with the stale-focus guard that prevents
//     the "click + and it snaps back to the old chat" bug.
//
// Callers own the launcher (must pass retainOnUnmount:true so the streaming
// instance survives the router.replace that unmounts it). This hook owns only
// the routing. See features/agents/components/chat/FEATURE.md for the model and
// the gotchas each guard exists to kill.

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { waitForConversationPersisted } from "@/features/agents/redux/execution-system/conversations/conversation-persistence";
import { selectMessageCount } from "@/features/agents/redux/execution-system/messages/messages.selectors";
import {
  registerSurface,
  unregisterSurface,
  selectPendingNavigation,
  clearPendingNavigation,
} from "@/features/agents/redux/surfaces/surfaces.slice";

export interface ConversationRoutePromotionArgs {
  /** The surface's focus/registry key (e.g. `education-tutor:<agentId>`). */
  surfaceKey: string;
  /** Re-run the promotion refs when the agent changes. */
  agentId: string;
  /** Set only when viewing an EXISTING conversation (loaded route). */
  conversationIdProp?: string;
  /** The launcher's live conversation id on a fresh route (else null). */
  liveConversationId: string | null;
  /** Bumped by a "+ new" action to reset promotion refs (0 when N/A). */
  freshSessionKey?: number;
  /** Route template for registerSurface, e.g. `/education/tutor/[conversationId]`. */
  basePath: string;
  /** Build the deep-link URL for a conversation id, e.g. `/education/tutor/${id}`. */
  buildHref: (conversationId: string) => string;
}

export function useConversationRoutePromotion({
  surfaceKey,
  agentId,
  conversationIdProp,
  liveConversationId,
  freshSessionKey = 0,
  basePath,
  buildHref,
}: ConversationRoutePromotionArgs): void {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const router = useRouter();

  // 1. Register this client as a `page` surface.
  useEffect(() => {
    dispatch(registerSurface({ surfaceKey, kind: "page", basePath }));
    return () => {
      dispatch(unregisterSurface(surfaceKey));
    };
  }, [dispatch, surfaceKey, basePath]);

  // 2. pendingNavigation (fork / retry / delete) → router.replace.
  const pendingNavigation = useAppSelector(selectPendingNavigation(surfaceKey));
  useEffect(() => {
    if (!pendingNavigation) return;
    router.replace(buildHref(pendingNavigation.conversationId));
    dispatch(clearPendingNavigation({ surfaceKey }));
  }, [pendingNavigation, router, dispatch, surfaceKey, buildHref]);

  // 3. Post-submit URL promotion (fresh route only).
  const messageCount = useAppSelector((state) =>
    liveConversationId ? selectMessageCount(liveConversationId)(state) : 0,
  );
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
    // Stale-focus guard — only promote the conversation STILL focused here.
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
      const focusNow =
        store.getState().conversationFocus?.bySurface[surfaceKey]?.input ??
        null;
      if (focusNow !== target) return;
      promotedRef.current = target;
      router.replace(buildHref(target));
    })();

    return () => {
      ctrl.abort();
      if (promotionWaitRef.current === target) promotionWaitRef.current = null;
    };
  }, [
    readyToPromote,
    liveConversationId,
    router,
    store,
    surfaceKey,
    buildHref,
  ]);
}
