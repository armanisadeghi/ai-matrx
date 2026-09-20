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

import type { OverlayId } from "@/features/overlays/catalogue";
import type { ResultDisplayMode } from "@/features/agents/utils/run-ui-utils";

export const DISPLAY_MODE_TO_OVERLAY_ID: Partial<
  Record<ResultDisplayMode, OverlayId>
> = {
  "modal-full": "agentFullModal",
  "modal-compact": "agentCompactModal",
  "chat-bubble": "agentChatBubble",
  inline: "agentInlineOverlay",
  sidebar: "agentSidebarOverlay",
  "flexible-panel": "agentFlexiblePanel",
  panel: "agentPanelOverlay",
  toast: "agentToastOverlay",
  "floating-chat": "agentFloatingChat",
  "chat-collapsible": "agentChatCollapsible",
  "chat-assistant": "agentChatAssistant",
};
