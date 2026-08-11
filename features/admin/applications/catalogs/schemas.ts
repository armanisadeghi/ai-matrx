// features/admin/applications/catalogs/schemas.ts
//
// Per-kind Zod payload schemas for public.catalog_entries (matrx-local,
// schema_version 1) — the TypeScript twins of the aidream Pydantic kind
// schemas (aidream/services/catalogs/schemas.py, source of truth).
// Pragmatic by design: each kind pins its identity/required fields and lets
// every unknown key pass through unchanged (loose object parsing) so payloads
// round-trip verbatim — the same forward-compat posture as app-config.
// Cross-repo system-of-record: common-docs/systems/remote-catalogs/FEATURE.md

import { z } from "zod";

import type { CatalogEntryRow } from "@/features/admin/applications/catalogs/types";

/** Same constraints as the DB CHECKs on catalog_entries. */
export const CATALOG_APP_REGEX = /^[a-z0-9][a-z0-9-]{1,62}$/;
export const CATALOG_KIND_REGEX = /^[a-z0-9][a-z0-9_]{1,62}$/;
// Includes underscore, matching the LIVE DB CHECK (verified 2026-07-23:
// key ~ '^[A-Za-z0-9][A-Za-z0-9._:@/ _-]{0,199}$'). This constant was stale —
// credential_definition keys are snake_case ('env_value', 'openai_api_key').
export const CATALOG_KEY_REGEX = /^[A-Za-z0-9][A-Za-z0-9._:@/_ -]{0,199}$/;
export const SEMVER_REGEX = /^\d+\.\d+\.\d+$/;
export const SHA256_REGEX = /^[a-f0-9]{64}$/;

/** The app every catalog kind below belongs to; also the landing default. */
export const DEFAULT_CATALOG_APP = "matrx-local";

const loose = <T extends z.ZodRawShape>(shape: T) =>
  z.object(shape).catchall(z.unknown());

const ratingSchema = z.number().int().min(0).max(5);
const intSchema = z.number().int();

// ── Per-kind payload schemas (matrx-local, schema_version 1) ────────────────
//
// Each schema below is the Zod twin of a Pydantic payload class in
// aidream/aidream/services/catalogs/schemas.py — the server release gate.
// The twins MUST move together: a field added/renamed/retyped in the Pydantic
// class must land here in the same change, or the editor's dual-gate and the
// server gate will disagree on which rows are valid. Requiredness mirrors
// Pydantic exactly: fields with defaults are .optional() here; `X | None`
// fields are .nullable().optional().

/** Twin of `LlmModelVariantPayload` — one quantization variant. */
export const llmModelVariantSchema = loose({
  label: z.string(),
  quant: z.string(),
  filename: z.string(),
  disk_size_gb: z.number(),
  ram_required_gb: z.number(),
  hf_url: z.string(),
  hf_parts: z.array(z.string()).optional(),
  expected_size_bytes: intSchema.optional(),
  hf_part_sizes: z.array(intSchema).optional(),
  mmproj_filename: z.string().optional(),
  mmproj_url: z.string().optional(),
  mmproj_expected_size_bytes: intSchema.optional(),
});

/** Twin of `LlmModelPayload` (Rust `LlmModelInfo`, snake_case). */
export const llmModelSchema = loose({
  tier: z.string(),
  name: z.string(),
  provider: z.string(),
  filename: z.string(),
  disk_size_gb: z.number(),
  ram_required_gb: z.number(),
  text_rating: ratingSchema,
  code_rating: ratingSchema,
  vision_rating: ratingSchema,
  tool_calling_rating: ratingSchema,
  speed: z.string(),
  description: z.string(),
  knowledge_cutoff: z.string(),
  hf_model_card_url: z.string(),
  is_uncensored: z.boolean().optional(),
  is_server_grade: z.boolean().optional(),
  hf_url: z.string(),
  hf_parts: z.array(z.string()).optional(),
  context_length: intSchema,
  expected_size_bytes: intSchema.optional(),
  hf_part_sizes: z.array(intSchema).optional(),
  mmproj_filename: z.string().optional(),
  mmproj_url: z.string().optional(),
  mmproj_expected_size_bytes: intSchema.optional(),
  variants: z.array(llmModelVariantSchema).optional(),
});

