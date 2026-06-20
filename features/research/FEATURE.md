# FEATURE.md — `research`

**Status:** `active`
**Tier:** `1`
**Last updated:** `2026-06-19`

---

## Purpose

AI research pipeline with human-in-the-loop curation: search the web by keyword → scrape sources → analyze pages with LLM agents → synthesize per-keyword and project-wide → assemble a final document. A live-streaming "pipeline orchestra" shows the run in real time.

---

## Entry points

**Routes** — all under `app/(core)/research/` (NOT `(public)/p/research` — that path is dead).
- `/research` — landing.
- `/research/topics` · `/research/topics/new` — list + creation wizard.
- `/research/topics/[topicId]` — live-run overview (the orchestra). Sub-routes: `sources`, `sources/[sourceId]`, `content`, `curate` (curation workbench — filter/sort/group + batch include/exclude), `keywords`, `keywords/[keywordId]` (per-keyword home: its synthesis + ranked search results), `analysis`, `synthesis`, `document`, `documents`, `tags`, `tags/[tagId]`, `outputs` (**Outputs Studio** — content engine: generate podcast/blog/slides/SEO from the report), `media`, `costs`, `settings`, `agents`, `tasks`.
- Admin surface: `app/(admin)/administration/research-system/` (super-admin). Standardized `/research/admin` `FeatureAdminMap` not yet built — TODO.

**Hooks** (`features/research/hooks/`)
- `useResearchStream()` — NDJSON/SSE stream consumer (chunk/data/info/end callbacks).
- `usePipelineProgress({ topic })` — reduces stream events into the per-stage `PipelineState` the orchestra renders. Owns the terminal sweep (see Invariants).
- `useResearchApi()` — Python backend calls (run/search/scrape/analyzeAll/synthesize/generateDocument/consolidateTag/**rankSourceAuthority**/…).
- `useResearchState.ts` — Supabase read hooks (`useResearchSources`, `useAnalysesForTopic`, `useResearchSynthesis`, `useResearchDocument`, `useResearchTags`, `useSourceTags`, …).

**Services**
- `service.ts` — client Supabase reads/writes (lists, tags, source⇄tag links).
- `service/server.ts` — SSR fetch for the topic layout (pre-populates the store).
- `service/research-endpoints.ts` — Python endpoint map.

**State** — feature-local **Zustand** store (`state/topicStore.ts` via `context/ResearchContext.tsx`), server-hydrated; not the global Redux store. Pipeline run state is the `usePipelineProgress` reducer, not persisted.

---

## Data model

**Tables** (Supabase, `rs_` prefix): `rs_topic`, `rs_keyword`, `rs_source`, `rs_content`, `rs_analysis`, `rs_synthesis`, `rs_tag`, `rs_source_tag`, `rs_document`, `rs_media`. Normal feature tables (RLS-gated, client writes allowed) — none are protected-resources.

**Key types** (`types.ts`): `PipelineState`/`StageState`/`WorkItem` (`hooks/usePipelineProgress.ts`), `ResearchSource` (has `rank` = Google position, + `authority_score`/`authority_tier`/`authority_reasoning`/`authority_ranked_at` = AI source authority), `ResearchAnalysis`/`ResearchSynthesis` (`result` text + `result_structured` json), `ResearchDocument`, `ResearchTag`/`SourceTag`.

**Source authority columns** (`rs_source`): `authority_score` (0-100), `authority_tier` (`high|medium|low`), `authority_reasoning` (one sentence), `authority_ranked_at` (null = not yet ranked). Written by the backend Source Authority Ranker; read straight through `getSources` (`select *`).

---

## Key flows

