# SEO and Websites production E2E — 2026-08-20

Production: `https://www.aimatrx.com`  
Fixtures: Cosmetic Injectables Medspa (`baa61391-286f-4143-81dc-226dfbc90358`), All Green Electronics Recycling (`d0aff5b6-7df7-4220-b978-f3a9ba15fb6d`), Titanium (`57711943-71b7-4208-9f84-4804f78e771d`), PBW Law (`1648a0d0-1ed1-45ed-bb5e-e83ea87cbf36`), Broken Bridge Test (`42824fac-882c-4fc8-a2bd-e0d8ed57d5f8`).

This pass exercised the production UI in a real authenticated browser. It did not treat route compilation, code inspection, or database rows as proof that a feature works.

## Command outcomes

| Surface and URL | Command | Terminal result |
|---|---|---|
| [Crawls](https://www.aimatrx.com/marketing/brands/13c6df9e-475e-4fa0-b7dc-2f4ba0001388/sites/baa61391-286f-4143-81dc-226dfbc90358/crawls/new) | Start crawl, one-page limit | Passed. Run `0c314efc-d44a-4d5b-9d51-349cc7f03007` completed with 1 fetched, 0 failed. Summary, URLs, reports, snapshots, logs, links, and all report tabs rendered the captured evidence. |
| [Site audit](https://www.aimatrx.com/marketing/brands/13c6df9e-475e-4fa0-b7dc-2f4ba0001388/sites/baa61391-286f-4143-81dc-226dfbc90358/audit) | Analyze now | Passed. Floating progress remained visible and the run completed: 321 pages × 68 checks, 1,000 fails, 1,802 warnings, 11,407 passes, 4,739 N/A, 2,802 findings refreshed. The previously reported endless Analyze spinner was not reproduced. |
| [Search Console integration](https://www.aimatrx.com/marketing/brands/c2db36a1-a6e7-4fdf-b6ea-3d472d8b2583/sites/d0aff5b6-7df7-4220-b978-f3a9ba15fb6d/settings/integrations) | Sync now | Passed. Live progress completed and the persisted last-sync value changed from Jul 28 to Aug 20, 12:11 PM. |
| [Backlinks](https://www.aimatrx.com/marketing/brands/b2a81958-bde7-4603-83b6-41275ac95602/sites/57711943-71b7-4208-9f84-4804f78e771d/backlinks) | Refresh with complete history | Passed. Returned to idle with last checked Aug 20 and approximately 1.6K links / 439 domains. |
| [Backlinks](https://www.aimatrx.com/marketing/brands/b2a81958-bde7-4603-83b6-41275ac95602/sites/57711943-71b7-4208-9f84-4804f78e771d/backlinks) | Review next 5 | Passed. Reviewed count moved 1,524 → 1,529 and waiting moved 394 → 389. |
| [AI visibility](https://www.aimatrx.com/marketing/brands/13c6df9e-475e-4fa0-b7dc-2f4ba0001388/sites/baa61391-286f-4143-81dc-226dfbc90358/ai-visibility) | Analyze a real local-medspa query | Partial/failure surfaced honestly. Provider answers appeared, but ChatGPT and Claude ended as “Analysis incomplete”; live progress was available. |
| [Rank portfolio](https://www.aimatrx.com/marketing/brands/13c6df9e-475e-4fa0-b7dc-2f4ba0001388/sites/baa61391-286f-4143-81dc-226dfbc90358/ranks) | Check now | Failed silently. After 35+ seconds the button returned to idle, the row still said “Not ranked / never checked,” and no progress, result, or error appeared. Feedback `30b3decb-74e7-4c55-aaf1-09652c331d6f`. |
| [Authority](https://www.aimatrx.com/marketing/brands/13c6df9e-475e-4fa0-b7dc-2f4ba0001388/sites/baa61391-286f-4143-81dc-226dfbc90358/authority) | Map authority routes | Failed visibly: `Cerebras rejected the request: "tools" is incompatible with "response_format"`. No map was calculated. Feedback `df449603-3a72-45cb-99ed-c84ffda70660`. |
| [Reputation](https://www.aimatrx.com/marketing/brands/13c6df9e-475e-4fa0-b7dc-2f4ba0001388/sites/baa61391-286f-4143-81dc-226dfbc90358/reputation) | Run intelligence | Passed. A persisted brief rendered after reload with 3 accepted cases, 6 excluded cases, 1 publication opportunity, confidence 78, evidence links, limitations, and action doors. |
| Public [page audit](https://www.aimatrx.com/seo/page-audit), [robots tester](https://www.aimatrx.com/seo/robots-tester), and [structured data](https://www.aimatrx.com/seo/structured-data) | Run against `cosmeticinjectables.com` | Reached an honest terminal refusal before a paid provider call because caller daily SEO spend was `$1.057565 / $1.00`. The surfaces did not spin or silently fail. |

The production workflow worker was live at the end of the pass. The recent-run feed independently recorded the authority run as failed with `mandate:seo.site_link_authority_router_failed` and the same Cerebras incompatibility.

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

Broken Bridge Test is listed in `/marketing/sites`, but every brand-first destination fails at the parent brand with “We couldn’t load this brand” while simultaneously saying the user has access. This makes the listed site unreachable. Feedback `4c2e4288-4c87-4174-b8ab-4174e661b693`.

## Door and mobile defects

- Backlink overview domain and competitor names were inert while the full table already supplied a safe external-domain door. Repaired by extending that existing behavior. Feedback `c1c292fe-0702-4345-a803-931fdf1f3a9b`.
- The backlinks workspace at 375 × 812 is not usable: command/assist chrome consumes the viewport and the data table is clipped to fragments. This confirms known `TASK-BL-UI-C`; no backlinks UI feature work was undertaken.
- Backlinks displayed duplicate assists and contradictory live counts because the assist event key changes with the count. Feedback `be3a064c-140c-4289-881e-4742952dd2c5`; not changed because dismissal semantics require a product decision.
- Legacy `/marketing/sites/[siteId]/cost` redirected into a brand-first 404. The compatibility route now sends exact `cost` bookmarks to the canonical marketing cost page. Feedback coverage is represented by the repair and production issue `f9a739f3-42ba-4edb-b054-fb31ddd4be33` for the cost surface crash.

## Surface readiness checks

`pnpm check:surface-drift` passed for 184 surfaces, 4,402 values, and 372 write targets. `pnpm check:surface-routes` found 19 undeclared routes, none in the marketing/SEO cluster. Verified marketing manifests were compared to browser behavior; the authority manifest is not production-ready while its primary command has the provider mismatch above, and the rank surface is not production-ready while its row command can fail silently.

## Repairs made during the pass

- `features/marketing/data/spend.ts`: parse the generated OpenAPI decimal-string spend contract once at ingress and reject malformed payloads, preventing `pct_used.toFixed` production crashes.
- `features/marketing/data/spend.test.ts`: contract conversion and malformed-value coverage.
- `features/marketing/components/backlinks/BacklinksWorkspace.tsx`: make overview domain/competitor identities external doors using the established full-table fallback.
- `app/(core)/marketing/sites/[siteId]/[...rest]/page.tsx`: preserve legacy site cost bookmarks by redirecting to the canonical cost route.

The repairs were independently integrated into `main` during this shared-checkout pass (`e06da74e6` and `77e60a919`; the spend parser/test are present in current `main`). They are local/current-main facts, not claims that the production deployment already contains them.
