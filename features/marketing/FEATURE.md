# Marketing Sites

**Status:** active  
**Tier:** 1  
**Last updated:** 2026-07-20

## Purpose

Agency-scale website operations built around stable site and page identity. The implemented verticals manage sites, canonical URLs, immutable snapshots, crawl sessions, run URL outcomes, durable run events, prioritized analysis, finding lifecycle evidence, screenshots, links, sharing, batch operations, and cost attribution.

## Entry points

- `/marketing/sites` — accessible-site portfolio.
- `/marketing/connections` — user/org credential onboarding and site-provider binding guide.
- `/marketing/sites/new` — selected-organization site creation.
- `/marketing/sites/[siteId]` — shared site shell and overview.
- `.../pages`, `.../pages/[pageId]`, and `.../snapshots/**` — canonical page registry, user intent, and observed history.
- `.../crawls`, `.../crawls/new`, `.../crawls/[crawlId]`, `.../urls`, and `.../logs` — direct live commands, sessions, reconciliation, encountered URLs, and durable events.
- `.../analysis` — open, non-suppressed priority queue from `web.v_priority_queue`.
- `.../findings` and `.../findings/[findingId]` — durable finding register, lifecycle detail, and immutable result evidence.
- `.../links` and `.../screenshots` — accepted link evidence and stored visual captures.
- `.../integrations` — verified Google Search Console/GA4 property bindings, app-managed PageSpeed, and custom provider bindings.
- `.../crawls/[crawlId]/snapshots` and `.../links` — run-scoped capture and link evidence.
- `.../access` and `.../settings` — site-root sharing and crawl/site configuration.
- `.../cost` — site cost by page, run, and execution item.
- `/marketing/batches` and `/marketing/batches/[batchId]` — cross-site batch monitor and execution units.
- `/marketing/cost` — workspace cost by site or client organization.
- `/marketing/admin` — feature resource map.
- `features/marketing/data/hooks.ts` — React Query hooks.
- `features/marketing/data/service.ts` — direct browser Supabase queries and `web.create_site` RPC.
- `features/marketing/data/analysis-service.ts` and `analysis-hooks.ts` — isolated direct-Supabase priority, finding, and result reads.
- `features/marketing/data/inspection-*` and `operations-*` — isolated direct-Supabase media, link, batch, and cost reads.
- `features/marketing/crawler/direct-client.ts` — direct authenticated scraper commands and transient NDJSON only.
- Persisted Marketing reads never use Next.js, Python history routes, or AI Dream intermediaries. Google authorization reuses the canonical `GoogleAPIProvider` and Google Identity Services popup; its one-time code exchange and disconnect routes are command-only control-plane boundaries because client secrets and refresh tokens cannot run in the browser.

## Data model

- `web.site` — managed website and sole access root.
- `web.page` — canonical URL plus user-owned intent; never captured content.
- `web.crawl_session` — one frozen crawl event.
- `web.snapshot` — immutable page content observation from one session.
- `web.crawl_url` — one session's encountered URL and outcome; never the canonical registry.
- `web.crawl_event` — ordered durable session history; not the transient live stream.
- `web.finding` — current problem lifecycle state, including suppression and first/latest result pointers.
- `web.analysis_result` — immutable normalized evidence for one item/subject computation.
- `web.link_edge` and `web.screenshot` — immutable link and visual evidence.
- `web.batch_job` and `web.batch_item` — batch execution state and cost-link anchors.
- `web.v_priority_queue` — open, non-suppressed findings ranked by weight × severity × confidence.
- `web.v_page_score` and `web.v_site_score` — current score projections.

Generated `Database["web"]` types are authoritative. `utils/supabase/webDb.ts` scopes the normal browser client to the custom schema.

## Key flows

