# FEATURE.md — `research`

**Status:** `active`
**Tier:** `1`
**Last updated:** `2026-08-08`

---

## Purpose

AI research pipeline with human-in-the-loop curation: search the web by keyword → scrape sources → analyze pages with LLM agents → synthesize per-keyword and topic-wide → assemble a final document. A live-streaming "pipeline orchestra" shows the run in real time.

---

## Entry points

**Routes** — all under `app/(core)/research/` (NOT `(public)/p/research` — that path is dead).

- `/research` — landing.
- `/research/topics` · `/research/topics/new` — list + creation wizard.
- `/research/topics/[topicId]` — live-run overview (the orchestra). Sub-routes: `sources`, `sources/[sourceId]`, `content`, `curate` (curation workbench — filter/sort/group + batch include/exclude), `keywords`, `youtube` (topic-aware discovery + permanent video library + batch Gemini processing), `keywords/[keywordId]` (per-keyword home: its synthesis + ranked search results), `analysis`, `synthesis`, `document`, `documents`, `tags`, `tags/[tagId]`, `context` (**Context Builder** — the resource catalog: pick what an agent reads, see the token cost, save it as a bundle, run any agent), `outputs` (**Outputs Studio** — publishing formats from the report + the domain-report launchpad), `media`, `costs`, `settings`, `agents`, `tasks`.
- `/research/topics/[topicId]/context?bundle=<slug>` — Context Builder with a saved bundle preloaded (and its agent preselected). How Outputs Studio hands over a domain report.
- `/research/topics/new?mode=ai&topic=...` — AI-assisted creation with the subject prefilled; used by `/demos/matrx-entry` for the new workflow entryway handoff.
- Admin surface: `app/(admin)/administration/knowledge/research-system/` (super-admin). Standardized `/research/admin` `FeatureAdminMap` not yet built — TODO.

**Hooks** (`features/research/hooks/`)

- `useResearchStream()` — NDJSON/SSE stream consumer (chunk/data/info/end callbacks).
- `usePipelineProgress({ topic })` — reduces stream events into the per-stage `PipelineState` the orchestra renders. Owns the terminal sweep (see Invariants).
- `useResearchApi()` — compute-only Python backend calls (run/search/scrape/analyzeAll/synthesize/generateDocument/consolidateTag/**rankSourceAuthority**/…).
- `useResearchState.ts` — Supabase read hooks (`useResearchSources`, `useAnalysesForTopic`, `useResearchSynthesis`, `useResearchDocument`, `useResearchTags`, `useSourceTags`, …).

**Services**

- `service.ts` — client Supabase reads/writes, including topic/keyword CRUD,
  lists, tags, and source⇄tag links.
- `service/server.ts` — SSR fetch for the topic layout (pre-populates the store).
- `service/research-endpoints.ts` — Python endpoint map.

**State** — feature-local **Zustand** store (`state/topicStore.ts` via `context/ResearchContext.tsx`), server-hydrated; not the global Redux store. Pipeline run state is the `usePipelineProgress` reducer, not persisted.

**Surface agent context** (`matrx-user/research`, manifest `features/surfaces/manifests/research.manifest.ts`, `readiness: verified`) — 34 surface-specific values in six curated groups (topic identity / pipeline state / gathered material / outputs / quotas / configuration). `agent-context/buildResearchContextData.ts` is the ONE pure state→scope mapper (`createResearchScope`) and derives readiness through `readiness.ts` rather than re-deriving it, so the agent sees the same "is this done?" answer the UI shows; `RESEARCH_CONTEXT_MENU_PROPS` + optional `createResearchExtraSections(handlers)` live there too. Editable mount: the AI-mode Subject query (`ResearchInitForm`, `ProTextarea` + `EditableContextMenu`). Read-only mounts (`NonEditableContextMenu`): the assembled document (`DocumentViewer` `<article>`) and each synthesis body (`SynthesisList` `SynthesisCard`).

---

## Data model

**Tables** (Supabase, `research` schema, `rs_` prefix): `rs_topic`, `rs_keyword`, `rs_source`, `rs_content`, `rs_analysis`, `rs_synthesis`, `rs_tag`, `rs_document`, `rs_media`, `rs_template`, plus the `rs_source_keywords` **view**. Normal feature tables (RLS-gated, client writes allowed) — none are protected-resources.

**Research intent (2026-08-08).** `research.research_intent` is a fixed reference catalog (17 rows, `is_active`/`position` ordered) of what a topic is trying to produce — `key`, `label`, `primary_objective`, `keyword_guidance`, quota-package defaults (`default_keyword_count`, `min_keyword_count`, `max_keyword_count`), `retrieval_mode`, `authority_weight`, `include_youtube_default`. A topic optionally points at one via `rs_topic.intent_key` (nullable FK; NULL = legacy, treated as `topic_deep_dive`); `rs_topic.intent_brief` is the composed statement injected into every research agent's prompt for that topic. **`intent_key`/`intent_brief` are NEVER written directly to Supabase from the client.** The one writer is aidream `POST /research/topics/{id}/intent` (`{intent_key, apply_quotas?, user_ask?}` → `{intent_key, quota_updates}`), which composes the brief AND applies the intent's quota package — a direct column write would leave the brief stale and quotas untouched. Client surface: `service.ts#getResearchIntents` / `service/server.ts#getResearchIntentsServer` (read-only reference reads), `useResearchApi().setTopicIntent` (the writer), `components/settings/IntentSection.tsx` (the picker, above the quota ladder in `TopicSettingsForm`, confirm-gated since it resets quotas), `components/shared/IntentBadge.tsx` (quiet chip next to the topic title in the topic layout header, renders nothing when unset).

**The junction tables are GONE.** `rs_keyword_source` and `rs_source_tag` no longer exist — source⇄keyword and source⇄tag are canonical `platform.associations` edges (`research_source → research_keyword` / `research_source → research_tag`), with the per-keyword search rank carried on the edge's `position`. `research.rs_source_keywords` is a **view** over that join and is the only place the old shape survives. Anything reading these relationships joins `platform.associations` (see `migrations/research_overview_readiness_ledger.sql` for the canonical predicate) — never a junction table.

**YouTube library (2026-07-28).** `research.youtube_video` is a canonical
system entity with one row per YouTube ID, shared across every topic/user so
the analysis engine never processes the same immutable video twice. The Research YouTube
step searches with all normal discovery controls, visibly dims results already
attached to the topic, and lets the user select/add any subset. Topic membership
is the existing `rs_source` plus a canonical
`research_source → youtube_video` association. Cards and previews can start
global analysis or comment enrichment. The Library view shows processing state
and supports live streamed batch analysis. When a global analysis completes, the server
materializes its transcript and structured findings into the existing
`rs_content`/`rs_analysis` pipeline without a second model call, so synthesis
and document generation consume it normally.

**Project decoupling (2026-07-21 — system of record: `common-docs/projects/research-project-decoupling/FEATURE.md`).** A topic needs NO project. Tenancy/ownership = `organization_id` (from the app's canonical active-org context — never derived from a project) + `created_by`. The project relationship, when the user chooses one, is ONE optional canonical `platform.associations` edge `research_topic → project`, read/written exclusively through `features/scopes/service/associationsService` (via `service.ts#getTopicProjectLinks` / `setTopicProject` / `createTopic`'s `options.projectId`). "A project's topics" = association query → one batched `.in("id", …)` RLS-visible read (`getTopicsForProjects`) — never a column filter. An edge-write failure is loud + retryable and never invalidates the topic (`CreateTopicResult.projectLink`). The physical `rs_topic.project_id` column is a nullable, NON-AUTHORITATIVE leftover until the Phase-4 drop; `rowToResearchTopic` strips it from the domain type so no UI code can read it. The `_mirror_proj` trigger and `rs_topic_project_id_fkey` are GONE from the live DB (Phase 0) and must never be recreated.

**Topic-wide synthesis vocabulary.** Whole-topic synthesis is `scope='topic'` / `max_topic_syntheses` / `topic_syntheses` everywhere — feature code, DB column, backend contract, and wire (all live since the Phase-4 migration + backend deploy, 2026-07-22). The only remaining legacy `'project'` values are in historical `rs_synthesis` rows and old persisted stream payloads; those are normalized on read at explicit boundaries (`normalizeSynthesisScope`, `researchProgressFromJson`, `useCostSummary`). New writes never emit `'project'`.

**Canonical model (2026-06-28).** The cluster is fully canonicalized on the platform standard. **`rs_topic` is the entity** (token `research_topic`) — the shareable unit; you share a research project, not an individual source. **`rs_template`** is a second entity (token `research_template`; the 5 `is_system` templates are `visibility='public'`). Every other table is a **component of `research_topic`** (single-level composition via `topic_id`), so RLS defers to the topic's access via `iam.has_access` — which is why the backend can write sources/content/media with a null `created_by` and access still resolves through the owning topic. The two former junctions are now `platform.associations` edges (see above). Topics default `private` (existing rows set to `internal` so project collaborators keep read/edit via org membership); RLS is generated by `iam.apply_rls` (never hand-write). **All `rs_*` now live in the `research` schema** (moved 2026-06-28, `migrations/research_canon_05_move_to_research_schema.sql`) — every client read is `.schema('research').from('rs_*')` (the bare `public` names are gone; the dead-relations guard enforces it). aidream models already target `research` (`_db_schema='research'`).

