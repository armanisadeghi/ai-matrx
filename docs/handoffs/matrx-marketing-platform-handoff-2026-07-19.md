# Matrx Marketing Site Platform — Handoff

Date: 2026-07-19  
Repository: `/Users/armanisadeghi/code/matrx-frontend`  
Production Supabase project: `txzxabzwovsujtloxrus`  
Primary schema: `web`

## Objective

Continue the Marketing Site Platform as a dense, desktop-first agency workspace for managing many client websites. The stable hierarchy is site → stable page identities, while crawl sessions and immutable snapshots remain separate evidence. Integrations, analysis, findings, screenshots, costs, tasks, and CMS operations attach to the stable site/page identities.

## Non-negotiable architecture

- `web.site` is the only access root. Children derive access through `site_id`; do not create platform association/reachability rows for `web` components.
- `web.page` is canonical URL identity plus user intent only. Captured content belongs to immutable `web.snapshot`; “current content” is `page.latest_snapshot_id`.
- `web.crawl_session` is one run. Its encountered URLs/outcomes are not the canonical page registry.
- Results are immutable measurements; findings are durable lifecycle state and the dashboard/work-queue authority.
- All persisted product reads are browser → Supabase, directly, under the caller JWT and RLS. Pagination/filtering/sorting are direct PostgREST/Postgres operations.
- Python/scraper never serves stored product data. The browser talks directly to the scraper only for commands and the transient live NDJSON stream; the scraper writes durable rows to Supabase.
- AI Dream is not a crawler intermediary.
- Google OAuth command routes may exchange/revoke secrets server-side. Connection/resource lists and site bindings are direct Supabase reads.
- No legacy crawler data is migrated, remapped, exposed, or archived.
- `respect_robots` remains a switch and defaults false for this first-party/authorized crawling product.

Authoritative decision and architecture references:

- `/Users/armanisadeghi/code/matrx-frontend/docs/MARKETING_SITE_DECISION_REGISTER.md`
- `/Users/armanisadeghi/code/matrx-frontend/docs/MARKETING_SITE_PLATFORM_PLAN.md`
- `/Users/armanisadeghi/code/matrx-frontend/docs/MARKETING_SITE_ROUTE_ARCHITECTURE.md`
- `/Users/armanisadeghi/code/matrx-frontend/features/marketing/FEATURE.md`

## Implemented foundation

- `/marketing` product namespace, main-menu Marketing Hub entry, portfolio, add-site flow, site shell, overview, pages, snapshots, crawls, analysis, findings, links, screenshots, access, settings, integrations, batches, and cost routes.
- Friendly site input normalization (`example.com` → HTTPS URL), asynchronous homepage bootstrap, screenshot retry/progress, durable screenshot rendering, and overview presentation.
- Standard controlled `MatrxDataTable` usage with direct Supabase range/filter/sort/count queries.
- Direct authenticated scraper commands and transient NDJSON progress; durable crawl URL and event history comes from Supabase.
- Site/page/crawl/snapshot separation, crawl URL ledger, page evidence, crawl schedule authority, analysis/findings inspection, links/screenshots inspection, site sharing, settings, batch monitoring, and cost projections.
- Reusable user/org Google connection model, encrypted refresh credentials, discovered Search Console and GA4 resources, PageSpeed app configuration, and site property selectors.
- Google popup OAuth reuses the existing canonical `GoogleAPIProvider`; no parallel redirect/callback implementation remains.

Relevant commits:

- `ec61ecb4e` — reuse canonical Google OAuth provider.
- `87948a85a` — use the server-side Google client ID and canonical organization-admin authority.

## Current Google OAuth fix

Two production causes were found:

1. Server token exchange read only `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, even though production has the proper server alias `GOOGLE_CLIENT_ID`. The server now prefers `GOOGLE_CLIENT_ID` and retains the public variable only as a local/dev fallback.
2. Org authorization queried every membership in the organization and required one row. An org owner with many project memberships therefore failed `maybeSingle()`. The route now calls canonical `public.is_org_admin_for(user_id, org_id)` via the service-role client.

Production inspection then found that `GOOGLE_CLIENT_ID` was an obsolete/mismatched value and `GOOGLE_CLIENT_SECRET` was empty. The complete local credential was verified to belong to the same OAuth client as production's valid `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, then the production server ID and secret were corrected in Vercel and redeployed. Personal OAuth subsequently completed in production, wrote a durable connection, discovered 33 Search Console properties, and preselected the matching site property. Never put the secret in a `NEXT_PUBLIC_*` variable or return it to the browser. Preview/development Google server-variable values still need a separate environment audit before relying on those deployments.

