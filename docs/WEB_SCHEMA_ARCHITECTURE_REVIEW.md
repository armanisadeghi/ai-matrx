# `web` Schema — Route Crosswalk and Architecture Review

**Status:** Approved architecture; database foundation and first frontend
vertical implemented.

**Schema authority:** `docs/WEB_SCHEMA_CANONICAL_REFERENCE.md`  
**Route authority:** `docs/MARKETING_SITE_ROUTE_ARCHITECTURE.md`

**Approved decisions:** `docs/MARKETING_SITE_DECISION_REGISTER.md`

## 1. Overall assessment

The live 17-table `web` model preserves the product's central distinctions:

- `site` is the durable access and management root;
- `page` is a crawl-independent URL identity with user intent but no content;
- `crawl_session` is one execution;
- `crawl_url` and `crawl_event` describe what happened during that execution;
- `snapshot` is timestamped observed content;
- `page_evidence` explains why a page remains in the canonical registry;
- immutable results are separated from stateful findings;
- links retain snapshot provenance;
- provider batch units have a direct runtime-cost anchor.

The one-hop component model remains the correct access design. It avoids
duplicating permission or association rows across high-volume crawler data
while allowing one site grant to cover the entire workspace.

## 2. Route-to-database and implementation crosswalk

Database coverage and frontend implementation are intentionally reported in
separate columns. A live authority does not imply that its approved route has
shipped.

| Route                                | Primary authority/projection                                       | Database coverage                                                                    | Frontend status                                      |
| ------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `/marketing`                         | Route shell                                                        | N/A                                                                                  | Implemented redirect                                 |
| `/marketing/admin`                   | Marketing administration shell                                     | Foundation                                                                           | Implemented                                          |
| `/marketing/sites`                   | `web.site`, `v_site_score`                                         | Live; dedicated portfolio trend/last-crawl/open-finding aggregate can still be added | Implemented first vertical                           |
| `/marketing/sites/new`               | `web.site`, homepage `web.screenshot`                              | Live                                                                                 | Implemented, including direct asynchronous bootstrap |
| `/marketing/sites/[siteId]`          | `web.site`, scores, findings, recent `crawl_session`               | Live                                                                                 | Implemented first vertical                           |
| `.../pages`                          | `web.page`, `v_page_score`, findings                               | Live                                                                                 | Implemented first vertical                           |
| `.../pages/[pageId]`                 | `web.page`, latest `web.snapshot`                                  | Core live; CMS/tasks remain future authorities                                       | Implemented core workspace                           |
| `.../pages/[pageId]/snapshots`       | `web.snapshot`                                                     | Live                                                                                 | Implemented first vertical                           |
| `.../snapshots/[snapshotId]`         | `web.snapshot`, screenshots, edges, results                        | Live                                                                                 | Implemented first vertical                           |
| `.../crawls`                         | `web.crawl_session`                                                | Live                                                                                 | Implemented first vertical                           |
| `.../crawls/new`                     | `crawl_session`, `crawl_url`, `crawl_event`; direct scraper stream | Live durable authorities                                                             | Implemented direct command/live workspace            |
| `.../crawls/[crawlId]`               | `web.crawl_session`                                                | Live                                                                                 | Implemented first vertical                           |
| `.../crawls/[crawlId]/urls`          | `web.crawl_url`                                                    | Live append-only ledger                                                              | Implemented first vertical                           |
| `.../crawls/[crawlId]/logs`          | `web.crawl_event`                                                  | Live append-only event history                                                       | Implemented first vertical                           |
| `.../crawls/[crawlId]/snapshots`     | `web.snapshot`                                                     | Live                                                                                 | Remaining approved route                             |
| `.../crawls/[crawlId]/findings`      | `web.finding`, results                                             | Live core authority                                                                  | Remaining approved route                             |
| `.../crawls/[crawlId]/links`         | `web.link_edge`                                                    | Live                                                                                 | Remaining approved route                             |
| `.../analysis`                       | findings, results, score/priority views                            | Live                                                                                 | Remaining approved route                             |
| `.../findings`                       | `web.finding`, `v_priority_queue`                                  | Live                                                                                 | Remaining approved route                             |
| `.../findings/[findingId]`           | `web.finding`, result/payload pointers                             | Core live; separate action-history authority is not defined                          | Remaining approved route                             |
| `.../links`                          | `web.link_edge`, pages, snapshots                                  | Evidence live; current-baseline projection policy remains                            | Remaining approved route                             |
| `.../screenshots`                    | `web.screenshot`, snapshots, batches/results                       | Live                                                                                 | Remaining approved route                             |
| `.../integrations`                   | `web.site.integrations`                                            | Partial; bindings/sync/metric facts remain future                                    | Remaining approved route                             |
| `.../cost`                           | runtime execution cost, `v_cost_by_*`                              | Live if runtime link contract is honored                                             | Remaining approved route                             |
| `.../settings`                       | `web.site.settings`, `web.crawl_schedule`                          | Live foundation                                                                      | Remaining approved route                             |
| `.../access`                         | IAM grants on `web_site`                                           | Live                                                                                 | Remaining approved route                             |
| `/marketing/analysis/items`          | `web.analysis_item`, output contracts                              | Live; 81 built-ins verified                                                          | Remaining approved route                             |
| `/marketing/analysis/items/new`      | `web.analysis_item`, output contracts                              | Live                                                                                 | Remaining approved route                             |
| `/marketing/analysis/items/[itemId]` | `web.analysis_item`, provider/output contracts                     | Live                                                                                 | Remaining approved route                             |
| `/marketing/analysis/providers`      | `web.provider`, site configs                                       | Live; five built-ins verified                                                        | Remaining approved route                             |
| `/marketing/analysis`                | findings, results, score/priority views                            | Live core authority                                                                  | Remaining approved route                             |
| `/marketing/findings`                | `web.finding`, priority projection                                 | Live                                                                                 | Remaining approved route                             |
| `/marketing/connections`             | Restricted credential authority plus future bindings               | Partial                                                                              | Remaining approved route                             |
| `/marketing/batches`                 | `web.batch_job`, `web.batch_item`                                  | Live                                                                                 | Remaining approved route                             |
| `/marketing/batches/[batchId]`       | batch job/items, results, runtime cost                             | Live                                                                                 | Remaining approved route                             |
| `/marketing/cost`                    | runtime execution cost, `v_cost_by_*`                              | Live if runtime link contract is honored                                             | Remaining approved route                             |