- **Run pipeline** — overview `Run pipeline` → `api.runPipeline` (empty body) → `useResearchStream.startStream` → events `dispatch`ed into `usePipelineProgress`. `onEnd` calls `pipeline.finalize()` + `refresh()`. Document is NOT produced here.
- **Live render** — `PipelineOrchestra` (graph) + `LivePipelineActivity`: finished stages → `StageStatSquare` rail (click to expand inline detail; external-link opens results route), active stage(s) → large card, writing streams via `StreamingTextPanel` (MarkdownStream). Completed keywords / scrape+analyze item batches / source feed auto-fold via `FoldableSection`; when the run finishes the whole drawer (metrics + stages + activity log) collapses together — user can reopen.
- **Document** — `/document` → `DocumentViewer` auto-generates (`api.generateDocument`, streams `chunk`+`document_complete`) when report-ready and none exists; persists to `rs_document`.
- **Tags** — Tags page: create tag + consolidate. Source detail: `SourceTagPicker` assigns sources to tags (`assignTagsToSource`/`removeSourceTag`); consolidation synthesizes over a tag's sources.
- **Curate** — `/curate` (`CurationTable`): `getCurationData` joins each source with importance + per-keyword rank + scraped content size + analysis state + tags in one shape; filter/sort/group by keyword or tag (incl. **sort by Authority**); select across groups → batch include/exclude (`bulkUpdateSources`) to clean the set before the final synthesis. Casual browsing stays on `sources`/`content` (shared `SourceResultsTable`).
- **Rank authority** — three ways, one backend path: (1) **auto** — `run_initial_pass` runs it after analysis (non-fatal, `force=false` so only new sources cost tokens); (2) **manual** — `AuthorityRankButton` (Sources toolbar) → `api.rankSourceAuthority` → `useResearchStream` → `onEnd` refetch; (3) the older **`AuthorityExportButton`** (manual copy/paste to any chat) is KEPT alongside, useful for ad-hoc/offline ranking. Backend chunks included sources ≤50/batch, runs the **Source Authority Ranker** agent, writes `authority_*` to `rs_source`. Per-source score/tier/reasoning render via `AuthorityTierBadge` on the source list, curation table, results table, and source detail.

---

## Invariants & gotchas

