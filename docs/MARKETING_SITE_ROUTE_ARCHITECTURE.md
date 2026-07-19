# Marketing Site Platform — Route Architecture

**Status:** Approved route contract

**Implementation status:** First vertical implemented; approved expansion remains.

**Companion:** `docs/MARKETING_SITE_PLATFORM_PLAN.md`

**Database crosswalk:** `docs/WEB_SCHEMA_ARCHITECTURE_REVIEW.md`  
**Canonical schema contract:** `docs/WEB_SCHEMA_CANONICAL_REFERENCE.md`

**Approved decisions:** `docs/MARKETING_SITE_DECISION_REGISTER.md`

## 1. Routing principle

The managed site is the primary workspace and access/context root. Almost every
operational resource therefore lives under one site shell. Canonical analysis
definitions, provider bindings, batch operations, and cross-site cost reporting
live at the Marketing workspace level because they are shared across sites.

Permanent namespace:

```text
/marketing
```

This leaves room for the full marketing operating system without forcing shared
resources underneath a website-specific root.

## 2. Canonical route tree and implementation status

### Implemented first vertical

```text
/marketing
  Redirects to the managed-site portfolio.

/marketing/admin
  Marketing administration entry point.

/marketing/sites
  Managed-site portfolio with the current score projection. Trend, last-crawl,
  and open-finding portfolio aggregates remain an approved enhancement.

/marketing/sites/new
  Add a site to an organization. Creates the durable site first, then starts
  the asynchronous homepage metadata and screenshot bootstrap.

/marketing/sites/[siteId]
  Shared site layout: site identity, current health projection, navigation, and
  site-scoped context/access resolution.

  /pages
    Canonical page registry. Stable URLs only, with provenance, first/last
    evidence, lifecycle status, target keyword, and latest score projections.

  /pages/[pageId]
    Stable page workspace: user metadata, desired metadata, current accepted
    content, page rollups, and findings. Tasks, CMS changes, and scheduling join
    this route after their approved authorities are added.

  /pages/[pageId]/snapshots
    Timeline of immutable observations/captures for the canonical page.

  /pages/[pageId]/snapshots/[snapshotId]
    One capture: observed content, screenshot artifacts, extraction metadata,
    and analysis results tied to that capture.

  /crawls
    Crawl sessions: time, scope, status, coverage, pages captured, and quality.

  /crawls/new
    Start a crawl directly against the scraper, show the current transient live
    stream, and link to the durable session written to Supabase.

  /crawls/[crawlId]
    One crawl session with immutable configuration, progress, coverage, and
    reconciliation summary: new, known, missed, excluded, and suspected-gone.

  /crawls/[crawlId]/urls
    Durable per-URL outcomes for the session.

  /crawls/[crawlId]/logs
    Durable crawl events and errors for the session.
```

### Remaining approved route contract

The following routes are approved but are not part of the implemented first
vertical:

```text
/marketing/sites/[siteId]
  /crawls/[crawlId]/snapshots
    Captures produced by this run.

  /crawls/[crawlId]/findings
    Findings detected in this run.

  /crawls/[crawlId]/links
    Link edges observed specifically during this run.

  /analysis
    Site prioritization workspace: weight × severity × confidence queue,
    category → subcategory → item rollups, and page ranking.

  /findings
    Durable site finding register: open, acknowledged, resolved, reopened,
    suppressed, and false-positive states.

  /findings/[findingId]
    Finding evidence, payload/artifact pointers, lifecycle history, and actions.

  /links
    Current accepted link-graph projection: broken links, orphan pages,
    internal-link structure, anchors, and observed HTTP status.

  /screenshots
    Site-wide screenshot gallery and vision-analysis entry points.

  /integrations
    Bind this site to exact GSC, GA4, performance, CMS, and future provider
    properties; show binding and synchronization health.

  /cost
    Site cost rollup by crawl, analysis batch, analysis item, and page.

  /settings
    Site identity, scope, URL policy, crawl defaults, screenshot policy,
    retention, and lifecycle configuration.

  /access
    Site sharing and organization/user grants. This is proposed as a dedicated
    route because cross-organization access is a core workflow rather than a
    minor settings field.

/marketing/analysis
  Recommended cross-site prioritization board for an agency or organization.

/marketing/analysis/items
  Canonical analysis-item catalog: category → subcategory → item; built-in and
  custom definitions.

/marketing/analysis/items/new
  Create a custom analysis item.

/marketing/analysis/items/[itemId]
  Item contract: 1–100 scoring rules, default weight, severity mapping, output
  kind, evidence contract, and provider binding.

/marketing/analysis/providers
  Analysis providers and item → provider bindings.

/marketing/findings
  Recommended cross-site finding queue for agencies managing many client sites.

/marketing/connections
  Recommended organization-level credential connections. A connection may be
  bound to several sites; the site `/integrations` route manages the binding,
  not the reusable credential itself.

/marketing/batches
  Cross-site batch monitor: queued → submitted → processing → completed/failed.

/marketing/batches/[batchId]
  Batch manifest, selected inputs, items, results, per-item failures, costs,
  and retry/re-run controls.

/marketing/cost
  Cost rollup across all sites, organizations/clients, crawls, providers,
  analysis items, and batches.
```

