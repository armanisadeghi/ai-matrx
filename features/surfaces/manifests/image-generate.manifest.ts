/**
 * Surface manifest — Image Generate (`matrx-user/image-generate`).
 *
 * Text-to-image generation (`/images/generate`, rendered by
 * `app/(core)/images/generate/GenerateShellClient.tsx`; the `/images/ai-generate`
 * coming-soon hero routes here too). The user types a prompt, picks a size and
 * count, optionally a style, and generates images via the Python
 * `/images/generate` endpoint — every result is a persisted `cld_files` row
 * with click-throughs to Edit / Annotate / Avatar.
 *
 * Emitter: `GenerateShellClient` mounts `<SurfaceRuntimeProvider>` and builds
 * the scope from its live form + results state.
 *
 * FILE DOCTRINE: results are identified by durable `cloud_file_id` UUIDs only
 * — never a signed URL. Agents resolve bytes through the platform file
 * handler from those ids.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import {
  IMAGE_GENERATE_MAX_COUNT,
  IMAGE_GENERATE_MIN_COUNT,
  IMAGE_GENERATE_SIZES,
} from "@/features/image-studio/constants/generation-options";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "generation_request",
    label: "Generation request",
    sortOrder: 100,
    description: "The prompt, style, size, and count shaping the next Generate.",
  },
  {
    key: "generation_results",
    label: "Generated results",
    sortOrder: 200,
    description: "The persisted image files produced by the last Generate.",
  },
  {
    key: "generation_status",
    label: "Status",
    sortOrder: 300,
    description: "In-flight state and backend capability.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Generation request (300-329) ──────────────────────────────────────
  {
    name: "prompt",
    label: "Image prompt",
    description:
      "The text prompt describing the image to generate. Always present; empty string when the user has not typed yet.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 150,
    group: "generation_request",
    sortOrder: 300,
  },
  {
    name: "style",
    label: "Style hint",
    description:
      'Optional free-text style modifier (e.g. "editorial illustration"). Absent when the user left it blank.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    group: "generation_request",
    sortOrder: 305,
  },
  {
    name: "image_size",
    label: "Image size",
    description:
      'Aspect selection for generated images: "square", "portrait", "landscape", "wide", or "tall". Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 9,
    group: "generation_request",
    sortOrder: 310,
  },
  {
    name: "image_count",
    label: "Image count",
    description: "How many images the next Generate produces (1-4). Always present.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 1,
    group: "generation_request",
    sortOrder: 315,
  },
  {
    name: "generation_request_summary",
    label: "Request summary",
    description:
      "Composite object of the full request: `{ prompt, style, image_size, image_count }`. Always present.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 220,
    group: "generation_request",
    sortOrder: 320,
  },

  // ── Generated results (330-359) ───────────────────────────────────────
  {
    name: "result_count",
    label: "Result count",
    description:
      "Number of images produced by the last Generate in this session. Always present; zero before the first run.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 1,
    group: "generation_results",
    sortOrder: 330,
  },
  {
    name: "result_file_ids",
    label: "Result file IDs",
    description:
      "Array of `cld_files` UUIDs for the generated images, in display order. THE durable references — resolve bytes from these. Empty array before the first run.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 160,
    group: "generation_results",
    sortOrder: 335,
  },

  // ── Status (360-379) ──────────────────────────────────────────────────
  {
    name: "is_generating",
    label: "Generation running",
    description: "True while a Generate request is in flight. Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "generation_status",
    sortOrder: 360,
  },
  {
    name: "generation_enabled",
    label: "Generation enabled",
    description:
      "True when the Python generate endpoint is live for this build (backend capability flag). False renders the coming-soon state. Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "generation_status",
    sortOrder: 365,
  },
];

/**
 * Write half of the 360 loop — what an agent may put into the request form.
 *
 * JUDGMENT BAR, applied honestly. This surface has exactly four inputs, and
 * the one that matters is `prompt`: turning "something for the homepage" into
 * a real image prompt is the textbook YES case — authored content an agent
 * drafts better and faster than the user will. `style` is the same kind of
 * writing one field over. `image_size` is genuinely derivable from the intent
 * ("a hero banner" → landscape/wide), and `image_count` is a plain "give me 3
 * variations". Nothing here is identity, ownership, or destructive.
 *
 * ONE object target, not four. These four fields are not four decisions —
 * they are ONE request the user composes in a single thought, and the surface
 * already says so: `generation_request_summary` is literally the composite
 * read twin of exactly this object. Per the `surface-write-targets` trap
 * ("multiple values in one field object beat five micro-targets when they're
 * edited together"), one target also means ONE confirm dialog for one request
 * instead of four in a row. Every key is OPTIONAL and partial — writing only
 * `{image_size}` leaves a prompt the user typed untouched — so the granularity
 * of separate targets is kept without the dialog spam. The cost, stated
 * plainly: the user accepts or declines the object as a whole and cannot keep
 * the new prompt while rejecting the new size. That trade is worth it here
 * because the fields are re-derived together anyway; on a surface where they
 * were independent decisions with different consumers, it would not be.
 *
 * `mode: "draft"` in the literal sense — the handler calls the SAME `useState`
 * setters the user's own typing calls, so the value is visible and editable
 * the instant it lands. There is no Save bar because nothing exists in the
 * database yet.
 *
 * WHAT IS NOT WRITABLE, on purpose:
 *  - **Generate.** Following the `podcast-studio` precedent: starting a run
 *    spends real money on image models, so the human press stays the gate.
 *    An agent may fill the form; only the user commits it.
 *  - The generated results — `result_file_ids` / `result_count` are the
 *    record of what the backend actually produced. An agent writing them
 *    would be fabricating output.
 *  - `is_generating` / `generation_enabled` — status the page owns, not
 *    settings. (The handler REFUSES while `is_generating` is true rather
 *    than editing a form whose request is already in flight.)
 *  - Anything about saved files, folders, or file identity — results are
 *    persisted `cld_files` rows and belong to the files surfaces.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "generation_request",
    label: "Generation request",
    description:
      "Stages the next image request into the form the user is looking at. NOTHING is generated and nothing is spent — the user still presses Generate. " +
      "Value: an object with AT LEAST ONE of `{ prompt, style, image_size, image_count }`. Each key REPLACES that one field; omit a key to leave it exactly as the user left it (read `generation_request_summary` first if you mean to extend rather than replace). " +
      "`prompt` — the free-text description of the image to generate; a non-empty string. " +
      '`style` — a free-text style modifier such as "editorial illustration"; pass an empty string to clear it. ' +
      `\`image_size\` — the aspect, one of: ${IMAGE_GENERATE_SIZES.join(" | ")}. ` +
      `\`image_count\` — how many images one Generate produces; a whole number from ${IMAGE_GENERATE_MIN_COUNT} to ${IMAGE_GENERATE_MAX_COUNT}. Only change it when the user asked for a specific number of variations. ` +
      "Refused while a generation is already in flight.",
    valueType: "object",
    updatesValue: "generation_request_summary",
    mode: "draft",
    applyPolicy: "ask",
    group: "generation_request",
    sortOrder: 300,
  },
];

export const IMAGE_GENERATE_SURFACE_NAME = "matrx-user/image-generate";

export const imageGenerateManifest: SurfaceManifest = {
  surfaceName: IMAGE_GENERATE_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Manifest + GenerateShellClient emitter wired. Remaining: /images/ai-generate hero mounts no provider (placeholder page), no `data-surface-value` anchors, no live non-matching-name binding test.",
  label: "Image Generate",
  urlPattern: "/images/generate",
  intro: `<surface_intro>
The user is generating images from text. A prompt box, an optional style hint,
an aspect-size selector, and a count (1-4) feed the platform's image
generation endpoint; results appear as tiles the user can take into Edit,
Annotate, or Avatar mode. Every result is already saved to their cloud
library.

Read generation_request_summary for what the user is asking for — helping
sharpen a prompt is the most valuable thing an agent can do here, especially
when prompt is empty or vague, and the generation_request write target lets
you put that sharpened request straight into the form. Filling the form is
never the same as running it: pressing Generate spends real money on image
models and stays the user's move. result_file_ids are durable cloud file UUIDs;
resolve image bytes from those ids, never from URLs. generation_enabled false
means the backend endpoint has not shipped for this build — the user can
still draft prompts.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

/**
 * Scope builder for `matrx-user/image-generate`.
 *
 * Required (no `?`) keys mirror every `alwaysAvailable: true` value.
 */
export function createImageGenerateScope(values: {
  selection?: string;
  context?: Record<string, unknown>;

  // Generation request
  prompt: string;
  style?: string;
  image_size: string;
  image_count: number;
  generation_request_summary: Record<string, unknown>;

  // Generated results
  result_count: number;
  result_file_ids: string[];

  // Status
  is_generating: boolean;
  generation_enabled: boolean;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
