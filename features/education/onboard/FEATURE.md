# Universal Ingest & Data Ownership (P9)

> **Status:** Shipped 2026-07-07. The front door (one input → grounded study kit) and the back
> door (export / import / own your data) of the Education Hub. Verified live: PDF/paste/URL →
> deck + summary + mind map, all cited and lineage-linked; export round-trips; Anki `.apkg` decode.

## What it is

**Front door — THE create page** (`/education/kits/new`; `/education/start` forwards there): Build
with AI or bundle Saved aids (`kits/components/SavedAidsKitForm`). Build with AI: drop/paste/link ANY input → a full,
grounded study kit in one flow. **Back door — Your data** (`/education/data`): export everything
in open formats, import your existing library, and a plain-English ownership pledge.

Everything the kit generates is **grounded** (P0 TrustEnvelope — citations back to the user's own
material), **metered** (P8 `education.ingest_document`), and **lineage-linked**: every artifact
gets a `source` association edge to a durable `cld_files` anchor, so "the kit" is simply the
source file's associations — no new table.

## 🚨 Material comes in through THE one Source input

`/education/kits/new` (both modes) takes material only through the unified Source input
(`features/resource-manager/source-input`, the same input as `/education/flashcards/new`): Add new =
Upload · Paste text · Web page · YouTube · Recording · Image; Use existing = the organization page's
Sources + Sources & Outputs kinds; cards with version/parts; review above the knob; picks kept
across a reload (`wizardDraft`, key `source-input:education:start` — one key for both modes).
"Topic" is not offered — a kit is grounded in material; the focus line carries a topic. Delivery
is `["direct"]` (the generators read the resolved text only, like flashcards). There is no local
input UI here and no client-side reader: every way new material becomes a Source is the Source
input's.

The picks travel as ONE `SourceSet` and are read by `POST /sources/resolve`
(`useSourceSet().resolve()`), passed into `useKitGeneration.run(resolve, …)` → `useIngest().normalizeSources`.
`kitSources.ts` (pure, `__tests__/kit-sources.test.ts`) turns the answer into the kit's text (every
Source's `### Chunk` text joined in pick order — the deck generator's join) and its anchor:

- **ONE Source with a stored file behind it** (a picked/uploaded file, or a Source read from one) →
  the kit anchors on THAT `files.files` id, so a later run over the same file MERGES into the same
  kit (`/education/kits/<fileId>`). Nothing is uploaded again.
- **Anything else** (several Sources, a web page, pasted text, a transcript) → the joined text is
  kept as one `.md` file the person owns (`anchorText`, which never sinks the run — a storage
  failure degrades to no lineage, loudly to us).

Every artifact's `source` edge (written by `convert/recordSourceLineage.ts`) points at the anchor.
A Source the server left out, or read raw, is listed on the kit board (`meta.notes`).

Creating a kit has ONE address (`startRoutes.ts` `NEW_KIT_HREF` = `/education/kits/new`); the Education home's
**Study a file you have** link opens it — Use existing sits beside every Add new door, so there is
no tab to open.

## Architecture (the load-bearing split)

```
Source input ─SourceSet─▶ POST /sources/resolve ─useIngest─▶ { text, title, anchor } ─useKitGeneration─▶ convertContent × N
                          (server owns raw→text)                                      (converter owns text→artifact)
```

- **`useIngest`** (`useIngest.ts`) reads the resolved Sources into text + a durable file anchor
  (`kitSources.ts`), clamps to the `max_source_chars` knob, and reports progress.
- **`useKitGeneration`** (`useKitGeneration.ts`) sequences resolve → **naming** → the converter
  fan-out (`convertMany`), exposing live per-target state (pending → running → success/error).
- **`kitTitle.ts`** names the kit ONCE, between ingest and fan-out, and that one value is what
  every generator receives as `source.title`. This is load-bearing, not cosmetic: each generator
  resolves its title as `singlePass ? agentTitle || source.title : source.title || agentTitle`,
  so on any MULTI-SECTION run (i.e. any long document) `source.title` wins on all of them at
  once — which is why a kit used to come out with the raw filename
  (`MatterandMeasurements`) on every artifact except the audio study, whose podcast agent titles
  its own episode. Two layers: `humanizeSourceTitle` (deterministic — extensions, separators,
  camelCase, junk tokens, casing; 8 pinned tests) is the floor and always runs, and the
  `education.kit_title` mandate names the SUBJECT from the material's opening, which is the only
  way to recover a name the filename does not contain. Naming never blocks a kit: the namer is
  best-effort and degrades to the humanized filename.