The personal connection is `needs_attention` only because Google reports that `analyticsadmin.googleapis.com` is disabled for the OAuth application's Google Cloud project. Enable the Google Analytics Admin API in project `34576215171`, then reconnect or add a resource-refresh command so GA4 properties are discovered. Search Console OAuth/discovery is working.

Do not replace the canonical permission function with another hand-written membership interpretation.

## Pending work

### P0 — verify and stabilize what is already exposed

- Organization OAuth still needs one final production click-through after deployment `87948a85a`. The canonical permission function returns true for the affected site owner, but browser control was interrupted on Google's final Continue screen; no org connection row was written, so do not mark this path E2E-complete yet.
- Enable `analyticsadmin.googleapis.com` in Google Cloud project `34576215171`, then reconnect/refresh the existing personal connection and verify GA4 property discovery. Search Console is already verified with 33 discovered properties.
- Verify reconnect/disconnect/revoke behavior for both personal and organization connections.
- Verify the organization flow against owner, admin, ordinary member, personal organization, and site shared from another organization. Unauthorized users should receive a clear action-oriented message.
- Measure homepage capture end-to-end latency. The UI is now visual, but the reported 45+ second wait needs timing broken into command acceptance, browser capture, storage write, Supabase persistence, and UI invalidation. Set a practical progress/timeout/retry contract.
- Run an end-to-end real crawl and verify: direct scraper request, JWT authorization, live events, cancellation, durable `crawl_session`/`crawl_url`/`crawl_event`/`snapshot` rows, canonical-page reconciliation, screenshot display, and reload entirely from Supabase.
- Resolve unrelated repository-wide TypeScript failures currently blocking a clean `tsc --noEmit` gate (context-menu note fixtures and context-lab create callback return types). Marketing's changed OAuth files pass formatting and focused ESLint.
- Add focused automated coverage for Google exchange authorization, missing/mismatched deployment credentials, token-exchange errors, refresh-token preservation on reconnect, connection uniqueness, resource discovery failures, and disconnect/revoke.

### P1 — integrations become operational data pipelines

- Add the approved canonical integration authorities instead of relying on `site.integrations` JSON as the durable source: `web.integration_binding`, `web.integration_sync`, and typed metric facts/views for provider/date/site/page dimensions. Create new `web` tables through `web.conform(...)` and verify with `iam.verify_canonical(...)`.
- Implement scheduled and manual GSC synchronization: sites/properties, search analytics by page/query/date/device/country, index/sitemap evidence, sync cursor/window, partial failures, quotas, and history.
- Implement scheduled and manual GA4 synchronization: account/property binding, page/location mapping to canonical pages, typed daily metrics, sync cursor/window, partial failures, and history.
- Implement PageSpeed execution and metric history rather than configuration alone. Store normalized field/lab metrics and analysis evidence; preserve raw payloads through approved artifact/kind-instance references.
- Build connection health and sync history UI: last verified/synced, scopes, expiry/revocation, reconnect required, partial-resource errors, manual sync, scheduled sync, and per-run logs.
- Add additional providers only through reusable connections plus site bindings. Bing and custom provider inputs currently do not constitute a complete authenticated sync product.
- Define org connection governance beyond create: who may view metadata, bind a connection, run a sync, reconnect, disconnect, and transfer/replace the credential.

### P1 — crawl/reconciliation operations

- Build crawl scheduling UI and connect `web.crawl_schedule` to the canonical scheduler/worker. Freeze resolved options into each created crawl session.
- Make reconciliation actionable and auditable: accept/reject newly discovered canonical URLs, explain misses/exclusions, enforce coverage-qualified missing transitions, apply repeated-miss/410 gone policy, and expose page-evidence history.
- Add `/marketing/sites/[siteId]/crawls/[crawlId]/findings`.
- Add comparison views between crawl sessions and snapshot/content changes over time.
- Complete current-link graph projection. Historical `link_edge` rows remain immutable; resolve the accepted current graph without rewriting historical evidence. Add broken-link, redirect-chain, orphan, anchor, and internal-link opportunity workflows.
- Add crawl policies for sitemap seeds, explicit URL sets, include/exclude patterns, limits, rendering, screenshot sampling, authentication (deferred until restricted credential design exists), and predictable robots switch behavior.

### P1 — analysis, AI, and cost execution

