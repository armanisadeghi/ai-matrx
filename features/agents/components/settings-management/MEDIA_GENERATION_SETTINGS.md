# Media Generation Settings — FE Reference

> Companion to `AgentSettingsCore.tsx`, `validation/rules.ts`, `validation/constraints.ts`.
>
> Audience: FE devs adding image- and video-generation controls to the agent settings UI.
>
> **The headline:** media settings work *exactly* like `thinking` already does. You render whatever the model's `controls` JSONB declares — using the provider-native key names exactly as they appear. Settings persist across model swaps. Python handles all cross-provider translation. **The FE never translates between provider key names.**

---

## 1. The architecture in one paragraph

The agent's settings are a flat dict of key/value pairs. Each model declares — in its `ai_model.controls` JSONB — exactly which controls it natively accepts, with the **provider-native names, types, and enums verbatim**. The FE renders one widget per declared control, bound to the agent setting under the same key name. When the user switches the agent's model, the agent's settings dict is **unchanged** — every value the user previously set stays in the dict forever. Python (the backend) is responsible for reading the agent's settings and translating them into whatever the chosen provider's API actually accepts. If a setting on the agent has no equivalent on the new model, Python silently drops it from the API call — but the value remains in the agent dict, ready to flow correctly the next time the user picks a model that does honor it.

This is the same pattern that makes `thinking_budget`, `reasoning_effort`, `thinking_level`, and `include_thoughts` Just Work today. Media generation extends that pattern; nothing new to invent.

---

## 2. What you actually render

The same `renderControlInput()` dispatch you already use, against the same `useModelControls()` parser. The widget types are unchanged:

