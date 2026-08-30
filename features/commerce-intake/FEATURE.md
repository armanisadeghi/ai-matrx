# Commerce Intake — FEATURE.md

**Status:** Built (W4 of the ebay-store-management build; real-phone session pending — see the
manual test script below). Routes: `/commerce/intake` (capture) · `/commerce/intake/instant`
(capture + client-run instant analysis) · `/commerce/intake/assets` (hub list) ·
`/commerce/intake/assets/[id]` (asset detail) · `/commerce/intake/answer`
(answer queue) · `/commerce/labels` (label batches) · `/commerce/labels/[batchId]`
(print run detail) · `/l/[code]` (public label resolver) · `/commerce/intake/admin` (map) ·
`/commerce/intake/v2` + `/v2/instant` (ISOLATED iPhone-style rebuild on `features/capture-camera/`
— same engine and write rules, new chrome; replaces `/commerce/intake` only after Arman approves;
read [`features/capture-camera/FEATURE.md`](../capture-camera/FEATURE.md) before touching it). Project brief + contracts:
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
  equal-width Photo · Video · Upload row (the shared animated
  `features/media-capture/components/CaptureModeBar.tsx`); the picker input carries
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

## The label pool (2026-08-29 — `labels/` module)

`commerce.label_batch` (a print run) + `commerce.label_code` (one pooled code) over the
`@ai-matrx/print/labels` seam (the extracted npm package; was `lib/label-print`). Codes are MINTED rows first (state `available`, no asset) —
14 chars from a confusable-free alphabet (no 0/O/1/I/L, ≈69 bits entropy, `labels/codes.ts`);
the printed QR payload is the resolver URL **`https://aimatrx.com/l/<code>`**; a scan accepts
BOTH the URL and the bare code (`normalizeScannedCode`). Uniqueness is DB-enforced:
`asset_identifier (org, kind, value) WHERE replaced_at IS NULL` and `label_code (org, value)`
partial/unique indexes (live 2026-08-29) — a duplicate identifier is now unrepresentable, and
reverse lookup (`resolveScannedValue`) is one indexed read.

**The claim-on-scan decision table** (`useIntakeSession.processQrCode` — the DECISION function
changed; the 5-round-reviewed qrChain serialization plumbing did NOT):

| Scan resolves to                     | Behavior                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Live identifier on the CURRENT asset | No-op ("assigned")                                                                                                        |
| Live identifier on ANOTHER asset     | Switch to/open that asset (`resumeAsset`) — never a duplicate row                                                         |
| Pooled `available` code              | Normal assign/switch flow, then `claimLabelCode` stamps `available → assigned` (state-guarded CAS + identifier back-link) |
| `void` code                          | Refused with a toast                                                                                                      |
| Unknown value                        | Legacy behavior (fresh `our_qr` row)                                                                                      |

The old "same code after 4 s absence = next unit as a NEW asset" is superseded — per-org
uniqueness forbids the duplicate row by design; re-scan now opens the existing asset.

- **Batch state is auto-derived** (`deriveBatchState`: void wins; all codes assigned/void →
  `exhausted`; `printed_at` → `printed`; else `open`), reconciled on detail load.
- **Replacement lifecycle everywhere:** a retired identifier gets `replaced_at` +
  `replaced_reason` (never deleted), which frees its slot in the live unique index. Asset
  detail: Retire per identifier + "Print label" (reprint current, or claim a new pool code,
  retiring the old primary as `label_replaced`).
- **Conversion import** (`ImportIdentifiersDialog`, papaparse CSV/paste): match assets by an
  existing identifier kind → write `client_ref`/`asset_tag` rows; optional paired our_qr
  minting claims one printed code per matched item and lands on the batch to print.
- **Knobs, not constants** (`commerce.labels`, seeded 2026-08-29 with basis + review_due):
  `default_template` (org+user), `qr_ec_level` (org, default M), `max_batch_size` (org,
  default 1000, 1..10000) — read via `useScopedKnobs` on the create-batch form / detail.
- **`/l/[code]` resolver** (`app/(public)/l/[code]/page.tsx`) is deliberately THIN: auth
  bounce keeps the destination, identifier/pool lookup under the viewer's RLS, redirect to
  the owning asset; unassigned/void/unknown render one-card answers. Richer resolution
  (public product views, chain-of-custody) is a follow-up.
- Typing: `label_batch`/`label_code` row twins are hand-declared (`labels/types.ts`) because
  this build's environment lacks a Supabase CLI token — the next `pnpm db-types` session
  repoints them at `Database["commerce"]` and deletes the casts (labels/service.ts +
  the `/l/[code]` page).

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
  components/AssetDetail.tsx          notes / identifiers (retire + print label) / EditableRows / Reprocess
  components/AssetsList.tsx           complete org list (readAllRows)
  labels/                             the label pool module (see § The label pool):
    codes.ts · service.ts · types.ts · columns/listConfig/rowActions (EntityListPage) ·
    components/ (BatchesPage, CreateLabelBatchDialog, LabelBatchDetail, PrintLabelDialog,
    ImportIdentifiersDialog)
app/(core)/commerce/intake/           capture (ssr:false client boundary) + assets + answer + admin
app/(core)/commerce/labels/           batches list + [batchId] print-run detail
app/(public)/l/[code]/                the public label resolver (thin redirect)
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

- 2026-08-29 — **Asset route identity guard.** `/commerce/intake/assets/[id]` classifies its
  segment before rendering client readers: UUIDs reach the asset workspace, the reserved
  `v2` segment redirects to `/commerce/intake/v2`, and every other segment returns the route's
  not-found boundary. Literal route names can no longer reach UUID-backed commerce reads.
