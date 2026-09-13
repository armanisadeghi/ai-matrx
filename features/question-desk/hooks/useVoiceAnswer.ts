"use client";

// features/question-desk/hooks/useVoiceAnswer.ts
//
// V — answer out loud.
//
// The mic is the ONE shared recorder behind `GlobalRecordingProvider`
// (`useVoiceCapture`), so this surface cannot record concurrently with any
// other and the recording survives a tab switch. Transcription rides the same
// path (`/api/audio/transcribe`).
//
// THE AUDIO IS KEPT. The shared recorder uploads every full dictation through
// the canonical file handler and announces the resulting `cld_files` id on
// `dictationAudioRegistry`; this hook listens for the announcement that matches
// its own origin and hands the id to the save, which writes it to
// `answer_audio_file_id`. If the upload FAILS the hook says so and keeps the
// retry — it never quietly stores a transcript whose recording is gone.
//
// THE TRANSCRIPT IS VERBATIM. What the transcriber returned is what is shown
// and what is saved. Editing is an explicit, visible step; nothing is silently
// cleaned up on the way to the row.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVoiceCapture } from "@/features/audio/hooks/useVoiceCapture";
import {
  subscribeDictationAudio,
  type FailedDictationAudio,
} from "@/features/audio/dictationAudioRegistry";
import type { RecordingOrigin } from "@/features/audio/recordingOrigin";

export type VoicePhase = "idle" | "listening" | "transcribing" | "transcript";

export interface VoiceAnswer {
  phase: VoicePhase;
  /** Exactly what came back from the transcriber (or what the user then edited). */
  transcript: string;
  setTranscript: (next: string) => void;
  /** The transcript is being edited by hand rather than read once. */
  editing: boolean;
  beginEditing: () => void;
  /** 0–100 live mic level, for the listening meter. */
  level: number;
  /** `cld_files` id of the saved recording, when the upload landed. */
  audioFileId: string | null;
  /** Set when the recording could not be saved — shown, never swallowed. */
  audioError: string | null;
  retryAudio: (() => void) | null;
  /** Capture / permission failures, in the browser's words. */
  error: string | null;
  /** Recording is unavailable on this route (no provider mounted). */
  available: boolean;
  start: () => void;
  stop: () => void;
  /** Throw the transcript away and go back to idle. */
  reset: () => void;
}

export interface UseVoiceAnswerArgs {
  questionId: string | null;
  questionTitle: string;
  interviewId: string;
}

export function useVoiceAnswer({
  questionId,
  questionTitle,
  interviewId,
}: UseVoiceAnswerArgs): VoiceAnswer {
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [transcript, setTranscript] = useState("");
  const [editing, setEditing] = useState(false);
  const [audioFileId, setAudioFileId] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const retryRef = useRef<FailedDictationAudio["retry"] | null>(null);

  const origin: RecordingOrigin | null = useMemo(
    () =>
      questionId
        ? {
            surface: "question_desk.interview",
            entityToken: "interview_decision_question",
            entityId: questionId,
            label: questionTitle,
            href: `/administration/question-desk/${interviewId}`,
          }
        : null,
    [questionId, questionTitle, interviewId],
  );

  const capture = useVoiceCapture({
    instanceId: `question-desk-${questionId ?? "none"}`,
    origin,
    label: "Question Desk answer",
    onTranscript: (finalText) => {
      setTranscript(finalText);
      setEditing(false);
      setPhase("transcript");
    },
    onError: (message) => {
      setError(message);
      setPhase("idle");
    },
  });

  // The recording's durable file id, announced by the shared recorder once the
  // upload lands. Only OUR origin's announcement is taken.
  useEffect(() => {
    if (!questionId) return undefined;
    return subscribeDictationAudio((event) => {
      if (event.type === "saved") {
        if (event.saved.origin?.entityId !== questionId) return;
        setAudioFileId(event.saved.fileId);
        setAudioError(null);
        retryRef.current = null;
      } else {
        if (event.failed.origin?.entityId !== questionId) return;
        setAudioError(
          `The recording itself could not be saved (${event.failed.error}). Your words are still here and will save without the audio.`,
        );
        retryRef.current = event.failed.retry;
      }
    });
  }, [questionId]);

  // A question change abandons any in-flight transcript rather than carrying
  // one person's words onto another question.
  useEffect(() => {
    setPhase("idle");
    setTranscript("");
    setEditing(false);
    setAudioFileId(null);
    setAudioError(null);
    setError(null);
    retryRef.current = null;
  }, [questionId]);

  const start = useCallback(() => {
    setError(null);
    setAudioError(null);
    setAudioFileId(null);
    setTranscript("");
    setEditing(false);
    setPhase("listening");
    void capture.start().catch((startError: unknown) => {
      setError(
        startError instanceof Error ? startError.message : String(startError),
      );
      setPhase("idle");
    });
  }, [capture]);

  const stop = useCallback(() => {
    capture.stop();
    setPhase("transcribing");
  }, [capture]);

  const reset = useCallback(() => {
    capture.cancel();
    setPhase("idle");
    setTranscript("");
    setEditing(false);
    setAudioFileId(null);
    setAudioError(null);
    retryRef.current = null;
  }, [capture]);

  const retryAudio = useCallback(() => {
    const retry = retryRef.current;
    if (!retry) return;
    setAudioError(null);
    void retry().catch(() => {
      /* the registry re-announces the failure; the message is set there */
    });
  }, []);

  // The capture path may finish transcribing before `onTranscript` fires; keep
  // the phase honest rather than showing "Listening…" after the mic stopped.
  const livePhase: VoicePhase =
    phase === "listening" && !capture.isRecording && capture.isTranscribing
      ? "transcribing"
      : phase;

  return {
    phase: livePhase,
    transcript,
    setTranscript,
    editing,
    beginEditing: () => setEditing(true),
    level: capture.audioLevel,
    audioFileId,
    audioError,
    retryAudio: retryRef.current ? retryAudio : null,
    error,
    available: capture.available,
    start,
    stop,
    reset,
  };
}
