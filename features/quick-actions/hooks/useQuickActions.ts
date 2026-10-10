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
import { useQuickToolToggle } from "@/features/canvas/host/quickToolLaunchers";
import { resolveMandateAsking } from "@ai-matrx/chat/mandates/resolve-asking";

export type OpenChatWindowOptions = Pick<
  OpenAgentRunWindowOptions,
  "initialAgentId" | "initialSelectedConversationId"
>;

/**
 * Hook for launching the quick tools from anywhere in the app. Chat, Notes,
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

  // Launchers behave like toolbar icons: a press opens, focuses, or (in front) closes/hides.
  const notes = useQuickToolToggle("quick-notes");
  const tasks = useQuickToolToggle("quick-tasks");
  const chat = useQuickToolToggle("quick-chat");
  const data = useQuickToolToggle("quick-data");
  const scratchpad = useQuickToolToggle("global-scratchpad");

  const openQuickNotes = notes.toggle;
  const openQuickTasks = tasks.toggle;
  const openQuickChat = chat.toggle;

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
            agentId = (await resolveMandateAsking(DEFAULT_NEW_CHAT_MANDATE_KEY))
              .agentId;
          } catch (error) {
            // Resolution failed (e.g. the organization question was dismissed): fall back to the picker.
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

  const openQuickData = data.toggle;

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
  const openScratchpad = scratchpad.toggle;

  return {
    /** Which launchers' tabs are in front right now — for pressed states. */
    isVisible: {
      notes: notes.isVisible,
      tasks: tasks.isVisible,
      chat: chat.isVisible,
      data: data.isVisible,
      scratchpad: scratchpad.isVisible,
    },
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
