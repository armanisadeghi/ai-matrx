"use client";

/**
 * Hook to parse and normalize model controls from dynamic API data
 * Keeps snake_case naming for compatibility with Python backend
 */

import { LLM_PARAMS_KEYS } from "@/types/python-generated/llm-enums";
import { UI_GATE_KEYS } from "@/lib/redux/slices/agent-settings/ui-gates";

export interface ControlDefinition {
  type:
    | "number"
    | "integer"
    | "boolean"
    | "string"
    | "enum"
    | "array"
    | "string_array"
    | "object_array";
  min?: number;
  max?: number;
  default?: any;
  enum?: string[];
  required?: boolean;
}

export interface NormalizedControls {
  // Core sampling controls
  temperature?: ControlDefinition;
  max_tokens?: ControlDefinition; // Legacy alias — remapped to max_output_tokens at parse time
  max_output_tokens?: ControlDefinition;
  top_p?: ControlDefinition;
  top_k?: ControlDefinition;

  // Tool calling
  tool_choice?: ControlDefinition;
  parallel_tool_calls?: ControlDefinition;

  // Reasoning / thinking
  reasoning_effort?: ControlDefinition;
  reasoning_summary?: ControlDefinition;
  thinking_level?: ControlDefinition; // Google Gemini
  include_thoughts?: ControlDefinition;
  thinking_budget?: ControlDefinition; // Anthropic + legacy Gemini
  clear_thinking?: ControlDefinition; // Cerebras: strip <thinking> blocks
  disable_reasoning?: ControlDefinition; // Cerebras: suppress reasoning entirely

  // Output control
  response_format?: ControlDefinition;
  /** @deprecated DB models may still have output_format — remapped to response_format at parse time */
  output_format?: ControlDefinition;
  stop_sequences?: ControlDefinition;
  verbosity?: ControlDefinition;

  // Boolean/stream controls
  store?: ControlDefinition;
  stream?: ControlDefinition;

  // Provider-native features
  internal_web_search?: ControlDefinition;
  internal_url_context?: ControlDefinition;

  // Frontend-only capability flags (never sent to the API)
  tools?: ControlDefinition;
  image_urls?: ControlDefinition;
  file_urls?: ControlDefinition;
  youtube_videos?: ControlDefinition;

  // TTS controls
  tts_voice?: ControlDefinition;
  audio_format?: ControlDefinition;
  multi_speaker?: ControlDefinition; // Google only, frontend-only flag

  // Image generation controls
  size?: ControlDefinition;
  quality?: ControlDefinition;
  count?: ControlDefinition;
  n?: ControlDefinition; // Legacy alias for count
  seed?: ControlDefinition;
  steps?: ControlDefinition;
  width?: ControlDefinition;
  height?: ControlDefinition;
  guidance_scale?: ControlDefinition;
  negative_prompt?: ControlDefinition;
  output_format_img?: ControlDefinition; // image-specific output format
  output_quality?: ControlDefinition;
  disable_safety_checker?: ControlDefinition;

  // Video generation controls
  fps?: ControlDefinition;
  seconds?: ControlDefinition;
  frame_images?: ControlDefinition;

  // Advanced image controls
  image_loras?: ControlDefinition;
  reference_images?: ControlDefinition;

  // ── Media-gen extensions ──────────────────────────────────────────────
  // Each model declares its controls using the provider's exact field
  // names (per the controls-JSONB-is-truth design). The Python boundary
  // normalises provider-native names (e.g. `seconds`, `quality`,
  // `num_outputs`) to canonical UnifiedConfig fields at request time, so
  // the FE never has to translate. We just need the slots typed here so
  // the parser doesn't dump them into unmappedControls.

  // Dimensions (canonical + provider-native variants)
  aspect_ratio?: ControlDefinition;
  ratio?: ControlDefinition;             // Together video / Replicate Runway
  resolution?: ControlDefinition;
  image_size?: ControlDefinition;        // Google Imagen / Gemini-image
  num_outputs?: ControlDefinition;       // Replicate alias for count
  number_of_images?: ControlDefinition;  // Imagen direct alias for count

