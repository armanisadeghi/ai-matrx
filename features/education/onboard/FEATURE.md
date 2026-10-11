# Universal Ingest & Data Ownership (`education/onboard`)

The front door (one input → grounded study kit) and the back door (export / import / own your
data) of the Education Hub. Every kit artifact is grounded (`TrustEnvelope`), metered, and
lineage-linked: a `source` association edge to a durable `cld_files` anchor, so "the kit" is the
anchor file's associations — no new table.

## Where it lives

| Route | What |
|---|---|
| `/education/kits/new` | THE create page (`StartHero`): one Source input, then Build with AI or Saved aids (`kits/components/SavedAidsKitForm`). `/education/start` redirects here keeping `?source=`/`?from=`. Address constant: `startRoutes.ts` `NEW_KIT_HREF`. |
| `/education/data` | Your data & privacy (`DataOwnershipPage`). |
| `/education/summaries`, `/new`, `/[id]`, `/[id]/edit` | Study-summary library/viewer (`study_media` `media_kind='summary'`); the manifest `matrx-user/education-summaries` carries approval-gated create/update/delete targets (`summaryWrites.ts`). |

The kit as a place (`/education/kits[/sourceId]`) is `features/education/kits`.

## Architecture (the load-bearing split)

```
Source input ─SourceSet─▶ POST /sources/resolve ─useIngest─▶ { text, title, anchor } ─useKitGeneration─▶ convertMany
                          (server owns raw→text)                                      (converter owns text→artifact)
```

- Material enters ONLY through the unified Source input (`features/resource-manager/source-input`,
  its doors and server adapters — `FEATURE.md` § How new material lands). No local input UI or
  client-side reader here. "Topic" is not offered (a kit is grounded in material; the focus line
  carries a topic). Delivery is `["direct"]`. Picks persist across reload (`wizardDraft` key
  `source-input:education:start`, both modes).
- `kitSources.ts` (pure) turns the resolved answer into the kit text (every Source's `### Chunk`
  text joined in pick order) and the anchor: ONE Source backed by a stored file anchors on that
  `files.files` id (a later run MERGES into the same kit, nothing re-uploaded); anything else is
  kept as one `.md` the person owns (`anchorText`; a storage failure degrades to no lineage, loudly).
  A Source the server left out or read raw is listed on the board (`meta.notes`).
- `useIngest.ts` clamps to the `education.study_kit.max_source_chars` knob and reports progress.
- `useKitGeneration.ts` sequences resolve → naming → `convertMany`, exposing per-target state. It
  is a tab-bound run (`lib/wizard-draft/useTabBoundRun`, key `run:education:start:kit`) with a
  journal (frozen request, anchor, kit name, saved outputs, section conversation ids): a reload
  continues by itself (≤30 min, then one Continue), keeps the anchor, adopts outputs whose lineage
  edge landed, and reads finished sections back (`convert/sectionJournal.ts`) instead of paying again.
- `kitTitle.ts` names the kit ONCE between ingest and fan-out and that value is every generator's
  `source.title` (multi-section runs resolve `source.title` first, which used to stamp the raw
  filename on every artifact). Floor: `humanizeSourceTitle` (deterministic, always runs); on top,
  the `education.kit_title` mandate (bounded 20 s; a late answer still renames). Naming never
  blocks a kit.
- The converter (`../convert/FEATURE.md`) owns generation; targets are listed in
  `convert/generators/index.ts`. Ingest owns raw→text, generators own text→artifact; never mix.
  `notes` is ON by default; audio is a default target (VISION §5).
- The kit deck runs the `flashcards.generate_from_source` mandate via `runHeadlessAgentJson`;
  `deck.ts` synthesizes `### Chunk cN` markers because the card agents return nothing for an
  un-chunked blob.

## Data ownership

- Export (`export/deckFormats.ts`): `json` (round-trips), `md`, `anki` TSV, `csv`; per deck or the
  whole library as a zip (`useDataOwnership`). Full study-spine export and a reversible-window
  delete/restore via `data/dataRightsService.ts` (`edu_export_study_data` / `edu_delete_study_data`
  / `edu_restore_study_data`; age band + COPPA via `features/education/compliance`).
- Import: Quizlet/CSV/TSV (`parseCsvRecords`, RFC 4180), Matrx JSON, pasted pairs, Anki `.apkg`
  (media uploaded via `fileHandler` and edged to cards; review history seeded into FSRS through
  the ONE RPC `edu_import_review_history`). **`persistImportedDeck` (`import/importDeck.ts`) is THE
  one import entry (IC-11)** — never `createSetWithCards` directly. zstd `collection.anki21b` is
  refused with re-export instructions.
- `sql.js` (WASM) and jszip load ONLY by dynamic import from `ImportDeckPanel`, reachable solely
  when a user picks an `.apkg`; a static chain hangs the page build (`code-splitting` skill).
- The pledge lines on `DataOwnershipPage` are each backed by a real button; keep it so.

## Invariants

- 🚨 Kit size follows the MATERIAL: `StartHero` passes `depth` (`quick|standard|thorough`) and an
  optional exact `count`; the coverage planner spreads it across the whole document. Law and knobs:
  `../convert/FEATURE.md` § THE COVERAGE LAW.
- A document we could not read all of is a WARNING (amber banner naming how much was read), never
  a footnote.
- The board is up from the first millisecond and every stage says what it is doing: `KitBoard`
  mounts for `ingesting`, shows byte-accurate upload and per-page extraction
  (`IngestProgress.ratio/detail`), elapsed clocks, and live section counts
  (`KitTargetState.coverage`: "section 3 of 8"). A bare spinner anywhere in this flow is a defect.
- A file is uploaded ONCE: PDFs extract by `file_id` against the anchor's stored bytes.
- Every headless generation run passes an `organizationId` (`runAgentExtraction`, required by type;
  execution refuses org-less launches). The organization is resolved AT THE BUTTON (`StartHero`
  holds the press with `OrganizationContextNotice` until one is chosen), never inside the run.
- A target that creates a run must RUN it: `KitAudioRunner` hosts `useStudioRun` and persists via
  `useAudioStudyRunPersistence` (see `../media/FEATURE.md`).
- One dispatch (`convertContent`), one file door (`fileHandler`), and every artifact links a
  `source` edge to `ref.fileId` — lineage is never optional.
- Runs carry no page context (`runAgentExtraction` → `surfaceName: null`), or the namer adopts the
  page surface and burns tool calls.
- Agent fills: `kit_request_draft` on `matrx-user/education-start` (`startAgentWrites.ts`) ADDS
  Sources and never builds.
- Page-pass floors: `StartHero` root carries `matrx-touch-targets`; `KitDepthPicker`'s count input
  is `h-11` with spinners hidden.

Entitlements: the kit meters once per run (`useEntitlementGuard("education.ingest_document")` in
`StartHero`); `useKitGeneration` runs `convertMany` with no per-target guard. Limits and enforcement
live in `billing.capability*` (header of `features/entitlements/registry.ts`). Whether to guard each
target is an open owner decision in `common-docs/operations/conflicts.md` (Q-kit-per-target-cost).

Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/systems/education/STATE.md — read it before touching this feature in ANY repo.
