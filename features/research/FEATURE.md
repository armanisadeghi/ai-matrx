# FEATURE.md — `research` local mechanics

> Cross-repo system-of-record: `/Users/armanisadeghi/code/common-docs/systems/knowledge/research/STATE.md` — read it before touching this feature in ANY repo.

What research IS, what it is for, its data model, its decisions, its status and every cross-repo
contract live in the node kit above (STATE / VISION / DECISIONS / HANDOFF + PIPELINE_FLOW,
STREAMING_GUIDE, EXTENSION_CAPTURE_CONTRACT). **This file is only the imperative rules an agent
editing THIS directory must obey.**

## File map

**Routes** — all under `app/(core)/research/` (NOT `(public)/p/research` — that path is dead):
`/research` · `/research/topics` · `/topics/new` · `/topics/[topicId]` and its sub-routes
`sources`, `sources/[sourceId]`, `content`, `curate`, `keywords`, `keywords/[keywordId]`,
`youtube`, `experts`, `analysis`, `synthesis`, `document`, `documents`, `tags`, `tags/[tagId]`,
`context`, `outputs`, `media`, `costs`, `settings`, `agents`, `tasks`. Super-admin surface:
`app/(admin)/administration/knowledge/research-system/`.

**Hooks** (`hooks/`) — `useResearchStream()` (adopts the pipeline stream),
`usePipelineProgress({topic})` (stream events → `PipelineState`), `useResearchApi()`
(compute-only Python calls), `useResearchState.ts` (Supabase read hooks), `useRunPipeline()`.

**Services** — `service.ts` (client Supabase reads/writes incl. topic/keyword CRUD),
`service/server.ts` (SSR fetch for the topic layout), `service/research-endpoints.ts` (the Python
endpoint map). **State** — feature-local Zustand (`state/topicStore.ts` via
`context/ResearchContext.tsx`), server-hydrated; NOT the global Redux store.

**Pure logic** — `readiness.ts`, `keywordQuota.ts`, `ranking.ts`, `costs.ts`, `copy.ts`,
`format.ts`, `constants.ts`, `utils/init-route.ts`, `resources/` (catalog · manifest · selector · resolve),
`agent-context/buildResearchContextData.ts`.

## The rules

- **`readiness.ts` decides what "done" means and NOTHING re-derives it.** Row counts cannot answer
  it. `deriveReadiness(progress)` consumes `get_topic_overview`'s `pending` ledger; the pipeline
  graph, Next Steps card, and the synthesis/document banners all consume THAT. A stage is `behind`
  only when it owes work of its OWN. `stale` (work outstanding) ≠ `partial` (something FAILED) —
  same amber family, never conflated. Report/document staleness is NOT runnable work.
- **Every add-keyword entry point must route through `keywordQuota.ts` + `KeywordQuotaDialog`.**
  Never raise a cap without consent; never write the keyword row before the caps that govern it.
- **A cross-feature research start opens the canonical intake; it never runs a headless pipeline.**
  Build the door with `researchInitHref`, preserve its safe `return_to` while the user reviews the
  AI-proposed topic, editable keywords, and quota/settings, then use `researchStartDestination`
  only after the explicit Start Research action. The originating feature may link the returned
  topic, but it must not generate a Document or treat that topic as completed research.
- **Clicking a navigation item must never spend money.** Document generation is explicit-only.
- **Never hand-render a research stream.** `useResearchStream` adopts via `adoptForeignStream`;
  content renders from `activeRequests` off the exposed `requestId`. `startStream`'s optional
  `abortController` must be the FETCH's own controller or `cancel()` will not close the body.
- **`usePipelineProgress.finalizeStages` must sweep on BOTH `pipeline_complete` and stream
  `onEnd`** — a full `/run` emits no per-stage "all-complete" event, so without the sweep spinners
  run forever. Started-with-items but 0/0 outcomes → `partial`, never a false green. Activated by
  phase/info with zero items and zero outcomes → `skipped` (hide it).
- **The pipeline graph animates ONLY when live** (`statusFor` gates on `isLive`). Never let a
  finished or reloaded graph pulse.
- **Graph = lifetime DB progress; "This run" strip = this browser session.** Different numbers by
  design — never make the strip show topic totals. Search stage label → **Sources**, Scrape stage
  → **Content**.
- **`intent_key` / `intent_brief` are NEVER written directly to Supabase from the client.** The
  one writer is `useResearchApi().setTopicIntent` → aidream `POST /research/topics/{id}/intent`.
- **`rs_keyword.is_stale` is DEAD** — nothing has ever written it. The real signal is
  `last_searched_at`. Never filter, badge, or branch on `is_stale`.
- **`rs_source.rank` is ambiguous and must not be used.** Per-keyword rank rides the
  `platform.associations` edge `position`; cross-keyword importance is `ranking.ts`.
- **Never join a junction table** — `rs_keyword_source` and `rs_source_tag` do not exist. Join
  `platform.associations` (canonical predicate in
  `migrations/research_overview_readiness_ledger.sql`); `research.rs_source_keywords` is a view.
- **Every client read is `.schema('research').from('rs_*')`** — the bare `public` names are gone
  and the dead-relations guard enforces it.
- **A NULL triage score means "not assessed", NEVER zero** — render `—` via
  `sourceScoreDisplay.tsx`, never `0`, an empty meter, or a red state.
- **`AuthorityTierBadge` is the ONE renderer for authority** — never hand-roll a score pill.
  Authority ≠ importance ≠ recency: three axes, never conflated.
- **All generated content renders via `MarkdownStream`** (never `whitespace-pre-wrap`, never
  wrapped in `prose`). The one exception is the *loaded* document, which uses `ReactMarkdown` to
  keep heading-slug `#anchor` TOC links.
- **Read `token_usage` ONLY through `@/lib/token-usage/normalize`** — it holds
  `{total, by_model}` and has never held flat `input_tokens` keys. Reading those made every cost
  render $0 on 100% of rows. Absent pricing stays **unknown** (`—`), never `$0`. Render every cost
  via `<CostValue>` / `useCostDisplay`; never `toFixed(2)` a dollar figure in a research component.
- **Editing scraped content backs up the original ONCE** — never overwrite an existing
  `rs_content.original_content`.
- **`sourcesDiscoveredFromItems` is the one "sources discovered" formula.** Keep it in one
  function so two screens never show two totals.
- **Adding a resource kind is ONE entry in `resources/catalog.ts`.** Nothing outside the catalog
  may hard-code a resource type. `lib/tokens/estimate.ts` is the only char→token function in the
  repo; `resources/resolve.ts` is the only place that fetches bodies or truncates. Only
  INVOLUNTARY loss may be reported as truncation.
- **Adding a domain output is DATA** — agent + mandate + bundle row + one `DOMAIN_OUTPUTS` entry
  (mandate key + bundle slug, **never** an agent id). If you are writing code to add an output,
  something upstream is wrong.
- **Never rename agent `variable_definitions` to chase display copy** — wire names are a contract.
- **Do not collapse `page.images` and `media.items`** — Media is the curated subset of raw
  extracted images, and both say so out loud.
- **Tags are manual** — the graph's Tags node must not imply auto-generation.

`pnpm type-check` is the only type gate; the build ignores type errors.

## Change log

- 2026-08-26 — Added the safe reviewed-intake return contract for cross-feature research starts;
  Content Plan now uses it instead of the deleted headless company-research hook.
