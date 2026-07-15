import { postJson, postMultipart } from "@/lib/python-client";
import type { components } from "@/types/python-generated/api-types";
import type { TranscriptionOptions, TranscriptionResult } from "../types";

type TranscriptionWire = components["schemas"]["TranscriptionResponse"];
type SpeechWire = components["schemas"]["SpeechResponse"];

function normalizeTranscription(data: TranscriptionWire): TranscriptionResult {
  return {
    success: true,
    text: data.text,
    language: data.language ?? undefined,
    duration: data.duration ?? undefined,
    segments: (data.segments ?? []).map((segment, index) => ({
      id: segment.id ?? index,
      seek: segment.seek ?? 0,
      start: segment.start ?? 0,
      end: segment.end ?? 0,
      text: segment.text,
      tokens: segment.tokens ?? [],
      temperature: segment.temperature ?? 0,
      avg_logprob: segment.avg_logprob ?? 0,
      compression_ratio: segment.compression_ratio ?? 0,
      no_speech_prob: segment.no_speech_prob ?? 0,
    })),
  };
}

const CATALOG_TTS_VOICES = new Set([
  "autumn",
  "diana",
  "hannah",
  "austin",
  "daniel",
  "troy",
]);

export async function transcribeAudioFile(
  file: File,
  options?: TranscriptionOptions,
  signal?: AbortSignal,
): Promise<TranscriptionResult> {
  const form = new FormData();
  form.append("file", file);
  if (options?.language) form.append("language", options.language);
  if (options?.prompt) form.append("prompt", options.prompt);
  const { data } = await postMultipart<TranscriptionWire>("/audio/transcribe", form, {
    signal,
  });
  return normalizeTranscription(data);
}

export async function transcribeAudioUrl(
  url: string,
  options?: TranscriptionOptions,
): Promise<TranscriptionResult> {
  const { data } = await postJson<TranscriptionWire>("/audio/transcribe-url", {
    url,
    language: options?.language,
    prompt: options?.prompt,
  });
  return normalizeTranscription(data);
}

export async function generateSpeech(
  text: string,
  options: { voice?: string; quality?: "fast" | "high_quality" } = {},
): Promise<SpeechWire> {
  // Preferences persisted before the catalog migration can still contain a
  // retired PlayAI voice. Omit it so the backend's current catalog default wins.
  const voice = options.voice?.toLowerCase();
  const { data } = await postJson<SpeechWire>("/audio/text-to-speech", {
    text,
    voice: voice && CATALOG_TTS_VOICES.has(voice) ? voice : undefined,
    quality: options.quality ?? "fast",
  });
  return data;
}
