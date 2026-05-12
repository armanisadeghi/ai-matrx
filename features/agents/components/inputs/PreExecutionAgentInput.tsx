"use client";

/**
 * AgentPreExecutionInput
 *
 * Focused gate component — NOT a chat interface. Shown before the main display
 * when showPreExecutionGate is true and preExecutionSatisfied is false.
 *
 * Uses SmartAgentInput in compact mode with send disabled so the user gets
 * full functionality (variables, resources, audio, paste) in a tight layout.
 * Title bar with small cancel (X) and continue (check) icons.
 *
 * Flow:
 *   1. SmartAgentInput writes to Redux in real-time (text, variables, resources)
 *   2. User clicks check icon → setPreExecutionSatisfied(true)
 *   3. AgentRunner sees gate flip → renders the main display
 *   4. If autoRun, execution fires immediately with everything already in Redux
 */

import { Check, X } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setPreExecutionSatisfied } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { selectPreExecutionMessage } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { selectHasUserInput } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.selectors";
import { destroyInstanceIfAllowed } from "@/features/agents/redux/execution-system/conversations/conversations.thunks";
import { selectInstanceAgentName } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { SmartAgentInput } from "./smart-input/SmartAgentInput";

interface PreExecutionAgentInputProps {
  conversationId: string;
}

export function PreExecutionAgentInput({
  conversationId,
}: PreExecutionAgentInputProps) {
  const dispatch = useAppDispatch();
  const title = useAppSelector(selectInstanceAgentName(conversationId));

  console.log("[PreExecutionAgentInput] title", title);

  const hasInput = useAppSelector(selectHasUserInput(conversationId));
  const preExecutionMessage = useAppSelector(
    selectPreExecutionMessage(conversationId),
  );

  const handleContinue = () => {
    dispatch(setPreExecutionSatisfied({ conversationId, value: true }));
  };

  const handleCancel = () => {
    dispatch(destroyInstanceIfAllowed(conversationId));
  };

  return (
    <div className="flex flex-col max-w-[400px] h-[300px] border border-red-500">
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <p className="text-sm font-medium text-foreground truncate flex-1">
          {title ?? "Please enter details..."}
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

      <div className="px-3 pt-0.5 pb-3 border border-blue-500">
        <SmartAgentInput
          conversationId={conversationId}
          compact
          showSubmitOnEnterToggle={false}
          disableSend
        />
      </div>
    </div>
  );
}
