---
status: active
updated: 2026-08-19
repos: [matrx-frontend, aidream]
vision: [/Users/armanisadeghi/code/common-docs/projects/seo-engine/STATE.md]
---

# Marketing — Brand-first websites platform + coverage program

The websites-vertical work order: brands, sites, crawls, coverage, GSC, and the `web.*` access
model.

**Cluster state, Arman's merged vision, the verified numbers and the question ledger live in ONE
place:** [`common-docs/projects/seo-engine/STATE.md`](/Users/armanisadeghi/code/common-docs/projects/seo-engine/STATE.md).
Read it before taking anything here. His words for this vertical are STATE §2.2 (brands and sites)
and §2.3 (the access model, including the **retracted** "everyone gets full access to view"
misreading that must never be re-proposed).

Module shape / pillars is a sibling: [marketing-module.md](marketing-module.md).

## Resources

- **Access machinery:** policies come ONLY from `iam.apply_rls(schema, table, token, variant)` —
  never hand-write a `web` policy. Registry: `platform.entity_types` (`web_site`/`web_brand` =
  entity; the other ~23 `web` tables = `is_component=true`, `rls_variant='component'`) +
  `platform.entity_relationships`. Resolver: `iam.has_access_for_base` — a component recurses to
  its parent's access, and `visibility='public'` is a READ GRANT to any viewer, not a display flag.
- **Live coordination board (status + parking lot):** [docs/MARKETING_PROGRAM_BOARD.md](../MARKETING_PROGRAM_BOARD.md).
- **The live route contract is CODE:** `features/marketing/lib/routes.ts` + `route-sections.ts`,
  test-enforced against the filesystem. `docs/MARKETING_SITE_ROUTE_ARCHITECTURE.md` is HISTORICAL
  and site-first — do not build from it.
- [features/marketing/FEATURE.md](../../features/marketing/FEATURE.md) — authoritative; read before
  any code. Invariants: routes only via `lib/routes.ts`, statuses only via `lib/site-status.ts`,
  toast only via `@/lib/toast`, machine writes → `discovered_item` only, whole-row click.
- Data layer: `features/marketing/data/service.ts` (+`hooks.ts`) — follow its exact patterns.
- Scraper commands: `features/marketing/crawler/direct-client.ts`.
- Server twin: aidream `packages/matrx-scraper` — `web_crawl/sitemap_sync.py`, `service.py`,
  `web_crawl/FEATURE.md`.
- DB: schema `web` on `txzxabzwovsujtloxrus`. New-table recipe modeled in
  [migrations/web_sitemaps.sql](../../migrations/web_sitemaps.sql). ON CONFLICT arbiters must be
  plain (NULLS NOT DISTINCT) uniques — partial/expression indexes broke the scraper twice.
- Test login: `/login` admin@admin.com / Password1234#.

## Remaining work

The full ordered cluster list with evidence is STATE §4. This vertical owns:

1. 🔴 **`web.gsc_page_stat` is dead data and four readers still serve it** — see
   [gsc-page-stat-retirement.md](gsc-page-stat-retirement.md), whose urgency was raised 2026-08-19.
2. 🔴 **`/marketing/sites/[siteId]/cost` is a dead end** — the historical route doc promises it, no
   brand-first equivalent exists, and the legacy shim redirects into a 404.
3. **Audit FE queries for over-fetching** — pages should query only what they display.
   `AUDIT_PAGE_SIZE` range ~`:2419`; `gsc_page_stat` ordering ~`:636` pulls broadly.
4. **Social properties routes** — discovery promotion already creates typed `web.property` rows;
   remaining scope is the `brands/[id]/socials/...` route family from Arman's URL sketch.
5. **Undiagnosed crawl-persistence incident (2026-07-21)** — `canonical_crawl_persistence_error`
   on the titaniumsuccess crawl. If a fresh crawl reproduces neither symptom, close it.
6. **Screaming Frog parity, Wave 2 remainder.** *(Corrected 2026-08-19: (c) structured-data
   VALIDATION is **DONE** — `seo_audit.py:3862 check_structured_data_validity`; (e)'s **CrUX field
   data is DONE** — `performance.py:203-206`.)* Genuinely absent: **(d)** axe-core accessibility
   findings per snapshot (only a Lighthouse aggregate score exists), **(e2)** nav/paint lab timings
   harvested from our own render, and **(f)** rendered-vs-source comparison. Law: extend the
   snapshot/link evidence contracts, never fork a parallel store.
7. **Per-page analysis** — two of its four bugs are now fixed; see
   [per-page-analysis-stabilization.md](per-page-analysis-stabilization.md).
8. **`web.site_item_config` is 0 rows platform-wide** — per-site check configuration exists as a
   table and has never been used.
9. **`web.page` records crawled assets as pages** (365 image, 69 json, 47 xml) plus duplicate rows
   per URL. `searchPagesForMetaApply` works around it with a `content_type_last` filter.
10. **Human checks wanted (Arman or a human browser):** brand-move Radix Select click-through
    (`web.move_site_brand`); GSC columns/coverage cells eyeballed on a real site.
11. **EntityModeHeader / RouteModeNav overlap at ~1500–1700px** with Marketing's 13 modes — fix in
    the shared shell primitive, test with the marketing site shell.
12. **Access page grantee picker** — `/access` takes raw UUIDs; needs the platform user/org picker.
13. **Backlog:** GSC-submitted-sitemaps vs ours diff UI; external-link domain rollup UI;
    brand-level discovery inbox aggregation.
14. **Google OAuth / GA4 open threads** (last verified 2026-07-19, re-verify first): organization
    OAuth needs one production click-through; enable `analyticsadmin.googleapis.com` in GCP
    `34576215171`; verify reconnect/disconnect/revoke for personal and org connections across roles.
    GA4 *sync* and PageSpeed *history* as pipelines are aidream's, in `seo-vertical.md`.

## Done

Full verified list: STATE §3. Headlines: the brand-first platform through Wave 5, brand layer,
full CRUD, discovery promotion + pagination + bulk review, sitemaps, coverage matrix, link
resolution, page workspace, 10 crawl reports, site audit rollup, Copy/Copy-for-AI fleet-wide; THE
COMPONENT-ACCESS PRECEDENT (`iam.accessible_entity_ids`, 96 component tables regenerated, measured
15ms/8ms vs the 762ms per-row incident) and the tenant-isolation revert; the crawl robustness batch
and the deploy-cancelled auto-resume; redirect/canonical chain resolution; near-duplicate
fingerprints; dismissal memory; the per-page catalogue analysis workers (**68** checks, 79,397
results, 5,654 findings live).

## Settled — do not re-open

All five long-standing decisions were RULED 2026-08-08 and are recorded, with every other settled
ruling for this cluster, in STATE §5a: component RLS performance (THE COMPONENT-ACCESS PRECEDENT),
org-scoped `internal` visibility as the end state, captured-HTML content-hash dedupe, commissioning
the deterministic analysis workers, and the crawler-represents-REALITY dismissal rule. Item 3 (the
2026-07-21 org memberships) is Arman's housekeeping and sits in the STATE question ledger as Q9.
