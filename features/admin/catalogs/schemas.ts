// features/admin/catalogs/schemas.ts
//
// Per-kind Zod payload schemas for public.catalog_entries (matrx-local,
// schema_version 1) — the TypeScript twins of the aidream Pydantic kind
// schemas (aidream/services/catalogs/schemas.py, source of truth).
// Pragmatic by design: each kind pins its identity/required fields and lets
// every unknown key pass through unchanged (loose object parsing) so payloads
// round-trip verbatim — the same forward-compat posture as app-config.
// Cross-repo system-of-record: common-docs/remote-catalogs/FEATURE.md

import { z } from "zod";

import type { CatalogEntryRow } from "@/features/admin/catalogs/types";

/** Same constraints as the DB CHECKs on catalog_entries. */
export const CATALOG_APP_REGEX = /^[a-z0-9][a-z0-9-]{1,62}$/;
export const CATALOG_KIND_REGEX = /^[a-z0-9][a-z0-9_]{1,62}$/;
export const CATALOG_KEY_REGEX = /^[A-Za-z0-9][A-Za-z0-9._:@/ -]{0,199}$/;
export const SEMVER_REGEX = /^\d+\.\d+\.\d+$/;
export const SHA256_REGEX = /^[a-f0-9]{64}$/;

/** The app every catalog kind below belongs to; also the landing default. */
export const DEFAULT_CATALOG_APP = "matrx-local";

const loose = <T extends z.ZodRawShape>(shape: T) =>
  z.object(shape).catchall(z.unknown());

const ratingSchema = z.number().int().min(0).max(5);

// ── Per-kind payload schemas (matrx-local, schema_version 1) ────────────────

export const llmModelSchema = loose({
  name: z.string().min(1),
  repo_id: z.string().min(1),
});

export const whisperModelSchema = loose({
  name: z.string().min(1),
});

export const imageGenModelSchema = loose({
  model_id: z.string().min(1),
  name: z.string().min(1),
  provider: z.string().min(1),
  pipeline_type: z.string().min(1),
  vram_gb: z.number().nonnegative().optional(),
  ram_gb: z.number().nonnegative().optional(),
  quality_rating: ratingSchema.optional(),
  speed_rating: ratingSchema.optional(),
});

export const videoGenModelSchema = loose({
  model_id: z.string().min(1),
  name: z.string().min(1),
  provider: z.string().min(1),
  pipeline_type: z.string().min(1),
  supports_image_to_video: z.boolean().optional(),
});

export const loraSchema = loose({
  repo_id: z.string().min(1),
  weight_name: z.string().min(1),
  base_family: z.string().min(1),
});

export const workflowPresetSchema = loose({
  preset_id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  prompt_template: z.string().min(1),
  suggested_model_id: z.string().optional(),
  steps: z.number().int().positive().optional(),
  guidance: z.number().nonnegative().optional(),
});

export const systemPromptSchema = loose({
  name: z.string().min(1),
  prompt: z.string().min(1),
});

export const ttsVoiceSchema = loose({
  voice_id: z.string().min(1),
  name: z.string().min(1),
  gender: z.enum(["female", "male"]).optional(),
  language: z.string().optional(),
  lang_code: z.string().optional(),
});

export const ttsLanguageSchema = loose({
  lang_code: z.string().min(1),
  name: z.string().min(1),
});

export const nerModelSchema = loose({
  model_id: z.string().min(1),
  repo_id: z.string().min(1),
  display_name: z.string().min(1),
  backend: z.string().optional(),
  tier: z.string().optional(),
});

export const wakeWordModelSchema = loose({
  name: z.string().min(1),
  filename: z.string().min(1),
});

export const apiKeyProviderSchema = loose({
  provider: z.string().min(1),
  name: z.string().min(1),
  pattern: z.string().optional(),
});

// ── Kind registry ────────────────────────────────────────────────────────────

export interface CatalogKindDef {
  slug: string;
  label: string;
  description: string;
  schema: z.ZodType<Record<string, unknown>>;
  /** Whether entries of this kind normally point at a downloadable artifact. */
  hasArtifact: boolean;
}

