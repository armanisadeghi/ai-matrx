"use client";

/**
 * useConversationFollowsPage — a chat that lives BESIDE the page (Quick Chat,
 * the shell's chat dock) gets that page's live surface values, and keeps
 * getting them as the person moves from page to page.
 *
 * The mechanism is the conversation's surface STAMP (`conversation.surfaceName`):
 * every turn, `refresh-surface-scope` re-reads the live provider the stamp
 * names. A launch adopts a surface only ONCE, so a chat that outlives the page
 * it was opened on would carry a "surface closed" note for the rest of its
 * life. This hook keeps the stamp equal to what the person chose:
 *
 *   - on  → the stamp follows `useActivePageSurface()` — the page (or the
 *           overlay on top of it) the person is looking at right now;
 *   - off → the stamp is cleared AND the values the page already handed over
 *           are dropped. Off means off.
 *
 * The choice is the person's, visible in the host's chrome (the helper-context
 * contract: common-docs/systems/mandates/STATE.md). One implementation for
 * every beside-the-page chat — never a second copy of this effect.
 */

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { patchConversation } from "@/features/agents/redux/execution-system/conversations/conversations.slice";
import { replaceSurfaceVariableValues } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
import { replaceSurfaceContextEntries } from "@/features/agents/redux/execution-system/instance-context/instance-context.slice";
import { useActivePageSurface } from "./useActivePageSurface";
import { getSurfaceDisplayLabel } from "@/features/surfaces/utils/surface-display";

export interface PageFollowState {
  /** The page surface the person is looking at; null on an unregistered page. */
  pageSurfaceName: string | null;
  /** Its canonical display label (THE NAMING LAW); null with no surface. */
  pageSurfaceLabel: string | null;
}

export function useConversationFollowsPage(
  conversationId: string | null,
  includePageContext: boolean,
): PageFollowState {
  const dispatch = useAppDispatch();
  const { surfaceName: pageSurfaceName } = useActivePageSurface();
  const stampedSurfaceName = useAppSelector((state) =>
    conversationId ? (state.conversations.byConversationId[conversationId]?.surfaceName ?? null) : null,
  );
  const conversationReady = useAppSelector((state) =>
    conversationId ? Boolean(state.conversations.byConversationId[conversationId]) : false,
  );
  const desiredSurfaceName = includePageContext && pageSurfaceName ? pageSurfaceName : null;

  useEffect(() => {
    if (!conversationId || !conversationReady) return;
    if (stampedSurfaceName === desiredSurfaceName) return;
    dispatch(patchConversation({ conversationId, surfaceName: desiredSurfaceName }));
    if (!desiredSurfaceName) {
      // Off means OFF: drop what the page already handed over.
      dispatch(replaceSurfaceVariableValues({ conversationId, values: {} }));
      dispatch(replaceSurfaceContextEntries({ conversationId, entries: [] }));
    }
  }, [dispatch, conversationId, conversationReady, stampedSurfaceName, desiredSurfaceName]);

  return {
    pageSurfaceName,
    pageSurfaceLabel: pageSurfaceName ? getSurfaceDisplayLabel(pageSurfaceName) : null,
  };
}
