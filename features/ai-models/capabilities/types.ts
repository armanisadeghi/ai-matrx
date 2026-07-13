// features/ai-models/capabilities/types.ts
//
// Canonical shape for `ai.model_definition.capabilities`. Source of truth for
// what a model accepts as input, produces as output, and supports as a feature.
//
// Before May 2026 this column was a zoo — null / empty string / flat
// string arrays / Google-style boolean object / OpenAI-style I/O object /
// literal `"[transcription]"`. The backfill landed and every row is now
// canonical, so `parseCapabilities` validates rather than infers, and the
// dead `api_class` sniffing fallback is gone. Route all reads through it.
//
// Why `{input, output, features, interaction}` instead of a flat boolean
// map: content-type acceptance is a SET, not 20 bools. `input: ["text",
// "image"]` reads instantly as "this model takes text and images." A
// flat `text_input: true, image_input: true, audio_input: false, ...`
// hides the shape behind ceremony. Features stay as flags because they
// genuinely are boolean. `interaction` is its own field because it gates
// runtime selection (turn-based vs realtime) at launch time.
//
// The audit system's flat `CapabilitiesRecord` is now a DERIVED
// projection (`toAuditRecord`) — existing consumers see the same view.

// `entities` is an OUTPUT-only modality in practice (extraction models emit
// structured entities, not prose); `document` appears on inputs. Both are
// members of the one shared set because input/output share the vocabulary.
export const CONTENT_TYPES = ["text", "image", "audio", "video", "document", "entities"] as const;
export type ContentType = typeof CONTENT_TYPES[number];

// Full live vocabulary (verified against ai.model_definition 2026-07-12:
// turn:209, single:5, extraction:5, realtime:2).
//   turn       — ordinary multi-turn chat request/response.
//   single     — one-shot generation (image/video gen); no conversation.
//   extraction — NER/classification models (GLiNER2 family); NOT chat models.
//   realtime   — live voice/audio transport.
export const INTERACTION_MODES = ["turn", "single", "extraction", "realtime"] as const;
export type InteractionMode = typeof INTERACTION_MODES[number];

// The complete feature vocabulary present on live `ai.model_definition` rows
// (swept 2026-07-12). Adding a NEW feature value to the DB requires adding it
// here — `parseCapabilities` screams (captureError "data-shape") on any value
// it doesn't recognize instead of silently dropping it.
export const FEATURE_KEYS = [
  "streaming",
  "function_calling",
  "tool_calling",
  "thinking",
  "structured_output",
  "json_mode",
  "web_search",
  "x_search",
  "vision",
  "code_execution",
  "computer_use",
  "multi_turn",
  "system_prompt",
  "embeddings",
  "fine_tuning",
  "batch_api",
  "prompt_caching",
  // Extraction family (GLiNER2 / fastino models)
  "ner",
  "classification",
  "structured_extraction",
  "relation_extraction",
  "pii_detection",
  // Media generation / editing
  "image_generation",
  "image_editing",
  "image_to_video",
  "video_generation",
  "video_editing",
  "audio_generation",
  "conversational_editing",
  "stateful_editing",
  "dialogue",
] as const;
export type FeatureKey = typeof FEATURE_KEYS[number];

export interface ModelCapabilities {
  input: ContentType[];
  output: ContentType[];
  features: FeatureKey[];
  interaction: InteractionMode;
  /** Model is explicitly multilingual (canonical `capabilities.multilingual`; absent → false). */
  multilingual: boolean;
}

/**
 * Safe fallback used by `parseCapabilities` when no signal is available.
 * A text-only turn-based model — the most common shape.
 */
export const DEFAULT_CAPABILITIES: ModelCapabilities = {
  input: ["text"],
  output: ["text"],
  features: [],
  interaction: "turn",
  multilingual: false,
};

/** True iff `value` is a member of the const tuple `arr`. Type-narrow helper. */
export function isContentType(value: unknown): value is ContentType {
  return typeof value === "string" && (CONTENT_TYPES as readonly string[]).includes(value);
}

export function isFeatureKey(value: unknown): value is FeatureKey {
  return typeof value === "string" && (FEATURE_KEYS as readonly string[]).includes(value);
}

export function isInteractionMode(value: unknown): value is InteractionMode {
  return typeof value === "string" && (INTERACTION_MODES as readonly string[]).includes(value);
}
