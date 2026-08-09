/**
 * Surface manifest — Image Viewer (`matrx-user/image-viewer`).
 *
 * Overlay surface for the floating image viewer window
 * (`features/window-panels/windows/image/ImageViewerWindow.tsx`, overlay id
 * `imageViewer`, multi-instance) — zoom / pan / rotate / flip / download over
 * one or more image URLs, with a thumbnail sidebar when there are several.
 * The window never renders with an empty image list, so the image set is
 * guaranteed while the surface exists. Purely visual — no text/content
 * concept, so generic baselines are skipped. Emitter: nested
 * SurfaceRuntimeProvider inside `ImageViewerWindow` (wired 2026-08-09).
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";

export const IMAGE_VIEWER_SURFACE_NAME = "matrx-user/image-viewer";

const groups: SurfaceValueGroup[] = [
  {
    key: "viewer_images",
    label: "Viewer images",
    sortOrder: 100,
    description: "The image set loaded in the viewer and which one is active.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "images",
    label: "Image URLs",
    description:
      "URLs of every image loaded in this viewer instance, in display order. Always non-empty — the window refuses to render with no images.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 400,
    sortOrder: 300,
    group: "viewer_images",
  },
  {
    name: "image_count",
    label: "Image count",
    description:
      "Number of images loaded in this viewer instance. Always at least 1 while the window is open.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 2,
    sortOrder: 310,
    group: "viewer_images",
  },
  {
    name: "active_index",
    label: "Active image index",
    description:
      "0-based index of the image currently displayed. Always populated while the window is open.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 2,
    sortOrder: 320,
    group: "viewer_images",
  },
  {
    name: "active_image_url",
    label: "Active image URL",
    description:
      "URL of the image currently displayed (images[active_index]). Always populated while the window is open.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 120,
    sortOrder: 330,
    group: "viewer_images",
  },
  {
    name: "active_image_alt",
    label: "Active image alt text",
    description:
      "Caller-provided alt text for the active image. Absent when the opener supplied no alt texts.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 340,
    group: "viewer_images",
  },
];

export const imageViewerManifest: SurfaceManifest = {
  surfaceName: IMAGE_VIEWER_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Emitter wired 2026-08-09 (nested SurfaceRuntimeProvider inside ImageViewerWindow, live index/URL/alt at Run time); values audited against the window component. Needs the live browser pass (open the window, confirm the scope in the Agents chrome) to earn verified.",
  overlayId: "imageViewer",
  label: "Image Viewer",
  intro: `<surface_intro>
You are in the floating Image Viewer window — the user is inspecting one or more images with zoom, pan, rotate, flip, and download controls (plus a thumbnail sidebar when several are loaded). Viewer images tells you every image URL in the set and which one is currently on screen. There is no text content here — work from the image URLs.
</surface_intro>`,
  groups,
  values: surfaceSpecific,
  // Purely visual widget — no text/content/selection concept.
  skipBaselineValues: true,
};

/**
 * Type-safe payload helper — required keys mirror every `alwaysAvailable:
 * true` value above; optional keys mirror the rest.
 */
export function createImageViewerScope(values: {
  images: string[];
  image_count: number;
  active_index: number;
  active_image_url: string;
  active_image_alt?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
