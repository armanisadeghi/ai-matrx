# `web` Schema — Route Crosswalk and Architecture Review

**Status:** Approved architecture; implementation in progress.  
**Schema authority:** `docs/WEB_SCHEMA_CANONICAL_REFERENCE.md`  
**Route authority:** `docs/MARKETING_SITE_ROUTE_ARCHITECTURE.md`

**Approved decisions:** `docs/MARKETING_SITE_DECISION_REGISTER.md`

## 1. Overall assessment

The live `web` model matches the product's central distinction exceptionally
well:

- `site` is the durable access and management root;
- `page` is a crawl-independent URL identity with user intent but no content;
- `crawl_session` is one execution;
- `snapshot` is timestamped observed content;
- immutable results are separated from stateful findings;
- links retain snapshot provenance;
- provider batch units have a direct runtime-cost anchor.

The one-hop component model is also the correct fit. It avoids duplicating
permission or association rows across high-volume crawler data while allowing
one site grant to cover the entire workspace.

## 2. Route-to-database crosswalk

| Route | Primary authority | Supporting projections | Coverage |
|---|---|---|---|
| `/marketing/sites` | `web.site` | `v_site_score`, findings/crawl aggregates | Complete |
| `/marketing/sites/new` | `web.site` | `web.screenshot` bootstrap | Complete foundation |
| `/marketing/sites/[siteId]` | `web.site` | `v_site_score`, `v_priority_queue`, recent `crawl_session` | Complete |
| `.../pages` | `web.page` | `v_page_score`, finding counts | Complete |
| `.../pages/[pageId]` | `web.page` | latest `web.snapshot`, findings/results | Partial: tasks/CMS changes not modeled |
| `.../pages/[pageId]/snapshots` | `web.snapshot` | `web.screenshot`, results | Complete |
| `.../snapshots/[snapshotId]` | `web.snapshot` | screenshot, link edges, result payloads | Complete |
| `.../crawls` | `web.crawl_session` | snapshot/result counts | Complete |
| `.../crawls/[crawlId]` | `web.crawl_session` | snapshots, results, links | Complete summary |
| `.../crawls/[crawlId]/urls` | — | — | Missing per-URL outcome ledger |
| `.../crawls/[crawlId]/logs` | runtime/external, if present | — | Not defined in `web` |
| `.../analysis` | `web.finding`, `web.analysis_result` | score/priority views | Complete |
| `.../findings` | `web.finding` | `v_priority_queue` | Complete |
| `.../findings/[findingId]` | `web.finding` | first/last results, payload instances | Partial: action history source must be confirmed |
| `.../links` | `web.link_edge` | pages/snapshots | Complete evidence; current projection needs baseline rule |
| `.../screenshots` | `web.screenshot` | snapshots, batches/results | Complete |
| `.../integrations` | `web.site.integrations` | none described | Partial: binding/sync/metric history not modeled |
| `.../cost` | runtime execution cost | `v_cost_by_*` | Complete if runtime link contract is honored |
| `.../settings` | `web.site.settings` + typed site fields | — | Complete foundation |
| `.../access` | IAM grant system on `web_site` | — | Complete |
| `/marketing/analysis/items` | `web.analysis_item` | `content_ir.kind_definition` | Complete; 81 built-ins verified live |
| `/marketing/analysis/providers` | `web.provider` | item defaults/site configs | Complete; 5 built-ins verified live |
| `/marketing/batches` | `web.batch_job` | `web.batch_item` | Complete |
| `/marketing/batches/[batchId]` | `web.batch_job`, `web.batch_item` | results/runtime cost | Complete |
| `/marketing/cost` | runtime execution cost | `v_cost_by_*` | Complete if runtime link contract is honored |

## 3. Genuine gaps to resolve

These are domain-completeness questions, not reasons to redesign the successful
core.

### 3.1 Per-crawl URL outcome ledger

