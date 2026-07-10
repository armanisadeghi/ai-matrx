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
  PDF via the pdf-extractor stream, text/markdown read inline, URL/YouTube via the scraper; every
  input is ALSO uploaded through `fileHandler` so the user owns it (and lineage is uniform).
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

## Invariants

- One entry point for files — everything through `fileHandler`; never a parallel storage path.
- One dispatch for generation — `convertContent`; never a second converter.
- Every generated artifact links a `source` edge to `ref.fileId` — lineage is never optional.
- Ingest owns raw→text; generators own text→artifact. Never mix.
- **`sql.js` (WASM) is loaded ONLY via dynamic import** (`ImportDeckPanel` → `await import(...)`),
  reachable solely when a user picks an `.apkg`. A static import chain to it eagerly compiles the
  emscripten module and hangs the page build — do not re-introduce one. (`code-splitting` skill.)

## Format coverage (honest scope + roadmap)

The hero ingests **PDF, plain text / Markdown / CSV-family files, pasted text, and URLs / YouTube
links** — that is the whole supported set today, and the UI copy is kept honest to it (the file
picker `accept` filter, the drop-zone hint "PDF, text, Markdown, or CSV", and the error copy all
name only what actually ingests). The hero headline says "Turn your material…", not "anything", for
the same reason.

**Not yet ingestable at the hero (recorded roadmap, not a silent gap):** DOCX / PPTX / other Office
formats, audio, video, and images (OCR). Each needs an ingest adapter (`useIngest` → `fileHandler`
→ extraction) before it can be advertised. Until then the copy must not imply them, and dropping an
unsupported file surfaces the honest ingest error rather than a fake success. When an adapter lands,
extend `useIngest` + the `accept` filter + the drop hint together.

## Gotchas learned

- The production `FC_AGENTS.generateFromSource` agent does NOT receive `source_content` through the
  programmatic `launchAgentExecution` path — it falls back to a generic sample. The kit deck uses a
  dedicated public agent (`0de9ff99…`, "Kit Flashcard Generator") authored for reliable in-app
  variable delivery. If the production agent's delivery is fixed, consolidate.
- The from-source card agents return NO cards for an un-chunked blob — `deck.ts` synthesizes
  `### Chunk cN` markers before sending so cards ground + cite.

## Change log

- **2026-07-10** — Honesty pass (Convergence-B): hero headline "Turn anything…" → "Turn your
  material…" so it no longer overclaims formats the hero can't ingest. Recorded the DOCX/PPTX/audio/
  video/image ingest gaps as roadmap (see "Format coverage") rather than leaving them implied. The
  converter fan-out now includes all seven live targets (quiz/practice_test/notes/audio joined
  deck/summary/mind_map) — the kit picker lights them up with no change here.
- **2026-07-07** — Shipped: Upload Hero (`/education/start`), converter fan-out (deck/summary/
  mind_map), study-summary kind on `study_media`, `/education/data` (exports + import incl. Anki
  `.apkg` + pledge), summary viewer. Verified live end-to-end (grounded deck+summary+mindmap linked
  to one source; export round-trip; Anki decode).
