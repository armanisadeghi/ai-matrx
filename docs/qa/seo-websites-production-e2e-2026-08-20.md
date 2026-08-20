# SEO and Websites production E2E — 2026-08-20

Production: `https://www.aimatrx.com`  
Fixtures: Cosmetic Injectables Medspa (`baa61391-286f-4143-81dc-226dfbc90358`), All Green Electronics Recycling (`d0aff5b6-7df7-4220-b978-f3a9ba15fb6d`), Titanium Success (`57711943-0c42-4281-bc1d-f045df8700a4`), and PBW Law (`1648a0d0-1ed1-45ed-bb5e-e83ea87cbf36`). The historical Broken Bridge Test fixture was confirmed as orphaned synthetic data and recoverably retired.

This pass exercised the production UI in a real authenticated browser. It did not treat route compilation, code inspection, or database rows as proof that a feature works.

## Command outcomes

| Surface and URL | Command | Terminal result |
|---|---|---|
| [Crawls](https://www.aimatrx.com/marketing/brands/13c6df9e-475e-4fa0-b7dc-2f4ba0001388/sites/baa61391-286f-4143-81dc-226dfbc90358/crawls/new) | Start crawl, one-page limit | Passed. Run `0c314efc-d44a-4d5b-9d51-349cc7f03007` completed with 1 fetched, 0 failed. Summary, URLs, reports, snapshots, logs, links, and all report tabs rendered the captured evidence. |
| [Site audit](https://www.aimatrx.com/marketing/brands/13c6df9e-475e-4fa0-b7dc-2f4ba0001388/sites/baa61391-286f-4143-81dc-226dfbc90358/audit) | Analyze now | Passed. Floating progress remained visible and the run completed: 321 pages × 68 checks, 1,000 fails, 1,802 warnings, 11,407 passes, 4,739 N/A, 2,802 findings refreshed. The previously reported endless Analyze spinner was not reproduced. |
| [Search Console integration](https://www.aimatrx.com/marketing/brands/c2db36a1-a6e7-4fdf-b6ea-3d472d8b2583/sites/d0aff5b6-7df7-4220-b978-f3a9ba15fb6d/settings/integrations) | Sync now | Passed. Live progress completed and the persisted last-sync value changed from Jul 28 to Aug 20, 12:11 PM. |
| [Backlinks](https://www.aimatrx.com/marketing/brands/b2a81958-f4af-4a02-9a33-85ef40454641/sites/57711943-0c42-4281-bc1d-f045df8700a4/backlinks) | Refresh with complete history | Passed. Returned to idle with last checked Aug 20 and approximately 1.6K links / 439 domains. |
| [Backlinks](https://www.aimatrx.com/marketing/brands/b2a81958-f4af-4a02-9a33-85ef40454641/sites/57711943-0c42-4281-bc1d-f045df8700a4/backlinks) | Review next 5 | Passed. Reviewed count moved 1,524 → 1,529 and waiting moved 394 → 389. |
| [AI visibility](https://www.aimatrx.com/marketing/brands/13c6df9e-475e-4fa0-b7dc-2f4ba0001388/sites/baa61391-286f-4143-81dc-226dfbc90358/ai-visibility) | Analyze a real local-medspa query | Partial/failure surfaced honestly. Provider answers appeared, but ChatGPT and Claude ended as “Analysis incomplete”; live progress was available. |
| [Rank portfolio](https://www.aimatrx.com/marketing/brands/b2a81958-f4af-4a02-9a33-85ef40454641/sites/57711943-0c42-4281-bc1d-f045df8700a4/ranks) | Check now | Repaired and production-verified in `v0.4.915`. The row now exposes live stage, a persistent exact failure with Retry, or a persistent success state. The production command reached `Check complete`. Feedback `30b3decb-74e7-4c55-aaf1-09652c331d6f` resolved/pass. |
| [Authority](https://www.aimatrx.com/marketing/brands/13c6df9e-475e-4fa0-b7dc-2f4ba0001388/sites/baa61391-286f-4143-81dc-226dfbc90358/authority) | Map authority routes | Repaired and production-verified on backend `9183c53f8`. The provider conflict is gone; the command completed and persisted a populated authority-route table with source, target, anchor, placement, rationale, benefit, priority, risk, evidence, and working page doors. Feedback `df449603-3a72-45cb-99ed-c84ffda70660` resolved/pass. |
| [Reputation](https://www.aimatrx.com/marketing/brands/13c6df9e-475e-4fa0-b7dc-2f4ba0001388/sites/baa61391-286f-4143-81dc-226dfbc90358/reputation) | Run intelligence | Passed. A persisted brief rendered after reload with 3 accepted cases, 6 excluded cases, 1 publication opportunity, confidence 78, evidence links, limitations, and action doors. |
| Public [page audit](https://www.aimatrx.com/seo/page-audit), [robots tester](https://www.aimatrx.com/seo/robots-tester), and [structured data](https://www.aimatrx.com/seo/structured-data) | Run against `cosmeticinjectables.com` | Reached an honest terminal refusal before a paid provider call because caller daily SEO spend was `$1.057565 / $1.00`. The surfaces did not spin or silently fail. |

The production workflow worker was live at the end of the pass. The original recent-run feed independently recorded the authority failure; after the repair deployed, the same production command completed and rendered the persisted map.

## Route inventory exercised

| Cluster | URLs exercised and what rendered |
|---|---|
| Public SEO | `/seo`, `/seo/page-audit`, `/seo/robots-tester`, `/seo/metadata`, `/seo/structured-data`, `/seo/social-preview`, `/seo/ai-visibility`. All six tools and the index loaded; paid commands stopped explicitly at the daily budget gate. |
| Marketing hubs | `/marketing`, `/marketing/brands`, `/marketing/sites`, `/marketing/tools`, `/marketing/competitors`, `/marketing/search-console`, `/marketing/ranks`, `/marketing/cost`, `/marketing/ads`, `/marketing/ai-visibility`, `/marketing/analytics`, `/marketing/audience`, `/marketing/automations`, `/marketing/backlink-valuation`, `/marketing/calendar`, `/marketing/capabilities`, `/marketing/connections`, `/marketing/connections/google`, `/marketing/connections/bing`, `/marketing/content-plan`, `/marketing/content-studio`, `/marketing/email`, `/marketing/initiatives`, `/marketing/keyword-research`, `/marketing/local`, `/marketing/monitoring`, `/marketing/outreach`, `/marketing/pr`, `/marketing/reports`, `/marketing/social`, `/marketing/discovery/youtube`, `/marketing/admin`, `/marketing/admin/keyword-data-quality`, `/marketing/sites/new`. All loaded or redirected intentionally. `/marketing/cost` had a production numeric-shape crash; repaired locally from the generated API contract. |
| Brand cockpit | Brand root plus `/assets` and `/discovery` loaded for Cosmetic Injectables. |
| Site command/content | Site root, `/growth-loop`, `/pages`, `/structure` and its column views, `/sitemaps`, `/coverage`, `/media`, `/media/videos`, `/media/standards`, `/crawls`, `/crawls/new`. Real data rendered. |
| Health/search | `/audit`, `/findings`, `/analysis`, `/performance`, `/changes`, `/changes?view=untracked`, `/keywords`, `/keywords?view=classification`, `/ranks`, `/ai-visibility` and its `claims`, `sources`, `signals`, `history`, and `panels` views. Rich data loaded; command exceptions are recorded above. |
| Links/reputation | `/backlinks` and `links`, `changes`, `coverage`, `domains`, `anchors`, `pages`, `competitors`, `prospects`, `insights`; `/links` with external/plan/table views; `/authority` with routes/evidence; `/reputation` with cases/publications/narratives/evidence. Backlink subviews hydrated slowly but rendered real rows. Prospects honestly showed 12 competitors waiting and 0 confirmed. |
| Settings/access | `/settings`, `/settings/integrations`, `/settings/access-users`, `/settings/access-organizations`, `/settings/access-public`, `/settings/intake`. All loaded. |
| Record detail doors | A canonical page detail, its snapshot history and snapshot detail, a finding detail, a sitemap detail, and the new crawl detail with every tab/report view. Page, crawl, site, source, and finding doors opened. |

## Empty-state checks

PBW Law was deliberately used as a valid low-data site. Crawls showed “No crawl sessions”; audit showed 0/0 with “never analyzed” and a usable Analyze action; analysis, findings, keywords, and backlinks showed explicit absence/next-step states rather than blank panels. The known zero-row `assertFound` deletion message was not reproduced on these tested empty surfaces.

Broken Bridge Test exposed historical data drift: a synthetic live site pointed at a soft-deleted brand. Current site-creation and brand-deletion guards already prevent the state. The orphaned synthetic site was recoverably soft-deleted, disappeared from the live portfolio, and feedback `4c2e4288-4c87-4174-b8ab-4174e661b693` was resolved/pass.

## Door and mobile defects

- Backlink overview domain and competitor names were inert while the full table already supplied a safe external-domain door. Repaired by extending that existing behavior. Feedback `c1c292fe-0702-4345-a803-931fdf1f3a9b`.
- The backlinks workspace mobile defect was repaired with a single touch-sized, horizontally scrollable command strip and the canonical global mobile assist control. Production `v0.4.915` passed at 375 × 812 with real data and every command reachable. Feedback `9094351e-8dfc-495b-8d9b-c9579e466568` resolved/pass.
- Duplicate review-backlog assists now use one stable site-scoped identity while event/count details refresh in place. A regression proves count changes do not create parallel conditions; the stale contradictory live row was resolved. Feedback `be3a064c-140c-4289-881e-4742952dd2c5` resolved/pass after production verification.
- Legacy `/marketing/sites/[siteId]/cost` redirected into a brand-first 404. The compatibility route now sends exact `cost` bookmarks to the canonical marketing cost page. Feedback coverage is represented by the repair and production issue `f9a739f3-42ba-4edb-b054-fb31ddd4be33` for the cost surface crash.

## Surface readiness checks

`pnpm check:surface-drift` passed for 184 surfaces, 4,402 values, and 372 write targets. `pnpm check:surface-routes` found 19 undeclared routes, none in the marketing/SEO cluster. Verified marketing manifests were compared to browser behavior. Rank and authority readiness are now production-verified.

## Repairs made during the pass

- `features/marketing/data/spend.ts`: parse the generated OpenAPI decimal-string spend contract once at ingress and reject malformed payloads, preventing `pct_used.toFixed` production crashes.
- `features/marketing/data/spend.test.ts`: contract conversion and malformed-value coverage.
- `features/marketing/components/backlinks/BacklinksWorkspace.tsx`: make overview domain/competitor identities external doors using the established full-table fallback.
- `app/(core)/marketing/sites/[siteId]/[...rest]/page.tsx`: preserve legacy site cost bookmarks by redirecting to the canonical cost route.
- `features/marketing/components/ranks/RanksWorkspace.tsx`: persist checking stages, exact terminal errors with Retry, and terminal success at the row where the command was invoked.
- `features/marketing/components/backlinks/BacklinksWorkspace.tsx` and `BacklinksAssistStrip.tsx`: restore the mobile workspace without duplicating the assist surface.
- `features/marketing/components/backlinks/backlinks-assists-producer.ts`: give the review backlog a stable site-scoped dedupe identity and refresh changing evidence in place.
- `packages/matrx-ai/matrx_ai/providers/unified_client.py` in aidream: generically reconcile provider tool/structured-output conflicts while preserving the machine-consumed output contract and emitting a loud capability adjustment.

Frontend repairs are integrated and shipped in production release `v0.4.915`; the rank, backlink mobile, assist, cost, and overview-door repairs were browser-retested there. The authority provider repair shipped in aidream production version `9183c53f84417d4e11907e248a29297a6658e8f8` and the real command completed with a persisted route map.

## Reusable procedure

The feature-agnostic discovery, execution, repair, deployment, and reporting prompt produced from this run is canonical at [`common-docs/policies/feature-production-e2e.md`](../../../common-docs/policies/feature-production-e2e.md). It accepts a feature name and optional route hint, discovers the inventory itself, and explicitly forbids treating code inspection or a successful deployment as browser proof.
