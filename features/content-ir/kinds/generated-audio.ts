/**
 * `generated_audio` — the output of `ai.text_to_speech`: one synthesized
 * speech clip.
 *
 * PYTHON-OWNED: the seeded schema is `TextToSpeechOutput.model_json_schema()`
 * (`aidream/packages/matrx-ai/matrx_ai/graph_nodes/tts_action.py`).
 *
 * MEDIA DURABILITY. `TextToSpeechOutput` carries `file_id` — the durable
 * handle — beside `audio_url` / `audio_cdn_url` / `audio_signed_url`. The
 * bridge prefers the id and falls back CDN → url → signed, so a clip renders
 * through the most durable reference the producer gave it and an expiring URL
 * re-mints instead of breaking.
 *
 * Single-object shape, so the bridge is effectively complete-only in practice
 * — but it is written partial-tolerant like every other bridge, so a
 * half-parsed object renders its known fields instead of raw JSON.
 */

import type { CanonicalBlockIR } from "../core/ir-types";
import type { KindSchema } from "../core/kind-schema.types";
import type { KindDefinition } from "../registry/kind-registry.types";
import {
  additionalDetailsSection,
  collectExtras,
  joinBlocks,
} from "./kind-markdown-utils";
import {
  formatCost,
  formatDuration,
  optionalNumber,
  optionalString,
  readUsage,
  stringOrEmpty,
  type MediaUsage,
} from "./media-io-shared";

// ---------------------------------------------------------------------------
// Schema — mirror of TextToSpeechOutput.
// ---------------------------------------------------------------------------

export const generatedAudioKindSchema: KindSchema = {
  kind: "generated_audio",
  fields: {
    file_id: {
      type: "string",
      nullable: true,
      description:
        "cld_files id — the durable handle, preferred over every URL. Added producer-side by the media-identity work order.",
    },
    audio_url: {
      type: "string",
      nullable: true,
      description:
        "Playable URL. Permanent for public audio, short-lived for personal audio — re-resolve from file_id on expiry.",
    },
    audio_cdn_url: {
      type: "string",
      nullable: true,
      description: "Permanent CDN URL, present only when the audio is public.",
    },
    audio_signed_url: {
      type: "string",
      nullable: true,
      description: "Expiring playable URL, present only for non-public audio.",
    },
    audio_path: { type: "string", nullable: true, description: "Local temp path, when the provider wrote a file." },
    audio_b64: { type: "string", nullable: true, description: "Base64 bytes, when nothing else is available." },
    mime_type: { type: "string", nullable: true },
    duration_seconds: { type: "number" },
    model: { type: "string", required: true },
    usage: { type: "json", description: "Aggregated token / cost usage for the run." },
  },
};

// ---------------------------------------------------------------------------
// serverData bridge.
// ---------------------------------------------------------------------------

export interface GeneratedAudioData {
  /** What `<InlineMediaRef>` resolves — file_id when present, else the URL. */
  handle: string | null;
  file_id: string | null;
  audio_url: string | null;
  audio_cdn_url: string | null;
  audio_signed_url: string | null;
  mime_type: string | null;
  duration_seconds: number | null;
  model: string;
  usage: MediaUsage | null;
  /** True when the provider returned only base64 bytes — nothing durable to link. */
  bytesOnly: boolean;
  isComplete: boolean;
}

export function readGeneratedAudio(value: Record<string, unknown>): GeneratedAudioData {
  const fileId = optionalString(value.file_id);
  const audioUrl = optionalString(value.audio_url);
  const audioCdnUrl = optionalString(value.audio_cdn_url);
  const audioSignedUrl = optionalString(value.audio_signed_url);
  // Durable first: the id, then the permanent CDN URL, then whatever playable
  // URL exists. A signed URL is last because it is a handoff, not an identity.
  const handle = fileId ?? audioCdnUrl ?? audioUrl ?? audioSignedUrl;
  return {
    handle,
    file_id: fileId,
    audio_url: audioUrl,
    audio_cdn_url: audioCdnUrl,
    audio_signed_url: audioSignedUrl,
    mime_type: optionalString(value.mime_type),
    duration_seconds: optionalNumber(value.duration_seconds),
    model: stringOrEmpty(value.model),
    usage: readUsage(value.usage),
    bytesOnly: !handle && optionalString(value.audio_b64) !== null,
    isComplete: false,
  };
}

export function generatedAudioServerDataFromEnvelope(
  envelope: CanonicalBlockIR,
): (GeneratedAudioData & Record<string, unknown>) | undefined {
  if (envelope.root.kind !== "generated_audio") return undefined;
  return {
    ...readGeneratedAudio(envelope.root.value),
    isComplete: envelope.root.status === "complete",
  };
}

// ---------------------------------------------------------------------------
// toMarkdown facet.
// ---------------------------------------------------------------------------

const MD_KNOWN_KEYS = [
  "file_id",
  "audio_url",
  "audio_cdn_url",
  "audio_signed_url",
  "audio_path",
  "audio_b64",
  "mime_type",
  "duration_seconds",
  "model",
  "usage",
];

export function generatedAudioMarkdownFromValue(
  value: Record<string, unknown>,
): string {
  const audio = readGeneratedAudio(value);
  const duration = formatDuration(audio.duration_seconds);
  const cost = formatCost(audio.usage?.cost_usd ?? null);

  return joinBlocks([
    "# Generated audio",
    [
      audio.model ? `Model: \`${audio.model}\`` : null,
      duration ? `Duration: ${duration}` : null,
      cost ? `Cost: ${cost}` : null,
    ]
      .filter(Boolean)
      .join(" · ") || null,
    (audio.audio_cdn_url ?? audio.audio_url)
      ? `[Listen](${audio.audio_cdn_url ?? audio.audio_url})`
      : null,
    additionalDetailsSection(collectExtras(value, MD_KNOWN_KEYS)),
  ]);
}

// ---------------------------------------------------------------------------
// Compiled definition.
// ---------------------------------------------------------------------------

export const GENERATED_AUDIO_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: "generated_audio",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "generated_audio",
    toLegacyServerData: generatedAudioServerDataFromEnvelope,
    toMarkdown: generatedAudioMarkdownFromValue,
    persistence: { persistStructured: true },
    loadingComponent: "media",
    schema: generatedAudioKindSchema,
  },
];
