/**
 * Auto-generated from matrx_ai.config.llm_params.LLMParams (Pydantic JSON Schema).
 * Do not edit — regenerate via `uv run python scripts/generate_types.py llm-enums`
 * or GET /schema/bundle/llm-params-enums-ts.
 */

export type LLMParamAspectRatio = "1:1" | "2:3" | "3:2" | "3:4" | "4:3" | "4:5" | "5:4" | "9:16" | "16:9" | "21:9";

export type LLMParamAudioFormat = "mp3" | "wav" | "ogg" | "opus" | "aac" | "flac" | "pcm" | "mulaw" | "alaw";

export type LLMParamBackground = "auto" | "opaque" | "transparent";

export type LLMParamInputFidelity = "high" | "low";

export type LLMParamModeration = "auto" | "low";

export type LLMParamOutputFormat = "jpeg" | "png" | "webp" | "base64" | "url" | "text" | "json_object" | "json_schema";

export type LLMParamReasoningEffort = "auto" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

export type LLMParamReasoningSummary = "concise" | "detailed" | "never" | "auto" | "always";

export type LLMParamRenderQuality = "low" | "medium" | "high" | "auto";

export type LLMParamResolution = "480p" | "720p" | "1080p" | "4k" | "1K" | "2K" | "4K";

export type LLMParamStyle = "vivid" | "natural";

export type LLMParamThinkingLevel = "minimal" | "low" | "medium" | "high";

export type LLMParamToolChoice = "none" | "auto" | "required";

export type LLMParamTtsQuality = "high_quality" | "fast";

export type LLMParamVerbosity = "low" | "medium" | "high";

export type LLMParamVideoAction = "generate" | "edit" | "extend";
