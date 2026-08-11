/**
 * Surface manifest — Images Library (`matrx-user/images`).
 *
 * The image hub's live library view (`/images/my-cloud`, rendered by
 * `components/image/cloud/CloudImagesTab.tsx`). The user searches, filters to
 * recents, switches view density, browses image tiles, and bulk-selects images
 * for download / move / visibility / delete.
 *
 * Emitter: `buildImagesScope` in
 * `features/image-manager/lib/images-surface-scope.ts`, called at trigger time
 * by `CloudImagesTab` through `<SurfaceRuntimeProvider>`.
 *
 * FILE DOCTRINE (features/files/handler/FEATURE.md) — LOAD-BEARING:
 * this surface NEVER declares or emits a raw signed URL (`?X-Amz-…`) or an S3
 * `storage_uri`. Signed URLs expire; `storage_uri` is not available to the
 * client at all. Images are identified by DURABLE refs only: `file_id`
 * (preferred — always re-mintable through `fileHandler` / `useFileSrc`) and,
 * for public files, the permanent CDN URL, emitted ONLY after `isSignedUrl()`
 * from `@/lib/media/signed-url` confirms it is not a signed URL in disguise.
 * Any agent or tool needing bytes resolves them from an image id.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "library_query",
    label: "Library query and view",
    sortOrder: 100,
    description:
      "Search text, the recents filter, and the view density shaping the visible tiles.",
  },
  {
    key: "visible_images",
    label: "Visible images",
    sortOrder: 200,
    description:
      "The image rows the user can actually see after search and filters. Durable refs only.",
  },
  {
    key: "image_selection",
    label: "Selection",
    sortOrder: 300,
    description:
      "The bulk checkbox selection and the picker-mode selection state.",
  },
  {
    key: "library_status",
    label: "Library status",
    sortOrder: 400,
    description: "Load state of the underlying cloud-files tree and in-flight bulk work.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Library query and view (300-329) ──────────────────────────────────
  {
    name: "search_query",
    label: "Search query",
    description:
      "Text in the library search box; matches image file names and partial ids. Empty when the user is not searching.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    group: "library_query",
    sortOrder: 300,
  },
  {
    name: "recents_only",
    label: "Recents filter on",
    description:
      "True when the Recents chip is active, restricting the list to images touched in the last 30 days. Always present; false by default.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "library_query",
    sortOrder: 305,
  },
  {
    name: "view_mode",
    label: "View mode",
    description:
      'How tiles are rendered: "cozy", "compact", or "list". Always present; persisted per user in localStorage.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 7,
    group: "library_query",
    sortOrder: 310,
  },
  {
    name: "library_query_summary",
    label: "Library query summary",
    description:
      "Composite object of everything shaping the visible list: `{ search_query, recents_only, view_mode, selection_mode }`. Always present.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 160,
    group: "library_query",
    sortOrder: 315,
  },

  // ── Visible images (330-359) ──────────────────────────────────────────
  {
    name: "visible_image_count",
    label: "Visible image count",
    description:
      "Number of image rows matching the current search and recents filter. Always present; zero on an empty view.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    group: "visible_images",
    sortOrder: 330,
  },
  {
    name: "total_image_count",
    label: "Total image count",
    description:
      "Number of non-deleted image files in the user's whole cloud library, ignoring search and filters. Always present.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    group: "visible_images",
    sortOrder: 335,
  },
  {
    name: "visible_images",
    label: "Visible images",
    description:
      "Array of `{ id, name, path, mime_type, size, visibility, updated_at, public_url }` for the image rows in scope, newest first, capped at 200 entries to protect the context window. `public_url` appears only for verified-durable CDN URLs — never a signed URL. Empty array when nothing matches.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 8000,
    autoContext: false,
    group: "visible_images",
    sortOrder: 340,
  },
  {
    name: "visible_image_ids",
    label: "Visible image IDs",
    description:
      "Array of UUIDs for the image rows in scope, in display order, capped at 200. THE durable references — resolve bytes from these. Empty array when nothing matches.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 1500,
    autoContext: false,
    group: "visible_images",
    sortOrder: 345,
  },

  // ── Selection (360-389) ───────────────────────────────────────────────
  {
    name: "selected_image_ids",
    label: "Selected image IDs",
    description:
      "Array of UUIDs of every bulk-checkbox-selected image. Absent when nothing is selected.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 300,
    group: "image_selection",
    sortOrder: 360,
  },
  {
    name: "selected_image_names",
    label: "Selected image names",
    description:
      "Array of file names matching `selected_image_ids`, in the same order. Absent when nothing is selected.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 300,
    group: "image_selection",
    sortOrder: 365,
  },
  {
    name: "selected_count",
    label: "Selected image count",
    description:
      "Number of images in the bulk selection. Always present; zero when nothing is selected.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    group: "image_selection",
    sortOrder: 370,
  },
  {
    name: "selected_images",
    label: "Selected images",
    description:
      "Composite array of `{ id, name, path, mime_type, size, visibility, updated_at, public_url }` for every bulk-selected image — enough for a batch agent to act without a second lookup. Absent when nothing is selected.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 900,
    group: "image_selection",
    sortOrder: 375,
  },
  {
    name: "selection_mode",
    label: "Picker selection mode",
    description:
      'How the tab is being used: "none" (browse — clicking opens the viewer), "single", or "multiple" (the tab is acting as an image picker). Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 8,
    group: "image_selection",
    sortOrder: 380,
  },

  // ── Library status (390-419) ──────────────────────────────────────────
  {
    name: "tree_status",
    label: "Library load status",
    description:
      'Load state of the cloud-files tree backing this library: "idle", "loading", "loaded", or "error". Always present; anything but "loaded" means the listing is incomplete.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 7,
    group: "library_status",
    sortOrder: 390,
  },
  {
    name: "bulk_operation",
    label: "Bulk operation in flight",
    description:
      'The bulk action currently running: "download", "move", "visibility", or "delete". Empty when no bulk work is in flight.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    group: "library_status",
    sortOrder: 395,
  },
];

// ---------------------------------------------------------------------------
// Write targets (read/write manifest v1)
// ---------------------------------------------------------------------------

/**
 * What an agent may DRIVE here. This is a selection-and-query surface — there
 * is no authored content on the page — so the targets are the three controls
 * that shape what the user is looking at and pointed at: the search box, the
 * Recents chip, and the bulk checkbox selection. All three are handled by
 * `CloudImagesTab` (which also mounts the provider) through the SAME setters
 * its own controls call.
 *
 * DELIBERATELY EXCLUDED: the bulk actions themselves. Download / Move /
 * Visibility / Delete mutate the user's files, and delete stays human — an
 * agent's reach stops at proposing WHICH images, never at acting on them.
 *
 * WHY EVERY TARGET IS `ask`, NOT `auto`, DESPITE ALL THREE BEING `ui`:
 * the doctrine says `ui` is where `auto` is defensible, and for a merely
 * cosmetic toggle it would be. It is not defensible here. `CloudImagesTab`
 * prunes `bulkSelectedIds` down to the visible rows whenever the visible set
 * changes, so search_query and recents_only do not just re-filter tiles —
 * they silently SHRINK the selection. That selection is the live argument to
 * the Delete and Move buttons sitting on screen. An agent quietly narrowing
 * the filter under a user who is about to click Delete changes what gets
 * deleted, which is precisely the class of surprise `ask` exists to prevent.
 * Same reasoning as `matrx-user/markdown-studio`'s `view_mode`, which held at
 * `ask` because the change was bigger than it looked.
 *
 * `view_mode` (cozy / compact / list) is NOT declared: it is the
 * pure-mechanical display toggle the judgment bar names as a NO — nobody asks
 * an agent to change tile density, and unlike the three above it shapes
 * neither the visible set nor the selection.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "search_query",
    label: "Library search",
    description:
      'Sets the text in the library search box, narrowing the visible tiles to images whose file name or id matches. Value is a plain string, e.g. "invoice"; pass an empty string to clear the search and show the whole library again. Matching is a case-insensitive substring of the FILE NAME plus a partial-id match — it is not semantic, so search for a literal fragment of the name rather than a description of the picture. Ephemeral view state; nothing is saved. NOTE: narrowing the list drops any selected image that no longer matches, so set this BEFORE image_selection, never after.',
    valueType: "string",
    updatesValue: "search_query",
    mode: "ui",
    applyPolicy: "ask",
    group: "library_query",
    sortOrder: 320,
  },
  {
    name: "recents_only",
    label: "Recents filter",
    description:
      "Turns the Recents chip on or off, restricting the visible tiles to images created or updated in the last 30 days. Value is a boolean: true to filter to recents, false to show the whole library. Ephemeral view state; nothing is saved. Like search_query this changes which rows are visible and therefore drops any selected image that falls outside the window — set it BEFORE image_selection.",
    valueType: "boolean",
    updatesValue: "recents_only",
    mode: "ui",
    applyPolicy: "ask",
    group: "library_query",
    sortOrder: 325,
  },
  {
    name: "image_selection",
    label: "Image selection",
    description:
      'Replaces the ENTIRE bulk-checkbox selection with the images you name — the same selection the user builds by ticking tile checkboxes, and the exact set the Download / Move / Visibility / Delete buttons act on. Value is an array of image UUIDs, e.g. ["7f3a…", "b21c…"]; pass [] to clear the selection. It REPLACES rather than appends, so include every id you want selected, including ones already selected. Every id must be one of visible_image_ids (the rows on screen right now) — an id that is filtered out, deleted, or invented is REJECTED and the selection is left completely untouched. IMPORTANT: your visible_image_ids was captured when the run started, so it goes STALE the moment you apply search_query or recents_only; after either of those, the ids still visible are a SUBSET of what you read, and a rejection lists the live ones back to you. Selecting images is as far as this goes: it moves the selection only, and the user still presses the bulk action themselves.',
    valueType: "array",
    updatesValue: "selected_image_ids",
    mode: "ui",
    applyPolicy: "ask",
    group: "image_selection",
    sortOrder: 400,
  },
];

export const IMAGES_SURFACE_NAME = "matrx-user/images";

export const imagesManifest: SurfaceManifest = {
  surfaceName: IMAGES_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Completeness audit done against CloudImagesTab; registered, route-mapped, and DB-synced. Write targets (search_query / recents_only / image_selection) are live and verified against a real agent run. Remaining gaps: no `data-surface-value` anchors on tiles, and no live non-matching-name binding test.",
  label: "Images Library",
  urlPattern: "/images/my-cloud",
  intro: `<surface_intro>
The user is in the Matrx image library — the image-only view of their cloud
files. A search box, a Recents (last 30 days) toggle, and a density switch
(cozy / compact / list) shape a grid of image tiles. Clicking a tile opens the
image viewer; checkboxes build a bulk selection that can be downloaded, moved to
another folder, re-scoped (personal / internal / public), or deleted. The same
component also runs as an image PICKER inside other flows — selection_mode tells
you which.

Read the values in three layers:
  1. WHAT shapes the view — library_query_summary (search_query, recents_only,
     view_mode).
  2. WHAT the user can see — visible_image_count / total_image_count and
     visible_images / visible_image_ids.
  3. WHAT they are pointed at — selected_image_ids / selected_images. A batch
     action always means the selection.

IMAGE REFERENCES ARE DURABLE, NEVER URLS. Identify every image by its UUID
(visible_image_ids, selected_image_ids). Bytes are fetched through the platform
file handler from that id. This surface never emits a signed/expiring URL or a
storage location; a public_url appears only for images with a verified permanent
CDN URL. If you need image content, ask for it by id.

YOU CAN SHAPE THIS VIEW, NOT ACT ON IT. Three controls are writable: the
search box (search_query), the Recents filter (recents_only), and the bulk
selection (image_selection). Order matters — the filters prune the selection
down to what stays visible, so narrow FIRST and select SECOND. Picking out the
images that match what the user described is the useful work here; the bulk
actions behind the selection (download, move, visibility, DELETE) are
deliberately not writable, so hand the selection back and let the user press
the button.

There is no text editor here, so the text baselines are populated only when the
user highlighted something on the page.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

export interface ImagesImageSummary {
  id: string;
  name: string;
  path: string;
  mime_type: string | null;
  size: number | null;
  visibility: string;
  updated_at: string;
  public_url?: string | null;
}

/**
 * Scope builder for `matrx-user/images`.
 *
 * Required (no `?`) keys mirror every `alwaysAvailable: true` value — the
 * library writes them on every launch regardless of UI state.
 */
export function createImagesScope(values: {
  selection?: string;
  context?: Record<string, unknown>;

  // Library query and view
  recents_only: boolean;
  view_mode: string;
  library_query_summary: Record<string, unknown>;
  search_query?: string;

  // Visible images
  visible_image_count: number;
  total_image_count: number;
  visible_images: ImagesImageSummary[];
  visible_image_ids: string[];

  // Selection
  selected_count: number;
  selection_mode: string;
  selected_image_ids?: string[];
  selected_image_names?: string[];
  selected_images?: ImagesImageSummary[];

  // Library status
  tree_status: string;
  bulk_operation?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
