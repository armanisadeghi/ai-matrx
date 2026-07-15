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
- **`useKitGeneration`** (`useKitGeneration.ts`) sequences ingest → the converter fan-out
  (`convertMany`), exposing live per-target state (pending → running → success/error).
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
- **Import** (`import/importDeck.ts`, `import/importAnki.ts`): Quizlet/CSV/TSV, Matrx JSON
  round-trip, pasted pairs, and **Anki `.apkg`** (jszip + sql.js, **dynamically imported** so the
  WASM never enters the page bundle — see the `code-splitting` note below). Import lands a native
  deck; what was/wasn't preserved is surfaced honestly (Anki media + review history are not yet
  mapped — stated, not silently dropped).
- **Pledge** (`DataOwnershipPage`): every line is backed by a real button on the page.
- **Data rights (FERPA/COPPA)** (`data/dataRightsService.ts`, extends `useDataOwnership`): the
  page is now **"Your data & privacy"** — the per-deck exporter is joined by a full study-spine
  **export** (`edu_export_study_data`: sessions/attempts/mastery/plans/media/assessments/decks/
  quizzes → one JSON archive) and a gated, auditable, **reversible-window delete** (`edu_delete_
  study_data`, undo 30d via `edu_restore_study_data`). Age-band + COPPA status via
  `AgeBandPrivacyCard` (`features/education/compliance`). Migration
  `migrations/edu_data_rights_export_delete.sql`.

## Invariants

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
| Audio (mp3/wav/m4a/aac/ogg/flac/opus) | ✅ | Groq-Whisper via `transcribeSignedUrl` → `/api/audio/transcribe-url` |
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
the existing "YouTube Video Transcription Analysis" agent (`0cd86da2-2679-4c10-9746-e6723779fe94`,
Gemini, `youtube_url` variable) through the shared `run_youtube_transcription` service primitive — the
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
