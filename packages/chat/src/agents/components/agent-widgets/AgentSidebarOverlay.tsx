"use client";

import { useAppSelector } from "../../../store/hooks";
import { selectInstanceDisplayTitle } from "../../redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { selectHasUnsentComposerDraft } from "../../redux/execution-system/instance-user-input/unsent-draft.selectors";
import { FloatingSheet } from "@ai-matrx/chat/host/ui-slots";
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
  const hasUnsentDraft = useAppSelector(
    selectHasUnsentComposerDraft(conversationId),
  );
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
      holdsUnsentWork={hasUnsentDraft}
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
