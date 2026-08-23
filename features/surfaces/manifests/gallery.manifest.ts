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
  {
    key: "gallery_images",
    label: "Images on screen",
    sortOrder: 200,
    description:
      "The images the gallery is actually showing — what the user is looking at, what they last opened, and what they saved.",
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
  {
    name: "image_description",
    label: "Image the user is describing",
    description:
      "The image the user is describing right now, resolved in order: the description of the photo they last opened in the Image Viewer, else the submitted search term the current results are for, else the live text in the search box. Empty string only before they have typed or opened anything. This is the slot an image-generation prompt binds to on this surface — there is no text selection here.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 60,
    sortOrder: 400,
    group: "gallery_images",
  },
  {
    name: "visible_image_descriptions",
    label: "Descriptions of the loaded results",
    description:
      "The photos currently loaded in the results grid, one per line as `<n>. <description> — <photographer>` (capped at the first 40). Empty string before the first load returns. Use this to reason about what the user is looking at.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 1200,
    sortOrder: 410,
    group: "gallery_images",
  },
  {
    name: "quick_topics",
    label: "Quick topic chips",
    description:
      "Comma-separated list of the one-click topic chips this gallery offers. Use it to suggest a browse direction the user can actually take.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 90,
    sortOrder: 420,
    group: "gallery_images",
  },
  {
    name: "focused_image_id",
    label: "Focused image id",
    description:
      "Unsplash photo id of the image the user last opened from this gallery. Absent until they open one.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 11,
    sortOrder: 430,
    group: "gallery_images",
  },
  {
    name: "focused_image_url",
    label: "Focused image URL",
    description:
      "Direct image URL of the photo the user last opened from this gallery. Absent until they open one.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 440,
    group: "gallery_images",
  },
  {
    name: "focused_image_credit",
    label: "Focused image photographer",
    description:
      "Name of the photographer credited for the last image the user opened. Absent until they open one.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    sortOrder: 450,
    group: "gallery_images",
  },
  {
    name: "focused_image_source_url",
    label: "Focused image source page",
    description:
      "Unsplash page URL for the last image the user opened (the licensing/attribution page, not the image bytes). Absent until they open one, or when the photo carries no source link.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 460,
    group: "gallery_images",
  },
  {
    name: "favorite_image_descriptions",
    label: "Favorited images",
    description:
      "The images the user saved to the favorites sidebar, one per line as `<n>. <description> — <photographer>`. Absent when they have favorited nothing.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 300,
    sortOrder: 470,
    group: "gallery_images",
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
You are in the floating Gallery window — an Unsplash-backed stock image search. The user searches by term or topic chip, filters by orientation, browses results in masonry/grid/compact layouts, favorites images into a sidebar, and opens any image in the Image Viewer window. Gallery state tells you what they searched, how the results are filtered and laid out, and how much is loaded; the image values tell you what is actually on screen, what they last opened, and what they saved. There is no text content and no text selection here — when you need "the image the user means", use image_description.
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
  image_description: string;
  visible_image_descriptions: string;
  quick_topics: string;
  active_query?: string;
  focused_image_id?: string;
  focused_image_url?: string;
  focused_image_credit?: string;
  focused_image_source_url?: string;
  favorite_image_descriptions?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
