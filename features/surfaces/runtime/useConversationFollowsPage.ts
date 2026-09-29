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
 * The choice is the person's, made on the ONE control: the composer's page
 * chip (`PageContextChip` → `setPageContextEnabled`). `startsOn` is only the
 * host's default for a new conversation — a chat that opens over ANY page
 * (Quick Chat) starts off, so the chip shows as the eye-off icon naming the
 * page and one click shares it. While off, the remembered page follows the
 * person, so turning it on shares the page they are on now. The contract:
 * common-docs/systems/mandates/STATE.md. One implementation for every
 * beside-the-page chat — never a second copy of this effect.
 */

import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { patchConversation } from "@/features/agents/redux/execution-system/conversations/conversations.slice";
import { replaceSurfaceVariableValues } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
import { replaceSurfaceContextEntries } from "@/features/agents/redux/execution-system/instance-context/instance-context.slice";
import { selectPageContextOff } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { setPageContextOff } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { refreshSurfaceScope } from "@/features/agents/redux/execution-system/thunks/refresh-surface-scope.thunk";
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
  startsOn: boolean,
): PageFollowState {
  const dispatch = useAppDispatch();
  const { surfaceName: pageSurfaceName } = useActivePageSurface();
  const stampedSurfaceName = useAppSelector((state) =>
    conversationId ? (state.conversations.byConversationId[conversationId]?.surfaceName ?? null) : null,
  );
  const conversationReady = useAppSelector((state) =>
    conversationId ? Boolean(state.conversations.byConversationId[conversationId]) : false,
  );
  // The composer's page chip turns it on and off for this conversation.
  const turnedOff = useAppSelector(selectPageContextOff(conversationId));
  const desiredSurfaceName = !turnedOff && pageSurfaceName ? pageSurfaceName : null;

  // A host that starts OFF: the first time this conversation is ready, mark it
  // off (remembering the page, so the chip can name it). Once per conversation.
  const seeded = useRef<string | null>(null);
  useEffect(() => {
    if (!conversationId || !conversationReady || seeded.current === conversationId) return;
    seeded.current = conversationId;
    if (!startsOn && !stampedSurfaceName) {
      dispatch(setPageContextOff({ conversationId, previousSurfaceName: pageSurfaceName }));
    }
  }, [dispatch, conversationId, conversationReady, startsOn, stampedSurfaceName, pageSurfaceName]);

  // While off, the remembered page follows the person.
  const rememberedPage = turnedOff?.previousSurfaceName ?? null;
  useEffect(() => {
    if (!conversationId || !turnedOff || !pageSurfaceName || rememberedPage === pageSurfaceName) return;
    dispatch(setPageContextOff({ conversationId, previousSurfaceName: pageSurfaceName }));
  }, [dispatch, conversationId, turnedOff, rememberedPage, pageSurfaceName]);

  useEffect(() => {
    if (!conversationId || !conversationReady) return;
    if (stampedSurfaceName === desiredSurfaceName) return;
    dispatch(patchConversation({ conversationId, surfaceName: desiredSurfaceName }));
    // Read the new page NOW, so the composer shows what the chat will get.
    if (desiredSurfaceName) void dispatch(refreshSurfaceScope({ conversationId }));
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
