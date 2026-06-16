# Research — Vision & Gap Analysis

> **Status:** living document · **Last reconciled:** 2026-06-16 · **Owner:** research feature
> **Scope:** the whole research domain across both repos — `matrx-frontend/features/research/**` + `matrx-frontend/app/(core)/research/**` (UI/state) and `aidream/research/**` + `aidream/aidream/workflows/**` (compute).
> **How to read this:** §1 reconciles the original plan against today's code. §2 is the honest gap list (what's pending), with `file:line` evidence and a fix-size. §3–§6 are the bigger vision the user asked for — research as a **content engine** (one report → podcast + slides + SEO + blog) with **expanded sources** (YouTube, X via xAI) — grounded in primitives that already exist. §7 is a phased roadmap an agent can execute cold. §8 is the evidence map.
>
> Every claim here was verified against the code on 2026-06-16. Where something is greenfield, it says so plainly. Where the substrate already exists, it's cited.

---

## 1. Where we started vs. where we are

The original brief (see `~/.claude/plans/reactive-wondering-parasol.md`) was a **trust-and-polish overhaul** of the live research run + result views: kill the never-ending spinners, the fake graph flow, the plain-text-instead-of-markdown rendering, the empty syntheses/documents, the half-height panel; then redesign finished stages into a stat-square rail with live markdown streaming; then make the source lists tabular and build a power curation surface.

**That brief is essentially done.** Reconciliation:

