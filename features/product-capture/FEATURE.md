# Product Capture — FEATURE.md

**Status:** Built (v2). Routes: `/tools/product-capture` (capture), `/tools/product-capture/all` (manage list), `/tools/product-capture/item/[id]` (view mode) — `(core)`, nav "Product Capture". Mobile-first capture surface for warehouse-style photographing of products ahead of eBay-listing categorization.

## What it is

**Capture** (`/tools/product-capture`): one immersive FULL-SCREEN camera surface (modeled on the PDF scanner's `CaptureView`) where a worker moves through physical products fast. The preview fills the whole screen (`viewport-crop`); the shutter still captures the FULL sensor frame — nothing framed is ever lost. Controls overlay the frame on gradient scrims; an Eye toggle hides every control (except itself and honesty chips — recording timer, QR confirmation) for an unobstructed view. `?item=<id>` opens capture mode on an existing item.

**Manage** (`/tools/product-capture/all`): every org item newest-first on the canonical `MatrxDataTable` (thumbnail, code, media counts, notes, status, captured time; URL-durable query state; complete reads via `readAllRows`). Row click / Eye → view mode; Camera → capture mode on that item; Trash → soft delete.

**View mode** (`/tools/product-capture/item/[id]`): manage the item's media (delete files, add photos/videos from the device), edit SKU + notes (same guarded autosave), jump back into capture on it.

- **Mode 1 — rapid:** shoot any number of photos, tap **Next** → the next capture starts a fresh item.
- **Mode 2 — QR auto-switch:** the ScanLine toggle watches the live preview (`useQrAutoScan` → `lib/qr/decode.ts`, 250 ms tick); a scanned code closes the current item and opens a new one carrying the code as its product id (an untouched current item just takes the code). Toggle persists in localStorage.
- **Both modes:** photo ↔ video toggle (video records the same pinned lease via `startVideoRecording`, mic on) · SKU quick-entry field (commit on Enter/blur) · collapsible autosaving notes textarea (reopen returns the caret to the END of the text) · one-tap voice notes (`useSimpleRecorder`) uploaded to the item's folder and transcribed in the background (`transcribeCloudFile` by file_id), transcript appended to the item's notes.

Everything autosaves; there is no save button anywhere. Items are created lazily on the first artifact/code/note — "Next" can never mint an empty row. The current item id persists in localStorage per org so a reload resumes mid-item. The LayoutGrid button opens the review drawer (recent org items — reopen as current, delete).

## Data model — deliberately minimal staging

`migrations/workbench_product_capture_2026_08_28.sql` (applied live + certified 2026-08-28, ledger row recorded):

| Table | Variant | Holds |
|---|---|---|
| `workbench.product_capture_item` | entity, visibility `internal`, soft-delete, unversioned | code/`code_source` (`qr`/`manual`), `notes` (transcripts append here), `folder_path` (fixed at creation), `status` — the capture lifecycle `capturing` → `captured` → `processed` (see the workflow handoff below) |
| `workbench.product_capture_file` | component of the item (`p_parents`) | `item_id`, `file_id` → `files.files` (CASCADE both ways), `kind` (`photo`/`video`/`audio`) |

Bytes NEVER live here — every artifact goes through `uploads.ts` → `fileHandler.upload` into the item's own folder `Product Captures/<orgId>/<code-or-itemId>` (`folderForProductCaptureItem`, `folder-conventions.ts`), **visibility `internal` + `inheritActiveScope`** so the whole org reads them without per-user grants; `metadata.product_capture = {item_id, code, kind}` stamps the linkage on the file too. Org id comes from `selectEffectiveOrganizationId` and is passed EXPLICITLY on every insert (no-db-assigned-org doctrine; `p_org_default => false`).

Item writes are version-guarded CAS (`utils/supabase/guardedUpdate`, retry-once). Notes have exactly two writers: the debounced textarea autosave (replace, flushed on item switch + visibilitychange) and the background transcript. A transcript for the item still on screen lands in the textarea and rides the same autosave (one writer for visible text); one for an item the user already left goes through `appendToItemNotes` (read-append-CAS, so it never clobbers).

## Layout

```
features/product-capture/
  types.ts              row + UI types (Database["workbench"] projections)
  service.ts            direct-Supabase CRUD, guarded item writes, complete org reads (readAllRows)
  uploads.ts            the ONE cloud boundary (fileHandler.upload + linkFile + removeItemFile)
  hooks/useProductCaptureSession.ts   session engine (items, artifacts, notes, voice; initialItemId deep link)
  hooks/useQrAutoScan.ts              decode tick over the live <video>
  components/CaptureScreen.tsx        the full-screen surface (viewport-crop preview, full-frame shutter, overlay controls, hide toggle)
  components/NotesPanel.tsx           quick-access textarea (caret-to-end contract)
  components/VoiceNoteButton.tsx      useSimpleRecorder wrapper
  components/ItemsSheet.tsx           in-capture review drawer (Drawer, CaptureThumb, ConfirmDialog)
  components/ProductCaptureHeader.tsx shared RouteHeader (optional back + title + actions) for the manage pages — it INJECTS ITSELF; never wrap it in a second <PageHeader> (splits the center zone in half)
  components/AllItemsTable.tsx        desktop: MatrxDataTable over listAllItems/listAllFiles; mobile: ItemSwipeRow card list
  components/ItemDetailView.tsx       view mode (media grid + long-press delete, MediaPager, add/delete files, SKU/notes autosave)
  components/MediaPager.tsx           full-screen swipeable viewer (swipe ← → page, ↓ dismiss; desktop chevrons/keys; InlineMediaRef contain-fit slides)
  components/SwipeableRow.tsx         iOS Mail-style swipe actions (motion drag; leading = positive, trailing = destructive)
  components/ItemSwipeRow.tsx         the ONE gesture item row (tap/swipe/long-press) shared by ItemsSheet + /all mobile
  components/ItemActionsDrawer.tsx    long-press action sheet (View / Capture / Mark ready-Reprocess / Delete)
  hooks/useLongPress.ts               pointer long-press (450 ms, slop-cancel, click suppression, haptic)
app/(core)/tools/product-capture/          capture page (SSR auth gate, ?item= deep link) + layout (metadata "PC") + ssr:false client boundary
app/(core)/tools/product-capture/all/      manage list
app/(core)/tools/product-capture/item/[id]/  view mode
app/(core)/tools/product-capture/admin/    FeatureAdminPage map — add every new route/component here
```

**Gesture contract (mobile-first, iOS conventions):** every list row — the in-capture ItemsSheet and the /all mobile card list, both on `ItemSwipeRow` — answers tap (host primary: resume in capture, view on /all), swipe RIGHT (positive: Details in capture, Capture on /all), swipe LEFT (Delete, confirmed), and long-press (`ItemActionsDrawer` with all four actions). Media tiles on the detail page: tap → `MediaPager`, long-press → delete confirm. The pager swipes ← → between files, ↓ dismisses (iOS Photos), with counter + dots and desktop chevrons/arrow keys.

Reused, never reimplemented: camera runtime (`acquireCameraLease` / `CameraPreview` / `capturePhotoFromVideo` canvas path / `startVideoRecording`), `lib/qr/decode.ts` (THE decoder), `useSimpleRecorder` + `toAudioFile` + `transcribeCloudFile` (the audio invariants: captureLock, shared mic, one controller), `fileHandler`, `CaptureThumb`/`InlineMediaRef`, `guardedUpdate`, `ConfirmDialog`, Drawer, `@/lib/toast`. ONE `ssr:false` boundary at the route client (Fragmentation Law); everything beneath is static.

## Invariants

1. Bytes only via `uploads.ts` → `fileHandler.upload`; persist `file_id`, never a URL; render via `CaptureThumb`/`InlineMediaRef`. Persisted capture thumbnails use the bearer-authenticated blob transport, not the cross-site file-session cookie.
2. An item's `folder_path` is set once at creation and never renamed — a code assigned later lives on the row + file metadata only.
3. QR dedupe: the current item's own code never re-fires; a repeat value re-fires only after 4 s out of frame.
4. Voice note and video recording never run together (the app-wide capture lock would take over) — the UI disables the other control.
5. Downstream consumers read items by `organization_id` + `status='captured'` and flip `status` to `processed` — never delete to consume.
6. **The `capturing → captured` transition IS the workflow handoff.** Items are born `capturing`; `service.closeItem` flips to `captured` when the photographer moves on (`finishCurrentItem` — Next, QR-advance, item switch — plus the manage/detail "Mark ready" action), and that DB transition fires the table's workflow event trigger (`workflow.watch_table` attached `workflow.emit_trigger_events`; matrx-graph event triggers, aidream `packages/matrx-graph/matrx_graph/workers/FEATURE.md` § Trigger watchers). `reopenItem` (capture surface adopting an existing item) flips back to `capturing`, so closing again re-fires — more photos mean a reprocess; likewise "Reprocess" on a `processed` item is just `closeItem`. Never fire workflows from client code — the status write is the only trigger path, so agents/SQL/imports behave identically to the UI.

## Change log

- 2026-08-28 — Gestures + header fix (Arman's round-3 feedback): fixed the manage-page shell header (the pages wrapped self-injecting `RouteHeader` in a second `PageHeader`, splitting the center zone 50/50 — back button appeared mid-header and the title crushed); `MediaPager` swipeable viewer everywhere a file opens full-screen; `ItemSwipeRow` + `SwipeableRow` + `useLongPress` + `ItemActionsDrawer` give every list surface tap/swipe-left/swipe-right/long-press per the gesture contract; /all renders the card list on mobile (canonical table stays on desktop). type-check/eslint green.

- 2026-08-28 — v3 (workflow handoff): `status` becomes the real capture lifecycle `capturing`/`captured`/`processed` (migration `workbench_product_capture_status_capturing_2026_08_28.sql`, applied live + ledgered; default now `capturing`) and the table is instrumented with `workflow.watch_table` so the `→ captured` transition durably enqueues the org's event trigger (invariant 6). `closeItem`/`reopenItem` in `service.ts`; close-on-finish + reopen-on-adopt in `useProductCaptureSession`; "Mark ready"/"Reprocess" actions + `Capturing`/`Ready`/`Processed` labels on the manage table and detail view.
- 2026-08-27 — Persisted thumbnails now resolve from `file_id` through `CaptureThumb`'s authenticated blob transport, fixing post-refresh image failures in iOS Safari.
- 2026-08-28 — Navigation fallback (Arman): the capture screen's X ALWAYS lands on `/tools/product-capture/all` (never `router.back()` — the overlay covers the whole shell, so back could strand the user or exit the feature); `/all` is the hub and carries no back chevron (its Capture button is the way in); `/item/[id]` backs to `/all`. Notes now also flush on unmount in both the capture session and the detail view (SPA navigation fires no visibilitychange — the debounce window was a loss gap).
- 2026-08-28 — v2 (Arman's round-1 feedback): full-screen capture (viewport-crop preview + FULL-SENSOR shutter — deliberate non-WYSIWYG, ratified), overlay controls on gradient scrims, hide-controls Eye toggle (recording/QR chips stay), `/all` manage table (MatrxDataTable, readAllRows-complete org reads), `/item/[id]` view mode (media grid + add/delete files + SKU/notes autosave), `?item=` capture deep link, shared `ProductCaptureHeader`, `removeItemFile` chokepoint. type-check/eslint/scroll-chain green.
- 2026-08-28 — v1: DB pair created live (certified), capture surface (Mode 1 + QR Mode 2, photo/video, SKU, notes, voice notes w/ background transcription), review drawer, nav entry + `PackagePlus` shell icon, `PRODUCT_CAPTURES` folder convention. type-check green.
