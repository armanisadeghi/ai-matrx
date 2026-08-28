---
status: active
updated: 2026-08-28
repos: [matrx-frontend]
scope: program
feature: Marketing
vision: []
---

# Marketing agency-model restructure

**What this is:** Rebuild the `/marketing` URL tree, nav, and breadcrumbs around the agency model — a small agency plane (roster, roll-ups, machinery, generic tools) plus everything else nested inside the client brand at `/marketing/[brandKey]/…`, with human-readable keys as the canonical addresses and every screen a real route.
**Scope:** Program
**Feature:** Marketing
**Vision:** VISION MISSING as a doc — but Arman's own words from the 2026-08-28 design session are quoted verbatim below and the ratified design is the "The Marketing Tree" artifact (Claude artifact `b24b3316-a67d-4229-b3f0-09c4d90f4cb9`; ask Arman to share/export it if unreachable).

## Vision — Arman's words (2026-08-28 session, verbatim)

- "The user here is assumed to be a marketing agency and the brand is one of their clients. Therefore, the only things that would live outside of the brand are things that have nothing to do with any one single client, brand, site, etc."
- "Brand is where all of the core assets should live. The company's media, brand guides, kits, locations, their offerings, and anything that has to do with that entire brand as a whole needs to live in one place."
- "For social media, a normal route would be: marketing/[brand-id]/socials/instagram/account-id/ or possibly without 'instagram'."
- "I also want to make sure that we completely annihilate the concept of tabs that do not have routes. … Everything will need to have a route for proper NextJS routing."
- "Realistically, you are not going to have enough brands that this will ever matter in the short term so a unique brand slug system-wide is fine."
- Ratified rulings: brand keys globally unique (auto-suffix colliders); site/account/location keys unique per brand; UUID URLs 308-forward to key URLs (also fix this back in the org-scope system); breadcrumb handling ported from the scope system.

## Resources

- Design (both trees, migration map, key rules, breadcrumb spec): the "The Marketing Tree" artifact above — read it FIRST; it is the spec.
- Nav source of truth: `features/marketing/lib/marketing-nav.ts` + `features/marketing/lib/route-sections.ts` + drift tests `features/marketing/__tests__/marketing-route-navigation.test.ts`, `route-sections.test.ts`.
- URL builders: `features/marketing/lib/routes.ts` (`marketingRoutes`) — add `segFor(entity) = slug ?? id` preference, mirroring `features/scope-system/utils/scopeRoutes.ts` `scopeSeg()`.
- Key system to mirror: `features/scope-system/utils/slugify.ts` (`toSlug`, `isValidSlug`, `RESERVED_SCOPE_SLUGS`), `features/organizations/service.ts` `getOrganizationBySlugOrId`, slug-availability via RPC never RLS-filtered select.
- Breadcrumb to port: `features/scope-system/components/ScopeBreadcrumb.tsx` (+ `MobileBreadcrumbDrawer`, `useBreadcrumbOrgOptions`) mounted from `app/(core)/organizations/[orgId]/layout.tsx`.
- Legacy shim pattern for moved routes: `app/(core)/marketing/sites/[siteId]/[...rest]/page.tsx`.
- DB: `web.brand.slug` (globally unique) + `web.site.slug` (unique per brand) — migration `migrations/marketing_brand_site_url_slugs.sql`. Reserved-word list lives in that migration; keep FE validation in lockstep.
- Marketing feature docs: `features/marketing/FEATURE.md` (1361 lines; update as routes move — its AI-visibility "cross-site home" claim is already stale).
- Admin map to regenerate at the end: `app/(core)/marketing/admin/page.tsx` (`MARKETING_ADMIN_MAP` routes[] is stale today).

## Remaining work (in order)

1. **Key plumbing (FE).** `features/marketing/lib/keys.ts`: slugify + reserved list (same array as the migration) + `isUuid` branch; brand resolver `getBrandBySlugOrId` (global) and site resolver (per brand); slug written at creation (`NewSiteForm`, brand create) with availability check via RPC; `segFor()` preference in `marketingRoutes`.
2. **Stand up the two-plane tree.** New `app/(core)/marketing/[brandId]/` (dual-mode segment; server layout resolves slug-or-id, 308s UUID→slug, provides brand context) with sections per the artifact: `identity/*`, `websites/[siteId]/*`, `socials/*` (coming-soon, full reserved depth), `locations/*`, `seo/[siteId]/*`, `content/*`, `ads/*` (coming-soon center; current Google Ads workspace folds in), `email/*`, `pr/*`, `intelligence/*`, `analytics/*`, `planning/*`, `inbox`, `settings`. Agency plane: `brands`, `reports`, `operations/*`, `tools/*`. Move section-by-section, leaving shims at old paths (existing shim pattern). Every coming-soon leaf = registered route per `lib/coming-soon/registry.ts` contract.
3. **Tabs → routes.** Convert every `?view=`/`?tab=`-switched screen to real routes as its section moves: content-plan views, site keywords views, site settings tabs, value settings, capabilities/search-console `?site=`, email front-door sections. Query params stay only for filters/selection.
4. **Breadcrumbs.** Port `ScopeBreadcrumb` into a marketing trail mounted in `[brandId]/layout.tsx`: Agency › Brand › Section › Entity › Item, each crumb a sibling switcher; mobile bottom-sheet reused. Demote `RouteModeNav` pills to sibling sub-views only.
5. **Nav reshape.** `marketing-nav.ts` pillars → the two planes/fourteen client sections; sidebar modes (agency / brand / site / seo) per the artifact §7; keep the drift tests green — they are the lockstep guard.
6. **Collapse duplicates last** (once each single home is live): `tools` pillar → agency `tools/analyzers`; `keyword-intelligence` + `keyword-research` → `seo/[siteId]/keywords`; orphaned `/marketing/ai-visibility` → `seo/[siteId]/ai-visibility`; `discovery/youtube` → agency `tools/youtube`; `calendar` (mislabeled GSC sweep) → `operations/connections`. Delete dead hubs per no-legacy.
7. **Finish line.** Regenerate the admin map; update `features/marketing/FEATURE.md` + Change Log; run `pnpm check:dead-ends`, `check:agent-disclosure`, nav drift tests, `pnpm type-check`.
8. **Back-port the canonical redirect to the org-scope system** (Arman-ratified fix): UUID segments 308 to slug URLs in `/organizations/[orgId]/scopes/…`, and `/scopes/s/[scopeId]` targets slug URLs.

Traps: shared checkout (commit per section with `--only`); brand keys must never collide with agency-plane static segments (reserved list); slug lookups must not rely on RLS-filtered selects for availability; alias ledger for renames ships WITH the rename affordance, not before (slugs immutable in UI until then).

## Done

- Design ratified by Arman — "The Marketing Tree" artifact (as-built tree, agency-model tree, key rules, breadcrumb spec, migration map).
- DB: `web.brand.slug` + `web.site.slug` added, backfilled, format-checked, unique-indexed — `migrations/marketing_brand_site_url_slugs.sql`.

## Decisions needed

- None open — key scoping, ID→key forwarding, and breadcrumb port were all ratified 2026-08-28.
