// features/ai-models/capabilities/parse.ts
//
// Tolerant parser. Accepts every shape `ai_model.capabilities` is known
// to hold in the live DB (txzxabzwovsujtloxrus) and returns a complete
// `ModelCapabilities` object.
//
// Shapes observed in production (per the May 2026 audit):
//   1. Canonical:           {input: [...], output: [...], features: [...], interaction: "..."}
//   2. OpenAI I/O subset:   {input: [...], output: [...]}                     (missing features/interaction)
//   3. Google booleans:     {thinking: true, function_calling: true, ...}
//   4. Flat string array:   ["text_generation", "image_to_text", ...]
//   5. Hyphenated array:    ["text-generation", "step-by-step-thinking", ...]
//   6. Single-item shorthand: ["image"] | ["video"] | ["text"]
//   7. Bracketed string:    "[transcription]"
//   8. null
//   9. ""
//
// For shapes 7-9 we infer from api_class + provider when supplied:
//   - *_tts            → input ["text"], output ["audio"]
//   - *_stt[_realtime] → input ["audio"], output ["text"]
//   - *_image_generation → input ["text", "image"], output ["image"]
//   - *_video_generation → input ["text", "image"], output ["video"]
//   - *_realtime (non-stt) → input ["text", "audio"], output ["text", "audio"], interaction "realtime"
//   - default → text-only turn
//
// Returns a NEW object every call — never mutates input. Pure; no React,
// no Redux. Hot-path readers (the launcher) call this on cached model
// rows, so it must be fast and allocation-light.

import {
  CONTENT_TYPES,
  DEFAULT_CAPABILITIES,
  FEATURE_KEYS,
  isContentType,
  isFeatureKey,
  isInteractionMode,
  type ContentType,
  type FeatureKey,
  type InteractionMode,
  type ModelCapabilities,
} from "./types";

interface ParseHints {
  api_class?: string | null;
  provider?: string | null;
}

/** Used to dedupe content types / features in stable order. */
function pushUnique<T extends string>(arr: T[], item: T): void {
  if (!arr.includes(item)) arr.push(item);
}

/** Normalize a raw key — "text-generation" → "text_generation", trim, lowercase. */
function normalizeKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/-/g, "_");
}

/**
 * Maps a single semantic label (already key-normalized) into 0+ content
 * types and 0+ features. Multiple legacy labels can produce the same
 * canonical signal — that's intentional.
 */
