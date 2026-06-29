// features/quick-actions/hooks/useQuickActions.ts
"use client";

import { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { DEFAULT_NEW_CHAT_AGENT_ID } from "@/features/agents/components/chat/chat-quick-actions.config";

export interface OpenChatWindowOptions {
  initialAgentId?: string | null;
  initialSelectedConversationId?: string | null;
}

/**
 * Hook for opening quick action sheets via Redux
 *
 * This allows quick actions to be triggered from anywhere in the app
 * without needing to render the sheets in every component.
 *
 * @example
 * const { openQuickNotes, openQuickTasks } = useQuickActions();
 *
 * <Button onClick={openQuickNotes}>Open Notes</Button>
 */
export function useQuickActions() {
  const dispatch = useAppDispatch();

  const openQuickNotes = useCallback(
    (data?: any) => {
      dispatch(openOverlay({ overlayId: "quickNotes", data }));
    },
    [dispatch],
  );

  const openQuickTasks = useCallback(
    (data?: any) => {
      dispatch(openOverlay({ overlayId: "quickTasks", data }));
    },
    [dispatch],
  );

  const openQuickChat = useCallback(
    (data?: any) => {
      dispatch(openOverlay({ overlayId: "quickChat", data }));
    },
    [dispatch],
  );

  /**
   * Opens the floating Chat window panel (`agentRunWindow`) with the same
   * default agent as `/chat/new`. Callers that need a specific agent should
   * pass `initialAgentId` explicitly (e.g. agent options menu, item cards).
   */
  const openChatWindow = useCallback(
    (opts: OpenChatWindowOptions = {}) => {
      dispatch(
        openOverlay({
          overlayId: "agentRunWindow",
          data: {
            initialAgentId: opts.initialAgentId ?? DEFAULT_NEW_CHAT_AGENT_ID,
            initialSelectedConversationId:
              opts.initialSelectedConversationId ?? null,
          },
        }),
      );
    },
    [dispatch],
  );

  const openQuickData = useCallback(
    (data?: any) => {
      dispatch(openOverlay({ overlayId: "quickData", data }));
    },
    [dispatch],
  );

  const openQuickFiles = useCallback(
    (data?: any) => {
      // Phase 11 removed the legacy `quickFiles` sheet. Quick file access
      // now opens the cloud-files window registered in Phase 6.
      dispatch(openOverlay({ overlayId: "cloudFilesWindow", data }));
    },
    [dispatch],
  );

  const openQuickUtilities = useCallback(
    (data?: any) => {
      dispatch(openOverlay({ overlayId: "quickUtilities", data }));
    },
    [dispatch],
  );

  const openQuickChatHistory = useCallback(
    (data?: any) => {
      dispatch(openOverlay({ overlayId: "quickChatHistory", data }));
    },
    [dispatch],
  );

  const openVoicePad = useCallback(() => {
    dispatch(openOverlay({ overlayId: "voicePad" }));
  }, [dispatch]);

  return {
    openQuickNotes,
    openQuickTasks,
    openQuickChat,
    openChatWindow,
    openQuickData,
    openQuickFiles,
    openQuickUtilities,
    openQuickChatHistory,
    openVoicePad,
  };
}