| Original goal | State | Evidence |
|---|---|---|
| Terminal sweep — no perpetual spinners | ✅ done | `hooks/usePipelineProgress.ts` `finalizeStages` |
| Graph animates only when live | ✅ done | `PipelineOrchestra` `isLive`-gated `statusFor` |
| `MarkdownStream` everywhere (incl. live writing) | ✅ done | synthesis/document/streaming panels |
| Synthesis/document honest content + empty states | ✅ done | `SynthesisList`, `DocumentViewer` |
| Document auto-generates on report-ready | ✅ done (FE-orchestrated) | `DocumentViewer.tsx:104-121` triggers `POST /document`; **note:** the backend `/run` does *not* generate it — the FE fires it on `reportReady`. See §2-B1. |
| Analysis ordered by importance + sectioned | ✅ done | `AnalysisList`, `ranking.ts` `IMPORTANCE_CONFIG` |
| Side panel fills height | ✅ done | `ActivityFeed` |
| Stat-square rail; current stage centered | ✅ done | `StageStatSquare`, `LivePipelineActivity` |
| Tabular source/keyword lists w/ status columns | ✅ done | `SourceResultsTable` |
| Power curation workbench (filter/sort/group/batch) | ✅ done | `/curate` → `CurationTable` + `getCurationData` |
| Human-in-the-loop analyze (trim before analysis) | ✅ done | `AnalyzeCurationDialog`; `original_content` backup |
| Per-keyword ranking (breadth beats single #1) | ✅ done | `ranking.ts` |
| Manual tag assign → consolidate loop | ⚠️ partial | assign works; **consolidation output never renders** (§2-A1) |
| Pipeline auto-tagging | ❌ deferred (always was a backend follow-up) | §2-B2 |

**This session** added on top: rich keyword cards (aggregates + top-10), the "Copy & Update" topic-agent fork, the content **Data** column, clearer run-pipeline labels, and a shared `fmtCount`. Also note: the plan listed template `default_tags` as "never applied" — **that is now applied** on topic creation (`ResearchInitForm.tsx:1154-1171`); gap closed.

**Bottom line:** the research feature is a polished, shipping product. What remains splits into (a) a short list of honest gaps, and (b) the much larger *opportunity* — turning a research report into a content engine and widening what counts as a source.

---

## 2. Gap analysis — what's pending today

Severity: 🔴 trust/correctness · 🟡 capability hole · 🟢 polish. Fix-size: S/M/L.

### A. Frontend gaps

**A1. 🔴 Tag consolidation runs but never renders. (M)**
`TagManager` fires `api.consolidateTag()` (real backend work — costs money), but `ConsolidationView` is a placeholder that shows *"Tag consolidation content will appear here…"* and never consumes the `consolidate_complete` stream or renders the result.
→ `components/consolidation/ConsolidationView.tsx:57-64`. Backend is real (`aidream/research/tagging.py:32-172`) and persists to `rs_synthesis` with `scope="tag"`. **The output exists in the DB; the UI just doesn't show it.** Fix: give `ConsolidationView` the same streaming-consumer + `MarkdownStream` treatment `DocumentViewer` already has, and read the persisted `scope="tag"` synthesis on load.

**A2. 🟡 `suggestTags` (auto-tagger) is dead on the FE. (S–M)**
`useResearchApi.suggestTags()` exists (`hooks/useResearchApi.ts:120-121`) but **no component ever calls it.** The backend implementation is real (`aidream/research/tagging.py:180-262`, `AutoTaggerAgent`, returns `[{name, confidence, reason}]`). Fix: a "Suggest tags" action on the source detail + a batch "auto-tag selected" on `/curate`, applying accepted suggestions via the existing `addTagToSources`.

**A3. 🟢 Document export is PDF/DOCX-stubbed. (S, but needs backend)**
`DocumentViewer.tsx:235-242` disables PDF/DOCX with "(coming soon)"; only JSON works, and the backend export endpoint (`GET …/document/export`) only emits JSON. A real export needs a backend (or client) renderer.

**A4. 🟢 Legacy `/documents` route is a dead duplicate of `/document`. (S)**
`app/(core)/research/topics/[topicId]/documents/page.tsx` — remove or fold into `/document`'s version history.

**A5. 🟡 Search-provider honesty. (S)**
The topic model exposes `default_search_provider: "brave" | "google"`, but the backend implements **only Brave** (§2-B3). If the settings UI offers "Google," it's a silent no-op — exactly the "it lied to me" pattern this codebase fights. Fix: either hide the option until implemented, or label it "coming soon," until §3 makes providers pluggable.

### B. Backend gaps (aidream)

**B1. 🟡 Document generation is not in the pipeline. (M — by design today)**
`run_initial_pass` stops after synthesis; it never calls `assemble_document` (`aidream/research/service.py:969-1334`). Today the FE compensates (A-row above). `assemble_document` is real and standalone (`aidream/research/document.py:26-153`, endpoint `POST …/document`). In the §3 vision, document generation becomes a first-class **fan-out node**, removing reliance on the FE trigger.

**B2. 🟡 Auto-tag & auto-consolidate quotas are reserved-but-unused. (M)**
`max_auto_tag_calls` and `max_tag_consolidations` are persisted, surfaced in settings, and **read but never acted on** by the orchestrator (`QUOTA_LADDER.md`: "reserved for a future pass, not yet wired"). The agents exist (`auto_tagger_agent_id`, `consolidation_agent_id` are already topic roles). Fix: an optional post-scrape auto-tag pass and post-synthesis auto-consolidate pass inside `run_initial_pass`, gated by those quotas + `autonomy_level`.

**B3. 🟡 Search is hardcoded to Brave; source types are if/elif, not a registry. (M–L)**
`aidream/research/search.py` calls `async_brave_search` directly; `SearchProvider` enum's `"google"` is a no-op. Source-type discrimination is hardcoded hostname checks in `multisource.py:76-83` + `search.py`, with content-type branching in `scraper.py` — **no provider/adapter abstraction.** This is the structural blocker for §3's source expansion. Fix: a `SearchSurface` registry and a `SourceAdapter` registry (one place each to register Brave/Google/YouTube/X search + per-type fetch/parse).

**B4. 🟡 YouTube is modeled but non-functional. (M)**
`source_type="youtube"` is detected and typed end-to-end, but there is **no transcript fetch** — `trigger_transcription` is a stub returning *"YouTube transcription is a manual process."* (`aidream/research/multisource.py:522-535`). A YouTube URL added today is scraped as HTML → thin/empty. Speechmatics infra exists (`SPEECHMATICS_API_KEY`) but is wired to the separate transcripts domain, not research. Fix: §4.

**B5. 🟡 File-upload source ingestion is a 501 stub. (M)**
`POST …/sources/upload` raises `501 not_implemented` (multipart TBD). The FE file handler already models uploads/`YouTubeSource`, but research-source ingestion is a separate path. Fix: wire multipart → `fileHandler` → `rs_content`.

**B6. 🟢 `XAI_API_KEY` is read but not registered. (S)**
`matrx-ai/.../providers/xai/xai_api.py` reads `XAI_API_KEY`, but it is **absent from** `aidream/aidream/startup/env_validation.py`, so a misconfig fails late instead of at boot. Prereq for §4's X integration. Fix: declare it.

### C. Cross-cutting / known (tracked elsewhere, restated for completeness)

- **Provider "stopped early" should never discard content.** When a model stops with e.g. Gemini `finish_reason: safety`, the FE now keeps streamed content + shows the reason. The matching backend hardening (stop throwing away content; always record final data on the conversation id) is a **backend item the user owns** — re-verify after deploy.
- **Retry backend gap** (`project_retry_backend_gap`): FE retry is built to the guide; prod aidream still 422s without `user_input`. Re-verify post-deploy.
- **Scope delivery** (`project_scope_cells_delivery`): `resolve_full_context` delivers scope cells; aidream change is deploy-pending. Affects research agents' context quality.

---

## 3. The bigger vision — Research as a Content Engine

> **North star:** a user defines *one* research topic, presses go, and gets back not just a report but a **publishable bundle**: the research document **+ a podcast episode + a slide deck + an SEO package + a blog post** — each derived from the same vetted, ranked, human-curated source set, each regenerable and individually editable.

Research already does the hard part — it finds, scrapes, ranks, curates, analyzes, and synthesizes a body of knowledge into a trustworthy report. That synthesis is the perfect, expensive-to-produce **input** for every downstream content format. Today that value dead-ends at the document. The vision is to make the report a **hub** that fans out into formats.

### 3.1 Why this is an *extension*, not a rebuild

The orchestration substrate already exists and is proven:

- **A workflow engine** — `aidream/aidream/workflows/` (matrx-graph: nodes + edges, super-step scheduler runs all dependency-satisfied nodes concurrently). Research already runs on it: `research_v1.py` (`init → search_scrape → analysis → synth_keywords → synth_project → finalize`).
- **A fan-out precedent in production** — `aidream/aidream/workflows/study_pack_v1.py` does *exactly* the shape we need: `ingest → structure → [notes ‖ flashcards ‖ quiz ‖ lesson_scripts ‖ stock_image] → assemble`. One input, many parallel generators, one fan-in. (It even documents the fan-in pitfall it already solved at lines 297-300.)
- **Agent-as-workflow-node** — the `ai.agent.start` action runs any saved agent as a node, passing prior outputs as context. So "run the podcast agent after synthesis" is a node + an edge, not new infrastructure.
- **A generic podcast generator, today** — `POST {base}/podcast/generate` accepts `input_data_type ∈ {TOPIC, PARTIAL_CONTENT, FULL_CONTENT, FILE_URL}`. **Feed it the research markdown and it produces an episode.** This integration is essentially free.
- **A render-block → persistent-artifact pipeline** — fenced blocks (`presentation`, `chart`, …) render live and materialize to `cx_artifact` (types already include `presentation`, `report`, `summary`, `outline`). The slide-deck **renderer** already exists (`PresentationBlockData` → `Slideshow.tsx`); only the **generator** is missing.
- **A per-topic role system** — `rs_topic.agent_config` already maps 8 stage roles (page summary, keyword synthesis, research report, updater, consolidation, auto-tagger, document assembly, suggest) to overridable agents (`features/research/components/agents/constants.ts`). New output formats are **new roles in the same map** — the `AgentRoleCard` "Copy & Update" UX already lets users fork and tune each one.

So the build is: **(a) widen the source funnel, (b) add downstream generator nodes + their agents, (c) add the artifact types + the "Outputs" surface, (d) chain it.** Each piece lands on an existing seam.

### 3.2 The four outputs — current reality and the gap to close

| Output | Today | What's needed |
|---|---|---|
| **Research document** | ✅ generated (FE-triggered) | Move into the workflow as a fan-out node (B1) |
| **Podcast** | ✅ generic generator live (`/podcast/generate`, accepts arbitrary content) | A node that posts the report as `FULL_CONTENT`; persist `cx_artifact` of new type `podcast_episode`. **Lowest-effort win.** |
| **Slide deck** | ⚠️ renderer exists, **no generator** | A `research_to_slides` agent that emits a `presentation` JSON block (schema: `PresentationBlockData`); materialize as `cx_artifact` (`presentation` type already registered) |
| **SEO package** | ❌ greenfield (only meta-width calc + keyword-suggest utils + tool-viz renderers exist) | A `research_to_seo` agent → title/meta/slug/keywords/schema.org/OG; new artifact type `seo_package` + a renderer |
| **Blog post** | ⚠️ exists but **podcast-only** (`podcast_blog_writer` reads `episode.script`) | Generalize into a `content_to_blog` agent taking arbitrary markdown; new artifact type `blog_post` |

### 3.3 Expanding the sources — beyond the open web

Great research needs a wide aperture. Two high-value source classes are within reach:

**YouTube (transcripts).** Video is where a huge amount of primary expertise lives (talks, interviews, tutorials). YouTube is already detected and typed; the missing piece is **transcript extraction** (B4). A `youtube` source should fetch captions/transcript (via a transcript API / `yt-dlp` captions, or fall back to the existing Speechmatics audio pipeline) and store it as `rs_content` with `capture_method="transcript_link"` (the enum slot already exists). From there it flows through analysis/synthesis identically to a scraped page.

**X / Twitter (via xAI).** X is the real-time pulse — breaking developments, expert threads, primary-source quotes. xAI/Grok is **already a configured LLM provider** (`matrx-ai/.../providers/xai/`), and the xAI SDK exposes server-side **`x_search()`** and **`web_search()`** tools (recognized in `unified_client.py` via the `internal_x_search` flag, gated to Grok models). The vision: add **X as a search surface** — during the search phase, a Grok-backed `x_search` call returns relevant posts for each keyword; each becomes a `source_type="x"` source with the post text as content. This needs the provider registry (B3) + `XAI_API_KEY` registration (B6) + an `x` source adapter. It turns research from "web pages" into "web + video + the live social graph."

A natural third surface, once the registry exists: **Google/SerpAPI** (finally honoring the `default_search_provider` enum), and **Reddit** (already half-detected) for community/long-tail signal.

---

## 4. How it works end-to-end — the agent's journey

A single run, told as a story, with the real machinery named.

1. **Define.** User creates a topic (manual / template / AI-suggest — all live). They pick **sources** (web, YouTube, X) and **outputs** (report always; podcast/slides/SEO/blog as opt-in toggles) and an **autonomy level** (already a topic field: auto / semi / manual).

2. **Gather (widened).** The `search_scrape` phase fans across **search surfaces**: Brave/Google for web, `x_search` (Grok) for X posts, YouTube search for videos. Each surface yields typed sources; each source type routes to its **adapter** (HTML parse, transcript fetch, post extraction). Quota gates (`scrapes_per_keyword`) and idempotency (skip already-done) work unchanged.

3. **Curate (the human gate).** This is the load-bearing human-in-the-loop step the product is built around: `/curate` lets the user include/exclude, tag, trim (`AnalyzeCurationDialog`), and rank-review before expensive work. In `semi`/`manual` autonomy, the workflow **pauses here** for approval; in `auto` it proceeds. *Curation is the quality firewall for everything downstream — every output inherits the curated set.*

4. **Analyze & synthesize.** Unchanged: per-page summaries → keyword syntheses → project report, each ranked and quota-gated. The **project synthesis is the hub** — the single artifact every output consumes.

5. **Fan out (new).** After `synth_project`, the workflow forks — modeled on `study_pack_v1`'s parallel generators:
   - `gen_document` → `assemble_document` (moves the FE trigger into the pipeline; B1)
   - `gen_podcast` → `POST /podcast/generate` with the report as `FULL_CONTENT` → `pc_episodes` + `cx_artifact:podcast_episode`
   - `gen_slides` → `research_to_slides` agent emits a `presentation` block → `cx_artifact:presentation`
   - `gen_seo` → `research_to_seo` agent → `cx_artifact:seo_package`
   - `gen_blog` → `content_to_blog` agent → `pc_articles`-style row + `cx_artifact:blog_post`

   Each generator is an `ai.agent.start` node reading the synthesis from workflow context; the scheduler runs them concurrently; a final `finalize` fan-in marks the topic complete and emits the bundle.

6. **Review & publish (new surface).** A new topic tab — **`/research/topics/[id]/outputs`** (or "Studio") — shows the bundle as cards: each asset with preview, per-asset **regenerate**, **model override**, and **edit**, plus publish actions (podcast → RSS/Apple, which `pc_shows` already supports; blog → public page, which `/podcast/[slug]/blog` already demonstrates). This reuses the podcast runs/recovery + per-asset-regenerate pattern that already exists for episodes.

### 4.1 Two ways to orchestrate (a real decision)

- **Workflow-native (recommended for v1):** the fan-out is a matrx-graph DAG (extend `research_v1.py` or add `research_studio_v1.py`). Deterministic, parallel, checkpointed/resumable, recovers cleanly. Matches `study_pack_v1` precedent. The user's "one agent end-to-end" is realized as one *run* over a DAG of agent nodes.
- **Master-agent-with-tools (more emergent):** a single "Research Studio" agent calls `research`, then `generate_podcast` / `generate_slides` / `generate_seo` / `generate_blog` as **tools** (the `customTools` `kind:"agent"` + `build-tool-injection` substrate exists). More conversational and flexible, less deterministic, harder to resume.

Recommendation: **workflow-native for the production pipeline**, optionally expose the same generators as **agent tools** so a chat agent can also produce any single asset on demand. They share the same generator agents + artifact types.

---

## 5. Architecture to get there (grounded)

What to build, where it attaches:

### 5.1 Source layer — make providers pluggable (closes B3/B4/B5/B6)
- **`SearchSurface` registry** in `aidream/research/search.py`: `register(name, fn)`; `execute_search` dispatches over the topic's enabled surfaces. Implement `brave` (exists), `google`/`serpapi`, `youtube_search`, `x_search` (Grok via matrx-ai).
- **`SourceAdapter` registry** in `aidream/research/` (new module): keyed by `source_type`, each with `fetch()` + `to_content()`. `web` (existing HTML path), `pdf`/`image` (existing extractors), `youtube` (transcript fetch → `capture_method="transcript_link"`), `x` (post text + metadata). `scraper.py` dispatches through it instead of branching inline.
- **FE:** extend `SourceType`/`SOURCE_TYPE_CONFIG` (`types.ts`, `constants.ts`) for `x` (+ a Reddit option), add source-surface toggles to the topic settings + init form. Register `XAI_API_KEY` (B6).

### 5.2 Output layer — generators + artifacts (closes the §3.2 gaps)
- **New agents** (added to the topic role map in `constants.ts`, overridable per topic, forkable via existing "Copy & Update"): `research_to_slides`, `research_to_seo`, `content_to_blog` (generalize `podcast_blog_writer`). Podcast reuses the existing generator.
- **New `cx_artifact` types:** `podcast_episode`, `slide_deck`/reuse `presentation`, `seo_package`, `blog_post`. Add renderers where missing (SEO package; slide-deck renderer already exists).
- **New workflow** `research_studio_v1.py` (or fan-out nodes appended to `research_v1.py`): the §4.5 DAG. Wire each generator as an `ai.agent.start` (or `action.*`) node reading the project synthesis.

### 5.3 Surfaces
- **New route** `app/(core)/research/topics/[topicId]/outputs/page.tsx` + an "Outputs/Studio" tab: the bundle gallery with per-asset regenerate/model/edit/publish.
- **Add every new route/panel/agent to the feature admin map** (`/research/admin`) per doctrine.

### 5.4 What is genuinely greenfield (be honest)
- YouTube transcript fetch logic; X post fetch + `x_search` wiring; the SEO generation agent + renderer; the generalized blog agent; the slides generator agent; the `outputs` surface; the new workflow + artifact types. Everything *under* these (workflow engine, agent execution, artifact materialization, podcast generator, slide renderer, role system, curation) **already exists**.

---

## 6. Design principles for this build

- **Curation is the firewall.** Every output derives from the *curated, ranked* set — never the raw scrape. Fan-out happens after the curation gate, never before.
- **Outputs are artifacts, not side effects.** Everything materializes to `cx_artifact` (or its domain table: `pc_episodes`, `pc_articles`) — durable, versioned, shareable, regenerable. No ephemeral-only outputs.
- **One report, many formats — never re-research per format.** The synthesis is computed once; podcast/slides/SEO/blog all read it. Regenerating an output never re-runs the pipeline.
- **Per-asset control.** Each output is independently regenerable with its own model/agent override (the role system + per-asset pattern already support this).
- **Honor autonomy + loud recovery.** `auto`/`semi`/`manual` gates the curation pause and the fan-out. Every recovery/skip path screams (per the repo's "loud recovery" rule) — a silently-skipped output is a bug.
- **Extend, don't fork.** New source = a registry entry. New output = a new role + node + artifact type. No parallel pipelines, no second source model, no bespoke per-format orchestration.

---

## 7. Phased roadmap (executable cold)

**Phase 0 — Close the cheap gaps (mostly FE, days).**
0.1 Render tag consolidation output (A1) · 0.2 "Suggest tags" + batch auto-tag UI (A2) · 0.3 Search-provider honesty (A5) · 0.4 Remove legacy `/documents` (A4) · 0.5 Register `XAI_API_KEY` (B6).

**Phase 1 — Pluggable source funnel (BE-heavy).**
1.1 `SearchSurface` + `SourceAdapter` registries (B3) · 1.2 YouTube transcript adapter (B4) · 1.3 X/`x_search` surface + `x` adapter via Grok (§3.3) · 1.4 FE source-type + surface toggles · 1.5 (opt) Google/SerpAPI + Reddit.

**Phase 2 — Output substrate.**
2.1 New `cx_artifact` types + SEO/blog renderers · 2.2 `research_to_slides` agent (emits `presentation` block) · 2.3 generalize blog agent (`content_to_blog`) · 2.4 `research_to_seo` agent · 2.5 podcast-from-report node (reuse `/podcast/generate`).

**Phase 3 — The Studio (chain it).**
3.1 `research_studio_v1` workflow: synth → fan-out generators → finalize · 3.2 `/research/topics/[id]/outputs` bundle surface with per-asset regenerate/model/edit · 3.3 autonomy-gated curation pause before fan-out · 3.4 move document gen into the workflow (B1) · 3.5 optional auto-tag/auto-consolidate passes (B2).

**Phase 4 — Polish & distribution.**
4.1 Publish flows (podcast→RSS/Apple via `pc_shows`; blog→public page) · 4.2 Document PDF/DOCX export (A3) · 4.3 file-upload sources (B5) · 4.4 expose generators as agent tools for on-demand single-asset generation.

Dependencies: Phase 1 before deep source value; Phase 2 before Phase 3; the podcast node (2.5) can ship in isolation as an early visible win because its generator is already live.

---

## 8. Evidence map (anchors for a cold start)

**Frontend (`matrx-frontend`)**
- Routes: `app/(core)/research/topics/[topicId]/{overview,sources,content,curate,keywords,analysis,synthesis,document,tags,media,costs,settings,agents}`
- Curation: `features/research/components/curation/CurationTable.tsx`, `service.ts#getCurationData`
- Tags: `service.ts#{assignTagsToSource,addTagToSources}`, `hooks/useResearchApi.ts:120-121#suggestTags` (dead), `components/consolidation/ConsolidationView.tsx:57-64` (stub)
- Document: `components/document/DocumentViewer.tsx:104-121` (auto-trigger), `:235-242` (export stub)
- Roles: `features/research/components/agents/constants.ts:27-83`, `TopicAgentsPage.tsx`, `AgentRoleCard.tsx`
- Source types: `types.ts` (`SourceType`), `constants.ts:73-82` (`SOURCE_TYPE_CONFIG`)
- Render blocks / artifacts: `components/.../block-registry/BlockComponentRegistry.tsx`, `features/artifacts/types.ts` (`cx_artifact`), `features/canvas/canvas-block-meta.ts` (`presentation`)
- Podcast: `features/podcasts/` (FEATURE.md, `articleService.ts`)

**Backend (`aidream`)**
- Pipeline: `research/service.py:969-1334` (`run_initial_pass`); router `aidream/api/routers/research.py`
- Tags: `research/tagging.py:32-172` (consolidate, real), `:180-262` (suggest, real)
- Document: `research/document.py:26-153` (`assemble_document`)
- Sources/search: `research/multisource.py:76-83`,`:522-535` (yt stub); `research/search.py` (Brave-only); `research/scraper.py`; `research/models.py:82-86`
- Quotas: `research/docs/QUOTA_LADDER.md`
- Workflows: `aidream/aidream/workflows/research_v1.py`, `study_pack_v1.py` (**fan-out precedent**)
- Agent run / chaining: `aidream/api/core/agent_run.py`; `ai.agent.start` workflow action
- Podcast generator: `aidream/api/routers/podcast_generator.py:41-89` (generic input contract); `matrx_ai/agent_runners/podcast_generator.py`
- xAI: `packages/matrx-ai/matrx_ai/providers/xai/xai_api.py` (`XAI_API_KEY`), `.../unified_client.py:90-102` (`internal_x_search`, `x_search`/`web_search` tools); `aidream/startup/env_validation.py` (key not yet declared)
- Slide model: `packages/matrx-ai/matrx_ai/processing/blocks/models/presentation.py:52-69` (`PresentationBlockData`)

---

## 9. Open decisions for the user

1. **Orchestration:** workflow-native pipeline (recommended) vs. master-agent-with-tools vs. both? (§4.1)
2. **v1 output set:** all four at once, or land podcast first (cheapest, generator already live) then slides → blog → SEO?
3. **X sourcing:** xAI `x_search` only (simplest, one provider), or also a direct X API path (more control, more cost/credentials)?
4. **YouTube transcripts:** prefer a transcript/caption API, `yt-dlp` captions, or reuse the Speechmatics audio pipeline as fallback?
5. **Autonomy default:** should the Studio always pause at curation before fan-out (safe), or let `auto` topics run straight through to the full bundle?
6. **SEO scope:** v1 = on-page (title/meta/slug/keywords/schema.org/OG), or also off-page (SERP gap analysis, internal-link suggestions)?
