// AUTO-GENERATED — do not edit manually.
// Source: matrx_ai.config.llm_params.LLMParams (Pydantic model_fields + Literal types).
// Run: `uv run python scripts/generate_types.py llm-enums` (writes locally) or
// fetch via `pnpm update-api-types` from the frontend (pulls /schema/bundle/llm-enums-ts).
//
// The `satisfies` clauses below mean any drift between this file and the live
// LLMParams schema fails type-check at the consumer side — but the file itself is
// regenerated from the Pydantic model, so the keys are authoritative by construction.

import type { components } from './api-types';

type LLMParams = components['schemas']['LLMParams'];

type NonNullable<T> = T extends null | undefined ? never : T;

// ── Enum value arrays (one per LLMParams Literal[str] field) ─────────────────
// Each array satisfies readonly NonNullable<LLMParams[field]>[] so the compiler
// errors if Python adds/removes a Literal value without regenerating.

export const TOOL_CHOICE_OPTIONS = ['none', 'auto', 'required'] as const satisfies readonly NonNullable<LLMParams['tool_choice']>[];

export const REASONING_EFFORT_OPTIONS = ['auto', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const satisfies readonly NonNullable<LLMParams['reasoning_effort']>[];

export const REASONING_SUMMARY_OPTIONS = ['concise', 'detailed', 'never', 'auto', 'always'] as const satisfies readonly NonNullable<LLMParams['reasoning_summary']>[];

export const THINKING_LEVEL_OPTIONS = ['minimal', 'low', 'medium', 'high'] as const satisfies readonly NonNullable<LLMParams['thinking_level']>[];

export const RENDER_QUALITY_OPTIONS = ['low', 'medium', 'high', 'auto'] as const satisfies readonly NonNullable<LLMParams['render_quality']>[];

export const BACKGROUND_OPTIONS = ['auto', 'opaque', 'transparent'] as const satisfies readonly NonNullable<LLMParams['background']>[];

export const MODERATION_OPTIONS = ['auto', 'low'] as const satisfies readonly NonNullable<LLMParams['moderation']>[];

export const INPUT_FIDELITY_OPTIONS = ['high', 'low'] as const satisfies readonly NonNullable<LLMParams['input_fidelity']>[];

export const VIDEO_ACTION_OPTIONS = ['generate', 'edit', 'extend'] as const satisfies readonly NonNullable<LLMParams['video_action']>[];

// ── LLMParams key set ────────────────────────────────────────────────────────
// Every key is a real field on the Pydantic LLMParams model.
// Generated from LLMParams.model_fields — provider-native aliases
// (e.g. `seconds`, `quality`, `num_outputs`) are NOT in this set because
// they are coerced to canonical names by `_remap_aliases` before validation.

export const LLM_PARAMS_KEYS = [
    'model',
    'max_output_tokens',
    'temperature',
    'top_p',
    'top_k',
    'tool_choice',
    'parallel_tool_calls',
    'reasoning_effort',
    'reasoning_summary',
    'thinking_level',
    'include_thoughts',
    'thinking_budget',
    'clear_thinking',
    'disable_reasoning',
    'response_format',
    'stop_sequences',
    'stream',
    'store',
    'verbosity',
    'internal_web_search',
    'internal_url_context',
    'internal_x_search',
    'aspect_ratio',
    'width',
    'height',
    'count',
    'render_quality',
    'background',
    'output_compression',
    'moderation',
    'input_fidelity',
    'partial_images',
    'style',
    'reference_strength',
    'tts_voice',
    'audio_format',
    'duration_seconds',
    'resolution',
    'fps',
    'steps',
    'seed',
    'guidance_scale',
    'encode_quality',
    'negative_prompt',
    'output_format',
    'frame_images',
    'reference_images',
    'image_loras',
    'disable_safety_checker',
    'generate_audio',
    'enhance_prompt',
    'image_input',
    'image_inputs',
    'mask',
    'last_frame_image',
    'video_input',
    'video_action',
    'custom_tools',
    'mcp_servers',
    'compaction_settings',
    'detected_contexts',
    'dictionary',
    'tts_quality',
] as const satisfies readonly (keyof LLMParams)[];

export type LLMParamsKey = (typeof LLM_PARAMS_KEYS)[number];