**Readiness ledger.** `get_topic_overview` returns a `pending` object alongside the counts — `keywords_unsearched` / `keywords_pending_scrape` / `keywords_pending_analysis` / `keywords_pending_synthesis`, `report_stale` / `document_stale`, and the four `*_slots_remaining` quota-headroom figures. Defined in `migrations/research_overview_readiness_ledger.sql`, parsed at the boundary by `researchPendingFromJson` (degrades to an all-zero ledger against a DB without the migration), consumed only through `readiness.ts`. The RPC is not `SECURITY DEFINER`, so like every other count it reflects what the CALLER can see — including the `platform.associations` source⇄keyword edges the keyword-stage figures join through.

**Key types** (`types.ts`): `PipelineState`/`StageState`/`WorkItem` (`hooks/usePipelineProgress.ts`), `ResearchSource` (has `rank` = Google position, + `authority_score`/`authority_tier`/`authority_reasoning`/`authority_ranked_at` = AI source authority), `ResearchAnalysis`/`ResearchSynthesis` (`result` text + `result_structured` json), `ResearchDocument`, `ResearchTag`/`SourceTag`.

**Source authority columns** (`rs_source`): `authority_score` (0-100), `authority_tier` (`high|medium|low`), `authority_reasoning` (one sentence), `authority_ranked_at` (null = not yet ranked). Written by the backend Source Authority Ranker; read straight through `getSources` (`select *`).

**Source triage columns (2026-07-25)** — `rs_source`: `scrape_worthiness` (0-100, predicted odds that FETCHING the URL returns usable article text — page DELIVERY, not quality; a great paywalled source still scores low; the scraper silently skips sources below 20), `redundancy_group` (short slug clustering near-duplicate sources within a topic, e.g. `pbw_city_pages`; analysis selection spreads its quota ACROSS groups so one cluster can't consume it; null = ungrouped/unique), `entity_match_confidence` (0-100, confidence the source is about the topic's true subject rather than a namesake), `snippet_relevance` (0-100, topical usefulness judged from the search snippet alone — populated for nearly every source, including the ~95% never fetched). All four are set by the same LLM pass that writes `authority_score`. **NULL means "not assessed", NEVER zero** — never render a null as `0`, an empty meter, or a red/bad state; render `—` (see `formatScore100`/`formatScrapeWorthiness`/`formatEntityMatchConfidence`/`formatSnippetRelevance` in `sourceScoreDisplay.tsx`, and `isLowScrapeWorthiness`/`SCRAPE_WORTHINESS_SKIP_THRESHOLD`/`formatRedundancyGroupLabel` in `constants.ts`). Surfaced: `SourceDetail` (all four, with a scrape-worthiness tooltip explaining the delivery-vs-quality distinction); `SourceList`/`SourceResultsTable` show a compact amber "Low fetch odds" flag (`ScrapeWorthinessFlag`) when `scrape_worthiness < 20` — the explanation for why a source never gets scraped — and a `redundancy_group` chip (`RedundancyGroupBadge`) next to the hostname.

---

## Resource catalog → context bundles → agents

> **The report was never the only thing worth giving an agent.** Before this
> system, every output consumed ONE input: the assembled document (or the topic
> synthesis) as a single markdown blob, and the three generator agents declared
> no variables at all. A topic also holds search results, raw provider payloads,
> 46k-chars-per-page scraped bodies, per-page AI write-ups, page scoring,
> keyword syntheses, tag consolidations, documents and media — none of it
> reachable. This is how a human (or a system bundle) curates that material and
> hands it to any agent.

**Four pieces, in dependency order.**

1. **The catalog** (`resources/catalog.ts`) — one `ResourceKindDef` entry per
   thing an agent can be given. Adding a kind is ONE entry; the picker, budget
   meter, resolver and every saved bundle pick it up with no other change.
   Nothing outside the catalog may hard-code a resource type. DB kinds declare
   `fetchBodies` + `render`; **derived** kinds (`topic.brief`,
   `topic.inventory`, `source.authority`, `source.importance`, `tag.map`)
   compute their text from the manifest already in hand and cost no extra reads.
   `heavy: true` kinds (full page bodies, raw payloads, link dumps) are labelled
   **Large** and never pre-selected.
2. **The manifest** (`public.research_topic_resource_manifest` RPC →
   `resources/manifest.ts`) — every selectable item with its **measured** char
   count and NO bodies, in one round trip, plus the source⇄keyword rank graph
   and source⇄tag edges. Sizes come from `length(...)` / `rs_content.char_count`
   — never estimated. Items carry their own timestamp so "newest" means newest.
   INVOKER rights: RLS is the only gate (same as `get_topic_overview`).
3. **Selectors + bundles** (`resources/selector.ts`, `research.rs_context_bundle`)
   — a bundle stores **rules**, not row ids: `{kind, mode, filter, order, limit}`.
   `mode: "explicit"` pins ids only when a human hand-picked them. `entity_id IS
NULL` = a template usable on any topic; `is_system` = shipped, read-only in
   the UI (Save as makes your own copy).
4. **The resolver** (`resources/resolve.ts`) — the ONLY place that fetches
   bodies and the ONLY place that truncates, so the `ResolutionReport` can be
   trusted. Returns `{variables, contextRefs, report}` — injected text plus any
   lazy `resource_ref` envelopes (see the delivery invariant below).

**Invariants — these are the ones that bite:**

- **One estimator.** `lib/tokens/estimate.ts` is the only char→token function in
  the repo. The picker, the budget meter and the resolver's truncation all call
  it, so a preview cannot disagree with the run. Every figure renders as an
  estimate ("~81.7k"), never as a fact.
- **Truncation is always reported, and only real truncation is.** `report.notes`
  and `truncated` cover INVOLUNTARY losses (budget cut, empty body, unloadable
  row). Filter exclusions and Top-N caps are the selection's own rules — they
  are counted per kind (`dropped.filtered`) but NEVER flagged as a loss, because
  a warning that fires on every normal run is a warning nobody reads
  (`VOLUNTARY_DROPS`). `exceedsBudget` is separate and loud: the planner never
  returns nothing, so one resource larger than the whole budget is kept AND
  announced.
- **Budget is enforced twice on purpose** — pre-flight against manifest chars
  (so we never fetch 4.98M chars to use 200k), then post-render against the real
  assembled text (rendering adds ~200 chars of provenance per block). Whole
  blocks are dropped, never half a block.
- **Every rendered block carries its provenance** (URL only — site, authority,
  rank and importance were deliberately removed: those signals chose what the
  model reads, and repeating them asks it to weight the same signal twice) via
  `render.ts#block` + `sourceMeta`. Rich context with no attribution is how
  unsourced claims get written.
- **Delivery is per binding: `delivery: "direct" | "context"`.** Direct (the
  default) renders text into the variable — always read, always budgeted.
  Context sends each selected item as a `__kind:"resource_ref"` envelope in the
  request's per-turn `context` dict (`runtime.context` →
  `instanceContext` slice → the API `context` field): the server builds a small
  descriptor and the agent opens the body through its context tool ONLY if it
  chooses — near-zero injected tokens, zero budget cost, and it can never evict
  a direct kind's items. Only kinds with a catalog `resourceType` (a real
  RLS-loadable row) can travel this way; derived kinds silently fall back to
  direct. Server half: each `resourceType` token must be registered in
  aidream's `services/references/resources.py` (all research components are,
  as of 2026-07-25). This was the handoff's "context vs direct" decision —
  resolved 2026-07-25 as (a) per-request context; scope context items
  (persistent state) and `reference_pickable` flips (always-injected snippets)
  were both rejected as the wrong mechanism.
- **Variable names are a wire contract, not UI copy** (ruling 2026-07-25). The
  agent variable `scraped_pages` KEEPS its name even though the UI says
  "read", because renaming a live contract to match display copy is backwards:
  UI labels lead (the picker label, the preview rail), wire names stay visible
  as sublabels, and mappings/shortcuts translate when a different name is
  wanted. Do not rename agent `variable_definitions` to chase display copy.
- **`page.images` vs `media.items` both stay** (ruling 2026-07-25): Media is
  the curated subset of the raw extracted images. Both are offered with honest
  labels saying exactly that; do not collapse them.
- **`strategy: "first"` on a binding** means "the first kind that produced
  anything wins" — that is how `research-report-only` means "the assembled
  document, ELSE the current topic report" instead of sending both.
- **Authority ≠ importance ≠ recency.** Three separate ordering axes, never
  conflated (see the authority note above). A limit makes the order load-bearing.
- **TS↔Python parity law.** Resolution is client-side only today (Supabase-direct
  reads; Python is the compute boundary, not a DB gateway). When a scheduled or
  background run needs server-side resolution, aidream implements the SAME
  selector semantics over the Matrx ORM against the SAME bundle rows — the
  bundle descriptor is already the wire format. A second, divergent shape is a
  defect. Deliberately DEFERRED until a scheduled/background consumer exists
  (none does today); the lazy-context server half (referenceable-resource
  registration) already shipped 2026-07-25.
- **Media is text-only in this wave.** `media.items` renders URLs, alt text and
  captions; the model does not see pixels. Real multimodal attachment is a
  tracked promise — `research.multimodal-media` in
  `lib/coming-soon/registry.ts` — and the catalog descriptions say "never
  pixels" out loud.

**Shipped bundles + agents** (`migrations/research_system_context_bundles.sql`,
`components/outputs/outputDefinitions.ts`). Seven system templates, keyed by
slug: `research-report-only` (feeds podcast/blog/slides/SEO — byte-identical to
the pre-bundle input, verified against every topic that has a report),
`research-brand-profile`, `research-reputation-business`,
`research-reputation-personal`, `research-gap-analysis`,
`research-literature-review`, `research-competitive-landscape`. Each domain
bundle points at its own `agent.definition` row, and those agents declare real
variables (`scraped_pages`, `page_analyses`, `source_quality`, …) whose names
match the catalog's `defaultVariable` values.

