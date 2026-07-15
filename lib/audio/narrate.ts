"use client";

import { generateSpeech } from "@/features/audio/services/speechApi";

export interface NarrateOptions {
  voice?: string;
  sourceType?: string;
  sourceId?: string;
}

export interface NarrateSuccess {
  fileId: string;
  url?: string;
}

export interface NarrateFailure {
  error: string;
}

/** Generate durable narration through the catalog-routed aidream speech seam. */
export async function narrate(
  text: string,
  opts: NarrateOptions = {},
): Promise<NarrateSuccess | NarrateFailure> {
  const trimmed = text?.trim();
  if (!trimmed) return { error: "narrate: text is required" };

  try {
    const speech = await generateSpeech(trimmed, {
      voice: opts.voice ?? "troy",
      quality: "high_quality",
    });
    return { fileId: speech.file_id, url: speech.url };
  } catch (error) {
    return {
      error: `narrate: text-to-speech request failed (${asMessage(error)})`,
    };
  }
}

function asMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : "Unknown error";
}
