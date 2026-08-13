import { apiMultipart, apiPost } from "@/lib/api/typed-client";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
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
  request?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<TranscriptionResult> {
  const form = new FormData();
  form.append("file", file);
  if (options?.language) form.append("language", options.language);
  const { data } = await apiMultipart("/audio/transcribe", form, request);
  return normalizeTranscription(data);
}

/**
 * Transcribe an ALREADY-SAVED cloud file by `file_id`.
 *
 * Prefer this over `transcribeAudioFile` whenever the media is already in
 * `files.files`: the bytes never leave the server, so there is no re-upload,
 * and the server demuxes video → audio and chunks past the provider size limit
 * itself. The caller passes an owned file id; ownership is enforced serverside.
 */
export async function transcribeCloudFile(
  params: {
    fileId: string;
    language?: string;
    model?: string;
    organizationId?: string;
  },
  signal?: AbortSignal,
): Promise<TranscriptionResult> {
  const organizationId = await ensureOrgId(params.organizationId);
  const { data } = await apiPost(
    "/audio/transcribe-file",
    {
      file_id: params.fileId,
      language: params.language ?? null,
      organization_id: organizationId,
      ...(params.model ? { model: params.model } : {}),
    },
    { signal },
  );
  return normalizeTranscription(data);
}

export async function transcribeAudioUrl(
  url: string,
  options?: TranscriptionOptions,
  organizationId?: string,
): Promise<TranscriptionResult> {
  const resolvedOrganizationId = await ensureOrgId(organizationId);
  const { data } = await apiPost("/audio/transcribe-url", {
    url,
    language: options?.language,
    organization_id: resolvedOrganizationId,
  });
  return normalizeTranscription(data);
}

export async function generateSpeech(
  text: string,
  options: {
    voice?: string;
    quality?: "fast" | "high_quality";
    organizationId?: string;
  } = {},
): Promise<SpeechWire> {
  // Preferences persisted before the catalog migration can still contain a
  // retired PlayAI voice. Omit it so the backend's current catalog default wins.
  const voice = options.voice?.toLowerCase();
  const organizationId = await ensureOrgId(options.organizationId);
  const { data } = await apiPost("/audio/text-to-speech", {
    text,
    organization_id: organizationId,
    voice: voice && CATALOG_TTS_VOICES.has(voice) ? voice : undefined,
    quality: options.quality ?? "fast",
  });
  return data;
}
