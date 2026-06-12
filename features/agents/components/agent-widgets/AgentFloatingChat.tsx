"use client";

import { useAppSelector } from "@/lib/redux/hooks";
import { selectInstanceDisplayTitle } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { AgentRunner } from "../smart/AgentRunner";
import { AgentChatHistorySidebar } from "./AgentChatHistorySidebar";

interface AgentFloatingChatProps {
  conversationId: string;
  onClose: () => void;
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function AgentFloatingChat({
  conversationId,
  onClose,
}: AgentFloatingChatProps) {
  const displayTitle = useAppSelector(
    selectInstanceDisplayTitle(conversationId),
  );

  return (
    <WindowPanel
      title={displayTitle}
      onClose={onClose}
      width={420}
      height="60dvh"
      minWidth={320}
      minHeight={280}
      bodyClassName="p-0"
      urlSyncKey="agent"
      urlSyncId={conversationId}
      urlSyncArgs={{ m: "fc" }}
      sidebar={<AgentChatHistorySidebar conversationId={conversationId} />}
      sidebarDefaultSize={250}
      sidebarMinSize={150}
      defaultSidebarOpen={false}
      sidebarExpandsWindow
      sidebarClassName="bg-muted/10"
      // footer={<AgentChatFooter conversationId={conversationId} />}
    >
      <AgentRunner conversationId={conversationId} compact className="h-full" />
    </WindowPanel>
  );
}