  // Image quality / encoding
  render_quality?: ControlDefinition;    // canonical for OpenAI gpt-image-* "quality"
  background?: ControlDefinition;        // OpenAI gpt-image-1.5 only supports transparent
  input_fidelity?: ControlDefinition;    // OpenAI gpt-image-1.5 only
  output_compression?: ControlDefinition; // OpenAI gpt-image-2 jpeg/webp 0..100
  moderation?: ControlDefinition;        // OpenAI moderation level
  partial_images?: ControlDefinition;    // OpenAI streaming partials count
  output_mime_type?: ControlDefinition;  // Imagen direct API
  include_rai_reason?: ControlDefinition; // Imagen safety-reason toggle
  person_generation?: ControlDefinition; // Imagen + Veo policy
  image_format?: ControlDefinition;      // xAI base64/url
  style?: ControlDefinition;             // Recraft v4 / DALL-E-style
  reference_strength?: ControlDefinition; // i2i strength 0..1

  // Video duration / audio
  duration_seconds?: ControlDefinition;  // canonical
  duration?: ControlDefinition;          // xAI video / Replicate native
  generate_audio?: ControlDefinition;    // canonical for video audio toggle
  encode_quality?: ControlDefinition;    // canonical for Together video bitrate
  enhance_prompt?: ControlDefinition;    // Veo 3.1 + several Together models
  video_action?: ControlDefinition;      // generate / edit / extend

  // MediaRef-shaped inputs (provider-native names; render via media picker
  // or — until that ships — as plain text inputs that accept a URL or
  // file_id). The cld_files system is the single ingress/egress path; the
  // value's wire shape is { file_id?, url?, mime_type?, base64_data? }.
  image_input?: ControlDefinition;       // canonical single-image input
  image_inputs?: ControlDefinition;      // canonical multi-image input
  input_images?: ControlDefinition;      // Replicate gpt-image-* plural alias
  image?: ControlDefinition;             // Replicate Seedream/Veo/Wan/Seedance
  image_url?: ControlDefinition;         // Together image i2i (singular; differs from FE-only image_urls flag)
  start_image?: ControlDefinition;       // Replicate Kling first-frame
  end_image?: ControlDefinition;         // Replicate Kling last-frame
  prompt_image?: ControlDefinition;      // Replicate Runway image-to-video
  first_frame_image?: ControlDefinition; // Replicate Hailuo
  start_image_url?: ControlDefinition;   // Replicate Luma Ray-3
  last_frame?: ControlDefinition;        // Google Veo SDK native
  last_frame_image?: ControlDefinition;  // canonical + Replicate Veo
  mask?: ControlDefinition;              // OpenAI gpt-image-* inpaint mask
  video_input?: ControlDefinition;       // Sora/xAI video edit/extend source
  media?: ControlDefinition;             // Together Wan I2V {image: url}

  // Raw controls for debugging
  rawControls: Record<string, any>;

  // Unmapped controls that we couldn't resolve
  unmappedControls: Record<string, any>;
}

/**
 * THE single canonical "does the selected model support tools?" read.
 *
 * Tool support is a MODEL capability. The aidream server already enforces it —
 * `aidream/api/utils/tool_merge.py` resolves `supports_function_calling` and
 * silently DROPS all tools/custom_tools/mcp_servers for models that can't use
 * them. This helper aligns the FE so the UI never offers tools that will be
 * dropped at run time.
 *
 * PERMISSIVE by design, mirroring the backend's permissive default: a model is
 * treated as tool-capable UNLESS it EXPLICITLY declares `tools: { allowed:
 * false }` (parsed to `tools.default === false`). In the live registry today,
 * chat/LLM models carry `tools: { allowed: true }` while non-tool models
 * (TTS / image / video / audio) simply OMIT the `tools` control — so an absent
 * `tools` control is `default: undefined`, which this treats as supported. The
 * gate only fires once a model declares the flag false (a future capability
 * backfill), exactly matching server behaviour.
 *
 * Accepts either NormalizedControls shape — the hook's (this file) or the
 * agent-settings parser's (`lib/redux/slices/agent-settings/types.ts`) — since
 * both expose `tools?: { default?: unknown }`. Reuse this everywhere; never
 * inline the `tools?.default !== false` check.
 */
export function supportsTools(
  normalizedControls:
    | { tools?: { default?: unknown } | null }
    | null
    | undefined,
): boolean {
  return normalizedControls?.tools?.default !== false;
}

/**
 * Parse and normalize controls from a model's controls object
 */