/** Twin of `WhisperModelPayload` — STT tiers plus the role="vad" artifact
 *  (ggml-silero), which has no tier/speed/accuracy semantics. */
export const whisperModelSchema = loose({
  filename: z.string(),
  description: z.string(),
  role: z.enum(["transcription", "vad"]).optional(),
  tier: z.string().nullable().optional(),
  download_size_mb: intSchema.nullable().optional(),
  ram_required_mb: intSchema.nullable().optional(),
  relative_speed: z.string().nullable().optional(),
  accuracy: z.string().nullable().optional(),
});

/** Twin of `ImageGenModelPayload` (`ImageGenModel` dataclass). */
export const alternativeTextEncoderSchema = loose({
  encoder_id: z.string(),
  name: z.string(),
  description: z.string(),
  repo_id: z.string(),
  format: z.enum(["transformers", "gguf", "state_dict"]),
  files: z.array(z.string()),
  revision: z.string().regex(/^[0-9a-f]{40}$/),
  subfolder: z.string().nullable().optional(),
  weight_name: z.string().nullable().optional(),
  requires_hf_token: z.boolean().optional(),
  license: z.string().optional(),
  unverified: z.boolean().optional(),
  download_size_gb: z.number().optional(),
  source_url: z.string().nullable().optional(),
});

export const imageGenModelSchema = loose({
  model_id: z.string(),
  name: z.string(),
  provider: z.string(),
  pipeline_type: z.string(),
  vram_gb: z.number(),
  ram_gb: z.number(),
  description: z.string(),
  quality_rating: ratingSchema,
  speed_rating: ratingSchema,
  recommended_steps: intSchema,
  recommended_guidance: z.number(),
  supports_negative_prompt: z.boolean(),
  model_card_url: z.string(),
  default_width: intSchema.optional(),
  default_height: intSchema.optional(),
  download_size_gb: z.number().optional(),
  load_variant: z.string().nullable().optional(),
  requires_hf_token: z.boolean().optional(),
  supports_img2img: z.boolean().optional(),
  img2img_strength: z.boolean().optional(),
  lora_family: z.string().optional(),
  tags: z.array(z.string()).optional(),
  format: z.string().optional(),
  weight_name: z.string().nullable().optional(),
  text_encoders: z.array(alternativeTextEncoderSchema).optional(),
});

