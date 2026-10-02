"use client";

import { useAppSelector } from "../../../store/hooks";
import { selectInstanceDisplayTitle } from "../../redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { Dialog, DialogContent } from "@ai-matrx/design-system";
import { selectHasUnsentComposerDraft } from "../../redux/execution-system/instance-user-input/unsent-draft.selectors";
import { AgentRunner } from "../smart/AgentRunner";
import { useAgentShellAddress } from "./useAgentShellAddress";

interface AgentCompactModalProps {
  conversationId: string;
  onClose: () => void;
}

export function AgentCompactModal({
  conversationId,
  onClose,
}: AgentCompactModalProps) {
  const title = useAppSelector(selectInstanceDisplayTitle(conversationId));
  const hasUnsentDraft = useAppSelector(
    selectHasUnsentComposerDraft(conversationId),
  );
  useAgentShellAddress(conversationId, "modal-compact");

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md h-[50dvh] max-h-[70dvh] flex flex-col p-0 gap-0"
        // Unsent work in the composer: Escape never discards it.
        onEscapeKeyDown={(e) => {
          if (hasUnsentDraft) e.preventDefault();
        }}
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
          <span className="text-sm font-medium text-foreground truncate">
            {title ?? "Agent"}
          </span>
        </div>
        <AgentRunner
          conversationId={conversationId}
          compact
          className="flex-1 min-h-0 bg-background"
        />
      </DialogContent>
    </Dialog>
  );
}