1. Add site: `NewSiteForm` selects an organization and calls `web.create_site`; canonical triggers stamp base fields, then the UI navigates immediately to the site overview. The overview auto-starts the direct scraper homepage bootstrap (`?capture=homepage`), which creates the canonical `/` page, persists `web.snapshot.head_tags`, and sets `web.site.homepage_screenshot_id`. Observed meta title and description render from that snapshot once bootstrap completes; a capture failure never rolls back the valid site and can be retried from the thumbnail control.
2. Browse data: the URL owns table search/filter/sort/page state; `MatrxDataTable` emits changes; a feature hook issues a bounded `select(..., { count: "exact" }).range(...)` directly to Supabase with deterministic `id` ordering.
3. Manage a page: `PageWorkspace` reads identity from `web.page`, current content from `latest_snapshot_id`, and saves only `target_keyword` plus desired metadata to the page.
4. Inspect a crawl: summary reads `crawl_session`; URL and log children independently page through `crawl_url` and `crawl_event` by `session_id`.
5. Run a crawl: `/crawls/new` sends the command directly to the scraper with the caller's Supabase JWT, renders the transient NDJSON feed, supports cancellation, and links to the durable session. Stored events and reloads come from Supabase, never Python replay.
6. Triage analysis: `/analysis` pages through `v_priority_queue` and links each projection into a URL-filtered finding register; `/findings/[findingId]` reads lifecycle state, catalog context, first/latest evidence pointers, and paged result history directly from Supabase.
7. Inspect evidence: site/crawl link workspaces and the screenshot gallery read records directly from Supabase; snapshot bodies, markdown, and screenshots are identified only by canonical `files.files` UUIDs and rendered through `@/features/files` (`fileIdToMediaRef` / `InlineMediaRef`).
8. Share and configure: `/access` calls canonical IAM grant/list/revoke RPCs for the `web_site` root; `/settings` uses version-checked direct Supabase updates.
9. Monitor execution: batch and cost workspaces page through `web.batch_*` and the canonical cost views; runtime cost is attributed only through `link_kind='web_batch_item'` and the batch item id.
10. Configure integrations: `/marketing/connections` and each site's `/integrations` route use the existing Google Identity Services provider in popup authorization-code mode to connect a reusable personal or organization account without a redirect callback. The command endpoint exchanges the one-time code, encrypts the refresh token, and discovers Search Console and GA4 resources. The browser reads connection metadata and resource choices directly from Supabase. A site's workspace binds only the selected connection/resource references; PageSpeed uses the application's API key and does not require user OAuth.

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
- Snapshot body and screenshot fields are direct UUID FKs to `files.files`. The browser never sees a bucket/path/native URI and never constructs a storage URL; private bytes and signed URLs resolve through the canonical Files pipeline in AI Dream.
- `body_ref`, `markdown_ref`, `storage_bucket`, and `storage_path` are forbidden crawler contracts. There is no compatibility reader because all pre-cutover crawl data was disposable and wiped.
- Crawl artifact access fails closed: immutable metadata plus the direct snapshot/screenshot file FK classify the file, and the database requires an exact tenant match plus current site-viewer access. No `platform.associations` row exists for this relationship. Missing, forged, cross-tenant, or soft-deleted references never fall back to file ownership.
- No legacy crawler data is migrated or read.
- Google OAuth credentials are encrypted at rest in `users.integration_connections`; authenticated browser roles cannot select the credential columns. Site JSON contains only connection/resource references, never tokens or client secrets.
- OAuth API routes exchange/revoke credentials only. Connection lists, discovered resources, site bindings, and all crawler/analysis history are read directly from Supabase under RLS.

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

The site/page/crawl foundation, direct live-crawl controls, analysis/finding workspaces, link/screenshot inspection, reusable personal/org Google OAuth, discovered GSC/GA4 property binding, app-managed PageSpeed, site access/settings, batch monitor, and site/workspace cost rollups are live in code. Remaining verticals include actual GSC/GA4/PageSpeed synchronization and metric history, connection health/sync history, cross-site analysis, catalog/configuration UI, crawl scheduling UI/worker, analysis and AI-batch execution workers, actionable reconciliation/finding mutations, current-link projections, and CMS task/change/publish workflows.

## Change log

- 2026-07-20 — Codex: cut Marketing artifacts over to canonical Files UUIDs, added complete per-snapshot body/markdown/screenshot rendering, and removed all parallel file-backend URL construction and legacy crawler reference fields.
- 2026-07-18 — Codex: added the first production vertical with direct Supabase portfolio, site creation/shell, pages/snapshots, crawl sessions, URL ledger, durable event log, and admin map.
- 2026-07-18 — Codex: connected site bootstrap and crawl start/cancel/live progress directly to the standalone scraper; no persisted-data proxy or replay endpoint was added.
- 2026-07-18 — Codex: added site-scoped priority analysis, the finding lifecycle register, and immutable result evidence detail with URL-controlled direct-Supabase tables.
- 2026-07-18 — Codex: added link and screenshot inspection, site access and settings, batch operations, and site/workspace cost rollups.
- 2026-07-18 — Codex: added secret-free site integration references for GSC, GA4, PageSpeed, and extensible providers; verified connection authority remains intentionally separate.
- 2026-07-19 — Codex: wired the main Marketing Hub to the production workspace and added user/org vault onboarding plus site binding entry points without using the legacy browser-token Google page.
- 2026-07-19 — Codex: added a user-facing live crawl event presenter that keeps exception, ORM query/argument, stack, and ANSI details out of the primary feed.
- 2026-07-19 — Codex: added production Google OAuth with encrypted reusable personal/org connections, automatic Search Console and GA4 discovery, direct-Supabase connection/resource reads, site property selectors, and app-managed PageSpeed configuration.
- 2026-07-19 — Codex: simplified the site overview header to a compact thumbnail plus site identity row, removed the browser-chrome preview workspace and duplicate Site identity card, and kept homepage capture available via a hover refresh control on the thumbnail.
- 2026-07-19 — Codex: replaced the unused parallel Google redirect flow with the codebase's canonical Google Identity Services provider, using its popup code model for personal/org connections and durable offline synchronization without a new callback URI.
- 2026-07-19 — Codex: corrected the Google code-exchange deployment lookup to use the server-side client-ID alias and replaced ambiguous raw membership reads with the canonical organization-admin authority.
- 2026-07-19 — Codex: made Search Console the focused default connection flow, automatically persisted an exact domain match, added explicit provider-level completion actions, made PageSpeed one-click enablement, and stopped optional Analytics discovery failures or raw Google API errors from poisoning the user-visible Google connection.
- 2026-07-19 — Codex: site overview hero now top-aligns site identity, reads observed homepage meta title/description from the bootstrap snapshot's `head_tags`, and refreshes that metadata after homepage capture retries.
- 2026-07-19 — Codex: crawl new/summary workspaces now fill the available viewport height; live feed scrolls in-panel, and session scope/stats/metadata render as condensed field grids instead of raw JSON.
