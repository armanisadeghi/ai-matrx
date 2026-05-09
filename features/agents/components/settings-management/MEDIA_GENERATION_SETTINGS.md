# Media Generation Settings — Cross-Provider Reference

> Companion to `AgentSettingsCore.tsx`, `validation/rules.ts`, `validation/constraints.ts`, and `reconciliation/analyze.ts`.
>
> Audience: FE devs adding image- and video-generation controls to the agent settings UI in the same idiom as the existing "thinking" controls.
>
> **Backend status (May 2026):** all 73 media-gen models are now in `ai_model` with `controls` and `pricing` JSONB populated. The unified backend (matrx-ai) translates one canonical request to whatever the chosen provider needs. Your job is to render the right UI controls per the canonical vocabulary defined here.

---

## TL;DR for the impatient

1. **Read the canonical vocabulary section** below. Every media setting has ONE canonical name on `LLMParams`. Backend translators map it per provider.
2. **Render whatever the model's `controls` JSONB declares.** That logic is unchanged — the schema-driven dispatch in `renderControlInput()` already does the right thing.
3. **Add the new keys to `NormalizedControls`** (`useModelControls.ts`). One-time interface bump.
4. **Add the cross-provider equivalence table** (this doc) to `analyze.ts`'s reconciliation logic so model swaps preserve user intent (e.g. "I want HIGH quality" survives a swap from gpt-image-2 to imagen-4-ultra).
5. **Add the new cross-field validation rules** (this doc, § Validation rules).

---

## 1. How the existing system works (quick recap)

Skip if you wrote it. Otherwise:

- **Source of truth for what to render:** `ai_model.controls` (JSONB) + `ai_model.constraints` (JSONB), fetched per-model.
- **Parsing:** `useModelControls()` normalizes `controls` into a typed `NormalizedControls` interface.
- **Rendering:** `renderControlInput()` in `AgentSettingsCore.tsx` dispatches on the control's `type`:
  - `{enum: [...], default: ...}` → `<Select>` dropdown
  - `{type: "number"|"integer", min, max}` → `<NumberInput withSlider>`
  - `{type: "boolean"}` → `<Checkbox>`
  - `{type: "string"}` → `<Input>`
  - `{type: "string_array"|"object_array"}` → `<Textarea>` (newline-split)
  - `{allowed: true}` → `<Checkbox>` (capability flag)
  - `{default: null}` → opt-in (user must enable explicitly)
- **Persistence:** snake_case keys on `LLMParams`, matching backend.
- **Validation rules** (`rules.ts`): unrecognized-keys, invalid-enum-value, numeric-range-violation, type-mismatch, thinking-budget-coupling, deprecated-keys, response-format-structure, integer-type-enforcement, model-constraints (DB-driven).
- **Reconciliation on model change** (`analyze.ts`): runs validation against the new model. Each incompatible key gets a per-row decision (`keep` | `swap-to-default` | `clear`).

**The key thing the existing system does NOT do:** semantic mapping across models. If you have `thinking_budget=10000` on Anthropic and switch to OpenAI, the FE flags `thinking_budget` as unsupported but does NOT suggest "set `reasoning_effort=high` instead." That's the gap this doc closes for media-gen settings.

---

## 2. Canonical vocabulary (snake_case, matches `LLMParams`)

Every media setting has ONE canonical name. Backend translators do the per-provider mapping. Render UI per the canonical name.