export const CATALOG_KINDS: readonly CatalogKindDef[] = [
  {
    slug: "llm_model",
    label: "Local LLM models",
    description: "GGUF models for the local llama.cpp engine (HF URLs, quants, RAM requirements).",
    schema: llmModelSchema,
    hasArtifact: true,
  },
  {
    slug: "whisper_model",
    label: "Whisper / STT tiers",
    description: "Speech-to-text model tiers + VAD for local transcription.",
    schema: whisperModelSchema,
    hasArtifact: true,
  },
  {
    slug: "image_gen_model",
    label: "Image-gen models",
    description: "Diffusers image generation models (pipeline family, VRAM/RAM, ratings, defaults).",
    schema: imageGenModelSchema,
    hasArtifact: true,
  },
  {
    slug: "video_gen_model",
    label: "Video-gen models",
    description: "Local video generation models (T2V/I2V pipelines and defaults).",
    schema: videoGenModelSchema,
    hasArtifact: true,
  },
  {
    slug: "lora",
    label: "LoRAs",
    description: "Curated image-gen LoRA weights (Civitai/HF refs, base family, weights).",
    schema: loraSchema,
    hasArtifact: true,
  },
  {
    slug: "workflow_preset",
    label: "Workflow presets",
    description: "Preconfigured image-gen workflows — prompt templates, steps, guidance, sizes.",
    schema: workflowPresetSchema,
    hasArtifact: false,
  },
  {
    slug: "system_prompt",
    label: "System prompts",
    description: "Built-in desktop system prompts (copy tuned often).",
    schema: systemPromptSchema,
    hasArtifact: false,
  },
  {
    slug: "tts_voice",
    label: "TTS voices",
    description: "Kokoro TTS voice catalog (voice id, language, quality grade, traits).",
    schema: ttsVoiceSchema,
    hasArtifact: false,
  },
  {
    slug: "tts_language",
    label: "TTS languages",
    description: "Kokoro language metadata (lang codes, espeak fallbacks).",
    schema: ttsLanguageSchema,
    hasArtifact: false,
  },
  {
    slug: "ner_model",
    label: "NER models",
    description: "Local NER / information-extraction models (GLiNER tiers, disk/RAM estimates).",
    schema: nerModelSchema,
    hasArtifact: true,
  },
  {
    slug: "wake_word_model",
    label: "Wake-word models",
    description: "openWakeWord model registry for voice activation.",
    schema: wakeWordModelSchema,
    hasArtifact: true,
  },
  {
    slug: "api_key_provider",
    label: "API-key providers",
    description: "Provider key patterns for the desktop API-key vault (must match backend VALID_PROVIDERS).",
    schema: apiKeyProviderSchema,
    hasArtifact: false,
  },
] as const;

export function kindDef(slug: string): CatalogKindDef | null {
  return CATALOG_KINDS.find((k) => k.slug === slug) ?? null;
}

export function kindLabel(slug: string): string {
  return kindDef(slug)?.label ?? slug;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Best-effort human name pulled out of a payload for list views. */
export function payloadDisplayName(payload: unknown): string | null {
  if (!isPlainObject(payload)) return null;
  for (const field of ["name", "display_name", "title", "voice_id", "model_id", "preset_id", "repo_id"]) {
    const value = payload[field];
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  return null;
}

/**
 * Validate a payload against its kind schema. Unknown kinds are allowed
 * (forward compat — the DB accepts any kind slug) but reported as
 * unvalidatable so the UI can say so honestly.
 */
export type PayloadValidation =
  | { status: "valid" }
  | { status: "invalid"; issues: string[] }
  | { status: "unknown_kind" };

export function validatePayload(
  kind: string,
  payload: unknown,
): PayloadValidation {
  const def = kindDef(kind);
  if (!def) return { status: "unknown_kind" };
  const parsed = def.schema.safeParse(payload);
  if (parsed.success) return { status: "valid" };
  return {
    status: "invalid",
    issues: parsed.error.issues.map((issue) => {
      const path = issue.path.map(String).join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    }),
  };
}

/**
 * Canonical pretty-JSON snapshot of the versioned fields of a catalog entry —
 * the ONE shape fed to DiffViewer everywhere (save confirm, delete confirm,
 * history diffs) so diffs are apples-to-apples with stable key ordering.
 */
export function entrySnapshotJson(snapshot: {
  app: string;
  kind: string;
  key: string;
  schema_version: number;
  payload: unknown;
  artifact_url: string | null;
  artifact_sha256: string | null;
  artifact_size_bytes: number | null;
  min_app_version: string | null;
  is_active: boolean;
  sort_order: number;
  notes: string | null;
}): string {
  const payload = isPlainObject(snapshot.payload)
    ? Object.fromEntries(
        Object.entries(snapshot.payload).sort(([a], [b]) => a.localeCompare(b)),
      )
    : snapshot.payload;
  return JSON.stringify(
    {
      app: snapshot.app,
      kind: snapshot.kind,
      key: snapshot.key,
      schema_version: snapshot.schema_version,
      payload,
      artifact_url: snapshot.artifact_url,
      artifact_sha256: snapshot.artifact_sha256,
      artifact_size_bytes: snapshot.artifact_size_bytes,
      min_app_version: snapshot.min_app_version,
      is_active: snapshot.is_active,
      sort_order: snapshot.sort_order,
      notes: snapshot.notes,
    },
    null,
    2,
  );
}

/** Snapshot JSON for a live row (narrows the row to the versioned fields). */
export function rowSnapshotJson(row: CatalogEntryRow): string {
  return entrySnapshotJson(row);
}
