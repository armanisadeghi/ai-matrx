/**
 * Auto-generated from matrx_ai.config.llm_params.LLMParams (Pydantic JSON Schema).
 * Do not edit — regenerate via `uv run python scripts/generate_types.py llm-enums`
 * or GET /schema/bundle/llm-params-enums-ts.
 */

export type LLMParamBackground = "auto" | "opaque" | "transparent";

export type LLMParamInputFidelity = "high" | "low";

export type LLMParamModeration = "auto" | "low";

export type LLMParamReasoningEffort = "auto" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

export type LLMParamReasoningSummary = "concise" | "detailed" | "never" | "auto" | "always";

export type LLMParamThinkingLevel = "minimal" | "low" | "medium" | "high";

export type LLMParamToolChoice = "none" | "auto" | "required";

export type LLMParamVideoAction = "generate" | "edit" | "extend";
