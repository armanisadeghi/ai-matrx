"use client";

/**
 * CompactAssistantInput
 *
 * Compact message input for the chat assistant widget. Includes all the essential
 * controls from SmartAgentInput (voice, resources, variable toggle, submit-on-enter)
 * in a space-efficient layout.
 *
 * The textarea auto-resizes and supports Shift+Enter for newlines.
 * All execution logic is driven by Redux — no prop drilling.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import {
  selectUserInputText,
  selectSubmissionPhase,
} from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.selectors";
import { selectIsExecuting } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { selectSubmitOnEnter } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import {
  setSubmitOnEnter,
  toggleVariablePanel,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { selectInstanceVariableDefinitions } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.selectors";
import { smartExecute } from "@/features/agents/redux/execution-system/thunks/smart-execute.thunk";
import { Button } from "@/components/ui/button";
import { ArrowUp, Mic, Braces, CornerDownLeft } from "lucide-react";

// Voice input
import { useRecordAndTranscribe } from "@/features/audio/hooks/useRecordAndTranscribe";
import { TranscriptionLoader } from "@/features/audio/components/TranscriptionLoader";

// Resource picker
import { SmartAgentResourcePickerButton } from "../../inputs/resources/SmartAgentResourcePickerButton";
import { SmartAgentResourceChips } from "../../inputs/resources/SmartAgentResourceChips";

import { toast } from "sonner";

interface CompactAssistantInputProps {
  conversationId: string;
}

export function CompactAssistantInput({
  conversationId,
}: CompactAssistantInputProps) {
  const dispatch = useAppDispatch();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingVoiceSubmitRef = useRef(false);

  // ── Redux state ─────────────────────────────────────────────────────────────
  const inputText = useAppSelector(selectUserInputText(conversationId));
  const submissionPhase = useAppSelector(selectSubmissionPhase(conversationId));
  const isExecuting = useAppSelector(selectIsExecuting(conversationId));
  const submitOnEnter = useAppSelector(selectSubmitOnEnter(conversationId));

  // Hide the in-flight message from the box (it moves into the conversation);
  // the text stays in Redux as the non-visual backup. `inputText` is still used
  // by the voice-append/auto-submit logic below.
  const visibleText = submissionPhase === "pending" ? "" : inputText;
  const variableDefs = useAppSelector(
    selectInstanceVariableDefinitions(conversationId),
  );
  const hasVariables = variableDefs.length > 0;

  // Agents can execute on variables alone — text is NOT required.
  // Only block when already executing (matches SmartAgentInput behavior).
  const isSendDisabled = isExecuting;

  // ── Voice input ─────────────────────────────────────────────────────────────
  const {
    isRecording,
    isTranscribing,
    duration,
    startRecording,
    stopRecording,
  } = useRecordAndTranscribe({
    onTranscriptionComplete: (result) => {
      if (result.success && result.text) {
        const newText = inputText
          ? `${inputText}\n${result.text}`
          : result.text;
        pendingVoiceSubmitRef.current = true;
        dispatch(setUserInputText({ conversationId, text: newText }));
      }
    },
    onError: (error) => {
      toast.error("Transcription failed", { description: error });
    },
    autoTranscribe: true,
  });

  // Auto-submit after voice transcription
  useEffect(() => {
    if (pendingVoiceSubmitRef.current && inputText.trim()) {
      pendingVoiceSubmitRef.current = false;
      setTimeout(() => handleSend(), 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputText]);

  // ── Auto-resize textarea ────────────────────────────────────────────────────
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 100)}px`;
  }, [visibleText]);

  // ── Send logic ──────────────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    if (isSendDisabled) return;
    dispatch(smartExecute({ conversationId }));
  }, [isSendDisabled, conversationId, dispatch]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey && submitOnEnter) {
        e.preventDefault();
        if (!isSendDisabled) handleSend();
      }
    },
    [submitOnEnter, isSendDisabled, handleSend],
  );

  const handleMicClick = useCallback(() => {
    if (isRecording) stopRecording();
    else if (!isTranscribing) startRecording();
  }, [isRecording, isTranscribing, startRecording, stopRecording]);

  return (
    <div className="shrink-0 border-t border-border/40 bg-muted/10">
      {/* Resource chips */}
      <SmartAgentResourceChips conversationId={conversationId} />

      {/* Textarea */}
      <div className="px-2 pt-1">
        <textarea
          ref={textareaRef}
          value={visibleText}
          onChange={(e) =>
            dispatch(setUserInputText({ conversationId, text: e.target.value }))
          }
          onKeyDown={handleKeyDown}
          placeholder="Ask anything..."
          disabled={isExecuting}
          className="w-full bg-transparent border-none outline-none text-xs text-foreground placeholder:text-muted-foreground/50 resize-none overflow-y-auto scrollbar-hide disabled:opacity-60"
          style={{ minHeight: 20, maxHeight: 100, fontSize: "16px" }}
          rows={1}
        />
      </div>

      {/* Toolbar — controls + send */}
      <div className="flex items-center justify-between px-1.5 pb-1.5">
        {/* Left: functional controls */}
        <div className="flex items-center gap-0">
          {isTranscribing && !isRecording ? (
            <div className="px-1">
              <TranscriptionLoader
                message="Transcribing"
                duration={duration}
                size="sm"
              />
            </div>
          ) : isRecording ? (
            <div className="flex items-center gap-1 bg-blue-50 dark:bg-blue-900/20 rounded px-1.5 py-0.5 animate-pulse">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[10px] font-medium text-blue-700 dark:text-blue-300">
                {Math.floor(duration / 60)}:
                {String(duration % 60).padStart(2, "0")}
              </span>
              <button
                onClick={stopRecording}
                className="text-[10px] text-blue-600 hover:text-blue-700 font-medium"
              >
                Stop
              </button>
            </div>
          ) : (
            <>
              {/* Variable toggle */}
              {hasVariables && (
                <ToolbarButton
                  icon={Braces}
                  tooltip="Toggle variables"
                  onClick={() => dispatch(toggleVariablePanel(conversationId))}
                />
              )}

              {/* Voice input */}
              <ToolbarButton
                icon={Mic}
                tooltip="Record voice"
                onClick={handleMicClick}
              />

              {/* Resource picker */}
              <SmartAgentResourcePickerButton conversationId={conversationId} />
            </>
          )}
        </div>

        {/* Right: toggles + send */}
        <div className="flex items-center gap-0">
          {/* Submit on Enter toggle */}
          <ToolbarButton
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

          {/* Send button */}
          <Button
            size="icon"
            className="w-6 h-6 rounded-full bg-primary text-primary-foreground shrink-0 disabled:opacity-40 ml-0.5"
            disabled={isSendDisabled}
            onClick={handleSend}
          >
            {isExecuting ? (
              <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <ArrowUp className="w-3 h-3" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Toolbar button helper
// ─────────────────────────────────────────────────────────────────────────────

function ToolbarButton({
  icon: Icon,
  tooltip,
  onClick,
  active = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tooltip: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={tooltip}
      className={`h-6 w-6 flex items-center justify-center rounded-md transition-colors ${
        active
          ? "text-primary bg-primary/10"
          : "text-muted-foreground hover:text-foreground hover:bg-muted"
      }`}
    >
      <Icon className="w-3 h-3" />
    </button>
  );
}
