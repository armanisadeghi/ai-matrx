# Marketing Site Platform — Decision Register

**Status:** Approved on 2026-07-18  
**Decision:** Recommendations 1–23 and 25–26 are approved. Decision 24 is
explicitly rejected: no legacy crawler data will be migrated.  
**Scope:** This is the final decision record for the initial implementation.

## A. Product namespace and routes

### 1. Permanent route namespace

**Context:** The system now includes sites, shared analysis definitions,
connections, batches, findings, and cross-client cost reporting. It is broader
than a website list.

**Question:** Should the permanent product root be `/marketing/sites` rather
than `/websites` or `/sites`?

**Recommendation:** **Yes.** Use `/marketing` as the bounded product namespace
and `/marketing/sites` for managed sites. Keep implementation under
`features/marketing` with site-specific modules beneath it.

### 2. Cross-site agency workspaces in the first release

**Context:** Agencies managing dozens of sites need organization-wide work
queues, not only site-by-site screens.

**Question:** Should the first route contract include cross-site
`/marketing/analysis`, `/marketing/findings`, `/marketing/connections`,
`/marketing/batches`, and `/marketing/cost`?

**Recommendation:** **Yes.** Build these as cross-site projections over the same
site-owned data. They do not become new data authorities.

### 3. Site access as a first-class route

**Context:** Cross-organization sharing is a core site workflow. Hiding it
inside a large settings form makes it difficult to find and deep-link.

**Question:** Should site grants live at
`/marketing/sites/[siteId]/access` rather than only inside settings?

**Recommendation:** **Yes.** Keep configuration at `/settings` and sharing,
members, grants, expirations, and audit information at `/access`.

### 4. Product term for captured page content

**Context:** The database table is `web.snapshot`, and the term clearly
communicates a page captured at one moment.

**Question:** Should the UI and routes consistently use **snapshot**?

**Recommendation:** **Yes.** Use `/pages/[pageId]/snapshots/[snapshotId]` and
“Snapshot” in the product. “Observation” may still appear in technical worker
documentation where useful.

### 5. Crawl-detail child routes

**Context:** A crawl may contain thousands of URL outcomes, snapshots, links,
findings, and durable events. One detail screen cannot represent these cleanly.

**Question:** Should a crawl have addressable `/urls`, `/snapshots`,
`/findings`, `/links`, and `/logs` child routes?

**Recommendation:** **Yes.** Keep `/crawls/[crawlId]` as the summary and put
each high-volume dataset on its own canonical table route.

### 6. Supabase-controlled canonical tables

**Context:** The official Matrx table currently handles filtering, sorting, and
pagination in the browser. Page, result, finding, link, snapshot, and batch
tables will outgrow client-only behavior.

**Question:** Should the shared Matrx data table gain a backward-compatible
controlled mode for high-volume Marketing tables?

**Decision:** **Yes.** Extend the canonical component once; do not create a
Marketing-specific table fork. In controlled mode the browser calls Supabase
directly and pushes range, filtering, and ordering into Postgres/PostgREST.
"Server" never means a Python, AI Dream, or Next.js data-fetching endpoint.
Preserve the existing in-memory mode as the default for current consumers.

## B. Missing database authorities

### 7. Per-crawl URL outcome ledger

**Context:** `web.snapshot` represents a capture. It cannot represent URLs that
were external, excluded, skipped, invalid, duplicate, redirect-only, or failed
before capture. Without those rows, crawl coverage and reconciliation are not
fully explainable.

**Question:** Should we add `web.crawl_url` as a site component?

**Recommendation:** **Yes.** Store session, raw/normalized URL, hash, discovery
source, optional canonical page, classification, outcome, depth, HTTP/final URL,
reason, and optional snapshot. Never treat these rows as canonical pages.

### 8. Multi-source canonical-page evidence

**Context:** One canonical page can be supported by manual entry, crawl,
sitemap, GSC, GA4, and CMS simultaneously. `page.provenance` can only hold one
value.

**Question:** Should `page.provenance` mean the first creation source while a
new `web.page_evidence` component records ongoing evidence by source?

**Recommendation:** **Yes.** Preserve the existing column as initial
provenance. Add source type/binding/external key, first/last seen, presence, and
evidence metadata in `page_evidence`.

### 9. Integration bindings, sync history, and metrics

**Context:** `site.integrations jsonb` can hold safe settings or references, but
it cannot be the durable authority for reusable credentials, property bindings,
sync attempts, or queryable GSC/GA4 time-series facts.

**Question:** Should integrations use the platform credential vault plus
site-owned binding/sync/metric records?

**Recommendation:** **Yes.** Keep secrets in the restricted connection system;
add `web.integration_binding` and `web.integration_sync`; add a typed metrics
fact plane for page/site/provider/date dimensions. Keep `site.integrations` as a
small projection/settings cache, not the source of truth.

### 10. CMS bindings, proposed changes, and tasks

