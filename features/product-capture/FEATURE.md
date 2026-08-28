# Product Capture — FEATURE.md

**Status:** Built (v1). Route: `/tools/product-capture` (`(core)`, nav "Product Capture"). Mobile-first, full-screen capture surface for warehouse-style photographing of products ahead of eBay-listing categorization.

## What it is

One immersive camera screen (modeled on the PDF scanner's `CaptureView`) where a worker moves through physical products fast:

- **Mode 1 — rapid:** shoot any number of photos, tap **Next** → the next capture starts a fresh item.
- **Mode 2 — QR auto-switch:** the ScanLine toggle watches the live preview (`useQrAutoScan` → `lib/qr/decode.ts`, 250 ms tick); a scanned code closes the current item and opens a new one carrying the code as its product id (an untouched current item just takes the code). Toggle persists in localStorage.
- **Both modes:** photo ↔ video toggle (video records the same pinned lease via `startVideoRecording`, mic on) · SKU quick-entry field (commit on Enter/blur) · collapsible autosaving notes textarea (reopen returns the caret to the END of the text) · one-tap voice notes (`useSimpleRecorder`) uploaded to the item's folder and transcribed in the background (`transcribeCloudFile` by file_id), transcript appended to the item's notes.

Everything autosaves; there is no save button anywhere. Items are created lazily on the first artifact/code/note — "Next" can never mint an empty row. The current item id persists in localStorage per org so a reload resumes mid-item. The LayoutGrid button opens the review drawer (recent org items — reopen as current, delete).

## Data model — deliberately minimal staging

`migrations/workbench_product_capture_2026_08_28.sql` (applied live + certified 2026-08-28, ledger row recorded):

| Table | Variant | Holds |
|---|---|---|
| `workbench.product_capture_item` | entity, visibility `internal`, soft-delete, unversioned | code/`code_source` (`qr`/`manual`), `notes` (transcripts append here), `folder_path` (fixed at creation), `status` (`captured`/`processed` — the downstream handoff marker) |
| `workbench.product_capture_file` | component of the item (`p_parents`) | `item_id`, `file_id` → `files.files` (CASCADE both ways), `kind` (`photo`/`video`/`audio`) |

Bytes NEVER live here — every artifact goes through `uploads.ts` → `fileHandler.upload` into the item's own folder `Product Captures/<orgId>/<code-or-itemId>` (`folderForProductCaptureItem`, `folder-conventions.ts`), **visibility `internal` + `inheritActiveScope`** so the whole org reads them without per-user grants; `metadata.product_capture = {item_id, code, kind}` stamps the linkage on the file too. Org id comes from `selectEffectiveOrganizationId` and is passed EXPLICITLY on every insert (no-db-assigned-org doctrine; `p_org_default => false`).

Item writes are version-guarded CAS (`utils/supabase/guardedUpdate`, retry-once). Notes have exactly two writers: the debounced textarea autosave (replace, flushed on item switch + visibilitychange) and the background transcript. A transcript for the item still on screen lands in the textarea and rides the same autosave (one writer for visible text); one for an item the user already left goes through `appendToItemNotes` (read-append-CAS, so it never clobbers).

## Layout

```
features/product-capture/
  types.ts              row + UI types (Database["workbench"] projections)
  service.ts            direct-Supabase CRUD, guarded item writes
  uploads.ts            the ONE cloud boundary (fileHandler.upload + linkFile)
  hooks/useProductCaptureSession.ts   session engine (items, artifacts, notes, voice)
  hooks/useQrAutoScan.ts              decode tick over the live <video>
  components/CaptureScreen.tsx        the full-screen surface (lease, shutter, video, QR, bars)
  components/NotesPanel.tsx           quick-access textarea (caret-to-end contract)
  components/VoiceNoteButton.tsx      useSimpleRecorder wrapper
  components/ItemsSheet.tsx           review drawer (Drawer, CaptureThumb, ConfirmDialog)
app/(core)/tools/product-capture/     page (SSR auth gate) + layout (metadata "PC") + ssr:false client boundary
app/(core)/tools/product-capture/admin/  FeatureAdminPage map — add every new route/component here
```

Reused, never reimplemented: camera runtime (`acquireCameraLease` / `CameraPreview` / `capturePhotoFromVideo` canvas path / `startVideoRecording`), `lib/qr/decode.ts` (THE decoder), `useSimpleRecorder` + `toAudioFile` + `transcribeCloudFile` (the audio invariants: captureLock, shared mic, one controller), `fileHandler`, `CaptureThumb`/`InlineMediaRef`, `guardedUpdate`, `ConfirmDialog`, Drawer, `@/lib/toast`. ONE `ssr:false` boundary at the route client (Fragmentation Law); everything beneath is static.

## Invariants

1. Bytes only via `uploads.ts` → `fileHandler.upload`; persist `file_id`, never a URL; render via `CaptureThumb`/`InlineMediaRef`.
2. An item's `folder_path` is set once at creation and never renamed — a code assigned later lives on the row + file metadata only.
3. QR dedupe: the current item's own code never re-fires; a repeat value re-fires only after 4 s out of frame.
4. Voice note and video recording never run together (the app-wide capture lock would take over) — the UI disables the other control.
5. Downstream consumers read items by `organization_id` + `status='captured'` and flip `status` to `processed` — never delete to consume.

## Change log

- 2026-08-28 — v1: DB pair created live (certified), capture surface (Mode 1 + QR Mode 2, photo/video, SKU, notes, voice notes w/ background transcription), review drawer, nav entry + `PackagePlus` shell icon, `PRODUCT_CAPTURES` folder convention. type-check green.
