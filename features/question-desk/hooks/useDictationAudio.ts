"use client";

// features/question-desk/hooks/useDictationAudio.ts
//
// THE RECORDING BEHIND A SPOKEN ANSWER.
//
// The mic on this surface is `ProTextarea`'s — the platform's one text field,
// which owns recording, live transcription, the device menu, the "don't close
// while I'm still recording" protection and the cleanup actions. This feature
// wires none of that itself (it used to, and Arman's ruling on 2026-09-12 was
// that a textarea here must be ProTextarea "so that you automatically get all
// of the recording features and the other things that come along with it").
//
// What is left for this feature is the one thing ProTextarea cannot know: the
// answer row wants the `cld_files` id of the audio. The shared recorder uploads
// every full dictation through the canonical file handler and announces the id
// on `dictationAudioRegistry`, keyed by the `RecordingOrigin` the surface
// declared. This hook listens for the announcement that belongs to THIS
// question and hands the id to the save.
//
// A failed upload is SAID, never swallowed: the answer still saves (his words
// matter more than the recording), and the screen offers the retry the registry
// kept alive.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  subscribeDictationAudio,
  type FailedDictationAudio,
} from "@/features/audio/dictationAudioRegistry";
import type { RecordingOrigin } from "@/features/audio/recordingOrigin";

/** The origin every recording started inside a question's box carries. */
export function questionRecordingOrigin(
  interviewId: string,
  questionId: string,
  questionTitle: string,
): RecordingOrigin {
  return {
    surface: "question_desk.interview",
    entityToken: "interview_decision_question",
    entityId: questionId,
    label: questionTitle,
    href: `/administration/question-desk/${interviewId}`,
  };
}

export interface DictationAudio {
  /** `cld_files` id of the recording behind the current draft, when saved. */
  fileId: string | null;
  /** Why the recording could not be kept — shown, never swallowed. */
  error: string | null;
  /** Re-attempt the upload of the same in-memory blob, when one is held. */
  retry: (() => void) | null;
  /** Forget the held id (after a save, or a discard). */
  reset: () => void;
}

export function useDictationAudio(questionId: string | null): DictationAudio {
  const [fileId, setFileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const retryRef = useRef<FailedDictationAudio["retry"] | null>(null);

  useEffect(() => {
    setFileId(null);
    setError(null);
    retryRef.current = null;
    if (!questionId) return undefined;
    return subscribeDictationAudio((event) => {
      if (event.type === "saved") {
        if (event.saved.origin?.entityId !== questionId) return;
        setFileId(event.saved.fileId);
        setError(null);
        retryRef.current = null;
      } else {
        if (event.failed.origin?.entityId !== questionId) return;
        setError(
          `The recording itself could not be saved (${event.failed.error}). Your words are still here and will save without the audio.`,
        );
        retryRef.current = event.failed.retry;
      }
    });
  }, [questionId]);

  const retry = useCallback(() => {
    const held = retryRef.current;
    if (!held) return;
    setError(null);
    void held().catch(() => {
      /* the registry re-announces the failure; the message is set there */
    });
  }, []);

  const reset = useCallback(() => {
    setFileId(null);
    setError(null);
    retryRef.current = null;
  }, []);

  return { fileId, error, retry: retryRef.current ? retry : null, reset };
}