- **The converter** (`features/education/convert/`) is the shared dispatch — see its `FEATURE.md`.
  This feature is a CONSUMER; it does not own generation. Targets light up as their generators
  register (audio P3, quiz/test P1, notes P4) — no change here.

## Surfaces

| Route | What |
|---|---|
| `/education/kits/new` | THE create page (`StartHero`) — the one Source input, then Build with AI or Saved aids. Hub landing leads with it. `/education/start` forwards here. |
| `/education/data` | Your data: export/import + ownership pledge (`DataOwnershipPage`). |
| `/education/summaries/[id]` | Grounded study-summary viewer (`SummaryDetail`). |

## Data ownership (back door)

- **Export** (`export/deckFormats.ts`): `json` (full-fidelity, round-trips), `md`, `anki` (TSV
  Anki imports natively), `csv`. Per-deck or the whole library as a zip (`useDataOwnership`).
- **Import** (`import/importDeck.ts`, `import/importAnki.ts`): Quizlet/CSV/TSV (RFC-4180 CSV
  files via `parseCsvRecords` — our own CSV export re-imports), Matrx JSON round-trip
  (deck-level description/topic/difficulty preserved), pasted pairs, and **Anki `.apkg`**
  (jszip + sql.js, **dynamically imported** — see the `code-splitting` note below).
  **IC-11 (education-platform INTEGRATION_MAP): `persistImportedDeck` is THE one import
  entry** — every source (including `ImportSetView` and future extension capture) lands
  through it; never `createSetWithCards` direct. **Anki now keeps media AND review history**
  (2026-08-17, verified live end-to-end): decks/subdecks → card topic, tags → metadata,
  cloze → native cloze kind, embedded media uploaded via `fileHandler` + attached as
  fc_card → file edges (`NewCardInput.media`; no card-face renderer yet — the render seam is
  the image-lane work), and per-card interval/ease/due/reps/lapses mapped to FSRS and seeded
  through the ONE sanctioned RPC `edu_import_review_history`
  (`migrations/edu_import_review_history.sql`; owner-checked, never overwrites existing
  mastery, writes no attempts). Still honest: zstd `collection.anki21b` is refused with
  re-export instructions.
- **Pledge** (`DataOwnershipPage`): every line is backed by a real button on the page.
- **Data rights (FERPA/COPPA)** (`data/dataRightsService.ts`, extends `useDataOwnership`): the
  page is now **"Your data & privacy"** — the per-deck exporter is joined by a full study-spine
  **export** (`edu_export_study_data`: sessions/attempts/mastery/plans/media/assessments/decks/
  quizzes → one JSON archive) and a gated, auditable, **reversible-window delete** (`edu_delete_
  study_data`, undo 30d via `edu_restore_study_data`). Age-band + COPPA status via
  `AgeBandPrivacyCard` (`features/education/compliance`). Migration
  `migrations/edu_data_rights_export_delete.sql`.

## The cleaned document — what every path produces before anything is generated

