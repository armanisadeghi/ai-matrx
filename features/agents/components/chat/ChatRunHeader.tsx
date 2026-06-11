"use client";

// ChatRunHeader — chat controls injected into the app shell header center slot
// (#shell-header-center) via <PageHeader>, exactly like AgentRunHeader does for
// the run route. A COMPACT agent picker (never full-width) + a new-chat button.
// Self-contained: the page passes the route's active agent; the live name comes
// from Redux.

import { useRouter } from "next/navigation";
import { useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { selectAgentName } from "@/features/agents/redux/agent-definition/selectors";
import { selectUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.selectors";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";
import { PlusTapButton } from "@/components/icons/tap-buttons";
import { stashChatDraftTransfer } from "./chat-draft-transfer";

interface ChatRunHeaderProps {
  /**
   * The agent that owns this route: the URL agent on `/chat/a/[agentId]`, the
   * conversation's initiating agent on `/chat/[conversationId]`, or the default
   * on `/chat/new`. Drives the picker label and is the target of the `+` button.
   */
  activeAgentId?: string;
  /** SSR-resolved name for first paint; replaced by the live Redux value. */
  initialAgentName?: string;
}

export function ChatRunHeader({
  activeAgentId,
  initialAgentName,
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

  // `+` always lands on the greeting/new-chat surface. Routing to
  // `/chat/a/[activeAgentId]` from the same route is a Next.js no-op (same URL),
  // which silently kept users in the existing conversation. `/chat/new` is the
  // single, canonical "start a new chat" entry point.
  const handleNewChat = () => {
    router.push("/chat/new");
  };

  // Desktop: `lg:w-full` makes this fill the header center slot so its contents
  // sit at the START (left edge, right after the sidebar) — forming a fixed
  // [collapse · agent · +] cluster with the sidebar's collapse toggle that never
  // drifts to center, mirroring AgentRunHeader. Mobile keeps the shrink-to-fit
  // centered layout (parent slot is `justify-center`) so the picker stays
  // between the hamburger and the avatar.
  return (
    <div className="flex min-w-0 items-center gap-1 lg:w-full">
      <div data-chat-agent-picker-trigger className="flex min-w-0 items-center">
        <AgentListDropdown
          onSelect={handleAgentSelect}
          label={label}
          compact
          noBorder
        />
      </div>
      <PlusTapButton
        onClick={handleNewChat}
        ariaLabel="New chat"
        tooltip="New chat (⌘K)"
      />
    </div>
  );
}
