/**
 * THE ONE display-mode → overlay map.
 *
 * A conversation's `displayMode` names the shell it is painted in. Exactly two
 * places need to turn that name into an overlay: `launchAgentExecution` (the
 * live open) and the `agent` URL hydrator (the SAME open, replayed from
 * `?panels=`). It lives here so the two can never disagree — the deep link
 * that reopened an agent as a different shell than the click did is the class
 * this module exists to make impossible.
 */

import { CHAT_WINDOWS, type ChatWindowId } from "../../../host/windows";
import type { ResultDisplayMode } from "../../utils/run-ui-utils";

export const DISPLAY_MODE_TO_OVERLAY_ID: Partial<
  Record<ResultDisplayMode, ChatWindowId>
> = {
  "modal-full": CHAT_WINDOWS.agentFullModal,
  "modal-compact": CHAT_WINDOWS.agentCompactModal,
  "chat-bubble": CHAT_WINDOWS.agentChatBubble,
  inline: CHAT_WINDOWS.agentInlineOverlay,
  sidebar: CHAT_WINDOWS.agentSidebarOverlay,
  "flexible-panel": CHAT_WINDOWS.agentFlexiblePanel,
  panel: CHAT_WINDOWS.agentPanelOverlay,
  toast: CHAT_WINDOWS.agentToastOverlay,
  "floating-chat": CHAT_WINDOWS.agentFloatingChat,
  "chat-collapsible": CHAT_WINDOWS.agentChatCollapsible,
  "chat-assistant": CHAT_WINDOWS.agentChatAssistant,
};
