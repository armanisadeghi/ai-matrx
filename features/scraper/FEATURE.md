# FEATURE.md — `data-ingestion` (scraper + pdf-extractor + research + transcripts)

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-05-07`

> This file lives in `features/scraper/` because scraper is the largest surface, but it is the **umbrella doc for four sibling ingestion pipelines**: `features/scraper/`, `features/pdf-extractor/`, `features/research/`, `features/transcripts/`. They share a single role: pull external data into Matrx and make it consumable by agents and other parts of the system.

---

## Purpose

Four sibling pipelines that pull external data (web pages, PDFs, multi-stage research jobs, audio/video) and persist the result so agents and downstream UIs can consume it. Every pipeline is long-running and streams progress under the same NDJSON contract used by the agents system.

---

## Scope

This doc covers four features as a single ingestion tier:

| Feature | Directory | Role |
|---|---|---|
| Scraper | `features/scraper/` | Web scraping + keyword search + search-and-scrape |
| PDF Extractor | `features/pdf-extractor/` | Multipart upload → text extraction → optional AI cleanup |
| Research | `features/research/` | Multi-stage pipeline: search → scrape → analyze → synthesize → document |
| Transcripts | `features/transcripts/` | Audio/video upload → Whisper transcription → segmented persistence |

They are grouped here because they share invariants (NDJSON streaming, Python-backend offload, Supabase persistence, agent-consumable results). Each has its own UI and DB tables.

---

## Scraper

**Purpose:** scrape one or more URLs, optionally first running a keyword web search. Returns rich per-URL payloads — markdown-rendered text, structured data, organized sections, images, links, metadata.

**Entry points**
- Routes: `app/(authenticated)/scraper/` (`quick`, `search`, `search-and-scrape`, `[id]`), public demos at `app/(public)/demos/scraper/`
- Hook: `useScraperApi()` — `features/scraper/hooks/useScraperApi.ts`. Single hook for all endpoints; buffers NDJSON, resolves when `end` arrives. Methods: `scrapeUrl`, `scrapeUrls`, `scrapeUrlSilent`, `scrapeUrlRaw`, `search`, `searchAndScrape`, `searchAndScrapeLimited`, `cancel`, `reset`. Surfaces `errorDiagnostics` (JSON-serializable failure report).
- Legacy hook: `useScraperContent` (Redux + socket, wrapping `useScraperSocket`) — still wired; do not extend.
- Display: `features/scraper/ScraperResultsComponent.tsx`, `parts/ScrapedResultDetailTabs.tsx`, `parts/core/*`, `parts/tabs/*`.
- Server proxy: `app/api/scraper/content/route.ts` — server-side NDJSON relay for the legacy `scraped_pages` response type.

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
- DB rows owned by the Python backend; read model is the `PdfDocument` type in `usePdfExtractor.ts` (`id`, `name`, `content`, `clean_content`, `source` Supabase Storage URL, timestamps).
- Raw files land in Supabase Storage asynchronously — `source` may be `null` briefly after extraction; re-fetch resolves it.

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
- Route: `app/(a)/transcription/processor/` — public URL `/transcription/processor` (legacy `/transcripts` → permanent redirect in `next.config.js`).
- Service: `features/transcripts/service/transcriptsService.ts` (CRUD + storage-file deletion), `service/audioStorageService.ts` (Supabase Storage uploads).
- Context: `features/transcripts/context/TranscriptsContext.tsx` — optimistic updates, real-time subscription, `createTranscript`, `updateTranscript`, `deleteTranscript`, `copyTranscript`, `refreshTranscripts`.
- Hooks: `useFileSrc` (resolves a renderable URL; signed-URL refresh handled centrally by the handler's expiry-wheel).
- Components: `TranscriptsLayout`, `TranscriptsHeader` (portal-injected), `TranscriptsSidebar`, `TranscriptViewer`, `CreateTranscriptModal` (Upload Only / Upload & Transcribe), `ImportTranscriptModal`, `RecordingInterface`, `RecordingPreview`, `DeleteTranscriptDialog`, `DraftIndicator`.

**Data model (Supabase)**
- Table `transcripts` (see `features/transcripts/migrations/create_transcripts_table.sql`): `id`, `user_id`, `title`, `description`, `segments` (JSONB), `metadata` (JSONB), `audio_file_path`, `video_file_path`, `source_type` (`audio`|`video`|`meeting`|`interview`|`other`), `tags[]`, `folder_name`, `is_deleted`, `is_draft`, `draft_saved_at`, timestamps.
- Segment shape: `{ id, timecode, seconds, text, speaker? }`.
- Storage: audio/video files in Supabase Storage; `audio_file_path` / `video_file_path` reference them.
- RLS on `user_id`; soft-delete via `is_deleted`.
- GIN indexes on `tags` and FTS over `title + description`.

**Tasks integration:** tasks reference transcription widget philosophy (`features/tasks/widgets/TaskTapButton.tsx`); transcripts are a standalone feature but serve as input material attachable to tasks and agent runs.

---

## Key flows

### 1. Trigger a scrape / extract / research / transcribe job

Every pipeline starts with an authenticated `POST` (Supabase JWT via `useBackendApi` / `useApiAuth`) to a Python-backend endpoint. Scraper and PDF go through `ENDPOINTS.scraper.*` / `ENDPOINTS.pdf.*`; research goes through `research-endpoints.ts`; transcripts uploads audio to Supabase Storage first, then calls the transcription endpoint with the storage key.

### 2. Stream progress via NDJSON

All long-running pipelines emit NDJSON: one JSON object per line, event types `phase` | `info` | `data` | `error` | `end`. The scraper hook uses `consumeStream` from `@/lib/api/stream-parser` and the typed event helpers in `@/lib/api/types`. PDF and research pipelines follow the same contract (see each hook's inline reader). This is the **same contract** documented in `features/agents/docs/STREAMING_SYSTEM.md` — there is one streaming contract across the whole app.

Per-pipeline `data` payloads:
- **Scraper:** `{ type, metadata, results[] }` envelope, or flat result rows with `text_data` / `overview` / `url`. Normalized by `mapToScraperResult`.
- **PDF:** one `data` event per file: `{ doc_id, filename, status: "done"|"error", error }`; `info.code = "pdf_page_progress"` for live progress.
- **Research:** phase-scoped events (`searching` / `scraping` / `analyzing` / `synthesizing` / `generating`) with per-stage payloads written into `rs_*` tables by the Python side.
- **Transcripts:** Whisper result ingested into `segments` JSONB on completion.

### 3. Persist + retrieve

- **Scraper:** no automatic DB persistence — callers hold the result or forward it (e.g., save to `rs_source` when running inside research).
- **PDF:** Python backend writes the extracted doc row; raw file uploaded to Supabase Storage async. Retrieve via `GET /utilities/pdf/documents` or `{doc_id}`. AI cleanup writes back to `clean_content`.
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
- **Python microservices sit behind Next.js routes.** No component calls a Python host directly. Use `useBackendApi` / `useApiAuth` so the active backend (localhost/dev/prod) is selected from `apiConfigSlice`, and the Supabase JWT is attached as `Authorization: Bearer <token>`.
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
- **Research reference:** [`features/research/README.md`](../research/README.md), [`app/(public)/p/research/RESEARCH_STREAMING_GUIDE.md`](../../app/(public)/p/research/RESEARCH_STREAMING_GUIDE.md)
- **Transcripts reference:** [`features/transcripts/README.md`](../transcripts/README.md)

---

## Change log

- `2026-05-07` — Documented transcript processor public URL `/transcription/processor` (studio at `/transcription/studio`; legacy `/transcripts` and `/transcript-studio` redirect in `next.config.js`).
- `2026-04-22` — claude: initial combined doc for scraper + pdf-extractor + research + transcripts.

---

> **Keep-docs-live rule (CLAUDE.md):** after any substantive change to any of the four pipelines — new endpoint, schema change, new event type, persistence contract shift — update this file, the affected per-feature README/API doc, and the Change log. A broken ingestion contract cascades into every agent run that consumes its output.
