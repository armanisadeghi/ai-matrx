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
import {
  ArrowUp,
  Braces,
  ChevronDown,
  Bug,
  CircleStop,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { SmartAgentResourcePickerButton } from "../resources/SmartAgentResourcePickerButton";
import { RunControlsMenu } from "./RunControlsMenu";
import { InputButton } from "./InputActionButtons";
import { AgentMicrophoneButton } from "./AgentMicrophoneButton";
import {
  selectShowVariablePanel,
  selectIsCreator,
  selectShowCreatorDebug,
  selectShowAttachments,
  selectShowMicrophone,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import {
  toggleCreatorDebug,
  toggleVariablePanel,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import {
  selectIsExecuting,
  selectShouldShowVariables,
} from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";
import { selectIsDebugMode } from "@/lib/redux/preferences/adminDebugSlice";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
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
  uploadBucket = "userContent",
  uploadPath = "agent-attachments",
  showSendButton = true,
  showVariableIcon = true,
  sendButtonVariant = "default",
  surfaceKey,
  disableSend = false,
  extraRightControls,
}: SingleRowActionButtonsProps) {
  const dispatch = useAppDispatch();

  const isExecuting = useAppSelector(selectIsExecuting(conversationId));
  const showVariablePanel = useAppSelector(
    selectShowVariablePanel(conversationId),
  );
  const isCreator = useAppSelector(selectIsCreator(conversationId));
  const showCreatorDebug = useAppSelector(
    selectShowCreatorDebug(conversationId),
  );
  const shouldShowVariables = useAppSelector(
    selectShouldShowVariables(conversationId),
  );
  const showAttachments = useAppSelector(
    selectShowAttachments(conversationId),
  );
  const showMicrophone = useAppSelector(
    selectShowMicrophone(conversationId),
  );
  const isAdmin = useAppSelector(selectIsSuperAdmin);
  const isDebugMode = useAppSelector(selectIsDebugMode);

  const handleSend = useCallback(() => {
    if (disableSend) return;
    if (isExecuting) {
      dispatch(cancelExecution(conversationId));
    } else {
      dispatch(smartExecute({ conversationId, surfaceKey }));
    }
  }, [disableSend, isExecuting, conversationId, surfaceKey, dispatch]);

  const sendBtnClass =
    sendButtonVariant === "blue"
      ? "h-6 w-6 p-0 shrink-0 rounded-full bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 disabled:opacity-40 text-white"
      : "h-6 w-6 p-0 shrink-0 rounded-full bg-muted hover:bg-muted/80 dark:bg-zinc-700 dark:hover:bg-zinc-600 disabled:opacity-40 text-foreground";

  return (
    <div className="flex items-center gap-0.5 shrink-0">
      {showAttachments && (
        <SmartAgentResourcePickerButton
          conversationId={conversationId}
          uploadBucket={uploadBucket}
          uploadPath={uploadPath}
        />
      )}

      <RunControlsMenu conversationId={conversationId} />

      {isAdmin && isDebugMode && (
        <InputButton
          icon={Bug}
          tooltip="Debug instance state"
          onClick={() =>
            dispatch(
              openOverlay({
                overlayId: "chatDebugWindow",
                data: { sessionId: conversationId },
              }),
            )
          }
          className="text-orange-500"
        />
      )}

      {isCreator && (
        <InputButton
          icon={ChevronDown}
          tooltip={showCreatorDebug ? "Hide debug" : "Show debug"}
          onClick={() => dispatch(toggleCreatorDebug(conversationId))}
          active={showCreatorDebug}
          className="text-amber-500"
        />
      )}

      {shouldShowVariables && showVariableIcon && (
        <InputButton
          icon={Braces}
          tooltip={showVariablePanel ? "Hide variables" : "Show variables"}
          onClick={() => dispatch(toggleVariablePanel(conversationId))}
          active={showVariablePanel}
        />
      )}

      {extraRightControls}

      {showMicrophone && (
        <AgentMicrophoneButton conversationId={conversationId} size="xs" />
      )}

      {showSendButton && (
        <Button
          onClick={handleSend}
          disabled={disableSend}
          className={sendBtnClass}
          tabIndex={-1}
          title={isExecuting ? "Stop" : "Send"}
        >
          {isExecuting ? (
            <CircleStop className="w-3 h-3" />
          ) : (
            <ArrowUp className="w-3 h-3" />
          )}
        </Button>
      )}
    </div>
  );
}
