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
  CornerDownLeft,
  Braces,
  AudioLines,
  Loader2,
  Square,
} from "lucide-react";
import { Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@ai-matrx/design-system";
import { useAppSelector, useAppDispatch } from "../../../../store/hooks";
import { announceComingSoon } from "@ai-matrx/chat/host/ui-slots";
import { AgentMicrophoneButton } from "./AgentMicrophoneButton";
import { RunControlsMenu } from "./RunControlsMenu";
import { ContextDocsMenu } from "./ContextDocsMenu";
import {
  selectSubmitOnEnter,
  selectShowVariablePanel,
  selectShowAttachments,
  selectShowMicrophone,
} from "../../../redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import {
  toggleVariablePanel,
} from "../../../redux/execution-system/instance-ui-state/instance-ui-state.slice";
import {
  selectComposerHasSomethingToSend,
  selectShouldShowVariables,
} from "../../../redux/execution-system/selectors/aggregate.selectors";
import { useSurfaceExecution } from "../../../hooks/useSurfaceExecution";
import { DesktopPresenceIndicator } from "./DesktopPresenceIndicator";
import {
  smartExecute,
  cancelExecution,
} from "../../../redux/execution-system/thunks/smart-execute.thunk";
import { MicDeviceMenu } from "@ai-matrx/chat/host/ui-slots";
import type { ComposerMode, ComposerSize } from "./composer/composer-types";
import { Button } from "@ai-matrx/design-system/controls";
import { cn } from "@ai-matrx/design-system";

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
    <Button
      variant="quiet"
      tone={active ? "primary" : undefined}
      aria-pressed={active || undefined}
      icon={<Icon />}
      onClick={onClick}
      title={tooltip}
      // The tooltip is the control's whole identity — an icon-only button with
      // no aria-label reads as "button" and nothing else.
      aria-label={tooltip}
      className={cn("shrink-0", className)}
    />
  );
}

// ── Props ────────────────────────────────────────────────────────────────────

interface InputActionButtonsProps {
  conversationId: string;
  uploadRoot?: string;
  uploadPath?: string;
  showSendButton?: boolean;
  showVariableIcon?: boolean;
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
   * Send appears when there is something to send (brief §2).
   */
  composer: {
    size: ComposerSize;
    mode: ComposerMode;
    /**
     * The composer is narrow (useComposerFold): Scope (and, in Compact, live
     * audio) live in the + menu; Output and Effort in the agent pill's menu.
     */
    folded?: boolean;
    /** Compact's row under the card: after + · mic (· live audio). */
    leading?: React.ReactNode;
    /** Compact's row under the card: the right end (agent · output · effort). */
    trailing?: React.ReactNode;
    /**
     * Which part this instance draws. Compact mounts two: `"send"` (↵, inside
     * the card beside the text) and `"controls"` (the row under the card).
     * Absent = Full's button row inside the card.
     */
    part?: "send" | "controls" | "launcher";
  };
}

// ── Component ────────────────────────────────────────────────────────────────

