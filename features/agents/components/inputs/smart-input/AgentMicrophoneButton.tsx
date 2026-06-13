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
 *   2. As Whisper chunks come back during recording, stream the accumulated
 *      transcript into `userInputText` in real time — same pattern as
 *      ProTextarea. We snapshot the pre-recording text the first time a
 *      chunk fires so the final replace is precise and chunks never
 *      double-count.
 *   3. When the final transcript arrives, replace using that snapshot. If
 *      no live chunks ever fired (short recording, network races), fall
 *      back to the original "append to current input" behaviour so this
 *      component is a strict superset of what it was before.
 */

import React, { useCallback, useEffect, useRef } from "react";
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
  /** Class for the resting/loading mic icon (not the recording effects). */
  iconClassName?: string;
  /** Tooltip for the idle mic button. */
  label?: string;
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
  iconClassName,
  label,
  onTranscribed,
}: AgentMicrophoneButtonProps) {
  const dispatch = useAppDispatch();

  const inputText = useAppSelector(selectUserInputText(conversationId));
  const currentUserValues = useAppSelector(
    selectUserVariableValues(conversationId),
  );

  // Latest selector values mirrored into refs so the streaming callbacks
  // (which are stable across renders to avoid resetting the mic core) can
  // read them without re-subscribing or capturing stale closures.
  const inputTextRef = useRef(inputText);
  const userValuesRef = useRef(currentUserValues);
  useEffect(() => {
    inputTextRef.current = inputText;
  }, [inputText]);
  useEffect(() => {
    userValuesRef.current = currentUserValues;
  }, [currentUserValues]);

  // Snapshot of the input text taken on the first live chunk of a recording
  // session. `null` means no live session is active — used as the signal to
  // pick between "replace using snapshot" (live path) and "append to current"
  // (legacy path).
  const preRecordingRef = useRef<string | null>(null);

  const handleLiveTranscript = useCallback(
    (accumulated: string) => {
      if (!accumulated) return;
      if (preRecordingRef.current === null) {
        preRecordingRef.current = inputTextRef.current || "";
      }
      const base = preRecordingRef.current;
      const next = base ? `${base}\n${accumulated}` : accumulated;
      dispatch(
        setUserInputText({
          conversationId,
          text: next,
          userValues: userValuesRef.current,
        }),
      );
    },
    [conversationId, dispatch],
  );

  const handleTranscriptionComplete = useCallback(
    (text: string) => {
      const wasLive = preRecordingRef.current !== null;
      const snapshot = preRecordingRef.current;
      preRecordingRef.current = null;

      if (!text) {
        // No final text. If live updates wrote partial chunks, restore the
        // snapshot so we don't leave half-baked text in the box.
        if (wasLive) {
          dispatch(
            setUserInputText({
              conversationId,
              text: snapshot ?? "",
              userValues: userValuesRef.current,
            }),
          );
        }
        return;
      }

      // Live path: replace using the pre-recording snapshot so the chunks
      // we streamed during recording are not double-appended on completion.
      // Legacy path (no chunks fired): preserve original "append to current"
      // semantics exactly.
      const base = wasLive ? (snapshot ?? "") : inputTextRef.current || "";
      const next = base ? `${base}\n${text}` : text;
      dispatch(
        setUserInputText({
          conversationId,
          text: next,
          userValues: userValuesRef.current,
        }),
      );
      onTranscribed?.(next);
    },
    [conversationId, dispatch, onTranscribed],
  );

  return (
    <MicrophoneIconButton
      variant={variant}
      size={size}
      className={className}
      iconClassName={iconClassName}
      label={label}
      onLiveTranscript={handleLiveTranscript}
      onTranscriptionComplete={handleTranscriptionComplete}
    />
  );
}
