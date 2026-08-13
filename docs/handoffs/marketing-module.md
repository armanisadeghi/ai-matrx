---
status: active
updated: 2026-08-12
repos: [matrx-frontend]
vision: [features/marketing/FEATURE.md, .claude/skills/module-landing-pages/SKILL.md, lib/coming-soon/FEATURE.md, /Users/armanisadeghi/code/common-docs/systems/growth-loop/VISION.md]
---

# Marketing module — consolidation and build-out

The module was **structurally repaired and then given its full intended shape**. The repair is shipped and verified in production; the shape is declared, and the pillars are filling in one by one (ranks, AI Visibility, Competitors so far).

**This doc owns the module SHAPE (pillars, reserved routes, nav, landing). Sibling handoffs own the deep verticals — read the one for the area you touch** (doc-family audit 2026-08-12: siblings verified current; `matrx-marketing-platform-handoff-2026-07-19.md` and `content-plan-client.md` deleted as superseded; the Studio-alignment doc merged into page-workspace-evolution):

| Area | Doc |
| --- | --- |
| Websites vertical (brands, crawls, coverage, GSC) **+ the `web.*` access model** | [marketing-brand-coverage-program.md](marketing-brand-coverage-program.md) |
| ↳ Backlinks workspace (provider profile, assessments, outreach) | [backlink-intelligence-frontend.md](backlink-intelligence-frontend.md) + aidream `docs/handoffs/backlink-intelligence-backend.md` |
| ↳ Legacy `web.gsc_page_stat` retirement | [gsc-page-stat-retirement.md](gsc-page-stat-retirement.md) |
| ↳ Per-page analysis workers (stabilization) | [per-page-analysis-stabilization.md](per-page-analysis-stabilization.md) |
| Page workspace authoring layer (desired values, drafts, keywords, tasks, Studio parity) | [marketing-page-workspace-evolution.md](marketing-page-workspace-evolution.md) |
| Content Plan (client + server + CMS bridge) | SoR `common-docs/systems/content-planning/FEATURE.md` · `common-docs/systems/cms-system/CMS-BUILDOUT-HANDOFF.md` (§3 Plan-side) · plan→site pipeline [website-factory-vision.md](website-factory-vision.md) · AI grounding [content-plan-ai-steps.md](content-plan-ai-steps.md) |
| The umbrella pipeline (research→plan→pages→live→crawl→findings→fixes) | `common-docs/systems/growth-loop/` + `features/growth-loop/map/loop-map.ts` (the ONLY status source) |
| SEO vertical server side (rank/keyword/backlink collection, providers, budgets) | aidream `docs/handoffs/seo-vertical.md` |
| `seo` chat-tool renderer | [seo-tool-renderer.md](seo-tool-renderer.md) |
| Live coordination board + parking lot | [../MARKETING_PROGRAM_BOARD.md](../MARKETING_PROGRAM_BOARD.md) |

## 1. Vision — Arman's words

**The original problem:** "We need to quickly fix some major routing problems that have developed lately as agents have decided to start sticking everything to the base route of our system. And that's just not the way things work. The two biggest massive violations of this are the content plan route and the SEO route, which are both clearly part of marketing, but they have now been added as root level routes, and that's a disaster waiting to happen."

**First-built bias:** "Ensure that all of the base routes for marketing are truly part of the base, and we haven't overly emphasized one system over others. as is often the case with coding agents when they're dealing with the first task. And in this case, websites were the first thing we did." — Confirmed at the time: `/marketing` literally redirected to `/marketing/brands`. Named casualties: SEO and keywords, content planning, the public utilities, "a search engine, or something like that." Also: "proper structure in the app's main menu to ensure full end to end clean structured setup for this major feature 'marketing'."

**Refinements:**
1. "Fully and properly set up the marketing pages so that the entire system is properly set up, just like the knowledge/education module and the legal module."
2. "The key is to BUILD for the future, just like legal and education. We need placeholders for the features we don't have yet with 'coming soon' on them." — A placeholder is a public commitment, tracked like a defect (`lib/coming-soon/FEATURE.md`).
3. Reserved pillar set drawn from what HubSpot / Semrush / Ahrefs / Sprout / Mailchimp treat as table stakes, plus AI Visibility as the 2026-native one.
4. **"The scraper is NOT part of marketing."** — Ruling: `features/scraper/` is shared platform infrastructure Marketing's crawler borrows. Do not move it in; do not fork a second crawler. (This was the "search engine" — found, evaluated, deliberately left in place.)

