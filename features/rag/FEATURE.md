# RAG Feature

Single home for everything Retrieval-Augmented Generation in this app — the doc library and processing pipeline, data stores, the document viewer, search, plus the typed API clients and React hooks every RAG surface depends on.

**Routes that live here:**
- `/rag` — landing dashboard (`components/RagHomePage.tsx`)
- `/rag/library` — processed-document library (`components/library/LibraryPage.tsx`)
- `/rag/library/[id]/preview` and `/rag/viewer/[id]` — preview / full viewer (`components/library/LibraryPreviewPage.tsx`, `components/documents/DocumentViewer.tsx`)
- `/rag/data-stores` — manage data stores and bind documents to them (`components/data-stores/DataStoresPage.tsx`)
- `/rag/repositories` — code repositories you can index for RAG (`components/RepositoriesPage.tsx`)
- `/rag/search` — multi-tab Search Lab: clean search, agent simulation, agent chat, diagnostics (`components/search/RagSearchExperience.tsx`)

---

## Layout

```
features/rag/
├── README.md                          ← this file
│
├── api/                               ← typed wire clients (mirror Pydantic shapes)
│   ├── document.ts                    GET  /api/document/*
│   ├── ingest.ts                      POST /rag/ingest{,/stream}
│   ├── search.ts                      POST /rag/search
│   └── stages.ts                      POST /rag/library/{id}/{extract,clean,chunk,embed,run-all}
│
├── hooks/                             ← all RAG-related React hooks
│   ├── useDataStores.ts               data-stores CRUD + member management
│   ├── useDocument.ts                 single-document fetch (chunks/lineage/pages)
│   ├── useFileIngest.ts               kick a file through /rag/ingest with live progress
│   ├── useLibrary.ts                  library list + summary (auto-polling)
│   ├── useProcessingRunner.ts         multi-job runner for stage + pipeline jobs
│   ├── useRagSearch.ts                /rag/search with debounce + filters
│   ├── useStageAction.ts              run a single stage (extract/clean/chunk/embed)
│   └── useStagesStatus.ts             per-doc stage-status pills
│
├── types/                             ← per-domain wire types (Pydantic mirrors)
│   ├── library.ts                     DocStatus, LibraryDocSummary, LibraryDocDetail, …
│   ├── data-stores.ts                 DataStore, DataStoreMember, …
│   ├── data-stores-ext.ts             enums (DATA_STORE_KINDS, SOURCE_KINDS, …)
│   └── documents.ts                   DocumentDetail, ChunkRow, LineageTree, PageDetail, …
│
├── animations/                        ← standalone HTML animation prototypes
│   ├── rag_pipeline_overview_animation.html
│   ├── retrieval-animation.html
│   ├── upload-pipeline-animation.html
│   └── step_{1..6}_*_animation.html   reference visuals for the 6-stage pipeline
│
└── components/                        ← UI, sub-foldered when an area is large
    ├── RagHomePage.tsx                /rag landing page
    ├── RepositoriesPage.tsx           /rag/repositories landing page
    ├── ProcessForRagButton.tsx        cross-cutting: button used by files + notes toolbars
    │
    ├── library/                       large area — own README inside
    │   ├── LibraryPage.tsx            /rag/library
    │   ├── LibraryPreviewPage.tsx     full-screen single-doc preview
    │   ├── LibraryDocDetailSheet.tsx  per-doc side sheet (read + run stages inline)
    │   ├── ProcessingProgressSheet.tsx multi-job progress sheet
    │   ├── ProcessingJobView.tsx      reusable single-job visualization (used in both sheet & detail-tab)
    │   ├── ProcessingProgressDialog.tsx legacy single-job dialog (kept for IngestProgressDialog)
    │   ├── IngestProgressDialog.tsx   files-side ingest dialog (uses useFileIngest)
    │   ├── ActiveJobsStrip.tsx        compact in-page strip for concurrent jobs
    │   ├── AnimatedKpiCard.tsx        animated count-up KPI tiles
    │   ├── StageAnimations.tsx        per-stage hero animations (extract/clean/chunk/embed)
    │   ├── StageStatusPills.tsx       4 stage-state pills (run-all + per-stage actions)
    │   ├── StatusBadge.tsx            doc-status pill
    │   ├── QuickSearchDialog.tsx      modal vector-search prompt
    │   └── README.md                  ← in-depth library architecture notes
    │
    ├── data-stores/
    │   ├── DataStoresPage.tsx         /rag/data-stores
    │   ├── DataStoreBindPanel.tsx     bind a doc to one or many data stores (used by DocumentViewer + PdfStudioInspector + PdfExtractorWorkspace)
    │   ├── RichMemberTable.tsx        members of a data store with rich source metadata
    │   └── CldFilePicker.tsx          cloud-files picker scoped for member adds
    │
    ├── documents/                     4-pane document viewer
    │   ├── DocumentViewer.tsx         resizable 4-pane shell
    │   ├── LineageBreadcrumbs.tsx     binary + processing lineage chips
    │   └── panes/
    │       ├── PdfPane.tsx            renders the original PDF page-by-page
    │       ├── CleanedMarkdownPane.tsx cleaned markdown body for the page
    │       ├── ChunksPane.tsx         virtualized chunks list (selectable)
    │       └── RawTextPane.tsx        raw extracted text per page
    │
    └── search/
        ├── RagSearchExperience.tsx    /rag/search — four-tab Search Lab (search, agent sim, agent chat, diagnostics)
        └── RagSearchHits.tsx          embeddable hit list (used by file context menu, omnibox, etc.)
```

