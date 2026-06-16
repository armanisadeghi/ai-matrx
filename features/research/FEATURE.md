# FEATURE.md — `research`

**Status:** `active`
**Tier:** `1`
**Last updated:** `2026-06-15`

---

## Purpose

AI research pipeline with human-in-the-loop curation: search the web by keyword → scrape sources → analyze pages with LLM agents → synthesize per-keyword and project-wide → assemble a final document. A live-streaming "pipeline orchestra" shows the run in real time.

---

## Entry points

**Routes** — all under `app/(core)/research/` (NOT `(public)/p/research` — that path is dead).
- `/research` — landing.
- `/research/topics` · `/research/topics/new` — list + creation wizard.
- `/research/topics/[topicId]` — live-run overview (the orchestra). Sub-routes: `sources`, `sources/[sourceId]`, `content`, `keywords`, `keywords/[keywordId]` (per-keyword home: its synthesis + ranked search results), `analysis`, `synthesis`, `document`, `documents`, `tags`, `tags/[tagId]`, `media`, `costs`, `settings`, `agents`, `tasks`.
- Admin surface: `app/(admin)/administration/research-system/` (super-admin). Standardized `/research/admin` `FeatureAdminMap` not yet built — TODO.

**Hooks** (`features/research/hooks/`)
- `useResearchStream()` — NDJSON/SSE stream consumer (chunk/data/info/end callbacks).
- `usePipelineProgress({ topic })` — reduces stream events into the per-stage `PipelineState` the orchestra renders. Owns the terminal sweep (see Invariants).
- `useResearchApi()` — Python backend calls (run/search/scrape/analyzeAll/synthesize/generateDocument/consolidateTag/…).
- `useResearchState.ts` — Supabase read hooks (`useResearchSources`, `useAnalysesForTopic`, `useResearchSynthesis`, `useResearchDocument`, `useResearchTags`, `useSourceTags`, …).

**Services**
- `service.ts` — client Supabase reads/writes (lists, tags, source⇄tag links).
- `service/server.ts` — SSR fetch for the topic layout (pre-populates the store).
- `service/research-endpoints.ts` — Python endpoint map.

**State** — feature-local **Zustand** store (`state/topicStore.ts` via `context/ResearchContext.tsx`), server-hydrated; not the global Redux store. Pipeline run state is the `usePipelineProgress` reducer, not persisted.

---

## Data model

**Tables** (Supabase, `rs_` prefix): `rs_topic`, `rs_keyword`, `rs_source`, `rs_content`, `rs_analysis`, `rs_synthesis`, `rs_tag`, `rs_source_tag`, `rs_document`, `rs_media`. Normal feature tables (RLS-gated, client writes allowed) — none are protected-resources.

**Key types** (`types.ts`): `PipelineState`/`StageState`/`WorkItem` (`hooks/usePipelineProgress.ts`), `ResearchSource` (has `rank` = Google position), `ResearchAnalysis`/`ResearchSynthesis` (`result` text + `result_structured` json), `ResearchDocument`, `ResearchTag`/`SourceTag`.

---

## Key flows

- **Run pipeline** — overview `Run pipeline` → `api.runPipeline` (empty body) → `useResearchStream.startStream` → events `dispatch`ed into `usePipelineProgress`. `onEnd` calls `pipeline.finalize()` + `refresh()`. Document is NOT produced here.
- **Live render** — `PipelineOrchestra` (graph) + `LivePipelineActivity`: finished stages → `StageStatSquare` rail, active stage(s) → large card, writing streams via `StreamingTextPanel` (MarkdownStream).
- **Document** — `/document` → `DocumentViewer` auto-generates (`api.generateDocument`, streams `chunk`+`document_complete`) when report-ready and none exists; persists to `rs_document`.
- **Tags** — Tags page: create tag + consolidate. Source detail: `SourceTagPicker` assigns sources to tags (`assignTagsToSource`/`removeSourceTag`); consolidation synthesizes over a tag's sources.

---

## Invariants & gotchas

