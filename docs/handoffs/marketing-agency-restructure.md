---
status: active
updated: 2026-08-30
repos: [matrx-frontend]
scope: program
feature: Marketing
vision: []
---

# Marketing agency-model restructure

**What this is:** The `/marketing` tree was rebuilt around the agency model — small agency plane + everything nested in the client brand at `/marketing/[brandKey]/…` with dual-mode key/UUID addresses; this handoff carries the follow-ups that finish the edges.
**Scope:** Program
**Feature:** Marketing
**Vision:** VISION MISSING as a doc — Arman's verbatim rulings (2026-08-28 session) are quoted in `features/marketing/FEATURE.md` § THE AGENCY MODEL and the ratified design is the "The Marketing Tree" artifact (Claude artifact `b24b3316-a67d-4229-b3f0-09c4d90f4cb9`).

## Resources

- **The shipped system**: `features/marketing/FEATURE.md` § THE AGENCY MODEL (planes, address system, registries, drift tests) — read it first; this doc lists only what remains.
- Spine: `features/marketing/lib/{keys.ts,keys-server.ts,brand-context.tsx,routes.ts,brand-sections.ts,route-sections.ts,marketing-nav.ts,sidebar-site-context.ts,legacy-marketing-urls.ts}` · sidebar `components/shell/MarketingSidebarMenu.tsx` · crumb `components/brand/MarketingBrandCrumb.tsx`.
- DB: `migrations/marketing_brand_site_url_slugs.sql` (reserved-word list is the FE lockstep twin in `lib/keys.ts`).
- Tests (all green): `route-sections.test.ts`, `marketing-route-navigation.test.ts`, `marketing-nav.test.ts`, `sidebar-site-context.test.ts`, `route-metadata.test.ts`, `site-subviews.test.ts`, `site-subnav.test.ts`.

## Remaining work (in order)

0. **Adversarial audit CLOSED 2026-08-30** — three Sonnet sweeps (105-page loss audit, orphan hunt, nav/tabs audit) found six defects; all six repaired same day: KeywordIntelligenceHub re-doored as the brand SEO overview (its `LIST_STATE` was silently broken pre-restructure — `columnFilters` fixed), OutreachFrontDoor mounted at `[brandId]/pr/outreach` (+ sidebar row), site-less Search Console / Capabilities landings restored (`reports/search-console`, `operations/capabilities`), Reputation site shell branch-aware (pills + non-jumping switcher), Keyword Value family carries its own routed pills, keywords pills path-style with a declared Research view. Also same-route brand switching (`lib/brand-switch.ts`) and anon hardening (42501-tolerant resolvers; signed-out deep brand links → `/login?redirectTo=`). Remaining below is unchanged.

1. **Back-port ID→key canonicalization to the org-scope system** (Arman-ratified): UUID segments 308 to slug URLs across `/organizations/[orgId]/scopes/…`, and `/scopes/s/[scopeId]` emits slug segments. Mirror `features/marketing/lib/keys-server.ts` + the `CanonicalSegment` client helper.
2. **aidream/ORM brand+site creates don't stamp slugs** — a brand created server-side lands with `slug NULL` (seen live 2026-08-29) and falls back to UUID addresses. Port the FE's `insertWithSlug` rule (slugify name, reserved-word suffix, collision suffix) into aidream's create paths, then run a NULL-slug backfill sweep (the migration's DO-block is rerunnable).
3. **Sweep `${sitePath}` composition to `marketingRoutes`.** `MarketingSiteContext.sitePath` is now the BRANCH base; ~130 call sites compose `${sitePath}/<section>` and cross-branch ones ride the `[...rest]` mappers (one 308 hop). Replace with `marketingRoutes.site(brandId, siteId, sub)` (maps directly via `MARKETING_SITE_SECTION_HOMES`) as files are touched; then delete the two `[...rest]` mappers.
4. **Brand-scope the org-wide mounts**: `[brandId]/websites` (SitesPortfolio), `content/plan` (PlanSitesList), `planning/initiatives`, `email`, `pr`, `intelligence/monitoring` all mount org-wide components with a NOTE comment; thread a brand filter through each.
5. **FEATURE.md deep sections** (Entry points / flows tables, ~L200–580) still show pre-restructure URL examples — they all redirect, but sweep them to the new addresses.
6. **Rename affordance + alias ledger**: brand/site keys are immutable in UI until renames ship WITH the alias table + 308s (ratified rule; don't build the ledger before the affordance).
7. **Socials/Ads build-out**: reserved structure is live (`socials` coming-soon; `ads` mounts the Google Ads workspace as the center's first room) — the full per-account depth (`socials/[accountId]/{posts,schedule,inbox,audience,performance}`, `ads/[accountId]/campaigns/…`) is the artifact's spec when those systems are built.

Traps: shared checkout (parallel sessions sweep working files into their commits — verify content, not commit messages); Bing OAuth callback stays at `/marketing/connections/bing/callback` (registered redirect URI — move only with the Bing app registration + `BING_WEBMASTER_OAUTH_REDIRECT_URI` in aidream); pre-existing GA4 `campaign-pause.test.ts` failure is logged in `FOUND_DEFECTS.md`, not this program's.

## Done

- Design ratified — "The Marketing Tree" artifact; rules mirrored into `features/marketing/FEATURE.md` § THE AGENCY MODEL.
- DB slugs live + backfilled (`migrations/marketing_brand_site_url_slugs.sql`); FE creates write slugs (`insertWithSlug`, `features/marketing/data/service.ts`); `NewSiteForm` accepts key or UUID in `?brand=`.
- Two-plane tree built (~120 live pages) — see the spine files above and `app/(core)/marketing/`.
- Legacy lattice: brands/sites catch-alls, flat-pillar shims, cross-branch mappers, resolver doors — all through `lib/legacy-marketing-urls.ts`; browser-verified (old canonical → seo branch, UUID → slug, flat door → branch, `assets?view=` → identity media room).
- Four-state sidebar + breadcrumb trail + route metadata + admin map regenerated; drift tests rewritten and green; repo type-check clean.

## Decisions needed

- None open.
