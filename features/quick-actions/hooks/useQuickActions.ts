// features/quick-actions/hooks/useQuickActions.ts
"use client";

import { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import {
  useOpenAgentRunWindow,
  type OpenAgentRunWindowOptions,
} from "@/features/overlays/openers/agentRunWindow";
import { DEFAULT_NEW_CHAT_MANDATE_KEY } from "@ai-matrx/chat/agents/components/chat/chat-quick-actions.config";
import { resolveMandate } from "@ai-matrx/chat/mandates/service";
import { useOpenQuickChat } from "@/features/quick-actions/canvas/quickChatKind";
import { useOpenQuickData } from "@/features/quick-actions/canvas/quickDataKind";
import { useOpenScratchpad } from "@/features/quick-actions/canvas/scratchpadKind";
import { useOpenQuickNotes } from "@/features/notes/canvas/quickNotesKind";
import { useOpenQuickTasks } from "@/features/tasks/canvas/quickTasksKind";

export type OpenChatWindowOptions = Pick<
  OpenAgentRunWindowOptions,
  "initialAgentId" | "initialSelectedConversationId"
>;

/**
 * Hook for opening the quick tools from anywhere in the app. Chat, Notes,
 * Tasks, Data and the Scratchpad open as canvas tabs; the rest are windows.
 *
 * @example
 * const { openQuickNotes, openQuickTasks } = useQuickActions();
 *
 * <Button onClick={openQuickNotes}>Open Notes</Button>
 */
export function useQuickActions() {
  const dispatch = useAppDispatch();
  const openAgentRunWindow = useOpenAgentRunWindow();

  const openQuickNotesTab = useOpenQuickNotes();
  const openQuickTasksTab = useOpenQuickTasks();
  const openQuickChatTab = useOpenQuickChat();
  const openQuickDataTab = useOpenQuickData();
  const openScratchpadTab = useOpenScratchpad();

  const openQuickNotes = () => void openQuickNotesTab();
  const openQuickTasks = () => void openQuickTasksTab({});
  const openQuickChat = () => void openQuickChatTab({});

  /**
   * Opens the floating Chat window panel (`agentRunWindow`) with the same
   * default agent as `/chat/new` — the `chat.default_new_chat` MANDATE, resolved
   * at open time so the user's own binding wins. Callers that need a specific
   * agent pass `initialAgentId` explicitly (e.g. agent options menu, item
   * cards). Mandate-resolution failure is loud and degrades to the window's own
   * "pick an agent" state — never a hardcoded fallback agent.
   */
  const openChatWindow = useCallback(
    (opts: OpenChatWindowOptions = {}) => {
      void (async () => {
        let agentId = opts.initialAgentId ?? null;
        if (!agentId) {
          try {
            agentId = (await resolveMandate(DEFAULT_NEW_CHAT_MANDATE_KEY))
              .agentId;
          } catch (error) {
            console.error(
              `[useQuickActions] mandate "${DEFAULT_NEW_CHAT_MANDATE_KEY}" failed to resolve — opening the Chat window with the agent picker:`,
              error,
            );
          }
        }
        openAgentRunWindow({
          initialAgentId: agentId,
          initialSelectedConversationId:
            opts.initialSelectedConversationId ?? null,
        });
      })();
    },
    [openAgentRunWindow],
  );

  const openQuickData = () => void openQuickDataTab({});

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
  const openScratchpad = () => void openScratchpadTab();

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
