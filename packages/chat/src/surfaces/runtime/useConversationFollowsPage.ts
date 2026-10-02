"use client";

/**
 * useConversationFollowsPage — EVERY conversation shown in a composer gets the
 * live values of the page it is shown on, and keeps getting them as the person
 * moves from page to page (Arman, 2026-09-30: "when an agent opens up
 * anywhere, the context needs to be added for that place … we get no opinion
 * about it").
 *
 * ONE rule, one exception:
 *   - every conversation follows `useActivePageSurface()` — the page (or the
 *     overlay on top of it) the person is looking at — whether it was just
 *     launched, loaded from history into a window, or opened beside the page;
 *   - EXCEPT the page's OWN conversation (`isPageOwnConversation` — the main
 *     chat, the builder's test run, the runner's run, each battle lane): it IS
 *     the page and never receives itself as context. Left untouched here.
 *
 * Mounted by `ConversationContextRail`, which every composer renders — so no
 * host can forget it, and no host decides otherwise. The person's own choice
 * is the composer chip's page switch (`setPageContextEnabled`) for this
 * conversation, and per-value rules (common-docs context-delivery RULES.md).
 *
 * The page is READ (`refreshSurfaceScope`) when the stamp changes AND when a
 * composer first shows a conversation that already carries the stamp — a chat
 * loaded from history used to show "Agent Builder 0" until its next send.
 * Every send re-reads it again inside the send path itself.
 */

import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@host/lib/redux/hooks";
import { patchConversation } from "../../agents/redux/execution-system/conversations/conversations.slice";
import { replaceSurfaceVariableValues } from "../../agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
import { replaceSurfaceContextEntries } from "../../agents/redux/execution-system/instance-context/instance-context.slice";
import { selectPageContextOff } from "../../agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { setPageContextOff } from "../../agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { refreshSurfaceScope } from "../../agents/redux/execution-system/thunks/refresh-surface-scope.thunk";
import { isPageOwnConversation, useIsPageOwnConversation } from "./SurfaceRuntimeContext";
import { useActivePageSurface } from "./useActivePageSurface";
import { getSurfaceDisplayLabel } from "../utils/surface-display";

export interface PageFollowState {
  /** The page surface the person is looking at; null on an unregistered page. */
  pageSurfaceName: string | null;
  /** Its canonical display label (THE NAMING LAW); null with no surface. */
  pageSurfaceLabel: string | null;
}

export function useConversationFollowsPage(
  conversationId: string | null,
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

  // While off, the remembered page follows the person.
  const rememberedPage = turnedOff?.previousSurfaceName ?? null;
  useEffect(() => {
    if (!conversationId || !turnedOff || !pageSurfaceName || rememberedPage === pageSurfaceName) return;
    dispatch(setPageContextOff({ conversationId, previousSurfaceName: pageSurfaceName }));
  }, [dispatch, conversationId, turnedOff, rememberedPage, pageSurfaceName]);

  // The page's OWN conversation is the page: it never receives itself.
  // Reactive (re-renders when a provider registers or changes what it owns),
  // and re-read live inside each effect: the page's provider registers in a
  // layout effect of this same commit, after this render already ran.
  const ownConversation = useIsPageOwnConversation(conversationId);

  // ...and never keeps a page stamp or page values from before it was known
  // to be the page's own (an older launch, or a read made in the instant a
  // route swap had no provider mounted).
  useEffect(() => {
    if (!conversationId || !conversationReady || stampedSurfaceName === null) return;
    if (!ownConversation && !isPageOwnConversation(conversationId)) return;
    dispatch(patchConversation({ conversationId, surfaceName: null }));
    dispatch(replaceSurfaceVariableValues({ conversationId, values: {} }));
    dispatch(replaceSurfaceContextEntries({ conversationId, entries: [] }));
  }, [dispatch, conversationId, conversationReady, ownConversation, stampedSurfaceName]);

  // A composer showing a conversation that ALREADY carries the right stamp
  // (loaded from history, reopened in a window) reads the page once, now —
  // so the chip shows what the next turn will carry instead of nothing.
  const readOnShow = useRef<string | null>(null);
  useEffect(() => {
    if (!conversationId || !conversationReady) return;
    if (ownConversation || isPageOwnConversation(conversationId)) return;
    if (!desiredSurfaceName || stampedSurfaceName !== desiredSurfaceName) return;
    if (readOnShow.current === conversationId) return;
    readOnShow.current = conversationId;
    void dispatch(refreshSurfaceScope({ conversationId }));
  }, [dispatch, conversationId, conversationReady, ownConversation, desiredSurfaceName, stampedSurfaceName]);

  useEffect(() => {
    if (!conversationId || !conversationReady) return;
    if (ownConversation || isPageOwnConversation(conversationId)) return;
    // An unregistered page has nothing to follow: a conversation launched with
    // its own surface keeps it. Only the person's switch clears a stamp.
    if (!turnedOff && !pageSurfaceName) return;
    if (stampedSurfaceName === desiredSurfaceName) return;
    dispatch(patchConversation({ conversationId, surfaceName: desiredSurfaceName }));
    // Read the new page NOW, so the composer shows what the chat will get.
    if (desiredSurfaceName) void dispatch(refreshSurfaceScope({ conversationId }));
    if (!desiredSurfaceName) {
      // Off means OFF: drop what the page already handed over.
      dispatch(replaceSurfaceVariableValues({ conversationId, values: {} }));
      dispatch(replaceSurfaceContextEntries({ conversationId, entries: [] }));
    }
  }, [dispatch, conversationId, conversationReady, ownConversation, turnedOff, pageSurfaceName, stampedSurfaceName, desiredSurfaceName]);

  return {
    pageSurfaceName,
    pageSurfaceLabel: pageSurfaceName ? getSurfaceDisplayLabel(pageSurfaceName) : null,
  };
}