**Context:** The proposed page workspace includes CMS identity, desired changes,
scheduled publishing, and tasks. The existing thirteen tables do not own those
workflows.

**Question:** Should these be added without changing `page` or `snapshot`?

**Recommendation:** **Yes.** Add site components for `cms_binding`,
`change_set`, `change_item`, and a typed `task_binding` to the existing task
system. Do not use snapshots as authored content, and do not create web
reachability/association rows.

### 11. Crawl schedules and durable events

**Context:** `crawl_session.trigger='scheduled'` records that a schedule fired,
but it does not define the schedule. The current web schema also has no
documented durable crawl event/log authority.

**Question:** Should the web model own schedule definitions and crawl events
while reusing the existing scheduler/runtime to execute them?

**Recommendation:** **Yes.** Add `web.crawl_schedule` and append-only
`web.crawl_event` site components. Let the canonical scheduler dispatch the
schedule, but keep site-specific crawl configuration and run history in `web`.

## C. Integrity and lifecycle rules

### 12. Component organization ownership

**Context:** A client organization may edit a site shared from another
organization. If component triggers stamp the editor's active organization,
child rows and cost-by-client reporting can disagree with the owning site.

**Question:** Must every site component copy/validate
`organization_id = site.organization_id`, regardless of the editor's active
organization?

**Recommendation:** **Yes.** The parent site owns component organization
identity. The actor remains visible through `created_by/updated_by`.

### 13. Cross-pointer integrity

**Context:** RLS proves access but does not prove that denormalized pointers
belong to the same site, page, item, subject, or batch.

**Question:** Should cross-row pointers be protected by composite foreign keys
or canonical validation triggers/RPCs rather than application checks alone?

**Recommendation:** **Yes.** Enforce at least: page→latest snapshot,
site→homepage screenshot, snapshot→page/session, screenshot→page/snapshot,
result/finding pointer agreement, batch→batch item→result agreement, and
link-edge site/source/target agreement.

### 14. Reconciliation eligibility

**Context:** A partial, list-mode, narrowed-scope, failed, or blocked crawl may
legitimately omit canonical pages.

**Question:** Should only complete, coverage-qualified sessions create negative
page evidence or mark a page missing?

**Recommendation:** **Yes.** A missed URL becomes `missing` only when it was
inside the session's frozen scope and the session met coverage rules. `gone`
requires the approved repeated-miss or definitive HTTP policy.

### 15. Finding identity, suppression, and history

**Context:** Findings are durable state derived from result events. Their
identity and manual actions must be predictable across re-analysis.

**Question:** Should one active finding be keyed by
`(site_id, subject_type, subject_id, item_id)`, with suppression persisting until
explicitly removed and every lifecycle action recorded?

**Recommendation:** **Yes.** Include `subject_type` in the active uniqueness
rule. Future failing results may refresh a suppressed finding's evidence but do
not unsuppress it. Use canonical row history/activity if it captures every
action; otherwise add an append-only finding-event component.

### 16. Result score and priority constraints

**Context:** Consistent cross-provider scoring requires explicit handling of
unscored/error results and deterministic priority math.

**Question:** Should scored results require 1–100, while `n_a` and `error` have
null scores, confidence is constrained to 0–1, and severity uses one fixed
numeric multiplier table for priority?

**Recommendation:** **Yes.** Enforce these rules in database constraints/write
functions so providers cannot invent incompatible semantics.

### 17. `batch_item` lifecycle semantics

**Context:** `batch_item` is described as immutable, but status, external
reference, result, and error naturally change while a job runs.

**Question:** Should batch-item input identity become immutable after submission
while controlled lifecycle fields remain updateable?

**Recommendation:** **Yes.** Freeze batch/item/provider/subject inputs. Permit
validated state transitions for status/result/error. Keep retry attempts in
runtime events initially; add an attempt table only if product inspection needs
it later.

### 18. Meaning of `analysis_result.run_id`

**Context:** `run_id` is ambiguous because analysis may be attached to a crawl,
a batch, a manual request, or a runtime execution.

**Question:** Should `run_id` specifically mean the originating crawl session?

**Recommendation:** **Yes.** Rename it to `crawl_session_id` if feasible, or at
minimum enforce an FK to `web.crawl_session`; allow null for analysis not tied to
a crawl. Use `batch_id` for provider batches and runtime links for execution
identity.

### 19. Immutable link resolution

**Context:** An internal link target may be unknown when its snapshot is
captured and become canonical later. Updating `target_page_id` would mutate
historical evidence.

**Question:** Should `link_edge.target_page_id` be frozen at reconciliation time
while current graph queries may resolve additional targets by normalized URL?

**Recommendation:** **Yes.** Preserve historical edge immutability. Build the
current accepted graph as a projection rather than rewriting old evidence.

### 20. Site uniqueness and path scopes

**Context:** Unique `(organization_id, domain)` permits one managed site per
normalized domain/host in an organization. It does not permit two independent
path-scoped workspaces on the same host.

**Question:** Is one site per exact normalized host per organization the intended
product rule?

