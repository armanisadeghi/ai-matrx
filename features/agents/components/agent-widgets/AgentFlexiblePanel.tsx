"use client";

import { useAppSelector } from "@/lib/redux/hooks";
import { selectInstanceDisplayTitle } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { AgentRunner } from "../smart/AgentRunner";

interface AgentFlexiblePanelProps {
  conversationId: string;
  onClose: () => void;
}

export function AgentFlexiblePanel({
  conversationId,
  onClose,
}: AgentFlexiblePanelProps) {
  const title = useAppSelector(selectInstanceDisplayTitle(conversationId));

  return (
    <WindowPanel
      id={`agent-${conversationId}`}
      title={title}
      onClose={onClose}
      width={680}
      height={700}
      minWidth={300}
      minHeight={250}
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