- **A full `/run` emits NO per-stage "all-complete" event** — only a final `pipeline_complete` (per `app/(core)/research/RESEARCH_STREAMING_GUIDE.md`; `search_complete`/`analyze_all_complete` fire only from the single-stage endpoints). So `usePipelineProgress.finalizeStages` **must** sweep every non-terminal stage/item to terminal on `pipeline_complete` AND on the stream `onEnd`. Without it, spinners run forever. A started stage with items but 0 succeeded/0 failed → `partial`, not a false green `complete`.
- **The orchestra graph animates ONLY when live.** `statusFor` (`PipelineOrchestra`) returns animating `queued`/`active` only when `isLive` (`stream.isStreaming || activeStage`); at rest it returns static `empty`/`gated`/`complete`. CSS animates only `data-status` `queued`/`active` + `active` edges. Never let a finished/reloaded graph pulse or "flow."
- **All generated content renders via `MarkdownStream`** (`@/components/MarkdownStream`, the rich-document engine) — synthesis, analysis, the live writing panel. **Exception:** the *loaded* document uses `ReactMarkdown` to keep heading-slug `#anchor` TOC links (the canonical renderer has no rehype-slug). Never render generated content as plain `whitespace-pre-wrap`.
- **The backend always persists `result`/`content` on success.** Empty content is a real "produced nothing" state, not data loss — render it honestly (explicit "no content", never a perpetual spinner or a green check). Synthesis falls back to `result_structured` when `result` is empty.
- **Ranking — rank is everything, and it's PER KEYWORD.** A source's rank comes from `rs_keyword_source.rank_for_keyword`; **`rs_source.rank` is ambiguous and must not be used.** Cross-keyword importance (breadth beats a lone #1) is computed by `features/research/ranking.ts` via the tweakable `IMPORTANCE_CONFIG` (pure, client+server) and surfaced everywhere — source detail, source list, analysis list (ordered by it), keyword home. Analysis view shows completed-with-content first by importance, empty/failed in a bordered section; counts distinguish with-content vs empty vs failed — never "N passed" for N non-failed rows.
- **Stopped-early = content-first.** When a generation stops early (e.g. Gemini safety), always render any content it produced with an amber `StoppedEarlyNote` — gated on a `failed` status, NOT a stale `error` field (a clean success must never show the note). A red failure shows only when there is NO content. `MarkdownStream` is never wrapped in `prose` (it styles itself; a wrapper adds the empty-space and double-styling).
- **Tags are manual.** `/run` produces no tags. The orchestra Tags node is a static manual branch (no `isLive` animation, dashed edges) — it must not imply auto-generation. Functional loop = create → assign sources (`SourceTagPicker`) → consolidate.
- **"Sources discovered" = `stored_count ?? sources_found` summed**, identical in `usePipelineProgress.derived` and `SearchStageView`. Keep the formula in one shape so one screen never shows two totals.
- **Streaming contract:** `app/(core)/research/RESEARCH_STREAMING_GUIDE.md`. Backend source of truth: aidream `research/stream_events.py`.

---

## Related features

- Depends on: `features/files` (media), `@/components/MarkdownStream` + `features/rich-document`, `@/components/content-actions` (`ContentActionBar`).
- Sibling: `features/scraper` (standalone scrape inspector — a separate surface, not part of this pipeline).
- Backend: aidream `research/` (compute + persistence).

---

## Doctrine compliance

**Primitives reused** — `MarkdownStream` (rich-document engine); `ContentActionBar`; `components/ui` (Badge, Skeleton, DropdownMenu, Progress); `hierarchy-filter`; `sonner` toast; `useServiceQuery` pattern.

**Primitives introduced**
- `StageStatSquare` + `stageMeta` (`components/overview/live-pipeline/`) — compact finished-stage stat tile + shared per-stage display data. No existing primitive renders a stage outcome as a docking rail square; `stageMeta` canonicalizes icon/label/route/duration/square-data (replaced `CompletedStageStrip`'s private copies).
- `SourceTagPicker` (`components/sources/`) — source⇄tag toggle. No existing tag-assignment UI existed; consumes existing `assignTagsToSource`.

---

## Change log

- `2026-06-15` — Per-keyword home route (`keywords/[keywordId]`); per-keyword importance ranking (`ranking.ts` + `IMPORTANCE_CONFIG`) surfaced on source detail/list, analysis list, keyword home (replaced ambiguous `rs_source.rank`); re-analyze + all result views preserve content + show an honest "provider stopped early" reason instead of blanking.
- `2026-06-15` — Research UI overhaul: terminal sweep stops perpetual spinners; `isLive`-gated graph animation; `MarkdownStream` everywhere (doc keeps ReactMarkdown for TOC); honest analysis/synthesis empty states + rank ordering + canonical counts; document auto-generates on report-ready; tags honesty + manual `SourceTagPicker` loop; finished stages collapse into an animated `StageStatSquare` rail; `ActivityFeed` fills height. Created this FEATURE.md; corrected README route paths.

---

> **Keep-docs-live rule (CLAUDE.md):** after any substantive change, update Status, flows, Invariants, and the Change log here.