`snapshot` represents captured content. It cannot represent every URL a crawl
encountered: skipped, external, invalid, excluded, duplicate, redirect-only, or
failed-before-capture.

If the product needs `/crawls/[crawlId]/urls`, exact coverage reporting, or an
explainable reconciliation report, add a site component such as
`web.crawl_url`:

```text
site_id
session_id
page_id nullable
raw_url
normalized_url
url_hash
parent_url / discovered_from_id
classification
outcome
http_status
final_url
depth
reason
snapshot_id nullable
discovered_at
finished_at
```

This remains distinct from both `page` and `snapshot`.

### 3.2 Multi-source page evidence

One `page.provenance` value cannot explain that the same URL is simultaneously
known from a sitemap, historical crawl, manual entry, GSC, GA4, and CMS.

If `provenance` means **first creation source**, document and ideally name it as
such. For ongoing reconciliation, add an append/upsert evidence component such
as `web.page_evidence`:

```text
site_id
page_id
source_type
source_binding_id nullable
external_key nullable
first_seen_at
last_seen_at
present
evidence jsonb
```

This is what lets the application explain why a page remains canonical when a
particular crawl misses it.

### 3.3 GSC, GA4, and integration history

`site.integrations jsonb` can hold safe binding configuration or references, but
it is not sufficient for reusable credentials, sync attempts, raw import
provenance, or queryable time-series metrics.

The ideal boundary is:

- reusable secret-bearing connection in the canonical restricted credential
  subsystem;
- `web.integration_binding` component for site → exact provider property;
- `web.integration_sync` component for import lifecycle and diagnostics;
- a queryable page/site metrics fact plane, or a clearly documented existing
  authority outside `web`.

The database owner should identify the intended home before the integration UI
is designed.

### 3.4 CMS, tasks, and scheduled changes

The proposed page workspace includes tasks, CMS bindings, desired changes, and
scheduled publication. The current thirteen-table model does not yet provide
those authorities.

Likely future site components:

- `web.cms_binding` for site/page → external CMS identity;
- `web.change_set` and `web.change_item` for desired/proposed/published state;
- a typed task binding to the platform task system, or a web-owned task
  component if platform associations are intentionally prohibited here.

Observed snapshot content must remain separate from all of them.

### 3.5 Crawl schedules and durable run events

`crawl_session.trigger='scheduled'` records how a run began, but no schedule
definition is present. Likewise, no web-owned run-event/log table is described.
Confirm whether canonical scheduler/runtime systems already own these records.
If not, `web.crawl_schedule` and an append-only `web.crawl_event` are natural
site components.

## 4. Integrity contracts to confirm

Canonical RLS answers who can access a row; it does not by itself prove that
all denormalized IDs point to rows from the same site/item/subject. The write
path should enforce the following with composite FKs or canonical validation
functions/triggers:

- `page.latest_snapshot_id` belongs to that exact page and site;
- `site.homepage_screenshot_id` belongs to that site and has homepage semantics;
- `screenshot.page_id` and `snapshot_id` agree with `screenshot.site_id`;
- `snapshot.page_id` and `session_id` both belong to `snapshot.site_id`;
- `site_item_config.item_id/provider_id` are visible catalog records and the
  provider emits the item's required output kind;
- `analysis_result.subject_id/page_id/item_id/provider_id/batch_id/run_id` agree
  with its denormalized site, taxonomy, and subject type;
- finding first/last result pointers match its site, subject, and item;
- `batch_item.site_id` matches its batch, and `result_id` matches its item,
  provider, subject, and site;
- internal `link_edge` source/target page IDs belong to its site and its
  snapshot belongs to the same source page/site.

The highest-value check is the current-content pointer: a composite constraint
or validation trigger should make it impossible for page A to point at a
snapshot of page B, even when the caller can access both.

## 5. Behavioral contracts to clarify

### Organization stamping on components

