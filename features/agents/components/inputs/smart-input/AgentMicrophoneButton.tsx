"use client";

/**
 * AgentMicrophoneButton
 *
 * Thin wrapper around the official <MicrophoneIconButton> that drops the
 * final transcript into the agent input's Redux slice. The official mic
 * button owns everything voice-related (permissions, chunked Whisper
 * streaming, recovery toast, error toast, recording modal, lazy load of
 * the recorder chunk) — this component just connects its output to Redux.
 *
 * Behaviour:
 *   1. Renders nothing heavy until the user clicks the mic. Under the hood
 *      the button is a plain lucide icon; on first click it dynamically
 *      imports the recorder core. Page-load cost is a single icon.
 *   2. When a final transcript arrives, append it to the current
 *      `userInputText` for this conversation (newline-separated if text was
 *      already present). The user reviews and submits manually — no
 *      auto-send.
 */

import React, { useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { MicrophoneIconButton } from "@/features/audio/components/MicrophoneIconButton";
import type { MicVariant } from "@/features/audio/components/MicrophoneIconButton";
import { selectUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.selectors";
import { selectUserVariableValues } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.selectors";
import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";

interface AgentMicrophoneButtonProps {
  conversationId: string;
  size?: "xs" | "sm" | "md" | "lg";
  variant?: MicVariant;
  className?: string;
  /**
   * Fires after the final transcript is appended to the input, with the full
   * resulting text. Lets an audio-first surface auto-send on speech end.
   */
  onTranscribed?: (fullText: string) => void;
}

export function AgentMicrophoneButton({
  conversationId,
  size = "sm",
  variant = "icon-only",
  className,
  onTranscribed,
}: AgentMicrophoneButtonProps) {
  const dispatch = useAppDispatch();

  const inputText = useAppSelector(selectUserInputText(conversationId));
  const currentUserValues = useAppSelector(
    selectUserVariableValues(conversationId),
  );

  const handleTranscriptionComplete = useCallback(
    (text: string) => {
      if (!text) return;
      const next = inputText ? `${inputText}\n${text}` : text;
      dispatch(
        setUserInputText({
          conversationId,
          text: next,
          userValues: currentUserValues,
        }),
      );
      onTranscribed?.(next);
    },
    [inputText, currentUserValues, conversationId, dispatch, onTranscribed],
  );

  return (
    <MicrophoneIconButton
      variant={variant}
      size={size}
      className={className}
      onTranscriptionComplete={handleTranscriptionComplete}
    />
  );
}
