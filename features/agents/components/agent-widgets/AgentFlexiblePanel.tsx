"use client";

import { useAppSelector } from "@/lib/redux/hooks";
import { selectInstanceDisplayTitle } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { AgentRunner } from "../smart/AgentRunner";

/** Match `AgentFullModal` (`max-w-3xl` × `h-[85dvh]`). */
const AGENT_FLEXIBLE_PANEL_WIDTH = 768;
const AGENT_FLEXIBLE_PANEL_HEIGHT = "85vh";

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
      urlSyncArgs={{ m: "flexible-panel" }}
    >
      <AgentRunner
        conversationId={conversationId}
        className="h-full bg-background"
      />
    </WindowPanel>
  );
}
