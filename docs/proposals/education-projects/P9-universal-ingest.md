# P9 — ONBOARD: Universal Ingest, One-Click Import & Data Ownership

> **Status date:** 2026-07-07 · **Wave 1, priority tier 2 — the growth engine.**
> Read [`MASTER_PLAN.md`](./README.md) and the competitive doc §3 (O1, O2, P2-ownership) —
> one-upload→kit and one-click import are the proven onboarding/growth levers (StudyFetch, Knowt's
> 700k/season import moat, NotebookLM's one-input→many-outputs), and "never lose my work / own my
> data" is a top-9 market want (Knowt data loss, Anki ownership, NotebookLM no-export).

## Objective

Own the front door and the back door of the student's data. **Front door:** one upload (PDF, PPTX,
lecture audio, YouTube URL, photo of notes) → a full grounded study kit (deck + quiz + summary +
audio + tutor-ready grounding) in one flow — the hero onboarding experience; plus **one-click
import** from Quizlet, Anki, and CSV with media preserved — turning the incumbents' libraries into
our funnel. **Back door:** never-lose-your-work (autosave/versioning surfaced) and full data
export/ownership — the anti-lock-in commitment no AI-native rival makes.

## Current state (verified — you are elevating, not inventing)

- **Ingestion pieces exist but live inside flashcards:** all three create paths shipped —
  AI-from-topic (streaming), RAG-from-source with lineage, **CSV/Quizlet import**
  (`features/flashcards` create flows). The platform ingestion stack is real: `fileHandler`
  (single entry point — `features/files/handler/FEATURE.md`), PDF domain (`features/pdf`,
  extraction/OCR), transcription (`features/transcripts`), scraper/URL ingestion
  (`features/scraper`), audio pipeline. **Nothing orchestrates them into one kit flow.**
- **The converter contract (P4) is the dispatch layer:**
  `convertContent({source, targetKind})` — P4 defines it day 1; your kit fan-out is N calls
  through it (deck now; quiz/audio/map as P1/P3 land behind it). Do not build a second dispatch.
- **Export/versioning raw material:** platform versioning + autosave exist for working documents;
  flashcards sets have no export today; Anki `.apkg` import/export does not exist anywhere.
- **Entry surface:** the education hub landing + tools registry (`features/education/data/tools.ts`)
  — there is no onboarding hero flow today.

## Scope

**IN**
- **The Upload Hero flow** (`/education/start` or equivalent + a prominent hub entry): drop/paste
  ANY supported input (file, URL, YouTube link, photo, recording) → normalized through
  `fileHandler`/the right pipeline → user picks kit contents (deck / quiz / summary / audio /
  mind map — sensible defaults) → parallel generation with live progress → a "your study kit"
  results page linking every artifact, all association-linked to the source. Targets not yet
  live (P1/P3) appear as soon as their generators register on the converter contract —
  design for progressive enablement.
- **One-click import:** Quizlet (existing — harden; preserve images), **Anki `.apkg`**
  (cards + media + scheduling state → map review history into FSRS state where feasible), CSV
  (existing), plain-text paste. Import lands as native decks with a summary of what was preserved.
- **Data ownership:** per-deck and account-level **export** (CSV, Anki-compatible, Markdown,
  JSON), a "your data" page (export-all), and surfaced autosave/versioning on education content
  (restore a deck to yesterday). Publish the ownership pledge copy (with P8's integrity pages).
- **TrustEnvelope compliance (P0):** everything generated in the kit flow carries citations from
  the uploaded source — the hero flow is the single best showcase of grounding.
- Entitlement metering call sites (P8) on kit generation; kit sources/artifacts respect P7 access.

**OUT**
- The generators (flashcards/P1/P3 own them; you orchestrate via the converter contract).
  Pipeline internals (files/PDF/transcripts/scraper own them — extend upstream where a format
  gap is real, don't fork). Offline mode (Wave-2; keep export as the interim answer). The
  browser-extension clipper (matrx-extend, Wave 2).

## Deliverables / Definition of done

1. One real PDF upload → kit flow → a grounded, cited deck + summary (+ quiz/audio when P1/P3
   register) — all linked to the source, all in under a minute of user effort.
2. A real Quizlet export and a real Anki `.apkg` import each land as native decks with media
   intact; Anki review history maps into FSRS state (or the limitation is explicitly surfaced).
3. YouTube URL and photo-of-notes paths work end-to-end into the same kit flow.
4. Deck export round-trips: export → re-import → equivalent deck. Export-all delivers a complete
   archive.
5. Version-restore works on a deck; the ownership pledge page ships.
6. The hub landing leads with the hero flow; admin map + feature docs updated.

## Surfaces touched

- New `app/(core)/education/start/**` (or hub-integrated hero) + hub landing edits
- New `features/education/onboard/**` (kit orchestration, import adapters, export)
- `features/flashcards` import/export (harden Quizlet, add Anki/exports — coordinate with the
  flashcards agent; upstream, don't fork)
- `features/files`/`pdf`/`transcripts`/`scraper` (consume; small upstream extensions)
- `platform.associations` (source↔artifact edges), P4's converter contract (consume)

## Dependencies & contracts

- `fileHandler` ✅, PDF ✅, transcripts ✅, scraper ✅, flashcards import ✅ (as starting point).
- **Consumes:** P4 converter contract (day 1), P0 TrustEnvelope, P7/P8 signatures.
- **Coordination:** flashcards agent (import/export lives on their surface); P1/P3 (register
  generators on the contract as they land — you integrate, never wait).

## Build guidance

- One entry point for files — everything through `fileHandler`; new input shapes extend
  `FileSource` + an adapter (per the files FEATURE doc), never a parallel path.
- Anki import: parse `.apkg` (SQLite+media zip) server-side via the Python backend if TS hits a
  real wall — but try TS-side first (it's a zip + SQLite; `sql.js`-class parsing is feasible);
  document the decision.
- Progressive kit UX: stream each artifact as it completes (content-IR streaming), never a
  spinner wall.
- `canonical-associations` for lineage edges; `code-splitting` for heavy parsers;
  `type-safety`; `finalize-and-ship`.

## Verification

Real files only (no fixtures pretending to be uploads): a real textbook-chapter PDF, a real
YouTube lecture, a real Quizlet export, a real `.apkg`. Verify kit artifacts + citations + edges
in SQL; round-trip the export; restore a version. Hand Arman a five-input demo script.
