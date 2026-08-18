/**
 * Surface manifest — Image Manager (`matrx-user/image-manager`).
 *
 * The image hub itself and its tab routes under `/images/**` that are NOT one
 * of the already-declared specialist surfaces: the landing hero (`/images`),
 * the manager shell, and the tabs rendered from `features/image-manager/**`
 * (tools, branded upload, profile photo, public image search, studio library,
 * presets, all-files).
 *
 * Declared 2026-08-17: only `/images/my-cloud` (the library tab, surface
 * `matrx-user/images`) and the four specialist routes (studio, generate, edit,
 * annotate) resolved to a surface at all — every other `/images/**` route
 * resolved to nothing, so a dozen live routes could not bind an agent.
 *
 * Deliberately NARROW: this is the hub vocabulary (which tab, what is selected)
 * and nothing more. The library tab keeps its own richer surface
 * (`matrx-user/images`) with its own emitter — do not fold the two together.
 *
 * FILE DOCTRINE (features/files/handler/FEATURE.md): images are identified by
 * DURABLE refs only — `file_id`, never a signed URL or an S3 `storage_uri`.
 *
 * Curated groups (band 0-899):
 *   hub_location  Which part of the image hub the user is on
 *   selection     Which images they have picked
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
    key: "hub_location",
    label: "Hub location",
    sortOrder: 100,
    description: "Which tab of the image hub the user is currently on.",
  },
  {
    key: "selection",
    label: "Image selection",
    sortOrder: 200,
    description: "The images the user has picked on the current tab.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "image_hub_tab",
    label: "Hub tab",
    description:
      'Which image hub tab is open — e.g. "home", "manager", "tools", "branded", "profile-photo", "public-search", "studio-library", "presets", "all-files". Always populated.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 16,
    sortOrder: 100,
    group: "hub_location",
  },
  {
    name: "selected_image_ids",
    label: "Selected image IDs",
    description:
      "Durable `file_id`s of the images the user has selected on the current tab. Always populated — empty array when nothing is selected. Never a URL: bytes are re-minted from the id.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 200,
    sortOrder: 200,
    group: "selection",
  },
  {
    name: "focused_image_id",
    label: "Focused image ID",
    description:
      "Durable `file_id` of the single image the user has opened or focused on this tab. Empty when nothing is focused.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 210,
    group: "selection",
  },
];

export const imageManagerManifest: SurfaceManifest = {
  surfaceName: "matrx-user/image-manager",
  readiness: "stub",
  readinessNote:
    "Narrow hub vocabulary declared 2026-08-17 so the previously unmapped /images/** tab routes resolve to a real surface. Each tab's own data is not yet declared, and no emitter is wired.",
  label: "Image Manager",
  urlPattern: "/images",
  intro: `<surface_intro>
You are in the Image Manager: the hub the user moves through to find, upload, brand, and organize images. image_hub_tab tells you which tab they are on; the selection group tells you which images they have picked.
Images are always identified here by a durable file_id, never by a URL — a URL you were given may already have expired, so resolve bytes from the id.
The dedicated image workspaces (library, studio, generate, edit, annotate) are separate surfaces with their own richer vocabulary; do not assume their values are available here.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), surfaceSpecific),
};

/** Type-safe payload helper — required keys mirror `alwaysAvailable: true`. */
export function createImageManagerScope(values: {
  image_hub_tab: string;
  selected_image_ids: string[];
  selection?: string;
  context?: Record<string, unknown>;
  focused_image_id?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