## 3. Crawl route family

One crawl can contain thousands of URL outcomes, observations, links, findings,
and events. Its index route should remain a compact summary, with high-volume
data in addressable child routes:

```text
/marketing/sites/[siteId]/crawls/new
  Crawl options, direct scraper command, current transient live stream, and a
  link to the durable Supabase session. This route is implemented.

/marketing/sites/[siteId]/crawls/[crawlId]
  Summary, immutable configuration, coverage, and reconciliation.

/marketing/sites/[siteId]/crawls/[crawlId]/urls
  Every URL encountered by the run, including fetched, skipped, excluded,
  external, invalid, duplicate, and failed URLs. These are run URLs, not the
  canonical page registry.

/marketing/sites/[siteId]/crawls/[crawlId]/snapshots
  Captures produced by this run.

/marketing/sites/[siteId]/crawls/[crawlId]/findings
  Findings/occurrences detected in this run.

/marketing/sites/[siteId]/crawls/[crawlId]/links
  Link edges observed specifically during this run.

/marketing/sites/[siteId]/crawls/[crawlId]/logs
  Durable run events, errors, and reconciliation history.
```

This expansion preserves the core distinction between a site's permanent page
registry and the set of URLs encountered by one crawl. `/crawls/new`, crawl
detail, `urls`, and `logs` are implemented; `snapshots`, `findings`, and `links`
remain approved expansion routes.

## 4. Route semantics

### Site shell

`/marketing/sites/[siteId]` owns the shared site header, site identity, current
health projection, navigation, and site context. Each nested fetch still scopes
the child record to both its own ID and `siteId`, preventing accidental
cross-site joins such as opening a page from site B under site A.

### Pages and snapshots

The page route represents stable identity and user-managed intent. A snapshot
represents observed state at a point in time. “Current content” on the page
workspace is a projection of the latest accepted successful snapshot, not
content stored as the page's identity.

**Snapshot** is the canonical database, route, and user-facing term.

### Analysis and findings

`analysis` is the prioritization and rollup workspace: what deserves attention
and why. `findings` is the durable lifecycle register: the individual problems,
their evidence, disposition, and history. They are related but not synonymous.

### Links

The site `/links` route shows the latest accepted/current graph. Historical link
evidence remains under the crawl that observed it.

### Connections and bindings

Reusable OAuth/vendor connections live at the Marketing or organization level.
Site integrations are bindings from one managed site to an exact provider
property. This permits one approved Google connection to support many client
sites without duplicating credentials.

### Cost

The site cost route and workspace cost route are two projections over the same
cost ledger. They are not separate sources of truth.

## 5. Navigation and UI rules

- Core resource identity is expressed by path segments, not client-only tabs.
- Query parameters are reserved for search, filters, sorting, pagination, date
  windows, comparison baselines, and other view state.
- Site, page, crawl, finding, analysis item, and batch rows deep-link to their
  canonical routes.
- Dense tables use the official Matrx data table. High-volume tables use its
  controlled pagination, filtering, and sorting mode. The browser issues those
  queries directly to Supabase; this never introduces a Python, AI Dream, or
  Next.js product-data route.
- Windows, side panels, and drawers are convenience inspectors over resources
  that still have real routes.
- Desktop uses the full workspace. Mobile collapses route navigation into the
  canonical menu/drawer and keeps one primary scroll region.

## 6. Approved route decisions

- `/marketing/sites` is the permanent site portfolio root.
- Cross-organization sharing has the dedicated site `/access` route.
- Cross-site analysis, findings, connections, batches, and cost workspaces remain
  approved for the first release; they are not part of the implemented first
  vertical.
- `/marketing/batches` is the universal Marketing batch monitor.
- `snapshot` is the canonical database, route, and user-facing term.
