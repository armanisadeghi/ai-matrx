# `web` Schema — Implemented Contract

**Project:** Matrx Main (`txzxabzwovsujtloxrus`)  
**Schema:** `web`

**Status:** Live and verified; reconciled to the implemented schema on
2026-07-19.

**Purpose:** Site crawler, marketing analysis, and future CMS operations.

**Implementation note:** The contract originated from the database owner and now
includes the implemented crawl authority and integrity migrations.

## 1. Non-negotiable mental model

```text
site
├── page                         stable canonical URL + user metadata
│   ├── snapshot                 immutable observed content from one crawl
│   └── page_evidence            source-specific evidence for canonical status
├── crawl_session                one crawl event
│   ├── crawl_url                immutable per-URL crawl outcome
│   └── crawl_event              immutable durable run event
├── crawl_schedule               recurring crawl definition
├── screenshot                   stored visual artifact metadata
├── site_item_config             enabled analysis definitions/providers
├── analysis_result              immutable normalized measurement event
├── finding                      durable problem lifecycle state
├── link_edge                    immutable link evidence from a snapshot
└── batch_job
    └── batch_item               one submitted unit and its execution outcome

shared catalogs
├── analysis_item
└── provider
```

- `site` is one organization-managed website and the access root.
- `page` is the authoritative site URL registry plus user-owned metadata. It
  never owns observed body content.
- `crawl_session` is one crawl event.
- `crawl_url` is one immutable URL outcome within that event; it is not a
  canonical page.
- `crawl_event` is one immutable durable execution/reconciliation event.
- `page_evidence` records what each source currently says about a canonical
  page.
- `crawl_schedule` is the recurring execution definition, not a crawl result.
- `snapshot` is one page capture from one crawl. Current page content is the
  snapshot addressed by `page.latest_snapshot_id`.
- Results are immutable measurements. Findings are stateful problems derived
  from those measurements.

These concepts must not be collapsed in queries, APIs, or UI projections.

## 2. Access and composition

`web_site` is the only directly shareable access root. Every site-owned table is
a canonical `component` with a one-hop `site_id` composition edge. Do not create
`platform.associations` or `platform.reachability` rows for `web` resources.

Share a site and all its components through:

```sql
select iam.fn_grant_resource_permission(
  'web_site',
  <site_id>,
  <grantee_id>,
  <grantee_type>,
  'viewer' | 'editor' | 'admin',
  <expires_at_or_null>
);
```

Exceptions:

- `analysis_item` and `provider` use the canonical `system` variant.
- Built-ins live in the Matrx System organization
  `39c38960-d30c-4840-b0c1-c9960de95582` with public visibility.
- Custom catalog records are organization-owned.

RLS is enabled on all seventeen tables. Anonymous users can read only public
`web.site` rows. Authenticated component access resolves through the parent
site. `service_role` bypasses RLS for trusted workers.

## 3. Base contract

Every table carries:

```text
id uuid primary key
organization_id uuid not null
created_at timestamptz
updated_at timestamptz
created_by uuid
updated_by uuid
deleted_at timestamptz
version int
metadata jsonb
```

Canonical triggers stamp organization, actors, and timestamps. Application code
must not manually set those fields. Normal mutable-entity reads filter
`deleted_at is null`.

Immutable/event tables retain the base-shaped columns for platform consistency
but do not use versioning or soft-deletion as a mutation mechanism. New event
rows are appended.

## 4. Tables

### `web.site` — token `web_site`

Access root and organization-managed representation of one website.

```text
name
root_url
domain
status
visibility
integrations jsonb
homepage_screenshot_id
settings jsonb
```

Unique: `(organization_id, domain)`.

### `web.page` — token `web_page`

Canonical site URL identity and user-managed intent, independent of crawls.

```text
site_id
url
url_hash
path
provenance                  gsc | sitemap | crawl | manual
status                      active | missing | gone
first_seen
last_seen
http_status_last
content_type_last            html | md | pdf | json | xml | txt | image | other
target_keyword
meta_title_desired
meta_description_desired
latest_snapshot_id
```

Unique: `(site_id, url_hash)`. `latest_snapshot_id` is maintained by the
application and defines the current accepted observed content.
`content_type_last` is response-driven: HTML documents remain fully eligible
for page auditing regardless of URL shape, while known non-HTML resources stay
in crawl evidence without receiving HTML-only findings.

### `web.page_evidence` — token `web_page_evidence`

