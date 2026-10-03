"use client";

/**
 * Keeps a page's OWN conversation's companion values (the canvas beside the
 * main chat) current BEFORE it sends, so the composer's value list — chip,
 * popover and full view — shows what the next turn will carry, not an empty
 * list until the first turn has left.
 *
 * It re-reads on mount, whenever a surface registers or unregisters, and
 * whenever a surface announces its live scope changed
 * (`announceSurfaceScopeChange` — the canvas host does, on every canvas state
 * change), coalesced so a burst of changes is ONE read. The write is
 * `previewCompanionScope`: the same entries the submit writes, own
 * conversation only, never the page.
 */

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "../../../../store/hooks";
import {
  getGlobalSurfaceRegistry,
  useIsPageOwnConversation,
} from "../../../../surfaces/runtime/SurfaceRuntimeContext";
import { subscribeSurfaceScopeChanges } from "../../../../surfaces/runtime/surface-chain";
import { previewCompanionScope } from "../../../redux/execution-system/thunks/refresh-surface-scope.thunk";

/** Quiet time before a re-read: a dragged column or a burst of tab changes is one read. */
export const COMPANION_PREVIEW_SETTLE_MS = 150;

export function useCompanionValuesPreview(conversationId: string): void {
  const dispatch = useAppDispatch();
  const ownPage = useIsPageOwnConversation(conversationId);
  const exists = useAppSelector((state) =>
    Boolean(state.conversations.byConversationId[conversationId]),
  );

  useEffect(() => {
    if (!ownPage || !exists) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const reread = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void dispatch(previewCompanionScope({ conversationId }));
      }, COMPANION_PREVIEW_SETTLE_MS);
    };
    reread();
    const offRegistry = getGlobalSurfaceRegistry().subscribe(reread);
    const offScope = subscribeSurfaceScopeChanges(reread);
    return () => {
      offRegistry();
      offScope();
      if (timer) clearTimeout(timer);
    };
  }, [dispatch, ownPage, exists, conversationId]);
}
