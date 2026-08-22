# Universal Ingest & Data Ownership (P9)

> **Status:** Shipped 2026-07-07. The front door (one input → grounded study kit) and the back
> door (export / import / own your data) of the Education Hub. Verified live: PDF/paste/URL →
> deck + summary + mind map, all cited and lineage-linked; export round-trips; Anki `.apkg` decode.

## What it is

**Front door — the Study Kit hero** (`/education/start`): drop/paste/link ANY input → a full,
grounded study kit in one flow. **Back door — Your data** (`/education/data`): export everything
in open formats, import your existing library, and a plain-English ownership pledge.

Everything the kit generates is **grounded** (P0 TrustEnvelope — citations back to the user's own
material), **metered** (P8 `education.ingest_document`), and **lineage-linked**: every artifact
gets a `source` association edge to a durable `cld_files` anchor, so "the kit" is simply the
source file's associations — no new table.

## Architecture (the load-bearing split)

```
input ──useIngest──▶ { text, title, cld_files anchor } ──useKitGeneration──▶ convertContent × N
 (file/paste/url)      (ingest owns raw→text)              (converter owns text→artifact)
```

- **`useIngest`** (`useIngest.ts`) normalizes raw input → extracted text + a durable file anchor.
  PDF via the pdf-extractor stream, text/markdown read inline, a generic URL via the scraper, a
  YouTube link via the real spoken-transcript endpoint (`fetchYouTubeTranscript`); every input is ALSO
  uploaded through `fileHandler` so the user owns it (and lineage is uniform).
- **`useKitGeneration`** (`useKitGeneration.ts`) sequences ingest → **naming** → the converter
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
| `/education/start` | The Upload Hero flow (`StartHero`). Hub landing leads with it. |
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

**Ingest's product is ONE clean markdown/text blob**, and the whole kit is generated from it.
Where that cleaned text is DURABLE differs by path, and the difference is load-bearing:

| Path | Durable clean copy |
|---|---|
| PDF · Office (docx/pptx/xlsx) | `docproc.processed_documents` (the platform extracts on upload) |
| Paste · URL · YouTube transcript | the `.md` anchor IS the clean copy |
| Image OCR · audio/video transcript | a sibling `<title> (extracted).md` written by `keepCleanCopy` |

🚨 **Extraction output is never thrown away.** Image OCR and transcription used to keep only the
original bytes, so the readable version existed solely in the tab that ran the ingest — nothing
could show it to the student or re-read it. `keepCleanCopy` writes the sibling and edges it back to
the anchor (`file -> file`, `role='source'`, `metadata.targetKind='clean_copy'`), so it travels with
the original, appears as a chip under `MadeFromSource`, and
[`convert/reopenSource.ts`](../convert/reopenSource.ts) finds it from the anchor id alone.

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

## Format coverage (the honest matrix)

**ONE source of truth: `formatSupport.ts`.** `classifyIngestFile` / `describeIngestSupport` /
`INGEST_ACCEPT` decide what the front door reads for FILES; `classifyIngestUrl` / `describeUrlSupport`
do the same for URLs (generic page vs YouTube). Together they decide what the front door reads, how it
reads it, and the exact honest line the UI shows and the ingest throws. `useIngest` (the engine) and
`StartHero` (the picker `accept`, the drop-zone hint, the per-file `FileSupportNote`, and the link
note) BOTH read it, so the advertised set and the readable set can never drift. Every supported kind
routes to an **existing** platform pipeline — we wire, we don't build extractors.

| Input | Status | Pipeline (all existing) |
|---|---|---|
| PDF | ✅ | pdf-extractor stream (`streamPdfExtractText`) — native text + Tesseract OCR for scans |
| Image (png/jpg/jpeg/webp/gif/bmp/tiff) | ✅ | **same** pdf-extractor stream (it accepts images) — Tesseract OCR |
| Audio (mp3/wav/m4a/aac/ogg/flac/opus) | ✅ | Catalog STT via `transcribeSignedUrl` → aidream `/audio/transcribe-url` |
| Video (mp4/mov/webm/m4v) | ✅ | **same** Groq-Whisper URL route (it demuxes the container) |
| Text / Markdown / CSV / TSV / JSON / HTML / RTF | ✅ | read inline |
| Paste | ✅ | anchored as a durable `.md` |
| URL (generic web page) | ✅ | scraper (`useScraperApi.scrapeUrl`) |
| YouTube URL | ✅ real spoken transcript | aidream `POST /media/youtube/transcript` (agent `0cd86da2`, Gemini) via `fetchYouTubeTranscript`; captionless video → honest fail |
| Word / PowerPoint / Excel (docx/pptx/xlsx, +.docm/.pptm/.xlsm) | ✅ | aidream content-processing (`extractOfficeText`) — see below |
| Legacy Office (.doc/.ppt/.xls) / ODF / Apple (odt/odp/ods/pages/key/numbers) | ❌ gated | no LibreOffice on the app server; codec is pure-python OpenXML-only — save as .docx/.pptx/.xlsx or export to PDF |
| HEIC / HEIF photo | ❌ gated | backend OCR rejects HEIC; user exports JPG/PNG |

Every file kind is uploaded through `fileHandler` first (durable ownership) and that upload's
`cld_files` id is the lineage anchor for image/audio/video exactly as it is for PDF. Extraction
runs on the branch its kind selects; the result is `{ text, ref.fileId }` — the unchanged converter
contract. `meta.extractionMethod` records the path (`native` / `ocr` / `transcript`).

