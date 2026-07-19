# Marketing Site Platform — Approved Implementation Plan

**Status:** Approved for implementation  
**Frontend:** `matrx-frontend`  
**Database:** Supabase project `txzxabzwovsujtloxrus`, schema `web`  
**Decision authority:** [`MARKETING_SITE_DECISION_REGISTER.md`](./MARKETING_SITE_DECISION_REGISTER.md)

## 1. Product model

The system has four deliberately separate authorities:

1. `web.site` is the managed real-world website and the only access root.
2. `web.page` is the site's canonical URL plus user-owned metadata. It contains
   no captured body content.
3. `web.crawl_session` is one frozen crawl event and its scope/status/stats.
4. `web.snapshot` is immutable content captured for one page in one crawl.

The latest accepted snapshot is the page's current observed content. A crawl
can discover canonical pages, but a crawl's URL set is never the canonical page
list. Analysis results are immutable events; findings are the durable problem
state used by work queues and dashboards.

## 2. Non-negotiable service boundary

### Durable reads

All list, detail, dashboard, history, integration, analysis, finding, link,
batch, and cost data is fetched directly from Supabase by the browser using the
authenticated Supabase client. RLS derives access from `web.site`.

There are no Python or AI Dream read routes for this product. Next.js may render
the route shell, but it is not a product-data intermediary. Initial server-side
Supabase hydration is permitted only if a measured UX need appears; the default
is client-side Supabase fetching.

### Commands and live progress

The browser sends crawl commands directly to the scraper/crawler service with
the user's Supabase access token. It does not proxy through AI Dream or a
Next.js API route. The scraper returns the canonical authenticated NDJSON live
stream for progress and per-URL events.

The live stream is transient presentation state. The scraper/worker writes
durable output to the canonical `web` tables. Once persisted, the UI reads it
from Supabase like every other product record. Reloads and historical recovery
read durable rows from Supabase; the scraper exposes no product-data history or
stream-replay API.

### Table pagination

"Controlled" table mode means the shared Matrx table emits range, filter, and
sort state to a feature query hook. That hook calls
`supabase.schema("web").from(...).select(..., { count: "exact" }).range(...)`
directly. It never calls an application server.

## 3. Routes

The permanent root is `/marketing`. Site-owned routes live beneath the site
shell at `/marketing/sites/[siteId]`; cross-site agency workspaces remain at
the Marketing root.

Implemented routes include:

- `/marketing/sites` and `/marketing/sites/new`
- `/marketing/sites/[siteId]`
- site children: `pages`, `crawls`, `analysis`, `findings`, `links`,
  `screenshots`, `integrations`, `cost`, `access`, and `settings`
- page children: detail and immutable `snapshots`
- crawl start at `crawls/new`, crawl detail, durable `urls`, `logs`,
  `snapshots`, and `links`
- workspace operations: `batches`, batch detail, and `cost`

The remaining approved route contract includes:

- verified OAuth credential authority, connection health, and metric sync
- crawl child: `findings`
- cross-site: `analysis`, `findings`, and `connections`
- shared catalog: `analysis/items` and `analysis/providers`

The complete canonical tree is documented in
[`MARKETING_SITE_ROUTE_ARCHITECTURE.md`](./MARKETING_SITE_ROUTE_ARCHITECTURE.md).

## 4. Database foundation

The seventeen certified tables and nine views in `web` remain authoritative.
The crawl URL outcome ledger, crawl event history, page source evidence, and
crawl schedule authorities are live as `web.crawl_url`, `web.crawl_event`,
`web.page_evidence`, and `web.crawl_schedule`.

Future tables are added only for approved missing authorities and must use
`web.conform(...)` plus `iam.verify_canonical(...)`:

- integration bindings, sync history, and typed metrics;
- CMS bindings, change sets/items, and task bindings.

Every site component copies and validates the owning site's
`organization_id`. Cross-pointers must be protected in Postgres. Only complete,
coverage-qualified sessions can create negative page evidence. Historical
snapshots, results, link edges, and submitted batch inputs are immutable.

The `web` schema must be present in the Supabase Data API exposed-schema list.
`authenticated` receives only the required schema/table/view/routine grants;
RLS remains enabled and is the row-access authority. Client code never contains
a service-role or secret key.

## 5. Direct Supabase data layer

`features/marketing/data/` owns typed query functions and hooks. Each resource
has one direct Supabase access path with:

- explicit selected columns;
- `deleted_at IS NULL` where applicable;
- deterministic ordering with `id` as a tie-breaker;
- bounded ranges or keyset cursors for deep tables;
- structured error results and retry states;
- URL-addressable filters, sorting, and page/cursor state;
- abort/stale-request protection;
- optional Supabase Realtime invalidation when persisted rows change.

The generated `Database` types include schema `web`. Feature-owned projection
types may narrow generated rows, but must not redefine the canonical schema.

## 6. Direct scraper client

`features/marketing/crawler/` owns the only Marketing crawler command client. It uses a
dedicated public scraper base URL, never the AI Dream base URL, and attaches the
current Supabase JWT. Its API boundary includes:

- homepage bootstrap and start-crawl commands scoped by site id;
- explicit cancellation while the original live stream is active;
- canonical NDJSON parsing, heartbeats, terminal `error` and `end` handling;
- typed live events for discovery, queue/fetch/render/capture/persist progress;
- explicit degraded state; durable event gaps and reloads come from Supabase;
- no historical or replay GET/POST methods.

The live UI may merge transient stream events with Supabase-persisted rows, but
persisted rows win whenever they overlap.

## 7. UX contract

The module is desktop-first, dense, and uses the full application workspace.
Every large dataset uses the official Matrx table. Headers stay sticky; filters,
sorting, selection, alternating row treatment, column controls, loading, empty,
and error states come from the canonical component.

Routes own addressable work. Window panels/drawers are used for supporting
inspection and editing that should not replace the current route. Mobile avoids
nested scrolling, uses drawers rather than dialogs, and stacks route sections
instead of desktop tab strips.

## 8. Delivery status and sequence

Completed foundation and product verticals:

1. Verified the certified schema, Data API exposure, grants, RLS, generated
   types, and integrity rules.
2. Added the crawl URL, crawl event, page evidence, and crawl schedule
   authorities.
3. Added controlled Supabase mode to the canonical Matrx table.
4. Built the `/marketing` shell, site portfolio, site creation, site shell,
   canonical pages, snapshots, crawls, and direct live crawl workspace.
5. Built site analysis/findings, link and screenshot inspection, access grants,
   settings, site/workspace cost reporting, and batch monitoring/detail.
6. Built secret-free site integration reference configuration for GSC, GA4,
   PageSpeed, and extensible providers. References are not treated as verified
   connections.

Remaining approved sequence:

1. Add GSC/GA4 and other integration bindings and metric views.
2. Seed and expose the analysis item/provider catalog and cross-site queues.
3. Add CMS bindings, tasks, proposed changes, and publishing workflows.
4. Continue type checking, focused tests, database advisors, browser testing, and an
   adversarial architecture/UX pass after each vertical.

## 9. Explicit non-goals

- No legacy crawler data migration, remapping, compatibility view, or archive.
- No AI Dream intermediary for crawl commands or live events.
- No Python/AI Dream/Next.js product-data fetch routes.
- No page content stored on `web.page`.
- No crawl URL outcome treated as a canonical page without reconciliation.
- No duplicate Marketing-specific table component.
- No long-lived second writer or second site/page/crawl authority.