export function useModelControls(models: any[], selectedModelId: string) {
  // If no ID provided, just return empty state without error
  if (!selectedModelId) {
    return {
      normalizedControls: null,
      selectedModel: null,
      error: null,
    };
  }

  // Find the selected model by ID (UUID)
  const selectedModel = models.find((m) => m.id === selectedModelId);

  if (!selectedModel) {
    // Only log error if we have models loaded but still can't find the ID
    if (models.length > 0) {
      console.error("Model not found:", {
        selectedModelId,
        availableModelIds: models.map((m) => m.id),
        models,
      });
    }
    return {
      normalizedControls: null,
      selectedModel: null,
      error: `Model not found: ${selectedModelId}`,
    };
  }

  // If no controls, return empty normalized controls (everything disabled)
  if (!selectedModel.controls) {
    return {
      normalizedControls: {
        rawControls: {},
        unmappedControls: {},
      } as NormalizedControls,
      selectedModel,
      error: null,
    };
  }

  // Defensively parse controls if it was stored as a JSON string (double-encoded)
  let controls = selectedModel.controls;
  if (typeof controls === "string") {
    try {
      controls = JSON.parse(controls);
    } catch {
      console.error(
        "Failed to parse model controls JSON string for model:",
        selectedModel.name,
      );
      return {
        normalizedControls: {
          rawControls: {},
          unmappedControls: {},
        } as NormalizedControls,
        selectedModel,
        error: `Invalid controls JSON for model: ${selectedModel.name}`,
      };
    }
  }
  // Guard: controls must be a plain object to iterate safely
  if (
    typeof controls !== "object" ||
    controls === null ||
    Array.isArray(controls)
  ) {
    console.error(
      "Unexpected controls shape for model:",
      selectedModel.name,
      controls,
    );
    return {
      normalizedControls: {
        rawControls: {},
        unmappedControls: {},
      } as NormalizedControls,
      selectedModel,
      error: null,
    };
  }
  const normalized: NormalizedControls = {
    rawControls: controls,
    unmappedControls: {},
  };

  // LLM_PARAMS_KEYS is type-checked against the generated LLMParams schema.
  // Frontend-only keys (not in LLMParams) are listed separately.
  const knownKeys = new Set<string>([
    ...LLM_PARAMS_KEYS,
    // Pre-canonical-rename DB keys — Python's LLMParams._remap_aliases
    // normalises these at the API boundary. Recognised here so the FE
    // renders them when a model's controls JSONB declares them.
    "max_tokens",
    "output_format",
    "n",
    // Model-gated UI flags from model controls (e.g. { allowed: true }). These
    // indicate what a model supports — they live in agent.uiGates, not in
    // LLMParams. Recognised here (via the canonical UI_GATE_KEYS) so the parser
    // surfaces them in NormalizedControls, which the UI-gates editor reads to
    // know which gates to offer. Actual tool definitions are assembled
    // separately via client_tools.
    ...UI_GATE_KEYS,
    "multi_speaker",
    // ── Media-gen provider-native names (May 2026) ────────────────────
    // Each model's controls JSONB carries the EXACT field names the
    // provider's API accepts. Python normalises aliases (`seconds` →
    // `duration_seconds`, `quality` → `render_quality`, `n` /
    // `num_outputs` / `number_of_images` → `count`, etc.). The FE just
    // needs to recognise these as valid control keys so the parser
    // surfaces them in NormalizedControls instead of dumping to
    // unmappedControls.

    // Dimensions
    "aspect_ratio",
    "ratio",            // Together video / Replicate Runway
    "resolution",
    "image_size",       // Imagen / Gemini-image
    "num_outputs",      // Replicate
    "number_of_images", // Imagen direct

    // Image quality / encoding
    "render_quality",
    "background",
    "input_fidelity",
    "output_compression",
    "moderation",
    "partial_images",
    "output_mime_type", // Imagen direct
    "include_rai_reason",
    "person_generation",
    "image_format",     // xAI base64/url
    "style",
    "reference_strength",

    // Video
    "duration_seconds",
    "duration",         // xAI / Replicate native
    "generate_audio",
    "encode_quality",
    "enhance_prompt",
    "video_action",

    // MediaRef-shaped inputs
    "image_input",
    "image_inputs",
    "input_images",     // Replicate gpt-image-*
    "image",            // Replicate Seedream/Veo/Wan/Seedance
    "image_url",        // Together image i2i singular (separate from FE flag image_urls)
    "start_image",      // Replicate Kling
    "end_image",        // Replicate Kling
    "prompt_image",     // Replicate Runway
    "first_frame_image", // Replicate Hailuo
    "start_image_url",  // Replicate Luma Ray-3
    "last_frame",       // Google Veo SDK
    "last_frame_image", // canonical + Replicate Veo
    "mask",
    "video_input",
    "media",            // Together Wan I2V
  ]);

  // Parse each control
  Object.entries(controls).forEach(([key, value]: [string, any]) => {
    // Track unmapped controls first
    if (!knownKeys.has(key)) {
      normalized.unmappedControls[key] = value;
      return;
    }

    // Remap output_format -> response_format (backend uses response_format)
    const normalizedKey = key === "output_format" ? "response_format" : key;

    // Guard: skip primitive values — control definitions must be objects
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      console.warn(
        `Skipping malformed control "${key}" for model — expected object, got:`,
        typeof value,
      );
      return;
    }

    // Flatten object defaults with a "type" property (e.g. { type: "json_object" } → "json_object")
    const rawDefault = value.default;
    const flatDefault =
      rawDefault !== null &&
      typeof rawDefault === "object" &&
      !Array.isArray(rawDefault) &&
      "type" in rawDefault
        ? String(rawDefault.type)
        : rawDefault;

    // Parse the control definition based on its structure
    const controlDef: ControlDefinition = {
      type: value.type || "string",
      min: value.min,
      max: value.max,
      default: flatDefault,
      required: value.required,
    };

    // Handle enum types — flatten object enum entries to strings (e.g. { type: "json_object" } → "json_object")
    if (value.enum && Array.isArray(value.enum)) {
      controlDef.enum = value.enum.map((option: unknown) => {
        if (
          option !== null &&
          typeof option === "object" &&
          "type" in (option as Record<string, unknown>)
        ) {
          return String((option as Record<string, unknown>).type);
        }
        return String(option);
      });
      controlDef.type = "enum";
    }
    // Handle "allowed" property (feature flags)
    else if ("allowed" in value) {
      controlDef.type = "boolean";
      controlDef.default = value.allowed;
    }
    // Handle plain boolean defaults
    else if (typeof value.default === "boolean") {
      controlDef.type = "boolean";
    }
    // Infer number types from min/max
    else if (value.min !== undefined || value.max !== undefined) {
      // Check if it's an integer or float based on default
      if (value.default && Number.isInteger(value.default)) {
        controlDef.type = "integer";
      } else {
        controlDef.type = "number";
      }
    }

    // Store in normalized controls
    (normalized as any)[normalizedKey] = controlDef;
  });

  return {
    normalizedControls: normalized,
    selectedModel,
    error: null,
  };
}

