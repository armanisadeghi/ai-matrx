# FEATURE.md — `gallery`

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-08-22`

---

## Purpose

The floating **Gallery** window: an Unsplash-backed stock image search the user
opens over whatever they were doing, to find a picture. Search by term or topic
chip, filter by orientation, browse in masonry / grid / compact, favorite images
into a sidebar, open any image full-size in the Image Viewer window.

It is a **window, not a route** — there is no `/gallery` page and there is not
meant to be one.

---

## Entry points

- **Overlay id** `galleryWindow` (`features/window-panels/registry/overlay-ids.ts`),
  rendered by `features/overlays/OverlayController.tsx`.
- **Shell** `features/window-panels/windows/image/GalleryWindow.tsx` — the
  `WindowPanel` chrome, the surface provider, the window's context menu, and the
  agent write handlers.
- **Body** `features/gallery/components/GalleryFloatingWorkspace.tsx` — the ONE
  owner of gallery state (search, filters, view mode, photos, favorites, focused
  image). The shell reads state from it; it never keeps its own copy.
- **Opened from** the window Tools grid
  (`features/window-panels/tools-grid/toolsGridTiles.ts`) and the image-manager
  Tools tab, plus the generated opener
  `features/overlays/openers/galleryWindow.tsx`.
- **Mobile** `mobilePresentation: "fullscreen"`, sidebar as a drawer
  (`windowRegistryMetadata.ts`).

## Data

- Photos come from `useUnsplashSearch` → `useUnsplashGallery` → `unsplashClient`
  → the Next route `/api/unsplash`. That route exists because the Unsplash key
  is a secret — it is a true Next-only concern, not a DB middle tier.
- **Failures are not empty results.** `useUnsplashGallery` exposes `photoError`;
  render it instead of the empty state. Before 2026-08-22 every failure was
  console-logged and the UI said "No results found" during outages.
- Favorites are **local only** (`localStorage` key `gallery-window-favorites`).
  They are not an entity, not shared, not synced.

## Surface — `matrx-user/gallery`

Manifest: `features/surfaces/manifests/gallery.manifest.ts` (overlay surface,
`skipBaselineValues: true` — there is no text/content/selection concept here).

- **Reads:** gallery state (view mode, search input, active query, orientation,
  counts) plus the images themselves — `image_description` (the always-available
  "which image does the user mean": last opened → submitted query → typed text),
  `visible_image_descriptions`, `quick_topics`, `focused_image_*`,
  `favorite_image_descriptions`.
- **Writes:** `search_query`, `orientation_filter`, `view_mode` — all `ui` mode,
  `applyPolicy: "ask"`. Handlers live in `GalleryWindow.getWriteHandlers`.
- **Never re-add baselines here.** A shortcut that needs "the image" binds to
  `image_description`, not to `selection`.
- The window mounts its **own** `NonEditableContextMenu`; without it the page
  underneath answers the right-click with its own surface.

## Gotchas

- `GalleryFloatingWorkspace()` is called as a **function, not a component** — it
  returns `{ sidebar, body, …state }` for the shell to place. Hooks inside it
  therefore belong to `GalleryWindowInner`.
- There is no persistent "selected image" affordance; the last image the user
  OPENED is the surface's notion of focus.
- Photo overlays use `bg-black/…` and `text-white` on purpose — they sit on top
  of a photograph, which is the same in both themes.

---

## Change Log

- **2026-08-22** — surface-check `matrx-user/gallery` (pass-with-arman-items,
  6 fixes): surface vocabulary expanded from 6 to 14 values (the images
  themselves, not just the layout); 3 write targets added so an agent can drive
  the search; the window got its own context menu; touch reachability and 44pt
  targets on mobile; photographer names now open their Unsplash profile; the
  Unsplash outage-reads-as-no-results bug fixed via `photoError`. The
  "Generate Image" shortcut for this surface was repointed off the baseline
  `selection` (which this surface does not emit) onto `image_description`.
- **2026-08-09** — surface emitter wired; the shell's duplicate `viewMode` state
  collapsed into the workspace (the footer buttons highlighted but never changed
  the grid).
