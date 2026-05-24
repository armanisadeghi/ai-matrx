"use client";

// ChatRunHeader — chat controls injected into the app shell header center slot
// (#shell-header-center) via <PageHeader>, exactly like AgentRunHeader does for
// the run route. A COMPACT agent picker (never full-width) + a new-chat button.
// Self-contained: the page passes the route's active agent; the live name comes
// from Redux.

import { useRouter } from "next/navigation";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAgentName } from "@/features/agents/redux/agent-definition/selectors";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";
import { PlusTapButton } from "@/components/icons/tap-buttons";

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
  const liveName = useAppSelector((state) =>
    activeAgentId ? selectAgentName(state, activeAgentId) : undefined,
  );
  const label =
    liveName?.trim() || initialAgentName?.trim() || "Select an agent";

  const handleAgentSelect = (id: string) => {
    if (id === activeAgentId) return;
    router.push(`/chat/a/${encodeURIComponent(id)}`);
  };

  // `+` starts a NEW conversation with the ACTIVE agent (the agent route always
  // mints a fresh conversation). No active agent → the default greeting landing.
  const handleNewChat = () => {
    if (activeAgentId) {
      router.push(`/chat/a/${encodeURIComponent(activeAgentId)}`);
    } else {
      router.push("/chat/new");
    }
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
