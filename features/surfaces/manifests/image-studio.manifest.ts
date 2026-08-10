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
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import {
  IMAGE_FITS,
  IMAGE_POSITION_ANCHORS,
  LOSSLESS_OUTPUT_FORMAT,
  OUTPUT_FORMATS,
  OUTPUT_QUALITY_BOUNDS,
} from "@/features/image-studio/constants/conversion-options";
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
    name: "available_presets",
    label: "Available presets",
    description:
      "The studio's whole preset catalog — `{ id, name, width, height, category }` for every size preset the user can pick. THE vocabulary for `selected_presets`: the ids here are the only ones that target accepts. Always present and constant; it is a static catalog, not user state.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 5200,
    group: "studio_settings",
    sortOrder: 325,
  },
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

/**
 * Write half of the 360 loop — what an agent may stage into the converter.
 *
 * WHICH PRECEDENT WINS, and why. Two adopters bracket this surface:
 * `image-generate` folded its whole request into ONE object target
 * (`generation_request`) because its composite read twin said the fields were
 * one decision; `marketing-crawls` split its command into `crawl_options` plus
 * two SEPARATE pattern-list targets because the lists are the crawl's SCOPE
 * rather than its intensity. **Both win, on different halves of this surface**,
 * and the split falls exactly where marketing-crawls put it:
 *
 *   - `conversion_settings` follows image-generate. Format, quality,
 *     background fill, fit, and crop anchor are one "how should these come
 *     out" decision — the user sets them together in one Output-controls
 *     panel, and the surface already SAYS they are one thing:
 *     `studio_settings_summary` is a composite read twin of precisely this
 *     group. Five micro-targets would make the user confirm one coherent
 *     decision five times.
 *   - `selected_presets` stands ALONE, for the reason the crawl pattern lists
 *     do. Presets are the SCOPE of the run — WHICH outputs exist and how many
 *     variants get produced — not the intensity of the encoding. They are the
 *     choice a user most wants to read and approve on its own ("you're about
 *     to make 7 favicons") rather than buried in a settings blob; they are
 *     routinely set alone (pick a bundle, leave quality); they have their own
 *     exact 1:1 read twin in `selected_preset_ids`; and their semantics
 *     differ — a full-list REPLACE of catalog ids versus a partial key patch.
 *
 * Both are `mode: "draft"` in the literal sense image-generate used it: the
 * handler calls the SAME setters the user's own clicks call, so the value is
 * visible and editable the instant it lands. There is no Save bar because
 * nothing exists in a database yet — the settings shape the NEXT Generate.
 *
 * Both are structured (`object` / `array`) on purpose. The inline-tool layer
 * parses a JSON-looking argument before the handler sees it, so a string-typed
 * target could never receive raw JSON text; these accept the parsed structure
 * directly and the handler never re-parses.
 *
 * Neither handler reads page state to decide WHERE a value lands — one is a
 * full replace, the other sets each key independently — so staging both in a
 * single agent turn cannot resolve against a stale render closure. The one
 * piece of live state either consults is the in-flight guard, and that is read
 * through a ref for exactly that reason.
 *
 * WHAT IS NOT WRITABLE, on purpose:
 *  - **Source images.** Adding a file needs a `File` object with real bytes.
 *    No agent can produce one, and the studio's files are browser-local until
 *    saved. Nothing to declare.
 *  - **Generate.** Reasoned from scratch rather than copied, because the usual
 *    argument does not apply: unlike an image GENERATION this spends no model
 *    money — it is sharp work on our own backend. It still does not earn a
 *    target, for two costs that are specific to this page. First, Generate is
 *    DESTRUCTIVE to session work: it resets `variants: {}` on every file, so
 *    an agent firing it discards a batch the user may have just reviewed and
 *    not yet saved. Second, the shell deliberately interposes a human gate in
 *    front of it — the first click with auto-named files only raises the
 *    rename banner, because each file's name becomes the folder and the slug
 *    for every variant it produces. An agent-driven fire would route around a
 *    gate that exists precisely to stop unattended runs. So the ORDER vs FIRE
 *    line lands where `image-generate` and `marketing-site-media` drew it, for
 *    different reasons: the agent composes the command, the user commits it.
 *  - **Save to library / Download.** These write into the user's cloud files
 *    (public CDN URLs by default) or their disk. A human gesture, per both
 *    adopters that met this line before.
 *  - The generated OUTPUT — variant counts, output bytes, `last_save_result`.
 *    An agent writing those would be fabricating results the backend never
 *    produced.
 *  - `is_processing` / `is_saving` / `is_describing` — status the page owns.
 *  - **Per-file names and AI metadata**, though they are genuinely authored
 *    content an agent drafts well. Two things block them TODAY, and both are
 *    fixable later: this surface already has a dedicated path for them (the
 *    `image-studio-describe-01` shortcut writes `updateImageMetadata`), and
 *    there is no read twin to close the evidence loop — `source_files` carries
 *    only `metadata_status`, and files are addressable solely by a
 *    browser-local name. A target that cannot be verified from a read value,
 *    on rows with no durable id, is not one worth declaring yet.
 *
 * Vocabulary and bounds are interpolated from
 * `features/image-studio/constants/conversion-options.ts` — the same module
 * `ExportPanel` and `CropControls` render their buttons from and the handler
 * validates against, so the contract prose cannot drift from the controls.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "selected_presets",
    label: "Selected presets",
    description: [
      "Sets which size presets get produced for every source file on the next Generate — the same tiles the user ticks in the preset catalog.",
      "Value: an array of preset id strings, e.g. [\"og-image\", \"favicon-32\"].",
      "REPLACES THE FULL SET — include every preset you want kept, not just the new ones. Read selected_preset_ids for what is ticked right now, and available_presets for the ids that exist. An empty array clears the selection.",
      "An id that is not in the catalog is rejected by name — nothing is silently dropped.",
      "Staged only: no image is converted until the user presses Generate.",
    ].join(" "),
    valueType: "array",
    updatesValue: "selected_preset_ids",
    mode: "draft",
    applyPolicy: "ask",
    group: "studio_settings",
    sortOrder: 330,
  },
  {
    name: "conversion_settings",
    label: "Conversion settings",
    description: [
      "Sets the global output settings the next Generate will use — the same controls in the Output controls panel.",
      "Value: an object with AT LEAST ONE of { output_format, output_quality, background_color, resize_fit, resize_position }. Each key REPLACES that one setting; omit a key to leave the user's value exactly as it is (read studio_settings_summary first).",
      `output_format — one of: ${OUTPUT_FORMATS.join(" | ")}. Presets that pin their own format (favicons → PNG, avatars → WebP) keep theirs regardless.`,
      `output_quality — a whole number from ${OUTPUT_QUALITY_BOUNDS.min} to ${OUTPUT_QUALITY_BOUNDS.max}. Lower means smaller files. Ignored by ${LOSSLESS_OUTPUT_FORMAT}, which is always lossless.`,
      'background_color — a 6-digit hex string like "#ffffff", used to fill transparency when converting to a format without an alpha channel (JPEG, AVIF).',
      `resize_fit — how each image fills the preset frame, one of: ${IMAGE_FITS.join(" | ")}.`,
      `resize_position — the crop anchor, which only applies with the "cover" fit: one of ${IMAGE_POSITION_ANCHORS.join(" | ")}. "attention" and "entropy" let the encoder choose the region itself. A precise focal point can only be set by dragging the live preview, so it is not writable here.`,
      "Refused while a conversion is already running.",
      "Staged only: no image is converted until the user presses Generate.",
    ].join(" "),
    valueType: "object",
    updatesValue: "studio_settings_summary",
    mode: "draft",
    applyPolicy: "ask",
    group: "studio_settings",
    sortOrder: 365,
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

You can also SET UP the conversion for the user: selected_presets for WHICH
outputs get made (a full-list replace — read selected_preset_ids for what is
ticked and available_presets for the ids that exist), and conversion_settings
for HOW they are encoded (format, quality, transparent fill, fit, crop anchor).
Both only stage the form. The user presses Generate, because Generate discards
whatever variants are already in the session and the page deliberately asks
them to name their files first. Saving to their library and downloading stay
theirs too.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

export interface StudioPresetCatalogEntry {
  id: string;
  name: string;
  width: number;
  height: number;
  category: string;
}

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
  available_presets: StudioPresetCatalogEntry[];
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
