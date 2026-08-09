// features/quick-actions/hooks/useQuickActions.ts
"use client";

import { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { DEFAULT_NEW_CHAT_SLOT_KEY } from "@/features/agents/components/chat/chat-quick-actions.config";
import { resolveAgentSlot } from "@/features/agents/slots/service";

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
   * default agent as `/chat/new` — the `chat.default_new_chat` SLOT, resolved
   * at open time so the user's own binding wins. Callers that need a specific
   * agent pass `initialAgentId` explicitly (e.g. agent options menu, item
   * cards). Slot-resolution failure is loud and degrades to the window's own
   * "pick an agent" state — never a hardcoded fallback agent.
   */
  const openChatWindow = useCallback(
    (opts: OpenChatWindowOptions = {}) => {
      void (async () => {
        let agentId = opts.initialAgentId ?? null;
        if (!agentId) {
          try {
            agentId = (await resolveAgentSlot(DEFAULT_NEW_CHAT_SLOT_KEY)).agentId;
          } catch (error) {
            console.error(
              `[useQuickActions] slot "${DEFAULT_NEW_CHAT_SLOT_KEY}" failed to resolve — opening the Chat window with the agent picker:`,
              error,
            );
          }
        }
        dispatch(
          openOverlay({
            overlayId: "agentRunWindow",
            data: {
              initialAgentId: agentId,
              initialSelectedConversationId:
                opts.initialSelectedConversationId ?? null,
            },
          }),
        );
      })();
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

  /** The user's global scratchpad — one click from any page. */
  const openScratchpad = useCallback(() => {
    dispatch(openOverlay({ overlayId: "scratchpadPanel" }));
  }, [dispatch]);

  return {
    openScratchpad,
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
