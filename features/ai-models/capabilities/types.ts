// features/ai-models/capabilities/types.ts
//
// Canonical shape for `ai_model.capabilities`. Source of truth for what a
// model accepts as input, produces as output, and supports as a feature.
//
// Before May 2026 this column was a zoo — null / empty string / flat
// string arrays / Google-style boolean object / OpenAI-style I/O object /
// literal `"[transcription]"`. Every reader did its own ad-hoc
// normalization. We standardize on this shape and route all reads
// through `parseCapabilities` so legacy rows keep working until the
// backfill lands.
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

export const CONTENT_TYPES = ["text", "image", "audio", "video", "document"] as const;
export type ContentType = typeof CONTENT_TYPES[number];

export const INTERACTION_MODES = ["turn", "realtime"] as const;
export type InteractionMode = typeof INTERACTION_MODES[number];

export const FEATURE_KEYS = [
  "streaming",
  "function_calling",
  "thinking",
  "structured_output",
  "json_mode",
  "web_search",
  "vision",
  "code_execution",
  "multi_turn",
  "system_prompt",
  "embeddings",
  "fine_tuning",
  "batch_api",
] as const;
export type FeatureKey = typeof FEATURE_KEYS[number];

export interface ModelCapabilities {
  input: ContentType[];
  output: ContentType[];
  features: FeatureKey[];
  interaction: InteractionMode;
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
