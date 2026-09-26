"use client";

import { useAppSelector } from "@/lib/redux/hooks";
import { selectInstanceDisplayTitle } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { agentPanelUrlArgs } from "@/features/window-panels/windows/agents/agentPanelSurfaceAddress";
import { AgentRunner } from "../smart/AgentRunner";

/** Match `AgentFullModal` (`max-w-3xl` × `h-[85dvh]`). */
const AGENT_FLEXIBLE_PANEL_WIDTH = 768;
const AGENT_FLEXIBLE_PANEL_HEIGHT = "85dvh";

interface AgentFlexiblePanelProps {
  /** Overlay instance id — unique per open panel; also the window-manager id. */
  instanceId: string;
  conversationId: string;
  onClose?: () => void;
}

export function AgentFlexiblePanel({
  instanceId,
  conversationId,
  onClose,
}: AgentFlexiblePanelProps) {
  const title = useAppSelector(selectInstanceDisplayTitle(conversationId));

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
      overlayId="agentFlexiblePanel"
      title={title}
      onClose={onClose}
      width={AGENT_FLEXIBLE_PANEL_WIDTH}
      height={AGENT_FLEXIBLE_PANEL_HEIGHT}
      minWidth={480}
      minHeight={320}
      bodyClassName="p-0"
      urlSyncKey="agent"
      urlSyncId={conversationId}
      urlSyncArgs={agentPanelUrlArgs("flexible-panel", surfaceName)}
    >
      <AgentRunner
        conversationId={conversationId}
        className="h-full bg-background"
      />
    </WindowPanel>
  );
}