Mutable, source-specific evidence supporting one canonical page's lifecycle.

```text
site_id
page_id
source_type                 manual | crawl | sitemap | gsc | ga4 | cms
source_binding_id
external_key
is_present
first_seen_at
last_seen_at
last_checked_at
evidence jsonb
```

The active identity is unique across page, source type, optional source binding,
and external key. Workers upsert this evidence; it must not be confused with an
immutable snapshot or a crawl URL outcome.

### `web.crawl_session` — token `web_crawl_session`

One crawl event.

```text
site_id
status                      queued | running | complete | failed | partial
trigger                     manual | scheduled
scope jsonb
stats jsonb
started_at
finished_at
error
```

### `web.crawl_url` — token `web_crawl_url`

Append-only record of one URL encountered during one crawl session.

```text
site_id
session_id
sequence
raw_url
normalized_url
url_hash
discovery_source            seed | link | sitemap | gsc | manual | redirect |
                            canonical | other
discovered_from_page_id
classification              internal | external | asset | invalid | excluded
outcome                     discovered | captured | redirected | skipped |
                            excluded | failed | duplicate | cancelled
is_in_scope
depth
http_status
final_url
reason_code
reason
page_id
snapshot_id
discovered_at
completed_at
```

Unique: `(session_id, sequence)`. These rows describe the run's URL ledger, not
the site's canonical page registry.

### `web.crawl_event` — token `web_crawl_event`

Append-only durable event emitted during crawl execution and reconciliation.

```text
site_id
session_id
sequence
event_type
phase
level                       debug | info | warning | error
message
page_id
crawl_url_id
payload jsonb
occurred_at
```

Unique: `(session_id, sequence)`.

### `web.crawl_schedule` — token `web_crawl_schedule`

Mutable recurring-crawl definition for one site.

```text
site_id
name
enabled
cadence jsonb
scope jsonb
timezone
respect_robots              defaults to false; user-controlled switch
screenshot_policy jsonb
scheduler_task_id
next_run_at
last_run_at
last_session_id
```

### `web.snapshot` — token `web_snapshot`

One wide, immutable capture of one page in one session.

```text
site_id
page_id
session_id
captured_at
final_url
http_status
content_hash
word_count
body_file_id                required FK → files.files.id (captured HTML)
markdown_file_id            optional FK → files.files.id (extracted Markdown)
head_tags jsonb
headings jsonb
links_summary jsonb
images jsonb
structured_data jsonb
perf jsonb
extracted jsonb
```

Captured HTML and optional Markdown are private immutable S3 artifacts addressed
only by canonical `files.files` UUIDs. Clients render or open them through the
shared Files feature; storage locations never enter the web contract.

### `web.screenshot` — token `web_screenshot`

Stored visual-artifact metadata.

```text
site_id
page_id                     nullable for pre-page homepage capture
snapshot_id
kind                        homepage | page | full | viewport
file_id                     required FK → files.files.id (PNG)
width
height
captured_at
```

Every requested capture variant is a private immutable S3 artifact addressed by
`file_id`. The site-create bootstrap creates a homepage screenshot and sets
`site.homepage_screenshot_id`; multi-page crawls persist screenshot rows for
every successfully captured page and requested variant.

### `web.analysis_item` — token `web_analysis_item`

Shared definition of one measured signal.

```text
visibility
key
label
description
category
subcategory
kind_definition_id          content_ir.kind_definition
weight
score_contract jsonb
severity_map jsonb
is_builtin
default_provider_id
```

Taxonomy is deliberately text-based: category → subcategory → item. Unique:
`(organization_id, key)`.

### `web.provider` — token `web_provider`

Swappable implementation that computes an analysis item.

```text
key
label
kind                        system_default | user_agent | non_ai | premium_ai
config jsonb
is_builtin
```

An item and its output `kind_definition` are stable. Providers are replaceable
as long as they emit a conforming `content_ir.kind_instance`.

### `web.site_item_config` — token `web_site_item_config`

Per-site analysis enablement and provider choice.

```text
site_id
item_id
provider_id
enabled
cadence jsonb
config jsonb
```

Unique: `(site_id, item_id)`.

### `web.analysis_result` — token `web_result`

Immutable, normalized measurement event.

```text
site_id
subject_type                site | page | snapshot
subject_id
page_id                     denormalized
item_id
item_key                    denormalized
category                    denormalized
subcategory                 denormalized
provider_id
provider_version
run_id
batch_id
computed_at
status                      pass | warn | fail | error | n_a
score smallint              1–100; null for non-scored outcomes
severity                    info | low | med | high | critical
issue_count
confidence
payload_instance_id         content_ir.kind_instance
```

