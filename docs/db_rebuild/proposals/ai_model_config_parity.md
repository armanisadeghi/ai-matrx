# ai.model_config controls-parity report (Phase D gate)

**Date:** 2026-07-10
**Scope:** all 151 active models (`ai.model_definition` where not deprecated/deleted), comparing the legacy
`model_definition.controls` / `.constraints` JSONB against the new resolved `ai.model_config.controls` /
`.constraints` (computed by `ai.resolve_model_config(model_id)` from `ai.api.rules` ⊕ `ai.offering.override`
× `ai.setting`, for the preferred offering).

**Verdict: PASS — zero regressions.**
Every saved-agent-settings key that validated cleanly under the legacy controls still resolves under
`ai.model_config`, except four rows that are *deliberate* pipeline corrections (below). All other diffs are
classified corrections (documented) or additive normalizations.

Migrations in this gate: `ai_030_model_config_view.sql` (resolver + view), `ai_031_rules_parity_backfill.sql`,
`ai_032_parity_residuals.sql`, `ai_033_override_clamp_enrichment.sql`.

---

## Method

1. Canonical key mapping applied to BOTH sides before comparison (mirrors the FE `model-normalizer` +
   the aidream alias remap): `max_tokens`/`max_completion_tokens` → `max_output_tokens`, `n`/`num_outputs`/
   `number_of_images` → `count`, `output_format` → `response_format` (FE-side rename), `stop` →
   `stop_sequences`, `duration`/`seconds` → `duration_seconds`, `ratio` → `aspect_ratio`, `image_size` →
   `resolution`, `output_mime_type` → `output_format`.
2. Key-presence diff per (model, key) across all active models.
3. **Regression arbiter:** every key present in real saved agent settings (`agent.definition`,
   `agent.template`, `agent.definition_version`) that was exposed by the legacy controls for that model —
   these are the settings the reconciliation engine would *newly* flag.
4. Value-level check: saved values vs the new min/max/enum for every key both sides expose.

## Backfills applied to reach parity (ai_031 / ai_032 / ai_033)

Data seeded where it now canonically lives (never in the resolver as hacks):

- **Family rules (`ai.api.rules.params`):** `store` + `parallel_tool_calls` on `openai_chat` and `xai_chat`
  (native Responses params the legacy pipeline sent); `parallel_tool_calls` on `cerebras_chat`; `stream` on
  `elevenlabs_chat`. **Family constraints:** the anthropic "stream required above 8,192 max_output_tokens"
  constraint moved from every legacy claude row to `anthropic_chat.rules.constraints`.
- **Per-offering overrides (`ai.offering.override.params`), generated programmatically from legacy controls**
  for media/audio families (google/openai/replicate/together/xai image+video, elevenlabs, xai_realtime) and
  for TTS keys (`tts_voice`, `audio_format`, `language_code`, `apply_text_normalization`) on chat-hosted TTS
  models: identity `value_map` from the legacy enum, `clamp` from legacy min/max, `default` from legacy
  default, `provider_key` where the canonical name differs (e.g. `duration_seconds` → `duration`).
- **Suppressions:** chat sampling params (`temperature`, `top_p`, `max_output_tokens`, `seed`, `store`,
  `parallel_tool_calls`, …) marked `supported:false` on non-text-output models (TTS/realtime) where the chat
  family rules would have wrongly exposed them (legacy never had them).
- **Reasoning:** `reasoning_summary` exposed via override `value_map` on google models whose legacy controls
  carried it (it is consumed by the `google_thinking` processor, never sent raw); `reasoning_effort`
  processor rule copied from the text sibling onto `gemini-3.1-flash-image`, `gemini-3.1-flash-lite-image`,
  `gemini-3-pro-image`; `verbosity` (`provider_key: text.verbosity`) on gpt-5.x models that legacy exposed.
- **Capability fixes (`ai_032`):** `x_search` added to grok-4.5 features, `web_search` to grok-build-0.1 and
  gemini-3.1-flash-lite-image (legacy gates proved the capability; features array lacked the flag).
- **Clamp/default/value_map enrichment (`ai_033`):** aidream-seeded override rules that had only
  `{supported, provider_key}` (Kling/Seedance `duration_seconds` etc.) enriched with the legacy numeric
  bounds, default, and enum identity map.

## Regression check result

Saved-settings keys newly missing under `ai.model_config`: **4 rows, all deliberate corrections**