/**
 * Get default settings from a model's controls
 * Returns ONLY the actual config values that should be submitted/saved
 * UI-only flags (like tools: true) are converted to their proper submission format
 * CRITICAL: Controls with default: null are NOT included (opt-in only)
 */
export function getModelDefaults(model: any) {
  if (!model?.controls) {
    return {};
  }

  const defaults: Record<string, any> = {};

  // Defensively parse controls if double-encoded as a JSON string
  let controls = model.controls;
  if (typeof controls === "string") {
    try {
      controls = JSON.parse(controls);
    } catch {
      console.error(
        "Failed to parse model controls JSON string in getModelDefaults for model:",
        model.name,
      );
      return {};
    }
  }
  if (
    typeof controls !== "object" ||
    controls === null ||
    Array.isArray(controls)
  ) {
    return {};
  }

  // Keys that represent UI capabilities, not submission values
  const uiOnlyKeys = new Set(["tools"]);

  Object.entries(controls).forEach(([key, value]: [string, any]) => {
    // Remap output_format -> response_format
    const normalizedKey = key === "output_format" ? "response_format" : key;

    // Guard: skip primitive values
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return;
    }

    // Skip UI-only capability flags
    if (uiOnlyKeys.has(normalizedKey)) {
      if (normalizedKey === "tools" && value.allowed) {
        defaults[normalizedKey] = [];
      }
      return;
    }

    // Extract default value for actual submission parameters
    // SKIP if default is null - these are opt-in only controls
    let defaultValue: unknown = undefined;
    if (value.default !== undefined && value.default !== null) {
      defaultValue = value.default;
    } else if ("allowed" in value && !uiOnlyKeys.has(normalizedKey)) {
      defaultValue = value.allowed;
    } else if (
      value.enum &&
      Array.isArray(value.enum) &&
      value.enum.length > 0
    ) {
      defaultValue = value.enum[0];
    }

    if (defaultValue === undefined) return;

    // For response_format: convert string -> dict, skip "text" (default behavior)
    if (
      normalizedKey === "response_format" &&
      typeof defaultValue === "string"
    ) {
      if (defaultValue === "text" || defaultValue === "") return;
      defaults[normalizedKey] = { type: defaultValue };
      return;
    }

    defaults[normalizedKey] = defaultValue;
  });

  return defaults;
}
