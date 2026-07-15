# Image Studio — AI Agents & Python Endpoints

This is the master list of AI integrations for the new Image Studio (Edit, Annotate, Avatar modes + the existing Convert mode). It is split into two sections:

- **Section A — LLM Agents (shortcut-driven).** Vision/text reasoning agents that return structured JSON. They go through the standard agent-shortcut system (database row + `system-shortcuts.ts` registry + `useShortcutTrigger`). Each entry below tells the shortcut author exactly what prompt to write and what variables/output shape to enforce.
- **Section B — Direct Python Endpoints.** Pure model invocations (image generation, BG removal, upscale, etc.). No LLM reasoning — fixed inputs, fixed outputs. Implemented as REST proxies to the existing AIDREAM/FastAPI backend.

Every output that produces an image returns a `cloud_file_id` from the `cloud_files` table. The front end already knows how to render and share those — no new storage code, no new download path.

---

## How agents are referenced from app code

```ts
import { getSystemShortcut } from "@/features/agents/constants/system-shortcuts";
const SHORTCUT = getSystemShortcut("image-suggest-edits-01");

const trigger = useShortcutTrigger();
await trigger(SHORTCUT.id, {
  scope: {/* image resource + intent */},
  runtime: { userInput: hint },
  sourceFeature: "image-studio",
  onConversationCreated: setConversationId,
});
```

The image is attached via the existing instance-resource path (same as the describe flow). The agent reads it as an attachment; the response is JSON inside a single `\`\`\`json`fence;`jsonExtraction` lives on the shortcut row so the launch thunk extracts automatically.

---

## Section A — LLM Agents (Shortcuts)

### 1. `image-describe` _(EXISTS — `image-studio-describe-01`)_

Already shipped. Vision agent that produces image metadata (filename, alt-text, caption, title, description, keywords, dominant colors). Used in Convert mode after upload.

**No work required. Listed here so the agent author can see how the new agents extend the same pattern.**

| Variable       | Source                                   | Required |
| -------------- | ---------------------------------------- | -------- |
| Image resource | instance resource (`blockType: "image"`) | Yes      |
| Context hint   | `runtime.userInput`                      | Optional |

**Response shape:**

```json
{
  "image_metadata": {
    "filename_base": "string",
    "alt_text": "string",
    "caption": "string",
    "title": "string",
    "description": "string",
    "keywords": ["string"],
    "dominant_colors": [{ "hex": "#RRGGBB", "name": "string" }]
  }
}
```

---

### 2. `image-suggest-edits`

**Purpose.** The "AI assist" button in Edit mode. Looks at an image and returns a ranked list of edits the user is most likely to want, with reasons.

**Core instruction (prompt).**

> You are an image-editing assistant. Look at the attached image and the optional purpose. Return a JSON array of 3–6 specific edit suggestions ranked by likely user intent. Each suggestion must be one of these operation types: `crop`, `rotate`, `exposure`, `contrast`, `saturation`, `warmth`, `sharpen`, `blur`, `bg_remove`, `upscale`, `inpaint`. Keep reasons under 12 words. Do not suggest more than one of the same op type.

**Variables.**

| Variable  | Carrier                                                               | Notes                         |
| --------- | --------------------------------------------------------------------- | ----------------------------- |
| `image`   | instance resource                                                     | Required                      |
| `purpose` | scope (`avatar` \| `cover` \| `article` \| `screenshot` \| `general`) | Optional. Bias toward intent. |

**Response shape.**

```json
{
  "suggestions": [
    {
      "op": "crop",
      "params": { "aspect": "1:1" },
      "reason": "Avatar needs square crop"
    },
    { "op": "exposure", "params": { "value": 0.3 }, "reason": "Underexposed" }
  ]
}
```

---

### 3. `smart-crop`

**Purpose.** Picks the best crop bbox for a target intent. Powers Avatar mode's "Smart crop" button and the Edit-mode crop tool's "Auto" suggestion.

**Core instruction.**

> Look at the image and choose the single best crop for the intent. Return one bounding box in NORMALIZED 0–1 coordinates `{ x, y, width, height }` plus a one-sentence rationale. Prioritize: faces for `avatar`, focal subject for `cover`, rule-of-thirds for `hero`, centered subject for `square`. Do not crop outside the image.