function applyLabel(
  label: string,
  input: ContentType[],
  output: ContentType[],
  features: FeatureKey[],
): { sawRealtime: boolean } {
  let sawRealtime = false;
  switch (label) {
    // Content types — direct
    case "text":
      pushUnique(input, "text");
      pushUnique(output, "text");
      break;
    case "image":
      pushUnique(output, "image");
      break;
    case "audio":
      pushUnique(output, "audio");
      break;
    case "video":
      pushUnique(output, "video");
      break;
    case "document":
      pushUnique(input, "document");
      break;

    // Generation / I/O labels
    case "text_generation":
      pushUnique(input, "text");
      pushUnique(output, "text");
      break;
    case "image_generation":
      pushUnique(output, "image");
      break;
    case "video_generation":
      pushUnique(output, "video");
      break;
    case "audio_generation":
      pushUnique(output, "audio");
      break;
    case "image_to_text":
      // Every legacy "image_to_text" model is a general-purpose vision LLM —
      // it takes text too. The label name was historically narrow, but in
      // practice these are always multimodal chat models, so we treat
      // image_to_text as "multimodal LLM input + text output".
      pushUnique(input, "image");
      pushUnique(input, "text");
      pushUnique(output, "text");
      pushUnique(features, "vision");
      break;
    case "audio_to_text":
    case "transcription":
      pushUnique(input, "audio");
      pushUnique(output, "text");
      break;
    case "text_to_speech":
    case "speech_synthesis":
      pushUnique(input, "text");
      pushUnique(output, "audio");
      break;

    // Features
    case "thinking":
    case "reasoning":
    case "step_by_step_thinking":
      pushUnique(features, "thinking");
      break;
    case "tool_calling":
    case "tool_use":
    case "native_tool_use":
    case "function_calling":
      pushUnique(features, "function_calling");
      break;
    case "vision":
      // Same reasoning as image_to_text — vision-capable models are always
      // text-capable LLMs in practice.
      pushUnique(features, "vision");
      pushUnique(input, "image");
      pushUnique(input, "text");
      pushUnique(output, "text");
      break;
    case "code_execution":
    case "coding":
      pushUnique(features, "code_execution");
      break;
    case "web_search":
    case "search_grounding":
    case "google_maps_grounding":
      pushUnique(features, "web_search");
      break;
    case "streaming":
      pushUnique(features, "streaming");
      break;
    case "structured_outputs":
    case "structured_output":
      pushUnique(features, "structured_output");
      break;
    case "json_mode":
      pushUnique(features, "json_mode");
      break;
    case "system_prompt":
      pushUnique(features, "system_prompt");
      break;
    case "multi_turn":
    case "multilingual_tasks":
      pushUnique(features, "multi_turn");
      break;
    case "embeddings":
      pushUnique(features, "embeddings");
      break;
    case "fine_tuning":
    case "tuning":
      pushUnique(features, "fine_tuning");
      break;
    case "batch_api":
      pushUnique(features, "batch_api");
      break;
    case "live_api":
      sawRealtime = true;
      break;
    case "realtime_voice":
      // xAI's realtime voice model legacy label — implies both text and audio
      // I/O plus the realtime interaction mode.
      pushUnique(input, "text");
      pushUnique(input, "audio");
      pushUnique(output, "text");
      pushUnique(output, "audio");
      sawRealtime = true;
      break;
    case "speech_to_text":
      pushUnique(input, "audio");
      pushUnique(output, "text");
      break;

    // Things we deliberately ignore — Google flags that don't map to capability semantics
    case "caching":
    case "multi_agent":
    case "chat":
    case "json":
      break;

    default:
      // Unknown legacy label — silently dropped. Adding it here is the
      // single point of extension.
      break;
  }
  return { sawRealtime };
}

function inferFromApiClass(hints: ParseHints): ModelCapabilities {
  const api = (hints.api_class ?? "").toLowerCase();
  // Order matters: more specific patterns first.
  if (api.endsWith("_stt_realtime") || api.endsWith("_stt")) {
    return {
      input: ["audio"],
      output: ["text"],
      features: [],
      interaction: api.endsWith("_realtime") ? "realtime" : "turn",
    };
  }
  if (api.endsWith("_tts")) {
    return { input: ["text"], output: ["audio"], features: [], interaction: "turn" };
  }
  if (api.endsWith("_image_generation") || api.includes("_image")) {
    return {
      input: ["text", "image"],
      output: ["image"],
      features: [],
      interaction: "turn",
    };
  }
  if (api.endsWith("_video_generation") || api.includes("_video")) {
    return {
      input: ["text", "image"],
      output: ["video"],
      features: [],
      interaction: "turn",
    };
  }
  if (api.endsWith("_realtime")) {
    return {
      input: ["text", "audio"],
      output: ["text", "audio"],
      features: [],
      interaction: "realtime",
    };
  }
  return { ...DEFAULT_CAPABILITIES };
}

/**
 * Apply api_class-based interaction inference on top of an
 * already-assembled caps object. Always-realtime classes upgrade
 * `interaction` to "realtime"; turn-based classes leave it alone.
 */
function applyInteractionFromApiClass(
  caps: ModelCapabilities,
  hints: ParseHints,
): void {
  const api = (hints.api_class ?? "").toLowerCase();
  if (api.endsWith("_realtime")) caps.interaction = "realtime";
}

/** Try to parse `raw` if it's a string that wraps JSON (e.g. `"[transcription]"`). */
function maybeUnwrapStringJson(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  // Looks like a JSON array or object?
  if (
    (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
    (trimmed.startsWith("{") && trimmed.endsWith("}"))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // Bracketed but not JSON — strip the brackets and treat as a single
      // label inside an array, e.g. `"[transcription]"` → ["transcription"].
      const stripped = trimmed.slice(1, -1).trim();
      if (stripped === "") return null;
      return [stripped];
    }
  }
  // Bare string label
  return [trimmed];
}

