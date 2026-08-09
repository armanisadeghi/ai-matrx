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
} from "@/features/surfaces/types";
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
when prompt is empty or vague. result_file_ids are durable cloud file UUIDs;
resolve image bytes from those ids, never from URLs. generation_enabled false
means the backend endpoint has not shipped for this build — the user can
still draft prompts.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
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