export function InputActionButtons({
  conversationId,
  showSendButton = true,
  showVariableIcon = true,
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
  const showAttachments = useAppSelector(selectShowAttachments(conversationId));
  const showMicrophone = useAppSelector(selectShowMicrophone(conversationId));

  // While a run streams, the composer STAYS live: Send queues the text into
  // the Turn-Boundary Inbox (the running agent answers it at its next pause,
  // on the same stream — /Users/armanisadeghi/code/common-docs/systems/architecture/execution-runtime/TURN-BOUNDARY-INBOX.md), and a separate Stop
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

  const plusMenu = (
    <RunControlsMenu
      conversationId={conversationId}
      variant="plus"
      includeAttach={showAttachments}
      side={composer.size === "splash" ? "bottom" : "top"}
      onRequestInputExpand={onRequestInputExpand}
      composer={{
        mode: composer.mode,
        size: composer.size,
        surfaceKey,
        folded: composer.folded,
        // Compact's live audio leaves the row when narrow and rides +.
        foldLiveAudio: composer.folded && composer.part === "controls",
      }}
    />
  );
  // The mic and its device chevron are ONE control group (Arman, 2026-10-03):
  // both clickable, side by side. Live audio stands alone, no chevron.
  // ONE split button: a single pill whose hover lights the whole thing; the
  // mic half records, the chevron half picks the device. The halves carry
  // no background of their own, so it never reads as two buttons.
  const micGroup = showMicrophone ? (
    <span className="inline-flex h-7 shrink-0 items-center rounded-full text-muted-foreground/60 transition-colors hover:bg-muted/60">
      <AgentMicrophoneButton
        conversationId={conversationId}
        size="sm"
        label="Record audio"
        className="w-7 justify-end rounded-l-full rounded-r-none pr-0.5 text-muted-foreground/60 hover:bg-transparent hover:text-foreground"
        iconClassName="h-4 w-4"
        onRecordingStateChange={handleVoiceBusyChange}
      />
      <MicDeviceMenu className="h-7 w-5 justify-start rounded-l-none rounded-r-full pl-0.5 text-muted-foreground/60 hover:bg-transparent hover:text-foreground" />
    </span>
  ) : null;
  const sendControls = showSendButton ? (
    <ComposerSendSlot conversationId={conversationId}>
      {(hasSomethingToSend) => (
        <>
          {/* The run in flight: the indicator in send's own place, a press stops it. */}
          {isExecuting ? <ComposerStopButton onStop={handleStop} /> : null}
          {/* Send: always present while idle (dim with nothing to send); while
              a run streams it appears only to queue what was typed. */}
          {!isExecuting || hasSomethingToSend || shouldShowVariables ? (
            <ComposerSendButton
              submitOnEnter={submitOnEnter}
              isExecuting={isExecuting}
              voiceBusy={voiceBusy}
              disabled={isSendDisabled || !(hasSomethingToSend || shouldShowVariables)}
              onSend={handleSend}
            />
          ) : null}
        </>
      )}
    </ComposerSendSlot>
  ) : null;

  if (composer.part === "send") return sendControls;
  // Launcher: mic (with its device chevron) and send — nothing else.
  if (composer.part === "launcher") {
    return (
      <span className="flex shrink-0 items-center gap-1.5">
        {micGroup}
        {sendControls}
      </span>
    );
  }
  // Compact (Arman, 2026-10-04): the card holds the text and ↵ only; this
  // row under it carries + · mic (protected) · live audio · scope · the
  // values count, and agent · output · effort at the right end.
  if (composer.part === "controls") {
    return (
      <div className="flex min-w-0 items-center justify-between gap-1.5 shrink-0">
        <div className="flex min-w-0 shrink-0 items-center gap-1.5">
          {plusMenu}
          <DesktopPresenceIndicator conversationId={conversationId} />
          {variablesToggle}
          {micGroup}
          {composer.folded ? null : liveAudioButton}
          {composer.leading}
        </div>
        <div className="flex min-w-0 items-center gap-1.5">
          {extraRightControls}
          {composer.trailing}
        </div>
      </div>
    );
  }
  return (
    // Full's button row: one 32px composer row, the same height as each text line.
    <div className="flex min-w-0 items-center justify-between gap-1.5 shrink-0 lg:h-8">
      <div className="flex min-w-0 items-center gap-1.5">
        {plusMenu}
        <DesktopPresenceIndicator conversationId={conversationId} />
        {variablesToggle}
      </div>
      <div className="flex min-w-0 items-center gap-1.5">
        {extraRightControls}
        {micGroup}
        {liveAudioButton}
        {sendControls}
      </div>
    </div>
  );
}

/**
 * The composer's view of the draft — its own component so only the send slot
 * subscribes to the draft and the rest of the toolbar does not re-render on
 * every keystroke.
 */
function ComposerSendSlot({
  conversationId,
  children,
}: {
  conversationId: string;
  children: (hasSomethingToSend: boolean) => React.ReactNode;
}) {
  const hasSomethingToSend = useAppSelector(
    selectComposerHasSomethingToSend(conversationId),
  );
  return <>{children(hasSomethingToSend)}</>;
}

const IS_MAC =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      {keys.map((key) => (
        <kbd
          key={key}
          className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border/60 px-1 font-sans text-[11px]"
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}

/**
 * The composer's send control: a bare return glyph, no fill or border. Its
 * tooltip lists exactly what the keys do here (`composerKeyIntent`).
 */
function ComposerSendButton({
  submitOnEnter,
  isExecuting,
  voiceBusy,
  disabled,
  onSend,
}: {
  submitOnEnter: boolean;
  isExecuting: boolean;
  voiceBusy: boolean;
  disabled: boolean;
  onSend: () => void;
}) {
  const mod = IS_MAC ? "⌘" : "Ctrl";
  const rows: { label: string; keys: string[] }[] = isExecuting
    ? [
        { label: "Queue for when it finishes", keys: submitOnEnter ? ["↵"] : [mod, "↵"] },
        ...(submitOnEnter ? [{ label: "Steer in now", keys: [mod, "↵"] }] : []),
        { label: "Stop and send", keys: [mod, "⇧", "↵"] },
      ]
    : submitOnEnter
      ? [
          { label: "Send", keys: ["↵"] },
          { label: "New line", keys: ["⇧", "↵"] },
        ]
      : [
          { label: "Send", keys: [mod, "↵"] },
          { label: "New line", keys: ["↵"] },
        ];
  const name = isExecuting ? "Queue message" : voiceBusy ? "Finish recording to send" : "Send message";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="quiet" icon={<CornerDownLeft />} onClick={onSend} disabled={disabled} aria-label={name} className="shrink-0" />
      </TooltipTrigger>
      <TooltipContent side="top" align="end" className="flex flex-col gap-1 py-1.5">
        {voiceBusy ? (
          <span>Finish recording to send</span>
        ) : (
          rows.map((row) => (
            <span key={row.label} className="flex items-center justify-between gap-4">
              <span>{row.label}</span>
              <Keys keys={row.keys} />
            </span>
          ))
        )}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * THE stop control while a run streams — a spinner in send's own place that
 * becomes a square on hover; a press stops the run. Every style uses this one
 * (Full, Compact, Launcher, and Form in place of its Run).
 */
export function ComposerStopButton({ onStop }: { onStop: () => void }) {
  return (
    <Button
      variant="quiet"
      icon={
        <>
          <Loader2 className="animate-spin group-hover:hidden" />
          <Square className="hidden fill-current group-hover:block" />
        </>
      }
      onClick={onStop}
      title="Stop the run (everything streamed so far is kept)"
      aria-label="Stop the run"
      className="group shrink-0"
    />
  );
}