| Canonical key | Modality | Type | Domain | Description |
|---|---|---|---|---|
| `aspect_ratio` | image, video | string enum | `"1:1"`, `"16:9"`, `"9:16"`, `"4:3"`, `"3:4"`, `"21:9"`, `"9:21"`, `"3:2"`, `"2:3"`, plus model-specific extras | W:H ratio. Backend reconciles with `width`/`height` per provider. |
| `size` | image, video | string | `"1024x1024"`, `"1536x1024"`, `"1280x720"`, `"auto"`, etc. | Explicit pixel dimensions when caller wants them. Some models accept `"auto"`; others have fixed enums; gpt-image-2 accepts custom W×H multiples of 16. |
| `width` | image, video | int | model-specific | Used when `size`/`aspect_ratio` aren't a fit (Together FLUX, SD-style models). |
| `height` | image, video | int | model-specific | Same. |
| `resolution` | video, some images | string enum | `"480p"`, `"720p"`, `"1080p"`, `"4K"`, plus model-specific (`"1K"`, `"2K"`) | Output quality tier (video) or pixel-density tier (Gemini 3.1 image). |
| `quality` | image | string enum | `"low"`, `"medium"`, `"high"`, `"auto"` | OpenAI gpt-image-* compute-effort knob. **Cross-provider:** maps to model-tier swap on providers that don't have a runtime quality knob (see § 4). |
| `count` | image | int (1-10) | per-model max | Number of images. Legacy alias `n` is auto-remapped. |
| `duration_seconds` | video | int | model-specific (typically 1-15 / 4,6,8 / 5-10 / 6-10) | Output duration. **NEW canonical** — replaces the legacy string `seconds` field. Both still accepted; backend prefers `duration_seconds` when both set. |
| `seconds` | video (legacy) | string | same as duration_seconds | Older string form. Kept for back-compat; FE should prefer `duration_seconds`. |
| `fps` | video | int | model-specific | Frames per second. Most providers fix this per model — only render when control exists. |
| `seed` | image, video | int | any int | Reproducibility seed. |
| `negative_prompt` | image, video | string | free text | Things to avoid. Honored by SD/Qwen/HiDream/Ideogram-quality/Veo; silently dropped by FLUX/Imagen/most flagships. |
| `enhance_prompt` | image, video | bool | true/false | Server-side prompt rewriting. Honored by Veo and several Together models. |
| `audio_enabled` | video | bool | true/false | Veo 3.1 native audio toggle (default on). |
| `style` | image | string | model-specific (`"vivid"`, `"natural"`, `"digital_illustration"`, `"realistic_image"`, etc.) | Recraft v4, DALL-E-style preset. |
| `output_format` | image, video | string enum | image: `"png"`, `"jpeg"`, `"webp"`. video: `"MP4"`, `"WEBM"` | File format. |
| `output_compression` | image | int (0-100) | jpeg/webp only | Lossy compression. gpt-image-2 / OpenAI image only. |
| `output_quality` | video | int (1-100) | model-specific | Bitrate / quality target. Together video models. |
| `background` | image | string enum | `"auto"`, `"opaque"`, `"transparent"` | Transparency request. **Only gpt-image-1.5 supports `"transparent"`.** gpt-image-2 silently strips. |
| `input_fidelity` | image | string enum | `"high"`, `"low"` | How strictly to preserve input image during edits. **gpt-image-1.5 only.** |
| `moderation` | image, video | string enum | `"auto"`, `"low"` | OpenAI content moderation level. |
| `partial_images` | image | int (0-3) | OpenAI gpt-image-* | Number of progressive previews emitted during streaming. Each costs +100 image-output tokens. |
| `stream_partial_images` | image | bool | true/false | Toggle the streaming partials path. Independent of `stream` (which is text-token streaming). |
| `steps` | image, video | int | model-specific | Diffusion steps. Honored by FLUX/SD/Wan; rejected by Imagen/Gemini/Sora/Veo. |
| `guidance_scale` | image, video | number/int | model-specific | CFG strength. Same coverage as `steps`. |
| `disable_safety_checker` | image | bool | true/false | Together-style opt-out. |
| `image_input` | image, video | MediaRef | URL or base64 | Single input image (image-to-image, image-to-video, edit). |
| `image_inputs` | image, video | MediaRef[] | up to N (model-specific: 3 xAI / 14 Gemini / 16 gpt-image-2 / 8 FLUX 2) | Multi-reference input. |
| `mask` | image | MediaRef | alpha-channel PNG | Inpainting mask. gpt-image-2 + a few SD variants. |
| `last_frame_image` | video | MediaRef | URL or base64 | Final frame for first→last interpolation. Veo 3.1, Kling. |
| `frame_images` | video | MediaRef[] | indexed by frame_number | Multi-shot frames. Kling. |
| `reference_images` | image, video | MediaRef[] | model-specific | Style/character refs. |
| `image_loras` | image | object[] | `[{path, scale}]` | LoRA weights. FLUX-family only. |
| `video_input` | video | MediaRef | URL or base64 | Source video for edit/extend. xAI grok-imagine-video, OpenAI Sora extensions. |
| `video_action` | video | enum | `"generate"`, `"edit"`, `"extend"` | When one model handles multiple ops via different endpoints (xAI, OpenAI Sora). Backend dispatches. |
| `reference_strength` | image | number (0..1) | model-specific | Image-to-image strength. |
| `person_generation` | image, video | enum | `"dont_allow"`, `"allow_adult"`, `"allow_all"` | Google Imagen + Veo policy. |

**Aliases / legacy keys** (handled by `deprecated-keys` rule):

| Legacy | Canonical |
|---|---|
| `n` | `count` |
| `max_tokens` | `max_output_tokens` |
| `seconds` (string) | `duration_seconds` (int) — both kept; canonical is the int |

---

## 3. Cross-provider equivalence table

This is the table the FE should consult during model-change reconciliation. When a user switches models, look up the source key + value, then suggest the equivalent on the target model.

### 3.1 Aspect ratio / dimensions

Every image and video model accepts SOME way to control dimensions. The canonical key is `aspect_ratio` first, falling back to `size` or `width`/`height`.

| User intent | gpt-image-2 | gpt-image-1.5/mini | Imagen 4 | Gemini 3.1 image | Sora 2 | Sora 2 Pro | Veo 3.1 | xAI image | xAI video | Together FLUX | Together Imagen | Together Veo | Together Sora | Replicate FLUX 2 | Replicate Veo 3.1 | Replicate Kling v3 | Replicate Runway | Replicate Recraft v4 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 16:9 | `size: "1536x1024"` | `size: "1536x1024"` | `aspect_ratio: "16:9"` | `image_config.aspect_ratio: "16:9"` | `size: "1280x720"` | `size: "1920x1080"` | `aspect_ratio: "16:9"` | `aspect_ratio: "16:9"` | `aspect_ratio: "16:9"` | `width:1536, height:1024` | `aspect_ratio: "16:9"` | `ratio: "16:9"` | `ratio: "16:9"` | `aspect_ratio: "16:9"` | `aspect_ratio: "16:9"` | `aspect_ratio: "16:9"` | `ratio: "16:9"` | `size: "1820x1024"` |
| 9:16 (vertical) | `size: "1024x1536"` | `size: "1024x1536"` | `aspect_ratio: "9:16"` | `image_config.aspect_ratio: "9:16"` | `size: "720x1280"` | `size: "1080x1920"` | `aspect_ratio: "9:16"` | `aspect_ratio: "9:16"` | `aspect_ratio: "9:16"` | `width:1024, height:1536` | `aspect_ratio: "9:16"` | `ratio: "9:16"` | `ratio: "9:16"` | `aspect_ratio: "9:16"` | `aspect_ratio: "9:16"` | `aspect_ratio: "9:16"` | `ratio: "9:16"` | `size: "1024x1820"` |
| 1:1 | `size: "1024x1024"` | `size: "1024x1024"` | `aspect_ratio: "1:1"` | `image_config.aspect_ratio: "1:1"` | n/a (square not supported) | n/a | n/a | `aspect_ratio: "1:1"` | `aspect_ratio: "1:1"` | `width:1024, height:1024` | `aspect_ratio: "1:1"` | n/a | n/a | `aspect_ratio: "1:1"` | n/a | `aspect_ratio: "1:1"` | `ratio: "1:1"` | `size: "1024x1024"` |

**Backend handles all these mappings already.** The FE only needs to render `aspect_ratio` as the canonical control and let the backend do the rest. **However**, when reconciling a model swap, the FE should preserve the user's value via this table (don't drop `aspect_ratio: "16:9"` just because the new model has a different field name in its `controls`).

