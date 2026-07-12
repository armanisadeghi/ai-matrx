"use client";

/**
 * InputActionButtons
 *
 * Left and right toolbar buttons for the agent input.
 * Only requires conversationId — everything else comes from Redux or config props.
 *
 * Voice recording is delegated to <AgentMicrophoneButton>, which owns the
 * recorder lifecycle, permissions UI, and recovery toasts internally. When
 * recording/transcribing is active this component disables send and notifies
 * the parent via `onVoiceBusyChange` so Enter-to-send is gated too.
 */

import React, { useCallback, useState } from "react";
import {
  ArrowUp,
  CornerDownLeft,
  RefreshCcw,
  Braces,
  CircleStop,
  AudioLines,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { AgentMicrophoneButton } from "./AgentMicrophoneButton";
import { RunControlsMenu } from "./RunControlsMenu";
import { ContextDocsMenu } from "./ContextDocsMenu";
import {
  selectSubmitOnEnter,
  selectShowVariablePanel,
  selectShowAttachments,
  selectShowMicrophone,
  selectAutoClearConversation,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import {
  setSubmitOnEnter,
  toggleVariablePanel,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import {
  selectShouldShowVariables,
  selectShouldShowAutoClearToggle,
} from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { useSurfaceExecution } from "@/features/agents/hooks/useSurfaceExecution";
import {
  smartExecute,
  cancelExecution,
} from "@/features/agents/redux/execution-system/thunks/smart-execute.thunk";
import { setAutoClearMode } from "@/features/agents/redux/execution-system/thunks/create-instance.thunk";

// ── Inline button primitive ──────────────────────────────────────────────────

/**
 * Shared resting (idle) tint for every toolbar button in this row. Exported so
 * the microphone — which renders its own button internally — can match the
 * plain InputButtons pixel-for-pixel in its resting state. The icon must
 * inherit the button color (no explicit color class) so `hover:text-foreground`
 * applies to it.
 */
export const INPUT_BUTTON_IDLE_TINT =
  "text-muted-foreground/60 hover:text-foreground hover:bg-muted/60";

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
        ${active ? "text-primary ring-1 ring-inset ring-primary/50 hover:bg-muted/40" : INPUT_BUTTON_IDLE_TINT}
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
  /** Fired when mic recording or final transcription is in flight. */
  onVoiceBusyChange?: (busy: boolean) => void;
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
  onVoiceBusyChange,
  extraRightControls,
}: InputActionButtonsProps) {
  const dispatch = useAppDispatch();
  const [voiceBusy, setVoiceBusy] = useState(false);

  // Selectors. Executing state is surface-aware: under the autoclear split the
  // run lives on the surface's display conversation while this toolbar is bound
  // to the (fresh) input conversation — without this the button would never
  // flip to stop and clicking it would fire a second run.
  const { isExecuting, executingConversationId } = useSurfaceExecution(
    conversationId,
    surfaceKey,
  );
  const submitOnEnter = useAppSelector(selectSubmitOnEnter(conversationId));
  const showVariablePanel = useAppSelector(
    selectShowVariablePanel(conversationId),
  );
  const shouldShowVariables = useAppSelector(
    selectShouldShowVariables(conversationId),
  );
  const autoClear = useAppSelector(selectAutoClearConversation(conversationId));
  const shouldShowAutoClearToggle = useAppSelector(
    selectShouldShowAutoClearToggle(conversationId),
  );
  const showAttachments = useAppSelector(selectShowAttachments(conversationId));
  const showMicrophone = useAppSelector(selectShowMicrophone(conversationId));

  // Stop must stay available during a run; only block the *send* path while
  // the mic is active so trailing audio isn't dropped mid-transcript.
  const isSendDisabled = !isExecuting && (disableSend || voiceBusy);

  const handleVoiceBusyChange = useCallback(
    (state: { isRecording: boolean; isTranscribing: boolean }) => {
      const busy = state.isRecording || state.isTranscribing;
      setVoiceBusy(busy);
      onVoiceBusyChange?.(busy);
    },
    [onVoiceBusyChange],
  );

  const handleSend = useCallback(() => {
    if (isExecuting) {
      dispatch(cancelExecution(executingConversationId ?? conversationId));
      return;
    }
    if (disableSend || voiceBusy) return;
    dispatch(smartExecute({ conversationId, surfaceKey }));
  }, [
    disableSend,
    voiceBusy,
    isExecuting,
    executingConversationId,
    conversationId,
    surfaceKey,
    dispatch,
  ]);

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

        {/* Quick toggles + links for the working document / scratchpad and
            active context — the fast path that complements the `+` menu. */}
        <ContextDocsMenu conversationId={conversationId} />

        {shouldShowVariables && showVariableIcon && (
          <InputButton
            icon={Braces}
            tooltip={
              showVariablePanel ? "Hide Form Inputs" : "Show Form Inputs"
            }
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
            tooltip={
              autoClear
                ? "Auto-clear ON — each send starts fresh (click to disable)"
                : "Auto-clear OFF — conversation continues (click to enable)"
            }
            onClick={() =>
              dispatch(
                setAutoClearMode({
                  conversationId,
                  value: !autoClear,
                  surfaceKey,
                }),
              )
            }
            active={autoClear}
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
          <AgentMicrophoneButton
            conversationId={conversationId}
            size="md"
            label="Record audio"
            className={INPUT_BUTTON_IDLE_TINT}
            iconClassName=""
            onRecordingStateChange={handleVoiceBusyChange}
          />
        )}

        {showSendButton && (
          <Button
            onClick={handleSend}
            disabled={isSendDisabled}
            className={sendBtnClass}
            tabIndex={-1}
            title={
              isExecuting
                ? "Stop"
                : voiceBusy
                  ? "Finish recording to send"
                  : "Send Message"
            }
          >
            {isExecuting ? (
              <CircleStop className="w-4 h-4" />
            ) : (
              <ArrowUp className="w-5 h-5" />
            )}
          </Button>
        )}

        {showSendButton && (
          <InputButton
            icon={AudioLines}
            tooltip="Live audio"
            onClick={() => {}}
          />
        )}
      </div>
    </div>
  );
}
