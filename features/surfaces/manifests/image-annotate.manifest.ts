/**
 * Surface manifest — Image Annotate (`matrx-user/image-annotate`).
 *
 * Screenshot markup (`/images/annotate`, rendered by
 * `features/image-studio/modes/annotate/AnnotateModeShell.tsx` — marker.js
 * arrows/callouts/boxes baked onto a flat PNG on save). The shell also opens
 * as a MODAL from other surfaces, so the emitter lives inside
 * `AnnotateModeShell` — its nested provider wins while the annotator is open.
 *
 * FILE DOCTRINE: the image is identified by its durable `cld_files` UUID
 * (`image_file_id`) when it exists; url-sourced annotations have none until
 * the annotated copy is saved. Never emit signed URLs.
 *
 * WRITE DOCTRINE — why this surface has NO `writeTargets` (assessed
 * 2026-08-12 against the installed markerjs2 typings; read this before
 * scoping another pass at it, and note it CORRECTS the stated reason):
 *
 * The obvious candidate is CALLOUT TEXT — the words in an arrow or text
 * marker are authored prose an agent drafts well. The reason recorded so far
 * (the inline comment in `AnnotateModeShell.handleBlurFaces`, and one of the
 * FEATURE.md rule-outs) is that marker.js 2 exposes no programmatic API.
 * **That claim is false**, and a future scout who opens the typings will find
 * it false and reasonably conclude the rule-out was wrong. `MarkerArea` ships
 * `createNewMarker(markerType)` and `restoreState(state: MarkerAreaState)`.
 * The surface is still NOT writable, for three reasons that survive the
 * correction:
 *
 *  1. **The text is inseparable from pixel geometry.** A text marker
 *     serializes as `TextMarkerState extends RectangularBoxMarkerBaseState`:
 *     `text` travels with `left` / `top` / `width` / `height` / `rotation`.
 *     There is no way to write a callout's words without also choosing where
 *     on the screenshot it points — and the agent cannot see those pixels.
 *     This is the spatial class `analysis-studio` ruled out. A perfectly
 *     worded callout anchored to the wrong widget is worse than no callout,
 *     and it is wrong in a way the confirm dialog cannot show the user.
 *  2. **`restoreState` is whole-set replace, not patch.** It swaps the entire
 *     marker array, so any agent write clobbers whatever the user has already
 *     drawn. There is no merge seam to build an additive target on.
 *  3. **There is no read twin, and no React state to hold one.** The shell
 *     keeps the `MarkerArea` in a ref and holds ZERO annotation state in
 *     React (`saving` and `aiBusy` are status the page owns); no declared
 *     value carries the marker set. The evidence loop cannot be closed here
 *     without a `surface-authoring` pass first.
 *
 * The AI assists are not targets either: "Suggest annotations" and "Redact
 * PII" are `toast.info(… ships next wave)` stubs, and "Detect faces" is gated
 * behind `IMAGE_STUDIO_BACKEND_CAPABILITIES.faceDetection`, which is `false`
 * — the same hardcoded capability gate that rules out `image-edit`'s prompt.
 * Tellingly, even the shipped face path reports only a COUNT and asks the
 * user to draw the boxes, for exactly reason (1).
 *
 * Everything else is refused by settled doctrine: `image_file_id` /
 * `image_file_name` are file identity, `presentation` is a prop describing
 * the mount, `save_folder` is a save destination (the line `podcast-studio`
 * and `image-generate` both drew), and `is_saving` / `ai_assist_running` are
 * status. Saving itself stays the human press.
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
    key: "annotate_image",
    label: "Image being annotated",
    sortOrder: 100,
    description: "Identity of the screenshot on the markup canvas.",
  },
  {
    key: "annotate_session",
    label: "Annotation session",
    sortOrder: 200,
    description: "Presentation, save destination, and in-flight AI assists.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Image being annotated (300-329) ───────────────────────────────────
  {
    name: "image_file_id",
    label: "Image file id",
    description:
      "cld_files UUID of the source screenshot. Absent for url-sourced images until the annotated copy is saved.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "annotate_image",
    sortOrder: 300,
  },
  {
    name: "image_file_name",
    label: "Image file name",
    description:
      "Filename of the screenshot being annotated, derived from its source. Always present.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 40,
    group: "annotate_image",
    sortOrder: 305,
  },

  // ── Annotation session (330-359) ──────────────────────────────────────
  {
    name: "presentation",
    label: "Presentation",
    description:
      'How the annotator is mounted: "page" (the /images/annotate route) or "modal" (opened from another surface). Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "annotate_session",
    sortOrder: 330,
  },
  {
    name: "save_folder",
    label: "Save folder",
    description:
      "Cloud-library folder path where the baked annotated PNG lands (e.g. `Images/Annotated`). Always present.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 20,
    group: "annotate_session",
    sortOrder: 335,
  },
  {
    name: "is_saving",
    label: "Saving",
    description:
      "True while the flattened annotated image is being saved to the cloud library. Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "annotate_session",
    sortOrder: 340,
  },
  {
    name: "ai_assist_running",
    label: "AI assist running",
    description:
      'The AI assist currently working on this screenshot: "redact" (PII redaction) or "faces" (face detection/blur). Absent when no assist is in flight.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 6,
    group: "annotate_session",
    sortOrder: 345,
  },
];

export const IMAGE_ANNOTATE_SURFACE_NAME = "matrx-user/image-annotate";

export const imageAnnotateManifest: SurfaceManifest = {
  surfaceName: IMAGE_ANNOTATE_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Manifest + AnnotateModeShell emitter (covers page AND modal mounts). Remaining: the pre-source picker state mounts no provider, no `data-surface-value` anchors, no live non-matching-name binding test.",
  label: "Image Annotate",
  urlPattern: "/images/annotate",
  intro: `<surface_intro>
The user is marking up a screenshot: arrows, callout text, boxes, and
freehand strokes drawn over the image, then baked into a flat PNG on save.
The original image is never modified — the annotated copy lands in
save_folder. AI assists (PII redaction, face detection/blur) can pre-place
annotations.

image_file_id is the durable cloud-file UUID of the source when it exists;
url-sourced screenshots have none until the annotated copy is saved — never
invent one. presentation "modal" means the annotator is open on top of
another surface, invoked from it.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
};

/**
 * Scope builder for `matrx-user/image-annotate`.
 *
 * Required (no `?`) keys mirror every `alwaysAvailable: true` value.
 */
export function createImageAnnotateScope(values: {
  selection?: string;
  context?: Record<string, unknown>;

  // Image being annotated
  image_file_id?: string;
  image_file_name: string;

  // Annotation session
  presentation: string;
  save_folder: string;
  is_saving: boolean;
  ai_assist_running?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
