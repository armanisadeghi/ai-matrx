"use client";

/**
 * SingleRowActionButtons
 *
 * Compact action buttons for the single-row input layout.
 * Renders the mic + optional extra controls + send button side-by-side with
 * the textarea. Omits submit-on-enter toggle and auto-clear toggle (not
 * applicable in single-row mode).
 *
 * Voice recording is delegated to <AgentMicrophoneButton>. This component
 * does not know whether recording is active — the mic button manages its
 * own lifecycle and error UI.
 */

import React, { useCallback } from "react";
import { ArrowUp, Braces, CircleStop, AudioLines } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { RunControlsMenu } from "./RunControlsMenu";
import { InputButton } from "./InputActionButtons";
import { AgentMicrophoneButton } from "./AgentMicrophoneButton";
import {
  selectShowVariablePanel,
  selectShowAttachments,
  selectShowMicrophone,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { toggleVariablePanel } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { selectShouldShowVariables } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { useSurfaceExecution } from "@/features/agents/hooks/useSurfaceExecution";
import {
  smartExecute,
  cancelExecution,
} from "@/features/agents/redux/execution-system/thunks/smart-execute.thunk";

interface SingleRowActionButtonsProps {
  conversationId: string;
  uploadBucket?: string;
  uploadPath?: string;
  showSendButton?: boolean;
  showVariableIcon?: boolean;
  sendButtonVariant?: "default" | "blue";
  surfaceKey?: string;
  disableSend?: boolean;
  extraRightControls?: React.ReactNode;
}

export function SingleRowActionButtons({
  conversationId,
  showSendButton = true,
  showVariableIcon = true,
  sendButtonVariant = "default",
  surfaceKey,
  disableSend = false,
  extraRightControls,
}: SingleRowActionButtonsProps) {
  const dispatch = useAppDispatch();

  // Surface-aware executing state — see useSurfaceExecution. Keeps the stop
  // affordance working under the autoclear split (build route).
  const { isExecuting, executingConversationId } = useSurfaceExecution(
    conversationId,
    surfaceKey,
  );
  const showVariablePanel = useAppSelector(
    selectShowVariablePanel(conversationId),
  );
  const shouldShowVariables = useAppSelector(
    selectShouldShowVariables(conversationId),
  );
  const showAttachments = useAppSelector(selectShowAttachments(conversationId));
  const showMicrophone = useAppSelector(selectShowMicrophone(conversationId));

  const handleSend = useCallback(() => {
    if (disableSend) return;
    if (isExecuting) {
      dispatch(cancelExecution(executingConversationId ?? conversationId));
    } else {
      dispatch(smartExecute({ conversationId, surfaceKey }));
    }
  }, [
    disableSend,
    isExecuting,
    executingConversationId,
    conversationId,
    surfaceKey,
    dispatch,
  ]);

  const sendBtnClass =
    sendButtonVariant === "blue"
      ? "h-6 w-6 p-0 shrink-0 rounded-full bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 disabled:opacity-40 text-white"
      : "h-6 w-6 p-0 shrink-0 rounded-full bg-muted hover:bg-muted/80 dark:bg-zinc-700 dark:hover:bg-zinc-600 disabled:opacity-40 text-foreground";

  return (
    <div className="flex items-center gap-0.5 shrink-0">
      <RunControlsMenu
        conversationId={conversationId}
        variant="plus"
        includeAttach={showAttachments}
      />

      {shouldShowVariables && showVariableIcon && (
        <InputButton
          icon={Braces}
          tooltip={showVariablePanel ? "Hide Form Inputs" : "Show Form Inputs"}
          onClick={() => dispatch(toggleVariablePanel(conversationId))}
          active={showVariablePanel}
        />
      )}

      {extraRightControls}

      {showMicrophone && (
        <AgentMicrophoneButton
          conversationId={conversationId}
          size="xs"
          label="Record audio"
        />
      )}

      {showSendButton && (
        <Button
          onClick={handleSend}
          disabled={disableSend}
          className={sendBtnClass}
          tabIndex={-1}
          title={isExecuting ? "Stop" : "Send Message"}
        >
          {isExecuting ? (
            <CircleStop className="w-3 h-3" />
          ) : (
            <ArrowUp className="w-3 h-3" />
          )}
        </Button>
      )}

      {showSendButton && (
        <button
          type="button"
          tabIndex={-1}
          title="Live audio"
          aria-label="Live audio"
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <AudioLines className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}