- Build the shared analysis catalog routes: `/marketing/analysis/items`, `/new`, `/[itemId]`, and `/marketing/analysis/providers`.
- Expose category → subcategory → item browsing, fixed 1–100 contracts, weights, severity maps, payload kind definitions, provider bindings, and per-site `site_item_config` enablement/cadence/config.
- Validate and surface the seeded built-in item/provider catalog; deterministic checks should be operational before premium/AI checks.
- Implement deterministic analysis workers that convert crawl/snapshot/link/performance evidence into normalized immutable `analysis_result` rows and maintain finding lifecycle state.
- Implement AI text and vision batch workers for stored page content/screenshots. Include batch submission, polling/callbacks, retries, partial failure, payload validation, confidence, prompt/model/provider versioning, and inexpensive batch-model routing.
- Every batch-item execution must set `runtime.global_execution.link_kind='web_batch_item'` and `link_id=<batch_item.id>` so all cost views populate. Prove this with one real non-zero execution across item/run/page/site/client rollups.
- Add finding mutations and audit history: acknowledge, suppress/unsuppress with reason, resolve, reopen, assignment/task creation, bulk actions, and false-positive handling. Suppressed findings stay excluded from score/priority.
- Build cross-site `/marketing/analysis` and `/marketing/findings` agency queues with organization/client/site filters and stable deep links.
- Version the displayed scoring contract so historical score trends remain comparable when catalog weights/providers change.

### P1 — CMS and marketing operations

- Add approved authorities without placing authored content on `web.page` or observations in CMS rows: CMS binding, change set, change item, and typed task binding to the existing task system.
- Implement the Matrx CMS adapter first, retaining an adapter boundary for WordPress and later CMSs.
- Page workspace needs current observed content beside target keyword, desired metadata, tasks, proposed/scheduled changes, approvals, publishing, rollback, and post-publish verification.
- Add organization/team workflow: assignee, due date, status, comments/activity, approvals, batch change sets, publication schedule, and client-visible audit trail.
- Connect analysis findings to recommended changes and tasks without letting AI mutate/publish content without explicit workflow authority.

### P2 — agency UX and product completeness

- Upgrade the portfolio with health trend, last crawl, open finding counts, integration/sync health, crawl freshness, client grouping, and bulk actions.
- Add cross-site reporting/export, comparison periods, client-ready views, alerts/notifications, and saved filters.
- Finish dense desktop UX review across every route; preserve full-width workspaces, sticky headers, official table behavior, URL-owned table state, clear empty/error/loading states, and useful drawers/window panels.
- Complete mobile adaptation without compromising desktop density; then run keyboard, screen-reader, contrast, focus, reduced-motion, and large-dataset performance passes.
- Add realtime invalidation where it materially improves persisted crawl/sync/batch progress, while Supabase remains the authority and transient streams never become history APIs.
- Add observability and operational dashboards for crawler capacity, queue delay, sync quota/rate limits, batch failures, storage usage, screenshot failures, and per-client cost.
- Define retention/tiering for raw bodies, screenshots, snapshot artifacts, metrics, and AI payloads. Current approved default is indefinite retention until a policy exists.

## Route gaps

The implemented route tree is recorded in `features/marketing/FEATURE.md`. Known approved missing routes are:

- `/marketing/sites/[siteId]/crawls/[crawlId]/findings`
- `/marketing/analysis`
- `/marketing/analysis/items`
- `/marketing/analysis/items/new`
- `/marketing/analysis/items/[itemId]`
- `/marketing/analysis/providers`
- `/marketing/findings`

`/marketing/connections` now exists, though its sync health/history and full operational lifecycle remain pending.

## Validation checklist for each vertical

1. Confirm persisted reads go directly through the browser Supabase client; reject Python, AI Dream, or Next.js data-read proxies.
2. Confirm every child query is scoped to `site_id` plus its resource ID and RLS derives through the site root.
3. Use official `MatrxDataTable` controlled mode for deep/tabular data.
4. Run focused unit/integration tests, TypeScript, lint/format, Supabase security/performance advisors after DDL, and production browser testing.
5. Test adversarial cases: wrong-site IDs, revoked grants, duplicate/partial streams, partial crawls, stale snapshots, token expiry/revocation, sync quotas, provider failure, batch retries, and cross-org sharing.
6. Update `features/marketing/FEATURE.md` and the route/status docs so “implemented,” “configured,” and “operational” are never conflated.

## Suggested skills

- `supabase` for database, RLS, Auth, Realtime, migrations, generated types, and direct-client work.
- `supabase-postgres-best-practices` when adding integration/metric/CMS tables, views, indexes, rollups, and high-volume queries.
- `browser:control-in-app-browser` or `chrome:control-chrome` for authenticated production UX and end-to-end testing.
- `handoff` when transferring the work again so the architecture constraints and live/pending distinction remain intact.

## Immediate next execution order

1. Finish production OAuth verification and close any remaining P0 defects.
2. Implement canonical integration binding/sync/metric authorities.
3. Deliver GSC sync end-to-end, then GA4, then PageSpeed history.
4. Deliver scheduling and reconciliation actions.
5. Deliver deterministic analysis, catalog/config UI, findings actions, then AI/vision batches with proven cost links.
6. Deliver CMS/tasks/change/publish workflow.
7. Finish agency-wide queues/reporting and hardening.
