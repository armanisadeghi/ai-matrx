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
import { announceComingSoon } from "@/lib/coming-soon/announce";
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
import { DesktopPresenceIndicator } from "./DesktopPresenceIndicator";
import {
  smartExecute,
  cancelExecution,
} from "@/features/agents/redux/execution-system/thunks/smart-execute.thunk";
import { setAutoClearMode } from "@/features/agents/redux/execution-system/thunks/create-instance.thunk";
import { selectInputCharCount } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.selectors";
import { selectHasUnsentResources } from "@/features/agents/redux/execution-system/instance-resources/instance-resources.selectors";
import { MicDeviceMenu } from "@/components/audio/MicDeviceMenu";
import type { ComposerMode, ComposerSize } from "./composer/composer-types";

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
      // The tooltip is the control's whole identity — an icon-only button with
      // no aria-label reads as "button" and nothing else.
      aria-label={tooltip}
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
  uploadRoot?: string;
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
  onRequestInputExpand?: () => void;
  /**
   * The three-mode composer's arrangement (composer/composer-types.ts). The
   * SAME buttons — send / queue / steer / stop, the mic, the + — arranged as
   * the design draws them:
   *   splash · page — `+` left; dictate · voice ▾ · send right (in the card);
   *   compact       — `+` · dictate · voice ▾ left; `trailing` (agent pill ·
   *                   Auto) · send right (the row under the card).
   * Send appears when there is something to send (brief §2). Absent = the
   * classic toolbar, unchanged.
   */
  composer?: {
    size: ComposerSize;
    mode: ComposerMode;
    trailing?: React.ReactNode;
  };
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
  onRequestInputExpand,
  composer,
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

  // While a run streams, the composer STAYS live: Send queues the text into
  // the Turn-Boundary Inbox (the running agent answers it at its next pause,
  // on the same stream — /Users/armanisadeghi/code/common-docs/systems/agents/execution-runtime/TURN-BOUNDARY-INBOX.md), and a separate Stop
  // button cancels the run. Content never controls submit eligibility; while
  // the mic is active the send path blocks so trailing audio isn't dropped.
  const isSendDisabled = disableSend || voiceBusy;

  const handleVoiceBusyChange = useCallback(
    (state: { isRecording: boolean; isTranscribing: boolean }) => {
      const busy = state.isRecording || state.isTranscribing;
      setVoiceBusy(busy);
      onVoiceBusyChange?.(busy);
    },
    [onVoiceBusyChange],
  );

  const handleSend = useCallback(() => {
    if (disableSend || voiceBusy) return;
    dispatch(smartExecute({ conversationId, surfaceKey }));
  }, [disableSend, voiceBusy, conversationId, surfaceKey, dispatch]);

  const handleStop = useCallback(() => {
    dispatch(cancelExecution(executingConversationId ?? conversationId));
  }, [executingConversationId, conversationId, dispatch]);

  const sendBtnClass =
    sendButtonVariant === "blue"
      ? "h-11 w-11 lg:h-9 lg:w-9 p-0 shrink-0 rounded-full bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 disabled:opacity-30 disabled:shadow-none text-white shadow-[0_1px_0_0_rgba(255,255,255,0.25)_inset,0_1px_2px_0_rgba(0,0,0,0.25)]"
      : "h-11 w-11 lg:h-9 lg:w-9 p-0 shrink-0 rounded-full bg-foreground text-background hover:bg-foreground/90 disabled:opacity-25 disabled:shadow-none shadow-[0_1px_0_0_rgba(255,255,255,0.25)_inset,0_1px_2px_0_rgba(0,0,0,0.25)]";

  const micButton = showMicrophone ? (
    <AgentMicrophoneButton
      conversationId={conversationId}
      size="md"
      label="Record audio"
      className={INPUT_BUTTON_IDLE_TINT}
      iconClassName=""
      onRecordingStateChange={handleVoiceBusyChange}
    />
  ) : null;

  const stopButton =
    showSendButton && isExecuting ? (
      <Button
        onClick={handleStop}
        className="h-11 w-11 lg:h-9 lg:w-9 p-0 shrink-0 rounded-full bg-muted text-foreground hover:bg-destructive/15 hover:text-destructive"
        tabIndex={-1}
        title="Stop the run (everything streamed so far is kept)"
        aria-label="Stop the run"
      >
        <CircleStop className="w-4 h-4" />
      </Button>
    ) : null;

  const sendButton = showSendButton ? (
    <Button
      onClick={handleSend}
      disabled={isSendDisabled}
      className={sendBtnClass}
      tabIndex={-1}
      title={
        isExecuting
          ? "Queue message — sends when the agent finishes (⌘Enter steers in now, ⌘⇧Enter interrupts)"
          : voiceBusy
            ? "Finish recording to send"
            : "Send Message"
      }
      // An icon-only control needs a NAME, not just a hover tooltip: a
      // screen reader reads "button" and nothing else, and a title=
      // attribute is not an accessible name here. Live review, 2026-09-15:
      // the loaded-chat composer's send control had title="Send Message"
      // and no aria-label at all while the new-chat composer did — the
      // same button, two different stories. Guard:
      // __tests__/composer-controls-are-named.test.tsx.
      aria-label={
        isExecuting
          ? "Queue message"
          : voiceBusy
            ? "Finish recording to send"
            : "Send message"
      }
    >
      <ArrowUp className="w-5 h-5" />
    </Button>
  ) : null;

  const liveAudioButton = showSendButton ? (
    <InputButton
      icon={AudioLines}
      tooltip="Live audio"
      // A button that promises a live voice session and does literally
      // nothing is worse than no button. Until the session exists it
      // keeps the tracked promise instead (lib/coming-soon/registry.ts).
      onClick={() => void announceComingSoon("chat.live-audio")}
    />
  ) : null;

  // A form of variables stays reachable in every arrangement (never stranded).
  const variablesToggle =
    shouldShowVariables && showVariableIcon ? (
      <InputButton
        icon={Braces}
        tooltip={showVariablePanel ? "Hide Form Inputs" : "Show Form Inputs"}
        onClick={() => dispatch(toggleVariablePanel(conversationId))}
        active={showVariablePanel}
      />
    ) : null;

  if (composer) {
    const compact = composer.size === "compact";
    const plusMenu = (
      <RunControlsMenu
        conversationId={conversationId}
        variant="plus"
        includeAttach={showAttachments}
        side={composer.size === "splash" ? "bottom" : "top"}
        onRequestInputExpand={onRequestInputExpand}
        composer={{ mode: composer.mode, size: composer.size }}
      />
    );
    const voice = showMicrophone ? (
      <span className="inline-flex items-center">
        {liveAudioButton}
        <MicDeviceMenu className={INPUT_BUTTON_IDLE_TINT} />
      </span>
    ) : (
      liveAudioButton
    );
    return (
      <div
        className={
          compact
            ? "flex min-w-0 items-center justify-between gap-1 shrink-0"
            : "flex min-w-0 items-center justify-between px-1 shrink-0"
        }
      >
        <div className="flex min-w-0 items-center gap-0.5">
          {plusMenu}
          <DesktopPresenceIndicator conversationId={conversationId} />
          {variablesToggle}
          {compact ? micButton : null}
          {compact ? voice : null}
        </div>
        <div className="flex min-w-0 items-center gap-0.5">
          {extraRightControls}
          {composer.trailing}
          {compact ? null : micButton}
          {compact ? null : voice}
          {stopButton}
          <ComposerSendSlot
            conversationId={conversationId}
            always={isExecuting || shouldShowVariables}
          >
            {sendButton}
          </ComposerSendSlot>
        </div>
      </div>
    );
  }

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
          onRequestInputExpand={onRequestInputExpand}
        />

        {/* Bound sandbox / local PC only — connect via `+` → ComputeLensBar. */}
        <DesktopPresenceIndicator conversationId={conversationId} />

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

        {micButton}

        {stopButton}

        {sendButton}

        {liveAudioButton}
      </div>
    </div>
  );
}

/**
 * Send appears when there is something to send (brief §2): text, an
 * attachment not yet sent, or a form of variables (`always`). Its own
 * component so ONLY the composer arrangement subscribes to the draft — the
 * classic toolbar must not re-render on every keystroke.
 */
function ComposerSendSlot({
  conversationId,
  always,
  children,
}: {
  conversationId: string;
  always: boolean;
  children: React.ReactNode;
}) {
  const charCount = useAppSelector(selectInputCharCount(conversationId));
  const hasUnsentResources = useAppSelector(
    selectHasUnsentResources(conversationId),
  );
  if (!always && charCount === 0 && !hasUnsentResources) return null;
  return <>{children}</>;
}
