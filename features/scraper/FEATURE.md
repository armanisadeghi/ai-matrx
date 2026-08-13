# FEATURE.md — `data-ingestion` (scraper + pdf-extractor + research + transcripts)

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-08-10`

> This file lives in `features/scraper/` because scraper is the largest surface, but it is the **umbrella doc for four sibling ingestion pipelines**: `features/scraper/`, `features/pdf-extractor/`, `features/research/`, `features/transcripts/`. They share a single role: pull external data into Matrx and make it consumable by agents and other parts of the system.

---

## Purpose

Four sibling pipelines that pull external data (web pages, PDFs, multi-stage research jobs, audio/video) and persist the result so agents and downstream UIs can consume it. Every pipeline is long-running and streams progress under the same NDJSON contract used by the agents system.

---

## Scope

This doc covers four features as a single ingestion tier:

| Feature       | Directory                 | Role                                                                    |
| ------------- | ------------------------- | ----------------------------------------------------------------------- |
| Scraper       | `features/scraper/`       | Web scraping + keyword search + search-and-scrape                       |
| PDF Extractor | `features/pdf-extractor/` | Multipart upload → text extraction → optional AI cleanup                |
| Research      | `features/research/`      | Multi-stage pipeline: search → scrape → analyze → synthesize → document |
| Transcripts   | `features/transcripts/`   | Audio/video upload → Whisper transcription → segmented persistence      |

They are grouped here because they share invariants (NDJSON streaming, Python-backend offload, Supabase persistence, agent-consumable results). Each has its own UI and DB tables.

---

## Scraper

**Purpose:** scrape one or more URLs, optionally first running a keyword web search. Returns rich per-URL payloads — markdown-rendered text, structured data, organized sections, images, links, metadata.

**Entry points**

- Routes: `app/(transitional)/scraper/` (`quick`, `search`, `search-and-scrape`; `[id]` redirects to `/scraper` — legacy socket task links retired)
- Hook: `useScraperApi()` — `features/scraper/hooks/useScraperApi.ts`. Single hook for all scrape/search endpoints; buffers NDJSON, resolves when `end` arrives.
- Agent analysis tabs (full scrape): `useScraperAgentAnalysis()` + `parts/agent-analysis/*` — Fact Checker and Keyword Analysis via `useRunAgent` (see `constants/analysis-agents.ts`).
- Display: `parts/ScrapedResultDetailTabs.tsx`, `parts/core/*`, `parts/tabs/*`.
- **No Next.js proxy.** `useScraperApi()` is the ONE client path to these endpoints, browser → Python directly. The old `app/api/scraper/content/route.ts` relay was deleted 2026-08-09 — it forwarded the client's own auth headers, so it added no anon boundary, only a second hand-written copy of the request options and the NDJSON flattening. Never reintroduce a Next route in front of a scraper endpoint.
- 🚨 **These endpoints require a SIGNED-IN user, not a guest.** aidream mounts all of `/scraper` under `Depends(require_authenticated)`, so a fingerprint-only caller gets `401 token_required` — either header spelling. **Never call a `/scraper` endpoint from an anonymous surface.** The public `/seo` analyzers used to, and 401'd for every visitor on a page that never offers sign-in (D137, fixed 2026-08-09 — they now read meta tags through the guest-friendly `/seo/public/page-audit` via `features/marketing/seo/public-tools/usePublicPageMetadata.ts`). Guest-capable SEO work belongs on aidream's `/seo/public` router (`require_guest_or_above`), not on a frontend workaround.
- Request types are **aliases of the generated backend contract** (`types/python-generated/api-types.ts` → `features/scraper/types/scraper-api.ts`). Regenerate with `pnpm sync-types`; never hand-write a second option set.
- **Agent surface (`matrx-user/scraper`):** `features/scraper/agent-context/buildScraperContextData.ts` (pure map of live workspace state → `createScraperScope`, emitting baselines `content`/`selection`/`context` + the manifest's custom values), `SCRAPER_CONTEXT_MENU_PROPS`, and `agent-context/scraperExtraSections.ts` (page-op menu items). Mounted in `parts/ScraperFloatingWorkspace.tsx`: v3 `EditableContextMenu` wraps the editable URL/keyword config region (inputs are `ProInput`) and `NonEditableContextMenu` the read-only `ScrapedResultDetailTabs` results region. Keyword inputs in `parts/ScraperKeywordSearchPanel.tsx` are `ProInput`. Manifest: `features/surfaces/manifests/scraper.manifest.ts`.

**Endpoints (Python backend, declared in `lib/api/endpoints.ts`)**

- `POST /scraper/quick-scrape`
- `POST /scraper/search`
- `POST /scraper/search-and-scrape`
- `POST /scraper/search-and-scrape-limited`
- `POST /scraper/mic-check`

**Data model**

- Scrapes themselves are **not** currently persisted to Supabase by the hook; result is held in component state and optionally fed into `rs_source` (research) or an agent context. Persistence is the caller's responsibility.
- Raw result envelope typed as `ScraperResult` (`features/scraper/hooks/useScraperApi.ts`) and `QuickScrapeRequest` / `SearchResultItem` in `features/scraper/types/scraper-api.ts`.

---

## PDF Extractor

**Purpose:** upload one or many PDFs/images, stream per-file completion, persist extracted text to the backend DB, optionally run an AI cleanup pass.

**Entry points**

- Hook: `usePdfExtractor()` — `features/pdf-extractor/hooks/usePdfExtractor.ts`. Manages tabs, batch upload, NDJSON consumption, history, AI cleanup.
- Component: `features/pdf-extractor/components/PdfExtractorWorkspace.tsx`
- Demo route: `app/(public)/demos/api-tests/pdf-extract`
- Endpoints (Python backend — see **`features/pdf-extractor/API.md`**):
  - `POST /utilities/pdf/extract-text` — single file, synchronous, no persistence
  - `POST /utilities/pdf/batch-extract` — multipart batch, **NDJSON stream** with per-file `data` events
  - `GET /utilities/pdf/documents` — paginated history
  - `GET /utilities/pdf/documents/{doc_id}` — single document
  - `POST /utilities/pdf/clean-content/{doc_id}` — AI cleanup, NDJSON stream

**Data model**

- DB rows owned by the Python backend; read model is the `PdfDocument` type in `usePdfExtractor.ts` (`id`, `name`, `content`, `clean_content`, `source` cld_files signed URL, timestamps).
- Raw files land in `cld_files` (AWS S3) asynchronously via the Python backend — `source` may be `null` briefly after extraction; re-fetch resolves it.

**Python microservice:** extraction runs on the Python backend (OCR + parsing is out of TypeScript's capability per CLAUDE.md). The Next.js app never talks to OCR libs directly.

---

## Research

**Purpose:** AI-powered research with human-in-the-loop curation. A topic owns keywords, sources, content, analyses, syntheses, tags, documents, media. The backend orchestrates search → scrape → analyze → synthesize → document generation; the frontend curates each step.

**Entry points**

- Routes: all under `app/(public)/p/research/` — `topics`, `topics/new`, `topics/[topicId]` and its sub-routes (`sources`, `keywords`, `analysis`, `document`, `tags`, `media`, `costs`, `settings`). Server Components fetch topic + overview counts before handing to a client store.
- Service (client): `features/research/service.ts` — Supabase CRUD over `rs_*` tables.
- Service (server): `features/research/service/server.ts` — server-side Supabase for layouts (`getTopicServer`, `getTopicOverviewServer`).
- Python endpoints: `features/research/service/research-endpoints.ts`.
- Hooks: `useResearchApi`, `useResearchStream` (NDJSON + progress), `useResearchState`, `useSourceFilters`, `useTopicContext`, `useTopicId`, `useTopicData`, `useTopicProgress`, `useStreamDebug`.
- State: Zustand store `features/research/state/topicStore.ts` with `TopicStoreInitialData` (pre-populated by server layout — no skeleton flash).
- Context: `features/research/context/ResearchContext.tsx`.
- Streaming guide: `app/(public)/p/research/RESEARCH_STREAMING_GUIDE.md`.

**Data model (Supabase `rs_*` tables)**
`rs_topic`, `rs_keyword`, `rs_keyword_source`, `rs_source`, `rs_source_tag`, `rs_content`, `rs_analysis`, `rs_synthesis`, `rs_tag`, `rs_document`, `rs_media`, `rs_template`. RPC: `get_topic_overview(topic_id)` returns aggregated counts in a single call.

**Python microservice:** suggest (LLM), create topic, add keywords, search/scrape/analyze/synthesize (NDJSON streams), pipeline orchestration, document generation, tag consolidation, content versioning, cost aggregation. See `README.md` → "Data Fetching Strategy".

---

## Transcripts

**Purpose:** database-backed audio/video transcript store. Upload audio, transcribe with Groq Whisper Large V3 Turbo, persist segments (timecoded + speaker-labeled), edit, organize, export.

**Entry points**

- Route: `app/(a)/transcripts/` — public URL `/transcripts` (legacy `/transcripts` → permanent redirect in `next.config.js`).
- Service: `features/transcripts/service/transcriptsService.ts` (CRUD + cld_files deletion), `service/audioStorageService.ts` (audio uploads via the universal file handler).
- Context: `features/transcripts/context/TranscriptsContext.tsx` — optimistic updates, real-time subscription, `createTranscript`, `updateTranscript`, `deleteTranscript`, `copyTranscript`, `refreshTranscripts`.
- Hooks: `useFileSrc` (resolves a renderable URL; signed-URL refresh handled centrally by the handler's expiry-wheel).
- Components: `TranscriptsLayout`, `TranscriptsHeader` (portal-injected), `TranscriptsSidebar`, `TranscriptViewer`, `CreateTranscriptModal` (Upload Only / Upload & Transcribe), `ImportTranscriptModal`, `RecordingInterface`, `RecordingPreview`, `DeleteTranscriptDialog`, `DraftIndicator`.

**Data model (Supabase)**

- Table `transcripts` (see `features/transcripts/migrations/create_transcripts_table.sql`): `id`, `user_id`, `title`, `description`, `segments` (JSONB), `metadata` (JSONB), `audio_file_path`, `video_file_path`, `source_type` (`audio`|`video`|`meeting`|`interview`|`other`), `tags[]`, `folder_name`, `is_deleted`, `is_draft`, `draft_saved_at`, timestamps.
- Segment shape: `{ id, timecode, seconds, text, speaker? }`.
- Storage: audio/video files in `cld_files` (AWS S3); `audio_file_path` / `video_file_path` are cld_files UUIDs referencing them.
- RLS on `user_id`; soft-delete via `is_deleted`.
- GIN indexes on `tags` and FTS over `title + description`.

**Tasks integration:** tasks reference transcription widget philosophy (`features/tasks/widgets/TaskTapButton.tsx`); transcripts are a standalone feature but serve as input material attachable to tasks and agent runs.

---

## Key flows

### 1. Trigger a scrape / extract / research / transcribe job

Every pipeline starts with an authenticated `POST` (Supabase JWT via `useBackendApi` / `useApiAuth`) to a Python-backend endpoint. Scraper and PDF go through `ENDPOINTS.scraper.*` / `ENDPOINTS.pdf.*`; research goes through `research-endpoints.ts`; transcripts uploads audio to `cld_files` via the universal file handler first, then calls the transcription endpoint with the cld_files UUID.

### 2. Stream progress via NDJSON

All long-running pipelines emit NDJSON: one JSON object per line, event types `phase` | `info` | `data` | `error` | `end`. The scraper hook uses `consumeStream` from `@/lib/api/stream-parser` and the typed event helpers in `@/lib/api/types`. PDF and research pipelines follow the same contract (see each hook's inline reader). This is the **same contract** documented in `features/agents/docs/STREAMING_SYSTEM.md` — there is one streaming contract across the whole app.

Per-pipeline `data` payloads:

- **Scraper:** `{ type, metadata, results[] }` envelope, or flat result rows with `text_data` / `overview` / `url`. Normalized by `mapToScraperResult`.
- **PDF:** one `data` event per file: `{ doc_id, filename, status: "done"|"error", error }`; `info.code = "pdf_page_progress"` for live progress.
- **Research:** phase-scoped events (`searching` / `scraping` / `analyzing` / `synthesizing` / `generating`) with per-stage payloads written into `rs_*` tables by the Python side.
- **Transcripts:** Whisper result ingested into `segments` JSONB on completion.

### 3. Persist + retrieve

- **Scraper:** no automatic DB persistence — callers hold the result or forward it (e.g., save to `rs_source` when running inside research).
- **PDF:** Python backend writes the extracted doc row; raw file uploaded to `cld_files` (AWS S3) async. Retrieve via `GET /utilities/pdf/documents` or `{doc_id}`. AI cleanup writes back to `clean_content`.
- **Research:** Python writes to `rs_*` tables; the frontend reads directly via Supabase (client + server layout), then refreshes counts via the `get_topic_overview` RPC.
- **Transcripts:** frontend writes directly to `public.transcripts` via `transcriptsService.ts`; Whisper output is assembled into segments client-side before the insert.

### 4. Agent consumption

Agents consume ingestion output through two paths:

1. **Direct context injection.** A resource attached to an agent instance (see `instanceResources` in `features/agents/FEATURE.md`) may be a PDF doc id, a transcript id, or a scraped URL; the server resolves it into prompt content at turn assembly.
2. **Tool calls.** Agents invoke scraping / research / PDF lookup as tool calls (MCP or native) that hit the same Python endpoints, then hand back `doc_id` / `topic_id` / scraped-result references to persist state across turns. Durable tool calls are the norm for long-running ingestion (see `features/agents/docs/DURABLE_TOOL_CALLS_CLIENT_INTEGRATION.md`).

The boundary is: **ingestion pipelines own persistence; agents read from those tables by id.** Agents never re-scrape or re-extract content the pipeline already owns — they reference it.

---

## Invariants & gotchas

- **All long-running ingestion jobs conform to the NDJSON streaming contract.** If you add a new pipeline, implement `phase` / `info` / `data` / `error` / `end`. Do not invent a new event shape. Cross-reference `features/agents/docs/STREAMING_SYSTEM.md`.
- **The legacy ingestion surfaces in this document sit behind their existing
  Next.js routes.** The Marketing site crawler is an explicit separate product
  boundary: `features/marketing/crawler/direct-client.ts` sends authenticated
  commands and consumes only the original live NDJSON stream directly from the
  standalone scraper. Marketing history/list/detail data is never read from
  Python or AI Dream; the browser reads it directly from Supabase.
- **Each pipeline persists its results.** Downstream readers (agents, UIs) read from Supabase by id — they do not re-run the pipeline. The only exception is the raw `useScraperApi` surface, which is in-memory by design; persist explicitly when you need the result later.
- **Scraper `success: false` rows in a 200 stream.** `useScraperApi` checks `isRawScrapeRowFailed` on each result row — a failed URL in a batch surfaces via `errorDiagnostics`, not via the HTTP status. Do not assume 200 means "all URLs succeeded".
- **PDF `source` can be `null` immediately after extraction** while the Storage upload completes in the background. Re-fetch the document a moment later.
- **Research initial data is server-pre-populated.** `isLoading: false` on first render is intentional — never wrap the topic layout in `<Suspense>` or the skeleton strategy breaks.
- **Transcripts soft-delete.** `is_deleted = true` hides the row; the delete dialog also removes the audio/video file from Storage. Restoring a soft-deleted row without the file will break signed URLs.
- **AbortControllers are single-flight per hook instance.** `useScraperApi` aborts any in-flight request when a new one starts — if you need concurrent scrapes, create multiple hook instances or use `scrapeUrlSilent`.

---

## Related features

- **Streaming contract:** [`features/agents/docs/STREAMING_SYSTEM.md`](../agents/docs/STREAMING_SYSTEM.md)
- **Agent consumption:** [`features/agents/FEATURE.md`](../agents/FEATURE.md), [`features/agents/docs/DURABLE_TOOL_CALLS_CLIENT_INTEGRATION.md`](../agents/docs/DURABLE_TOOL_CALLS_CLIENT_INTEGRATION.md)
- **Tasks integration (transcripts):** [`features/tasks/FEATURE.md`](../tasks/FEATURE.md)
- **PDF API surface:** [`features/pdf-extractor/API.md`](../pdf-extractor/API.md)
- **Research reference:** [`features/research/README.md`](../research/README.md), [`app/(public)/p/research/RESEARCH_STREAMING_GUIDE.md`](<../../app/(public)/p/research/RESEARCH_STREAMING_GUIDE.md>)
- **Transcripts reference:** [`features/transcripts/README.md`](../transcripts/README.md)

---

## Change log

- **2026-08-12 — `/scraper` ROUTES adopted the `matrx-user/scraper` surface (read + write), and `normalizeUrl` hardened.** All four hub routes (`app/(core)/scraper/{,quick,search,search-and-scrape}/page.tsx`) now mount a `SurfaceRuntimeProvider` via the new `agent-context/ScraperSurfaceMount.tsx`, emitting scope through the same `buildScraperContextData` mapper the floating workspace uses. Until now only `ScraperFloatingWorkspace` emitted, even though `surfaceFromPathname` resolves every `/scraper/*` path to this surface — so an agent run started from the hub nav saw an empty scope and was offered no write tool. The write handlers moved out of the workspace component into ONE shared factory, `agent-context/scraperWriteHandlers.ts`; each mount passes only the setters it owns and is offered only the matching targets (the routes cannot switch mode — there the mode IS the route). **`normalizeUrl` (`utils/scraper-floating-helpers.ts`) now validates the scheme and host**, not just `new URL()` not throwing: Chromium accepts `new URL("https://not a url at all")` where Node rejects it, so the old guard let obvious garbage through in the only engine this runs in — a `scrape_command` write of `{url: "not a url at all"}` returned success and left it in the box. Non-web schemes (`file:`, `ftp:`) that used to be mangled into `https://file:///…` are rejected too. The Scrape buttons and the surface write handler share this one helper by design.

- **2026-08-12 — `scrape-command.ts` unit-tested; no new write targets.** A third chip assigned the scraper write half after the two entries below had already landed and been live-verified. Per `surface-write-targets`' collision rule the landed 5-target design wins outright and was left byte-for-byte intact — a competing target set over the same fields is a defect, not a merge — so this adds **only** the test file the campaign's own precedents (`sql-editor-write-targets.test.ts`, `brand-write-targets.test.ts`) carry and this module was missing. 54 cases over `features/scraper/scrape-command.test.ts` covering both limit guards (inclusive bounds, off-by-one either side, fractions, `NaN`/`±Infinity`, and the numeric STRING the workspace actually stores `maxPages` as — a guard that coerced `"5"` would let an unvalidated string reach `setMaxPages`), `isScrapeMode` (including that each INTERNAL workspace key `url|batch|web` is rejected as a public mode, since `url` is both a workspace key and a valid `input` and would otherwise dereference an undefined spec), and the `toWorkspaceMode`/`toScrapeMode` round trip. The load-bearing ones are the table invariants: the manifest builds its contract prose with `SCRAPE_MODES.find((m) => m.usesPageLimit)!.value`, and that non-null assertion is only sound while EXACTLY one mode carries each budget flag — zero throws at module load, two silently name the wrong mode in prose an agent is told to trust. Those now fail in CI instead of inside an agent run as a confusing refusal. No manifest, handler or component change; `check:surface-drift` (142 surfaces) + `type-check` clean. No new `agent.review_queue` row — a test file has no UI surface, and `/scraper` already carries three pending rows including the competing-designs decision.
- **2026-08-10 — Scraper write half extended to 5 targets (search-mode budget + selection navigation).** Additive on top of the entry below; that design landed first and stays intact. Three new `applyPolicy:"ask"` targets on the same `ScraperFloatingWorkspace` provider. `scrape_result_limit` (`mode:"draft"`) is `scrape_page_limit`'s twin for web-search mode — and it closes a genuine read-side hole: the "Max" input beside the keyword field was **never a declared surface value**, so search mode's hit budget could be neither read nor written (the page-limit contract literally had to say the result count "is not exposed on this surface"). `max_results` is now declared + emitted as its 1:1 twin. Its ceiling is 100 against the page cap's 20 on purpose: those hits come back UNSCRAPED, so 50 of them is one search request where 50 pages is 50 fetches against other people's servers. `selected_result_page` and `selected_search_hit` (`mode:"ui"`, twin `selected_hit_index` also added) move the user's view onto something this session ALREADY fetched — they fetch nothing and persist nothing, and each refuses in the modes that do not render its list, because a selection the user cannot see is not a selection. `selected_search_hit` is intentionally the furthest an agent goes toward a scrape: it puts the hit it judged worth fetching in front of the user, who presses the button. `active_result_tab` was declined on the judgment bar — a pure view flip the agent knows nothing extra about. The new bounds went into the EXISTING `scrape-command.ts` (`RESULT_LIMIT_MIN`/`_MAX`/`_DEFAULT`, `isValidResultLimit`, plus a `usesResultLimit` flag per `SCRAPE_MODES` spec) rather than a second vocabulary module, and `ScraperKeywordSearchPanel`'s two "Max" inputs and `useScraperKeywordSearchForm`'s default now render from those constants instead of re-typed literals. Live-verified with real Badass Agent runs: the Max input staged 10 → 25, the hit selection moved 0 → 4 across 10 real search hits, the results pane moved between two genuinely scraped pages, and both out-of-range indexes plus a wrong-mode call returned the handlers' own throws verbatim to the agent. `pnpm check:surface-drift` + `pnpm type-check` clean.
- **2026-08-10 — Scraper surface agent-writable; scrape-command vocabulary canonicalized.** `matrx-user/scraper` now declares 2 `mode:"draft"` / `applyPolicy:"ask"` write targets, handled on `ScraperFloatingWorkspace`'s existing `SurfaceRuntimeProvider` (`getWriteHandlers`): `scrape_command` — a partial-patch `{ mode?, url?, keyword? }` object — and `scrape_page_limit`. Both STAGE only, through the same `useState` setters the user's typing uses; **running a scrape stays a human click** (it spends real wall-clock time against someone else's server), and the results / content / metadata remain read-only observed evidence. Mode, url and keyword share ONE target on purpose: the mode decides which config input renders AND which keyword store is live (deep mode's local `keyword` vs. `useScraperKeywordSearchForm`'s `keywords`), so separate targets would let a keyword land in the store the PREVIOUS mode pointed at. The handler validates the whole patch before touching any state (no half-applied command) and throws on an incoherent pair (a `url` in a keyword mode) rather than staging it where the user cannot see it. New dependency-free `features/scraper/scrape-command.ts` is now the single owner of the mode vocabulary (public `quick|full|search` ↔ internal `url|batch|web`, the button labels, and `PAGE_LIMIT_MIN`/`_MAX`/`_DEFAULT`): the workspace's mode buttons and the Pages input render from it, `buildScraperContextData` maps `scrape_mode` through it (its local `MODE_TO_SCRAPE_MODE` table is gone), the manifest interpolates it into the agent-facing contract prose, and the handlers validate against it — so the enum an agent is told about, the enum it is checked against, and the buttons the user sees cannot drift. The `/scraper/*` route pages mount no surface runtime and so get no targets (documented in the manifest's `writeTargets` docblock). Live-verified with a real Badass Agent run: Apply staged into the real form, "Keep as is" left it untouched, an undeclared target was refused, and a forced-invalid value returned the handler's throw verbatim (`scrape_page_limit expects an integer from 1 to 20.`).
- **2026-08-12 — Scraper write targets independently re-verified; two verification gotchas written down.** Re-ran the whole matrix against `main` after the merge (both the pre-merge two-target build and the shipped one): per-target ask dialog carrying the manifest description verbatim with the enum and bounds visibly interpolated from `scrape-command.ts`, Apply staging Deep + keyword + 6 pages and a scheme-less `example.com` normalizing to `https://example.com` in quick mode, "Keep as is" leaving the form untouched, an undeclared results-tab/result-index write refused with the agent correctly naming only the targets that exist, and a forced-invalid `scrape_page_limit: 99` returning `client_tool_error: scrape_page_limit expects an integer from 1 to 20.` with nothing staged. Two corrections to what the previous entry implied. **(1) "Zero `surface-writeback` captures" is only true of the VALID path.** A deliberately-invalid call DOES capture — a `Surface writeback contract break` row (`{targetName: "scrape_page_limit", surfaceName: "matrx-user/scraper"}`) plus its user-facing error toast — reproduced identically on both builds. That is the seam working as designed; a refused write is supposed to be visible. Expect captures from your own invalid-value test and judge the run by whether the valid path is clean, rather than chasing a phantom regression. **(2) How to actually drive this surface in a browser**, which nothing recorded and which costs an hour to rediscover: the handlers live ONLY on the floating `scraperWindow` — open it via the sidebar **Windows** popover → **Dupes** → **Web Scraper** (admin-gated; `?panels=scraper` does NOT work because `UrlPanelManager` is not mounted) — and the shell header's Agents popover will still name whatever ROUTE surface is active, `matrx-user/dashboard`, never the scraper. That looks like the surface failed to mount, but it is correct: `listAgentWritableTargets()` walks the whole mounted runtime stack rather than just the depth-resolved winner, so the scraper's targets are offered to a run started from any route while its window is open.
- **2026-07-29 — Scraped metadata analysis canonicalized.** Title and
  description status now comes from `features/marketing/seo/serp/metrics.ts`,
  including pixel width and the shared character windows; no scraper-local
  SEO thresholds remain.
- **2026-07-24 — `matrx-user/scraper` manifest brought to canonical standard.** Added `urlPattern`/`intro` + 5 curated groups (target / extracted_content / page_metadata / results / run_state). New declared+emitted values: `target_url`, `search_keyword`, `max_pages` (the live config inputs), `results_overview` + `result_count` + `selected_result_index` (the sidebar page list), `search_hits` + `search_hit_count` (keyword web-search hits), `is_scraping`. Removed `scraped_content_html` and `scrape_http_status` — nothing on the FE ever emitted them (`ScraperResult` retains no raw HTML or status code). `scrape_mode` / `active_result_tab` / `scrape_success` flipped to honest `alwaysAvailable: true` (required in `createScraperScope`); `ScraperFloatingWorkspace` now forwards the full workspace state to `buildScraperContextData`.
- **2026-07-24 — One-shot scraper analysis uses the canonical scoped
  launcher.** `useScraperAgentAnalysis` declares
  `matrx-frontend`/`scraper` attribution and inherits active
  org/project/task context through `useRunAgent` → `callApi`.

- `2026-07-18` — Documented the standalone Marketing crawler exception: direct
  browser command/live-stream transport, canonical scraper persistence, and
  direct browser→Supabase durable reads with no history proxy.
- `2026-06-28` — **Prompt/recipe execution removed from scraper analysis tabs.** Fact Checker + Keyword Analysis now run through `useRunAgent` (`hooks/useScraperAgentAnalysis.ts`, `parts/agent-analysis/`, `constants/analysis-agents.ts`). Deleted `parts/recipes/*`, `ScraperResultsComponent`, and dead `features/workflows` import. `/scraper/[id]` redirects to `/scraper`. Playbook: `features/agents/migration/MIGRATE-recipe-to-agent-execution.md`.
- `2026-06-27` — Scraper UI theme pass: replaced hardcoded slate/gray/white chrome (`PageHeader`, `ContentTabs`, `SimplifiedView`, quick-scrape page, search panel headers) with semantic tokens (`bg-card`, `bg-muted`, `text-foreground`, `text-primary`) so light/dark modes stay readable. **Scraper wired as agent surface `matrx-user/scraper`.** Added `features/scraper/agent-context/` (`buildScraperContextData.ts` pure mapper + `SCRAPER_CONTEXT_MENU_PROPS` + `scraperExtraSections.ts`). `parts/ScraperFloatingWorkspace.tsx` now mounts `UnifiedAgentContextMenu` on both the editable config region (URL/keyword inputs → `ProInput`) and the read-only results region (`isEditable={false}`); keyword inputs in `parts/ScraperKeywordSearchPanel.tsx` swapped to `ProInput`. No manifest change — emits the 16 declared custom values it can source plus baselines (`scraped_content_html` / `scrape_http_status` not sourceable from the FE `ScraperResult`). `sourceFeature: "research"` (no `scraper` literal in `SourceFeature`).
- `2026-05-28` — claude: **"Process for RAG" added to the scraper floating workspace toolbar** (`parts/ScraperFloatingWorkspace.tsx`). The `<ProcessForRagButton sourceKind="scraped" sourceId={selectedScraped.url} …>` sits next to Copy and Reset in the rightActions cluster; on success the toast offers a "View in library" action. `source_kind: "scraped"` was added to the FE `IngestRequestBody` union in `features/rag/api/ingest.ts` to keep the new affordance compiling in lock-step with aidream's `IngestRequest` widening.
- `2026-05-07` — Documented transcript processor public URL `/transcripts` (studio at `/transcription/studio`; legacy `/transcripts` and `/transcript-studio` redirect in `next.config.js`).
- `2026-04-22` — claude: initial combined doc for scraper + pdf-extractor + research + transcripts.

---

> **Keep-docs-live rule (CLAUDE.md):** after any substantive change to any of the four pipelines — new endpoint, schema change, new event type, persistence contract shift — update this file, the affected per-feature README/API doc, and the Change log. A broken ingestion contract cascades into every agent run that consumes its output.