export function parseCapabilities(
  raw: unknown,
  hints: ParseHints = {},
): ModelCapabilities {
  const unwrapped = maybeUnwrapStringJson(raw);

  // Null / empty → fall back to api_class inference.
  if (unwrapped === null || unwrapped === undefined) {
    return inferFromApiClass(hints);
  }

  // Canonical shape — accept fast path, validate.
  if (
    typeof unwrapped === "object" &&
    !Array.isArray(unwrapped) &&
    "input" in unwrapped &&
    Array.isArray((unwrapped as Record<string, unknown>).input)
  ) {
    const obj = unwrapped as Record<string, unknown>;
    const input = ((obj.input as unknown[]) ?? [])
      .filter(isContentType)
      .filter((v, i, a) => a.indexOf(v) === i);
    const output = (Array.isArray(obj.output) ? (obj.output as unknown[]) : [])
      .filter(isContentType)
      .filter((v, i, a) => a.indexOf(v) === i);
    const features = (Array.isArray(obj.features) ? (obj.features as unknown[]) : [])
      .filter(isFeatureKey)
      .filter((v, i, a) => a.indexOf(v) === i);
    const interaction: InteractionMode = isInteractionMode(obj.interaction)
      ? obj.interaction
      : "turn";

    const caps: ModelCapabilities = {
      input: input.length > 0 ? input : ["text"],
      output: output.length > 0 ? output : ["text"],
      features,
      interaction,
    };
    applyInteractionFromApiClass(caps, hints);
    return caps;
  }

  // Google-style boolean object.
  if (
    typeof unwrapped === "object" &&
    !Array.isArray(unwrapped)
  ) {
    const input: ContentType[] = [];
    const output: ContentType[] = [];
    const features: FeatureKey[] = [];
    let sawRealtimeAny = false;

    const obj = unwrapped as Record<string, unknown>;

    // Some Google objects ship I/O arrays plus booleans alongside.
    if (Array.isArray(obj.input)) {
      for (const v of obj.input as unknown[]) {
        if (isContentType(v)) pushUnique(input, v);
      }
    }
    if (Array.isArray(obj.output)) {
      for (const v of obj.output as unknown[]) {
        if (isContentType(v)) pushUnique(output, v);
      }
    }

    for (const [k, v] of Object.entries(obj)) {
      if (k === "input" || k === "output") continue;
      if (v === true) {
        const { sawRealtime } = applyLabel(
          normalizeKey(k),
          input,
          output,
          features,
        );
        if (sawRealtime) sawRealtimeAny = true;
      }
    }

    // Fall back to api_class for missing modalities.
    if (input.length === 0 && output.length === 0) {
      const inferred = inferFromApiClass(hints);
      input.push(...inferred.input);
      output.push(...inferred.output);
    } else {
      if (input.length === 0) pushUnique(input, "text");
      if (output.length === 0) pushUnique(output, "text");
    }

    const caps: ModelCapabilities = {
      input,
      output,
      features,
      interaction: sawRealtimeAny ? "realtime" : "turn",
    };
    applyInteractionFromApiClass(caps, hints);
    return caps;
  }

  // Array of semantic labels.
  if (Array.isArray(unwrapped)) {
    const input: ContentType[] = [];
    const output: ContentType[] = [];
    const features: FeatureKey[] = [];
    let sawRealtimeAny = false;
    for (const v of unwrapped) {
      if (typeof v !== "string") continue;
      const { sawRealtime } = applyLabel(normalizeKey(v), input, output, features);
      if (sawRealtime) sawRealtimeAny = true;
    }

    // Single-item shorthand (`["image"]`) of media-class models — combine
    // with api_class inference so they get sane input modalities.
    if (input.length === 0) {
      const inferred = inferFromApiClass(hints);
      input.push(...inferred.input);
      if (output.length === 0) output.push(...inferred.output);
    } else {
      if (output.length === 0) pushUnique(output, "text");
    }

    const caps: ModelCapabilities = {
      input,
      output,
      features,
      interaction: sawRealtimeAny ? "realtime" : "turn",
    };
    applyInteractionFromApiClass(caps, hints);
    return caps;
  }

  return inferFromApiClass(hints);
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