**Adding a domain output is DATA:** create the agent (declaring variables named
after catalog kinds), insert a bundle row selecting the resources it needs, add
one entry to `DOMAIN_OUTPUTS`. No new component, no new resolver branch. If you
find yourself writing code to add an output, something above is wrong.

---

## Key flows

- **Create topic / add keywords** — `ResearchInitForm`, `KeywordManager`, and
  `PipelineOrchestra` call `service.ts` directly against Supabase. These are
  ordinary RLS-owned database writes and never route through Python. Topic
  creation takes the org from the canonical active-org context
  (`selectEffectiveOrganizationId`) and optionally writes the project
  association edge; keyword/tag rows copy their owning topic's organization.
  Python remains the compute boundary. The wizard's draft state persists in
  the generic `wizardDraftSlice` (`lib/redux/slices/wizardDraftSlice.ts`,
  wizardId `research-init`) and survives refresh/idle/step-nav; it clears on
  successful creation. Wizard Back is deterministic: previous step, never
  `router.back()`; the header "Back to Topics" link is the only exit. Every
  wizard `ProTextarea` disables text-stat chrome, and template keyword
  `${name}` tokens resolve from the submitted topic name before persistence.
- **Run pipeline** — overview `Run pipeline` → `api.runPipeline(topicId, topic.organization_id)` → `useResearchStream.startStream` → events `dispatch`ed into `usePipelineProgress`. The organization is an assertion copied from the loaded topic, never the active sidebar organization; the backend reloads the topic as authority and rejects a mismatch before paid work. Every durable completion event identified by `shouldRefreshTopicOverview` immediately runs the lightweight `refreshProgress()` RPC reconciliation, while `onEnd` calls `pipeline.finalize()` + the full `refresh()`. Document is NOT produced here.
- **Live render** — `PipelineOrchestra` (graph) + `LivePipelineActivity`: finished stages → `StageStatSquare` rail (click to expand inline detail; external-link opens results route), active stage(s) → large card, writing streams via `StreamingTextPanel` (MarkdownStream). Completed keywords / scrape+analyze item batches / source feed auto-fold via `FoldableSection`; when the run finishes the whole drawer (metrics + stages + activity log) collapses together — user can reopen.
- **Live cost** — each `analysis_complete` / `synthesis_complete` event carries the backend's catalog-priced `cost_usd`; `usePipelineProgress` sums only those authoritative values. If any completed AI operation has unknown pricing, the live metric shows unknown instead of guessing from provider/model names. The persisted `cost_summary` replaces the live total after completion.
- **Document** — `/document` → `DocumentViewer` auto-generates (`api.generateDocument`, streams `chunk`+`document_complete`) when report-ready and none exists; persists to `rs_document`.
- **Tags** — Tags page: create tag + consolidate. Source detail: `SourceTagPicker` assigns sources to tags (`assignTagsToSource`/`removeSourceTag`); consolidation synthesizes over a tag's sources.
- **Curate** — `/curate` (`CurationTable`): `getCurationData` joins each source with importance + per-keyword rank + scraped content size + analysis state + tags in one shape; filter/sort/group by keyword or tag (incl. **sort by Authority**); select across groups → batch include/exclude (`bulkUpdateSources`) to clean the set before the final synthesis. Casual browsing stays on `sources`/`content` (shared `SourceResultsTable`).
- **Rank authority** — three ways, one backend path: (1) **auto** — `run_initial_pass` runs it after analysis (non-fatal, `force=false` so only new sources cost tokens); (2) **manual** — `AuthorityRankButton` (Sources toolbar) → `api.rankSourceAuthority` → `useResearchStream` → `onEnd` refetch; (3) the older **`AuthorityExportButton`** (manual copy/paste to any chat) is KEPT alongside, useful for ad-hoc/offline ranking; **`CondensedAuthorityExportButton`** (`Condensed`) exports url/title/description/age/snippets ordered best-first by Quality (`final_source_score`, descending), with pre-read → authority → search rank as tiebreakers; optional per-snippet char cap (Off / 250 / 500 / 1000 / 2000). Both export menus show total source + batch counts and keep the menu open when changing batch size. Backend chunks included sources ≤50/batch, runs the **Source Authority Ranker** agent, writes `authority_*` to `rs_source`. Per-source score/tier/reasoning render via `AuthorityTierBadge` on the source list, curation table, results table, and source detail.

---

> **Continuing this work?** Read
> [`docs/handoffs/research-lens-video-and-experts.md`](../../docs/handoffs/research-lens-video-and-experts.md)
> — vision, gap analysis, and the prioritized next steps for per-keyword goals,
> video, and expert identification.

## Invariants & gotchas

- **READINESS IS ONE PRIMITIVE — `readiness.ts` decides what "done" means, and nothing re-derives it.** Row counts cannot answer "is this topic finished?": a topic with 4 keywords, 3 researched, has data at every stage and rendered uniformly green while a whole keyword sat unprocessed. `get_topic_overview` returns a **`pending` ledger** (`migrations/research_overview_readiness_ledger.sql`) whose every field mirrors a real gate in the aidream orchestrator — so the UI never offers work the pipeline would refuse, and never calls a stage finished when it is not. `deriveReadiness(progress)` turns it into per-stage `ready | behind | stale`; the orchestra, the Next Steps card, the synthesis banner, and the document banner all consume THAT.
  - **The cascade is deliberate and partial.** A stage is `behind` only when it owes work of its OWN, never merely because an ancestor does. Before the search runs, the new keyword has no sources, so Content genuinely has nothing to do and **must stay green**; it flips amber the instant that keyword's scrape quota goes unmet. Marking the whole downstream red on any upstream change is a wall of alarm, not information.
  - **`stale` ≠ `partial`.** `partial` means something FAILED. `stale` means work is outstanding. Same amber family, different icon and label — never conflate them.
  - **Report and document staleness are NOT runnable work.** `/run` refuses a second topic synthesis once one exists (aidream `research/service.py:2014-2035`) and never assembles a document at all, so `hasRunnableWork` excludes both. Offering "Run pipeline" as the fix for a stale report would be a lie; each gets its own explicit decision.
  - Keyword-stage figures count **keywords** with outstanding work, never summed per-keyword source debt — sources are shared across keywords, so a sum would double-count.
- **Quota caps are real and stay enforced — but NEVER silently.** `max_keywords` and `max_keyword_syntheses` are hard backend gates (future account tiers depend on them). The defect was invisible enforcement: a keyword past `max_keywords` is dropped by `keywords = sorted[:max_keywords]` and never researched, forever, with no signal. Worse, `max_keyword_syntheses` is a topic-wide **total**, so a keyword can be searched, scraped, and analyzed and still never get a write-up. `keywordQuota.ts` is the pure decision layer; `KeywordQuotaDialog` is the ONE surface for it, shared by the keywords page and the orchestra's add-keyword modal. **Any new add-keyword entry point must route through it.** Never raise a cap without consent, and never write the keyword row before the caps that govern it.
- **Clicking a navigation item must never spend money.** Opening `/document` used to fire a full document-assembly call — the most expensive operation in the feature — with no warning and no way to decline. Document generation is explicit-only. Any future "helpful" auto-generation of a paid artifact is the same defect.
- **`rs_keyword.is_stale` is DEAD** — nothing in the backend has ever written it. The real "has this keyword been researched?" signal is **`last_searched_at`**, the exact gate `/run` uses (aidream `research/service.py:1687`). Never filter, badge, or branch on `is_stale`.
- **A superseded synthesis is kept, and the UI must be able to prove it.** Rewriting flips `is_current` and inserts a new version (aidream `research/synthesis.py:830`) — nothing is destroyed. `getSynthesis` filters to `is_current`, so those rows were invisible and "your previous report is kept" was unverifiable. `getSynthesisVersions` + `SynthesisVersionHistory` are what make Update/Rebuild an honestly reversible choice. **Two topic reports cannot be live at once** — the backend always supersedes — so never offer "keep both side by side" without a backend change.

