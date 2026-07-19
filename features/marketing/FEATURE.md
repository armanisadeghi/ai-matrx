# Marketing Sites

**Status:** active  
**Tier:** 1  
**Last updated:** 2026-07-19

## Purpose

Agency-scale website operations built around stable site and page identity. The implemented verticals manage sites, canonical URLs, immutable snapshots, crawl sessions, run URL outcomes, durable run events, prioritized analysis, and finding lifecycle evidence.

## Entry points

- `/marketing/sites` — accessible-site portfolio.
- `/marketing/sites/new` — selected-organization site creation.
- `/marketing/sites/[siteId]` — shared site shell and overview.
- `.../pages`, `.../pages/[pageId]`, and `.../snapshots/**` — canonical page registry, user intent, and observed history.
- `.../crawls`, `.../crawls/new`, `.../crawls/[crawlId]`, `.../urls`, and `.../logs` — direct live commands, sessions, reconciliation, encountered URLs, and durable events.
- `.../analysis` — open, non-suppressed priority queue from `web.v_priority_queue`.
- `.../findings` and `.../findings/[findingId]` — durable finding register, lifecycle detail, and immutable result evidence.
- `/marketing/admin` — feature resource map.
- `features/marketing/data/hooks.ts` — React Query hooks.
- `features/marketing/data/service.ts` — direct browser Supabase queries and `web.create_site` RPC.
- `features/marketing/data/analysis-service.ts` and `analysis-hooks.ts` — isolated direct-Supabase priority, finding, and result reads.
- `features/marketing/crawler/direct-client.ts` — direct authenticated scraper commands and transient NDJSON only.
- There are no Marketing Next.js API routes, Python history routes, or AI Dream intermediaries.

## Data model

- `web.site` — managed website and sole access root.
- `web.page` — canonical URL plus user-owned intent; never captured content.
- `web.crawl_session` — one frozen crawl event.
- `web.snapshot` — immutable page content observation from one session.
- `web.crawl_url` — one session's encountered URL and outcome; never the canonical registry.
- `web.crawl_event` — ordered durable session history; not the transient live stream.
- `web.finding` — current problem lifecycle state, including suppression and first/latest result pointers.
- `web.analysis_result` — immutable normalized evidence for one item/subject computation.
- `web.v_priority_queue` — open, non-suppressed findings ranked by weight × severity × confidence.
- `web.v_page_score` and `web.v_site_score` — current score projections.

Generated `Database["web"]` types are authoritative. `utils/supabase/webDb.ts` scopes the normal browser client to the custom schema.

## Key flows

1. Add site: `NewSiteForm` selects an organization and calls `web.create_site`; canonical triggers stamp base fields; the browser then calls the standalone scraper bootstrap directly and renders its live events. A capture failure never rolls back the valid site and can be retried from its overview.
2. Browse data: the URL owns table search/filter/sort/page state; `MatrxDataTable` emits changes; a feature hook issues a bounded `select(..., { count: "exact" }).range(...)` directly to Supabase with deterministic `id` ordering.
3. Manage a page: `PageWorkspace` reads identity from `web.page`, current content from `latest_snapshot_id`, and saves only `target_keyword` plus desired metadata to the page.
4. Inspect a crawl: summary reads `crawl_session`; URL and log children independently page through `crawl_url` and `crawl_event` by `session_id`.
5. Run a crawl: `/crawls/new` sends the command directly to the scraper with the caller's Supabase JWT, renders the transient NDJSON feed, supports cancellation, and links to the durable session. Stored events and reloads come from Supabase, never Python replay.
6. Triage analysis: `/analysis` pages through `v_priority_queue` and links each projection into a URL-filtered finding register; `/findings/[findingId]` reads lifecycle state, catalog context, first/latest evidence pointers, and paged result history directly from Supabase.

## Invariants & gotchas

- Persisted data always flows browser ↔ Supabase under the caller's JWT and RLS. Never add a Python, AI Dream, or Next.js read proxy.
- Crawler commands/live NDJSON go browser ↔ scraper directly. Durable rows written by the crawler are subsequently read from Supabase.
- A canonical page is not a crawl URL. A page's current content is its latest accepted snapshot, not a page column.
- Every child query scopes both its resource id and `site_id`; cross-site ids must not resolve under the wrong shell.
- Deep tables always use controlled Supabase filtering, sorting, exact counts, and bounded ranges. The canonical table never imports Supabase.
- Analysis tables use `table.queryState` for debounced database queries and `table.state` for immediate controlled-table feedback.
- `v_priority_queue` deliberately has no finding ID. Priority rows open the findings register with canonical item/page filters; only `web.finding.id` opens finding detail.
- Finding detail evidence is scoped by `site_id + subject_type + subject_id + item_id`; a same-item result from another subject must never appear.
- `crawl_event.sequence` defaults ascending; every sort adds `id` as a deterministic tie-breaker.
- Snapshot body and screenshot fields are durable references. This feature does not call Supabase Storage or fetch media through the scraper.
- No legacy crawler data is migrated or read.

## Related features

- Depends on `components/official/matrx-data-table`, `features/shell`, `features/organizations`, and the browser Supabase client.
- The Marketing command-only transport lives in `features/marketing/crawler`; persisted Marketing reads never depend on it.
- CMS and later marketing workspaces build on the same `web.site` / `web.page` identities.
- Architecture: `docs/MARKETING_SITE_PLATFORM_PLAN.md` and `docs/MARKETING_SITE_ROUTE_ARCHITECTURE.md`.

## Doctrine compliance

- Reused: `MatrxDataTable`, `EntityModeHeader`, `RouteHeader`, official UI primitives, React Query, active-organization picker, generated database types, and `webDb`.
- Introduced: feature-local typed services/hooks and resource-specific dense workspaces. They compose platform primitives and do not fork the table, header, organization, file, or Supabase client systems.
- No Redux slice is introduced; durable state is Supabase-backed and table view state is URL-backed.

## Current work

The site/page/crawl foundation, direct live-crawl controls, site analysis priority queue, finding register, and finding evidence detail are live in code. Cross-site analysis, integrations, access, cost, schedule UI, and CMS change sets remain later verticals under the approved platform plan.

## Change log

- 2026-07-18 — Codex: added the first production vertical with direct Supabase portfolio, site creation/shell, pages/snapshots, crawl sessions, URL ledger, durable event log, and admin map.
- 2026-07-18 — Codex: connected site bootstrap and crawl start/cancel/live progress directly to the standalone scraper; no persisted-data proxy or replay endpoint was added.
- 2026-07-19 — Codex: added site-scoped priority analysis, the finding lifecycle register, and immutable result evidence detail with URL-controlled direct-Supabase tables.
