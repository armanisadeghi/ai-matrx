# SEO Keyword Research — user-facing workbench over the seo keyword plane

Status: **live (2026-07-22).** Route: `app/(core)/marketing/keyword-research/page.tsx` →
`KeywordResearchWorkbench`. Linked from the public `/seo` suite ("Keyword Research &
Relationships" card). Cross-repo contract of record:
`/Users/armanisadeghi/code/common-docs/systems/seo-keywords/seo-keyword-agent-guide.md`.

The site-scoped read surface is
`/marketing/brands/[brandId]/sites/[siteId]/keywords` →
`SiteKeywordPerformanceWorkspace`. It combines the latest persisted 28-day GSC
query observations with canonical keyword-market and site-workflow values through
`seo.v_site_keyword_performance`. This route is a read surface: GSC collection and
market enrichment remain explicit compute operations.

## Data flow — the two-lane rule, exactly

- **Reads go DIRECT to Supabase** (`data/queries.ts` — `supabase.schema("seo")` after
  `requireAuthenticatedSupabaseSession`; pattern copied from
  `features/marketing/data/backlinks-queries.ts`). Universal tables are world-readable:
  `seo.keyword` (+ embedded `keyword_market`) and `seo.keyword_edge` (+ partner-phrase
  lookup). Never route these reads through Python.
- **Compute goes to aidream via `callApi`** (`useKeywordResearch.ts`):
  - `POST /seo/keywords/research` — the whole pipeline server-side: LSI agent →
    content_ir artifact → `fn_ingest_keyword_research` → batched volume fetch →
    classification. One paid provider request plus the agent calls, streamed as canonical
    NDJSON from first AI token through the final durable receipt.
  - `POST /seo/keywords/volume-refresh` — market data for stale/missing rows only
    (30-day policy; `force_refresh` bypasses), also streamed through exact provider
    response, normalization, persistence, and completion events.
  - Both commands use `callApi({stream: true})`; long JSON timeouts are forbidden.
    The workbench renders live pipeline stages, and the agent token stream renders as
    REAL kind components, never raw JSON: `useKeywordResearch` buckets chunk text by
    phase (`researchOutput` until `seo.research_agent_completed`, then
    `classificationOutput`), and `components/LiveResearchFeed.tsx` feeds each buffer
    into `useLiveJsonRegion` (content-ir) → the `keyword_relationship_research` /
    `keyword_classification_batch_v1` streaming bridges →
    `KeywordResearchBlock` / `KeywordClassificationBatchBlock`
    (`components/mardown-display/blocks/keyword-research/`, shared with chat).
    **The server's chunk relay may stop before the payload's closing bytes** — the
    phase event is the completion truth; `LiveResearchFeed` finalizes (kills pulses)
    on phase done, never on JSON-close alone. A client disconnect stops only
    delivery—the backend's detached stream task continues and persists. Backend
    contract: `aidream/services/seo/FEATURE.md` § Keyword pipeline.
  - **Durable run identity + reconnect (2026-07-23, WS-1).** Every research/volume
    command persists a `seo.collection_run` row server-side BEFORE the first AI call and
    streams it first as `seo.command_run {run_id}`. The hook stores
    `{runId, primaryKeyword}` in `sessionStorage` (`seo.keywordResearch.activeRun`)
    while a run is live and clears it on terminal state. On mount, a stored record
    auto-rejoins via `POST /seo/collections/{runId}/rejoin` — replaying buffered stages
    and following live progress when the server still executes the run, or rendering the
    durable `seo.run_snapshot` (status + persisted result) after completion/restart.
    `seo.run_in_progress` means another process holds the lease — the stored run id is
    kept so a later rejoin still works. Re-running the same command the same day reuses
    the completed run (`seo.research_completed {reused_completed_run: true}`) — zero
    duplicate paid calls.

## Files

- `types.ts` — row types from `Database["seo"]` + API response types aliased from
  the generated bundles (never hand-widened). `KeywordResearchResponse` /
  `KeywordVolumeRefreshResponse` come from `stream-events.ts`, which is where the
  streamed `data`-event payloads live; the SAME models are also real OpenAPI
  schemas in `api-types.ts` (they ride `SeoRunStatusResponse.result` on
  `GET /seo/collections[/{run_id}]`), so the durable read and the live stream
  describe one shape. Both bundles regenerate from the Pydantic models — an
  alias that stops resolving means the server contract moved, never that the
  alias should be hand-declared.
  `KeywordResearchResult.artifact` is the typed `KeywordResearchArtifact`
  (`primary_keyword` + `keyword_lists[{label, keywords}]`, mirroring the
  registered `keyword_relationship_research` content_ir kind) — do NOT re-cast it
  to a local inline shape as this file once did.
- `data/queries.ts` — `listKeywordsWithMarket` (ilike on `normalized_phrase`, market
  embedded, volume sort client-side), `listKeywordEdges` (both directions + partner
  phrases).
- `data/site-performance.ts` + `useSiteKeywordPerformance.ts` — direct, authenticated
  Supabase reads of `seo.v_site_keyword_performance` with server-side search,
  filtering, sorting, and pagination for one site.
- `useKeywordResearch.ts` — page state + the two `callApi` actions; debounced search,
  abort-safe reloads; phase-bucketed stream buffers + `streamKey` for the live feed.
- `components/LiveResearchFeed.tsx` — live kind-component rendering of the agent
  streams (see the two-lane rule above); the canonical non-chat consumer of
  `useLiveJsonRegion`.
- `components/KeywordResearchWorkbench.tsx` — research launcher, run-summary strip,
  explorer table (volume / trend sparkline / competition / CPC / trajectory / intent),
  expandable detail (monthly bars + relationship chips; rejected edges render
  struck-through — rejection is permanent memory, never deletion).
- `components/SiteKeywordPerformanceWorkspace.tsx` — canonical MatrxDataTable view of
  ranked queries, GSC performance, strongest matched page, market metrics, and
  site-specific workflow state.

## Invariants

- `(core)` shell rules: `<PageHeader>` center-only title; body `h-full overflow-hidden`
  with `paddingTop: var(--shell-header-h)`; no in-body title bar.
- `intent_class` etc. render from the 13 real columns — never parsed out of JSONB.
  Null classification shows "unclassified".
- Edge REJECTION (when built here) must call `seo.fn_reject_keyword_edge` via the
  backend — never delete a `keyword_edge` row.
- No barrel files; import from source.

## Change Log

- 2026-07-26 — **Live streams render as real components, key by key — raw JSON killed.**
  The workbench's `<pre>` of raw agent tokens is gone: chunk text is phase-bucketed in
  `useKeywordResearch` and rendered through `LiveResearchFeed` → content-ir
  `useLiveJsonRegion` → the new `keyword_relationship_research` /
  `keyword_classification_batch_v1` system kinds' streaming bridges → the shared
  `KeywordResearchBlock` / `KeywordClassificationBatchBlock` components. Keywords and
  classification cards pop in individually while streaming; phase-done finalizes
  (the chunk relay can truncate before the JSON closes). Feed persists after
  completion. Kinds registered in `features/content-ir/kinds/keyword-research.ts`.
- 2026-07-25 — Extracted the private sparkline / competition badge / volume+CPC
  formatters out of `KeywordResearchWorkbench` into `components/KeywordMetrics.tsx`
  (generalized from `KeywordMarketRow` to primitives) so the workbench and the
  `seo` tool renderer share ONE implementation and can never drift. Added the
  `seo` tool's `keyword_data` payload shapes + `parseSeoKeywordData` /
  `normalizeMonthlySearches` to `types.ts`.

- 2026-07-23 — WS-1: consume the durable run identity (`seo.command_run`), persist the
  active run id in sessionStorage, and auto-rejoin by run id on mount
  (`/seo/collections/{runId}/rejoin` — live replay or durable snapshot).
- 2026-07-23 — Converted keyword research and volume refresh from long blocking JSON to
  canonical NDJSON, rendering live stages and consuming the AI/provider stream through
  completion; removed the 100/110-second timeout workaround. This supersedes the temporary
  timeout change below.
- 2026-07-23 — Fixed research/volume-refresh timing out at 15s: added per-call
  `connectTimeoutMs`/`totalTimeoutMs` overrides to `callApi` and pass 100s/110s here.
- 2026-07-22 — Added the site-scoped organic keyword performance workspace backed by
  the live `seo.v_site_keyword_performance` read model.
- 2026-07-22 — Initial build: research launcher + live explorer + relationship detail,
  wired to the new aidream keyword pipeline endpoints. Registered in agent.review_queue.
