/**
 * Surface manifest — Image Editor (`matrx-user/image-edit`).
 *
 * The single-image editor (`/images/edit/[id]`, rendered by
 * `features/image-studio/modes/edit/EditModeShell.tsx` — Filerobot canvas +
 * AI ops toolbar + versions rail + mask painting). The `/images/edit` landing
 * (source picker) routes here too. The same shell also opens as a MODAL from
 * other surfaces (e.g. Notes "edit this image"), so the emitter lives inside
 * `EditModeShell` — its nested provider wins while the editor is open, per
 * the overlay-surface doctrine.
 *
 * FILE DOCTRINE: the image is identified by its durable `cld_files` UUID
 * (`image_file_id`) when it exists; url-sourced edits (e.g. an unsaved AI
 * result) have none until saved. Never emit signed URLs.
 *
 * WRITE DOCTRINE — why this surface has NO `writeTargets` (assessed 2026-08-11,
 * read this before scoping another pass at it):
 *
 * The obvious candidate is the AI EDIT PROMPT ("remove the background and warm
 * the tone") — authored prose an agent writes better than a human, and the
 * exact shape `matrx-user/image-generate` shipped as `generation_request`.
 * `promptText` / `setPromptText` ARE real component state in `EditAiToolbar`,
 * so a handler would "work". It is still NOT a target, because the control it
 * writes into does not exist in this build: the whole prompt popover renders
 * behind `{IMAGE_STUDIO_BACKEND_CAPABILITIES.promptEdit && (…)}`, and
 * `promptEdit` is `false` (`features/image-studio/constants/backend-capabilities.ts`
 * — a hardcoded `as const`, no env override; `handlePrompt` separately
 * early-returns "coming soon"). Staging a prompt there would land in state the
 * user cannot see, edit, or run — a confirm dialog the user approves and
 * nothing visibly happens. The same gate hides "Suggest" (`editSuggestions`).
 *
 * What remains rendered is not authored content: the Adjust popover's
 * brightness/contrast/saturation/sharpness are numeric pixel knobs (the
 * mechanical-toggle class the judgment bar excludes), and mask painting, the
 * versions rail, Reset, and the Filerobot canvas are destructive or
 * user-gesture surfaces. Running any AI op spends real money on image models,
 * so execution was never a target regardless — the same line
 * `image-generate` draws at Generate.
 *
 * WHEN `promptEdit` FLIPS TRUE, this surface earns exactly one composite
 * `edit_request` target — `{ prompt }`, staged (`mode: "draft"`,
 * `applyPolicy: "ask"`) into `EditAiToolbar` via `useSurfaceWriteHandlers`
 * (the state lives in that child, not in `EditModeShell`) — and the user still
 * presses Apply. Note the shell also mounts as a MODAL from other surfaces, so
 * whatever is declared here is reachable from those callers too.
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
    key: "edit_image",
    label: "Image being edited",
    sortOrder: 100,
    description: "Identity and dimensions of the image on the editor canvas.",
  },
  {
    key: "edit_session",
    label: "Edit session",
    sortOrder: 200,
    description:
      "Presentation, save destination, AI-op chaining, and mask state for this session.",
  },
  {
    key: "edit_activity",
    label: "Activity",
    sortOrder: 300,
    description: "In-flight save and variant-generation work.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Image being edited (300-329) ──────────────────────────────────────
  {
    name: "image_file_id",
    label: "Image file id",
    description:
      "cld_files UUID of the image being edited. Absent for url-sourced edits (e.g. an unsaved generation result) until the first save.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "edit_image",
    sortOrder: 300,
  },
  {
    name: "image_file_name",
    label: "Image file name",
    description:
      "Display name of the image on the canvas — the live cloud-files name when the file id is known, otherwise the source-derived filename. Always present.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 40,
    group: "edit_image",
    sortOrder: 305,
  },
  {
    name: "source_dimensions",
    label: "Source dimensions",
    description:
      "Natural pixel size of the loaded image as `{ width, height }`. Absent until the image finishes decoding.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 30,
    group: "edit_image",
    sortOrder: 310,
  },

  // ── Edit session (330-369) ────────────────────────────────────────────
  {
    name: "presentation",
    label: "Presentation",
    description:
      'How the editor is mounted: "page" (the /images/edit/[id] route) or "modal" (opened from another surface). Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "edit_session",
    sortOrder: 330,
  },
  {
    name: "save_folder",
    label: "Save folder",
    description:
      "Cloud-library folder path where saves land (e.g. `Images/Edited`). Always present.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 20,
    group: "edit_session",
    sortOrder: 335,
  },
  {
    name: "edit_chain_file_id",
    label: "AI-op chain file id",
    description:
      "cld_files UUID of the latest AI-op result when edits are chaining against results instead of the untouched source (preserve-source mode). Absent otherwise.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "edit_session",
    sortOrder: 340,
  },
  {
    name: "mask_active",
    label: "Mask painting on",
    description:
      "True while the mask-painting overlay is visible, constraining AI ops to a painted region. Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "edit_session",
    sortOrder: 345,
  },
  {
    name: "mask_has_pixels",
    label: "Mask has pixels",
    description:
      "True when the user has painted at least one mask stroke — AI ops will be region-constrained. Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "edit_session",
    sortOrder: 350,
  },

  // ── Activity (370-389) ────────────────────────────────────────────────
  {
    name: "is_saving",
    label: "Saving",
    description: "True while a save (version or new file) is in flight. Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "edit_activity",
    sortOrder: 370,
  },
  {
    name: "saving_variant_preset",
    label: "Generating size variants",
    description:
      'The asset preset (e.g. "social", "avatar") currently generating platform-size variants of this image. Absent when no variant job is running.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    group: "edit_activity",
    sortOrder: 375,
  },
];

export const IMAGE_EDIT_SURFACE_NAME = "matrx-user/image-edit";

export const imageEditManifest: SurfaceManifest = {
  surfaceName: IMAGE_EDIT_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Manifest + EditModeShell emitter (covers page AND modal mounts). Remaining: /images/edit landing picker mounts no provider, no `data-surface-value` anchors, no live non-matching-name binding test.",
  label: "Image Editor",
  urlPattern: "/images/edit/[id]",
  intro: `<surface_intro>
The user has one image open on the editor canvas: crop/rotate/filter tools,
AI operations (remove background, upscale, AI edit — optionally constrained
to a painted mask region), platform-size variant generation, and a versions
rail. Saves either version the source file or create a new file in
save_folder.

image_file_id is the durable cloud-file UUID when it exists; url-sourced
edits (an unsaved generation result) have none until the first save — never
invent one. mask_has_pixels true means the user has scoped AI work to a
specific region; respect that intent when suggesting operations. presentation
"modal" means the editor is open on top of another surface, invoked from it.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
};

/**
 * Scope builder for `matrx-user/image-edit`.
 *
 * Required (no `?`) keys mirror every `alwaysAvailable: true` value.
 */
export function createImageEditScope(values: {
  selection?: string;
  context?: Record<string, unknown>;

  // Image being edited
  image_file_id?: string;
  image_file_name: string;
  source_dimensions?: { width: number; height: number };

  // Edit session
  presentation: string;
  save_folder: string;
  edit_chain_file_id?: string;
  mask_active: boolean;
  mask_has_pixels: boolean;

  // Activity
  is_saving: boolean;
  saving_variant_preset?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