**Variables.**

| Variable | Carrier           | Notes                                                              |
| -------- | ----------------- | ------------------------------------------------------------------ |
| `image`  | instance resource | Required                                                           |
| `intent` | scope             | One of `avatar`, `cover`, `hero`, `square`, `thumbnail`. Required. |
| `aspect` | scope             | Optional override, e.g. `"3:1"`.                                   |

**Response shape.**

```json
{
  "crop": {
    "x": 0.12,
    "y": 0.05,
    "width": 0.65,
    "height": 0.65,
    "rationale": "Centered on face, leaves headroom"
  }
}
```

---

### 4. `annotate-suggest`

**Purpose.** In Annotate mode, looks at a screenshot and suggests where arrows, callouts, and labels should go.

**Core instruction.**

> You are annotating a screenshot to make it instructional. Identify the most important UI elements or regions. Return a JSON array of 2–6 annotations. Each annotation has a type (`arrow`, `callout`, `highlight`, `box`), a normalized bbox `{ x, y, width, height }` (0–1), and a label under 6 words. Prefer fewer, higher-impact annotations.

**Variables.**

| Variable | Carrier           | Notes                                                    |
| -------- | ----------------- | -------------------------------------------------------- |
| `image`  | instance resource | Required                                                 |
| `intent` | scope             | Optional. e.g. `"explain a feature"`, `"highlight bug"`. |

**Response shape.**

```json
{
  "annotations": [
    {
      "type": "arrow",
      "bbox": { "x": 0.7, "y": 0.2, "width": 0.1, "height": 0.05 },
      "label": "Save button"
    },
    {
      "type": "callout",
      "bbox": { "x": 0.1, "y": 0.6, "width": 0.3, "height": 0.1 },
      "label": "Total updates here"
    }
  ]
}
```

---

### 5. `redact-detect`

**Purpose.** Privacy helper. Finds PII and sensitive regions in a screenshot. Powers a one-click "Redact PII" button in Annotate mode.

**Core instruction.**

> Find regions that contain personally identifiable information or sensitive data: faces, full names, email addresses, phone numbers, physical addresses, credit-card numbers, account numbers, API keys/tokens, license plates. Return a JSON array of regions. Each region has a normalized bbox `{ x, y, width, height }` and a `kind` (one of: `face`, `name`, `email`, `phone`, `address`, `card`, `account`, `token`, `plate`, `other`). Be conservative — only flag regions you are highly confident about.

**Variables.**

| Variable      | Carrier           | Notes                                                      |
| ------------- | ----------------- | ---------------------------------------------------------- |
| `image`       | instance resource | Required                                                   |
| `sensitivity` | scope             | `"strict"` \| `"normal"` \| `"loose"`. Default `"normal"`. |

**Response shape.**

```json
{
  "regions": [
    {
      "bbox": { "x": 0.1, "y": 0.05, "width": 0.2, "height": 0.04 },
      "kind": "email"
    },
    {
      "bbox": { "x": 0.4, "y": 0.6, "width": 0.15, "height": 0.15 },
      "kind": "face"
    }
  ]
}
```

---

### 6. `prompt-from-article`

**Purpose.** Reads an article body and returns an image-generation prompt for a cover image. Powers a "Generate cover from article" entry point in Notes.

**Core instruction.**

> You write image-generation prompts. Read the article and return ONE prompt that captures its core idea visually. The prompt must: be 30–60 words, name a clear subject, specify mood and color palette, avoid text-in-image, and end with style guidance ("photorealistic", "editorial illustration", "minimalist vector", etc.). Also return 3 short alternative angles.

**Variables.**

| Variable  | Carrier           | Notes                                                    |
| --------- | ----------------- | -------------------------------------------------------- |
| `article` | scope (`content`) | Required. Article body.                                  |
| `style`   | scope             | Optional. e.g. `"editorial"`, `"minimalist"`, `"photo"`. |

**Response shape.**

```json
{
  "prompt": "...",
  "alternatives": ["...", "...", "..."],
  "suggested_aspect": "16:9"
}
```

