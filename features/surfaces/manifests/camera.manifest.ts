/**
 * Surface manifest — Camera Capture (`matrx-user/camera`).
 *
 * `/camera`: the media-capture surface (`features/media-capture/**`) where the
 * user photographs or records something and saves it into their files.
 *
 * Declared 2026-08-17: the capture route had no surface declaration at all.
 *
 * FILE DOCTRINE (features/files/handler/FEATURE.md): captures are identified by
 * durable `file_id` only — never a signed URL, never an S3 `storage_uri`.
 *
 * Curated groups (band 0-899):
 *   capture_session  What the user has captured in this visit
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
    key: "capture_session",
    label: "Capture session",
    sortOrder: 100,
    description: "What the user has captured and saved during this visit.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "capture_count",
    label: "Captures saved",
    description:
      "How many captures the user has saved during this visit to the camera. Always populated — zero before the first save.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 100,
    group: "capture_session",
  },
  {
    name: "last_capture_file_id",
    label: "Last capture file ID",
    description:
      "Durable `file_id` of the most recent capture saved in this visit. Empty before the first save. Bytes are always re-minted from this id, never from a stored URL.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 110,
    group: "capture_session",
  },
  {
    name: "studio_open",
    label: "Studio panel open",
    description:
      "True when the post-capture studio panel is open beside the camera. Always populated — open by default.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 120,
    group: "capture_session",
  },
];

export const cameraManifest: SurfaceManifest = {
  surfaceName: "matrx-user/camera",
  readiness: "stub",
  readinessNote:
    "Narrow vocabulary declared 2026-08-17 to close the undeclared /camera route. Capture settings and device state are not declared, and no runtime emitter is wired.",
  label: "Camera",
  urlPattern: "/camera",
  intro: `<surface_intro>
You are on the Camera: where the user photographs or records something and saves it into their files.
capture_count and last_capture_file_id describe what has been saved during this visit — before the first save there is nothing to work with, and you should say so rather than assume an image exists.
A capture is always referred to by its file_id; resolve bytes from the id rather than from any URL you were handed.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), surfaceSpecific),
};

/** Type-safe payload helper — required keys mirror `alwaysAvailable: true`. */
export function createCameraScope(values: {
  capture_count: number;
  studio_open: boolean;
  selection?: string;
  context?: Record<string, unknown>;
  last_capture_file_id?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