**Resulting doctrine:** Marketing is a multi-pillar module (Websites is one pillar, the largest but not the most important). No marketing surface gets a root-level route, ever. `/seo/*` is permanently reserved for the `(public)` anonymous analyzers — never add an authed `/seo/*` route. The module's shape is declared exactly once (`MARKETING_PILLARS`) and every map-rendering surface reads it. A reserved route is a real route at its permanent URL — when the feature ships, the URL does not move.

## 2. Current state — gap analysis (re-verified against code 2026-08-12)

### Done and verified
- **Module SHAPE finished and live**: route consolidation (308s from `/content-plan` + `/seo/keyword-research`), 8-pillar hub, guest landing on every `/marketing/*` URL, admin map. All map surfaces (sidebar, hub, landing areas, reserved-route metadata, `/marketing/tools`) GENERATED from `MARKETING_PILLARS` (`features/marketing/lib/marketing-nav.ts`), 28 entries across 8 pillars.
- **Reserved routes: 13 of 16 remain.** Shipped at their permanent URLs: `/marketing/ranks` (2026-07-28, the reference recipe: real page at the same URL, delete the registry row, drop `status` from nav, FEATURE.md change-log line, surface manifest), then **AI Visibility and Competitor Autopsy live end-to-end (2026-08-11)**. Remaining 13 stubs: local, campaigns, calendar, audience, content-studio, social, email, ads, outreach, monitoring, analytics, reports, automations. The coming-soon registry also holds 10 `marketing.tools.*` analyzer promises + `marketing.generate-video`.
- **Agent-writable surface fleet (2026-08-09→12):** 23 marketing surface manifests exist (`features/surfaces/manifests/marketing-*`) — brand, backlinks, findings, reputation, hub, discovery, keyword-research, crawls, site-media, and more; marketing-integrations ruled READ-ONLY for agents. Access model collapsed to one canonical downward tree rooted at `web_brand` (2026-08-12). See `features/marketing/FEATURE.md` change log — it is the authority; this doc only names the shape.
- **GSC ambassador (2026-08-08):** traffic-class decomposition on site overview, sites-list hovercard, and brand pages (`search-console/components/ambassador/`, `seo.gsc_perf_class_summary_multi` RPC), verified live.

### Partial
1. **No surface manifests for the 13 reserved routes** — correct for now (nothing to declare), but a manifest is part of "done" for each one (`surface-authoring` skill).
2. **Access asymmetry on `/marketing/ranks`:** `seo.rank_target` rows can be readable where their `web.site` row is not → raw site UUID instead of a name. Belongs to the access-model work in [marketing-brand-coverage-program.md](marketing-brand-coverage-program.md).

### Not started
Everything behind the 13 pillar promises + 10 tool promises. **No database schema exists for any of them** (verified 2026-08-12: no campaign/social/email/ads/automation tables in `web.*`/`seo.*`; `crm.campaign` is the unrelated CRM feature). The schema is the real work; routes and nav are already waiting. The user-facing promise text in `lib/coming-soon/registry.ts` IS the spec.

### Known issues
1. This repo has many concurrent agent sessions — check `git status` for files you don't own; prefer additive changes.
2. Legacy site URL shim: `/marketing/sites/[siteId]/**` client-redirects to brand-nested canonical. Deliberate; do not clean up.
3. Banned Lucide icons bit this work: `Bot`, `Sparkles` (eslint-blocked), `Youtube` (removed from lucide — aliased to `Video` in `MarketingHub.tsx`).
4. `MarketingComingSoon` throws by design if a route id is missing from `MARKETING_PILLARS` or the registry — the guard, not a bug.
5. **Open product question for Arman (not blocking):** whether Content Plan drafts live in `features/cms` or a new marketing table — `/marketing/content-studio` is the reserved production lane. The end-to-end seam is now documented in [website-factory-vision.md](website-factory-vision.md) + the growth-loop docs; the storage-ownership call is still his.

## 3. Architecture

