"use client";

// ChatRunHeader — chat controls injected into the app shell header center slot
// (#shell-header-center) via <PageHeader>, exactly like AgentRunHeader does for
// the run route. A COMPACT agent picker (never full-width). Self-contained:
// the page passes the route's active agent; the live name comes from Redux.

import { useRouter } from "next/navigation";
import { useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { selectAgentName } from "@/features/agents/redux/agent-definition/selectors";
import { selectUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.selectors";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";
import { ActiveContextButton } from "@/features/scopes/components/active-context/ActiveContextButton";
import { ChatCanvasButton } from "./ChatCanvasButton";
import { stashChatDraftTransfer } from "./chat-draft-transfer";

interface ChatRunHeaderProps {
  /**
   * The agent that owns this route: the URL agent on `/chat/a/[agentId]`, the
   * conversation's initiating agent on `/chat/[conversationId]`, or the default
   * on `/chat/new`. Drives the picker label.
   */
  activeAgentId?: string;
  /** SSR-resolved name for first paint; replaced by the live Redux value. */
  initialAgentName?: string;
  /** Active conversation (present on `/chat/[conversationId]`). Lets the Canvas
   *  button open this conversation's working document when the Canvas is empty. */
  conversationId?: string;
}

export function ChatRunHeader({
  activeAgentId,
  initialAgentName,
  conversationId,
}: ChatRunHeaderProps) {
  const router = useRouter();
  const store = useAppStore();
  const liveName = useAppSelector((state) =>
    activeAgentId ? selectAgentName(state, activeAgentId) : undefined,
  );
  const label =
    liveName?.trim() || initialAgentName?.trim() || "Select an agent";

  const handleAgentSelect = (id: string) => {
    if (id === activeAgentId) return;
    // Carry any in-progress draft over to the newly-selected agent so switching
    // agents never destroys what the user has typed. Mirrors the chip path in
    // NewChatGreeting: snapshot the current surface's draft via getState (no
    // per-keystroke subscription) and stash it for the destination route's
    // consumeChatDraftTransfer in ChatRoomClient.
    if (activeAgentId) {
      const state = store.getState();
      const sourceSurfaceKey = `chat-route:${activeAgentId}`;
      const sourceConversationId =
        state.conversationFocus.bySurface[sourceSurfaceKey]?.input ??
        state.conversationFocus.bySurface[sourceSurfaceKey]?.display ??
        null;
      const draftText = sourceConversationId
        ? selectUserInputText(sourceConversationId)(state)
        : "";
      if (draftText && draftText.trim().length > 0) {
        stashChatDraftTransfer({ text: draftText, targetAgentId: id });
      }
    }
    router.push(`/chat/a/${encodeURIComponent(id)}`);
  };

  // Full-width bar with a hard left/right split at every breakpoint: agent +
  // context stay pinned left; canvas stays pinned right inside the center slot.
  // (Previously `lg:w-full` + a single row let the inject zone center the
  // shrink-wrapped cluster on mobile/tablet, which pushed controls into the
  // avatar and broke the layout.)
  return (
    <div className="flex w-full min-w-0 items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-1 overflow-hidden">
        <div
          data-chat-agent-picker-trigger
          className="flex min-w-0 items-center"
        >
          <AgentListDropdown
            onSelect={handleAgentSelect}
            label={label}
            compact
            noBorder
          />
        </div>
        {/* Working context — sets appContextSlice, which execute-instance reads
            and stamps onto every run. Icon-only so the header stays compact on
            mobile; count badge shows when context is set. */}
        <ActiveContextButton
          size="xs"
          iconOnly
          className="shrink-0"
          triggerClassName="w-auto shrink-0"
          checkboxVariant="standard"
        />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {/* Canvas — the unified live workspace, one click away at the top. */}
        <ChatCanvasButton conversationId={conversationId} />
      </div>
    </div>
  );
}
