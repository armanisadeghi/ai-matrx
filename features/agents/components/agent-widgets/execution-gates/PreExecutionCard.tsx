import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { selectPreExecutionMessage } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { selectInstanceAgentName } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { selectHasUserInput } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.selectors";
import { setPreExecutionSatisfied } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { destroyInstanceIfAllowed } from "@/features/agents/redux/execution-system/conversations/conversations.thunks";
import { SmartAgentInput } from "../../inputs/smart-input/SmartAgentInput";
import { cn } from "@/lib/utils";

// ─── Pre-execution compact card (portalled, no WindowPanel) ──────────────────

export function PreExecutionCard({
  conversationId,
  onClose,
}: {
  conversationId: string;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const agentName = useAppSelector(selectInstanceAgentName(conversationId));
  const hasInput = useAppSelector(selectHasUserInput(conversationId));
  const preExecutionMessage = useAppSelector(
    selectPreExecutionMessage(conversationId),
  );

  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  const handleContinue = () => {
    dispatch(setPreExecutionSatisfied({ conversationId, value: true }));
  };

  const handleCancel = () => {
    dispatch(destroyInstanceIfAllowed(conversationId));
    onClose();
  };

  const card = (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-[2px]"
        onClick={handleCancel}
      />

      <div
        className={cn(
          "relative z-10 w-full max-w-sm mx-4",
          "rounded-xl bg-card/98 backdrop-blur-md border border-border shadow-2xl",
          "overflow-hidden",
        )}
      >
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <p className="text-sm font-medium text-foreground truncate flex-1">
            {agentName ?? "Please enter details..."}
          </p>
          <div className="flex items-center gap-1 shrink-0 ml-2">
            <button
              type="button"
              onClick={handleCancel}
              className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Cancel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleContinue}
              className="h-6 w-6 flex items-center justify-center rounded-md text-primary hover:text-primary hover:bg-primary/10 transition-colors"
              title={hasInput ? "Continue" : "Skip"}
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {preExecutionMessage && (
          <div className="px-4 pb-1">
            <p className="text-xs text-muted-foreground leading-relaxed">
              {preExecutionMessage}
            </p>
          </div>
        )}

        <div className="px-3 pt-0.5 pb-3">
          <SmartAgentInput
            conversationId={conversationId}
            compact
            showSubmitOnEnterToggle={false}
            disableSend
          />
        </div>
      </div>
    </div>
  );

  return portalTarget ? createPortal(card, portalTarget) : null;
}
