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
  CROPPING_IMAGE_FIT,
  IMAGE_FIT_OPTIONS,
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
      "Array of `{ name, filename_base, mime_type, size, width, height, status, variant_count, metadata_status, alt_text, caption, title, description, keywords, dominant_colors }` for every dropped image, capped at 50 entries. The last six are the authored description fields — empty strings / empty arrays until Describe with AI runs or an agent writes `image_description`, whose read twin this is; read them before writing so you extend rather than clobber. Files are browser-local — no cloud file id exists until the user saves, so `name` and `filename_base` are how a file is addressed. Empty array on an empty workspace.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 2600,
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
    description: `How images fill each preset frame: ${IMAGE_FIT_OPTIONS.map(
      (o) => `"${o.id}" (${o.blurb})`,
    ).join(" ")} Always present.`,
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
 *  - **Running Describe with AI.** The shortcut is a COMMIT like Generate and
 *    Save: it spends a model call and uploads a preview into the user's cloud
 *    library. An agent that wants the metadata written should author it
 *    directly through `image_description` — which is the whole point of that
 *    target — rather than press the user's button.
 *  - **`dominant_colors`**, even though it sits in the same `ImageMetadata`
 *    object as the text fields and the describe shortcut fills it in. Those
 *    hex codes are MEASURED off the pixels by a model that can see the image;
 *    an agent reading only this scope would be inventing swatches, so the
 *    handler rejects the key BY NAME rather than letting it through with the
 *    prose. The one field in the group that is observed, not authored.
 *  - **The precise focal POINT.** `resize_position` accepts a named anchor or
 *    a dragged `focal x%,y%` point; only the named anchors are writable, per
 *    `conversion_settings` above.
 *
 * `image_description` WAS on this list until 2026-08-12, blocked on the one
 * thing that actually mattered: there was no read twin, so a write could not
 * be verified from a read value. That is now fixed rather than waived —
 * `source_files` carries the six authored fields, so an agent reads what is
 * there before writing what is missing. The OTHER half of that old objection
 * turned out to argue the opposite way: the existence of the describe
 * shortcut is not a reason to withhold the target, because pressing it is a
 * commit and writing the text is not.
 *
 * PER-FILE ADDRESSING — the rule the third target adds. `image_description` is
 * the only target here whose value must say WHICH row it lands on, and studio
 * sources have no durable id until "Save to library" mints one. So it carries
 * `file`, matched case-insensitively against the `name` / `filename_base` the
 * surface already reports, resolved against LIVE state through a ref, and
 * throwing with the real filenames listed on a miss or a tie. The ref is not
 * belt-and-braces: unlike the two conversion targets, this handler DOES read
 * page state to decide where a value lands, an agent will legitimately call it
 * once per image in a single turn, the seam resolves every closure before the
 * first dialog is confirmed, and a `filename_base` write renames the very
 * string the next lookup matches on.
 *
 * Vocabulary and bounds are interpolated from
 * `features/image-studio/constants/conversion-options.ts` — the same module
 * `ExportPanel` and `CropControls` render their buttons from and the handler
 * validates against, so the contract prose cannot drift from the controls.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "image_description",
    label: "Image description",
    description: [
      "Writes the authored description fields for ONE source image into the Metadata panel on that image's card — the same inputs the user edits by hand after Describe with AI.",
      "Value: an object with `file` PLUS at least one content key: { file, alt_text?, caption?, title?, description?, keywords?, filename_base? }.",
      "file — WHICH image, given as the `name` or `filename_base` of an entry in source_files. Matched case-insensitively; rejected if it matches nothing or more than one. Call this target once per image.",
      "alt_text — the accessibility description a screen reader reads. caption — a short caption for social posts. title — the page / OG title. description — the SEO meta description.",
      "Those four are PLAIN TEXT, not JSON and not a JSON-encoded string; pass an empty string to clear one.",
      "keywords — an array of plain strings that REPLACES the whole keyword list. Read the file's keywords in source_files first if you mean to extend it rather than replace it.",
      "filename_base — the slug stem of every generated variant's filename; it is slugified on the way in.",
      "dominant_colors is NOT accepted and is rejected by name: those hex codes are measured off the image's pixels, not authored.",
      "Refused while a conversion or a save is already running.",
      "Staged only: nothing is uploaded, and the values ride along when the user saves to their library.",
    ].join(" "),
    valueType: "object",
    updatesValue: "source_files",
    mode: "draft",
    applyPolicy: "ask",
    group: "studio_sources",
    sortOrder: 310,
  },
  {
    name: "selected_presets",
    label: "Selected presets",
    description: [
      "Sets which size presets get produced for every source file on the next Generate — the same tiles the user ticks in the preset catalog.",
      "Value: an array of preset id strings, e.g. [\"og-image\", \"favicon-32\"].",
      "REPLACES THE FULL SET — include every preset you want kept, not just the new ones. Read selected_preset_ids for what is ticked right now, and available_presets for the ids that exist. An empty array clears the selection.",
      "An id that is not in the catalog is rejected by name — nothing is silently dropped.",
      "Refused while a conversion is already running — the run in flight captured the old selection.",
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
      `resize_position — the crop anchor: one of ${IMAGE_POSITION_ANCHORS.join(" | ")}. "attention" and "entropy" let the encoder choose the region itself. A precise focal point can only be set by dragging the live preview, so it is not writable here.`,
      `resize_position applies ONLY under the "${CROPPING_IMAGE_FIT}" fit — the only one that crops, and the only one whose anchor picker is on screen. This is ENFORCED, not advice: if the fit this call resolves to (the resize_fit you send, else the one already set) is anything else, the whole call is REFUSED and nothing changes, rather than staging an anchor behind a control the user cannot see. Send { resize_fit: "${CROPPING_IMAGE_FIT}", resize_position } together to switch the fit and set the anchor in one call.`,
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

The third target is image_description, and on most visits it is the most
useful thing you can do here: alt text, caption, title, meta description,
keywords and the filename slug for ONE image, addressed by its name from
source_files (call it once per image). Those same six fields are reported back
on every source_files entry, so read them first and extend rather than
clobber. Writing that text yourself is the point — do NOT ask the user to
press Describe with AI, which spends a model call and uploads a preview.
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

  /**
   * The authored description fields — the read twin of the
   * `image_description` write target. Empty strings / empty arrays until
   * Describe with AI runs or an agent writes them, so the evidence loop
   * (read what is there, write what is missing) closes on this surface
   * rather than leaving a write nobody can verify.
   */
  alt_text: string;
  caption: string;
  title: string;
  description: string;
  keywords: string[];
  dominant_colors: string[];
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
