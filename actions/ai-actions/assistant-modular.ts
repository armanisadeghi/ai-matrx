"use server";

import type {
  AiResponse,
  ProcessAiRequestParams,
} from "@/types/voice/voiceAssistantTypes";

/**
 * Compatibility seam for retired development voice demos.
 *
 * Provider SDK calls no longer belong in Next server actions. Active speech
 * and transcription use the authenticated, catalog-routed aidream audio API.
 */
export async function processAiRequest(
  _params: ProcessAiRequestParams,
): Promise<AiResponse> {
  throw new Error(
    "This legacy voice demo has been retired. Use the voice playground.",
  );
}