- 2026-08-29 — **Mobile header actions collapse to icons.** The assets hub, answer queue,
  and asset detail keep their full labeled actions at `sm+`, while every labeled shell-header
  action uses the canonical tap target's `mobileIconOnly` mode below `sm`; accessible names
  remain explicit, and the header no longer overflows into the shell controls on phones.
- 2026-08-29 — **v2 round 3: package-completeness + adversarial-review fixes.** `@ai-matrx/capture` 0.2.x absorbs the whole review loop (filmstrip → swipe viewer → edit-with-REPLACE, tuned gestures, neighbor preload, package media-resolution cache, delete-with-consequence, audio items) — `IntakeCaptureScreenV2` now passes a `media` session (items with `src`/`resolve` via the new imperative `fetchFileBlobUrl` in `features/files/hooks/useFileBlob.ts`) and deleted its own filmstrip/pager/editor wiring. Host fixes from the 22-finding adversarial review: removal of a still-uploading artifact now deletes the row its upload creates (the second half of "edit didn't replace"); QR scanning pauses under any overlay (`onReviewOpenChange` + library/process gates); QR failures toast; upload failures after Next toast; flip hidden+guarded while recording; double-tap shutter guard; shutter-failure toast; video-probe 10s timeout; serial draft commits on unmount; library sheet paginates (60/page); v1 `MediaPager` preload slides no longer steal touches (`interactive={false}` on hidden copies). Type gate green on these files.

- 2026-08-29 — **v2 real-phone round 2 (Arman's pager/edit feedback).** Edit now REPLACES: saving from `ImageEditSheet` adds the edited frame, removes the source artifact (`session.removeArtifact`), and closes the viewer — returning to the uncropped original was a defect. Shared `MediaPager`: swipe thresholds tuned for real flicks (40px / 200 velocity, was 60/400) and a hidden NEIGHBOR-PRELOAD layer keeps ±2 photos (±1 videos) mounted so page turns stop paying mount + resolve + full-JPEG decode (the perceived "refetch" lag). My files type-clean (repo gate red on unrelated in-flight HR work).

- 2026-08-29 — **Guest-boot read guard.** The assets hub now waits for Redux auth hydration,
  a real user id, the browser access token, and the selected organization before issuing any
  `commerce` PostgREST reads. This closes the cold-boot race where persisted org context could
  launch `intake_asset` as `anon` before the Supabase session arrived; `anon` intentionally has
  no commerce schema access. A forcing unit test covers every incomplete-auth boundary.
- 2026-08-29 — **`/commerce/intake/v2` — the iPhone-style rebuild (isolated).** `IntakeCaptureScreenV2` renders the new `features/capture-camera` chrome (`CameraCapture` + required cloud port + slots) over the UNCHANGED engine: `useIntakeSession`, both write rules, QR-by-absence, uploads.ts, instant lane. Commerce affordances attach via slots (QR toggle, serial, notes, voice, Next/Break, Process). Adds: two-tap options grid (Flash/Timer/Grid/Aspect/Exposure + QR/Notes tiles), instant crop/rotate via `ImageEditSheet` (MediaPager gained optional `onEdit`, photos with local pixels only), cloud Library sheet from the recents thumb, iOS-sheet camera-blocked state. v1 untouched; swap gated on approval. type-check green.
- 2026-08-29 — **Registered `commerce` with PostgREST.**
  `migrations/expose_commerce_schema_postgrest_2026_08_29.sql` appends the schema to the
  authenticator's live `pgrst.db_schemas` value and reloads PostgREST. The migration reads and
  preserves the live fleet-wide list; it never restates a stale snapshot. This closes the
  `PGRST106 Invalid schema: commerce` boundary that prevented every direct-Supabase intake read.
- 2026-08-29 — **Permission + capture-bar pass (shared with product-capture).** IntakeCaptureScreen pre-checks `queryCameraPermission()` (known-denied → inline how-to-re-enable explainer instead of another getUserMedia), acquires with `{ combineMicPrompt: true }` (ONE combined camera+mic browser prompt covering video + voice notes), warm-holds the shared mic while in video mode, and persists the switched camera via `useAudioDevices().setCamera` so the same camera returns on the next open. The inline Photo·Video·Upload row is replaced by the shared animated `features/media-capture/components/CaptureModeBar.tsx` (spring-slide thumb, reduced-motion snap) — instant lane included (same component). Navigating to `/commerce/intake/assets` still releases the lease by camera-runtime law (camera light never outlives a consumer); iOS Safari's per-session re-prompt is by browser design — the standalone-PWA manifest is the durable-grant path (see `features/media-capture/FEATURE.md`). type-check green.
- 2026-08-29 — **The label pool + claim-on-scan** (the DB/workflow half of the commerce QR
  system). DB: `commerce.label_batch` + `commerce.label_code` via `platform.create_entity_table`
  (both `iam.canonical_certify_ok` in-migration), plus THE uniqueness fix — partial unique
  index on live `asset_identifier (org, kind, value)` (precheck found zero duplicates) and
  unique `label_code (org, value)`; records `migrations/commerce_label_pool_2026_08_29.sql` +
  `commerce_labels_knobs_2026_08_29.sql`, ledgered. Code: `labels/` module (mint / claim /
  resolve / import / print through the @ai-matrx/print/labels seam), `/commerce/labels` routes,
  `/l/[code]` resolver, claim-on-scan decision table in `useIntakeSession.processQrCode`
  (serialization plumbing untouched), `replaceIdentifier` lifecycle write, AssetDetail
  Print-label + Retire, `commerce.labels` knobs (default_template / qr_ec_level /
  max_batch_size). Behavior change: re-scanning a code live on another asset now OPENS that
  asset instead of minting a duplicate-code new asset. type-check green; live probes
  verified the unique index and the assigned-linkage CHECK both refuse.

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
