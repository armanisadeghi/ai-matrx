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

# Research Content Engine — Enhancement Addendum (§10–§13)

> **Status:** addendum to *Research — Vision & Gap Analysis* · **Reconciled:** 2026-06-16
> **How to read this:** these sections extend the main doc. §10 is the *output engine* (what the bundle produces and how it stays coherent + trustworthy). §11 is *hardening* (the unglamorous decisions that decide whether the fan-out is robust). §12 is *evergreen / monitor mode*. §13 is the big one neither pass covered in depth — **how we actually acquire high-value data that isn't readily available** (YouTube, X, and beyond). Each item points at the seam in the main doc it attaches to, and is honest about greenfield vs. existing substrate.
>
> The keystone for almost everything below is **§10.0 — the structured synthesis hub.** Build that first; citations, charts, and per-format reshaping all hang off it.

---

## 10. The output engine

### 10.0 🔑 Keystone — make the synthesis hub *structured*, not a flat markdown blob. (M)

The main doc's strongest principle is *"one report, many formats — never re-research per format"* (§6). But a 5k-word prose synthesis maps badly onto a 10-slide deck or a 12-minute script — and if each generator re-derives structure from prose independently, the outputs **won't agree with each other** (the slide deck's "three key findings" won't match the blog's). They'll also each re-discover the same statistics and the same citations, differently.

Fix: `synth_project` emits a **format-neutral spine** alongside the prose, and every downstream generator reshapes *that*:

```jsonc
{
  "sections": [{ "id", "heading", "summary", "claim_ids": [...] }],
  "claims":   [{ "id", "text", "confidence", "source_refs": [{ "rs_content_id", "anchor" }] }],
  "stats":    [{ "id", "label", "value", "unit", "comparison_group?", "source_refs" }],
  "entities": [{ "name", "type", "source_refs" }],
  "timeline": [{ "date", "event", "source_refs" }]   // when temporal
}
```

This one schema change is what makes 10.2 (citations) and 10.3 (charts) *cheap* instead of *heroic* — the claims carry their sources, and the stats/timeline arrays are pre-extracted for visualization. Attaches to: `research/service.py` (`synth_project` / `run_initial_pass:969-1334`), and the synthesis artifact schema.

### 10.1 Global "Voice & Lens" injection. (S–M)

Without this, a podcast, blog, and deck from the same report sound like three unrelated LLMs. Add a **`tone_profile`** (a.k.a. "Lens") to `rs_topic`: brand voice, target-audience expertise level, framing stance (e.g. *"skeptical, data-driven, for senior engineers"*), reading level, and do/don't notes. Inject it as standard context into **every** fan-out node (`gen_podcast`, `gen_slides`, `gen_blog`, `gen_seo`). The whole bundle then reads as one authored voice, and the user tunes it **once** instead of per-agent. It's one more overridable field in the role map you already have, and it composes with the per-role "Copy & Update" fork. Attaches to: `rs_topic` model; `agent_config` role map (`features/research/components/agents/constants.ts`); injected at each generator node.

### 10.2 🔴 Citation lineage, end-to-end (trust-as-a-feature). (M — but cheap given 10.0)

*This is the differentiator, and it's the one we can do well today.* The entire value of research is **vetted, ranked, cited** knowledge — but provenance currently dead-ends at the synthesis. The moment we fan out, a podcast asserts a claim with no traceable source and a blog ships without links, which is the exact *"it lied to me"* failure mode the codebase fights, just relocated downstream.

- **Principle (new — add to §6):** *Provenance survives generation.* No output drops citations. Every generator reads the `claims[].source_refs` from the spine (10.0) and **preserves inline references** mapped to the originating `rs_content` IDs.
- **Per-format rendering:** blog → inline links + a sources list; slides → per-slide source footnotes; podcast → show-notes source list (and, where diarized, "as *X* said on *show/date*"); SEO → schema.org `citation` + author/`sameAs`.
- **The premium UI (Studio):** in `/outputs`, hovering a claim highlights it and opens the corresponding source side-by-side — and for time-coded sources (10.0 `anchor`), it **deep-links to the exact YouTube timestamp or X post** (see §13.2/§13.3 for why word-level anchors are available). That hover-to-source overlay is the moment a reviewer *feels* the trust.

This is also a moat: "research-grounded, cited, source-linked content" is a categorically different product than "an LLM wrote a post." Attaches to: spine `source_refs` (10.0); each generator's output contract; new Studio overlay (greenfield UI, but reuses the existing source panel).

### 10.3 ⭐ Automated DataViz / tables / comparisons materialization. (M)

Text-only slides and blogs are forgettable; **tables, charts, comparisons, and timelines are what people screenshot and share** — and this app already renders them well, so we should lean all the way in. A dedicated **`gen_visuals`** node runs in parallel during fan-out, scans the spine's `stats` / `timeline` / `entities` (pre-extracted in 10.0, so no re-parsing prose), and emits render-block artifacts:

| Block | When it fires | Renderer |
|---|---|---|
| `chart` (bar/line/area) | numeric series, trends | existing chart block (Recharts/ECharts JSON) |
| `comparison_table` | ≥2 entities across shared dimensions | existing render-block / table |
| `timeline` | dated events present | timeline block |
| `stat_callout` | single headline figures | lightweight block |

These artifacts are then handed to `gen_slides` and `gen_blog` **as context**, so the generators embed real interactive visuals instead of describing data in prose — automating the single most tedious part of content production. Every emitted viz carries its `source_refs` (10.2), so a chart is itself citeable. Attaches to: render-block registry (`BlockComponentRegistry.tsx`), `cx_artifact` types, fan-out DAG (`study_pack_v1` precedent). Greenfield: the `gen_visuals` agent + comparison/timeline block types if not already registered.

### 10.4 Output set (reconciles §3.2)

No change to the four outputs — but with 10.0–10.3 in place, each becomes *cited and illustrated* rather than plain prose. Recommended v1 landing order (cheapest visible win first): **podcast** (generator already live) → **blog** (with embedded charts from 10.3) → **slides** → **SEO**.

---

## 11. Hardening — the decisions that make the fan-out robust

**11.1 🟡 Pre-flight cost estimate at the curation gate. (S–M)**
The fan-out turns one "go" into ~5 generator calls (podcast and slides aren't cheap), and `auto` topics run straight through. The autonomy-gated curation pause (§4.3) is the natural place to show *"this bundle, with these outputs and this curated set, will cost ≈ $X"* **before** committing. You already have budget gating + `/costs`; this just surfaces the estimate at the decision point. A surprise bill is its own trust break.

**11.2 🔴 Per-asset failure isolation + edit/regenerate semantics. (M)**
Two unspecified decisions hide in the Studio:
- *Failure isolation:* when `gen_slides` fails but `gen_podcast` succeeds, `finalize` must **not** block or fail the whole bundle. Each asset needs first-class status — `pending | generating | ready | failed | stale` — and the fan-in completes on partial success. (The `study_pack_v1` fan-in note at :297-300 is about fan-in *correctness*, not partial failure.)
- *Edit vs. regenerate:* you offer per-asset edit **and** per-asset regenerate — define what happens when a user hand-edits the blog, then hits regenerate. Edit-lock? Version + diff? Silently overwriting a human edit is a bug under "loud recovery." Extending `/document`'s version history to all `cx_artifact` types covers both.

**11.3 🟡 Source-type-aware trust & ranking. (M)**
`ranking.ts` / `IMPORTANCE_CONFIG` was built for web pages. Once sources are heterogeneous, each surface must contribute its **native quality signal**, normalized into one rank:

| Surface | Quality signal |
|---|---|
| Web | domain authority, recency |
| YouTube | views, likes, channel size, captions-present, recency |
| X | engagement (reposts/likes/quotes), **author authority**, recency |
| Reddit / HN | score / points, awards |
| Academic | citation count / influence |

Without this, the social firehose pollutes the curated set every output inherits. A stale viral X post should rank below a quiet authoritative one. Fold into the registry work (§5.1 / B3) as a per-`source_type` scoring profile.

**11.4 🟢 Eval / sample-capture hooks on new nodes. (S)**
Every new generator node (`gen_*`) should register the same eval + stage-sample capture your existing stages use, or the fan-out becomes the one unobservable part of the pipeline. One-liner per node, but skip it and you're flying blind on the new surface area.

---

## 12. Evergreen — "Monitor Mode" (delta runs)

Research goes stale the moment it's published, especially with live surfaces like X and YouTube. Add a **Monitor Mode** toggle to the topic, backed by a lightweight CRON workflow (greenfield: `research_monitor_v1.py`) that runs daily/weekly and does **not** re-run everything:

1. **Time-boxed delta search** — re-query the enabled surfaces with a recency window (e.g. X/YouTube from the last 7 days), reusing the same idempotency/skip logic so nothing already-ingested is re-charged.
2. **Signal gate** — only proceed if the delta clears a relevance/quality bar (using 11.3 scoring), so noise doesn't trigger churn.
3. **Append, don't rewrite** — high-signal delta is summarized into a **"Recent Developments"** section appended to the hub synthesis (10.0), carrying its own `source_refs`.
4. **Prompt, don't auto-publish** — the topic is flagged and the user is prompted in the UI to regenerate the podcast/blog with the new data. Output **staleness** is tracked against the synthesis timestamp (you already have an `updater` role — this is its real job), so a "ready" asset visibly becomes "stale" when the hub moves underneath it.

Ties §11.2's `stale` status to a real trigger, and turns a one-shot report into a living one.

---

## 13. Data acquisition — getting the data that isn't readily available

This is the part that decides whether "expand sources" is real or aspirational. The hard truth: **YouTube, X, and Reddit all actively block datacenter IPs and gate their best data behind auth, cost, or anti-bot defenses.** Naïve `fetch()` from a cloud server gets thin/empty/blocked responses — silently. So the design has two halves: a **shared acquisition gateway** that solves blocking once, and **per-surface tiered ladders** that degrade loudly.

### 13.0 Acquisition philosophy (new principles for §6)

- **One egress gateway.** All acquisition network egress routes through a single **fetch gateway** with rotating **residential** proxy support, per-surface rate limiting, exponential backoff, and a headless-browser (Playwright) render fallback for JS-heavy/blocked pages. Datacenter IPs are blocked by every interesting platform — solve it in one place, not per adapter. *(Forward-looking: Matrx Chrome could later act as a consented distributed residential fetcher — flag, don't build for v1.)*
- **Tiered, loud fallback.** Every `SourceAdapter` (§5.1) acquires through an ordered ladder: Tier 1 cheap/official → Tier 2 resilient third-party → Tier 3 heavy fallback. Each downgrade **screams** (per "loud recovery") — a source that silently fell back to thin HTML is a bug.
- **Native quality signal in, every time.** Acquisition isn't just content — it captures the surface's quality metadata (views, engagement, author authority, score, citation count) for 11.3.
- **Pointer vs. payload.** Some sources (an X post, an HN comment) are as valuable as **discovery pointers** as they are content — expand their outbound links into their own sources, then dedup across surfaces (13.5).

### 13.1 The shared fetch gateway (greenfield, foundational)

A new module that every adapter calls instead of `httpx`/`fetch` directly:

- Residential/rotating proxy pool (config-driven; off in dev, on in prod).
- Per-host rate limits + jittered exponential backoff + retry budget.
- Static-fetch → **Playwright render** fallback when a response is suspiciously thin or returns a bot wall.
- Caches raw fetches (idempotency + cost control on re-runs / monitor mode).

Everything in 13.2–13.4 assumes this exists. Without it, the integrations work in dev and die in prod.

### 13.2 YouTube — tiered transcript ladder (closes B4)

The official **YouTube Data API `captions.download`** only works for videos **you own** (OAuth as owner) — useless for third-party research. State that plainly so nobody burns a sprint on it. Instead, a three-tier adapter:

| Tier | Method | Gives | Notes |
|---|---|---|---|
| **1** | `yt-dlp` captions, `--sub-format json3` (manual + auto-gen) | transcript **with word/segment-level timestamps** | free, fast; **needs the gateway** (datacenter IPs blocked). json3 timing is what powers the timestamp-deep-link citations in 10.2. |
| **2** | Third-party transcript API (Supadata / AssemblyAI-YouTube / Deepgram, etc.) | transcript, proxy-resilient | per-video cost; use when Tier 1 is blocked or has no captions. |
| **3** | `yt-dlp -x` audio → **Speechmatics** (your existing `SPEECHMATICS_API_KEY` pipeline) | ASR transcript **+ speaker diarization** | always works (even zero-caption uploads); diarization enables *"Guest said X at 14:02"* citations for interviews/panels. |

Store as `rs_content` with `capture_method="transcript_link"` (the enum slot exists). Beyond the transcript, **harvest the free structure**: yt-dlp returns title, channel, subscriber/view/like counts (→ 11.3), upload date, **chapters** (pre-segment the video into topics → maps directly onto 10.0 `sections`), and the description's outbound links (→ 13.5). Translate non-English captions to widen the aperture. Replaces the `multisource.py:522-535` stub.

### 13.3 X / Twitter — discovery + hydration (extends §3.3)

`x_search` (Grok) alone is a *search-and-summarize* surface: great for discovery, but it won't hand you clean structured metrics for ranking, and a lone post is thin content. Combine two paths:

- **Discovery — xAI `x_search` (Grok):** per-keyword, returns the relevant posts. Already the plan; gate to Grok models via `internal_x_search` (`unified_client.py:90-102`); register `XAI_API_KEY` (B6).
- **Hydration — X API v2 (`tweets/search/recent`, last 7 days; full-archive on higher tiers):** pull structured objects — `public_metrics` (likes/reposts/replies/quotes/impressions), `author` (followers, verified, account age), `created_at`, `conversation_id`, `referenced_tweets`, `entities.urls`. This is what 11.3 needs to rank X honestly. *(Cost honesty: X API Basic ≈ $200/mo; budget it.)*
- **Thread reconstruction:** store the **reconstructed thread** (`conversation_id`) + quoted/replied context (`referenced_tweets`) as one `rs_content` unit — not a single orphan post. A lone tweet scraped flat is the "YouTube-as-HTML" mistake again.
- **Link expansion:** expand `entities.urls` into their own web sources (13.5). X is often the *pointer* to the real artifact (a paper, a post, a repo).

### 13.4 Other high-value surfaces, ranked by ROI

| Surface | Access | Why | Effort |
|---|---|---|---|
| **Hacker News** | Algolia HN Search API — free, no auth | deep expert comments on tech topics | 🟢 trivial — do early |
| **arXiv / Semantic Scholar / OpenAlex** | all free APIs | primary literature; citation counts feed 11.3 | 🟢 easy — gold for research-grade topics |
| **Reddit** | `.json` on any thread URL (read, no auth) or official API | practitioner experience, long-tail; comment score = pre-curated signal | 🟡 (gateway needed; honor rate limits) |
| **Podcasts (others')** | Listen Notes / iTunes search → RSS → audio → **Speechmatics** | huge primary expertise; **closes the loop — you both produce and consume podcasts** | 🟡 reuses your ASR pipeline |
| **GitHub** | REST/GraphQL API, generous | READMEs, issues, discussions for technical topics | 🟢 easy |
| **Substack / newsletters** | per-publication RSS | expert long-form | 🟢 easy |
| **TikTok / Instagram** | no good official content-search API; aggressive anti-scraping | low signal-to-effort for research | 🔴 **skip v1** — be honest about ROI |

Each registers as a `SearchSurface` + `SourceAdapter` pair (§5.1), so adding one is a registry entry, not a new pipeline.

### 13.5 Cross-surface dedup + link expansion (S–M)

The same idea shows up as a YouTube talk, an X thread summarizing it, and a blog post about it. Two cross-cutting steps in the gather phase:
- **Link expansion:** outbound URLs from X/YouTube/HN/Reddit become candidate web sources.
- **Dedup:** collapse near-duplicates across surfaces (URL canonicalization + content hash/similarity) **before** the curation gate, so the user curates distinct knowledge — not five copies of one idea with different rankings.

---

## Roadmap deltas (extends §7)

- **Phase 0 (cheap):** + register `tone_profile` field (10.1) · + HN/arXiv adapters (13.4, trivial, immediate source-value win).
- **Phase 1 (source funnel):** + **fetch gateway** (13.1) *before any blocked surface* · YouTube tiered ladder (13.2) · X discovery+hydration (13.3) · Reddit/podcast/GitHub adapters (13.4) · cross-surface dedup (13.5) · per-`source_type` ranking (11.3).
- **Phase 2 (output substrate):** + **structured synthesis spine** (10.0 — the keystone, do first in this phase) · `gen_visuals` charts/tables/timelines (10.3) · citation refs in every generator (10.2).
- **Phase 3 (Studio):** + cost pre-flight at curation gate (11.1) · per-asset status + failure isolation + edit/regen semantics (11.2) · hover-to-source citation overlay incl. timestamp deep-links (10.2) · eval hooks on new nodes (11.4).
- **Phase 4 (distribution + living):** + Monitor Mode / `research_monitor_v1` delta runs (§12).

## New open decisions (extends §9)

7. **Fetch resilience:** self-host a residential proxy pool, or lean on third-party transcript/search APIs that absorb the blocking problem (simpler, per-call cost)?
8. **X cost:** `x_search`-only (cheap, less control, no clean metrics) vs. add X API v2 hydration (ranking-grade metadata, ~$200+/mo)?
9. **Citation depth for v1:** source-level links everywhere (easy, ship now) vs. timestamp/segment-level deep-links for YouTube/X from day one (needs 13.2 Tier-1 word timing)?
10. **`gen_visuals` placement:** a standalone parallel node feeding slides/blog (recommended), or fold viz generation into each output agent (simpler graph, less reuse, inconsistent charts)?