| Control shape (in `ai_model.controls`) | Widget |
|---|---|
| `{enum: [...], default: ...}` | `<Select>` |
| `{type: "integer", min, max, default}` | `<NumberInput withSlider>` |
| `{type: "number", min, max, default}` | `<NumberInput withSlider>` |
| `{type: "string", default}` | `<Input>` (or `<MediaPicker>` for media-ref keys — see § 5) |
| `{type: "boolean", default}` | `<Checkbox>` |
| `{type: "string_array" | "object_array", default}` | `<Textarea>` (newline split) or media-multi picker |
| `{allow_custom: true, ...}` | enum + custom-input fallback (e.g. gpt-image-2's `size`) |

You'll encounter new key names because the controls JSONB now reflects what each provider/SDK actually accepts. **Don't try to canonicalize them.** Render as-is.

---

## 3. The persistence rule (this is the important one)

The agent setting key matches the control name in the model that introduced it. Concretely:

- A user with gpt-image-2 selected sets `quality = "high"` and `size = "1536x1024"`. Those keys land on the agent.
- They switch the agent's model to `imagen-4.0-generate-001`. Imagen 4's controls declare `aspect_ratio`, `image_size`, `number_of_images`, etc. — neither `quality` nor `size`. The FE no longer renders those two controls, but **`quality="high"` and `size="1536x1024"` stay on the agent dict**. (Per Decision 4 below, they're shown as disabled rows with a "this model doesn't natively use this" indicator.)
- They switch back to gpt-image-2. The two values are still there; the controls light back up; the user picks up where they left off.

Python's job: at request time, read the agent dict, translate every relevant key per the active provider, drop the rest silently. The user never sees this.

---

## 4. Mismatch UX (Decision 4)

When the agent has a value for a key that the current model's `controls` don't declare:

- **Render the control disabled** with the value visible.
- Surface a small mismatch indicator (icon + tooltip): *"`<key>` isn't natively used by `<model_name>`. The value is preserved for other models."*
- This matches today's behavior for `thinking_budget` on a non-thinking model. Don't invent new UX — use the existing pattern.
- Never modify or clear the value automatically. Never offer "swap to default" or "switch model variant" as a reconciliation action. (Both of those would lose user intent.)

---

## 5. Media-ref widget — IMPLEMENTED

Several control values are MediaRef-shaped: `{file_id?, url?, file_uri?, mime_type?}`. Every model that accepts an image input declares it under whatever key name the provider uses — `image_input`, `input_images`, `image`, `start_image`, `end_image`, `prompt_image`, `first_frame_image`, `start_image_url`, `last_frame`, `last_frame_image`, `mask`, `video_input`, `frame_images`, `reference_images`.

**Wired today** in `AgentSettingMediaPicker.tsx`:

- `MEDIA_REF_KEYS` set in `AgentSettingsCore.tsx` enumerates the single-ref keys.
- `MEDIA_REF_ARRAY_KEYS` set enumerates the multi-ref keys.
- `renderControlInput` checks both sets at the top and dispatches to `<AgentSettingMediaPicker multi={…} />` instead of the generic widgets.
- The picker uses the existing `ResourcePickerMenu` (same UI as `SmartAgentResourcePickerButton` for chat attachments) and converts the picker payload via `refineBlockType` + `resourceDataToSource` from `features/agents/redux/execution-system/instance-resources/resource-source.ts` — the canonical cld_files-managed path. **No alternate ingress.**
- The MediaRef value is written to the agent's settings dict via `handleSettingChange(key, mediaRef)`, exactly like every other setting.

Adding a new MediaRef-shaped key to a model's `controls` JSONB requires only:
- Adding the key name to `MEDIA_REF_KEYS` (single) or `MEDIA_REF_ARRAY_KEYS` (multi) in `AgentSettingsCore.tsx`.
- Adding the key to the `mediaInputSettings` group so it appears under the "Media Inputs" header when set.

### Masking — NOT YET BUILT (future)

The picker supports `mask` as a regular MediaRef slot — the user can upload a pre-made transparent PNG today. What we don't have yet is an in-app **mask drawing UI** (paint pixels onto a canvas, save as transparent PNG, upload via cld_files, fill the `mask` slot). That's a separate feature; it'd live as a new tab/dialog launched from the `mask` row's picker. When it ships, the wire shape doesn't change — the canvas just produces a MediaRef like any other upload.

---

## 6. The agent setting "vocabulary" (FYI only)

Below is the union of every key name that can appear on an agent's settings dict. **You don't need to memorize this** — you render whatever the active model's `controls` declares, period. This list exists only to help you understand what shape `LLMParams` (the wire format) can take.

These come from:
- The `ai_model.controls` JSONB rows we've shipped (provider-native exactly)
- Plus a handful of canonical names Python's `UnifiedConfig` understands (e.g. `aspect_ratio`, `width`, `height`, `duration_seconds`, `render_quality`, `encode_quality`, `generate_audio`)

Image generation:
```
n / number_of_images / num_outputs / count
size / width / height / aspect_ratio / image_size / resolution / ratio
quality / render_quality
output_format / output_mime_type / output_compression / output_quality / encode_quality
background / input_fidelity / moderation
partial_images / stream
style / negative_prompt / seed / guidance_scale / steps
disable_safety_checker / include_rai_reason / person_generation
image_input / image_inputs / input_images / image / reference_images / image_loras
mask / image_url / image_format
```

Video generation:
```
duration_seconds / duration / seconds
resolution / aspect_ratio / ratio / size / fps
generate_audio
negative_prompt / seed / steps / guidance_scale
enhance_prompt / person_generation
image / image_input / start_image / end_image / last_frame / last_frame_image
prompt_image / first_frame_image / start_image_url
video_input / frame_images / reference_images
output_quality / encode_quality
```

Most of those will show up on at least one model's `controls`. None of them are FE concerns to translate — Python knows what to do with each.

---

## 7. Per-model controls JSONB at a glance

What you'll receive from the API per model. **Treat this as truth** — render as declared.

### OpenAI image: `gpt-image-2`
```jsonc
{
  "n":                  {"min": 1, "max": 10, "type": "integer", "default": 1},
  "size":               {"enum": ["1024x1024","1536x1024","1024x1536","auto"],
                         "default": "auto", "allow_custom": true},
  "quality":            {"enum": ["low","medium","high","auto"], "default": "auto"},
  "background":         {"enum": ["auto","opaque"], "default": "auto"},
  "output_format":      {"enum": ["png","jpeg","webp"], "default": "png"},
  "output_compression": {"min": 0, "max": 100, "type": "integer", "default": null},
  "moderation":         {"enum": ["auto","low"], "default": "auto"},
  "partial_images":     {"min": 0, "max": 3, "type": "integer", "default": null},
  "stream":             {"type": "boolean", "default": false}
}
```

### OpenAI image: `gpt-image-1.5`
Same as gpt-image-2, plus:
```jsonc
{
  "background":     {"enum": ["auto","opaque","transparent"], "default": "auto"},
  "input_fidelity": {"enum": ["high","low"], "default": null}
}
```

### OpenAI video: `sora-2` / `sora-2-pro`
```jsonc
{
  "size":    {"enum": [/* 6 sizes for sora-2; 10 for sora-2-pro */], "default": "..."},
  "seconds": {"enum": ["4","8","12"], "type": "string", "default": "8"}
}
```

### Google Imagen 4 (direct API)
```jsonc
{
  "number_of_images":  {"min": 1, "max": 4, "type": "integer", "default": 1},
  "aspect_ratio":      {"enum": ["1:1","3:4","4:3","9:16","16:9"], "default": "1:1"},
  "image_size":        {"enum": ["1K","2K"], "default": "1K"},
  "person_generation": {"enum": ["dont_allow","allow_adult","allow_all"], "default": "allow_adult"},
  "output_mime_type":  {"enum": ["image/png","image/jpeg"], "default": "image/png"},
  "include_rai_reason": {"type": "boolean", "default": true},
  "negative_prompt":   {"type": "string", "default": null},
  "seed":              {"type": "integer", "default": null}
}
```
(Imagen 4 Fast: `image_size` is `["1K"]`-only. Imagen 4 Ultra: `number_of_images.max = 1`.)

### Google Gemini-image (Nano Banana family)
Pre-existing rows; multimodal `generate_content` shape with `aspect_ratio`, `image_size`, `temperature`, `max_output_tokens`, `image_urls`, etc. Already wired correctly today.

### Google Veo 3.1 (direct API)
```jsonc
{
  "duration_seconds":  {"enum": [4,6,8], "type": "integer", "default": 8},
  "resolution":        {"enum": ["720p","1080p","4k"], "default": "720p"},
  "aspect_ratio":      {"enum": ["16:9","9:16"], "default": "16:9"},
  "person_generation": {"enum": ["allow_all","allow_adult"], "type": "string", "default": "allow_all"},
  "generate_audio":    {"type": "boolean", "default": true},
  "enhance_prompt":    {"type": "boolean", "default": null},
  "negative_prompt":   {"type": "string", "default": null},
  "seed":              {"type": "integer", "default": null}
}
```
(Veo 3.1 Lite: `resolution` enum drops `"4k"`.)

### xAI grok-imagine image: `grok-imagine-image` / `grok-imagine-image-pro`
```jsonc
{
  "n":            {"min": 1, "max": 10, "type": "integer", "default": 1},
  "aspect_ratio": {"enum": [/* 13 ratios */], "default": "1:1"},
  "resolution":   {"enum": ["1k","2k"], "default": "1k"},
  "image_format": {"enum": ["base64","url"], "default": "base64"}
}
```

### xAI grok-imagine video: `grok-imagine-video`
```jsonc
{
  "duration":     {"min": 1, "max": 15, "type": "integer", "default": 5},
  "aspect_ratio": {"enum": ["1:1","16:9","9:16","4:3","3:4","3:2","2:3"], "default": "16:9"},
  "resolution":   {"enum": ["480p","720p"], "default": "480p"}
}
```
(No audio toggle — xAI's video model has implicit always-on audio.)

### Together image (FLUX 2 / Seedream / Qwen / Ideogram / openai-on-Together / xai-on-Together / etc.)
Universal Together image shape. Native names: `n`, `width`, `height`, `steps`, `seed`, `guidance_scale`, `negative_prompt`, `image_url`, `reference_images`, `image_loras`, `output_format`, `response_format`, `disable_safety_checker`. Per-model variations strip fields the upstream model doesn't honor.

### Together image (Imagen-on-Together / Gemini-on-Together)
Trimmed shape — Together routes these to the upstream provider:
```jsonc
{
  "n":               {"min": 1, "max": 4, "type": "integer", "default": 1},
  "width":           {"min": 512, "max": 2048, "type": "integer", "default": 1024},
  "height":          {"min": 512, "max": 2048, "type": "integer", "default": 1024},
  "output_format":   {"enum": ["jpeg","png"], "default": "jpeg"},
  "response_format": {"enum": ["base64","url"], "default": "base64"}
}
```

### Together video: Veo 3.0 (`google/veo-3.0*`)
```jsonc
{
  "ratio":           {"enum": ["16:9","9:16"], "default": "16:9"},
  "resolution":      {"enum": ["720p","1080p"], "default": "720p"},
  "seconds":         {"type": "string", "default": "8"},
  "seed":            {"type": "integer", "default": null},
  "negative_prompt": {"type": "string", "default": null},
  "stream":          {"default": false}
}
```

### Together video: Sora 2 / Sora 2 Pro on Together
Same shape as Veo 3.0 above (Together's universal video shape).

### Together video: Kling 2.1 (`kwaivgI/kling-2.1-*`)
```jsonc
{
  "seconds":          {"type": "string", "default": null},
  "seed":             {"type": "integer", "default": null},
  "frame_images":     {"type": "object_array", "default": null},
  "reference_images": {"type": "string_array", "default": null},
  "negative_prompt":  {"type": "string", "default": null},
  "generate_audio":   {"type": "boolean", "default": true}
}
```

### Together video: Wan family
Full diffusion-knob shape: `width`, `height`, `fps`, `seed`, `steps`, `seconds`, `frame_images`, `output_format`, `output_quality`, `guidance_scale`, `negative_prompt`, `reference_images`.

### Replicate (per-model)
Every Replicate model's `controls` is the EXACT input schema for that model. Examples of provider-native names you'll encounter:

| Model | Notable control names |
|---|---|
| `black-forest-labs/flux-2-*` | `aspect_ratio`, `seed`, `num_outputs`, `output_format`, `image_input`, `reference_images` |
| `openai/gpt-image-2` | `aspect_ratio`, `quality`, `input_images`, `output_format`, `output_compression` |
| `google/imagen-4*` | `aspect_ratio`, `output_format`, `num_outputs` |
| `google/nano-banana-*` | `aspect_ratio`, `image_input` (array up to 14) |
| `recraft-ai/recraft-v4*` | `size`, `style` (no aspect_ratio — Recraft uses `size` only) |
| `ideogram-ai/ideogram-v3*` | `aspect_ratio`, `style`, `negative_prompt`, `seed` |
| `bytedance/seedream-4.5` | `aspect_ratio`, `image`, `reference_images` |
| `google/veo-3.1*` | `aspect_ratio`, `resolution`, `duration`, `image`, `last_frame_image`, `generate_audio`, `negative_prompt`, `seed` |
| `runwayml/gen-4.5` | `ratio`, `duration`, `prompt_image` |
| `bytedance/seedance-2.0` | `aspect_ratio`, `resolution`, `duration`, `image`, `reference_images` |
| `kwaivgi/kling-v3-video` | `aspect_ratio`, `duration`, `start_image`, `end_image` |
| `wan-video/wan-2.7-*` | `aspect_ratio`, `duration`, `image` |
| `luma/ray-3` | `aspect_ratio`, `duration`, `start_image_url` |
| `minimax/hailuo-2.3` | `aspect_ratio`, `duration`, `first_frame_image` |

**These are the provider's actual input field names.** They are NOT canonicalized. Render exactly as declared.

---

## 8. UnifiedAIClient capability badges

Each model's row also exposes capabilities (derived backend-side via `model_capabilities()`). The FE can read them via the existing model-picker integration to filter / badge. Values from the `Capability` enum:

```
TEXT, VISION, IMAGE_GENERATION, IMAGE_EDIT,
VIDEO_GENERATION, VIDEO_EDIT, VIDEO_EXTEND,
AUDIO_TTS, AUDIO_INPUT, TRANSCRIPTION
```

Surface them on the model picker as badges so users can filter (e.g. "show me only models that can edit videos").

---

## 9. Cross-field validation (DB-driven)

Don't hardcode media validation rules in `rules.ts`. They go in `ai_model.constraints` JSONB (already supported by the existing `model-constraints` rule + `evaluateAllConstraints()` in `constraints.ts`).

Examples that will be added as the relevant models ship:

```jsonc
// veo-3.1-generate-preview.constraints
[
  {
    "id": "veo-1080p-needs-8s",
    "when":    {"field": "resolution", "op": "in", "value": ["1080p","4k"]},
    "require": {"field": "duration_seconds", "op": "eq", "value": 8},
    "message": "Veo 3.1 1080p and 4K require duration_seconds=8",
    "severity": "error"
  }
]

// gpt-image-2.constraints
[
  {
    "id": "partial-images-needs-stream",
    "when":    {"field": "partial_images", "op": "gt", "value": 0},
    "require": {"field": "stream", "op": "eq", "value": true},
    "message": "partial_images > 0 requires stream=true",
    "severity": "error"
  }
]
```

These flow through the existing constraint engine — no new FE rules code needed.

---

## 10. What you should NOT build

Listing the anti-patterns explicitly so this gets done right the first time:

- ❌ A "canonical name" translation table on the FE. The FE renders provider-native; Python translates.
- ❌ Auto-clearing or auto-mutating settings on model swap. Settings persist; the user's intent is sacred.
- ❌ A "switch to a model variant that supports this setting" reconciliation action. The user picked their model deliberately.
- ❌ Stripping settings before sending to the backend. Send the entire agent settings dict, every time. The backend filters.
- ❌ Renaming controls to look "consistent" across providers (e.g. forcing `aspect_ratio` everywhere). The DB is the source of truth — render what it says.
- ❌ Hardcoded cross-provider equivalence tables. Python knows. The FE doesn't need to.

---

## 11. NormalizedControls — minimal additions

Add these optional fields to `NormalizedControls` in `useModelControls.ts` so the parser doesn't drop unknown keys into `unmappedControls`. They'll appear on at least one model row each:

```typescript
interface NormalizedControls {
  // ... existing fields ...

  // dimensions
  aspect_ratio?: ControlDefinition;
  width?: ControlDefinition;
  height?: ControlDefinition;
  size?: ControlDefinition;
  resolution?: ControlDefinition;
  ratio?: ControlDefinition;          // Together video / Replicate Runway
  image_size?: ControlDefinition;     // Google Imagen / Gemini-image
  num_outputs?: ControlDefinition;    // Replicate
  number_of_images?: ControlDefinition; // Imagen direct

  // image-specific
  quality?: ControlDefinition;
  background?: ControlDefinition;
  input_fidelity?: ControlDefinition;
  output_compression?: ControlDefinition;
  moderation?: ControlDefinition;
  partial_images?: ControlDefinition;
  output_mime_type?: ControlDefinition;
  output_format?: ControlDefinition;
  output_quality?: ControlDefinition;
  style?: ControlDefinition;
  reference_strength?: ControlDefinition;
  image_format?: ControlDefinition;       // xAI base64/url
  include_rai_reason?: ControlDefinition; // Imagen
  person_generation?: ControlDefinition;  // Imagen / Veo
  disable_safety_checker?: ControlDefinition;
  guidance_scale?: ControlDefinition;
  steps?: ControlDefinition;
  negative_prompt?: ControlDefinition;
  seed?: ControlDefinition;
  fps?: ControlDefinition;

  // video-specific
  duration_seconds?: ControlDefinition;
  duration?: ControlDefinition;       // some providers use `duration` natively
  seconds?: ControlDefinition;        // Together / Sora native
  generate_audio?: ControlDefinition;
  enhance_prompt?: ControlDefinition;

  // media inputs (rendered as MediaPicker — see § 5)
  image_input?: ControlDefinition;
  image_inputs?: ControlDefinition;
  input_images?: ControlDefinition;
  reference_images?: ControlDefinition;
  image?: ControlDefinition;
  start_image?: ControlDefinition;
  end_image?: ControlDefinition;
  prompt_image?: ControlDefinition;
  first_frame_image?: ControlDefinition;
  start_image_url?: ControlDefinition;
  last_frame?: ControlDefinition;
  last_frame_image?: ControlDefinition;
  mask?: ControlDefinition;
  video_input?: ControlDefinition;
  frame_images?: ControlDefinition;
  image_loras?: ControlDefinition;
  image_url?: ControlDefinition;          // Together image URL input
  image_urls?: ControlDefinition;         // Gemini-image
}
```

These are just typed slots so TS doesn't complain. Their semantics are entirely determined by what the model declares per row.

---

## 11b. The wire format is provider-native; Python normalizes

When the FE saves an agent's settings, it serializes the dict and sends it. The keys in that dict can be **any of the provider-native names declared by any model the user has touched** — `seconds` (Sora-style string), `num_outputs` (Replicate-style int), `quality` (gpt-image-2 string), `output_quality` (Together video int), `number_of_images` (Imagen direct int), `duration` (xAI/Replicate int).

Python's boundary normalizes all of these to canonical UnifiedConfig fields (in `LLMParams._remap_aliases` and `UnifiedConfig.from_dict._FIELD_ALIASES`). So the FE never needs to canonicalize before sending. **Send what the user touched, exactly as the model's controls JSONB declared the keys.**

The current alias map (kept in sync between `LLMParams` and `UnifiedConfig`):

| Provider-native input | → Canonical UnifiedConfig field |
|---|---|
| `n`, `num_outputs`, `number_of_images` | `count` |
| `quality` | `render_quality` |
| `output_quality` | `encode_quality` |
| `seconds` (string), `duration` (int) | `duration_seconds` (int) |
| `max_tokens` | `max_output_tokens` |

When the FE auto-generates TS types from `LLMParams`, those generated types will only show the canonical names. The provider-native names (e.g. `seconds`, `quality`, `num_outputs`) are NOT in the generated types — they're accepted as input by Python's normalizer but they're not part of the canonical surface. **The FE's `LLM_PARAMS_KEYS` validation should accept "provider-native names declared by the active model's controls" as valid keys** — which the existing `unrecognized-keys` rule already does (it checks against the union of `LLM_PARAMS_KEYS` + the model's controls keys).

---

## 12. Notes the FE needs to handle (won't be done backend-side)

### 12a. Aspect ratio ↔ width/height (the "two of three" trio)

Three canonical fields express dimensions: `aspect_ratio`, `width`, `height`. They're mathematically related — given any two, the third is implied. The FE must let the user provide **any two** and auto-fill the third. The user may also override any one of the three at any time.

**Important UX rule:** **don't validate while the user is editing.** Let them type freely. Only at save time, run a validation pass that:
- Confirms the trio is consistent (aspect_ratio ≈ width÷height within a small tolerance).
- If inconsistent, auto-correct the field the user changed *least recently* to make it consistent (i.e. the field they probably weren't actively editing).
- Show a non-blocking notification: *"Adjusted height to 1024 to match aspect_ratio 16:9 and width 1820."*
- Never block save just because two values disagree mid-edit.

The backend cross-derivation (`packages/matrx-ai/matrx_ai/providers/_media_dims.py`) handles whatever the user saves — explicit `width+height` wins over `aspect_ratio` when both are set, otherwise `aspect_ratio` is used to derive a sensible default `width+height` per provider. So even an inconsistent save technically works server-side; the on-save validation is just a UX polish to keep the agent dict clean.

### 12b. "This setting was silently dropped on this call" (future enhancement)

Per Decision 6, when a user has a setting on the agent that the active provider doesn't honor (e.g. `negative_prompt` on FLUX 2, which silently drops it), the backend currently just doesn't pass it. The user has no signal that their value was ignored. Future enhancement: surface a per-call "settings dropped on this run" event from the backend so the FE can show a one-time toast: *"FLUX 2 doesn't honor your negative_prompt. Setting preserved for other models."*

This needs:
1. A new event type in matrx-connect (`SettingsDroppedData` or similar) carrying `{key, value, reason}`.
2. Backend translators to emit it when they skip a setting that the agent has set.
3. A FE listener that toasts the warning (deduped per-session per-key).

Not blocking; ship media controls first, add this in a follow-up. Track here so it doesn't fall on the floor.

---

## 13. Quick FE checklist

When you're ready to ship media controls UI:

- [ ] Add the new keys above to `NormalizedControls`.
- [ ] Add a "Media Generation" section (or two — one for image, one for video) to the settings layout.
- [ ] Add `<MediaPicker single>` and `<MediaPicker multi>` widgets that emit MediaRef-shaped values.
- [ ] In `renderControlInput()`, for any `string` / `string_array` control whose key matches a known media-ref name, render the media picker instead of a text input. (Or use a `controlDef.kind === "media"` hint if you extend `useModelControls` to detect it.)
- [ ] Keep the mismatch-display behavior identical to today's `thinking_budget` rendering on non-thinking models.
- [ ] Add capability badges to the model picker (per § 8).
- [ ] Don't touch `analyze.ts` reconciliation logic — it's already correct.
- [ ] Don't add cross-provider validation rules to `rules.ts` — they belong in `ai_model.constraints` and run automatically.

---

*If something feels like it needs FE-side translation logic, you're probably misreading the architecture. Read § 1 again, then ask the backend team. The pattern is: the FE renders what's declared; the agent dict accumulates whatever the user has touched; Python sorts it all out at request time.*
