"use client";

import { AgentGateBody } from "@/features/agents/components/agent-widgets/execution-gates/AgentGateInput";
import type { OverlayId } from "@/features/window-panels/registry/overlay-ids";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";

interface AgentGateWindowProps {
  instanceId: string;
  conversationId: string;
  downstreamOverlayId?: OverlayId;
  isOpen: boolean;
  onClose: () => void;
}

export default function AgentGateWindow({
  instanceId,
  conversationId,
  downstreamOverlayId,
  isOpen,
  onClose,
}: AgentGateWindowProps) {
  if (!isOpen) return null;
  return (
    // Without its own menu a right-click here fell through to whatever page
    // sat underneath the gate — this is a blocking approval decision, not a
    // browsable record, so the menu carries content-only Copy/Export and
    // nothing entity-bound.
    // context-menu-exempt: entity — a pre-execution gate decision, not a record
    // context-menu-exempt: surfaceName — no registered surface manifest carries this window's values
    <NonEditableContextMenu sourceFeature="agent-builder" contentSource={{ type: "raw" }}>
      <AgentGateBody
        conversationId={conversationId}
        windowInstanceId={instanceId}
        downstreamOverlayId={downstreamOverlayId}
        onClose={onClose}
      />
    </NonEditableContextMenu>
  );
}
