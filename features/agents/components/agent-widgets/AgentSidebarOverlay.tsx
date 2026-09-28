"use client";

import { useAppSelector } from "@/lib/redux/hooks";
import { selectInstanceDisplayTitle } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import FloatingSheet from "@/components/official/FloatingSheet";
import { AgentRunner } from "../smart/AgentRunner";
import { useAgentShellAddress } from "./useAgentShellAddress";

interface AgentSidebarOverlayProps {
  conversationId: string;
  onClose: () => void;
}

export function AgentSidebarOverlay({
  conversationId,
  onClose,
}: AgentSidebarOverlayProps) {
  const title = useAppSelector(selectInstanceDisplayTitle(conversationId));
  useAgentShellAddress(conversationId, "sidebar");

  return (
    <FloatingSheet
      isOpen={true}
      onClose={onClose}
      title={title}
      position="right"
      width="2xl"
      height="full"
      closeOnBackdropClick={true}
      closeOnEsc={true}
      showCloseButton={true}
      contentClassName="p-0"
      lockScroll={false}
    >
      <AgentRunner
        conversationId={conversationId}
        className="h-full bg-background"
      />
    </FloatingSheet>
  );
}