| Model | Key | Why this is correct, not a regression |
|---|---|---|
| claude-sonnet-5 | temperature, top_p | Offering override explicitly marks them `supported:false` — these adaptive-thinking models reject/ignore manual sampling; the aidream pipeline drops them. Reconciliation SHOULD flag stale saved values. |
| claude-opus-4-8 | temperature, top_p | Same (`anthropic_thinking` mode "adaptive"). |

Value-level flags (saved value vs new range/enum): 5 rows — **all were already invalid under the legacy
controls** (pre-existing dirty data, not introduced by the resolver): `eleven_v3.audio_format="mp3"` (legacy
enum was the same 28 elevenlabs formats), `gpt-5.4/-mini.reasoning_summary="null"` (string literal junk),
`kling-v3.aspect_ratio="3:2"` (legacy enum was also 1:1/9:16/16:9), `zai-glm-4.7.max_output_tokens=64000`
(legacy max was also 40000; model max_tokens=40000).

## Legitimate corrections (keys dropped, no saved-settings usage anywhere)

The new pipeline (aidream's seeded rules) deliberately does not translate these; exposing them would offer
controls the server silently drops:

- **anthropic_chat:** `top_k` (all), `top_p`/`temperature` (adaptive models), `stop_sequences` (family
  `supported:false` in seeded rules).
- **cerebras_chat:** `user`, `logprobs`, `top_logprobs`, `logit_bias`, `prediction`, `tool_choice`,
  `service_tier`, `presence_penalty`, `frequency_penalty`, `prompt_cache_key` — deliberate minimal seeding.
- **groq_chat:** `reasoning_format`, `include_reasoning` (superseded by canonical `reasoning_effort`).
- **openai_chat:** raw Responses envelope blobs `text`, `include`, `reasoning`, `internal_tools` — never real
  per-request controls; hosted-tool selection moved to the tools system.
- **together_chat:** `reasoning` (bool toggle → replaced by per-model `reasoning_effort` overrides),
  `tool_choice`.
- **together_image:** `width`/`height` (canonicalized to `aspect_ratio`; the `media_dims` processor consumes
  width/height, so saved values still translate), plus FLUX.2 `negative_prompt`/`image_loras` (per-model
  overrides mark them unsupported — FLUX.2 API rejects them).
- **together_video (veo-3.0-fast*):** `frame_images`, `reference_images` — unsupported per seeded overrides.
- **elevenlabs_chat:** `voice_settings` (nested non-control blob; was already `unmappedControls` junk in the FE).
- **xai_chat:** `verbosity`, `reasoning_summary` (xAI wire support unverified — deliberately not exposed;
  no saved usage).
- **huggingface_chat:** `top_k` (family unsupported).

## Additive normalizations (new keys legacy lacked — safe by construction)

UI gates and envelope keys are now derived uniformly from capabilities instead of hand-maintained JSONB, so
some models GAIN affordances legacy inconsistently omitted: `image_urls`/`file_urls` on vision chat models
(e.g. Claude — legacy never offered image attach for Claude, a known gap), `response_format` on
json-capable chat models (e.g. anthropic/together), `youtube_videos` on Gemini multimodal, `internal_*`
search gates from features, `reasoning_effort` full canonical enum (auto/none/minimal/low/medium/high/xhigh —
values map per family via `value_map`). Gates live in `agent.ui_gates`, never in `settings`, so no
reconciliation impact; added params only widen what validates.

## Reconciliation impact (canonical renames)

Saved settings under LEGACY names still normalize client-side (`normalizePromptSettings` maps
`max_tokens`/`n`/`output_format`); keys renamed at the catalog level (`duration` → `duration_seconds`,
`image_size` → `resolution`, `seconds` → `duration_seconds`) are NOT in the FE legacy map — agents that
saved those raw media keys (1 model each in live data: kling `duration`, gemini-3.1-flash-image
`image_size`) will get a reconciliation prompt on next edit; the new controls accept the same values under
the canonical key. This is the intended canonicalization path, listed here for visibility.

## Residual notes

- `ai.model_config` exposes only preferred-offering resolution; alternate offerings resolve on failover
  server-side (FE never needs them).
- `tts_voice` without a `value_map` renders as `{type:"dynamic", source:"api"}` (elevenlabs) — the FE voice
  picker reads `ai.voices`, matching legacy behavior.
- Legacy `required:true` on anthropic `max_tokens` is not carried (ControlRule has no `required` field);
  the server applies `default_max_tokens` via the thinking processor, so requests without it still succeed.