The rich result payload is referenced through `payload_instance_id`, not
inlined into the metrics plane.

### `web.finding` — token `web_finding`

Stateful problem derived from result events.

```text
site_id
subject_type
subject_id
page_id
item_id
item_key
category
subcategory
severity
status                      open | acknowledged | resolved | reopened
suppressed
suppressed_reason
first_result_id
last_result_id
first_detected_at
last_detected_at
resolved_at
```

One active finding exists per site/subject/item. Suppressed findings are
excluded from scoring and priority. Operational dashboards read findings rather
than raw result events.

### `web.link_edge` — token `web_link_edge`

Immutable link evidence produced from one snapshot.

```text
site_id
snapshot_id
source_page_id
target_url
target_page_id              set when an internal target is resolved
is_internal
rel
anchor_text
http_status
position
```

### `web.batch_job` — token `web_batch_job`

One provider batch for one site.

```text
site_id
provider_id
kind                        llm | vision
status                      queued | submitted | processing | complete | failed
external_ref
submitted_at
completed_at
counts jsonb
error
```

### `web.batch_item` — token `web_batch_item`

One submitted unit and its eventual result.

```text
site_id
batch_id
item_id
provider_id
subject_type
subject_id
status
result_id
external_ref
error
```

`batch_item.id` is the cost-link anchor.

## 5. Live integrity and mutation contracts

- Component organization IDs are derived from and validated against the owning
  site.
- Cross-pointers are validated for site, page, crawl session, snapshot,
  screenshot, analysis, finding, link, batch, crawl URL/event, page evidence,
  and schedule consistency.
- `snapshot`, `analysis_result`, and `link_edge` are immutable.
- `crawl_url` and `crawl_event` are append-only.
- `batch_item` permits only its controlled execution lifecycle updates.
- The active-finding uniqueness contract includes `subject_type` and permits one
  unresolved finding per site, subject, and item.

## 6. Views

```text
web.v_latest_result
web.v_page_score
web.v_site_score
web.v_priority_queue
web.v_cost_by_item
web.v_cost_by_run
web.v_cost_by_page
web.v_cost_by_site
web.v_cost_by_client
```

Scores are weighted 1–100 projections. Priority is based on open,
non-suppressed findings using weight × severity × confidence.

## 7. Cost attribution contract

There is no separate web cost table. Executions are costed in
`runtime.global_execution.cost`. Every task that executes one batch item must
set:

```text
link_kind = 'web_batch_item'
link_id   = batch_item.id::text
```

Cost views resolve the linked execution's `root_execution_id` and sum the full
execution subtree. If the runtime cannot set this link, the database owner must
add a `runtime_root_execution_id` reference to `batch_item` instead.

## 8. Reconciliation contract

After a complete, coverage-qualified crawl:

- new eligible URL → create `page` with crawl provenance and crawl evidence;
- seen canonical page → update `last_seen` and `http_status_last`, then point
  `latest_snapshot_id` to the accepted snapshot and upsert positive
  `page_evidence`;
- known page not seen → record negative crawl evidence and mark `missing` only
  when the approved coverage policy qualifies the absence;
- confirmed gone after the approved miss/HTTP policy → mark `gone` and
  soft-delete.

Reconciliation consumes `crawl_url` and source-specific `page_evidence`, but
operates against `page`; it must never redefine a crawl's URL or snapshot
collection as the site's canonical page registry.

## 9. Canonical creation and verification

New tables use:

```sql
web.conform(table, token, label, variant, parent_fk, versioned, soft_del)
```

Then verify with:

```sql
select *
from iam.verify_canonical('web', <table>, <token>, <variant>);
```

Canonical tokens:

```text
web_site
web_page
web_page_evidence
web_crawl_session
web_crawl_url
web_crawl_event
web_crawl_schedule
web_snapshot
web_screenshot
web_analysis_item
web_provider
web_site_item_config
web_result
web_finding
web_link_edge
web_batch_job
web_batch_item
```

## 10. Catalog status

Live verification on 2026-07-18 found 81 built-in `analysis_item` rows, five
built-in `provider` rows, and valid `content_ir.kind_definition` references for
all 81 items. The original supplied note that this catalog was not seeded is now
superseded by the verified live state.