/** Twin of `VideoGenModelPayload` (`VideoGenModel` dataclass). */
export const videoGenModelSchema = loose({
  model_id: z.string(),
  name: z.string(),
  provider: z.string(),
  pipeline_type: z.string(),
  vram_gb: z.number(),
  ram_gb: z.number(),
  description: z.string(),
  quality_rating: ratingSchema,
  speed_rating: ratingSchema,
  recommended_steps: intSchema,
  recommended_guidance: z.number(),
  default_width: intSchema,
  default_height: intSchema,
  default_num_frames: intSchema,
  default_fps: intSchema,
  supports_image_to_video: z.boolean(),
  supports_negative_prompt: z.boolean(),
  model_card_url: z.string(),
  license_name: z.string(),
  max_num_frames: intSchema,
  download_size_gb: z.number().optional(),
  load_variant: z.string().nullable().optional(),
  requires_hf_token: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

/** Twin of `LoraPayload` — `repo_id` is an HF repo id or the canonical
 *  Civitai short ref `civitai:<modelId>@<versionId>`. */
export const loraSchema = loose({
  repo_id: z.string(),
  name: z.string(),
  description: z.string(),
  weight_name: z.string(),
  base_family: z.enum([
    "sdxl",
    "sd15",
    "flux",
    "flux2",
    "qwen",
    "z-image",
    "unknown",
  ]),
  license: z.string(),
  source: z.enum(["hf", "civitai"]),
  unverified: z.boolean().optional(),
});

/** Twin of `WorkflowPresetPayload` (`WorkflowPreset` dataclass). */
export const workflowPresetSchema = loose({
  preset_id: z.string(),
  name: z.string(),
  description: z.string(),
  prompt_template: z.string(),
  negative_prompt: z.string(),
  suggested_model_id: z.string(),
  steps: intSchema,
  guidance: z.number(),
  width: intSchema,
  height: intSchema,
  tags: z.array(z.string()).optional(),
});

/** Twin of `SystemPromptPayload` — the real prompt text lives in `content`;
 *  `id` mirrors the desktop source field name. */
export const systemPromptSchema = loose({
  id: z.string(),
  name: z.string(),
  content: z.string(),
  category: z.string().optional(),
});

/** Twin of `TtsVoicePayload` (Kokoro `TtsVoice`). */
export const ttsVoiceSchema = loose({
  voice_id: z.string(),
  name: z.string(),
  gender: z.enum(["female", "male"]),
  language: z.string(),
  lang_code: z.string(),
  quality_grade: z.string(),
  traits: z.array(z.string()).optional(),
  is_default: z.boolean().optional(),
});

/** Twin of `TtsLanguagePayload` (Kokoro `TtsLanguage`). */
export const ttsLanguageSchema = loose({
  lang_code: z.string(),
  name: z.string(),
  flag: z.string(),
  espeak_fallback: z.string(),
});

/** Twin of `TtsModelFilePayload` — the URL/size/sha live in the row's
 *  artifact_* columns; the payload names the file and its role. */
export const ttsModelFileSchema = loose({
  filename: z.string(),
  role: z.enum(["onnx_model", "voices_bin"]),
});

/** Twin of `NerModelPayload` (`NerModelSpec`) — `estimated_ram_mb` is the
 *  source's (typical, peak) tuple serialized as a 2-element list. */
export const nerModelSchema = loose({
  model_id: z.string(),
  repo_id: z.string(),
  display_name: z.string(),
  backend: z.enum(["gliner", "gliner2"]),
  tier: z.enum(["edge", "base", "large", "xxl"]),
  description: z.string(),
  license: z.string(),
  estimated_disk_mb: intSchema,
  estimated_ram_mb: z.array(intSchema).length(2),
  default: z.boolean().optional(),
  hardware_gate: z.string().nullable().optional(),
});

/** Twin of `NerPiiLabelsPayload` — one row carrying the whole PII label set. */
export const nerPiiLabelsSchema = loose({
  labels: z.array(z.string()).min(1),
});

/** Twin of `WakeWordModelPayload` — the download URL lives in the row's
 *  artifact_url; `name` is the short registry key (e.g. 'hey_jarvis'). */
export const wakeWordModelSchema = loose({
  name: z.string(),
  size_mb: z.number(),
  description: z.string(),
  built_in: z.boolean().optional(),
  bundled: z.boolean().optional(),
});

/** Twin of `ApiKeyProviderPayload` — either a provider pattern (`names` +
 *  `label`; `names[0]` is the canonical provider ID) or the ONE global
 *  strip-lists row (key='global-strip-lists', strip_prefixes/strip_suffixes),
 *  matching the Pydantic `_one_shape` model validator. */
export const apiKeyProviderSchema = loose({
  // Pattern shape
  names: z.array(z.string()).nullable().optional(),
  env_var_names: z.array(z.string()).optional(),
  label: z.string().nullable().optional(),
  // Strip-lists shape (the one global row)
  strip_prefixes: z.array(z.string()).nullable().optional(),
  strip_suffixes: z.array(z.string()).nullable().optional(),
}).superRefine((payload, ctx) => {
  const isPattern =
    Array.isArray(payload.names) &&
    payload.names.length > 0 &&
    typeof payload.label === "string";
  const isStrip =
    (payload.strip_prefixes !== null && payload.strip_prefixes !== undefined) ||
    (payload.strip_suffixes !== null && payload.strip_suffixes !== undefined);
  if (!isPattern && !isStrip) {
    ctx.addIssue({
      code: "custom",
      message:
        "must be either a provider pattern (names + label) or the global strip-lists row (strip_prefixes/strip_suffixes)",
    });
  }
});

// ── credential_definition (Unified Credential Vault, app='matrx') ────────────

const ENV_ALIAS_REGEX = /^[A-Z][A-Z0-9_]*$/;
const FIELD_KEY_REGEX = /^[a-z][a-z0-9_]*$/;

/** Twin of `CredentialFieldPayload` — one field of a credential definition.
 *  `placeholder_example` must be a SAFE non-secret fake. */
export const credentialFieldSchema = loose({
  field_key: z.string().regex(FIELD_KEY_REGEX),
  label: z.string(),
  description: z.string().optional(),
  placeholder_example: z.string().optional(),
  format: z.string().nullable().optional(),
  validation_regex: z.string().nullable().optional(),
  env_aliases: z.array(z.string().regex(ENV_ALIAS_REGEX)).optional(),
  // Where the value lives: 'encrypted' -> users.user_secrets (handling applies);
  // 'metadata' -> plaintext credential_items metadata (reserved field_keys
  // 'login_urls'/'notes' map to first-class columns; the rest to
  // non_secret_fields). Default (absent) = 'encrypted'.
  storage_class: z.enum(["metadata", "encrypted"]).optional(),
  handling: z.enum(["visible", "revealable", "sealed"]).optional(),
  editable: z.boolean().optional(),
  inject_into_sandbox: z.boolean().optional(),
  required: z.boolean().optional(),
  group: z.string().nullable().optional(),
  repeated: z.boolean().optional(),
});

/** Twin of `CredentialDefinitionPayload` — a credential-type definition or
 *  provider preset for the Unified Credential Vault (non-secret catalog data;
 *  row key = the stable definition key, e.g. 'env_value'). A preset sets
 *  `base_definition_key` (+ usually `provider_key`, matching api_key_provider
 *  slugs where they exist); base definitions must declare fields. Mirrors the
 *  Pydantic `_consistent` model validator. */
export const credentialDefinitionSchema = loose({
  label: z.string(),
  description: z.string().optional(),
  family: z.enum([
    "generic",
    "ai_providers",
    "source_control",
    "cloud_infrastructure",
    "databases",
    "hosting_deployment",
    "server_network",
    "domains_dns_cdn",
    "messaging_communications",
    "payments_commerce",
    "business_platforms",
    "analytics_marketing",
    "cms_content",
    "identity_security",
    "automation_integrations",
    "signing_files",
  ]),
  tags: z.array(z.string()).optional(),
  docs_url: z.string().nullable().optional(),
  setup_hints: z.array(z.string()).optional(),
  fields: z.array(credentialFieldSchema).optional(),
  attachment_only: z.boolean().optional(),
  mutually_exclusive: z.array(z.array(z.string())).optional(),
  import_adapters: z.array(z.enum(["env", "json", "pem", "kv"])).optional(),
  expiring: z.boolean().optional(),
  refreshable: z.boolean().optional(),
  verifiable: z.boolean().optional(),
  rotatable: z.boolean().optional(),
  auth_type: z
    .enum(["oauth2", "api_key", "bearer", "basic", "headers", "stdio_env"])
    .nullable()
    .optional(),
  auth_field_map: z.record(z.string(), z.string()).optional(),
  base_definition_key: z.string().nullable().optional(),
  provider_key: z.string().nullable().optional(),
}).superRefine((payload, ctx) => {
  const fields = Array.isArray(payload.fields) ? payload.fields : [];
  const keys = fields
    .map((f) => (f as { field_key?: unknown }).field_key)
    .filter((k): k is string => typeof k === "string");
  if (new Set(keys).size !== keys.length) {
    ctx.addIssue({ code: "custom", message: "duplicate field_key within definition" });
  }
  const isPreset =
    payload.base_definition_key !== null &&
    payload.base_definition_key !== undefined;
  if (payload.provider_key != null && !isPreset) {
    ctx.addIssue({
      code: "custom",
      message: "provider_key requires base_definition_key (presets specialize a base)",
    });
  }
  if (!isPreset && fields.length === 0 && payload.attachment_only !== true) {
    ctx.addIssue({
      code: "custom",
      message: "a base definition must declare fields or attachment_only=true",
    });
  }
  if (isPreset && payload.attachment_only === true) {
    ctx.addIssue({
      code: "custom",
      message: "attachment_only is valid only on a base definition",
    });
  }
  const known = new Set(keys);
  for (const grp of payload.mutually_exclusive ?? []) {
    if (grp.length < 2) {
      ctx.addIssue({
        code: "custom",
        message: "mutually_exclusive groups need at least 2 field_keys",
      });
    }
    for (const fk of grp) {
      if (known.size > 0 && !known.has(fk)) {
        ctx.addIssue({
          code: "custom",
          message: `mutually_exclusive references unknown field_key '${fk}'`,
        });
      }
    }
  }
  for (const [role, fk] of Object.entries(payload.auth_field_map ?? {})) {
    if (known.size > 0 && !known.has(fk)) {
      ctx.addIssue({
        code: "custom",
        message: `auth_field_map['${role}'] references unknown field_key '${fk}'`,
      });
    }
  }
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
    description:
      "GGUF models for the local llama.cpp engine (HF URLs, quants, RAM requirements).",
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
    description:
      "Diffusers image generation models (pipeline family, VRAM/RAM, ratings, defaults).",
    schema: imageGenModelSchema,
    hasArtifact: true,
  },
  {
    slug: "video_gen_model",
    label: "Video-gen models",
    description:
      "Local video generation models (T2V/I2V pipelines and defaults).",
    schema: videoGenModelSchema,
    hasArtifact: true,
  },
  {
    slug: "lora",
    label: "LoRAs",
    description:
      "Curated image-gen LoRA weights (Civitai/HF refs, base family, weights).",
    schema: loraSchema,
    hasArtifact: true,
  },
  {
    slug: "workflow_preset",
    label: "Workflow presets",
    description:
      "Preconfigured image-gen workflows — prompt templates, steps, guidance, sizes.",
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
    description:
      "Kokoro TTS voice catalog (voice id, language, quality grade, traits).",
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
    slug: "tts_model_file",
    label: "TTS model files",
    description:
      "Kokoro model artifacts (kokoro onnx + voices bin) — URL/size/sha live in the artifact columns.",
    schema: ttsModelFileSchema,
    hasArtifact: true,
  },
  {
    slug: "ner_model",
    label: "NER models",
    description:
      "Local NER / information-extraction models (GLiNER tiers, disk/RAM estimates).",
    schema: nerModelSchema,
    hasArtifact: true,
  },
  {
    slug: "ner_pii_labels",
    label: "NER PII labels",
    description:
      "The PII label set for local NER redaction — one row carrying the whole list.",
    schema: nerPiiLabelsSchema,
    hasArtifact: false,
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
    description:
      "Provider key patterns for the desktop API-key vault (must match backend VALID_PROVIDERS).",
    schema: apiKeyProviderSchema,
    hasArtifact: false,
  },
  {
    slug: "credential_definition",
    label: "Credential definitions",
    description:
      "Unified Credential Vault definitions and provider presets (app='matrx') — non-secret field layouts, handling defaults, env aliases, import adapters.",
    schema: credentialDefinitionSchema,
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
  for (const field of [
    "name",
    "display_name",
    "title",
    "voice_id",
    "model_id",
    "preset_id",
    "repo_id",
  ]) {
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
