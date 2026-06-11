"use client";

/**
 * InputActionButtons
 *
 * Left and right toolbar buttons for the agent input.
 * Only requires conversationId — everything else comes from Redux or config props.
 *
 * Voice recording is delegated to <AgentMicrophoneButton>, which owns the
 * recorder lifecycle, permissions UI, and recovery toasts internally. This
 * component has no idea whether recording is happening — it just renders
 * the button in its mic slot.
 */

import React, { useCallback } from "react";
import {
  ArrowUp,
  CornerDownLeft,
  RefreshCcw,
  Braces,
  CircleStop,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { AgentMicrophoneButton } from "./AgentMicrophoneButton";
import { RunControlsMenu } from "./RunControlsMenu";
import {
  selectSubmitOnEnter,
  selectShowVariablePanel,
  selectShowAttachments,
  selectShowMicrophone,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import {
  setSubmitOnEnter,
  setAutoClearConversation,
  toggleVariablePanel,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import {
  selectIsExecuting,
  selectShouldShowVariables,
  selectAutoClearWithConversationHistory,
  selectShouldShowAutoClearToggle,
} from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import {
  smartExecute,
  cancelExecution,
} from "@/features/agents/redux/execution-system/thunks/smart-execute.thunk";
import { syncInputToDisplay } from "@/features/agents/redux/execution-system/conversation-focus/conversation-focus.slice";

// ── Inline button primitive ──────────────────────────────────────────────────

export function InputButton({
  icon: Icon,
  tooltip,
  onClick,
  active = false,
  className = "",
}: {
  icon: React.ComponentType<{ className?: string }>;
  tooltip: string;
  onClick: () => void;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={tooltip}
      className={`h-8 w-8 flex items-center justify-center rounded-full transition-colors
        ${active ? "bg-muted/80 text-foreground" : "text-muted-foreground/70 hover:text-foreground hover:bg-muted/60"}
        ${className}`}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}

// ── Props ────────────────────────────────────────────────────────────────────

interface InputActionButtonsProps {
  conversationId: string;
  uploadBucket?: string;
  uploadPath?: string;
  showSendButton?: boolean;
  showSubmitOnEnterToggle?: boolean;
  showVariableIcon?: boolean;
  sendButtonVariant?: "default" | "blue";
  surfaceKey?: string;
  disableSend?: boolean;
  extraRightControls?: React.ReactNode;
}

// ── Component ────────────────────────────────────────────────────────────────

export function InputActionButtons({
  conversationId,
  showSendButton = true,
  showSubmitOnEnterToggle = true,
  showVariableIcon = true,
  sendButtonVariant = "default",
  surfaceKey,
  disableSend = false,
  extraRightControls,
}: InputActionButtonsProps) {
  const dispatch = useAppDispatch();

  // Selectors
  const isExecuting = useAppSelector(selectIsExecuting(conversationId));
  const submitOnEnter = useAppSelector(selectSubmitOnEnter(conversationId));
  const showVariablePanel = useAppSelector(
    selectShowVariablePanel(conversationId),
  );
  const shouldShowVariables = useAppSelector(
    selectShouldShowVariables(conversationId),
  );
  const autoClearWithHistory = useAppSelector(
    selectAutoClearWithConversationHistory(conversationId),
  );
  const shouldShowAutoClearToggle = useAppSelector(
    selectShouldShowAutoClearToggle(conversationId),
  );
  const showAttachments = useAppSelector(selectShowAttachments(conversationId));
  const showMicrophone = useAppSelector(selectShowMicrophone(conversationId));

  const isSendDisabled = disableSend;

  const handleSend = useCallback(() => {
    if (isSendDisabled) return;
    if (isExecuting) {
      dispatch(cancelExecution(conversationId));
    } else {
      dispatch(smartExecute({ conversationId, surfaceKey }));
    }
  }, [isSendDisabled, isExecuting, conversationId, surfaceKey, dispatch]);

  const sendBtnClass =
    sendButtonVariant === "blue"
      ? "h-9 w-9 p-0 shrink-0 rounded-full bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 disabled:opacity-30 disabled:shadow-none text-white shadow-[0_1px_0_0_rgba(255,255,255,0.25)_inset,0_1px_2px_0_rgba(0,0,0,0.25)]"
      : "h-9 w-9 p-0 shrink-0 rounded-full bg-foreground text-background hover:bg-foreground/90 disabled:opacity-25 disabled:shadow-none shadow-[0_1px_0_0_rgba(255,255,255,0.25)_inset,0_1px_2px_0_rgba(0,0,0,0.25)]";

  return (
    <div className="flex items-center justify-between px-1 shrink-0">
      {/* Left: consolidated run controls / debug / creator / variable toggle */}
      <div className="flex items-center gap-0.5">
        {/* Single shared popover — Attach, Model (per-conversation model
            override), Tools (add tools to this run), Sandbox binding, and run
            Settings (disable injection, Surface Simulator, …) — identical to
            the `/chat/new` hero input's `+`. Attach is gated on the surface's
            attachment capability. */}
        <RunControlsMenu
          conversationId={conversationId}
          variant="plus"
          includeAttach={showAttachments}
        />

        {shouldShowVariables && showVariableIcon && (
          <InputButton
            icon={Braces}
            tooltip={showVariablePanel ? "Hide variables" : "Show variables"}
            onClick={() => dispatch(toggleVariablePanel(conversationId))}
            active={showVariablePanel}
          />
        )}
      </div>

      {/* Right: toggles + mic + send */}
      <div className="flex items-center gap-0.5">
        {extraRightControls}

        {shouldShowAutoClearToggle && (
          <InputButton
            icon={RefreshCcw}
            tooltip="Auto-clear ON — each send starts fresh (click to disable)"
            onClick={() => {
              const next = !autoClearWithHistory;
              dispatch(
                setAutoClearConversation({
                  conversationId,
                  value: next,
                }),
              );
              // Flipping autoclear OFF re-aligns the input back to whatever
              // conversation the display is showing — the user now wants the
              // continuing multi-turn view, not the prepped-next-turn convo.
              if (!next && surfaceKey) {
                dispatch(syncInputToDisplay(surfaceKey));
              }
            }}
            active={autoClearWithHistory}
          />
        )}

        {showSubmitOnEnterToggle && (
          <InputButton
            icon={CornerDownLeft}
            tooltip={
              submitOnEnter
                ? "Enter submits (click to disable)"
                : "Enter adds newline (click to enable)"
            }
            onClick={() =>
              dispatch(
                setSubmitOnEnter({ conversationId, value: !submitOnEnter }),
              )
            }
            active={submitOnEnter}
          />
        )}

        {showMicrophone && (
          <AgentMicrophoneButton conversationId={conversationId} size="md" />
        )}

        {showSendButton && (
          <Button
            onClick={handleSend}
            disabled={isSendDisabled}
            className={sendBtnClass}
            tabIndex={-1}
            title={isExecuting ? "Stop" : "Send"}
          >
            {isExecuting ? (
              <CircleStop className="w-4 h-4" />
            ) : (
              <ArrowUp className="w-5 h-5" />
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