- **A full `/run` emits NO per-stage "all-complete" event** — only a final `pipeline_complete` (per `app/(core)/research/RESEARCH_STREAMING_GUIDE.md`; `search_complete`/`analyze_all_complete` fire only from the single-stage endpoints). So `usePipelineProgress.finalizeStages` **must** sweep every non-terminal stage/item to terminal on `pipeline_complete` AND on the stream `onEnd`. Without it, spinners run forever. A started stage with items but 0 succeeded/0 failed → `partial`, not a false green `complete`.
- **The orchestra graph animates ONLY when live.** `statusFor` (`PipelineOrchestra`) returns animating `queued`/`active` only when `isLive` (`stream.isStreaming || activeStage`); at rest it returns static `empty`/`gated`/`complete`. CSS animates only `data-status` `queued`/`active` + `active` edges. Never let a finished/reloaded graph pulse or "flow."
- **All generated content renders via `MarkdownStream`** (`@/components/MarkdownStream`, the rich-document engine) — synthesis, analysis, the live writing panel. **Exception:** the *loaded* document uses `ReactMarkdown` to keep heading-slug `#anchor` TOC links (the canonical renderer has no rehype-slug). Never render generated content as plain `whitespace-pre-wrap`.
- **The backend always persists `result`/`content` on success.** Empty content is a real "produced nothing" state, not data loss — render it honestly (explicit "no content", never a perpetual spinner or a green check). Synthesis falls back to `result_structured` when `result` is empty.
- **Ranking — rank is everything, and it's PER KEYWORD.** A source's rank comes from `rs_keyword_source.rank_for_keyword`; **`rs_source.rank` is ambiguous and must not be used.** Cross-keyword importance (breadth beats a lone #1) is computed by `features/research/ranking.ts` via the tweakable `IMPORTANCE_CONFIG` (pure, client+server) and surfaced everywhere — source detail, source list, analysis list (ordered by it), keyword home. Analysis view shows completed-with-content first by importance, empty/failed in a bordered section; counts distinguish with-content vs empty vs failed — never "N passed" for N non-failed rows.
- **Stopped-early = content-first.** When a generation stops early (e.g. Gemini safety), always render any content it produced with an amber `StoppedEarlyNote` — gated on a `failed` status, NOT a stale `error` field (a clean success must never show the note). A red failure shows only when there is NO content. `MarkdownStream` is never wrapped in `prose` (it styles itself; a wrapper adds the empty-space and double-styling).
- **Tags are manual.** `/run` produces no tags. The orchestra Tags node is a static manual branch (no `isLive` animation, dashed edges) — it must not imply auto-generation. Functional loop = create → assign sources (`SourceTagPicker`) → consolidate.
- **Editing scraped content backs up the original ONCE.** `rs_content.original_content` is set on the first edit only — **never overwrite an existing backup**; the true scrape stays recoverable (`restoreOriginalContent`). Curation before analysis (`AnalyzeCurationDialog`) trims junk to cut model + RAG cost. Content reads are Supabase-direct — no FE cache to bust on edit.
- **"Sources discovered" = `stored_count ?? sources_found` summed**, identical in `usePipelineProgress.derived` and `SearchStageView`. Keep the formula in one shape so one screen never shows two totals.
- **Authority ≠ importance — three distinct axes, never conflate.** `authority_*` = AI-judged source *trustworthiness* (domain-led, written by the ranker agent). `importance`/`rank` = search-position salience (`ranking.ts`). Both surface side by side; they answer different questions. `AuthorityTierBadge` is the ONE renderer for authority everywhere — never hand-roll a score pill. It tolerates an out-of-contract tier (derives from score) so a stray agent value never breaks a row.
- **Streaming contract:** `app/(core)/research/RESEARCH_STREAMING_GUIDE.md`. Backend source of truth: aidream `research/stream_events.py` (authority events: `authority_rank_start`/`authority_rank_batch`/`authority_rank_complete`).

---

## Related features

- Depends on: `features/files` (media), `@/components/MarkdownStream` + `features/rich-document`, `@/components/content-actions` (`ContentActionBar`).
- Sibling: `features/scraper` (standalone scrape inspector — a separate surface, not part of this pipeline).
- Backend: aidream `research/` (compute + persistence).

---

## Doctrine compliance

**Primitives reused** — `MarkdownStream` (rich-document engine); `ContentActionBar`; `components/ui` (Badge, Skeleton, DropdownMenu, Progress); `hierarchy-filter`; `sonner` toast; `useServiceQuery` pattern.

**Primitives introduced**
- `LivePipelineActivity` + `StageStatSquare` + `stageMeta` (`components/overview/live-pipeline/`) — compact finished-stage stat tile + shared per-stage display data. No existing primitive renders a stage outcome as a docking rail square; `stageMeta` canonicalizes icon/label/route/duration/square-data (replaced `CompletedStageStrip`'s private copies).
- `FoldableSection` (`components/overview/live-pipeline/ui/`) — reusable collapse/expand row for live-pipeline work (completed keywords, item batches, source feed). Completed work auto-folds; click to reopen.
- `SourceTagPicker` (`components/sources/`) — source⇄tag toggle. No existing tag-assignment UI existed; consumes existing `assignTagsToSource`.

---

## Change log

- `2026-06-19` — **AI topic init — quota conflict UX.** `/research/topics/new?mode=ai` review step no longer silently backfills keywords dropped by `max_keywords`. All AI suggestions stay visible; keywords beyond the cap render red with a warning banner, **Pipeline settings** dialog (`AiReviewQuotaDialog` + `QuotaSettingsSection`), and **Start Research** blocked until the user raises the cap or removes extras. Saving settings persists newly-in-quota keywords.
- `2026-06-19` — **ProInput / ProTextarea sweep.** User-authored text fields across research (init wizard, topic settings, tags, paste-content, content editor, pipeline keyword form, templates admin) and project inline name/description now use the official Pro components (voice, cleanup, copy). Numeric quota/scrape-threshold fields stay on bare `Input type="number"`.
- `2026-06-19` — **Source authority ranking.** New AI step scores how authoritative each source is (0-100 + `high|medium|low` tier + one-sentence reasoning), written back to `rs_source` (`authority_*` columns, migration applied). Server: `POST /research/topics/{id}/sources/rank-authority` (streaming) → `research/source_authority.py` chunks included sources ≤50/batch, runs the floating **Source Authority Ranker** agent (`be502ddf-…`, always-latest), persists per source; **also auto-runs inside `run_initial_pass`** (after analysis, non-fatal, `force=false`). FE: `AuthorityRankButton` (Sources toolbar) + the existing `AuthorityExportButton` (kept — manual copy/paste for ad-hoc use), `AuthorityTierBadge` (source list desktop+mobile, curation table, results table, source detail), authority sort in `/curate`, `authority_score` `SourceSortBy`. Synthesis source-selection unchanged for now (authority captured + shown; algorithm shift comes later). Verified end-to-end (real DB write-back). _Pending:_ regen `api-types.ts` (hand-written `AuthorityRankRequest` bridges until then).
- `2026-06-18` — **Two data-loss bugs fixed (outputs + analyses).** (1) **Blog/slides outputs were silently dropped** — `rs_topic_append_output` used a two-level `jsonb_set(outputs,'{kind,assets}',…,true)`, but Postgres `jsonb_set` never creates a missing intermediate parent, so the *first* asset of any kind whose key didn't already exist in `outputs` was a no-op (seo/podcast only persisted because their keys pre-existed from the old client path). Fixed: build the kind object and set it via the single-level path `{kind}` (migration re-applied + ledger checksum updated). (2) **Editing source content appeared to delete its analysis** — editing writes a new content version (v+1) and `SourceDetail` filtered analyses strictly to the current version, hiding the prior (expensive) ones. Verified via DB: those analyses are NOT deleted (they survive on older versions; `ON DELETE CASCADE` only fires if the content row itself is deleted, which editing doesn't do; 0 orphaned analyses). Fixed: `currentAnalyses` falls back to the newest prior version that has analyses, shown under an amber "ran on v{n}, edited since — re-analyze to refresh; previous analysis was kept" banner.
- `2026-06-18` — **Manual tagging on the Sources list.** Tags were only assignable on the source-detail page (`SourceTagPicker`) or hidden in `/curate` — undiscoverable when browsing. The Sources list (`SourceList`) now shows each source's tag chips inline + a compact per-row `SourceTagsInline` picker (toggle existing tags, "Create new tag…"), on both desktop rows and mobile cards. `BulkActionBar` gained an **Add to tag** dropdown (existing tag or create-new) so the multi-select set can be tagged in batch, matching `/curate`'s `CurationBatchBar`. Backed by new `getTopicSourceTags(topicId)` / `useTopicSourceTags` (one query for the whole topic's source⇄tag map, keyed by `source_id` — no per-row fetch). Reuses existing `assignTagsToSource` / `removeSourceTag` / `addTagToSources` / `createTag`; no schema change. (Note: pipeline-level auto-tag — `max_auto_tag_calls` — remains unwired in the backend, §B2; per-source "Suggest tags" still lives on source detail.)
- `2026-06-18` — **Outputs Studio fixes.** (1) Slide-deck preview no longer clipped — removed the fixed `h-[440px]` wrapper so the `Slideshow` renders at its natural height. (2) Output persistence made atomic — new `rs_topic_append_output` RPC (row-locked server-side append into `rs_topic.outputs`; migration applied + ledgered) replaces the client read-modify-write that let the 8–12 min podcast run clobber blog/slides generated during its wait. (3) Podcast wait now reuses the generator components (`LiveProgressRail` + `ProductionTeaser` + `MediaOptionsGrid`) so cover art, clips, and a script sneak-peek fill the long render.
- `2026-06-17` — **Progressive folding in live pipeline.** Completed keywords fold to pills (click to expand); scrape/analyze "Recently completed" batches and the search source feed auto-collapse when work moves on. Finished stages dock as `StageStatSquare` tiles — click toggles inline stage detail (external-link still opens the results route). When a run completes, `LivePipelineActivity` collapses metrics + stage detail + activity log together; "Show details" reopens everything.
- `2026-06-15` — Analyze-curation popup (`AnalyzeCurationDialog`): trim/edit scraped content before the analysis call; `rs_content.original_content` backs up the original once (migration applied + ledgered) and `restoreOriginalContent` recovers it.
- `2026-06-15` — Power curation table at `/curate` (`CurationTable` + `getCurationData`): human-in-the-loop work surface — filter/sort/group by keyword+tag, importance + content-size columns (large pages flagged as likely-junk), batch include/exclude. Keyword + content lists made tabular via shared `SourceResultsTable`; "Page Summary" labels; page summary expanded by default; ugly streaming carets removed everywhere.
- `2026-06-15` — Per-keyword home route (`keywords/[keywordId]`); per-keyword importance ranking (`ranking.ts` + `IMPORTANCE_CONFIG`) surfaced on source detail/list, analysis list, keyword home (replaced ambiguous `rs_source.rank`); re-analyze + all result views preserve content + show an honest "provider stopped early" reason instead of blanking.
- `2026-06-15` — Research UI overhaul: terminal sweep stops perpetual spinners; `isLive`-gated graph animation; `MarkdownStream` everywhere (doc keeps ReactMarkdown for TOC); honest analysis/synthesis empty states + rank ordering + canonical counts; document auto-generates on report-ready; tags honesty + manual `SourceTagPicker` loop; finished stages collapse into an animated `StageStatSquare` rail; `ActivityFeed` fills height. Created this FEATURE.md; corrected README route paths.
- `2026-06-16` — **Vision & gap analysis** doc added: [`docs/VISION_AND_GAPS.md`](./docs/VISION_AND_GAPS.md) — code-grounded FE+BE gap list (tag-consolidation render stub, dead `suggestTags`, reserved auto-tag/consolidate quotas, Brave-only search, YouTube transcript stub) **plus** the "research as a content engine" vision (one report → podcast/slides/SEO/blog) and source expansion (YouTube transcripts, X via xAI `x_search`), grounded in the existing matrx-graph fan-out workflow precedent (`study_pack_v1`). Read it before any cross-feature research work.
- `2026-06-16` — Topic-agents **Copy & Update** (`AgentRoleCard`): duplicate a role's current agent (`agx_duplicate_agent`) → connect as override → open the builder; `TopicAgentsPage.handleApply` is now a pure data op (rethrows) so callers own messaging (no double-toast, failed connect ≠ failed copy). Rich keyword cards (aggregate flow + expandable top-10 results). Scraped-size **Data** column on the content list (`SourceResultsTable.dataSizeFor`, muted for thin pages, hidden on narrow screens). Clearer run-pipeline dropdown — two-line labels; "Run everything pending … skips steps already done" is verified against the backend's idempotent `run_initial_pass`. New shared `format.ts#fmtCount` replaces the divergent per-component `fmtNum`/`fmtSize`.
- `2026-06-16` — **Topic shell responsiveness.** `ResearchSidebar` is now collapsible (icon-only `w-12` rail ⇄ `w-44`, persisted in `localStorage` `research:sidebar-collapsed`, tooltips in the collapsed rail, `PanelLeftClose`/`Open` toggle). The `PipelineOrchestra` graph is now driven by a **container query** (`@container/orch`) instead of viewport breakpoints, with **two real layouts (both keep the connectors + live animation)**: the full horizontal spine + Tags branch renders only at `@7xl` (when there's genuinely room for all seven nodes + edges); below that it renders a **centered vertical flow** — nodes stacked with animated vertical connectors (`OrchestraEdge orientation="vertical"`, new `.orchestra-edge-flow--v` CSS), Tags as an inline dashed manual branch. This fixes nodes collapsing to a single truncated letter on narrow/medium widths **without losing the flow/animation** (the old compact layout was an edgeless grid). Layout reacts to the *real* available space (which grows when the sidebar collapses) and stays legible with any amount of data. The spine's edge animation is unchanged — it only ever animates while `isLive`, so a finished run shows static connectors by design.
- `2026-06-16` — **Content Engine, Wave 0 + Outputs Studio.** (a) Tag consolidation now renders its real output (`ConsolidationView` streams `consolidateTag` + reads the persisted `scope="tag"` synthesis — was a dead placeholder). (b) `SourceTagPicker` gained a live **Suggest tags** action (AutoTagger; accept → create+assign) — surfaces the previously-dead `suggestTags` API. (c) New **Voice & Lens** `tone_profile` topic field (rs_topic migration 0014, + `outputs` JSONB) wired into Settings. (d) New **Outputs Studio** at `/research/topics/[id]/outputs`: turns the report into publishable formats — **podcast is live** (reuses `usePodcastRun` → `/podcast/generate` with the report as `FULL_CONTENT`; episode persists to `pc_episodes` + is indexed in `rs_topic.outputs` via `components/outputs/outputs.ts`); **blog is also live** (`content_to_blog` agent — a forked Document-Assembly agent run via the live `/ai/agents/{id}` endpoint with `useRunAgent`, no deploy; markdown rendered + `ContentActionBar` for WordPress copy/export); slides/SEO are honest "Soon" cards. Both podcast + blog verified end-to-end (real artifacts generated). **Pattern:** output generators are saved agents (`agx_agent` data) run via the live agent endpoint — buildable/verifiable with no aidream deploy. Studio index lives in `rs_topic.outputs` (refs; blog markdown inlined for MVP — move to `pc_articles` in distribution wave). aidream (deploy-pending): suggest-tags emission fix, optional auto-tag/auto-consolidate passes in `run_initial_pass`, `XAI_API_KEY` boot validation.

---

> **Keep-docs-live rule (CLAUDE.md):** after any substantive change, update Status, flows, Invariants, and the Change log here.