---

### 7. `caption-context`

**Purpose.** Generates a caption for an image given the article it sits inside. Different from `image-describe` — this is context-aware and reads the surrounding text.

**Core instruction.**

> Write a single caption (under 20 words) for the attached image as it would appear inside the given article. The caption should reference the article's topic, not just describe the image generically. No quotes, no period at the end if it's a fragment.

**Variables.**

| Variable  | Carrier           | Notes                                                                    |
| --------- | ----------------- | ------------------------------------------------------------------------ |
| `image`   | instance resource | Required                                                                 |
| `article` | scope (`content`) | Required. Surrounding article text.                                      |
| `tone`    | scope             | Optional. `"neutral"` \| `"playful"` \| `"formal"`. Default `"neutral"`. |

**Response shape.**

```json
{ "caption": "string" }
```

---

### 8. `suggest-filters`

**Purpose.** Recommends 1–3 filter presets for the image given its content and intended use.

**Core instruction.**

> Pick 1–3 filter presets that would suit this image for the given purpose. Choose from this exact list: `none`, `bright`, `moody`, `warm`, `cool`, `vintage`, `bw`, `high-contrast`, `soft`, `punch`. Return them ordered best-first. Reason must be under 10 words each.

**Variables.**

| Variable  | Carrier           | Notes                                                   |
| --------- | ----------------- | ------------------------------------------------------- |
| `image`   | instance resource | Required                                                |
| `purpose` | scope             | Optional. `avatar` \| `cover` \| `article` \| `social`. |

**Response shape.**

```json
{
  "filters": [
    { "id": "warm", "reason": "Skin tones look pale" },
    { "id": "punch", "reason": "Adds dimension" }
  ]
}
```

---

### 9. `suggest-image-spots`

**Purpose.** Reads an article body and points at where images would help. Used by the Notes editor's "Suggest images" command.

**Core instruction.**

> Read the article and identify 2–5 places where adding an image would most help the reader. For each, return: a `location` (a short verbatim quote from the article that the image should sit after — exact substring), a `purpose` (one of `hero`, `illustrate-concept`, `data-viz`, `process-step`, `quote-card`), and a one-line `prompt` for what the image should depict.

**Variables.**

| Variable  | Carrier           | Notes     |
| --------- | ----------------- | --------- |
| `article` | scope (`content`) | Required. |

**Response shape.**

```json
{
  "spots": [
    {
      "location": "Step 1 — preheat the oven to 400°F.",
      "purpose": "process-step",
      "prompt": "Top-down shot of an oven dial set to 400°F"
    },
    {
      "location": "the result was striking",
      "purpose": "illustrate-concept",
      "prompt": "..."
    }
  ]
}
```

---

## Section B — Direct Python Endpoints

These are NOT agents. They're thin Next.js API routes that proxy to the AIDREAM Python backend, using the same auth + envelope pattern as `features/files/`. Output is always a `cloud_file_id`. Front-end calls them via small typed clients in `features/image-studio/api/`.

> **Deployment gate (verified 2026-07-15):** `/images/generate`, `/images/face-detect`, `/images/edit-by-prompt`, and `/images/suggest-edits` are not present in aidream's deployed router. Their clients remain as future contracts, while `constants/backend-capabilities.ts` keeps every corresponding user action disabled or absent. Flip a capability only after the deployed OpenAPI contract contains the route.