For a site shared across organizations, a component's `organization_id` should
normally remain the owning site's organization, not the active organization of
the editor who creates it. Confirm that `web.conform(..., 'component',
'site_id', ...)` copies or validates the parent site's organization during
insert. This affects ownership reporting and cost-by-client accuracy.

### Reconciliation eligibility

Only a complete, coverage-qualified crawl should create negative evidence.
Partial/list-mode crawls, changed scope, authentication failures, outages, or
excluded paths must not mark unrelated canonical pages missing. `missing` is a
flag for investigation; `gone` requires the approved repeated-miss/HTTP policy.

### Finding identity and suppression

Confirm that the active-finding unique key includes `subject_type` as well as
site, subject ID, and item. Define whether suppression persists through future
failing results and how suppression/acknowledgement changes appear in lifecycle
history.

### Result score constraints

Define score nullability for `error` as well as `n_a`, and enforce 1–100 for
scored statuses. Define confidence bounds and the numeric severity mapping used
by the priority view.

### `batch_item` mutability

The supplied convention calls `batch_item` immutable, but its status,
`result_id`, external reference, and error naturally change during execution.
The clean interpretation is:

- immutable identity/input selection after submission;
- controlled lifecycle updates for status/result/error;
- retry attempts either append separately or are recorded in runtime.

Document that interpretation, or split immutable inputs from attempts/events.

### `analysis_result.run_id`

Define whether `run_id` references a crawl session, an analysis run, or a
runtime execution root. This is necessary for reproducible analysis and for
`v_cost_by_run`, especially when analysis occurs independently of a crawl.

### Link resolution immutability

If `link_edge` is immutable, decide whether `target_page_id` is frozen at
capture/reconciliation time or may be filled later when a previously unknown
canonical page appears. A current graph can resolve by URL at query time while
preserving historical edge immutability.

### Site uniqueness and scope

Unique `(organization_id, domain)` permits one site record per normalized domain
inside an organization. Confirm whether `domain` means exact host and whether an
organization must ever manage multiple path-scoped properties on the same host.
If path-scoped duplicates are valid, uniqueness needs the normalized scope, not
domain alone.

## 6. Performance/index checklist

The supplied contract does not enumerate indexes beyond unique constraints.
Before high-volume UI work, confirm indexes matching the real filters and RLS
paths, especially:

- every `site_id`, `page_id`, `session_id`, `snapshot_id`, `batch_id`, `item_id`,
  `provider_id`, and result/finding pointer FK;
- `page (site_id, status, last_seen desc, id)` for active page tables;
- `crawl_session (site_id, started_at desc, id)`;
- `snapshot (site_id, page_id, captured_at desc, id)` and
  `(site_id, session_id, captured_at, id)`;
- `analysis_result (site_id, subject_type, subject_id, item_id, computed_at desc,
  id)` plus run/batch lookup paths;
- partial open-finding indexes matching `deleted_at is null`, `suppressed=false`,
  and active statuses;
- `link_edge (site_id, snapshot_id)`, source-page, target-page, and broken-link
  lookup paths;
- `batch_job (site_id, status, created_at, id)` and
  `batch_item (batch_id, status, id)`;
- `runtime.global_execution (link_kind, link_id)` for cost attribution.

Deep/high-volume tables should use cursor/keyset pagination with a deterministic
ID tie-breaker. JSONB fields need GIN or expression indexes only for keys the
product actually filters; they should not be indexed indiscriminately.

## 7. Approved implementation order

1. Validate the live built-in catalog and output contracts.
2. Add the approved crawl-URL ledger and multi-source page evidence.
3. Add the approved integration, metric, schedule, event, CMS, task, and change
   authorities in foundation-first phases.
4. Enforce cross-site pointer integrity and component organization stamping.
5. Confirm cost runtime tagging with one real batch-item execution and non-zero
   view results.
6. Implement the frozen `/marketing` route contract with direct Supabase reads
   and a direct scraper command/live-stream client.