- **A full `/run` emits NO per-stage "all-complete" event** — only a final `pipeline_complete` (per `app/(core)/research/RESEARCH_STREAMING_GUIDE.md`; `search_complete`/`analyze_all_complete` fire only from the single-stage endpoints). So `usePipelineProgress.finalizeStages` **must** sweep every non-terminal stage/item to terminal on `pipeline_complete` AND on the stream `onEnd`. Without it, spinners run forever. A started stage with items but 0 succeeded/0 failed → `partial`, not a false green `complete`. A stage activated only by phase/info with **zero items and zero outcomes** → `skipped` (hide it — never green "0 sources" / "0 scraped").
- **Orchestra graph = lifetime DB progress; Live Stream = this browser session.** The vertical pipeline nodes read `get_topic_overview` / `progress`; durable stream completions re-query that lightweight RPC immediately so the lifetime counts stay live without borrowing session-only counters. The RPC counts current content, the latest page-summary outcome per source, current keyword/topic syntheses, and document versions. The "This run" strip reads the `usePipelineProgress` reducer. They are not the same numbers — do not make the strip show topic totals, and never label a session strip "Last run" in a way that invites comparison to the graph. Labels: Search stage → **Sources** (search results), Scrape stage → **Content** (scrape results).
- **The orchestra graph animates ONLY when live.** `statusFor` (`PipelineOrchestra`) returns animating `queued`/`active` only when `isLive` (`stream.isStreaming || activeStage`); at rest it returns static `empty`/`gated`/`complete`. CSS animates only `data-status` `queued`/`active` + `active` edges. Never let a finished/reloaded graph pulse or "flow."
- **All generated content renders via `MarkdownStream`** (`@/components/MarkdownStream`, the rich-document engine) — synthesis, analysis, the live writing panel. **Exception:** the _loaded_ document uses `ReactMarkdown` to keep heading-slug `#anchor` TOC links (the canonical renderer has no rehype-slug). Never render generated content as plain `whitespace-pre-wrap`.
- **The backend always persists `result`/`content` on success.** Empty content is a real "produced nothing" state, not data loss — render it honestly (explicit "no content", never a perpetual spinner or a green check). Synthesis falls back to `result_structured` when `result` is empty.
- **Ranking — rank is everything, and it's PER KEYWORD.** A source's rank comes from `rs_keyword_source.rank_for_keyword`; **`rs_source.rank` is ambiguous and must not be used.** Cross-keyword importance (breadth beats a lone #1) is computed by `features/research/ranking.ts` via the tweakable `IMPORTANCE_CONFIG` (pure, client+server) and surfaced everywhere — source detail, source list, analysis list (ordered by it), keyword home. Analysis view shows completed-with-content first by importance, empty/failed in a bordered section; counts distinguish with-content vs empty vs failed — never "N passed" for N non-failed rows.
- **Stopped-early = content-first.** When a generation stops early (e.g. Gemini safety), always render any content it produced with an amber `StoppedEarlyNote` — gated on a `failed` status, NOT a stale `error` field (a clean success must never show the note). A red failure shows only when there is NO content. `MarkdownStream` is never wrapped in `prose` (it styles itself; a wrapper adds the empty-space and double-styling).
- **Tags are manual.** `/run` produces no tags. The orchestra Tags node is a static manual branch (no `isLive` animation, dashed edges) — it must not imply auto-generation. Functional loop = create → assign sources (`SourceTagPicker`) → consolidate.
- **Editing scraped content backs up the original ONCE.** `rs_content.original_content` is set on the first edit only — **never overwrite an existing backup**; the true scrape stays recoverable (`restoreOriginalContent`). Curation before analysis (`AnalyzeCurationDialog`) trims junk to cut model + RAG cost. Content reads are Supabase-direct — no FE cache to bust on edit.
- **"Sources discovered" = `stored_count ?? sources_found` summed** via `sourcesDiscoveredFromItems` — identical in `usePipelineProgress.derived`, `stageSquareData("search")`, and `SearchStageView`. Keep the formula in one function so one screen never shows two totals.
- **Authority ≠ importance — three distinct axes, never conflate.** `authority_*` = AI-judged source _trustworthiness_ (domain-led, written by the ranker agent). `importance`/`rank` = search-position salience (`ranking.ts`). Both surface side by side; they answer different questions. `AuthorityTierBadge` is the ONE renderer for authority everywhere — never hand-roll a score pill. It tolerates an out-of-contract tier (derives from score) so a stray agent value never breaks a row.
- **Streaming contract:** `app/(core)/research/RESEARCH_STREAMING_GUIDE.md`. Backend source of truth: aidream `research/stream_events.py` (authority events: `authority_rank_start`/`authority_rank_batch`/`authority_rank_complete`).
- **Cost is server-priced, client-aggregated.** Never infer dollars from model/provider names or token-count heuristics — pricing comes from the server, in the persisted `token_usage` blob (live events carry the same catalog-derived `cost_usd`). Absent pricing stays **unknown** (`costUsd: null` → renders "—"), never $0. The _aggregation_ is ours: `useTopicCosts` reads `rs_analysis`/`rs_synthesis`/`rs_document` direct from Supabase and `costs.ts` derives the per-call ledger, phase rollups, per-model rollup, and the `TopicCostSummary` totals. The aidream `GET /research/topics/{id}/costs` hop is gone from this client (it stays for consumers without Supabase access).
- **`token_usage` is read ONLY through `@/lib/token-usage/normalize`.** The column holds the generated `AggregatedUsageResult` shape (`{ total, by_model }`) — it has never held flat `input_tokens` / `estimated_cost` keys. Reading those directly is the bug that made every research cost render $0 on 100% of rows (see Change Log 2026-07-24, and the same bug's earlier server-side twin in `research/usage.py`). One parser, no callsite exceptions.
- **Users see Processing Units; admins additionally see USD.** Render every cost via `<CostValue>` / `useCostDisplay` (`components/processing-units/`) — never `toFixed(2)` a dollar figure in a research component. Failed calls burned real tokens: they are excluded from the billed total (matching the backend contract) but reported as "wasted" so the spend is never silently dropped.

---

## Related features

- Depends on: `features/files` (media), `@/components/MarkdownStream` + `features/rich-document`, `@/components/content-actions` (`ContentActionBar`).
- Sibling: `features/scraper` (standalone scrape inspector — a separate surface, not part of this pipeline).
- Backend: aidream `research/` (compute + persistence).

---

## Doctrine compliance

**Primitives reused** — `MarkdownStream` (rich-document engine); `ContentActionBar`; `components/ui` (Badge, Skeleton, DropdownMenu, Progress); `hierarchy-filter`; the projects feature's `ProjectPicker` (complete searchable org project list + canonical `CreateProjectWindow` opener in the creation wizard); `sonner` toast; `useServiceQuery` pattern; the Surface Values system (the v3 context menu + `buildApplicationScopeFromMenuContext` + `createResearchScope`), `ProTextarea`/`ProInput`.

**Primitives introduced**

- `LivePipelineActivity` + `StageStatSquare` + `stageMeta` (`components/overview/live-pipeline/`) — compact finished-stage stat tile + shared per-stage display data. No existing primitive renders a stage outcome as a docking rail square; `stageMeta` canonicalizes icon/label/route/duration/square-data (replaced `CompletedStageStrip`'s private copies).
- `FoldableSection` (`components/overview/live-pipeline/ui/`) — reusable collapse/expand row for live-pipeline work (completed keywords, item batches, source feed). Completed work auto-folds; click to reopen.
- `SourceTagPicker` (`components/sources/`) — source⇄tag toggle. No existing tag-assignment UI existed; consumes existing `assignTagsToSource`.
- `readiness.ts` — pure per-stage pipeline readiness. Nothing in the repo modeled "is this stage caught up with the one above it"; every surface previously answered it from raw counts and got it wrong. Single derivation consumed by the orchestra, Next Steps, and the synthesis/document banners.
- `keywordQuota.ts` + `KeywordQuotaDialog` (`components/keywords/`) — pure quota-shortfall evaluation + the one consent surface for raising a cap. Extends the existing `QuotaSettingsSection` model rather than forking a second quota editor; writes through the existing `updateTopic`.
- `useRunPipeline` (`hooks/`) — thin shared "run the pipeline from any surface" path. `PipelineOrchestra` keeps its rich live wiring; the keywords list and keyword detail consume this instead of duplicating stream plumbing.
- `SynthesisVersionHistory` (`components/synthesis/`) — on-demand superseded-version viewer. No existing UI read non-`is_current` synthesis rows (`VersionHistory` is document-only).

---

## Change log

- 2026-08-13 — **AI topic review restores its missing launch actions.** The
  review canvas requires the canonical `research_topic` destination before it
  renders **Start Research** and **View & Edit First**, but the shared entity
  registry had no frontend overlay for that registered token. The resulting
  `null` route removed the entire action row and looked like long keyword lists
  had pushed it off-screen. `research_topic` now owns its canonical
  `/research/topics/{id}` door in `entityRegistry`; focused coverage pins the
  route so the review actions cannot silently disappear again.
- 2026-08-11 — **Outputs Studio: the slide deck streams as its content-IR kind —
  and D165 is closed, so both live cards keep their topic anchor.** The deck
  generator awaited its whole run behind `GeneratingNote`, `parseJsonLoose`d the
  result, and hand-rendered `<Slideshow>` — the same double violation the SEO card
  had. The shape already existed: the agent's `{title, slides[]}` IS
  `presentation_deck` (`features/content-ir/kinds/presentation-deck.ts` → the
  presentation artifact renderer), so **no new kind was created** — the gap was
  that the agent emitted no `__kind` envelope and the surface bypassed the
  pipeline. Agent instructions rewritten via `agent_author` (v3): a canonical
  `{__kind:"presentation_deck", …, slides:[{__kind:"presentation_slide", …}]}`
  object, held to the registered schema exactly — `theme.preset` (one of the ten
  curated templates) instead of hand-picked hex colors, string-valued `extra`
  only (`eyebrow` / `imagePrompt`), and no `stat`/`metrics` layouts, because those
  need `extra.stats` **arrays** the kind's `record<string>` cannot carry. The slot
  is `use_latest`, so every consumer picked up v3 with no repin; it declares
  `output_kind="presentation_deck"` in aidream `client_slots.py` and on the live
  row. The card runs `useLiveAgentRun({slotKey})` into the floating
  `LiveRunWindow` — verified live on a real topic: the presentation renderer's
  own loading state appeared as the envelope opened, then a 12-slide deck in the
  "Minimal" preset, page never shifting. The persisted `meta.presentation` keeps
  the envelope verbatim and replays through `KindInstanceRender`, so a reload
  shows the identical component.
  **D165 (the execution system could not carry a `context_anchor`) is FIXED in the
  same change** — `contextAnchor` + `organizationId` are now top-level
  `ManagedAgentOptions`, threaded to `assembleRequest`, and both research cards
  pass them again. Also replaced this file's two `e instanceof Error` error
  branches with `extractErrorMessage`: a failing `rs_topic_append_output` was
  surfacing as the literal string "unknown error" instead of the RPC's real
  message.
- 2026-08-11 — **Outputs Studio: the SEO package streams live instead of sitting
  behind a spinner.** The card ran `useSlotRunner` (the one-shot `callApi` path,
  which yields no `requestId`), awaited the whole run showing only
  `GeneratingNote`, hand-parsed the result with `parseJsonLoose`, and rendered it
  with a bespoke `SeoView` card — a violation of THE FLOATING LAW and of the
  CANONICAL COMPONENT LAW at once. Now: the payload is the registered
  `seo_package` content-IR kind (`features/content-ir/kinds/seo-package.ts`), the
  run goes through `useLiveAgentRun({ slotKey })`, and the output streams into the
  floating `LiveRunWindow` where the pipeline routes it to `SeoPackageBlock` token
  by token — the title appears with its 60-character budget already measured while
  the FAQ is still being written. The page never shifts; the card shows only a
  one-line pointer at the window. The persisted `OutputAsset.meta.seo` replays
  through the SAME path (`KindInstanceRender`), and pre-kind assets map without a
  shim because the stored keys ARE the canonical snake_case ones.
  `SeoView` / `SeoField` / `SlugCopyButton` and the local `SeoPackage` interface
  are deleted. Agent instructions rewritten via `agent_author` (v3, `__kind` first,
  `title` second); the slot declares `output_kind="seo_package"` in aidream's
  `client_slots.py`. The `research_topic` anchor and the org survive the move:
  `HeadlessAgentJsonOptions` carries `contextAnchor` / `organizationId` into the
  launcher (D165, filed and closed the same day), so the server still reloads the
  topic's saved scope.

- 2026-08-10 — Per-topic agents page (W3) became a thin consumer of the canonical
  agent-slots primitives (`features/agents/slots/`): `compareContracts` /
  `systemContractRows` / `ComparisonResult` moved to
  `features/agents/slots/contract-compare.ts` (research's `agents/utils.ts` keeps
  only `shortUuid`); `ContractItem` rows, the `SlotResolutionRibbon` (truthful
  chain: Topic override → Your override → Org override → System default),
  `OverriddenCountBadge`, and the shared `useCopySlotAgent` Copy & Update hook
  (failure decomposition preserved) are consumed from there. The raw UUID-paste
  box + Validate button in `AgentRoleCard` was replaced by the canonical
  `SlotAgentPicker` in controlled-override mode — the write path is unchanged
  (`rs_topic.agent_config` keyed `<kind>_agent_id` via TopicAgentsPage
  onApply/onRemove; the picker's contract pre-flight is the gate, since that
  path has no server-side bind check).

- 2026-08-09 — **The research surface is agent-WRITABLE.** `matrx-user/research`
  declares four `writeTargets`, all `mode: "entity"` + `applyPolicy: "ask"`:
  `topic_description` and `topic_name` (canonical `updateTopicMeta`),
  `add_keywords` (canonical `addKeywords`), and `autonomy_level` (canonical
  `updateTopic`, vocabulary read from `AUTONOMY_CONFIG` — never re-typed
  literals). Handlers live in
  `components/shell/ResearchTopicWriteTargets.tsx`, registered from inside
  `TopicProvider` with `useSurfaceWriteHandlers` and refreshing through the
  store's own `refresh`/`refreshProgress` — the same write path and the same
  refresh path a user's click takes, whoever drove it. Entity mode because the
  topic shell owns no draft state: `topicStore` holds the server's row, and an
  agent run launches from the header on any of the ~20 sub-routes, so a value
  staged into `TopicSettingsForm`'s private buffer would be invisible from
  where the user is standing.
  **Framing is a target; spending is not.** The description IS the research
  question and keywords ARE the search plan, so an agent drafts both. Nothing
  that costs money — search, scrape, analysis, or the document assembly this
  feature calls its most expensive operation — is writable: an agent may shape
  what the pipeline WOULD research, only a human starts it.
  **`add_keywords` honors the quota gate** (Invariants, "Quota caps are real"):
  it evaluates `evaluateKeywordQuota` against the topic's LIVE keyword list
  before writing a row, dedupes against the existing keywords, and THROWS with
  the shortfall named rather than raising a paid cap — raising one stays a
  human decision through `KeywordQuotaDialog`. Live-verified on a real topic
  (the agent added the one keyword that fit, then was refused at 3/3 and
  reported the caps back accurately). Per-keyword `goal` is not accepted by
  this target yet — a natural follow-up, since the agent generating a keyword
  is the right author of its lens.

- 2026-08-08 — **Headless company quick-research.**
  `hooks/useCompanyQuickResearch.ts` — one confirmed call does create topic
  (system Company Research template) → template keywords → `runPipeline`
  (drained to completion) → `generateDocument`, with stage state for host
  UIs. Composes existing `createTopic`/`addKeywords`/`getTemplates` +
  `useResearchApi` only — no new write path. First consumer: content-plan
  Setup's "Research this company" (`features/marketing/content-plan/setup/`).
  `ResearchTopicSelect` callers can now pass `refreshKey` to refetch
  `useAllTopics` after an in-place create.

- 2026-08-08 — **Research intent surfaced.** New `research.research_intent`
  catalog + `rs_topic.intent_key`/`intent_brief` (server-composed, written
  only through `POST /research/topics/{id}/intent`). Added
  `service.ts#getResearchIntents` / `service/server.ts#getResearchIntentsServer`,
  `useResearchApi().setTopicIntent`, `components/settings/IntentSection.tsx`
  (picker above the quota ladder in `TopicSettingsForm`, confirm-gated
  because applying an intent resets quotas to its package) and
  `components/shared/IntentBadge.tsx` (muted chip next to the topic title in
  `app/(core)/research/topics/[topicId]/layout.tsx`). Also surfaced the
  already-live but invisible `rs_topic.videos_per_keyword` quota column in
  `QuotaSettingsSection`/`TopicQuotaFields`.
- 2026-08-08 — **Per-keyword goals (the focused lens) shipped end-to-end.**
  `rs_keyword.goal` + `rs_analysis.keyword_id` live (migration
  `research_keyword_goal_and_analysis_lens.sql`). Server: the goal rides
  inside the existing `topic` context variable via `get_keyword_context`
  (aidream `research/service.py`) — effective immediately with no
  prompt-version churn; a keyword WITH a goal gets its own per-lens analyses
  (dedup key is now `(source_id, keyword_id)`; lens runs never overwrite the
  source's topic-level `page_analysis`/verdict), goal-less keywords keep the
  8-for-1 shared topic-level analysis; keyword synthesis prefers its own
  lens rows and never sees another keyword's; the keyword-update path
  finally tells the Updater what topic/keyword/goal it is updating. FE:
  `ResearchKeyword.goal`, `addKeywords(..., goalsByKeyword)`,
  `updateKeywordGoal` (direct write), KeywordManager captures a goal on add
  and shows/edits it inline on every row. Open: goal capture in the creation
  wizard (`ResearchInitForm`) and a Suggest-agent prompt version emitting
  `keyword_goals` (plumbing tolerates both).
- 2026-08-08 — **Video sources are legible on the GENERIC surfaces.** New
  `getYouTubeVideoIdentities` (direct Supabase read of the compact
  `research.youtube_video` identity slice, keyed by video id parsed from
  `rs_source.url` via the canonical `lib/media/youtube.ts` parser) +
  `useYouTubeVideoIndex` (one batched read per list) +
  `components/shared/VideoSourceMeta.tsx` (channel · duration · views ·
  subscriber reach + honest processing chip — live status vocabulary is
  `unprocessed | processing | partial | completed | failed`). Wired into
  `SourceList` (desktop row + mobile card + library-thumbnail fallback),
  `SourceResultsTable` (keyword home + `/content`), and `SourceDetail`
  (inline `youtube-nocookie` player replaces the static thumbnail, plus
  Channel/Video/Processing meta rows linking to the topic YouTube library).
- 2026-08-06 — Final decoupling acceptance repair: every creation-wizard
  `ProTextarea` disables text statistics, and template `${name}` keyword tokens
  resolve before the keywords are persisted.
- 2026-07-29 — Outputs Studio title/description counters now import the
  canonical SEO limits and code-point counter from
  `features/marketing/seo/serp/metrics.ts`.
- 2026-07-29 — Claude: media size/tier/aspect heuristics extracted to the shared core `lib/media/categorization.ts` (type-agnostic `CategorizableMedia` shape; consumed by marketing's Media surfaces too). `components/media/mediaDimensions.ts` + `mediaCategorization.ts` are now thin ResearchMedia adapters that delegate — behavior unchanged; change thresholds/heuristics ONLY in the shared core.
- 2026-07-28 — D98 fixed: OutputsStudio loading derived from fetch lifecycle; banned Sparkles icon replaced; stale lint disables removed.

- `2026-07-27` — **`matrx-user/research` surface taken to `verified`.** The manifest was a stub (12 values, no groups, no urlPattern, no intro, never audited). It now declares 34 surface-specific values across six curated groups, and `buildResearchContextData` emits every one from the topic row + progress ledger the topic shell already holds — including the three layers an agent must not conflate: COUNTS (`pipeline_progress` + the individual `*_count` values), READINESS (`readiness` from `deriveReadiness`, `pending_ledger`, `runnable_summary`, `report_stale`, `document_stale`) and QUOTAS (`topic_quotas`, `quota_headroom`, where a zero means the next add is silently dropped). Also added: org/visibility/template/timestamps, `active_view` (the shell derives the sub-route from the pathname), sources-by-status, tag/content/document/synthesis counts, tag suggestions, outputs + search + agent config, and tone profile. Large or rarely-needed payloads (`current_synthesis_text`, `tag_suggestions`, `outputs_config`, `default_search_params`, `agent_config`, `topic_metadata`) are `autoContext: false`.
- `2026-07-26` — **Four new source-triage columns surfaced in the UI.**
  `rs_source.scrape_worthiness`/`redundancy_group`/`entity_match_confidence`/
  `snippet_relevance` (backend-only until now) regenerated into
  `database.types.ts` and added to `ResearchSource` +
  `rowToResearchSource`. `SourceDetail` shows all four with null-safe
  formatting and a tooltip on scrape worthiness clarifying it predicts fetch
  DELIVERY, not quality. New `ScrapeWorthinessFlag` (amber "Low fetch odds"
  chip, `scrape_worthiness < 20`, `SCRAPE_WORTHINESS_SKIP_THRESHOLD` in
  `constants.ts`) explains why a source is silently skipped by the scraper —
  wired into `SourceList` (Read column) and `SourceResultsTable`. New
  `RedundancyGroupBadge` chip surfaces `redundancy_group` next to the
  hostname in both tables and on `SourceDetail`. NULL is rendered as `—`
  everywhere, never `0` or a bad/red state.
- `2026-07-25` — **Lazy delivery + generic preview window + "read" copy.**
  `BundleBinding.delivery: "direct" | "context"` shipped: context bindings emit
  `resource_ref` envelopes through `runtime.context` (new field on
  `AgentExecutionRuntime`) instead of injected text; picker Inject/On-demand
  toggle, budget meter "on demand" rows, preview "Attached on demand" section;
  aidream references registry gained all research component tokens. The
  Context Preview window's viewing machinery was extracted into the generic
  `TextSectionsWindow` (`features/window-panels/windows/text-sections/`).
  Catalog snippet parsing consolidated onto `normalizeSearchSnippets` (D104
  closed). Full user-facing "scraped"→"read" copy sweep across components.
  Rulings recorded: no agent-variable renames; page.images + media.items both
  stay; multimodal media tracked as `research.multimodal-media` Coming Soon.
- `2026-07-25` — Fixed the condensed authority export's canonical snippet
  normalizer import and aligned the sources filter coverage prop with the
  rendered string contract, restoring the research type gate.
- `2026-07-25` — **`rs_context_bundle` default visibility corrected to
  `internal`.** The CREATE migration shipped with `DEFAULT 'personal'`, which
  locks out org collaborators (THE SECURITY PHILOSOPHY). Live default +
  `platform.entity_types.default_visibility` flipped via
  `migrations/research_context_bundle_visibility_internal.sql`; CREATE file
  corrected for fresh installs. System templates remain `public`.
- `2026-07-25` — **A topic's whole holdings are now selectable agent input
  (resource catalog → context bundles → agents).** Every output had exactly ONE
  input — the report as a single blob — while search results, raw payloads,
  scraped bodies, page analyses, scoring, syntheses and media sat unreachable.
  Added: the `research_topic_resource_manifest` RPC (measured sizes, no bodies,
  one round trip — truth-checked against direct counts on the 3,303-item topic),
  the catalog/selector/resolver core, `research.rs_context_bundle` (rules not row
  ids; templates via `entity_id IS NULL`), the `/context` Context Builder, and
  seven system bundles + six domain agents (brand profile, reputation
  business/personal, gap analysis, literature review, competitive landscape).
  Publishing outputs now read the report through `research-report-only`;
  verified it picks the identical row and length as the old direct read on all
  17 topics that have a report. Live end-to-end: Brand Profile consumed 105,969
  input tokens and returned a cited profile whose facts appear only in the
  scraped pages. That run also **falsified the token estimator** — the textbook
  4 chars/token under-counted by 23%, so `lib/tokens/estimate.ts` now uses
  measured 2.9/2.4 divisors and a regression test pins the measurement. Two
  UI-honesty fixes fell out of the build: filter exclusions are no longer
  reported as "context was trimmed" (only involuntary drops are), and a freshly
  loaded bundle no longer shows a false "edited" badge.
- `2026-07-25` — **Adding a keyword to a finished topic is now a first-class,
  fully-visible flow (Phase 1 of the incremental-research work).** Adding a 4th
  keyword to a completed topic previously left it inert and invisible: the
  orchestra stayed all-green, the keyword looked identical to a researched one,
  two silent quota caps could drop it entirely, and the only way to notice was
  to compare counts by hand. Now:
  - **New readiness ledger.** `get_topic_overview` gained a `pending` block
    (`migrations/research_overview_readiness_ledger.sql`, applied + ledgered)
    reporting per-stage outstanding work + artifact staleness + quota headroom,
    each field mirroring a real orchestrator gate. New pure
    `features/research/readiness.ts` (`deriveReadiness` / `hasRunnableWork` /
    `runnableSummary`) is the ONE consumer-facing derivation.
  - **Honest orchestra.** New `stale` `OrchestraStatus` (amber, `RefreshCw`,
    distinct from failure-meaning `partial`); node hints show the reason
    ("1 keyword never searched"); the control strip says "Work pending" /
    "Report out of date" instead of a false "Report ready". Verified against a
    fixture reproducing the exact reported state: Keywords green, Sources amber,
    Content/Analysis green — then Sources green / Content amber once the search
    lands sources.
  - **Next Steps card** (`components/overview/PipelineNextSteps.tsx`) — names
    every outstanding decision above the graph, states that a run reuses
    existing scrapes/analyses, and says explicitly that it will NOT rewrite the
    report or document.
  - **Quota gate.** New pure `keywordQuota.ts` + shared `KeywordQuotaDialog`,
    wired into both add-keyword entry points: adding past `max_keywords` or
    `max_keyword_syntheses` now explains the consequence and offers a one-click
    raise (a failed raise surfaces loudly — the future tier-limit case).
  - **Report supersession is a user decision.** `report_stale` drives a banner
    on the overview and `/synthesis` offering Update vs Rebuild; new
    `getSynthesisVersions` + `SynthesisVersionHistory` make prior versions
    readable so "your current report is kept" is verifiable rather than claimed.
  - **`/document` no longer auto-generates.** Opening the tab fired a full
    document-assembly call unprompted; generation is now explicit, with a
    cost-honest empty state and a `document_stale` banner.
  - **Fixes:** dead `is_stale` filter/badges repointed to `last_searched_at`
    (nothing has ever written `is_stale`); swallowed `catch {}` on keyword
    add/delete now toast; both add paths refresh the progress ledger.
  - Tests: `__tests__/readiness.test.ts`, `__tests__/keywordQuota.test.ts` (22).
  - **Deliberately NOT in this phase:** per-keyword analysis lens. Analysis is
    still per-source with no keyword awareness (`rs_analysis` has no
    `keyword_id`; the Page Summary agent receives only topic/page fields), so a
    reused analysis is never keyword-tailored. That is the next focused session.
- `2026-07-25` — **Orchestra counts are accurate and live.** The top graph used
  a cold `get_topic_overview` snapshot and refreshed only for search/end
  events, so Sources moved while Content, Analysis, Synthesis, Report, and
  Document stayed stale throughout the run. Every durable mutation event now
  triggers a race-safe lightweight progress refresh. The RPC was also
  corrected to count current content, the latest page-summary outcome per
  source (not duplicate historical analysis rows), current keyword syntheses,
  canonical `scope='topic'` reports (with legacy compatibility), and document
  versions. Regression coverage pins durable-vs-transient refresh routing.
- `2026-07-24` — **Outputs Studio preserves the topic organization on every
  output run without trusting the browser as scope authority.** Podcast, blog,
  slides, and SEO pass a stable
  `research_topic`/`topicId` context anchor; aidream RLS-reloads that topic and
  uses its saved organization before conversation or agent preparation. The
  earlier explicit `organization_id` and `matrx-frontend`/`research`
  attribution remain as assertions/diagnostics, but cannot move an established
  topic when active UI context changes. The shared launcher still rides
  canonical `callAgentStart`/`callApi`.

- `2026-07-23` — **Project selection shows everything and creates in place.** AI, manual, and template creation paths now reuse the projects feature's `ProjectPicker`, filtered to the active organization: one complete searchable/scrollable list with no secondary load/pagination step, plus a persistent **New** button that opens the canonical `createProjectWindow` and auto-selects a manually created project.
- `2026-07-22` — **THE VIEW LAW.** `getAllTopics()` was a bare RLS-only read ("All really means All" — the exact anti-pattern the law targets for a multi-org user); it now explicitly `.eq("created_by", userId)`. "All topics" now means "all of mine", not every org's topics blended together.
- `2026-07-22` — **This-run strip honesty.** Empty phase-activated stages finalize as `skipped` (hidden), not green `complete` with zeros. Live strip labeled "This run · session only"; stage labels aligned to orchestra nouns (Sources / Content / Analysis / Synthesis). Search square uses `sourcesDiscoveredFromItems` (same formula as metrics strip).
- `2026-07-22` — **Compact canonical project selection.** The topic creation wizard now uses the shared `EntityTargetPicker` scoped to the active organization instead of rendering a bespoke all-organization wall of large project cards. The project association remains optional and controlled by the wizard; selecting it never mutates global app context.
- `2026-07-22` — **Existing-topic execution scope anchored to the topic.**
  Pipeline launch now sends the loaded topic's `organization_id` as a
  consistency assertion instead of relying on ambient active-org state; the
  backend remains authoritative and rejects a mismatch before starting work.
- `2026-07-24` — **Research costs actually compute (and get a full per-call breakdown).**
  Root cause: `tokenUsageFromJson` parsed a flat `{ input_tokens, estimated_cost }`
  shape that no row has ever been written in (verified: 0 of 331 `rs_analysis`
  rows), so the Analysis stats bar, analysis cards, and DocumentViewer all
  rendered 0 tokens / no cost. Parsing now lives in one platform primitive,
  `lib/token-usage/normalize.ts` (canonical `{ total, by_model }` + a legacy
  flat compat branch + `rollupByModel`), covered by
  `lib/token-usage/__tests__/normalize.test.ts` using a verbatim production row.
  New `features/research/costs.ts` builds the per-call cost ledger; new
  `hooks/useTopicCosts.ts` (shared dedup + 15s cache) replaced
  `useCostSummary`'s aidream round-trip with a direct Supabase read via
  `service.getTopicCostLedger` — it still exports `useCostSummary` in the exact
  `TopicCostSummary` shape, so PipelineOrchestra / LastRunSummary /
  LivePipelineActivity were untouched. `/research/topics/[id]/costs` rebuilt:
  five headline tiles (units, calls, input, cached, output), by-phase, by-model,
  and a fixed-layout ledger of **every AI call** (time, phase, subject, model,
  provider, status, in/cached/out/total tokens, cost). Cost rendering moved to
  the new `<CostValue>` / `useCostDisplay` primitive — Processing Units for all,
  USD appended for admins (`selectIsAdmin`) — and the raw `$x.xxxx` figures in
  AnalysisList / AnalysisCard / DocumentViewer went with it. The overview
  receipt gained an "AI cost" line linking to `/costs` (cost was previously
  absent from the overview entirely; `CostMetricsCard` was dead code and was
  deleted, as were `getCosts` and the `costs` endpoint constant).
- `2026-07-21` — **Research project decoupling — frontend cutover (Phase 2).**
  Project is now OPTIONAL and association-backed end to end: `createTopic(organizationId, input, { projectId? })` returns `{ topic, projectLink }` (edge failure = loud retryable warning, topic survives); `getTopicsForProject(s)` reimplemented over `associationsService.listForTargets` + one batched read; new `getTopicProjectLinks` / `setTopicProject`; `TopicList` project labels from edges; duplicated settings forms consolidated into `settings/TopicSettingsForm` (used by page + panel); admin `ProjectsOverview` re-keyed on edges; `updateTopic` no longer writes `project_id`. Vocabulary renamed to topic-wide synthesis (`scope:'topic'`, `max_topic_syntheses`, `topic_syntheses`) with explicit `PHASE-4 COMPAT` boundary translation. Wizard: org from canonical active-org context, durable draft via new generic `wizardDraftSlice`, deterministic Back, `enableTextStats={false}` on the description, `[suggest-stream]` debug logs removed. DB types regenerated (nullable `project_id`; stale quota-field casts repaid via `rowToResearchTopic`). Error rules: `_mirror_fk_to_assoc` pinned critical + 23503 association-registration translation in `lib/diagnostics/errorTierRules.ts`. Tests: `__tests__/serviceTopics.test.ts`. System of record: `common-docs/projects/research-project-decoupling/FEATURE.md`.
- `2026-07-21` — **Topic initialization moved to canonical DB-direct CRUD.**
  Topic creation and keyword insertion now use the Supabase research service,
  copy the owning organization explicitly, and reserve Python for compute. The
  legacy Python creator was also hardened to reject nonexistent projects and
  preserve organization scope for non-browser consumers.
- `2026-07-15` — **Authoritative live research cost.** Backend completion events now carry catalog-derived `cost_usd`; `usePipelineProgress` deleted its Claude/GPT/Gemini substring price table and sums only server values. Unknown pricing renders as unknown, while the terminal persisted `cost_summary` remains authoritative.
- `2026-06-28` — **Moved to the `research` schema (clean cut).** All 12 `rs_*` tables + the `rs_source_keywords` view moved `public` → `research` (`research_canon_05`); registry `schema_name` updated; 8 functions repointed (4 hardcoded + 4 bare-ref incl. `get_topic_overview`/`get_user_hierarchy`). FE repointed to `.schema('research')` (55 calls + 3 type refs across 4 files); `research` added to `db-types`; types regenerated; dead-relations + `platform.deprecated_relations` registered. Verified: PostgREST serves `research.rs_topic` (200), `public.rs_topic` 404s (clean cut), counts preserved, `get_topic_overview` runs. aidream already modeled on `research` (one raw-SQL repoint in matrx-rag).
- `2026-06-28` — **DB canonicalization (platform standard).** All 13 `rs_*` relations brought onto the canonical model: `rs_topic`/`rs_template` as entities (tokens `research_topic`/`research_template`), the other 10 tables as components of `research_topic`. Non-canonical project-cascade RLS replaced by `iam.apply_rls`; legacy `set_updated_at` triggers dropped; all 12 tables verify zero FAIL / zero WARN; owner-impersonation confirmed no data hidden. Existing topics set to `visibility='internal'`; system templates `public`.
- `2026-06-24` — **Matrx entryway prefill.** `/research/topics/new?mode=ai&topic=...` now seeds the AI subject textarea as well as the draft topic name, allowing the new `/demos/matrx-entry` route to hand users into the existing research project-selection and AI topic-shaping flow without creating a parallel pipeline.
- `2026-06-23` — **Surface agent wiring (`matrx-user/research`).** New `agent-context/buildResearchContextData.ts` (pure `createResearchScope` mapper — baselines `content`/`selection`/`context` + customs `topic_*`/`autonomy_level`/`keyword_list`/`source_count`/`included_source_count`/`analysis_count`/`current_synthesis_text`/`synthesis_documents`) + `RESEARCH_CONTEXT_MENU_PROPS` + `createResearchExtraSections(handlers)`. `UnifiedAgentContextMenu` mounted on the AI-mode Subject query (editable, `ProTextarea` gains `surfaceName` + `getApplicationScope`), the `DocumentViewer` document, and each `SynthesisList` synthesis body (read-only). `getApplicationScope` is a plain fn reading the live DOM selection. No manifest/DB change (every value pre-declared).
- `2026-06-21` — **Research header back nav.** `/research/topics/new` and `/research/topics` shell headers now left-align the back control with a visible label ("Back to Topics" / "Research") instead of a lone centered chevron in the glass header center slot.
- `2026-06-21` — **Topic init wizard — keyword chips.** Manual/template keywords (`TextArrayInput` default) and AI streaming/review keyword pills now use solid `bg-primary text-primary-foreground` instead of the broken `bg-gradient-radial` chip style (light text on no background in light mode). AI review keyword rows use solid `bg-muted` rows instead of translucent violet tints.
- `2026-06-21` — **Topic init wizard — light/dark contrast.** `/research/topics/new` init form (`ResearchInitForm`, `TemplatePicker`, `AutonomySelector`) now uses explicit `text-foreground` on headings, labels, cards, project rows, keyword editor, and ProInput/ProTextarea fields; accent badges use `dark:` variants; keyword review panel uses solid `bg-card` instead of translucent `bg-card/40`.
- `2026-06-19` — **Media gallery — YouTube split.** `/media` embeds watch/embed/shorts URLs inline (`youtube-nocookie.com` iframe). Channel/profile links (`/user`, `/channel`, `/@handle`, legacy custom URLs) bucket into a separate **YouTube Channels** list section (compact rows with Open on YouTube). Helpers: `isYouTubeChannelUrl`, `youTubeChannelLabel`, `isYouTubeChannelMedia` in `lib/media/youtube.ts` + `mediaCategorization.ts`.
- `2026-06-19` — **AI topic init — quota conflict UX.** `/research/topics/new?mode=ai` review step no longer silently backfills keywords dropped by `max_keywords`. All AI suggestions stay visible; keywords beyond the cap render red with a warning banner, **Pipeline settings** dialog (`AiReviewQuotaDialog` + `QuotaSettingsSection`), and **Start Research** blocked until the user raises the cap or removes extras. Saving settings persists newly-in-quota keywords.
- `2026-06-19` — **ProInput / ProTextarea sweep.** User-authored text fields across research (init wizard, topic settings, tags, paste-content, content editor, pipeline keyword form, templates admin) and project inline name/description now use the official Pro components (voice, cleanup, copy). Numeric quota/scrape-threshold fields stay on bare `Input type="number"`.
- `2026-06-19` — **Source authority ranking.** New AI step scores how authoritative each source is (0-100 + `high|medium|low` tier + one-sentence reasoning), written back to `rs_source` (`authority_*` columns, migration applied). Server: `POST /research/topics/{id}/sources/rank-authority` (streaming) → `research/source_authority.py` chunks included sources ≤50/batch, runs the floating **Source Authority Ranker** agent (`be502ddf-…`, always-latest), persists per source; **also auto-runs inside `run_initial_pass`** (after analysis, non-fatal, `force=false`). FE: `AuthorityRankButton` (Sources toolbar) + the existing `AuthorityExportButton` (kept — manual copy/paste for ad-hoc use), `AuthorityTierBadge` (source list desktop+mobile, curation table, results table, source detail), authority sort in `/curate`, `authority_score` `SourceSortBy`. Synthesis source-selection unchanged for now (authority captured + shown; algorithm shift comes later). Verified end-to-end (real DB write-back). _Pending:_ regen `api-types.ts` (hand-written `AuthorityRankRequest` bridges until then).
- `2026-06-18` — **Two data-loss bugs fixed (outputs + analyses).** (1) **Blog/slides outputs were silently dropped** — `rs_topic_append_output` used a two-level `jsonb_set(outputs,'{kind,assets}',…,true)`, but Postgres `jsonb_set` never creates a missing intermediate parent, so the _first_ asset of any kind whose key didn't already exist in `outputs` was a no-op (seo/podcast only persisted because their keys pre-existed from the old client path). Fixed: build the kind object and set it via the single-level path `{kind}` (migration re-applied + ledger checksum updated). (2) **Editing source content appeared to delete its analysis** — editing writes a new content version (v+1) and `SourceDetail` filtered analyses strictly to the current version, hiding the prior (expensive) ones. Verified via DB: those analyses are NOT deleted (they survive on older versions; `ON DELETE CASCADE` only fires if the content row itself is deleted, which editing doesn't do; 0 orphaned analyses). Fixed: `currentAnalyses` falls back to the newest prior version that has analyses, shown under an amber "ran on v{n}, edited since — re-analyze to refresh; previous analysis was kept" banner.
- `2026-06-19` — **Outputs Studio — podcast media now survives a refresh.** The podcast asset persisted only `episode_id` + `slug` + a `/podcast/{slug}` link, so on cold load the "Generated episodes" list showed a bare title + external link — every still, clip, the composed video, and the audio were dropped (they lived only in the live `usePodcastRun` state). Fixed end-to-end: on completion `PodcastOutputCard` now writes the full media set into the asset's `meta` — `audio_url`, `cover_url`, `image_urls[]`, `video_urls[]`, `official_video_url` (all durable PUBLIC CDN URLs from `pc_episodes` + the official-video persist, never signed) via the typed `PodcastMedia` shape in `outputs.ts` (`podcastMediaFrom(asset)`). New `PersistedEpisode` component re-renders the whole episode inline from that index on cold load — cover thumb, audio player (always shown), and an expandable gallery of the composed video + clips + stills — with no podcast-domain query; the deep link remains. Pre-fix episodes were backfilled from `pc_episodes` (cover/composed-video/audio merged into their meta via an idempotent JSONB merge; the research path only persists the chosen cover + composed video to `pc_episodes`, so old episodes recover those three, new ones get the complete set). Blog/slides/SEO already inline their full content in `meta` (markdown / presentation deck / seo package) and re-render on cold load unchanged — verified against the live `rs_topic.outputs` rows.
- `2026-06-18` — **Manual tagging on the Sources list.** Tags were only assignable on the source-detail page (`SourceTagPicker`) or hidden in `/curate` — undiscoverable when browsing. The Sources list (`SourceList`) now shows each source's tag chips inline + a compact per-row `SourceTagsInline` picker (toggle existing tags, "Create new tag…"), on both desktop rows and mobile cards. `BulkActionBar` gained an **Add to tag** dropdown (existing tag or create-new) so the multi-select set can be tagged in batch, matching `/curate`'s `CurationBatchBar`. Backed by new `getTopicSourceTags(topicId)` / `useTopicSourceTags` (one query for the whole topic's source⇄tag map, keyed by `source_id` — no per-row fetch). Reuses existing `assignTagsToSource` / `removeSourceTag` / `addTagToSources` / `createTag`; no schema change. (Note: pipeline-level auto-tag — `max_auto_tag_calls` — remains unwired in the backend, §B2; per-source "Suggest tags" still lives on source detail.)
- `2026-06-18` — **Outputs Studio fixes.** (1) Slide-deck preview no longer clipped — removed the fixed `h-[440px]` wrapper so the `Slideshow` renders at its natural height. (2) Output persistence made atomic — new `rs_topic_append_output` RPC (row-locked server-side append into `rs_topic.outputs`; migration applied + ledgered) replaces the client read-modify-write that let the 8–12 min podcast run clobber blog/slides generated during its wait. (3) Podcast wait now reuses the generator components (`LiveProgressRail` + `ProductionTeaser` + `MediaOptionsGrid`) so cover art, clips, and a script sneak-peek fill the long render.
- `2026-06-17` — **Progressive folding in live pipeline.** Completed keywords fold to pills (click to expand); scrape/analyze "Recently completed" batches and the search source feed auto-collapse when work moves on. Finished stages dock as `StageStatSquare` tiles — click toggles inline stage detail (external-link still opens the results route). When a run completes, `LivePipelineActivity` collapses metrics + stage detail + activity log together; "Show details" reopens everything.
- `2026-06-15` — Analyze-curation popup (`AnalyzeCurationDialog`): trim/edit scraped content before the analysis call; `rs_content.original_content` backs up the original once (migration applied + ledgered) and `restoreOriginalContent` recovers it.
- `2026-06-15` — Power curation table at `/curate` (`CurationTable` + `getCurationData`): human-in-the-loop work surface — filter/sort/group by keyword+tag, importance + content-size columns (large pages flagged as likely-junk), batch include/exclude. Keyword + content lists made tabular via shared `SourceResultsTable`; "Page Summary" labels; page summary expanded by default; ugly streaming carets removed everywhere.
- `2026-06-15` — Per-keyword home route (`keywords/[keywordId]`); per-keyword importance ranking (`ranking.ts` + `IMPORTANCE_CONFIG`) surfaced on source detail/list, analysis list, keyword home (replaced ambiguous `rs_source.rank`); re-analyze + all result views preserve content + show an honest "provider stopped early" reason instead of blanking.
- `2026-06-15` — Research UI overhaul: terminal sweep stops perpetual spinners; `isLive`-gated graph animation; `MarkdownStream` everywhere (doc keeps ReactMarkdown for TOC); honest analysis/synthesis empty states + rank ordering + canonical counts; document auto-generates on report-ready; tags honesty + manual `SourceTagPicker` loop; finished stages collapse into an animated `StageStatSquare` rail; `ActivityFeed` fills height. Created this FEATURE.md; corrected README route paths.
- `2026-06-16` — **Vision & gap analysis** doc added: [`docs/VISION_AND_GAPS.md`](./docs/VISION_AND_GAPS.md) — code-grounded FE+BE gap list (tag-consolidation render stub, dead `suggestTags`, reserved auto-tag/consolidate quotas, Brave-only search, YouTube transcript stub) **plus** the "research as a content engine" vision (one report → podcast/slides/SEO/blog) and source expansion (YouTube transcripts, X via xAI `x_search`), grounded in the existing matrx-graph fan-out workflow precedent (`study_pack_v1`). Read it before any cross-feature research work.
- `2026-06-16` — Topic-agents **Copy & Update** (`AgentRoleCard`): duplicate a role's current agent (`agx_duplicate_agent`) → connect as override → open the builder; `TopicAgentsPage.handleApply` is now a pure data op (rethrows) so callers own messaging (no double-toast, failed connect ≠ failed copy). Rich keyword cards (aggregate flow + expandable top-10 results). Scraped-size **Data** column on the content list (`SourceResultsTable.dataSizeFor`, muted for thin pages, hidden on narrow screens). Clearer run-pipeline dropdown — two-line labels; "Run everything pending … skips steps already done" is verified against the backend's idempotent `run_initial_pass`. New shared `format.ts#fmtCount` replaces the divergent per-component `fmtNum`/`fmtSize`.
- `2026-06-16` — **Topic shell responsiveness.** `ResearchSidebar` is now collapsible (icon-only `w-12` rail ⇄ `w-44`, persisted in `localStorage` `research:sidebar-collapsed`, tooltips in the collapsed rail, `PanelLeftClose`/`Open` toggle). The `PipelineOrchestra` graph is now driven by a **container query** (`@container/orch`) instead of viewport breakpoints, with **two real layouts (both keep the connectors + live animation)**: the full horizontal spine + Tags branch renders only at `@7xl` (when there's genuinely room for all seven nodes + edges); below that it renders a **centered vertical flow** — nodes stacked with animated vertical connectors (`OrchestraEdge orientation="vertical"`, new `.orchestra-edge-flow--v` CSS), Tags as an inline dashed manual branch. This fixes nodes collapsing to a single truncated letter on narrow/medium widths **without losing the flow/animation** (the old compact layout was an edgeless grid). Layout reacts to the _real_ available space (which grows when the sidebar collapses) and stays legible with any amount of data. The spine's edge animation is unchanged — it only ever animates while `isLive`, so a finished run shows static connectors by design.
- `2026-06-16` — **Content Engine, Wave 0 + Outputs Studio.** (a) Tag consolidation now renders its real output (`ConsolidationView` streams `consolidateTag` + reads the persisted `scope="tag"` synthesis — was a dead placeholder). (b) `SourceTagPicker` gained a live **Suggest tags** action (AutoTagger; accept → create+assign) — surfaces the previously-dead `suggestTags` API. (c) New **Voice & Lens** `tone_profile` topic field (rs_topic migration 0014, + `outputs` JSONB) wired into Settings. (d) New **Outputs Studio** at `/research/topics/[id]/outputs`: turns the report into publishable formats — **podcast is live** (reuses `usePodcastRun` → `/podcast/generate` with the report as `FULL_CONTENT`; episode persists to `pc_episodes` + is indexed in `rs_topic.outputs` via `components/outputs/outputs.ts`); **blog is also live** (`content_to_blog` agent — a forked Document-Assembly agent run via the live `/ai/agents/{id}` endpoint with `useRunAgent`, no deploy; markdown rendered + `ContentActionBar` for WordPress copy/export); slides/SEO are honest "Soon" cards. Both podcast + blog verified end-to-end (real artifacts generated). **Pattern:** output generators are saved agents (`agx_agent` data) run via the live agent endpoint — buildable/verifiable with no aidream deploy. Studio index lives in `rs_topic.outputs` (refs; blog markdown inlined for MVP — move to `pc_articles` in distribution wave). aidream (deploy-pending): suggest-tags emission fix, optional auto-tag/auto-consolidate passes in `run_initial_pass`, `XAI_API_KEY` boot validation.

---

> **Keep-docs-live rule (CLAUDE.md):** after any substantive change, update Status, flows, Invariants, and the Change log here.
