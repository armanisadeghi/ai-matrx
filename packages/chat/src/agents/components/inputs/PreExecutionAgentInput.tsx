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
import { useAppDispatch, useAppSelector } from "../../../store/hooks";
import { setPreExecutionSatisfied } from "../../redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { selectPreExecutionMessage } from "../../redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { selectHasUserInput } from "../../redux/execution-system/instance-user-input/instance-user-input.selectors";
import { destroyInstanceIfAllowed } from "../../redux/execution-system/conversations/conversations.thunks";
import { selectInstanceAgentName } from "../../redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { SmartAgentInput } from "./smart-input/SmartAgentInput";
import { useComposerMode } from "./smart-input/composer/useComposerMode";
import { Button } from "@ai-matrx/design-system/controls";

interface PreExecutionAgentInputProps {
  conversationId: string;
}

export function PreExecutionAgentInput({
  conversationId,
}: PreExecutionAgentInputProps) {
  const dispatch = useAppDispatch();
  const { mode: composerMode } = useComposerMode();
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
          <Button variant="quiet" icon={<X />} onClick={handleCancel} title="Cancel" aria-label="Cancel" />
          <Button variant="quiet" tone="primary" icon={<Check />} onClick={handleContinue} title={hasInput ? "Continue" : "Skip"} aria-label={hasInput ? "Continue" : "Skip"} />
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
          composer={{ size: "compact", mode: composerMode }}
          disableSend
        />
      </div>
    </div>
  );
}