The crawl command and current live stream go directly between the browser and
the scraper. Historical, list, detail, URL, event, analysis, and other product
reads go directly from the browser to Supabase. There is no scraper, AI Dream,
or Next.js product-data read API.

## 3. Implemented authorities and remaining domain gaps

### 3.1 Crawl execution authorities are live

The previously proposed crawl foundations now exist:

- `web.crawl_url` is the append-only per-session URL outcome ledger. It covers
  captured, skipped, excluded, external, invalid, duplicate, redirected,
  failed, and cancelled URLs without promoting them automatically to `page`.
- `web.crawl_event` is the append-only durable event/log stream keyed by crawl
  session and sequence.
- `web.page_evidence` is the mutable/upsert source-evidence plane for manual,
  crawl, sitemap, GSC, GA4, and CMS knowledge.
- `web.crawl_schedule` owns recurring scope, cadence, timezone, screenshot
  policy, scheduler linkage, and a user-controlled `respect_robots` switch that
  defaults to false.

These authorities are canonical site components with organization and
cross-pointer validation. They are not roadmap gaps.

### 3.2 GSC, GA4, and integration history remain

`site.integrations jsonb` can hold safe configuration or references, but it is
not sufficient for reusable credentials, sync attempts, raw import provenance,
or queryable time-series metrics.

The approved future boundary remains:

- reusable secret-bearing connections in the canonical restricted credential
  subsystem;
- `web.integration_binding` for site → exact provider property;
- `web.integration_sync` for import lifecycle and diagnostics;
- a queryable page/site metrics fact plane, or a clearly documented existing
  authority outside `web`.

The database owner must identify the credential authority before integration UI
implementation. The browser will still read resulting product data directly
from Supabase.

### 3.3 CMS, tasks, and scheduled changes remain

The page workspace ultimately includes tasks, CMS bindings, desired changes,
and scheduled publication. The current 17-table model does not yet provide
those authorities.

Approved future components include:

- `web.cms_binding` for site/page → external CMS identity;
- `web.change_set` and `web.change_item` for desired/proposed/published state;
- a typed task binding to the platform task system, or a web-owned task
  component if platform associations remain intentionally prohibited here.

Observed snapshot content must remain separate from all of them.

### 3.4 Scheduling execution remains an integration concern

`web.crawl_schedule` is the canonical schedule definition. The remaining work
is to bind it to the selected scheduler/worker, define retry and missed-run
behavior, and build the settings UI. `crawl_session.trigger='scheduled'` records
how the resulting run began.

## 4. Live integrity contracts and remaining checks

The implemented integrity migration enforces the high-value same-site and
same-subject contracts, including:

- component `organization_id` matches the owning site;
- `page.latest_snapshot_id` belongs to that exact page/site and is an accepted
  capture;
- `site.homepage_screenshot_id` belongs to that site and has homepage semantics;
- snapshot, screenshot, link-edge, result, finding, batch, crawl URL/event,
  evidence, and schedule pointers remain within the correct site and subject;
