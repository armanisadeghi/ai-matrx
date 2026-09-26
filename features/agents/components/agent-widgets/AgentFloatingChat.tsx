"use client";

import { useAppSelector } from "@/lib/redux/hooks";
import { selectInstanceDisplayTitle } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { agentPanelUrlArgs } from "@/features/window-panels/windows/agents/agentPanelSurfaceAddress";
import { AgentRunner } from "../smart/AgentRunner";
import { AgentChatHistorySidebar } from "./AgentChatHistorySidebar";

interface AgentFloatingChatProps {
  /** Overlay instance id — unique per open panel; also the window-manager id. */
  instanceId: string;
  conversationId: string;
  onClose?: () => void;
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function AgentFloatingChat({
  instanceId,
  conversationId,
  onClose,
}: AgentFloatingChatProps) {
  const displayTitle = useAppSelector(
    selectInstanceDisplayTitle(conversationId),
  );

  // The page surface this conversation is bound to rides in the address, so a
  // reload restores the binding with the window (agentPanelSurfaceAddress.ts).
  const surfaceName = useAppSelector(
    (state) =>
      state.conversations.byConversationId[conversationId]?.surfaceName ??
      null,
  );

  return (
    <WindowPanel
      id={instanceId}
      overlayId="agentFloatingChat"
      title={displayTitle}
      onClose={onClose}
      width={420}
      height="60dvh"
      minWidth={320}
      minHeight={280}
      bodyClassName="p-0"
      urlSyncKey="agent"
      urlSyncId={conversationId}
      urlSyncArgs={agentPanelUrlArgs("fc", surfaceName)}
      sidebar={<AgentChatHistorySidebar conversationId={conversationId} />}
      sidebarDefaultSize={250}
      sidebarMinSize={150}
      defaultSidebarOpen={false}
      sidebarExpandsWindow
      sidebarClassName="bg-muted/10 border-2 border-red-500"
      // footer={<AgentChatFooter conversationId={conversationId} />}
    >
      <AgentRunner conversationId={conversationId} compact className="h-full" />
    </WindowPanel>
  );
}