---

## What stays outside this feature (and why)

The following live in `features/files/` even though they have "rag" in the name — they are **files-table chrome that reads `cloudFiles.ragStatus` from the cloud-files Redux slice**, not the rag feature:

- `features/files/redux/rag-thunks.ts` — `prefetchRagStatusesForFiles()` mutates the cloudFiles slice.
- `features/files/components/surfaces/desktop/RagStatusCell.tsx` — renders per-file rag status in the file table.
- `features/files/components/surfaces/desktop/RagFilterPicker.tsx` — column header filter for rag status.

Splitting them into `features/rag/` would split the cloudFiles slice across two features. They consume the moved API clients (`@/features/rag/api/ingest`) but the state and rendering stay in files.

---

## Conventions

- **Imports inside `features/rag/`** are absolute (`@/features/rag/...`). Do not introduce new `../` relative imports across sub-areas — they break when files move.
- **Imports across sub-areas inside `components/`** (e.g. `data-stores/RichMemberTable` reaching for `library/StatusBadge`) are fine — these are sister surfaces in the same feature.
- **Redux state for per-file rag status** lives in the `cloudFiles` slice (`features/files/redux/`). The rag feature itself has no slice today; it composes auth + cloud-files state via existing selectors (`selectUserId`, `selectRagStatusForFile`, etc.).
- **Backend contract** for new endpoints is documented in [`features/files/for_python/REQUESTS.md`](../files/for_python/REQUESTS.md) — that file pre-dates this consolidation and has not been moved (the Python team's bookmark stays stable).

---

## Change log

- **2026-05-06** — Feature created via consolidation. Absorbed `features/library/`, `features/data-stores/`, `features/documents/`, and `features/rag-search-ui/` into a single feature; pulled the rag-shaped pieces out of `features/files/` (api: ingest/search; hooks: useFileIngest/useRagSearch; components: ProcessForRagButton/RagSearchHits). Files-table chrome that reads `cloudFiles.ragStatus` (rag-thunks, RagStatusCell, RagFilterPicker) intentionally stayed in `features/files/`. All routes (`/rag`, `/rag/library`, `/rag/data-stores`, `/rag/search`, `/rag/repositories`, `/rag/viewer/[id]`) compile and return 200.
- **2026-05-28** — `/rag/search` rebuilt as the multi-tab Search Lab (`components/search/RagSearchExperience.tsx`); old single-pane `RagSearchPage.tsx` removed. Added `api/search-lab.ts` typed client for the new `/rag/search-lab/{diagnose,expand,inventory,agent/chat}` endpoints. Search + Agent Simulation tabs now render skeleton loaders + framer-motion entrance animations for parity with the library surfaces. `NoteToolbar`'s "Process for RAG" button surfaces a `View in library` toast on completion.
- **2026-05-28 (later)** — Agent Simulation Pipeline counts switched from inline `Stat` helpers to `AnimatedKpiCard` (count-up tween + tonal glow + pulse on increase) so the "numbers on a panel" pattern is unified app-wide. `AnimatedKpiCard.value` extended to accept `string | number | undefined` — strings render as-is (no count-up), letting the Reranker tile show the model name or "off" through the same primitive.
- **2026-05-28 (final)** — `/rag/search-lab/diagnose` now has a streaming sibling at `/rag/search-lab/diagnose/stream`. Agent Simulation consumes the stream via `ragDiagnoseStream` and progressively fills each panel as events land: query expansion → Visible chunks KPI animates 0 → N → After fusion KPI animates → hits arrive with stagger → final elapsed_ms + notes + JSON inspectors. Same `DiagnoseResponse` shape on the FE so the existing render code keeps working; the difference is *when* the fields are populated.
- **2026-05-28 (agents)** — `citationHrefFor()` in `api/search.ts` extended to handle `library_doc` (`/rag/viewer/<id>?chunk=…`), `transcript` (`/transcription/studio?session=<id>`), and `scraped` (`/scraper?url=<source_id>`). The new `rag_search` tool-call renderer (`features/tool-call-visualization/renderers/rag-search/`) consumes the canonical helper directly so chat citations now route the same way as `/rag/search` hits.
