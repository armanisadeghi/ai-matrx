import type { TranscriptionResult } from "../types";

export interface TranscriptionFinalizationDecision {
  result: TranscriptionResult;
  safetyStatus: "complete" | "failed";
  finalText: string;
}

interface TranscriptionFinalizationInput {
  partialText: string;
  hadChunkFailures: boolean;
  fallbackResult: TranscriptionResult | null;
}

/**
 * Decide whether a stopped recording is genuinely complete.
 *
 * A successful full-recording fallback supersedes partial chunk text. When
 * both lanes fail, the partial text remains available to the caller but the
 * recording stays recoverable in IndexedDB; failure must never be rewritten
 * as an empty successful transcript.
 */
export function resolveTranscriptionFinalization({
  partialText,
  hadChunkFailures,
  fallbackResult,
}: TranscriptionFinalizationInput): TranscriptionFinalizationDecision {
  const normalizedPartialText = partialText.trim();

  if (!hadChunkFailures) {
    return {
      result: { success: true, text: normalizedPartialText },
      safetyStatus: "complete",
      finalText: normalizedPartialText,
    };
  }

  if (fallbackResult?.success) {
    const fallbackText = fallbackResult.text.trim();
    return {
      result: { ...fallbackResult, text: fallbackText },
      safetyStatus: "complete",
      finalText: fallbackText,
    };
  }

  const error =
    fallbackResult?.error?.trim() ||
    "Live transcription and full-recording recovery both failed. Your audio is saved for recovery.";
  return {
    result: { success: false, text: normalizedPartialText, error },
    safetyStatus: "failed",
    finalText: normalizedPartialText,
  };
}
