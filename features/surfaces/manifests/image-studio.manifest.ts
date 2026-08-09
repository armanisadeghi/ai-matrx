/**
 * Surface manifest — Image Studio (`matrx-user/image-studio`).
 *
 * The batch preset converter (`/images/convert`, rendered by
 * `features/image-studio/components/ImageStudioShell.tsx`; the static
 * `/images/studio` landing routes here too). The user drops source images,
 * picks presets/bundles, tunes format + quality + background + fit, generates
 * every variant server-side, and saves the results to their cloud library.
 * The AI Describe action (per file or all files) runs the
 * `image-studio-describe-01` shortcut against a temp preview upload.
 *
 * Emitter: `ImageStudioShell` mounts `<SurfaceRuntimeProvider>` and builds
 * the scope from `useImageStudio` state at trigger time. Source files are
 * browser-local (`File` objects + object URLs) until saved, so this surface
 * identifies them by name/slug — durable `cld_files` ids exist only after
 * "Save to library" (reported in `last_save_result`).
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
    key: "studio_sources",
    label: "Source images",
    sortOrder: 100,
    description:
      "The images the user has dropped into the studio, still browser-local until saved.",
  },
  {
    key: "studio_settings",
    label: "Conversion settings",
    sortOrder: 200,
    description:
      "Selected presets and the global format / quality / background / crop overrides.",
  },
  {
    key: "studio_output",
    label: "Generated output",
    sortOrder: 300,
    description: "Variant counts, output size, and the last save-to-library result.",
  },
  {
    key: "studio_activity",
    label: "Activity",
    sortOrder: 400,
    description: "In-flight processing, saving, and AI-describe work.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Source images (300-329) ───────────────────────────────────────────
  {
    name: "source_file_count",
    label: "Source file count",
    description:
      "Number of images the user has dropped into the studio. Always present; zero on an empty workspace.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    group: "studio_sources",
    sortOrder: 300,
  },
  {
    name: "source_files",
    label: "Source files",
    description:
      "Array of `{ name, filename_base, mime_type, size, width, height, status, variant_count, metadata_status }` for every dropped image, capped at 50 entries. Files are browser-local — no cloud file id exists until the user saves. Empty array on an empty workspace.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 1500,
    group: "studio_sources",
    sortOrder: 305,
  },

  // ── Conversion settings (330-369) ─────────────────────────────────────
  {
    name: "selected_preset_ids",
    label: "Selected preset IDs",
    description:
      "Array of preset ids (e.g. `og-image`, `favicon-32`) applied to every source file on Generate. Empty array when nothing is selected.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 200,
    group: "studio_settings",
    sortOrder: 330,
  },
  {
    name: "selected_preset_count",
    label: "Selected preset count",
    description:
      "Number of selected presets. Always present; zero when nothing is selected.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    group: "studio_settings",
    sortOrder: 335,
  },
  {
    name: "output_format",
    label: "Output format",
    description:
      'Global output format for generated variants: "webp", "avif", "jpeg", or "png". Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 4,
    group: "studio_settings",
    sortOrder: 340,
  },
  {
    name: "output_quality",
    label: "Output quality",
    description:
      "Global encode quality 30-100 for lossy formats. Always present (PNG ignores it).",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    group: "studio_settings",
    sortOrder: 345,
  },
  {
    name: "background_color",
    label: "Background color",
    description:
      "Hex fill color used when flattening transparency into JPEG/AVIF output. Always present.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 7,
    group: "studio_settings",
    sortOrder: 350,
  },
  {
    name: "resize_fit",
    label: "Resize fit",
    description:
      'How images fill each preset frame: "cover" (crop) or "contain" (letterbox). Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 7,
    group: "studio_settings",
    sortOrder: 355,
  },
  {
    name: "resize_position",
    label: "Crop anchor",
    description:
      'Crop anchor used with cover fit: a named anchor (e.g. "center", "top") or a precise focal point serialized as "focal x%,y%". Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 6,
    group: "studio_settings",
    sortOrder: 360,
  },
  {
    name: "studio_settings_summary",
    label: "Settings summary",
    description:
      "Composite object of everything shaping the next Generate: `{ selected_preset_ids, output_format, output_quality, background_color, resize_fit, resize_position }`. Always present.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 300,
    group: "studio_settings",
    sortOrder: 365,
  },

  // ── Generated output (370-399) ────────────────────────────────────────
  {
    name: "total_variant_count",
    label: "Planned variant count",
    description:
      "Files × selected presets — how many variants the next Generate will produce. Always present; zero when files or presets are missing.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    group: "studio_output",
    sortOrder: 370,
  },
  {
    name: "generated_variant_count",
    label: "Generated variant count",
    description:
      "Number of variants already produced in this session across all files. Always present; zero before the first Generate.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    group: "studio_output",
    sortOrder: 375,
  },
  {
    name: "total_output_bytes",
    label: "Total output bytes",
    description:
      "Combined byte size of every generated variant. Always present; zero before the first Generate.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 9,
    group: "studio_output",
    sortOrder: 380,
  },
  {
    name: "last_save_result",
    label: "Last save result",
    description:
      "Result of the most recent Save to library: `{ folder_path, saved_count, failed_filenames }`. Absent until the user saves in this session.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 150,
    group: "studio_output",
    sortOrder: 385,
  },
  {
    name: "studio_error",
    label: "Studio error",
    description:
      "Human-readable message from the last failed Generate or Save. Absent when the last operation succeeded.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    group: "studio_output",
    sortOrder: 390,
  },

  // ── Activity (400-419) ────────────────────────────────────────────────
  {
    name: "is_processing",
    label: "Generating variants",
    description:
      "True while the server is producing variants for the dropped files. Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "studio_activity",
    sortOrder: 400,
  },
  {
    name: "is_saving",
    label: "Saving to library",
    description:
      "True while generated variants are being uploaded to the user's cloud library. Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "studio_activity",
    sortOrder: 405,
  },
  {
    name: "is_describing",
    label: "AI describe running",
    description:
      "True while the AI Describe agent is generating metadata for one or more files. Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "studio_activity",
    sortOrder: 410,
  },
];

export const IMAGE_STUDIO_SURFACE_NAME = "matrx-user/image-studio";

export const imageStudioManifest: SurfaceManifest = {
  surfaceName: IMAGE_STUDIO_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Manifest + ImageStudioShell emitter + describe-shortcut surfaceName wired. Remaining: no `data-surface-value` anchors, EmbeddedImageStudio mounts no provider, and no live non-matching-name binding test.",
  label: "Image Studio",
  urlPattern: "/images/convert",
  intro: `<surface_intro>
The user is in the Image Studio batch converter. They drop one or more images
(browser-local files — not yet in their cloud library), select size presets or
curated bundles, tune the global format / quality / background / crop settings,
click Generate to produce every variant server-side, and finally save the
variants to their cloud library. An AI Describe action generates filenames,
alt text, and captions per image.

Read the values in three layers:
  1. WHAT the user brought — source_file_count / source_files (identified by
     name and slug; no cloud file ids exist until save).
  2. HOW it will be converted — studio_settings_summary and its constituent
     fields.
  3. WHAT came out — total/generated variant counts, total_output_bytes, and
     last_save_result (the durable folder + saved count after a save).

Source files are NOT durable cloud records while on this surface. Only after
"Save to library" do variants get cld_files rows; last_save_result tells you
where they landed. Never invent file ids for unsaved studio files.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
};

export interface StudioSourceFileSummary {
  name: string;
  filename_base: string;
  mime_type: string;
  size: number;
  width: number | null;
  height: number | null;
  status: string;
  variant_count: number;
  metadata_status: string;
}

export interface StudioLastSaveResult {
  folder_path: string;
  saved_count: number;
  failed_filenames: string[];
}

/**
 * Scope builder for `matrx-user/image-studio`.
 *
 * Required (no `?`) keys mirror every `alwaysAvailable: true` value — the
 * studio writes them on every launch regardless of UI state.
 */
export function createImageStudioScope(values: {
  selection?: string;
  context?: Record<string, unknown>;

  // Source images
  source_file_count: number;
  source_files: StudioSourceFileSummary[];

  // Conversion settings
  selected_preset_ids: string[];
  selected_preset_count: number;
  output_format: string;
  output_quality: number;
  background_color: string;
  resize_fit: string;
  resize_position: string;
  studio_settings_summary: Record<string, unknown>;

  // Generated output
  total_variant_count: number;
  generated_variant_count: number;
  total_output_bytes: number;
  last_save_result?: StudioLastSaveResult;
  studio_error?: string;

  // Activity
  is_processing: boolean;
  is_saving: boolean;
  is_describing: boolean;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
