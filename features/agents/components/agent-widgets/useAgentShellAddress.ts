"use client";

/**
 * useAgentShellAddress — a conversation shell that is NOT a WindowPanel (the
 * side drawer, the side panel, the compact and full modals) publishes the same
 * `?panels=agent:<conversationId>:m-<mode>` token a floating window does.
 *
 * The `agent` hydrator (initUrlHydration.ts) already restores every one of
 * these modes, but nothing ever WROTE their token: the drawer lived only in
 * Redux, so any full reload (a dev-server restart, a refresh, a shared link)
 * silently dropped it. One hook, used by every such shell, so the address and
 * the shell can never disagree again. Closing the shell unregisters the token.
 */

import { useAppSelector } from "@/lib/redux/hooks";
import { useUrlSync } from "@/features/window-panels/url-sync/useUrlSync";
import { agentPanelUrlArgs } from "@/features/window-panels/windows/agents/agentPanelSurfaceAddress";
import type { ResultDisplayMode } from "@/features/agents/utils/run-ui-utils";

export function useAgentShellAddress(
  conversationId: string,
  mode: Extract<ResultDisplayMode, "sidebar" | "panel" | "modal-compact" | "modal-full">,
): void {
  const surfaceName = useAppSelector(
    (state) =>
      state.conversations.byConversationId[conversationId]?.surfaceName ?? null,
  );
  useUrlSync(
    conversationId ? "agent" : undefined,
    conversationId || undefined,
    agentPanelUrlArgs(mode, surfaceName),
  );
}