### 3.2 Quality / tier

Quality is the trickiest cross-provider equivalence because some providers expose it as a runtime knob, others as a model-tier choice.

| User intent | gpt-image-2 | gpt-image-1.5 | gpt-image-1-mini | Imagen 4 | Gemini 3.1 image | Sora 2 | Sora 2 Pro | Veo 3.1 | Veo 3.1 Fast | Veo 3.1 Lite | Together FLUX 2 | Together Veo 3.0 | Replicate models |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Lowest cost / draft** | `quality: "low"` | `quality: "low"` | `quality: "low"` | swap to `imagen-4.0-fast-generate-001` | n/a (no quality knob) | (already cheap; only 720p) | `size: "720x1280"` (drop res) | swap to `veo-3.1-lite` | (already lite) | (already lite) | swap to `FLUX.2-flex` or `dev` | swap to `veo-3.0-fast` | swap to fast/lite variant of same family |
| **Default / balanced** | `quality: "auto"` | `quality: "auto"` | `quality: "auto"` | `imagen-4.0-generate-001` | n/a | (no choice) | default | `veo-3.1-fast` | (default) | (only tier) | `FLUX.2-pro` | `veo-3.0-fast` | base tier |
| **Best quality** | `quality: "high"` | `quality: "high"` | `quality: "high"` | swap to `imagen-4.0-ultra-generate-001` | swap to `gemini-3-pro-image-preview` | (only 720p; can't go higher) | `size: "1920x1080"` | `veo-3.1-generate-preview` | (no higher tier on fast) | (no higher) | `FLUX.2-max` (50 steps) | `veo-3.0-audio` | swap to `*-pro` / `*-ultra` / `*-max` variant |

**Reconciliation rule:** When user has `quality=high` and switches to a model without a runtime quality knob, suggest swapping to the family's premium variant (`is_premium=true` row in `ai_model` for the same provider).

### 3.3 Duration (video)

Canonical: `duration_seconds` (int).

| Model | Accepts | Default | Notes |
|---|---|---|---|
| `sora-2` | enum 4/8/12 | 8 | string in API; FE sends int, backend coerces |
| `sora-2-pro` | enum 4/8/12 | 8 | same |
| `veo-3.1-generate-preview` | enum 4/6/8 | 8 | 1080p/4K/refs require 8 |
| `veo-3.1-fast-generate-preview` | enum 4/6/8 | 8 | same |
| `veo-3.1-lite-generate-preview` | enum 4/6/8 | 8 | no extension capability |
| `grok-imagine-video` | int 1..15 | 5 | edit/extend ops have stricter ranges |
| `google/veo-3.0*` (Together) | string seconds | "8" | string field on Together API |
| `google/veo-3.1*` (Replicate) | int | 8 | descriptor handles |
| `runwayml/gen-4.5` | int 5..10 | 5 | |
| `bytedance/seedance-2.0` | int 3..12 | 5 | |
| `kwaivgi/kling-v3-video` | int 3..15 | 5 | |
| `wan-video/wan-2.7-*` | int | 5 | |
| `luma/ray-3` | int 5..9 | 5 | |
| `minimax/hailuo-2.3` | int 6..10 | 6 | |

**Reconciliation rule:** Clamp `duration_seconds` to the new model's range. If the new model uses a fixed enum (`{4,6,8}`), snap to the nearest enum value.

### 3.4 Image inputs (image-to-image, edits, multi-ref)

Canonical: `image_input` (single MediaRef) or `image_inputs` (MediaRef[]).

| Model | Field name in `controls` | Max count | Notes |
|---|---|---|---|
| `gpt-image-2` (edit) | (translated to `image=`) | 16 inputs | use `images.edit` endpoint |
| `gpt-image-1.5` (edit) | (translated to `image=`) | 16 | + supports `mask` |
| `imagen-4-*` | (not supported on Imagen 4 direct API) | 0 | text-to-image only on this surface |
| Gemini 3.1 image | (passed inline in `contents=[...]`) | 14 (3.1-flash, 3-pro), 3 (2.5-flash) | reference images for edit/composition |
| `sora-2*` (i2v) | `input_reference` | 1 | first frame |
| `veo-3.1-*` | `image=` (first frame), `last_frame=`, `reference_images=` | 1 first + 1 last + N refs | |
| `grok-imagine-image` (edit) | `image_url` (single) or `image_urls` (multi) | 3 | |
| `grok-imagine-video` | `image_url` (i2v) or `reference_image_urls` (ref-to-v) | 3 refs | |
| Together FLUX 2 | `image_url` (i2i), `reference_images` | 8 refs | |
| Together gemini-3-pro-image | `reference_images` | per Gemini limits | |
| Replicate FLUX 2 | `image_input` (single), `reference_images` (multi) | 8 | |
| Replicate gpt-image-2 | `input_images` | per OpenAI limits | |
| Replicate Imagen 4 | (not supported) | 0 | |
| Replicate nano-banana | `image_input` (array; same key for single AND multi) | 14 | |
| Replicate Recraft v4 | (not supported as input) | 0 | |
| Replicate Seedream 4.5 | `image` (single), `reference_images` (multi) | model-default | |
| Replicate Veo 3.1 | `image=` (first), `last_frame_image=` | 1+1 | |
| Replicate Runway Gen-4.5 | `prompt_image` | 1 | image-to-video only |
| Replicate Kling v3 | `start_image=`, `end_image=` | 1+1 | first→last |
| Replicate Wan 2.7 i2v | `image=` | 1 | i2v variant |
| Replicate Hailuo 2.3 | `first_frame_image=` | 1 | |
| Replicate Luma Ray-3 | `start_image_url=` | 1 | |

**Backend handles the field-name translation.** FE only needs to render `image_input` / `image_inputs` based on what the canonical control declares.

### 3.5 Audio (video)

Canonical: `audio_enabled` (bool). Default true on Veo 3+ when supported.

| Model | Behavior |
|---|---|
| `veo-3.1-*` | toggle accepted; default on |
| `sora-2*` | always-on synced audio; toggle ignored |
| `grok-imagine-video` | always-on synced audio; toggle ignored |
| `google/veo-3.0-audio` (Together) | always on (the variant carries audio) |
| `google/veo-3.0` (Together) | always silent (no audio variant) |
| `kling-2.1-*` (Together) | toggle accepted (`audio_enabled` → `generate_audio`) |
| Other Together video | dropped |
| Replicate `veo-3.1*` | toggle accepted (`generate_audio`) |
| Other Replicate video | varies; check `audio_enabled` in the descriptor |

**Reconciliation rule:** When swapping to a model where audio is always-on or unavailable, gray out the toggle but keep the user's preference recorded for future swaps.

### 3.6 Negative prompt

Canonical: `negative_prompt` (string).

| Honors it | Silently drops |
|---|---|
| Stable Diffusion family | FLUX 2 family |
| Qwen-Image | Imagen 4 family |
| HiDream | Gemini 3.1 image |
| Ideogram v3 | Sora 2/Pro |
| Veo 3.1 | gpt-image-* |
| Together Veo 3.0 | Recraft v4 |
| Together Wan 2.7 | Hailuo |

**Reconciliation rule:** Always preserve the value across swaps; show a warning in the UI ("This model ignores negative_prompt") when target doesn't honor it but don't clear the user's text.

### 3.7 Steps / guidance

Canonical: `steps`, `guidance_scale`.

| Honors them | Silently drops |
|---|---|
| Together FLUX (1-50 steps) | Together Imagen / Gemini-image |
| Together Wan 2.7 (10-50) | Together Sora 2 |
| Together Seedream | Replicate Veo / Sora / Kling |
| Together Qwen-Image | OpenAI gpt-image-* |
| Together Ideogram | xAI grok-imagine |

**Reconciliation rule:** Drop silently when target doesn't expose them — these are diffusion-specific knobs that don't have analogues on transformer-based image models.

---

## 4. Per-model controls quick reference

What you'll see in `ai_model.controls` for each new model. This is what `useModelControls()` will parse and render.

### 4.1 OpenAI image (gpt-image-* family)

```jsonc
// gpt-image-2
{
  "n": { "min": 1, "max": 10, "type": "integer", "default": 1 },
  "size": {
    "enum": ["1024x1024","1536x1024","1024x1536","auto"],
    "default": "auto",
    "allow_custom": true     // FE: show a "custom WxH" input alongside the dropdown
  },
  "quality": { "enum": ["low","medium","high","auto"], "default": "auto" },
  "background": { "enum": ["auto","opaque"], "default": "auto" },  // NO "transparent"
  "output_format": { "enum": ["png","jpeg","webp"], "default": "png" },
  "output_compression": { "min": 0, "max": 100, "type": "integer", "default": null },
  "moderation": { "enum": ["auto","low"], "default": "auto" },
  "partial_images": { "min": 0, "max": 3, "type": "integer", "default": null },
  "stream": { "type": "boolean", "default": false },
  "stream_partial_images": { "type": "boolean", "default": false }
}

// gpt-image-1.5 — adds:
{
  "background": { "enum": ["auto","opaque","transparent"], "default": "auto" },
  "input_fidelity": { "enum": ["high","low"], "default": null }
}

// gpt-image-1-mini — fewer controls (no background, no input_fidelity, no streaming)
```

### 4.2 OpenAI video (Sora 2 family)

```jsonc
// sora-2
{
  "size": {
    "enum": ["1280x720","720x1280","960x540","540x960","848x480","480x848"],
    "default": "1280x720"
  },
  "seconds": { "enum": ["4","8","12"], "type": "string", "default": "8" },
  "aspect_ratio": { "enum": ["16:9","9:16"], "default": "16:9" }
}

// sora-2-pro — adds 1024p and 1080p sizes:
{
  "size": {
    "enum": ["1920x1080","1080x1920","1792x1024","1024x1792","1280x720","720x1280","960x540","540x960","848x480","480x848"],
    "default": "1920x1080"
  }
}
```

### 4.3 Google Imagen 4 family

```jsonc
{
  "n": { "min": 1, "max": 4, "type": "integer", "default": 1 },     // imagen-4-ultra: max=1
  "aspect_ratio": { "enum": ["1:1","3:4","4:3","9:16","16:9"], "default": "1:1" },
  "image_size": { "enum": ["1K","2K"], "default": "1K" },           // imagen-4-fast: only "1K"
  "person_generation": { "enum": ["dont_allow","allow_adult","allow_all"], "default": "allow_adult" },
  "output_format": { "enum": ["png","jpeg"], "default": "png" },
  "include_rai_reason": { "type": "boolean", "default": true },
  "negative_prompt": { "type": "string", "default": null },
  "seed": { "type": "integer", "default": null }
}
```

### 4.4 Google Gemini 3.1 image (Nano Banana family)

```jsonc
{
  "stream": { "default": true },
  "image_size": { "enum": ["1K","2K","4K"], "default": "1K" },     // 2.5-flash-image: only "1K"
  "image_urls": { "allowed": true, "default": false },
  "aspect_ratio": { "enum": ["1:1","2:3","3:2","3:4","4:3","9:16","16:9"], "default": null },
  "temperature": { "max": 2, "min": 0, "default": 0.5 },
  "max_output_tokens": { "max": 32768, "min": 1, "default": 8000 }
}
// Nano Banana 2 (gemini-3.1-flash-image-preview) adds: "0.5K" and aspect_ratios "1:4","1:8","4:1","8:1"
```

### 4.5 Google Veo 3.1 family

```jsonc
{
  "duration": { "enum": ["4","6","8"], "type": "string", "default": "8" },
  "resolution": { "enum": ["720p","1080p","4k"], "default": "720p" },  // Lite: ["720p","1080p"]
  "aspect_ratio": { "enum": ["16:9","9:16"], "default": "16:9" },
  "person_generation": { "enum": ["allow_all","allow_adult"], "type": "string", "default": "allow_all" },
  "negative_prompt": { "type": "string", "default": null },
  "seed": { "type": "integer", "default": null },
  "audio_enabled": { "type": "boolean", "default": true }
}
```

### 4.6 xAI grok-imagine image

```jsonc
{
  "n": { "min": 1, "max": 10, "type": "integer", "default": 1 },
  "aspect_ratio": {
    "enum": ["1:1","3:4","4:3","9:16","16:9","2:3","3:2","9:19.5","19.5:9","9:20","20:9","1:2","2:1"],
    "default": "1:1"
  },
  "resolution": { "enum": ["1k","2k"], "default": "1k" },     // lowercase!
  "image_format": { "enum": ["base64","url"], "default": "base64" }
}
```

### 4.7 xAI grok-imagine video (handles all 5 ops via `video_action`)

```jsonc
{
  "duration": { "min": 1, "max": 15, "type": "integer", "default": 5 },
  "aspect_ratio": { "enum": ["1:1","16:9","9:16","4:3","3:4","3:2","2:3"], "default": "16:9" },
  "resolution": { "enum": ["480p","720p"], "default": "480p" },
  "audio_enabled": { "type": "boolean", "default": true }
}
```

### 4.8 Together image (single body shape; per-model field gating)

```jsonc
// Universal Together image controls
{
  "n": { "min": 1, "max": 4, "type": "integer", "default": 1 },
  "seed": { "type": "integer", "default": null },
  "steps": { "max": 50, "min": 1, "type": "integer", "default": null },     // dropped on Imagen/Gemini variants
  "width": { "type": "integer", "default": 1024 },
  "height": { "type": "integer", "default": 1024 },
  "image_loras": { "type": "object_array", "default": null },               // FLUX-only
  "output_format": { "enum": ["jpeg","png"], "default": "jpeg" },
  "guidance_scale": { "type": "number", "default": 3.5 },
  "negative_prompt": { "type": "string", "default": null },
  "response_format": { "enum": ["base64","url"], "default": "base64" },
  "reference_images": { "type": "string_array", "default": null },
  "disable_safety_checker": { "type": "boolean", "default": false }
}
// Imagen-on-Together / Gemini-on-Together variants drop the SD-style fields:
{
  "n": { "min": 1, "max": 4, "type": "integer", "default": 1 },
  "aspect_ratio": { "enum": ["1:1","3:4","4:3","9:16","16:9"], "default": "1:1" },
  "output_format": { "enum": ["jpeg","png"], "default": "jpeg" },
  "response_format": { "enum": ["base64","url"], "default": "base64" }
}
```

### 4.9 Together video

Three sub-shapes: (a) Wan-style (full diffusion knobs), (b) Veo 3.0 family, (c) Sora 2 family, (d) Kling 2.1 (multi-shot). See the actual rows in `ai_model` for the exact per-row shape.

### 4.10 Replicate image (per-model schemas vary)

Every Replicate model has its own `controls` JSONB tailored to that model's input schema. There is NO universal Replicate shape — the FE just renders what each row declares. Examples:

```jsonc
// black-forest-labs/flux-2-pro
{
  "aspect_ratio": { "enum": ["1:1","16:9","9:16","4:3","3:4","21:9","9:21"], "default": "1:1" },
  "seed": { "type": "integer", "default": null },
  "num_outputs": { "min": 1, "max": 4, "type": "integer", "default": 1 },
  "output_format": { "enum": ["png","jpg","webp"], "default": "webp" },
  "image_input": { "type": "string", "default": null },          // single
  "reference_images": { "type": "string_array", "max": 8, "default": null }
}

// openai/gpt-image-2 (on Replicate; key names DIFFER from native OpenAI)
{
  "aspect_ratio": { "enum": ["1:1","3:2","2:3"], "default": "1:1" },
  "quality": { "enum": ["low","medium","high","auto"], "default": "auto" },
  "input_images": { "type": "string_array", "default": null },   // PLURAL form
  "output_format": { "enum": ["png","jpeg","webp"], "default": "png" },
  "output_compression": { "min": 0, "max": 100, "type": "integer", "default": null }
}
```

### 4.11 Replicate video

Per-model. Examples:

```jsonc
// google/veo-3.1
{
  "aspect_ratio": { "enum": ["16:9","9:16"], "default": "16:9" },
  "resolution": { "enum": ["720p","1080p","4k"], "default": "720p" },
  "duration": { "type": "integer", "default": 8 },
  "image": { "type": "string", "default": null },
  "last_frame_image": { "type": "string", "default": null },
  "generate_audio": { "type": "boolean", "default": true },
  "negative_prompt": { "type": "string", "default": null },
  "seed": { "type": "integer", "default": null }
}

// kwaivgi/kling-v3-video — note start_image / end_image vs image / last_frame_image
{
  "aspect_ratio": { "enum": ["16:9","9:16","1:1"], "default": "16:9" },
  "duration": { "min": 3, "max": 15, "type": "integer", "default": 5 },
  "start_image": { "type": "string", "default": null },
  "end_image": { "type": "string", "default": null }
}
```

**The non-canonical key names (`num_outputs`, `input_images`, `image`, `start_image`, `end_image`, `prompt_image`, `first_frame_image`, `start_image_url`, `last_frame_image`, `generate_audio`, `ratio`) appear directly in the Replicate `controls` JSONB.** The FE renders whatever the row declares. The backend translator handles the canonical-key → provider-key mapping; the FE shouldn't try to translate.

**However**, the equivalence map in § 3 lets the FE preserve user intent on model swaps even when the key name changes (`image_input` → `start_image` etc.).

---

## 5. Required code changes

### 5.1 `useModelControls.ts` — add to `NormalizedControls`

Add these optional fields (all use the existing `ControlDefinition` shape):

```typescript
interface NormalizedControls {
  // ... existing fields ...

  // === Image generation ===
  aspect_ratio?: ControlDefinition;
  background?: ControlDefinition;
  output_compression?: ControlDefinition;
  moderation?: ControlDefinition;
  input_fidelity?: ControlDefinition;
  partial_images?: ControlDefinition;
  stream_partial_images?: ControlDefinition;
  style?: ControlDefinition;
  reference_strength?: ControlDefinition;
  quality?: ControlDefinition;            // also used by some text models; idempotent
  image_size?: ControlDefinition;          // Google Gemini-image / Imagen pixel-tier enum
  num_outputs?: ControlDefinition;        // Replicate alias for `count`
  image_format?: ControlDefinition;       // xAI base64/url toggle
  include_rai_reason?: ControlDefinition; // Imagen safety reason toggle
  person_generation?: ControlDefinition;  // Imagen / Veo policy

  // === Video generation ===
  duration_seconds?: ControlDefinition;
  duration?: ControlDefinition;           // some models use `duration`; treat as alias
  resolution?: ControlDefinition;
  audio_enabled?: ControlDefinition;
  generate_audio?: ControlDefinition;     // Replicate Veo alias for audio_enabled
  enhance_prompt?: ControlDefinition;
  ratio?: ControlDefinition;              // Together / Runway alias for aspect_ratio
  fps?: ControlDefinition;
  output_quality?: ControlDefinition;
  video_action?: ControlDefinition;       // generate / edit / extend

  // === MediaRef-shaped inputs (rendered via a media picker) ===
  image_input?: ControlDefinition;        // single MediaRef; FE renders <MediaPicker single>
  image_inputs?: ControlDefinition;       // MediaRef[]; FE renders <MediaPicker multi>
  input_images?: ControlDefinition;       // Replicate plural alias for image_inputs
  reference_images?: ControlDefinition;
  image?: ControlDefinition;              // Replicate single-image alias; show as MediaPicker
  start_image?: ControlDefinition;        // Kling first-frame
  end_image?: ControlDefinition;          // Kling last-frame
  prompt_image?: ControlDefinition;       // Runway image-to-video
  first_frame_image?: ControlDefinition;  // Hailuo
  start_image_url?: ControlDefinition;    // Luma Ray-3
  last_frame?: ControlDefinition;         // Veo native SDK key
  last_frame_image?: ControlDefinition;   // Replicate Veo / Kling
  mask?: ControlDefinition;
  video_input?: ControlDefinition;
  frame_images?: ControlDefinition;
  image_loras?: ControlDefinition;        // FLUX LoRA array
  disable_safety_checker?: ControlDefinition;
}
```

**Justification for the alias keys:** Per the user's directive, **the backend already translates** — but the FE renders straight from the row's `controls`. So when a Replicate row says `start_image`, the FE needs to recognize that key and render a media picker. The aliases are NOT canonical UI names — they're the keys the FE will encounter in the wild. The next subsection covers how to surface a SINGLE canonical control in the UI even when the underlying key differs.

### 5.2 New widget: `<MediaPicker>` for MediaRef-shaped fields

Extend `renderControlInput()` in `AgentSettingsCore.tsx`. For any `ControlDefinition` whose `type` is `"string"` AND whose key matches one of the MediaRef-shaped names above, render a media picker (file upload + URL input + library picker) instead of a plain text input.

```typescript
const MEDIA_REF_KEYS = new Set([
  "image_input", "image", "start_image", "end_image", "first_frame_image",
  "start_image_url", "last_frame", "last_frame_image", "prompt_image",
  "mask", "video_input",
]);

const MEDIA_REF_ARRAY_KEYS = new Set([
  "image_inputs", "input_images", "reference_images", "frame_images",
]);
```

Picker emits a MediaRef-shaped object `{file_id?: string, url?: string, mime_type?: string}` or array thereof.

### 5.3 New cross-provider canonical group in the settings UI

Group these canonical keys under one "Media Generation" section in `AgentSettingsCore.tsx`'s settings layout:

```typescript
const mediaSettings: { key: keyof LLMParams; label: string }[] = [
  { key: "aspect_ratio", label: "Aspect Ratio" },
  { key: "size", label: "Size" },
  { key: "resolution", label: "Resolution" },
  { key: "quality", label: "Quality" },
  { key: "count", label: "Count" },
  { key: "duration_seconds", label: "Duration (sec)" },
  { key: "fps", label: "Frames per Second" },
  { key: "seed", label: "Seed" },
  { key: "negative_prompt", label: "Negative Prompt" },
  { key: "enhance_prompt", label: "Enhance Prompt" },
  { key: "audio_enabled", label: "Generate Audio" },
  { key: "style", label: "Style" },
  { key: "output_format", label: "Output Format" },
  { key: "output_compression", label: "Output Compression" },
  { key: "background", label: "Background" },
  { key: "input_fidelity", label: "Input Fidelity" },
  { key: "moderation", label: "Moderation" },
  { key: "partial_images", label: "Partial Images" },
  { key: "stream_partial_images", label: "Stream Partial Images" },
  { key: "person_generation", label: "Person Generation" },
  { key: "image_input", label: "Input Image" },
  { key: "image_inputs", label: "Reference Images" },
  { key: "mask", label: "Inpaint Mask" },
  { key: "last_frame_image", label: "Last Frame Image" },
  { key: "video_input", label: "Source Video" },
];
```

These render conditionally based on whether the current model declares the matching control (or an aliased control — see § 5.4).

### 5.4 Canonical-name resolver (NEW)

To render a single canonical UI control when the row's `controls` uses an aliased key, add a resolver:

```typescript
// useModelControls.ts
const KEY_ALIASES: Record<string, string[]> = {
  // canonical → list of alias keys that may appear in controls JSONB
  aspect_ratio: ["ratio"],
  count: ["n", "num_outputs"],
  duration_seconds: ["duration", "seconds"],
  audio_enabled: ["generate_audio"],
  image_input: ["image", "start_image", "prompt_image", "first_frame_image", "start_image_url"],
  last_frame_image: ["last_frame", "end_image"],
  image_inputs: ["input_images"],
};

function resolveCanonical(controls: Record<string, ControlDefinition>, canonicalKey: string): ControlDefinition | undefined {
  if (controls[canonicalKey]) return controls[canonicalKey];
  const aliases = KEY_ALIASES[canonicalKey] ?? [];
  for (const alias of aliases) {
    if (controls[alias]) return controls[alias];
  }
  return undefined;
}
```

This lets the UI render `aspect_ratio` even on models whose `controls` declare `ratio`. The persisted setting goes back as `aspect_ratio` (canonical); the backend translator does the per-provider mapping.

### 5.5 Reconciliation enhancements (`analyze.ts`)

Today, `analyzeModelChange()` only flags incompatible keys for keep/swap/clear. For media-gen, add:

```typescript
// reconciliation/analyze.ts — extend the per-row decision

interface MediaGenEquivalence {
  // canonical key → list of (target model variant, target value) when the
  // intent doesn't survive a direct value copy.
  preserveIntent: (oldKey: string, oldValue: unknown, oldModelId: string, newModelId: string)
    => { suggestion: "swap-model" | "swap-value" | "keep" | "clear"; targetModel?: string; targetValue?: unknown };
}

// Example: user has quality="high" on gpt-image-2, switches to imagen-4.0-fast-generate-001
// Today: "quality" key not on imagen → flagged unsupported → suggest clear
// New: resolver looks up the family and suggests "swap to imagen-4.0-ultra-generate-001"
```

The mapping table for `quality` lives in this doc (§ 3.2). Hard-code it in `analyze.ts` or load it from a JSON config.

**Suggested algorithm:**

1. For each setting on the OLD model, look up `KEY_ALIASES` to find the canonical key.
2. If the canonical key is recognized by the NEW model (directly or via alias), copy the value (clamping to the new range / snapping to enum).
3. If not, check the equivalence table (§ 3) for a model-level swap. If a same-provider variant satisfies the intent, suggest "swap target model to X."
4. If no satisfying variant, fall back to today's behavior (`keep` / `clear`).

### 5.6 Validation rules (`rules.ts`)

Add these:

```typescript
// 1. duration must match enum on Veo / Sora when fixed
const fixedDurationEnumRule: ValidationRule = {
  id: "fixed-duration-enum",
  description: "Veo / Sora durations must match the model's enum (4/6/8 or 4/8/12)",
  // Implemented via the existing invalid-enum-value rule once duration is declared as an enum;
  // no new rule needed if the controls JSONB declares the enum (which all current rows do).
};

// 2. resolution + duration coupling on Veo 3.1
const veoResolutionDurationCoupling: ValidationRule = {
  id: "veo-resolution-duration",
  description: "Veo 3.1: 1080p, 4K, and reference_images all require duration_seconds=8",
  severity: "error",
  category: "cross_field",
  inspects: ["resolution", "duration_seconds", "reference_images"],
  validate(config) {
    const hires = ["1080p", "4k", "4K"].includes(config.settings.resolution);
    const hasRefs = !!config.settings.reference_images?.length;
    if ((hires || hasRefs) && config.settings.duration_seconds !== 8) {
      return [/* issue */];
    }
    return [];
  },
};

// 3. partial_images requires stream
const partialImagesStreamCoupling: ValidationRule = {
  id: "partial-images-needs-stream",
  description: "OpenAI: partial_images > 0 requires stream_partial_images=true",
  severity: "warning",
  category: "cross_field",
  inspects: ["partial_images", "stream_partial_images"],
  validate(config) {
    if ((config.settings.partial_images ?? 0) > 0 && !config.settings.stream_partial_images) {
      return [/* issue: enable streaming */];
    }
    return [];
  },
};

// 4. background=transparent requires gpt-image-1.5
const transparentBgModelRule: ValidationRule = {
  id: "transparent-bg-only-on-gpt-image-15",
  description: "Only gpt-image-1.5 supports transparent backgrounds; others silently strip",
  severity: "warning",
  category: "model_capability",
  inspects: ["background"],
  validate(config) {
    if (config.settings.background === "transparent" &&
        !config.modelId?.includes("gpt-image-1.5")) {
      return [/* warning: will be stripped */];
    }
    return [];
  },
};

// 5. input_fidelity requires gpt-image-1.5
const inputFidelityModelRule: ValidationRule = {
  // similar pattern
};

// 6. image_inputs cap per model
const imageInputsCapRule: ValidationRule = {
  id: "image-inputs-cap",
  description: "Multi-image edit caps vary per model (3 xAI, 8 FLUX 2, 14 Gemini, 16 gpt-image-2)",
  severity: "error",
  category: "range",
  inspects: ["image_inputs"],
  validate(config) {
    const arr = config.settings.image_inputs ?? [];
    const cap = config.controls?.image_inputs?.max ?? 16;
    if (arr.length > cap) {
      return [/* issue: cap exceeded */];
    }
    return [];
  },
};

// 7. video edit/extend require video_input
const videoActionInputRule: ValidationRule = {
  id: "video-action-requires-input",
  description: "video_action='edit' or 'extend' requires video_input",
  severity: "error",
  category: "cross_field",
  inspects: ["video_action", "video_input"],
  validate(config) {
    if (["edit", "extend"].includes(config.settings.video_action ?? "") &&
        !config.settings.video_input) {
      return [/* issue: video_input required */];
    }
    return [];
  },
};
```

### 5.7 DB-driven constraints for media (`ai_model.constraints` JSONB)

These should also be added to specific `ai_model` rows. Examples for the FE team to coordinate with the backend team:

```jsonc
// veo-3.1-generate-preview.constraints
[
  {
    "id": "veo-1080p-needs-8s",
    "when": { "field": "resolution", "op": "in", "value": ["1080p","4k"] },
    "require": { "field": "duration_seconds", "op": "eq", "value": 8 },
    "message": "Veo 3.1 1080p and 4K require duration_seconds=8",
    "severity": "error"
  },
  {
    "id": "veo-refs-need-8s",
    "when": { "field": "reference_images", "op": "exists" },
    "require": { "field": "duration_seconds", "op": "eq", "value": 8 },
    "message": "Veo 3.1 reference images require duration_seconds=8",
    "severity": "error"
  }
]

// gpt-image-2.constraints
[
  {
    "id": "gpt-image-2-no-transparent",
    "when": { "field": "background", "op": "eq", "value": "transparent" },
    "require": { "field": "background", "op": "neq", "value": "transparent" },
    "message": "gpt-image-2 doesn't support transparent backgrounds; use gpt-image-1.5",
    "severity": "warning"
  },
  {
    "id": "partial-images-needs-stream",
    "when": { "field": "partial_images", "op": "gt", "value": 0 },
    "require": { "field": "stream_partial_images", "op": "eq", "value": true },
    "message": "partial_images > 0 requires stream_partial_images=true",
    "severity": "error"
  }
]
```

These run through the existing `model-constraints` rule via `evaluateAllConstraints()` — no new code needed.

### 5.8 Capability badges / model picker filtering

Use `model_capabilities()` (backend-provided per row) to badge models in the picker:

```
[ Image gen ] [ Image edit ] [ Video gen ] [ Video edit ] [ Video extend ] [ Vision ]
```

These come from the backend `Capability` enum:
```python
TEXT, VISION, IMAGE_GENERATION, IMAGE_EDIT,
VIDEO_GENERATION, VIDEO_EDIT, VIDEO_EXTEND,
AUDIO_TTS, AUDIO_INPUT, TRANSCRIPTION
```

Surface them so users can filter the model picker (e.g. "show me only models that support video_extend").

---

## 6. Persistence shape (the wire format)

When saving settings, the FE persists the **canonical** keys from `LLMParams`:

```typescript
{
  model: "gpt-image-2",
  prompt: "a koi pond at dusk",                    // user-typed
  count: 1,                                         // canonical (not "n", not "num_outputs")
  aspect_ratio: "16:9",                             // canonical (not "ratio")
  duration_seconds: 8,                              // canonical (not "seconds", not "duration")
  audio_enabled: true,                              // canonical (not "generate_audio")
  image_input: { url: "https://...", mime_type: "image/png" },  // MediaRef
  image_inputs: [ ... ],                            // MediaRef[]
  quality: "high",
  background: "auto",
  partial_images: 2,
  stream_partial_images: true,
  // ...
}
```

The backend translator converts these to whatever the chosen provider needs:
- gpt-image-2 → `{model, prompt, n, size, quality, background, partial_images, stream}` etc.
- Replicate FLUX 2 → `{ref: "black-forest-labs/flux-2-pro", input: {prompt, aspect_ratio, num_outputs, image_input}}` etc.
- Veo 3.1 → `{model, source: GenerateVideosSource(prompt), config: GenerateVideosConfig(aspect_ratio, resolution, duration_seconds, audio_enabled, ...)}` etc.

**The FE never sends a Replicate-style `num_outputs` or a Together-style `ratio` over the wire.** Always canonical.

---

## 7. UX guidance

### When the model is swapped

1. Resolve user's canonical settings against the new model's controls (with aliases).
2. For each setting, consult § 3 to see if the intent transfers.
3. Show the existing reconciliation modal but with these enriched options:
   - **"Keep value"** — the value persists; show a warning if the new model doesn't honor it.
   - **"Swap to default"** — adopt the new model's default for this setting.
   - **"Clear"** — drop the setting.
   - **NEW: "Switch model variant"** — when the user's intent is better preserved by a sibling model in the same family (e.g. quality="high" → swap to `*-ultra` variant). This action changes the model itself, not just the setting.

### When the model lacks a control the user has set

Don't hide the control. Render it disabled with a tooltip: "Not supported by `<model>`. Will be ignored." This makes the user's saved intent visible even when not active.

### When the user picks a new control on a model that doesn't expose it

Don't let them. Filter the available settings to what the current model declares (with aliases). Power users can switch to the JSON editor (`SettingsJsonEditor.tsx`) to set anything.

---

## 8. Open questions / future work

- **Model auto-selection by intent.** Long-term, the FE could let the user say "I want to generate a square 1024×1024 image, low cost" and pick a model automatically. The pricing JSONB on `ai_model` already supports this (`output_price` and `usage_basis` are in every row). Out of scope here.
- **Media library / picker.** The MediaPicker widget (§ 5.2) needs design. Inputs are MediaRef-shaped (`{file_id, url, mime_type, base64_data}`) — the AI Dream API boundary resolves URLs to bytes server-side. FE doesn't need to upload-then-fetch; it just collects refs.
- **Cost estimation in the UI.** Per-image / per-second cost is now in `ai_model.pricing`. Render an estimated cost next to the "Generate" button based on `count`, `duration_seconds`, `resolution`.
- **Streaming partials UI.** When `stream_partial_images=true`, the backend emits `partial_image` events (`PartialImageData` payload from matrx-connect). FE should render a low-res preview that progressively refines.

---

## 9. Reference: the canonical keys, summarized

For quick scanning by FE devs implementing this:

```
IMAGE
  aspect_ratio, size, width, height, count, quality, style
  background, input_fidelity, output_format, output_compression
  moderation, partial_images, stream_partial_images
  negative_prompt, enhance_prompt, seed, person_generation
  steps, guidance_scale, image_loras, disable_safety_checker, reference_strength
  image_input, image_inputs, mask

VIDEO
  aspect_ratio, resolution, duration_seconds, count, fps
  audio_enabled, enhance_prompt, negative_prompt, seed
  output_format, output_quality, person_generation
  image_input, last_frame_image, frame_images, reference_images, video_input
  video_action

SHARED WITH TEXT
  stream, max_output_tokens, temperature, top_p, top_k, store, verbosity, response_format
```

That's the entire vocabulary. Backend handles every per-provider translation; FE renders one canonical control per concept and lets the model's `controls` JSONB decide whether it's exposed.

---

*Maintained by the matrx-ai backend team. When you add a new provider/model row to `ai_model`, update § 4 with the new shape and § 3 with any new equivalences. The single source of truth for the per-model controls is the row itself; this doc is the cross-model semantic glue.*