`features/marketing/lib/marketing-nav.ts` (`MARKETING_PILLARS`) is the shape. Readers: `app/(core)/marketing/page.tsx` + `tools/page.tsx` (→ `MarketingHub.tsx`), `features/shell/constants/nav-data.ts` (`marketingNavChildren()`), `features/marketing/lib/route-metadata.ts` (`RESERVED_ROUTES`), `MarketingLanding.tsx` (`listMarketingLandingAreas()` — derives Live vs Coming soon from what's actually built). **Adding a surface = one edit there.**

Routes: `app/(core)/marketing/` — `layout.tsx` (guest/authed branch), `page.tsx` (hub), `admin/`, the live verticals (`brands/`, `content-plan/`, `keyword-research/`, `discovery/`, `tools/`, `connections/`, `batches/`, `cost/`, `ranks/`, `ai-visibility/`, `competitors/`), and 13 reserved stubs, each 3 lines: `<MarketingComingSoon comingSoonId="marketing.<id>" />`.

Feature layout: `features/marketing/` — `lib/routes.ts` (never hand-build a `/marketing` URL), `lib/route-metadata.ts`, `components/MarketingHub.tsx`, `components/MarketingComingSoon.tsx`, the websites vertical under `components/`, plus `content-plan/`, `seo/`, `google/ bing/ crawler/ pagespeed/ analytics/ data/`. Public analyzers stay at `app/(public)/seo/*` reading from `features/marketing/seo/`.

Related reading: `features/marketing/FEATURE.md` (rules + pillar table), `lib/coming-soon/FEATURE.md`, skills `module-landing-pages` + `surface-authoring`, `features/shell/components/header/variants/USAGE.md`, `docs/WEB_SCHEMA_CANONICAL_REFERENCE.md`.

Testing: `/login` admin@admin.com / Password1234#. Dev server ONLY via `pnpm preview:start` (port 3001); check `pnpm dev:status` first.

## 4. Next steps, in order

1. **Finish the ambassador sweep (cheapest real value; confirmed still open 2026-08-12).** `PageSearchConsoleCard`, `PageQueriesCard`, `PageTargetPerformanceCard`, `PagesTable`, `SitesPortfolio` still render raw GSC — zero `GscClassBar` consumers among them. Per-query class chips need a keyword-text → class resolver (`seo.gsc_keyword_class_map` keys on `keyword_id`); a page-level split needs a page-filtered variant of `gsc_perf_class_summary`. Decide which, then reuse `GscClassBar`.
2. **`/marketing/campaigns`.** Highest-leverage reserved surface: social, email, ads, outreach all report into it, so building the campaign entity first prevents four incompatible designs. Needs a migration — ask Arman before designing the schema (note `crm.campaign` exists for CRM call campaigns; decide the relationship, don't silently fork or silently reuse).
3. **`/marketing/reports` before `/marketing/analytics`.** Both read providers bound in `/marketing/connections`, but GA4 has no synced data yet (`seo.web_analytics_daily` empty) — reports over GSC is the better first build. GA4 activation is server work (aidream seo-vertical.md; OAuth/GA4 threads now tracked in brand-coverage-program.md item 13).
4. **The access-asymmetry question (§2 Partial 2).**

Everything else is genuine greenfield; order is Arman's call.

## 5. Gotchas

1. **`git push` deploys NOTHING — only `./scripts/release.sh` builds.** Vercel skips non-release-prefixed commits; the deployment reads `CANCELED` and production stays on the last release. Verify a release with a `READY` deployment whose commit is yours or a descendant (Vercel MCP `list_deployments`, project `prj_ZIeMm2FW8RgOAO9BJgQ2YQcXpwrH`, team `team_zWxJHqDHuRr1kpl9Hu9oON3g`), then assert on a string that exists **only** in the new build.
2. **Never move a reserved URL.** Permanence is the promise; a wrong name changes the label, not the href.
3. **Never render a bare "coming soon" string** — register it; unregistered ids throw in dev on purpose.
4. **`/marketing` must never redirect.** That single line caused the websites over-emphasis this work undid.
5. **Never add a marketing route to `requiresAuth` in `utils/supabase/middleware.ts`** — guests always get a rendered page; protect at the resource level.
6. **The scraper is out of scope** (Arman's ruling, §1.4).
7. **`pnpm check:page-headers` has pre-existing `(dev)`/`(public)` failures** — only act on `(core)` findings.
8. **Marketing FEATURE.md is large and actively edited by other sessions** — append to the change log; no drive-by restructures.