**The kit is generated from ONE text: the resolved Sources' text** (the form each card chose —
Clean text by default — narrowed to the picked parts). Its durable copy is the Sources themselves
(`docproc.processed_documents`, made by the Source input's doors) plus the kit's anchor: the picked
file, or the `.md` copy `anchorText` keeps for anything else.

Because the material is already clean before any model runs, **`notes` is ON by default** —
organizing material we already hold is the last artifact that should need opting into.

## Invariants

- 🚨 **The kit is sized by the MATERIAL, and the student can say how much they want.**
  `StartHero` passes `depth` (`quick | standard | thorough`, `KitDepthPicker`) plus an optional
  exact `count`; the converter's coverage planner spreads whatever number results across the WHOLE
  document. The law and the knobs live in [`convert/FEATURE.md`](../convert/FEATURE.md) §THE
  COVERAGE LAW — read it before touching kit sizing.
- **Extraction output is never discarded** — see "The cleaned document" above.
- **A document we could not read all of is a WARNING, not a footnote.** The source ceiling is the
  knob `education.study_kit.max_source_chars` (was a hardcoded 48,000 that silently cut a 90-page
  PDF to its first third); `KitBoard` renders an amber banner naming how much was read and what to
  do about the rest.
- **The board is up from the first millisecond, and every stage says what it is doing.** `KitBoard`
  mounts for `ingesting` too (not just `generating`), reads byte-accurate upload progress and
  per-page extraction from `IngestProgress.ratio/detail`, keeps an elapsed clock on the run and on
  every target, and names the live agent phase per row. A bare spinner anywhere in this flow is a
  defect — a 78 MB PDF spends minutes here.
- **A file is uploaded ONCE.** PDFs extract by `file_id` (`streamPdfExtractTextRemote` +
  `buildPdfSourceFromFileId`) against the bytes the anchor upload already stored; the multipart
  endpoint would send the same 78 MB a second time.
- **Every headless generation run passes an organization** (`runAgentExtraction.organizationId`,
  required by the type). Execution refuses an org-less launch, so without it every target failed
  with the opaque "The generation agent failed before returning a result" for anyone who had not
  picked an org in the sidebar.
- **A segmented target reports SECTIONS, not a spinner.** A big artifact is deliberately many
  agent calls; `KitTargetState.coverage` carries the live count and `KitBoard` renders a measured
  bar plus "section 3 of 8 · Measurements · 24 so far". An indeterminate bar for a run we can
  measure is a lie of omission.
- **A target that creates a run must RUN it.** The audio generator only creates the run row and
  stashes the request; `KitAudioRunner` hosts the same `useStudioRun` the audio-study page uses, so
  the work actually happens (and persists through the shared `useAudioStudyRunPersistence`) while
  the student watches. Creating a durable row nobody streams is the "spinner forever" bug.
- One entry point for files — everything through `fileHandler`; never a parallel storage path.
- One dispatch for generation — `convertContent`; never a second converter.
- Every generated artifact links a `source` edge to `ref.fileId` — lineage is never optional.
- Ingest owns raw→text; generators own text→artifact. Never mix.
- **`sql.js` (WASM) is loaded ONLY via dynamic import** (`ImportDeckPanel` → `await import(...)`),
  reachable solely when a user picks an `.apkg`. A static import chain to it eagerly compiles the
  emscripten module and hangs the page build — do not re-introduce one. (`code-splitting` skill.)

## Format coverage

What the front door reads is what the Source input reads — its doors and the server's file
adapters (`features/resource-manager/source-input/FEATURE.md` § How new material lands). The
former client-side readers here (`formatSupport.ts`, `officeExtract.ts`, the per-kind `useIngest`
branches and `stored-file-ingest.test.tsx`) were deleted on 2026-10-02 when the page moved onto it.

## 🚨 Open decision for Arman — per-target cost on the kit flow

The kit flow meters **once per run** (`useEntitlementGuard("education.ingest_document")` in
`StartHero`), and `useKitGeneration.run` fans out to `convertMany` with **no per-target
entitlement check at all** — even though every generator declares its own capability
(`education.generate_cards`, `quiz_generate`, `audio_generate`, `notes_generate`,
`mindmap_generate`) and the SINGLE-target dialog (`ConvertContentDialog`) does guard on
`meta.capability`.

That gap is pre-existing. What changed on 2026-08-24 is its blast radius: **audio is now a
default target**, and audio is the most expensive artifact (its own dedicated
`education.audio_generate` capability and its own meter in the single-target dialog exist for
that reason). So every default kit now runs a TTS render, gated only by the blanket
ingest meter.

This was kept ON because VISION §5 names the audio overview as part of the headline flow and
Arman re-ratified that flow on 2026-08-20 — and because all 16 education capabilities are
currently `enforced: false` (STATE.md §4.1 item 15), so no per-target guard would fire today
regardless. **The decision that is genuinely his:** either add per-target guards to the kit
flow (and decide what a partially-capped kit does — refuse that target, or refuse the run), or
accept an uncapped audio render per kit until entitlements are enforced. Do not silently
"fix" this by removing audio from the defaults — that would put the product back out of step
with the stated vision.

## Gotchas learned

- The kit deck runs the `flashcards.generate_from_source` mandate (`CONVERT_MANDATES.deckFromSource`)
  through `runHeadlessAgentJson` — variables are delivered reliably; the one-off "Kit Flashcard
  Generator" agent is retired (agent ids never live in code).
- The from-source card agents return NO cards for an un-chunked blob — `deck.ts` synthesizes
  `### Chunk cN` markers before sending so cards ground + cite.

## Change log

- **2026-10-07** — **One create page.** `StartHero` now renders at `/education/kits/new` with a
  mode switch (Build with AI · Saved aids); `/education/start` redirects there keeping
  `?source=`/`?from=`. `StartHero` reads `?source=` (pre-picks a file; an existing kit forwards to
  its page) and takes `onMade` for the Board tile.

- **2026-10-03** — **A kit build is never lost with its tab.** `useKitGeneration` runs as a
  tab-bound run (`lib/wizard-draft/useTabBoundRun`, key `run:education:start:kit`) with a JOURNAL:
  the frozen SourceSet + outputs + options + org (request), then the anchor, the kit's name, every
  output that saved, and each section's conversation id. A reload continues by itself (≤30 min;
  older → one Continue on `RunStoppedNotice`); a continuation keeps the anchor (no second `.md`),
  adopts outputs whose lineage edge landed since the run began, and reads finished sections back
  from the server (`convert/sectionJournal.ts`) instead of paying again. The board counts outputs
  ready and sections done (`kitHeadline`) — no time promise; the kit name is editable (renameKit at
  the end, or at once when done). The namer is bounded (20s) and a late answer still renames the
  kit; converter runs carry no page context (`runAgentExtraction` → `surfaceName: null`: the namer
  had adopted /education/start's surface and made 14 tool calls over the 150k-char file). Errors
  render through `ErrorNotice` + `describeFailure`. Prose removed (count hint, workspace notice
  sentences, "nothing is stuck", "written only from this material"). Output tiles wrap at 375.
  Tests: `__tests__/kit-progress-and-continuation.test.ts`, `convert/__tests__/section-journal-resume.test.ts`.

- **2026-10-02** — `/education/start` and `/education/kits/new` take material through the one
  Source input (`SourceInput`), replacing the local My files / Upload / Paste / Link pills and the
  creator's single file picker. Picks → `SourceSet` → `POST /sources/resolve` → `kitSources.ts`
  (text + anchor; test red 9 → green 11). Deleted the client-side readers. Agent fills
  (`kit_request_draft`) now ADD Sources (`input_mode` removed); the kits creator emits
  `kit_sources` and anchors `create_kits` on the picked material.
- **2026-09-29** — The study kit's organization is resolved AT THE BUTTON, never inside the run.
  `useKitGeneration` called `ensureOrgId` after ingest, so a learner with no workspace selected got a
  blocking "Which organization is this for?" dialog mid-run. `StartHero` now holds the press when no
  workspace is chosen (inline `OrganizationContextNotice` beside the button, button reads "Waiting for
  a workspace — then building"), replays it the moment one is chosen, and `run(input, kinds, options,
  orgId)` carries that org into the namer and every generator (`convertMany(..., orgId)`).
- **2026-09-27** — page-pass `/education/summaries` + `/education/summaries/[id]` (education fleet
  wave 3): type list + single-record (view-only). Root cause found: neither route had an entry in
  `route-to-surface.ts`, so both fell through the `/education` prefix to the education hub
  surface — an agent on this page saw the hub's values, never a summary's title, markdown, key
  points or trust citations. Fixed with a new `matrx-user/education-summaries` manifest
  (`features/surfaces/manifests/education-summaries.manifest.ts`, registered in `registry.ts`,
  routed in `route-to-surface.ts`), mirroring the sibling `education-mind-maps` surface (same
  `study_media` table). View-only by design — no write targets, matching the page's own "no /new
  route" decision (a summary is produced by the ingest converter, never authored here).
  `SummaryHome`/`SummaryDetail` mount `SurfaceRuntimeProvider` for list/loading/not-found/loaded
  states. Also added the missing `toolMetadata("summaries")` export on
  `app/(core)/education/summaries/[id]/page.tsx` (the record route had no tab title/favicon —
  `/education/summaries` and `/education/notes/[id]` already had it, this leaf did not).
  Readiness `partial`: DB manifest sync and a live agent probe not yet run. Verified live as
  admin@admin.com: list renders real rows and the search box, a real summary opens with its
  markdown/key points/citations intact, no console errors from the change, `pnpm check:parse` /
  `check:surface-drift` / `check:surface-routes` all clean.
- **2026-09-27** — page-pass `/education/start`: type single-record-ish AI workspace form,
  posture sharp after Linear/Notion form density. Fixed on a phone at 375px: the input-source tabs
  ("My files" / "Upload" / "Paste" / "Link") wrapped mid-word ("Uplo\nad") because the button label
  had no `whitespace-nowrap` at the size the four `flex-1` tabs were squeezed to — now
  `whitespace-nowrap` + `text-xs`/`sm:text-sm` so all four fit on one line; the "Auto" card-count
  input (`KitDepthPicker.tsx`) showed only "Au" because the number spinner arrows ate half of its
  96px box — spinners hidden (`appearance:textfield` + `-webkit-*-spin-button:appearance-none`) and
  the field raised to `h-11` (44px, was `h-9`) so it also clears the phone touch-target floor; the
  page root now carries `matrx-touch-targets` so every button on the page (depth cards, format
  chips) gets the 44px floor automatically. Verified live via `page:look --route /education/start
  --views phone-light` against the local preview: 0 small targets, tab labels one line, no console
  errors.
- **2026-09-27** — `/education/start` has its own surface, `matrx-user/education-start`: the kit request, output options, and the live build (`startSurfaceScope.ts`). One `ask` draft target, `kit_request_draft`, fills the form (pasted text, link, an owned file by id, outputs, depth, count, focus) through the form's own setters and never builds; validation in `startAgentWrites.ts` (unit-tested).
- **2026-09-26** — **Study what you already have.** New **My files** input on `/education/start`:
  the canonical file picker → `useIngest` `stored` branch → the kit anchors on the existing file
  (no upload), reusing the file's Knowledge Source text when one exists. The per-kind readers were
  extracted into one `extractFileText` shared by upload and stored paths; `formatSupport` now
  classifies any `{ name, type }` (`IngestFileLike`). Verified live as admin@admin.com on an owned
  PDF that was already a Source: picked → "Already a Knowledge Source" → ingest 595 ms (no
  extraction) → deck + summary built, 10 `source` edges on the ORIGINAL file id, 0 new files, kit
  opens at `/education/kits/<fileId>` and appears on `/education/overview`.
  Follow-up the same day: the overview now links the door (**Study a file you have** →
  `/education/start?from=files`), and the guard test landed. Live proofs as admin: a `.txt` with NO
  Source read by id (2,594 chars, summary built, `study_media -> file` edge on the original id, 0
  new files); and the refactored **Upload** path (a fresh PDF → one new file row, summary built,
  `study_media -> file` edge, kit opens at `/education/kits/<newFileId>`).

- **2026-08-22** — Gotcha about the production from-source agent not receiving variables retired: the
  kit deck runs the `flashcards.generate_from_source` mandate through `runHeadlessAgentJson`.

- **2026-08-22** — **A kit gets ONE name, and the kit became a place.** Naming: `kitTitle.ts`
  resolves the kit's name once between ingest and fan-out (`education.kit_title` over a
  deterministic filename humanizer that is never skipped) and passes it as `source.title`, so all
  eight artifacts inherit one clean human title with zero generator changes — the multi-section
  path used to stamp the raw filename on every one of them. Proven live: a paste titled
  `KrebsCycleandOxidativePhosphorylation_final_v2` produced the kit
  "Krebs Cycleand Oxidative Phosphorylation" from the humanizer alone (the namer closes the
  remaining word split once deployed). The kit: `recordSourceLineage` now carries `sourceTitle` on
  every edge, and `features/education/kits` turns the lineage this feature already wrote into a
  real surface — `/education/kits` and `/education/kits/[sourceId]`, with the door added here as
  **Open your kit** on the finished board (`KitBoard`), which is the first time a kit outlived
  the tab that made it.

- **2026-08-21** — Cleaned-document guarantee + `notes` default-on. Image OCR and audio/video
  transcription now keep a durable `(extracted).md` sibling edged to the anchor (`keepCleanCopy`),
  closing the two paths whose extraction existed only in the browser tab; `reopenSource` reads it.
  Verified live on an OCR'd image.
- **2026-08-21** — **The size fix.** A 77-slide upload produced 10 flashcards, a half-page summary,
  a 16-node map and empty notes. (a) Generation is now coverage-planned per section — the law and
  the engine live in [`convert/FEATURE.md`](../convert/FEATURE.md); this feature is the consumer.
  (b) `KitDepthPicker` gives the student quick/standard/thorough plus an exact count, which nothing
  previously offered. (c) `KitBoard` reports measured coverage per target. (d) `useIngest`'s
  hardcoded 48,000-character clamp became the knob `education.study_kit.max_source_chars` (400,000)
  and truncation is now an amber warning instead of the words "trimmed to fit". Verified live on
  the reported source: 58 cards, 44 key points, 99 nodes, full-length notes.
- **2026-08-20** — **The silent-flow fix.** A large PDF took minutes with no feedback and the second
  page was a grey board of spinners. (a) `KitBoard` replaces the old results block and mounts from
  the first moment of the run — staged, timed, coloured (`convert/targetPresentation.ts`, one
  icon+accent map, replacing the per-surface icon copy). (b) `IngestProgress` gained `ratio`/`detail`;
  uploads report real bytes and PDFs report `page N of M`. (c) PDFs now extract by `file_id` instead
  of a second multipart upload of the same bytes. (d) `runAgentExtraction` REQUIRES an
  `organizationId` (the personal org via `ctx.orgId`) — without it every generator died with an
  opaque error whenever no org was selected. (e) `KitAudioRunner` actually runs the audio target in
  place with real stage labels + percent, sharing `useAudioStudyRunPersistence` with the audio-study
  page. (f) `migrations/edu_converter_lineage_association_pairs.sql` registers all 20 converter
  lineage pairs — `note -> file` and `assessment -> file` were unregistered, so every notes / quiz /
  practice-test artifact lost its provenance with a 23514. (g) The DB agent behind
  `education.notes_generate` was a stock template with an EMPTY user message (it had never received
  `source_content`, producing notes titled "No Source Material Provided"); re-authored via
  `agent_author` to v8. Verified live on the preview server end-to-end.

- **2026-08-17** — WP5 (education-platform program): IC-11 one-entry law
  (`persistImportedDeck`; `ImportSetView` folded in), lossless JSON round-trip
  (deck-level fields), RFC-4180 CSV file import, and the full Anki completion —
  media uploaded + edged, cloze/tags/deck-paths preserved, review history seeded
  into FSRS via `edu_import_review_history` so due dates survive the switch.
  Verified live: a generated legacy-schema `.apkg` (4 notes, 3 with review
  state, 2 media files) imported through the UI; DB shows exact due-date, ease→
  difficulty, reps/lapses mapping and both media edges.
- **2026-07-15** — `/education/data` → **"Your data & privacy"**: full study-spine export +
  reversible-window delete/restore (FERPA/COPPA data rights) via `data/dataRightsService.ts` +
  the `edu_export_study_data`/`edu_delete_study_data`/`edu_restore_study_data` RPCs
  (`migrations/edu_data_rights_export_delete.sql`, applied + ledgered); age-band + COPPA status
  card (`features/education/compliance`).
- **2026-07-14** — Office documents (DOCX/PPTX/XLSX) → REAL extraction. New service
  `officeExtract.ts` (`extractOfficeText`) drives aidream's content-processing orchestrator
  (`POST /content-processing/{cld_file_id}`, `content_type: "office"` — the same pipeline PDFs get
  automatically on upload) then reads the result back via a direct `docprocDb(supabase)` read of
  `processed_documents.content` (compute in Python, read direct — no Python round-trip for the text
  itself). `formatSupport.ts` split `"office"` into real OpenXML (now supported) vs
  `"office-legacy"` (.doc/.ppt/.xls/ODF/Apple — still gated, no LibreOffice on the host).
  `INGEST_ACCEPT` now advertises `.docx`/`.pptx`/`.xlsx`(+macro variants). `useIngest` gained the
  `office` branch, `useKitGeneration`/`StartHero` unchanged (both already generic over ingest kind).
- **2026-07-14** — YouTube → REAL spoken transcript. New aidream endpoint `POST /media/youtube/transcript`
  (reuses agent `0cd86da2` via the shared `run_youtube_transcription` primitive); FE `useIngest` YouTube
  branch now calls it through `fetchYouTubeTranscript` instead of the page scraper, `formatSupport` gained
  `classifyIngestUrl`/`describeUrlSupport` (YouTube marked fully supported), and `StartHero` reads the link
  note from `describeUrlSupport`. Captionless videos fail honestly. Endpoint deploys with the next aidream
  release; FE wiring lands now and lights up on deploy.
- **2026-07-10** — Honesty pass (Convergence-B): hero headline "Turn anything…" → "Turn your
  material…" so it no longer overclaims formats the hero can't ingest. Recorded the DOCX/PPTX/audio/
  video/image ingest gaps as roadmap (see "Format coverage") rather than leaving them implied. The
  converter fan-out now includes all seven live targets (quiz/practice_test/notes/audio joined
  deck/summary/mind_map) — the kit picker lights them up with no change here.
- **2026-07-07** — Shipped: Upload Hero (`/education/start`), converter fan-out (deck/summary/
  mind_map), study-summary kind on `study_media`, `/education/data` (exports + import incl. Anki
  `.apkg` + pledge), summary viewer. Verified live end-to-end (grounded deck+summary+mindmap linked
  to one source; export round-trip; Anki decode).
