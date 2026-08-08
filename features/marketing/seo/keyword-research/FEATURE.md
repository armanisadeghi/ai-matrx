# SEO Keyword Research — user-facing workbench over the seo keyword plane

Status: **live (2026-07-22).** Route: `app/(core)/marketing/keyword-research/page.tsx` →
`KeywordResearchWorkbench`. Linked from the public `/seo` suite ("Keyword Research &
Relationships" card). Cross-repo contract of record:
`/Users/armanisadeghi/code/common-docs/systems/seo-keywords/seo-keyword-agent-guide.md`.

The site-scoped surface is
`/marketing/brands/[brandId]/sites/[siteId]/keywords` → `SiteKeywordsView`
(`components/SiteKeywordsView.tsx`), two URL-selected views on one route:
- **Performance** (default) — `SiteKeywordPerformanceWorkspace`: the latest
  persisted 28-day GSC query observations with canonical keyword-market and
  site-workflow values through `seo.v_site_keyword_performance`. A read
  surface: GSC collection and market enrichment remain explicit compute
  operations.
- **Classification** (`?view=classification`) — the GSC traffic-class
  truth-editing surface, owned by the search-console feature
  (`features/marketing/search-console/components/classification/KeywordClassificationWorkspace.tsx`;
  rules in [`features/marketing/search-console/FEATURE.md`](../../search-console/FEATURE.md)
  § Classification UI). The Insights tab's Traffic-quality summary deep-links
  here (`?view=classification&f_traffic_class=select:<class>`).

## Data flow — the two-lane rule, exactly

- **Reads go DIRECT to Supabase** (`data/queries.ts` — `supabase.schema("seo")` after
  `requireAuthenticatedSupabaseSession`; pattern copied from
  `features/marketing/data/backlinks-queries.ts`). Universal tables are world-readable:
  `seo.keyword` (+ embedded `keyword_market`) and `seo.keyword_edge` (+ partner-phrase
  lookup). Never route these reads through Python.
  Saved relationship artifacts read directly from the org-internal
  `content_ir.kind_instance` written by the pipeline; classification cards are
  reconstructed from the canonical `seo.keyword` columns. This is the durable,
  cross-org-member panel state — never substitute creator-private run history.
- **Compute goes to aidream via `callApi`** (`useKeywordResearch.ts`):
  - `POST /seo/keywords/research` — the whole pipeline server-side: LSI agent →
    content_ir artifact → `fn_ingest_keyword_research` → batched volume fetch →
    classification. One paid provider request plus the agent calls, streamed as canonical
    NDJSON from first AI token through the final durable receipt.
  - `POST /seo/keywords/volume-refresh` — market data for stale/missing rows only
    (30-day policy; `force_refresh` bypasses), also streamed through exact provider
    response, normalization, persistence, and completion events.
  - Both commands use `callApi({stream: true})`; long JSON timeouts are forbidden.
    The workbench renders live pipeline stages. **Live agent output renders through
    the ONE canonical pipeline** — `useKeywordResearch` ADOPTS the stream
    (`adoptForeignStream` → `callApi`'s `consumeStream`), so the run lands in
    `activeRequests` and both surfaces render `<MarkdownStream requestId />`.
    The hook keeps `onEvent` for its own `seo.*` progress only. **The server's
    chunk relay may stop before the payload's closing bytes** — the phase event
    is the completion truth, never JSON-close alone; the stream accumulator owns
    finalization, so no surface decides it. A client disconnect stops only delivery—the backend's
    detached stream task continues and persists. Backend contract:
    `aidream/services/seo/FEATURE.md` § Keyword pipeline.
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

## Autosave + library management (Arman ruling 2026-07-29)

**Every keyword surfaced by research is ALREADY auto-saved — server-side.**
`POST /seo/keywords/research` calls `seo.fn_ingest_keyword_research`, which
upserts the primary AND every phrase in every `keyword_lists` label into
`seo.keyword` via `seo.fn_upsert_keyword`, plus `keyword_edge` rows
(`origin='ai_research'`). No client-side save exists or is needed; selection
on page-bound surfaces only controls what ATTACHES to the page.

Management (the ruling's other half — autosave must not become clutter):

- **Removal is soft-archive, ONLY via `seo.fn_archive_keywords` /
  `seo.fn_restore_keywords`** (SECURITY DEFINER, authenticated-granted;
  the table itself is SELECT-only for authenticated). Wrappers:
  `data/queries.ts#archiveKeywords/restoreKeywords`. Never a direct
  update/delete, never a second write path.
- **Archive is durable memory** (like edge rejection): `uq_keyword_identity`
  is a FULL unique index, so `fn_upsert_keyword` returns the archived
  identity row WITHOUT reviving it — research re-runs do not resurrect an
  archived keyword. **Explicit hand-entry does restore it**:
  `page-keywords.ts#ensureKeywordId` calls `fn_restore_keywords` when the
  upsert returns an existing row (typing the phrase IS the intent to use it).
- **Provenance is derived, not stored**: research-discovered = has a live
  `keyword_edge` with `origin='ai_research'`
  (`data/queries.ts#fetchResearchDiscoveredKeywordIds`, one batched read per
  list render). No schema change.
- Per the soft-delete class rule, authenticated reads filter
  `deleted_at IS NULL` in the QUERY; only the anon `pub_read` policy gates it.
- Surfaces: workbench explorer (bulk checkbox select + Archive selected +
  per-row kebab: Keyword Intelligence / Archive, + Source column), site
  keywords table (row kebab: Keyword Intelligence / Archive from library —
  query evidence is untouched), Keyword Intelligence panel header (archive
  button, so every chip/row launcher reaches archive), page keyword board
  (detach-from-page chips, pre-existing). All archives confirm first
  (`confirm()` dialog) and toast an Undo that calls restore.

**The canonical per-keyword UI primitive lives in `features/marketing/seo/keyword/`**
(`KeywordInput`, the Keyword Intelligence window, `buildKeywordBrief`) — it consumes
this feature's reads, stream hook, and `KeywordMetrics` atoms. Read its FEATURE.md
before adding any keyword field or per-keyword display anywhere.

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
  abort-safe reloads; adopts the pipeline stream and exposes `run.requestId` +
  `run.hasStreamedContent` (the whole live-rendering contract).
- `components/SavedResearchFeed.tsx` — durable in-place rendering of the saved
  hierarchy plus persisted classification rows through the same selectable
  blocks used by the live feed.
- `useSavedKeywordResearch.ts` — THE one query for the latest durable
  research artifact per (org, phrase): wraps `getLatestSavedKeywordResearch`,
  resolves the org exactly like `callApi` (explicit override else
  `selectEffectiveOrganizationId`) so the read scope always equals the run's
  write scope, exports `savedKeywordResearchQueryKey` for invalidation, and
  optionally debounces a live-input phrase. Consumed by the launcher AND the
  Keyword Intelligence Research tab — never re-declare the query inline.
- `components/KeywordResearchLauncher.tsx` — **THE canonical research runner**
  (input → live feed → summary) over a caller-owned `useKeywordResearch()`
  instance, PLUS durable memory: it renders the saved artifact
  (`SavedResearchFeed`) whenever the ephemeral live stream can't — idle
  remounts/reopened windows show the phrase's last saved research, and a
  rejoined/recovered run renders `run.result.artifact` instead of a blank
  "waiting" (the server's rejoin replays stages, never AI chunks). Consumed
  by the workbench AND
  `features/window-panels/windows/seo/KeywordResearchWindow.tsx` (open from
  anywhere: `useOpenKeywordResearchWindow({ primaryKeyword, autoRun })` in
  `features/overlays/openers/keywordResearchWindow.tsx`; `?panels=keyword_research`).
  `autoRun` only on an explicit user gesture — a run is a paid pipeline.
- `components/KeywordMetrics.tsx` — the shared presentation primitives. Now also
  `KeywordIntentChip` (THE one way `intent_class` renders anywhere) and
  `KeywordConfidenceMeter`. **No surface hand-rolls an intent string, competition
  badge, or volume/CPC format — consume these.**
- `components/KeywordResearchWorkbench.tsx` — research launcher, run-summary strip,
  explorer table (volume / trend sparkline / competition / CPC / trajectory / intent),
  expandable detail (monthly bars + relationship chips; rejected edges render
  struck-through — rejection is permanent memory, never deletion).
- `components/SiteKeywordPerformanceWorkspace.tsx` — canonical MatrxDataTable view of
  ranked queries, GSC performance, strongest matched page, market metrics, and
  site-specific workflow state.

## The stream renders canonically (was: the LiveResearchFeed disease)

**Fixed 2026-07-29.** This feature used to carry the platform's worst defect: a
bespoke stream renderer (`components/LiveResearchFeed.tsx`) that bucketed raw
chunk text into per-phase buffers, opened its own content-ir parse sessions,
split its own payload segments, hand-routed envelopes into components, and
decided "done" on its own signal. Every one of those is banned.

It existed for a real reason, and that reason is what got fixed: the research
run is orchestrated SERVER-side (`POST /seo/keywords/research` — a durable,
rejoinable job that also persists the artifact, ingests relationships, and
fetches provider volume), so its agent stream had no `requestId`, and every
canonical read (`selectKindEnvelope`, `<MarkdownStream>`) is keyed on one.

Now `useKeywordResearch` **adopts** the stream: `adoptForeignStream` hands the
NDJSON body to the execution system's `processStream` via `callApi`'s
`consumeStream`, so the run becomes an ordinary `activeRequests` row and both
surfaces render `<MarkdownStream requestId={run.requestId} />`. The hook still
sees every `seo.*` progress event through `onEvent`. Server side, aidream's
`stream_agent_as_blocks` makes the run emit real `render_block` events with
`metadata.__ir` envelopes rather than bare chunks.

`run.requestId` + `run.hasStreamedContent` replaced `researchOutput` /
`classificationOutput` / `researchDone` / `classificationDone` / `streamKey`.
A rejoined run has no chunk replay, so it falls back to `SavedResearchFeed`
over the durable artifact — unchanged.

**Keyword selection is not passed as props any more.** The blocks read
`keyword_selection` surface UI state and write the `keyword_selection` target
(see `features/surfaces/runtime/surface-writeback.ts` +
`surface-ui-state.ts`), so the live view and the saved view behave identically
and the same block renders read-only in chat.

## Invariants

- **No bespoke stream rendering.** No new parse session, chunk buffer, segment
  splitter, or hand-routed envelope anywhere in this feature. See above.
- `(core)` shell rules: `<PageHeader>` center-only title; body `h-full overflow-hidden`
  with `paddingTop: var(--shell-header-h)`; no in-body title bar.
- `intent_class` etc. render from the 13 real columns — never parsed out of JSONB.
  Null classification shows "unclassified".
- Edge REJECTION (when built here) must call `seo.fn_reject_keyword_edge` via the
  backend — never delete a `keyword_edge` row.
- No barrel files; import from source.

## Change Log

- 2026-08-08 — Site keywords route split into `SiteKeywordsView` (Performance |
  Classification toggle, URL state `?view=`). Classification is the
  search-console feature's `KeywordClassificationWorkspace` — traffic-class
  review + override queue over the new `seo.gsc_keyword_class_review` /
  `gsc_set_keyword_class` RPCs. Verified live on datadestruction.com.

- 2026-07-29 — The marketing-page surface now PUBLISHES the `page_keywords` UI-state key (`{ target: string | null, supporting: string[] }` — primary target keyword + attached supporting phrases, from `MarketingPageWriteTargets`), so keyword blocks rendered while that page is mounted can mark already-attached phrases via `useCurrentSurfaceUiState("page_keywords")`. The page-keyword board fetch is now the shared `fetchPageKeywordBoard` in `features/marketing/data/page-keywords.ts` (one queryFn per query key).

- 2026-07-29 — **The disease is cured: `LiveResearchFeed.tsx` deleted, live output renders canonically.** `useKeywordResearch` adopts the pipeline stream via the new `adoptForeignStream` primitive (`callApi`'s new `consumeStream` option hands the raw NDJSON body to the execution system's `processStream`), so the server-orchestrated run becomes an ordinary `activeRequests` row and `KeywordResearchLauncher` + `KeywordResearchTab` render `<MarkdownStream requestId />`. `researchOutput` / `classificationOutput` / `researchDone` / `classificationDone` / `streamKey` are gone, replaced by `requestId` + `hasStreamedContent`. Server half: aidream `stream_agent_as_blocks` makes `run_one_agent(stream_output=True)` emit `render_block` events with envelopes instead of bare chunks. Keyword SELECTION moved off props onto the surface seams — the blocks read `keyword_selection` UI state and write the `keyword_selection` target declared on `matrx-user/keyword-intelligence` (`applyPolicy: "ask"`), so live and saved views behave identically and the same block is read-only in chat. Enforced by the new `matrx/no-bespoke-stream-renderer` ESLint rule (error). **Not type-checked / browser-verified — the environment could not complete `pnpm install`; see `docs/handoffs/canonical-stream-and-surface-writeback.md`.**

- 2026-07-29 — **Library management shipped (autosave already existed
  server-side).** Verified `fn_ingest_keyword_research` auto-saves every
  discovered phrase; added `seo.fn_archive_keywords`/`fn_restore_keywords`
  (migration `mtx_seo_keyword_archive_rpcs.sql`, live + ledgered), archive
  wrappers + edge-origin provenance query in `data/queries.ts`, workbench
  bulk-select/Archive/Source column + row kebab, site-keywords row kebab
  with Archive-from-library, Keyword Intelligence panel archive button, and
  explicit-entry restore in `ensureKeywordId`. Archive is durable against
  research re-runs; every archive is confirmable + undoable.
- 2026-07-28 — **`LiveResearchFeed` condemned: bespoke stream rendering is banned
  platform-wide (Arman ruling).** Every doc that blessed this surface as "the
  canonical non-chat `useLiveJsonRegion` consumer" now names it as the one violation
  to delete; the rule lives in CLAUDE.md + `features/content-ir/FEATURE.md` § No
  bespoke stream renderers, and `useLiveJsonRegion` is marked internal to content-ir.
  Shipped with the fix for the bug this surface exposed: a root degrade could blank a
  fully-rendered block mid-stream (the "research disappeared when classification
  started" report) — `IrTree` now never regresses published data. Deletion of this
  component is D116.
- 2026-07-28 — **Durable memory on EVERY research surface (launcher + window +
  workbench).** Extracted `useSavedKeywordResearch` (shared query + key;
  effective-org fallback mirrors callApi) and taught the canonical
  `KeywordResearchLauncher` to fall back to the persisted artifact whenever
  live buffers are empty: idle remount/reopened window shows the phrase's
  saved research; a rejoined or snapshot-recovered run renders
  `run.result.artifact` instead of "Waiting for structured research output…".
  The Research tab now consumes the same hook (query previously declared
  inline — drift risk closed). Root cause of the "my research disappeared"
  reports: only the tab had a durable fallback, and the server's rejoin never
  replays AI chunks, so every remounted launcher surface rendered nothing.
- 2026-07-28 — **Saved-state restore + page supporting-keyword selection.**
  Keyword Intelligence reads the latest org-internal research artifact before
  offering a rerun, renders hierarchy and persisted classification together,
  and page-bound panels add checkbox-selected phrases through the canonical
  supporting-keyword batch writer. Live parse regions retain their last valid
  data across phase transitions/completion.
- 2026-07-28 — **Credential preflight + truthful persistent failure UI.** The backend
  now resolves the same personal→organization DataForSEO credential hierarchy before
  creating a durable research run or spending either agent call. The hook consumes
  typed stream errors and `callApi.serverDetail` through the shared backend-failure
  parser instead of replacing the cause with “stream ended without a completed
  result.” The live feed shell remains mounted on running, completed, and failed runs,
  with a stable stage header and an explicit preflight-empty state.
- 2026-07-26 — **Canonicalization round 2: window panel + shared primitives everywhere.**
  Extracted `KeywordResearchLauncher` from the workbench (shared runner UI); new
  `KeywordResearchWindow` (overlayId `keywordResearchWindow`, tools-grid tile,
  `?panels=keyword_research`, opener `useOpenKeywordResearchWindow`) hosts it with a
  compact cluster explorer. `KeywordIntentChip` + `KeywordConfidenceMeter` added to
  `KeywordMetrics.tsx` and consumed by the chat classification block, the workbench
  intent column, the window, and content-plan's `KeywordPicker` (which now also shows
  volume + competition it always had in hand); `SiteKeywordPerformanceWorkspace`
  dropped its private competition badge. Also registered hydrators for the
  pre-existing `serp_analyzer` / `social_cards` urlSync drift.
- 2026-07-26 — **Live streams render as real components, key by key — raw JSON killed.**
  The workbench's `<pre>` of raw agent tokens is gone: chunk text is phase-bucketed in
  `useKeywordResearch` and rendered through `LiveResearchFeed` → content-ir
  `useLiveJsonRegion` (both since DELETED 2026-07-29 — the stream is now adopted
  into `activeRequests` and rendered by `<MarkdownStream>`) → the new `keyword_relationship_research` /
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
