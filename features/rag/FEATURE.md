# RAG Feature

Single home for everything Retrieval-Augmented Generation in this app — the doc library and processing pipeline, data stores, the document viewer, search, plus the typed API clients and React hooks every RAG surface depends on.

**Routes that live here:**
- `/rag` — landing dashboard (`components/RagHomePage.tsx`)
- `/rag/library` — processed-document library (`components/library/LibraryPage.tsx`)
- `/rag/library/[id]/preview` and `/rag/viewer/[id]` — preview / full viewer (`components/library/LibraryPreviewPage.tsx`, `components/documents/DocumentViewer.tsx`)
- `/rag/data-stores` — manage data stores and bind documents to them (`components/data-stores/DataStoresPage.tsx`)
- `/rag/repositories` — code repositories you can index for RAG (`components/RepositoriesPage.tsx`)
- `/rag/search` — multi-tab Search Lab: clean search, agent simulation, **agent chat (canonical managed agent on the `matrx-user/rag-search` surface)**, diagnostics (`components/search/RagSearchExperience.tsx`)

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
│   ├── stages.ts                      POST /rag/library/{id}/{extract,clean,chunk,embed,run-all}
│   └── derivations.ts                 GET/POST /rag/library/{id}/derivations · derive/{kind} · derive-runs/{id}/cancel
│
├── hooks/                             ← all RAG-related React hooks
│   ├── useDataStores.ts               data-stores CRUD + member management
│   ├── useDocument.ts                 single-document fetch (chunks/lineage/pages)
│   ├── useFileIngest.ts               kick a file through /rag/ingest with live progress
│   ├── useKnowledgeAssetRunner.ts     per-op derivation runner (rollup + run/runAll/cancel, live counts)
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
    │   ├── KnowledgeAssetPanel.tsx    Knowledge Asset Builder — derivation rollup + per-op build/rebuild/cancel + live activity (mounted in PdfStudioInspector "Assets" + LibraryDocDetailSheet "Knowledge Asset" tab)
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
    ├── search/
    │   ├── RagSearchExperience.tsx    /rag/search — four-tab Search Lab (search, agent sim, agent chat, diagnostics)
    │   └── RagSearchHits.tsx          embeddable hit list (used by file context menu, omnibox, etc.)
    │
    └── agent-context/
        └── buildRagSearchContextData.ts  canonical `contextData` + menu props for the `matrx-user/rag-search` surface (Search tab box + results)
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

## Shared Knowledge Resources

Curated, system-owned RAG content (canonical example: the **AMA Guides 5th Edition**) ingested **once** and published **read-only** to many tenants by audience — without each tenant re-processing it, and without letting them mutate it.

**The read/write asymmetry (why read-only is free):** these stores are owned by a dedicated **"Matrx Library" org** (`system_orgs.key='library'`). WRITE/manage is gated by data-store ownership (`can_access_data_store` = creator/org-member) — no tenant qualifies, so every mutation 403s with no new code. READ is granted by a single OR-branch in the RAG visibility clause (`matrx_rag.search._build_visibility_clause`) admitting a chunk when its source's data_store has a grant reaching the caller.

**Three-tier audience = one primitive** (`rag.data_store_grants`): `global` | `industry` (→ orgs in that [industry](../industries/FEATURE.md)) | `organization` (a direct grant or self-service opt-in on a `discoverable` store). Grants attach to the container, so they cover every member source's chunks.

**Ingest profile:** library content is ingested with **NER + scope-association OFF** (`ingest_source(run_ner=False)`) — cross-tenant content has no tenant scopes/entities to extract, and the agent fan-out would be wasted cost.

**FE surfaces:**
- `hooks/useDataStoreGrants.ts` — publish / revoke / list grants over HTTP.
- `components/data-stores/DataStorePublishPanel.tsx` — audience-tab publish dialog (mirrors `ShareModal`; super-admin only). Opened from `DataStoresPage` for `kind:"library"` stores.
- `DataStoresPage` / `RichMemberTable` — a `'granted'` store shows a "Shared library · read-only" badge and hides Edit / Delete / Add-member / remove / drag-drop. `access` / `readOnly` ride on the data-store list/detail responses.
- Tenant catalog (browse `discoverable` + subscribe) — Phase 2; backend endpoints (`/rag/library-catalog`) already exist.

