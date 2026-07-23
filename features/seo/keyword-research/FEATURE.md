# SEO Keyword Research — user-facing workbench over the seo keyword plane

Status: **live (2026-07-22).** Route: `app/(core)/seo/keyword-research/page.tsx` →
`KeywordResearchWorkbench`. Linked from the public `/seo` suite ("Keyword Research &
Relationships" card). Cross-repo contract of record:
`/Users/armanisadeghi/code/common-docs/to-be-organized-NEW/seo-module/seo-keyword-agent-guide.md`.

## Data flow — the two-lane rule, exactly

- **Reads go DIRECT to Supabase** (`data/queries.ts` — `supabase.schema("seo")` after
  `requireAuthenticatedSupabaseSession`; pattern copied from
  `features/marketing/data/backlinks-queries.ts`). Universal tables are world-readable:
  `seo.keyword` (+ embedded `keyword_market`) and `seo.keyword_edge` (+ partner-phrase
  lookup). Never route these reads through Python.
- **Compute goes to aidream via `callApi`** (`useKeywordResearch.ts`):
  - `POST /seo/keywords/research` — the whole pipeline server-side: LSI agent →
    content_ir artifact → `fn_ingest_keyword_research` → batched volume fetch. One paid
    provider request + one agent call per run (~20–60s, blocking JSON by the SEO
    vertical's convention).
  - `POST /seo/keywords/volume-refresh` — market data for stale/missing rows only
    (30-day policy; `force_refresh` bypasses).
  Backend contract: `aidream/services/seo/FEATURE.md` § Keyword pipeline. These
  endpoints exist on local/dev aidream; prod gets them on its next deploy.

## Files

- `types.ts` — row types from `Database["seo"]` + API response types from
  `types/python-generated/api-types.ts` (never hand-widened).
- `data/queries.ts` — `listKeywordsWithMarket` (ilike on `normalized_phrase`, market
  embedded, volume sort client-side), `listKeywordEdges` (both directions + partner
  phrases).
- `useKeywordResearch.ts` — page state + the two `callApi` actions; debounced search,
  abort-safe reloads.
- `components/KeywordResearchWorkbench.tsx` — research launcher, run-summary strip,
  explorer table (volume / trend sparkline / competition / CPC / trajectory / intent),
  expandable detail (monthly bars + relationship chips; rejected edges render
  struck-through — rejection is permanent memory, never deletion).

## Invariants

- `(core)` shell rules: `<PageHeader>` center-only title; body `h-full overflow-hidden`
  with `paddingTop: var(--shell-header-h)`; no in-body title bar.
- `intent_class` etc. render from the 13 real columns — never parsed out of JSONB.
  Null classification shows "unclassified" (the classifier pipeline is a later phase).
- Edge REJECTION (when built here) must call `seo.fn_reject_keyword_edge` via the
  backend — never delete a `keyword_edge` row.
- No barrel files; import from source.

## Change Log

- 2026-07-22 — Initial build: research launcher + live explorer + relationship detail,
  wired to the new aidream keyword pipeline endpoints. Registered in agent.review_queue.
