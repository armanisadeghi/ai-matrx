// features/ai-models/capabilities/parse.ts
//
// Parser for `ai.model_definition.capabilities`.
//
// The column is CANONICAL for every row in the live DB. Verified 2026-07-07
// against project txzxabzwovsujtloxrus: all 205 rows (142 active + 63
// deprecated) hold a JSON object carrying `input` / `output` / `features` /
// `interaction`. Zero rows are null, "", a flat label array, a Google-style
// boolean map, or the literal "[transcription]".
//
// Because of that, this module PARSES AND VALIDATES — it never infers. The
// tolerant legacy-shape branches and the `api_class` string-sniffing fallback
// (`*_tts` / `*_image_generation` / `*_realtime` → guessed modalities) were
// deleted with the `api_class` tear-out. `api_class` is being dropped from the
// table; nothing may depend on it again.
//
// `DEFAULT_CAPABILITIES` remains the answer for a row that has no capabilities
// at all — i.e. a model being composed in the admin UI before its first save.
//
// Returns a NEW object every call — never mutates input. Pure; no React,
// no Redux. Hot-path readers (the launcher) call this on cached model
// rows, so it must be fast and allocation-light.

import {
  DEFAULT_CAPABILITIES,
  isContentType,
  isFeatureKey,
  isInteractionMode,
  type ContentType,
  type FeatureKey,
  type InteractionMode,
  type ModelCapabilities,
} from "./types";

/** Keep only valid members of `T`, de-duplicated, in first-seen order. */
function collect<T extends string>(
  raw: unknown,
  guard: (value: unknown) => value is T,
): T[] {
  if (!Array.isArray(raw)) return [];
  const out: T[] = [];
  for (const value of raw) {
    if (guard(value) && !out.includes(value)) out.push(value);
  }
  return out;
}

/**
 * Validate the canonical `{input, output, features, interaction}` object.
 * Anything that is not that object — including `null` for an unsaved row —
 * yields the text-only turn-based default.
 */
export function parseCapabilities(raw: unknown): ModelCapabilities {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ...DEFAULT_CAPABILITIES };
  }

  const obj = raw as Record<string, unknown>;

  const input: ContentType[] = collect(obj.input, isContentType);
  const output: ContentType[] = collect(obj.output, isContentType);
  const features: FeatureKey[] = collect(obj.features, isFeatureKey);
  const interaction: InteractionMode = isInteractionMode(obj.interaction)
    ? obj.interaction
    : "turn";

  return {
    input: input.length > 0 ? input : ["text"],
    output: output.length > 0 ? output : ["text"],
    features,
    interaction,
  };
}

// ─── Audit-system bridge: derive the flat boolean view ────────────────────

/**
 * Flat audit-shaped record. Re-exported here for callers that want the
 * derived projection without importing from the audit module.
 */
export type AuditCapabilitiesRecord = Partial<{
  text_input: boolean;
  text_output: boolean;
  image_input: boolean;
  image_output: boolean;
  audio_input: boolean;
  audio_output: boolean;
  video_input: boolean;
  document_input: boolean;
  code_execution: boolean;
  function_calling: boolean;
  streaming: boolean;
  vision: boolean;
  web_search: boolean;
  json_mode: boolean;
  structured_output: boolean;
  system_prompt: boolean;
  multi_turn: boolean;
  embeddings: boolean;
  fine_tuning: boolean;
  batch_api: boolean;
}>;

/**
 * Project the canonical shape onto the flat audit record so existing
 * audit consumers see the same view they always have.
 */
export function toAuditRecord(caps: ModelCapabilities): AuditCapabilitiesRecord {
  return {
    text_input: caps.input.includes("text"),
    text_output: caps.output.includes("text"),
    image_input: caps.input.includes("image"),
    image_output: caps.output.includes("image"),
    audio_input: caps.input.includes("audio"),
    audio_output: caps.output.includes("audio"),
    video_input: caps.input.includes("video"),
    document_input: caps.input.includes("document"),
    // vision is set explicitly OR implied by image input.
    vision: caps.features.includes("vision") || caps.input.includes("image"),
    code_execution: caps.features.includes("code_execution"),
    function_calling: caps.features.includes("function_calling"),
    streaming: caps.features.includes("streaming"),
    web_search: caps.features.includes("web_search"),
    json_mode: caps.features.includes("json_mode"),
    structured_output: caps.features.includes("structured_output"),
    system_prompt: caps.features.includes("system_prompt"),
    multi_turn: caps.features.includes("multi_turn"),
    embeddings: caps.features.includes("embeddings"),
    fine_tuning: caps.features.includes("fine_tuning"),
    batch_api: caps.features.includes("batch_api"),
  };
}

// Re-exports for the few callers that historically imported from one
// module rather than several.
export {
  CONTENT_TYPES,
  FEATURE_KEYS,
  INTERACTION_MODES,
  DEFAULT_CAPABILITIES,
} from "./types";
export type {
  ContentType,
  FeatureKey,
  InteractionMode,
  ModelCapabilities,
} from "./types";
