# Commerce Intake — FEATURE.md

**Status:** Built (W4 of the ebay-store-management build; real-phone session pending — see the
manual test script below). Routes: `/commerce/intake` (capture) · `/commerce/intake/instant`
(capture + client-run instant analysis) · `/commerce/intake/assets` (hub list) ·
`/commerce/intake/assets/[id]` (asset detail) · `/commerce/intake/answer`
(answer queue) · `/commerce/intake/admin` (map). Project brief + contracts:
`/Users/armanisadeghi/code/common-docs/projects/ebay-store-management/BUILD.md` (W4) +
`PROTOTYPE-CONCEPTS.md` (the concepts are REQUIREMENTS; the prototype's storage is not).

## What it is

The camera-first warehouse intake capture app over the C1 `commerce` schema (applied +
certified live 2026-08-29): `intake_batch`, `intake_asset`, `intake_artifact`,
`asset_identifier`, `asset_unknown`. Lands directly in a full-screen camera; items are
created lazily; nothing is ever explicitly saved; every artifact uploads immediately and
independently.

- **QR (serialized) mode:** a scan closes the current asset and opens a new one keyed by an
  `asset_identifier` row (`our_qr`, primary, machine-readable — identity is ROWS, never the
  raw string). A photo burst with NO QR in frame continues the same item (**dedupe by
  absence**, §2 policy 2: the decoder re-fires a value only after 4 s out of frame —
  `useQrAutoScan`, `currentCode: null` here so a deliberate re-scan of the SAME code after
  absence starts the next unit as a NEW asset). Typed serials land as
  `manufacturer_serial` identifier rows.
- **Untracked mode:** no asset rows at capture time — artifacts attach to the BATCH
  (`intake_asset_id` null) in monotonic `sequence_index` order; the **Break** button shoots a
  frame flagged `is_delineator` so item boundaries live in the artifact stream for downstream
  segmentation. Typed notes append onto `intake_batch.notes`.
- **Voice + video:** recorded on the same pinned camera lease / canonical recorder; stored as
  `intake_artifact` rows with `duration_ms` and **`transcript` left NULL — the pipeline
  transcribes and converges notes onto `intake_asset.notes` (§2 policy 1). This feature
  builds NO second notes store and never writes `transcript`.**
- **Answer queue** (`/commerce/intake/answer`, mobile-first): all open `asset_unknown`
  questions org-wide, ordered `skip_count ASC, priority DESC, created_at ASC`; image-first
  cards; one-tap choice chips / Yes-No; text with mic **dictation that fills the draft for
  editing, never auto-submits**; three exits — Answer · Skip for now (`skip_count`++, back of
  queue) · Not a quick answer (`deferred_at` + reason, out of the flow).
- **Upload lane (both modes):** photos/videos already on the device join the capture through
  `session.addUploads` — mime-routed (image→photo, video→video; anything else skipped with a
  toast), same fileHandler folder, same `intake_artifact` rows, same monotonic
  `sequence_index` (untracked delineator semantics untouched). Uploaded videos get their
  `duration_ms` probed client-side (the artifact CHECK requires it). The control is the
  equal-width Photo · Video · Upload row (product-capture pattern); the picker input carries
  NO `capture` attribute (that is what opens the gallery instead of the camera), and the
  camera-blocked overlay offers Upload alongside the OS camera.
- **Instant lane** (`/commerce/intake/instant`, serialized mode only): the Process button runs
  the analysis CLIENT-side through the mandate **`commerce_intake.instant_analysis`**
  (`mandate.definition`; default Holder: Electronics Intake Analyzer, output kind
  `electronics_intake_analysis`; rebindable in the mandate UI — swap the agent or bind a
  pricing workflow later, no deploy). `useInstantIntakeAnalysis` ports the proven
  product-capture architecture: photos attach as multimodal parts via
  `fileHandler.toContentPart` (NEVER `user_input`; notes ride the `dock_notes` variable),
  streaming renders through `InstantProcessSheet` → `LiveRunDisplay` / `KindInstanceRender`
  (the ONE pipeline, `__kind` kept), and three durability seams make a paid run unlosable:
  (1) the conversation pointer merges onto `intake_asset.metadata.instant_run` BEFORE the
  first token; (2) on settle, `saveInstantResult` persists `metadata.instant_analysis` AND
  moves the asset `captured → awaiting_triage` in one write; (3) returning to an asset
  rehydrates the transcript, rejoins a still-running turn (`reconnectServerOperation`) and
  backfills an orphaned result. 🚨 **Instant items never enter the server pipeline twice:**
  the W5 sweep only picks up captured/extracting/grouped/researching/valuing, the result seam
  skips past `captured`, and the instant lane's session never re-fires `finishAsset` or
  `reopenAsset` (the commerce mirror of product-capture's skip-captured semantics).
  `asset_mandate_result` is deliberately NOT written from the client — its `step` CHECK and
  W5's idempotency contract (pending-before-run, custom_id, superseded_by) make it the
  pipeline's OWN ledger; a client row there would be read back as a step output. Disclosure:
  `useDeclaredSurfaceMandates` registers the job in the top Agents menu — never page content.
- **Generic editable rows** (§2 policy 5): `AssetDetail` renders `intake_asset.attributes`
  through the shared `EditableRows` + `CommitField` primitives — human-correctable
  agent-written values without bespoke forms.

## The two ironclad write rules

1. 🚨 **The status write IS the trigger (§2 policy 3).** Finishing an item writes
   `pipeline_state = 'captured'` (and clears `metadata.capture_open`) and **NOTHING else** —
   no pipeline call, no workflow fire from client code. Agents, SQL, imports and this UI hand
   off identically; "Reprocess" on the detail page is the SAME write re-fired. Mid-capture
   rows are marked by `metadata.capture_open = true` (the schema's initial state is already
   `captured`; no invented state, no DDL).
2. **Notes flush BEFORE the close write (§2 policy 4).** `useIntakeSession.finishCurrentAsset`
   awaits the notes flush, then the status write — the transition is guaranteed to be the last
   write of the item's capture life. Notes also force-flush on item switch, `visibilitychange`
   (phone into pocket) and unmount (SPA navigation fires no visibilitychange).

## Data + files

- Bytes ONLY via `uploads.ts` → `fileHandler.upload` into the fixed folder
  `Commerce Intake/<orgId>/<batchId>/<assetId-or-batchId>` (`folderForIntakeAsset`,
  `folder-conventions.ts`) — visibility `internal` + `inheritActiveScope`; the folder is
  NEVER renamed (P13). Persist `file_id`; render via `CaptureThumb`/`InlineMediaRef`.
- Every `organization_id` is EXPLICIT on every insert (no-db-assigned-org doctrine).
- Asset writes are version-guarded CAS (`utils/supabase/guardedUpdate`, retry-once);
  batch-note and asset-note appends are server-side read-append so a late writer never
  clobbers.
- Soft delete via `deleted_at` (batch/asset/artifact); identifiers/unknowns have none.
- **Full-sensor shutter (§2 policy 6):** preview is `viewport-crop`, capture is
  `framing: "full-frame"` — the pipeline receives everything the sensor saw.
- **Mid-item resume (P12):** `{batchId, assetId, mode}` per org in localStorage; reload lands
  back in the open batch on the open item, with `sequence_index` continued from the DB
  (`maxSequenceIndex`), never restarted. `?asset=` deep link wins.

## Typing note

`commerce` is included in the generated `types/database.types.ts` (regenerated from the live
database 2026-08-29). `types.ts` projects its five persistence rows directly from
`Database["commerce"]["Tables"]`; the capture-only CHECK vocabularies remain narrow UI types
because Supabase correctly represents CHECK-constrained text columns as `string`.

## Layout

```
features/commerce-intake/
  types.ts        generated commerce row aliases + narrow UI shapes
  service.ts      direct-Supabase CRUD (batches/assets/artifacts/identifiers/unknowns),
                  guarded CAS writes, finishAsset (THE status write), queue ordering
  uploads.ts      the ONE cloud boundary (fileHandler.upload → recordArtifact)
  hooks/useIntakeSession.ts       the session engine (see rules above; `lane` picks which
                                  write closes an item — standard `captured` vs instant)
  hooks/useInstantIntakeAnalysis.ts  the instant lane (mandate run + 3 durability seams)
  components/IntakeCaptureScreen.tsx  full-screen surface (mode toggle, Break, honesty chips,
                                  Photo·Video·Upload row, instant Process button)
  components/IntakeAnswerQueue.tsx    the answer queue
  components/AssetDetail.tsx          notes / identifiers / EditableRows attributes / Reprocess
  components/AssetsList.tsx           complete org list (readAllRows)
app/(core)/commerce/intake/           capture (ssr:false client boundary) + assets + answer + admin
```

Reused, never reimplemented: camera runtime (`acquireCameraLease`/`CameraPreview`/
`capturePhotoFromVideo`/`startVideoRecording`), `useQrAutoScan` (THE decoder + the 4 s
absence rule), `VoiceNoteButton` (canonical recorder), `NotesPanel`, `MediaPager`,
`EditableRows`/`CommitField`/`PanelSection`, `ProductCaptureHeader`, `CaptureThumb`,
`fileHandler`, `guardedUpdate`, `readAllRows`, `@/lib/toast`. The product-capture imports are
the prototype-proven generic leaves — when that prototype feature is retired, they move here.
ONE `ssr:false` boundary at the route client (Fragmentation Law).

## Manual test script — the real-phone session (acceptance)

On a phone, logged into an org:

1. **QR mode:** open `/commerce/intake` (lands in camera). Scan a QR → haptic + green chip;
   shoot 3 photos with no QR in frame → verify (assets list) ONE asset with the code and 3
   photos (dedupe-by-absence: the burst continued the item). Scan a SECOND code → item
   switches. Point the FIRST code again after >4 s out of frame → a NEW asset with the same
   code (next unit).
2. **Voice + video:** on an item, record a 5 s video and a voice note. Verify two
   `intake_artifact` rows (`video`/`audio`) with `duration_ms` set and `transcript` NULL.
3. **Notes-flush-before-close:** type notes, immediately tap Next. Verify the asset row has
   the notes AND `pipeline_state='captured'` with `metadata.capture_open=false`, and the
   notes `updated_at` write preceded the state write (row version increments in that order).
4. **Status-write-is-the-trigger:** confirm nothing else fired — no workflow rows, no server
   calls beyond the two writes.
5. **Mid-item resume:** shoot 2 photos, pocket the phone, kill the tab, reopen
   `/commerce/intake` → same item resumes (label, filmstrip, sequence continues; next photo's
   `sequence_index` > the previous max).
6. **Untracked mode:** toggle ScanLine off (untracked). Shoot 2 photos, tap **Break**, shoot
   2 more. Verify 5 batch-level artifacts (`intake_asset_id` NULL) with increasing
   `sequence_index` and the middle one `is_delineator=true`.
7. **Answer queue:** insert an `asset_unknown` row (choice kind with options) for a captured
   asset; open `/commerce/intake/answer` → image-first card; one tap answers AND advances;
   Skip re-queues to the back (skip_count=1); "Not a quick answer" sets `deferred_at`.
8. **Editable rows:** on the asset detail, add/edit/remove attribute rows; verify
   `intake_asset.attributes` jsonb matches; Reprocess re-fires the captured write.
9. **Camera denied:** deny camera permission → the OS-camera fallback keeps photo capture
   working; notes and voice keep working.

## Change log

- 2026-08-29 — W4 initial build: feature + routes as laid out above, onto the live C1
  `commerce` tables. Six §2 policies implemented (transcript routing left to the pipeline —
  transcript never written client-side; QR dedupe-by-absence; status-write-is-the-trigger;
  notes-flush-before-close; generic editable rows; full-sensor shutter). Hand-typed commerce
  rows (db-types lacks the schema — see typing note). type-check green; real-phone session
  pending (script above).
- 2026-08-29 — `--schema commerce` added to `db-types`; live regeneration completed. Removed the hand-declared row
  twins and the cast-only `CommerceIntakeSchema`. Persistence now compiles against
  `Database["commerce"]` directly.
- 2026-08-29 — Ported the product-capture trial's two newest lanes into this canonical
  feature (Arman's directive; product-capture itself untouched): (1) the upload lane
  (`addUploads`, equal-width Photo·Video·Upload control, camera-blocked Upload button,
  video-duration probe for the artifact CHECK); (2) the instant lane —
  `/commerce/intake/instant`, `useInstantIntakeAnalysis`, mandate row
  `commerce_intake.instant_analysis` created live in `mandate.definition`
  (migrations/commerce_intake_instant_mode_2026_08_29.sql; key follows the W5
  `commerce_intake.*` family and the `mandate:<feature>.<key>` source-feature pattern),
  durable seams on `intake_asset.metadata` (`instant_run` + `instant_analysis`), terminal
  write `captured → awaiting_triage` keeping instant items out of the W5 sweep. Asset
  metadata now round-trips on `IntakeAsset` and every metadata write MERGES (a wholesale
  replace would orphan a run). Reused product-capture's generic leaves
  (`InstantProcessSheet`, NotesPanel/VoiceNoteButton/MediaPager/useQrAutoScan) — they move
  here when the prototype retires.