### YouTube → real transcript (shipped 2026-07-14)

The YouTube branch now calls aidream's **`POST /media/youtube/transcript`** (bare mount `/media`;
router `aidream/api/routers/youtube_transcript.py`) via `fetchYouTubeTranscript`. The endpoint reuses
the existing "YouTube Video Transcription Analysis" agent (Gemini, `youtube_url` variable; resolved
server-side inside aidream, no id in this repo) through the shared `run_youtube_transcription` service primitive — the
SAME quiet (`store=False`, no chat clutter) path the in-agent-run media resolver uses. The transcript
streams back as chunk text (`consumeStream` → `accumulatedText`); a captionless/speechless video
yields a non-fatal warning + empty text, so `useIngest` fails honestly ("try a link with captions, or
paste the transcript") rather than faking a transcript from scraped page HTML. `meta.extractionMethod`
= `"transcript"`. **Deploy note:** the endpoint ships with the next aidream release; until it is live,
the FE call 404s (honest error) — the wiring is correct and lights up on deploy.

### Office documents (DOCX / PPTX / XLSX) — shipped 2026-07-14

**Contract (two steps — compute then read, not one endpoint):**

1. **Compute** — `useIngest`'s `office` branch calls `extractOfficeText` (`officeExtract.ts`), which
   `POST`s `ENDPOINTS.contentProcessing.process(fileId)` → aidream bare route
   `/content-processing/{cld_file_id}` (public `/api/content-processing/{cld_file_id}`) with
   `{ content_type: "office", file_name }`. This is aidream's **content-processing orchestrator**
   (`aidream/services/content_processing/`) — the SAME pipeline PDFs get automatically on upload,
   triggered here interactively instead. Its `office` source adapter
   (`aidream/services/content_processing/sources/office.py`) calls
   `matrx_files.specific_handlers.office.extract_office` (pure python-docx/python-pptx/openpyxl —
   no LibreOffice, no OCR, no network) and persists clean markdown portions (one per slide/sheet;
   docx is one section) to `docproc.processed_documents` + `processed_document_pages`. Because the
   codec's output is already clean markdown, the orchestrator's LLM `clean` stage is SKIPPED
   (`content_already_clean=True` — saves a paid call per document); chunk/embed/NER still run so the
   doc is fully searchable. The stream is NDJSON; we consume it only for the terminal `data` event
   (`ContentProcessingResult`, `signature: "ContentProcessingResult"`) — `status` +
   `processed_document_id`. **The extracted text itself does NOT travel in the stream.**
2. **Read** — once the run reports `processed_document_id`, `extractOfficeText` reads
   `docproc.processed_documents.content` **directly via Supabase**
   (`docprocDb(supabase).from("processed_documents").select("content, total_pages")...`) — the exact
   canonical direct-DB-read path `features/pdf/scanner/processing.ts` already uses for this table
   (per the platform rule: Python for compute, direct Supabase for data reads). `content` is the
   portions joined with `"\n\n"` — already the full document text, no per-page fan-out fetch needed.

**Coverage is OpenXML-only, by design, and honestly gated at the edge.** `matrx_files`'s
`extract_office` reads `.docx`/`.pptx`/`.xlsx` (+ macro variants `.docm`/`.pptm`/`.xlsm`) directly;
a legacy binary container (`.doc`/`.ppt`/`.xls`, OLE/CFB magic bytes) needs a LibreOffice conversion
step (`LegacyBinaryOfficeError` if `soffice` isn't on the host) the app server doesn't run. ODF
(`.odt`/`.odp`/`.ods`) and Apple iWork (`.pages`/`.key`/`.numbers`) have no reader at all.
`formatSupport.ts` therefore splits what used to be one `"office"` kind into two: `"office"` (real
OpenXML — `OFFICE_EXT` + the three `application/vnd.openxmlformats-officedocument.*` MIME strings,
checked FIRST) → supported, routes to `extractOfficeText`; `"office-legacy"` (the broader
`OFFICE_LEGACY_EXT` pattern, checked only after `office` misses) → still honestly gated, same
"aren't supported yet" treatment HEIC gets. **`INGEST_ACCEPT` only advertises the three real OpenXML
extensions/MIMEs** — legacy variants are deliberately left off the picker's `accept` so the OS dialog
doesn't imply support that doesn't exist; a user who drags one anyway still gets the honest gate.

A failed extract (legacy format hits the app server without LibreOffice, corrupt/encrypted file,
empty document) surfaces the server's own `ErrorInfo.message` (or a clear fallback) as a thrown
`Error` — never a fake success and never a silent empty kit.

When a gap closes, extend `formatSupport.ts` (classifier + note + `INGEST_ACCEPT`) and the matching
`useIngest` branch together — never one without the other.

## Gotchas learned

- The production `FC_AGENTS.generateFromSource` agent does NOT receive `source_content` through the
  programmatic `launchAgentExecution` path — it falls back to a generic sample. The kit deck uses a
  dedicated public agent (`0de9ff99…`, "Kit Flashcard Generator") authored for reliable in-app
  variable delivery. If the production agent's delivery is fixed, consolidate.
- The from-source card agents return NO cards for an un-chunked blob — `deck.ts` synthesizes
  `### Chunk cN` markers before sending so cards ground + cite.

## Change log

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