**Recommendation:** **Yes.** Define `domain` as the exact normalized host,
including subdomain identity. Store optional path scope in settings but do not
create separate site roots for multiple paths unless a real requirement appears.

## D. Analysis, score, and cost behavior

### 21. Initial built-in analysis catalog

**Context:** The live schema is ready and now contains 81 built-in items, five
built-in providers, and a `content_ir.kind_definition` for every item. The
decision governs how that catalog evolves and which checks ship first in UI.

**Question:** Should the first catalog prioritize deterministic, explainable
checks before AI-heavy items?

**Decision:** **Yes.** Validate and surface the deterministic catalog first,
covering technical SEO, on-page metadata, content structure, links, performance,
images, structured data, and visual/page quality. Use non-AI/system providers
where possible; add vision and premium-AI providers behind the same fixed output
contracts.

### 22. Health-score contract

**Context:** `v_page_score` and `v_site_score` must remain comparable over time
even when item weights/providers/catalog versions change.

**Question:** Should scores use the latest eligible non-suppressed result per
subject/item, exclude `n_a/error` from the denominator, and record the scoring
contract version used for every displayed trend?

**Recommendation:** **Yes.** Keep errors visible as coverage/quality warnings,
not artificial zero scores. Compare trends only under an identified scoring
contract or explicitly label a recalculation.

### 23. Runtime cost-link contract

**Context:** All web cost views depend on each execution carrying
`link_kind='web_batch_item'` and the batch-item UUID as `link_id`.

**Question:** Should this tag be mandatory for every batch-item execution, with a
database column added only if the runtime truly cannot provide it?

**Recommendation:** **Yes.** Make runtime tagging the primary contract. Before
building cost UI, execute one real batch item and verify every cost rollup is
non-zero and attributable.

## E. Cutover and delivery

### 24. Legacy AI Dream crawler history

**Context:** The old crawler contains useful site, page, crawl, snapshot,
screenshot, link, issue, and integration history.

**Question:** Should relevant legacy history be migrated into the canonical
`web` model rather than starting empty?

**Decision:** **No.** Do not migrate, remap, expose, or archive legacy crawler
data as part of the new Marketing system. The new `web` system starts clean.

### 25. One write authority at cutover

**Context:** Long-lived dual writes between `scraper` and `web` would create two
conflicting page/crawl authorities.

**Question:** Should all new site/page/crawl writes move to `web` in one
coordinated cutover?

**Decision:** **Yes.** All new crawler persistence writes to `web`. Do not add a
legacy compatibility writer or use AI Dream as an intermediary.

### 26. First implementation sequence

**Context:** Some routes already have complete database authorities; others
depend on the additions above.

**Question:** Once these decisions are answered, should implementation proceed
foundation-first rather than waiting for the entire long-term marketing/CMS
system?

**Recommendation:** **Yes.** Sequence:

1. finalize the missing core authorities and integrity rules;
2. seed the first analysis catalog and validate cost linkage;
3. build the Marketing shell, sites, pages, snapshots, and crawls;
4. add analysis/findings/links/screenshots/batches/cost;
5. add integrations and sync metrics;
6. add CMS/tasks/change workflows.

## Already settled — not being re-asked

- A site is owned by exactly one organization; cross-organization access uses a
  site permission grant.
- The same real-world domain may be independently managed by different
  organizations.
- The canonical page list is independent of crawl sessions and contains no
  observed body content.
- “Current content” is the latest accepted successful snapshot.
- Page-level external sharing is deferred; pages inherit site access.
- `respect_robots` is a normal site/run switch with recommended default `false`;
  its resolved value is frozen into every crawl session.
- Homepage metadata and screenshot bootstrap runs asynchronously after site
  creation.
- Organization-approved durable credentials are required for scheduled work;
  browser-local OAuth tokens are not an authority.
- The first CMS adapter targets the existing Matrx CMS while preserving an
  adapter boundary for WordPress and future CMSs.
- Screenshot capture is policy-driven rather than mandatory for every page in
  every crawl.
- Authenticated/staging crawling is deferred until a dedicated restricted
  credential design exists.
- Raw artifact retention defaults to indefinite until explicit tiering rules are
  approved; durable metadata/hashes/tombstones remain independently auditable.

## Approved service boundary

- Every historical, list, detail, score, finding, page, crawl, snapshot, link,
  integration, batch, and cost read is made directly from the browser to
  Supabase with the authenticated Supabase client and RLS.
- Pagination, filtering, sorting, aggregation, and view reads execute through
  Supabase/PostgREST/Postgres. They never execute through Python or AI Dream.
- The frontend sends crawl commands directly to the scraper/crawler service.
  AI Dream and Next.js API routes are not crawl-command intermediaries.
- The scraper's live NDJSON stream is the only scraper response rendered
  directly as data. It is transient progress, not the durable read authority.
- The scraper/worker persists durable crawl output into `web`; after or during
  persistence, ordinary product reads continue to come directly from Supabase.