- finding/result denormalized taxonomy and subject pointers agree;
- the active-finding uniqueness key includes `subject_type`;
- `snapshot`, `analysis_result`, and `link_edge` are immutable;
- `crawl_url` and `crawl_event` are append-only;
- `batch_item` permits controlled lifecycle updates rather than arbitrary input
  mutation.

Remaining checks span external or cross-subsystem contracts:

- confirm every selected provider emits the analysis item's required output
  kind before accepting a result;
- execute a real batch item with `link_kind='web_batch_item'` and verify non-zero
  cost rollups;
- keep worker writes constrained to the canonical lifecycle transitions and
  reconciliation policy.

## 5. Behavioral contracts

### Organization stamping

Confirmed live: site components derive and validate the owning site's
organization. A shared-site editor's active organization does not silently
re-own child data.

### Reconciliation eligibility

Only a complete, coverage-qualified crawl may create negative evidence.
Partial/list-mode crawls, changed scope, authentication failures, outages, or
excluded paths must not mark unrelated canonical pages missing. `missing` is an
investigation state; `gone` requires the approved repeated-miss/HTTP policy.

### Finding identity and suppression

The live active-finding key includes `subject_type`, site, subject ID, and item.
Product behavior must still define whether suppression persists through future
failing results and how acknowledgement/suppression actions appear in history.

### Results and run identity

Score/status constraints enforce the canonical 1–100 contract and nullable
non-scored outcomes. `analysis_result.run_id` is nullable; when present, the
live integrity contract validates it as a crawl-session reference. Independent
analysis uses its batch/runtime identity without inventing a crawl.

### Batch lifecycle

`batch_item` has immutable identity/input selection after submission and
controlled status/result/error lifecycle updates. Retries create a distinct
attempt in the runtime/batch design rather than rewriting submitted inputs.

### Link resolution

`link_edge` is immutable, so `target_page_id` is capture/reconciliation-time
evidence. A current graph may resolve an unmatched internal target by URL at
query time or through a later observation without mutating historical edges.

### Site uniqueness and scope

Unique `(organization_id, domain)` currently means one managed normalized host
per organization. If path-scoped properties on the same host become a product
requirement, introduce a normalized scope identity deliberately rather than
weakening canonical URL rules ad hoc.

## 6. Performance/index checklist

Live migrations add the principal crawl-authority indexes. Continue validating
query plans against actual table filters and RLS paths, especially:

- every `site_id`, `page_id`, `session_id`, `snapshot_id`, `batch_id`, `item_id`,
  `provider_id`, and result/finding pointer FK;
- `page (site_id, status, last_seen desc, id)`;
- `crawl_session (site_id, started_at desc, id)`;
- `crawl_url` by session/sequence, normalized URL/hash, outcome, page, and
  snapshot;
- `crawl_event` by session/sequence, time, level, phase, crawl URL, and page;
- `page_evidence` by page/source identity and presence/check time;
- `crawl_schedule` by site, enabled/next-run time, and scheduler task;
- `snapshot (site_id, page_id, captured_at desc, id)` and
  `(site_id, session_id, captured_at, id)`;
- `analysis_result (site_id, subject_type, subject_id, item_id, computed_at desc,
id)` plus run/batch lookup paths;
- partial open-finding indexes matching `deleted_at is null`,
  `suppressed=false`, and active statuses;
- `link_edge` snapshot/source/target/broken-link lookup paths;
- `batch_job` and `batch_item` status/order lookup paths;
- `runtime.global_execution (link_kind, link_id)` for cost attribution.

High-volume tables use deterministic cursor/keyset pagination where appropriate;
bounded Supabase range pagination remains valid for shallower tables. JSONB
fields receive GIN or expression indexes only for keys the product actually
filters.

## 7. Delivery status and remaining order

Completed:

1. Verified 81 built-in analysis items, five providers, and output contracts.
2. Added `crawl_url`, `crawl_event`, `page_evidence`, and `crawl_schedule`.
3. Exposed `web` through the Data API with direct-client grants, RLS, and
   generated types.
4. Added organization, pointer, immutability, and lifecycle integrity rules.
5. Implemented the first `/marketing` frontend vertical, including direct
   Supabase reads and direct scraper command/current-stream handling.

Remaining approved order:

1. Verify cost attribution with a real execution and add any portfolio aggregate
   views justified by measured queries.
2. Build analysis, findings, links, screenshots, batch, cost, access, and
   settings routes.
3. Add integration bindings, sync history, typed metrics, and reusable
   connection UI.
4. Add CMS bindings, tasks, change sets/items, and publishing workflows.
5. Complete schedule/worker integration and its management UI.
6. Continue focused type, query-plan, browser, and adversarial UX validation per
   vertical.

No legacy crawler data is migrated.