| Next.js route                                      | Python endpoint               | Inputs                              | Output                       | Backing model(s)            |
| -------------------------------------------------- | ----------------------------- | ----------------------------------- | ---------------------------- | --------------------------- |
| `POST /api/images/python/generate`                 | `POST /images/generate`       | `{ prompt, size?, style?, count? }` | `{ files: cloud_file_id[] }` | gpt-image-1, Flux, SDXL     |
| `POST /api/images/python/edit`                     | `POST /images/edit`           | `{ source_id, prompt, mask_id? }`   | `{ file: cloud_file_id }`    | gpt-image-1 edit, Flux Fill |
| `POST /api/images/python/inpaint`                  | `POST /images/inpaint`        | `{ source_id, mask_id, prompt }`    | `{ file: cloud_file_id }`    | Flux Fill, SDXL Inpaint     |
| `POST /api/images/python/bg-remove`                | `POST /images/bg-remove`      | `{ source_id }`                     | `{ file: cloud_file_id }`    | rembg, BiRefNet             |
| `POST /api/images/python/upscale`                  | `POST /images/upscale`        | `{ source_id, factor: 2 \| 4 }`     | `{ file: cloud_file_id }`    | Real-ESRGAN                 |
| `POST /api/images/python/variants`                 | `POST /images/variants`       | `{ source_id, count, strength? }`   | `{ files: cloud_file_id[] }` | image-to-image              |
| `POST /api/images/python/face-detect`              | `POST /images/face-detect`    | `{ source_id }`                     | `{ faces: bbox[] }`          | mediapipe, OpenCV           |
| `POST /api/images/python/style-transfer` _(later)_ | `POST /images/style-transfer` | `{ source_id, style }`              | `{ file: cloud_file_id }`    | style-transfer model        |

**Standard envelope (NDJSON streaming):**

```ts
{ status: "queued" | "running" | "done" | "error",
  progress?: number,                           // 0–1
  result?: { /* per-endpoint payload above */ },
  error?: { code: string, message: string } }
```

Front end uses the same NDJSON-buffer pattern as `useScraperApi` / `usePdfExtractor`.

---

## Where each integration shows up in the UI

| Surface                        | Calls                                                                                                                                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Edit mode toolbar**          | `image-suggest-edits` (✨ AI button), `smart-crop` (Auto crop), `suggest-filters`, `bg-remove`, `upscale`, `image-edit` (instruction box), `image-inpaint` (with mask drawn in Filerobot) |
| **Avatar mode**                | `smart-crop` (Smart crop button), `face-detect` (auto-center), `bg-remove` (one-click clean background)                                                                                   |
| **Annotate mode**              | `annotate-suggest` (✨ Suggest annotations), `redact-detect` (Redact PII), `face-detect` (Blur faces)                                                                                     |
| **Convert mode** _(existing)_  | `image-describe` (already shipped)                                                                                                                                                        |
| **Generate (new entry point)** | `image-generate` direct endpoint                                                                                                                                                          |
| **Notes editor**               | `suggest-image-spots` (✨ Suggest images), `prompt-from-article` (Generate cover), `caption-context` (after image insert)                                                                 |

---

## Implementation order

Build the UI surfaces with stubs first; light up AI features as each shortcut/endpoint ships. Nothing in Section A or B blocks the editor from being usable.

1. **Editor + modes ship without AI** — Filerobot, marker.js 2, avatar crop. Manual everything works.
2. **Wave 1 — Python endpoints** (highest user value, lowest model cost): `bg-remove`, `upscale`, `generate`. Ship the routes + UI buttons together.
3. **Wave 2 — Smart agents**: `smart-crop`, `image-suggest-edits`, `annotate-suggest`. Each is one DB row + one UI button.
4. **Wave 3 — Privacy + editorial**: `redact-detect`, `face-detect`, `suggest-filters`.
5. **Wave 4 — Notes integration**: `suggest-image-spots`, `prompt-from-article`, `caption-context`.

Every agent above is single-purpose and short-prompted on purpose — modern vision models can hold the whole instruction in one breath. Keep them that way; do not let prompts grow.

---

## Registry entries to add

Add these to `features/agents/constants/system-shortcuts.ts` once the DB rows exist (one per shortcut). Keys follow the existing naming convention.

```ts
"image-suggest-edits-01";
"image-smart-crop-01";
"image-annotate-suggest-01";
"image-redact-detect-01";
"image-prompt-from-article-01";
"image-caption-context-01";
"image-suggest-filters-01";
"image-suggest-image-spots-01";
```

Each entry needs `id` (from DB), `feature: "image-studio"` (or `"notes"` for the article-related ones), and a one-line `description`. None should need `temporaryConfigs.jsonExtraction` — the new shortcut row schema carries `json_extraction`, and these are all JSON-output shortcuts that the launch thunk will extract automatically.
