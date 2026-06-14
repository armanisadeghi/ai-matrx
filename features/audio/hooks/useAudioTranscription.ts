/**
 * Audio Transcription Hook
 *
 * Handles audio transcription via Groq API
 */

"use client";

import { useState, useCallback } from "react";
import { TranscriptionResult, TranscriptionOptions } from "../types";
import { toAudioFile } from "../utils/audio-mime";

export function useAudioTranscription() {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TranscriptionResult | null>(null);

  const transcribe = useCallback(
    async (
      audioBlob: Blob,
      options?: TranscriptionOptions,
    ): Promise<TranscriptionResult> => {
      setIsTranscribing(true);
      setError(null);

      try {
        // Create form data with audio file. `toAudioFile` guarantees a clean
        // `audio/*` MIME type + matching extension so the server never
        // misclassifies the recording as video (empty/`video/webm`/`;codecs=`
        // types all sniff to video otherwise).
        const formData = new FormData();
        formData.append("file", toAudioFile(audioBlob, { prefix: "audio" }));

        // Add optional parameters
        if (options?.language) {
          formData.append("language", options.language);
        }
        // Explicit prompt wins; otherwise apply Custom Dictionary biasing when the
        // caller opted in via dictionarySurfaceKey. Best-effort, never blocks.
        let prompt = options?.prompt ?? "";
        if (!prompt && options?.dictionarySurfaceKey) {
          const { resolveDictionarySttPrompt } =
            await import("@/features/dictionary/sttBridge");
          prompt = await resolveDictionarySttPrompt(
            options.dictionarySurfaceKey,
          );
        }
        if (prompt) {
          formData.append("prompt", prompt);
        }

        // Call transcription API
        const response = await fetch("/api/audio/transcribe", {
          method: "POST",
          body: formData,
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Transcription failed");
        }

        setResult(data);
        return data;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);

        const errorResult: TranscriptionResult = {
          success: false,
          text: "",
          error: errorMessage,
        };

        setResult(errorResult);
        return errorResult;
      } finally {
        setIsTranscribing(false);
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setIsTranscribing(false);
    setError(null);
    setResult(null);
  }, []);

  return {
    transcribe,
    isTranscribing,
    error,
    result,
    reset,
  };
}