**Backend (aidream):** the ACL branch + `can_read_data_store` + grants-aware `list_data_stores`/`get_data_store` + the `run_ner` profile + `/rag/data-stores/{id}/grants` and `/rag/library-catalog` endpoints + `services/rag/library_grants.py` (wraps the SECURITY DEFINER RPCs). DB: migrations `0116`–`0119`.

**Guardrail:** this is the ownership-asymmetry model — it deliberately does NOT use `shareable_resource_registry` / `permissions` / `useSharing` (that would imply per-user grants + `has_permission()` RLS). See [`features/sharing/FEATURE.md`](../sharing/FEATURE.md).

---

## Change log

- **2026-07-01 (citations open in windows, everywhere)** — Every citation now opens in a **non-blocking window** instead of forcing a page navigation, unified behind one primitive: `components/source-inspector/useOpenCitation.ts` routes by `source_kind` — `cld_file`/`library_doc` → **Source Inspector**, `note` → **Notes window** (`initialNoteId`), `transcript` → **Transcript Studio** (`activeSessionId`), `scraped` → **Scraper window** (`url`); kinds without a window (e.g. `code_file`, which needs file objects a citation lacks) fall back to a new tab. `shouldOpenInNewTab` preserves native new-tab on modifier/middle click. Wired into every citation surface without losing prior behaviour: the `rag_search` tool cards (`RagSourceCard` — all kinds now, not just PDFs), the shared `RagSearchHits` (default click → window; `onHitClick` still wins; `<a href>` kept for new-tab), the `/rag/search` page (`RagSearchExperience` rows), and the KG citation links (`KgInspector` mentions, `KgGraphSidePanel` evidence). `tsc` clean + eslint clean; **live-verified** each route (note → Notes window, scraped → Scraper window with URL pre-filled, cld_file → Source Inspector on page 393 with the matched chunk ringed).
- **2026-06-27 (search quality + legibility + hardening)** — Rescue pass on `/rag/search` ranking and trust, spanning aidream + frontend. **Ranking (aidream `matrx-rag/search.py`):** the entity-recall lane no longer lets a 3-word title outrank real content — a 40-char content gate + `count DESC, max(length) DESC` tiebreak; MMR dedup is **granularity-aware** (same-source + different `chunk_kind`/`derivation_kind` collapse at 0.45; distinct sections stay at 0.72); embedding / multi-query / HyDE calls **degrade instead of crashing** (skip the model → lexical+entity carry the search); blank queries short-circuit (no zero-vector noise). **Deploy-gated** — live search reflects these only after aidream deploys. **Legibility (Search tab):** an **"entity match only"** warning badge + Entity-rank bar + matched-entity chips on `RichHitCard`; a **scope-summary line** under the box (resolved store / org / scope-tags / kind, spelling out that an empty org filter = ALL your orgs); **per-term coverage chips** ("indemnification ✕ 0", scoped honestly to "in these results"); the sidebar HyDE / multi-query / MMR knobs now drive the plain Search request (were Agent-tab-only). **Honesty:** OpenAI-embeddings-only deployment — the "Rerank with Cohere" control + copy are de-Cohere'd ("Rerank results", only when a reranker is configured); `QuickSearchDialog` no longer calls its lexical search "what an agent would retrieve". **Robustness:** `/rag/viewer/[id]?page=` forwards to the preview (`LibraryPreviewPage` `initialPageNumber`) so a citation lands on the hit's page; the local `citationHrefFor` was completed to mirror `api/search.ts` (every kind, `&page=`, `encodeURIComponent`); `seqRef` race guards on `runSearch`, the diagnose stream, and the agent-tool panel; invalid `?tab=` falls back to `search`; `?store_id=` is restored from the URL; null-snippet / null-score guards. Verified by the full `matrx-rag` suite (210) + full type-check + two adversarial review rounds (fix-forwards committed).
- **2026-06-27 (source inspector)** — New `components/source-inspector/` — the citation landing surface for a retrieved hit (opened from the `rag_search` tool cards; reusable by any citation surface). Given `{source_kind, source_id, page_number(s), chunk_id}` it opens the `sourceInspectorWindow` overlay → `SourceInspectorPane`: the real PDF rendered **at the exact cited page** (composes `features/pdf` `PdfPreview`'s controlled `pageNumber`) beside synced tabs that follow the page — **Match** (the matched chunk floated + ringed among its page siblings via the canonical `ChunkList`/`ChunksOnPage`, now taking `highlightChunkId`), **Clean text**, **Raw text** (focused single-page read `usePageBundle` — one `processed_document_pages` row, NOT the whole-doc load), **Extractions** (lazy `ExtractionsPane`). Identity resolved through the PDF bridge (`usePdfSurfaceLinks`); non-PDF/text-only sources degrade to the page image + text. Opened via `useOpenSourceInspectorWindow` (`features/overlays/openers/sourceInspectorWindow.tsx`). Live-verified against a real processed PDF (landed on page 12/35, real chunk highlighted, page-12 raw/clean shown), light + dark.
- **2026-06-27 (viewer search)** — `/rag/viewer/[id]` (`LibraryPreviewPage`) in-document search rebuilt and lifted to the viewer level (`hooks/useDocumentSearch.ts`). One query now drives, in lockstep: a top **search bar** (`components/library/DocumentSearch.tsx` → `DocumentSearchBar`), a **summary banner** (`DocumentSearchSummary` — match/page counts + clickable page chips that jump + highlighted best snippet), **in-place highlighting** of every literal match in the page-text pane with a per-page **match stepper** (prev/next + `n/total`, auto-scroll), and the right-rail **Results** tab (`DocumentSearchResultsList`, replaces the deleted self-contained "Test search" panel). On submit, the viewer auto-jumps to the first matched page. Cross-page reach uses server lexical hits (`…/test-search`, `page_numbers`); highlighting is literal (`computeMatches`). New generic primitive `components/text/HighlightedText.tsx` (reuses the notes `computeMatches` engine) — the canonical "render text with matched terms marked" component. The bar links out to full AI search via **`/rag/search?q=`**, which now **auto-runs** on a `?q=` deep link (`RagSearchExperience` SearchTab). Highlighting also reaches the embedded `/files` Knowledge tab.
- **2026-06-24** — Fixed Document Library detail side panel getting stuck on "Loading document…" / blank content after resize: `MatrxDynamicPanel` no longer feeds live drag sizes back into `defaultSize` (that remounted panel children and aborted detail fetches); fullscreen uses `groupRef.setLayout()` instead. `useLibraryDoc` aborts in-flight fetches, resets on close, serializes responses, and surfaces errors with Retry; re-clicking the selected row refetches.
- **2026-06-23 (knowledge assets)** — **Knowledge Asset Builder** added: an observable, controllable surface that builds the six premium derivations over an extracted doc. New `api/derivations.ts` (`fetchDerivations` / `runDeriveStream` / `cancelDeriveRun` — clones the `stages.ts` NDJSON stream shape; treats the backend's `phase:"error" + extra.cancelled` as a cooperative cancel, not a failure, and captures `run_id` from the `started` event for cancel). New `hooks/useKnowledgeAssetRunner.ts` (per-kind `OpState`, `Map<kind, AbortController>`, sequential `runAll` in canonical order `page_verification → table_row → multigranularity → page_image_caption → section_summary → synthetic_qa`; refreshes the rollup after each result so KPI counts climb live). New `components/library/KnowledgeAssetPanel.tsx` (responsive `AnimatedKpiCard`-style representation rollup + per-card Build/Rebuild/Cancel with inline progress + a rich "Live activity" strip per running op). Cancel aborts the fetch AND POSTs the cancel endpoint. Mounted in `PdfStudioInspector` ("Assets" section) and `LibraryDocDetailSheet` ("Knowledge Asset" tab). Backend live in aidream (`rag.py` derive endpoints + `services/knowledge_derivations.py`).
- **2026-06-23 (surface wiring)** — `/rag/search` **Search tab** fully agent-wired to the `matrx-user/rag-search` surface. New pure `agent-context/buildRagSearchContextData.ts` maps live search state → `createRagSearchScope` (baselines `selection`/`content`/`context` + every manifest custom value: `query`, `data_store_id`, `data_store_name`, `source_kinds`, `admin_bypass_acl`, `rerank`, `multi_query`, `use_hyde`; plus additive result extras — `search_results`, `source_ids`, `result_scores`, `result_count`). `UnifiedAgentContextMenu` (modern `placementMode`, `content-block` hidden) now mounts on BOTH the editable search box (right-click + `onTextReplace`) and the presentational results panel (`isEditable={false}`). The search `<Input>` became `ProInput` (`startIcon`, `clearable`). No manifest/`ui_surface_value` change — all emitted values were already declared.
- **2026-06-22 (agent chat)** — `/rag/search` **Agent Chat** tab rebuilt on the canonical managed-agent system. The hand-rolled chat (bespoke message state + custom tool-call rendering streaming from `ragAgentChatStream` / `/rag/search-lab/agent/chat`) was replaced with `useAgentLauncher` + `AgentConversationColumn` (same stack as `/chat` and the Projects "Use AI" tab). New registered surface `matrx-user/rag-search` (`features/surfaces/manifests/rag-search.manifest.ts` + `ui_surface`/`ui_surface_value` rows) hands the agent the page's retrieval scope (`data_store_id`, `data_store_name`, `source_kinds`, `admin_bypass_acl`, `rerank`, `multi_query`, `use_hyde`) via `runtime.surfaceName` + `applicationScope`. The RAG tool family (`rag_search`, `rag_search_data_store`, `rag_search_cross_doc`, `rag_list_data_stores`, `rag_get_data_store`, `rag_list_sources`, `rag_get_chunk`, `rag_verify_answer`) is armed on the conversation via `addedTools`. `SourceFeature` gained `"rag-search"`. `ragAgentChatStream` in `api/search-lab.ts` is now unused by this page.
- **2026-06-22** — `/rag/search` Search Lab wires Surface-A working context: `ActiveContextPanel` in the scope sidebar (desktop + mobile drawer), `ActiveScopeChips` in the tab header, and `buildRagSearchContext` / `useRagSearchContext` pass `organization_id` + `scope_ids` into `POST /rag/search` (and `useRagSearch`). Project/task selections are shown in the picker but are **not** accepted by the RAG search API today. (see section above): `rag.data_store_grants` audience model (global / industry / opt-in), read-only-by-ownership-asymmetry, NER-off library ingest profile, `DataStorePublishPanel` + read-only treatment in `DataStoresPage`/`RichMemberTable`, `useDataStoreGrants`, grants/catalog endpoints, `data-stores-ext.ts` `"library"` kind. Paired with the new `features/industries/` taxonomy. Backend ACL branch + read-widening + `services/rag/library_grants.py`; DB migrations `0116`–`0119`.
- **2026-06-21** — User-facing RAG vocabulary: "chunks" → **Segments** / **Knowledge Segments**, pipeline **chunk** stage → **segment**, in-progress **Chunking** → **Segmenting**. Canonical labels live in `constants/vocabulary.ts`; DB/API `chunk*` fields unchanged.
- **2026-06-09** — claude: **removed two `AnimatePresence` exit-driven view swaps that can leave stale content layered over live content under React Compiler** (`reactCompiler: true` — same class of bug just fixed in `AgentConversationColumn` for `/chat/new`). `StageAnimations.tsx` (`StageHero`) swapped two `absolute inset-0` panels (gradient backdrop + per-stage hero animation) on `activeStage` via `AnimatePresence mode="sync"` + `exit` — a stalled exit stacks stale stage panels; now plain keyed `motion.div`s (enter-only fade, instant unmount). `RagSearchExperience.tsx` results panel used `AnimatePresence mode="wait"` + `FADE_IN_UP` (which carries `exit`) — worse under `mode="wait"`: a stalled exit blocks the NEXT query's results from ever mounting; now a plain `key={response.query}` conditional with enter-only animation. Benign list-map `AnimatePresence` usages (job rows, chunk particles, hit cards) left as-is.
- **2026-05-06** — Feature created via consolidation. Absorbed `features/library/`, `features/data-stores/`, `features/documents/`, and `features/rag-search-ui/` into a single feature; pulled the rag-shaped pieces out of `features/files/` (api: ingest/search; hooks: useFileIngest/useRagSearch; components: ProcessForRagButton/RagSearchHits). Files-table chrome that reads `cloudFiles.ragStatus` (rag-thunks, RagStatusCell, RagFilterPicker) intentionally stayed in `features/files/`. All routes (`/rag`, `/rag/library`, `/rag/data-stores`, `/rag/search`, `/rag/repositories`, `/rag/viewer/[id]`) compile and return 200.
- **2026-05-28** — `/rag/search` rebuilt as the multi-tab Search Lab (`components/search/RagSearchExperience.tsx`); old single-pane `RagSearchPage.tsx` removed. Added `api/search-lab.ts` typed client for the new `/rag/search-lab/{diagnose,expand,inventory,agent/chat}` endpoints. Search + Agent Simulation tabs now render skeleton loaders + framer-motion entrance animations for parity with the library surfaces. `NoteToolbar`'s "Process for RAG" button surfaces a `View in library` toast on completion.
- **2026-05-28 (later)** — Agent Simulation Pipeline counts switched from inline `Stat` helpers to `AnimatedKpiCard` (count-up tween + tonal glow + pulse on increase) so the "numbers on a panel" pattern is unified app-wide. `AnimatedKpiCard.value` extended to accept `string | number | undefined` — strings render as-is (no count-up), letting the Reranker tile show the model name or "off" through the same primitive.
- **2026-05-28 (final)** — `/rag/search-lab/diagnose` now has a streaming sibling at `/rag/search-lab/diagnose/stream`. Agent Simulation consumes the stream via `ragDiagnoseStream` and progressively fills each panel as events land: query expansion → Visible chunks KPI animates 0 → N → After fusion KPI animates → hits arrive with stagger → final elapsed_ms + notes + JSON inspectors. Same `DiagnoseResponse` shape on the FE so the existing render code keeps working; the difference is *when* the fields are populated.
- **2026-05-28 (agents)** — `citationHrefFor()` in `api/search.ts` extended to handle `library_doc` (`/rag/viewer/<id>?chunk=…`), `transcript` (`/transcription/studio?session=<id>`), and `scraped` (`/scraper?url=<source_id>`). The new `rag_search` tool-call renderer (`features/tool-call-visualization/renderers/rag-search/`) consumes the canonical helper directly so chat citations now route the same way as `/rag/search` hits.
- **2026-05-28 (mobile)** — `/rag/search` is now fully responsive (`components/search/RagSearchExperience.tsx`). Container switched from hardcoded `h-[calc(100vh-3rem)]` to `h-dvh … md:h-page`; tab strip becomes a horizontal scroll-snap row on phones (icons + labels fit across the viewport — no Drawer hop); the scope sidebar collapses into a bottom `<Drawer>` triggered by a `PanelLeftOpen` icon in the header, rendering the SAME `ScopeSidebar` component (new `variant: "desktop" | "drawer"` prop, no shrunk-down cousin); every input/textarea/number-input in all four tabs gained `text-base` to prevent iOS auto-zoom; the Agent Chat composer footer got `pb-safe` for home-indicator safety; the rich hit-card header chips now wrap so nothing overflows at 390px. Existing skeleton loaders and framer-motion entrance animations preserved.
