/**
 * Surface manifest — Gallery (`matrx-user/gallery`).
 *
 * Overlay surface for the floating stock-image gallery window
 * (`features/window-panels/windows/image/GalleryWindow.tsx`, overlay id
 * `galleryWindow`). An Unsplash-backed image search: search box + topic
 * chips + orientation filter, results in masonry/grid/compact layouts, a
 * favorites sidebar (localStorage-persisted), click-through to the Image
 * Viewer window. State is split between the window shell (view mode) and
 * `GalleryFloatingWorkspace` (search, filters, photos, favorites — the ONE
 * state owner; the shell reads viewMode from it since 2026-08-09). Image
 * search widget — no text/content concept, so generic baselines are
 * skipped. Emitter: nested SurfaceRuntimeProvider inside `GalleryWindow`
 * (wired 2026-08-09).
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";

export const GALLERY_SURFACE_NAME = "matrx-user/gallery";

const groups: SurfaceValueGroup[] = [
  {
    key: "gallery_state",
    label: "Gallery state",
    sortOrder: 100,
    description:
      "The live search, filters, results, and favorites of the gallery window.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "view_mode",
    label: "View mode",
    description:
      'Result layout: "masonry", "grid", or "compact". Always populated while the window is mounted (defaults to masonry).',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 8,
    sortOrder: 300,
    group: "gallery_state",
  },
  {
    name: "search_input",
    label: "Search input",
    description:
      "The live text in the gallery search box (may not have been submitted yet). Empty string when the user is not searching. Always populated while the window is mounted.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 20,
    sortOrder: 310,
    group: "gallery_state",
  },
  {
    name: "active_query",
    label: "Active search query",
    description:
      "The submitted search term the current results are for. Absent when the window is showing recent photos (no search submitted).",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    sortOrder: 320,
    group: "gallery_state",
  },
  {
    name: "orientation_filter",
    label: "Orientation filter",
    description:
      'Active orientation filter: "all", "landscape", "portrait", or "squarish". Always populated while the window is mounted.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 9,
    sortOrder: 330,
    group: "gallery_state",
  },
  {
    name: "photo_count",
    label: "Loaded photo count",
    description:
      "Number of photos currently loaded into the results grid. Always populated while the window is mounted; 0 while the first load is in flight.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 340,
    group: "gallery_state",
  },
  {
    name: "favorite_count",
    label: "Favorite count",
    description:
      "Number of images the user has favorited in the gallery sidebar (persisted locally). Always populated while the window is mounted.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 2,
    sortOrder: 350,
    group: "gallery_state",
  },
];

export const galleryManifest: SurfaceManifest = {
  surfaceName: GALLERY_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Emitter wired 2026-08-09 (nested SurfaceRuntimeProvider inside GalleryWindow reading the workspace's live state; the shell/workspace duplicate viewMode state was also collapsed — the footer view-mode buttons previously never changed the grid). Needs the live browser pass to earn verified.",
  overlayId: "galleryWindow",
  label: "Gallery",
  intro: `<surface_intro>
You are in the floating Gallery window — an Unsplash-backed stock image search. The user searches by term or topic chip, filters by orientation, browses results in masonry/grid/compact layouts, favorites images into a sidebar, and opens any image in the Image Viewer window. Gallery state tells you what they searched, how the results are filtered and laid out, and how much is loaded. There is no text content here.
</surface_intro>`,
  groups,
  values: surfaceSpecific,
  // Image-search widget — no text/content/selection concept.
  skipBaselineValues: true,
};

/**
 * Type-safe payload helper — required keys mirror every `alwaysAvailable:
 * true` value above; optional keys mirror the rest.
 */
export function createGalleryScope(values: {
  view_mode: "masonry" | "grid" | "compact";
  search_input: string;
  orientation_filter: string;
  photo_count: number;
  favorite_count: number;
  active_query?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
