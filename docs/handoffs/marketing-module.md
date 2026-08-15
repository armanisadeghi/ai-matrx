---
status: active
updated: 2026-08-15
repos: [matrx-frontend]
vision: [features/marketing/FEATURE.md, .claude/skills/module-landing-pages/SKILL.md, lib/coming-soon/FEATURE.md, /Users/armanisadeghi/code/common-docs/systems/growth-loop/VISION.md]
---

# Marketing module — consolidation and build-out

The module was **structurally repaired and then given its full intended shape**. The repair is shipped and verified in production; the shape is declared, and the pillars are filling in one by one (ranks, AI Visibility, Competitor Autopsy, Initiatives, and Client Reports so far — 11 of 16 reserved routes left).

**This doc owns the module SHAPE (pillars, reserved routes, nav, landing). Sibling handoffs own the deep verticals — read the one for the area you touch** (doc-family audit 2026-08-12: siblings verified current; `matrx-marketing-platform-handoff-2026-07-19.md` and `content-plan-client.md` deleted as superseded; the Studio-alignment doc merged into page-workspace-evolution):

| Area | Doc |
| --- | --- |
| Websites vertical (brands, crawls, coverage, GSC) **+ the `web.*` access model** | [marketing-brand-coverage-program.md](marketing-brand-coverage-program.md) |
| ↳ Backlinks workspace (provider profile, assessments, outreach) | [backlink-intelligence-frontend.md](backlink-intelligence-frontend.md) + aidream `docs/handoffs/backlink-intelligence-backend.md` |
| ↳ Competitor link-gap / outreach targets | [competitor-link-gap.md](competitor-link-gap.md) · [outreach-system.md](outreach-system.md) |
| ↳ Legacy `web.gsc_page_stat` retirement | [gsc-page-stat-retirement.md](gsc-page-stat-retirement.md) |
| ↳ Per-page analysis workers (stabilization) | [per-page-analysis-stabilization.md](per-page-analysis-stabilization.md) |
| Marketing ↔ CMS page join | [cms-page-hub.md](cms-page-hub.md) |
| Page workspace authoring layer (desired values, drafts, keywords, tasks, Studio parity) | [marketing-page-workspace-evolution.md](marketing-page-workspace-evolution.md) |
| Content Plan (client + server + CMS bridge) | SoR `common-docs/systems/content-planning/FEATURE.md` · `common-docs/systems/cms-system/CMS-BUILDOUT-HANDOFF.md` (§3 Plan-side) · plan→site pipeline [website-factory-vision.md](website-factory-vision.md) · AI grounding [content-plan-ai-steps.md](content-plan-ai-steps.md) |
| The umbrella pipeline (research→plan→pages→live→crawl→findings→fixes) | [growth-loop.md](growth-loop.md) · `common-docs/systems/growth-loop/` + `features/growth-loop/map/loop-map.ts` (the ONLY status source) |
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

## 2. Current state — gap analysis (re-verified against code 2026-08-15)

### Done and verified
- **Module SHAPE finished and live**: route consolidation (308s from `/content-plan` + `/seo/keyword-research`), 8-pillar hub, guest landing on every `/marketing/*` URL, admin map. All map surfaces (sidebar, hub, landing areas, reserved-route metadata, `/marketing/tools`) GENERATED from `MARKETING_PILLARS` (`features/marketing/lib/marketing-nav.ts`), 28 entries across 8 pillars.
- **Initiatives is live end to end (2026-08-15).** `/marketing/initiatives` reads `marketing.initiative` through dedicated scoped list/count/facet RPCs; creation and version-guarded editing cover name, brand, objective, goal, status, dates, and budget. `/marketing/initiatives/[id]` is the registered share destination and its brand is a canonical door. The `matrx-user/marketing-initiatives` surface is registered and synced.
- **Client Reports is live over Search Console (2026-08-15).** `/marketing/reports` assembles a printable 28-day client report from the canonical `seo.gsc_perf_*` reads: plain-language findings, prior-period evidence, traffic-class portfolio/site/page rollups, class-resolved keywords, and openable site/page/keyword references. It deliberately does not imply GA4 attribution while `seo.web_analytics_daily` is empty. `matrx-user/marketing-reports` is registered and emits the complete report scope.
- **Reserved routes: 11 of 16 remain.** Shipped at their permanent URLs: `/marketing/ranks`, AI Visibility, Competitor Autopsy, Initiatives, and Client Reports. Remaining 11 stubs: local, calendar, audience, content-studio, social, email, ads, outreach, monitoring, analytics, automations. The coming-soon registry also holds 11 `marketing.tools.*` analyzer promises + `marketing.generate-video`.
- **Agent-writable surface fleet (2026-08-09→12):** 23 marketing surface manifests exist (`features/surfaces/manifests/marketing-*`) — brand, backlinks, findings, reputation, hub, discovery, keyword-research, crawls, site-media, and more; marketing-integrations ruled READ-ONLY for agents. Access model collapsed to one canonical downward tree rooted at `web_brand` (2026-08-12). See `features/marketing/FEATURE.md` change log — it is the authority; this doc only names the shape.
- **GSC ambassador sweep complete:** traffic-class decomposition reaches site overview, site KPI peeks, brand pages, both page-query cards, target-keyword performance, the pages registry, and the sites portfolio. `GscClassBar` owns site/page rendering; `GscPortfolioClassBar` owns multi-site rendering; query rows reuse `ClassChip`. Server truth stays in `seo.gsc_keyword_class_map`, with text resolution and page rollups in `seo.gsc_keyword_class_by_text` / `seo.gsc_perf_page_class_summary`.

### Partial
1. **No surface manifests for the 11 reserved routes** — correct for now (nothing to declare), but a manifest is part of "done" for each one (`surface-authoring` skill).
2. **Access asymmetry on `/marketing/ranks`:** `seo.rank_target` rows can be readable where their `web.site` row is not → raw site UUID instead of a name. Belongs to the access-model work in [marketing-brand-coverage-program.md](marketing-brand-coverage-program.md).

### Not started
The other 11 pillar promises + 11 `marketing.tools.*` analyzer promises. **No database schema exists for any of them** (re-verified 2026-08-15: no social/email/ads/automation tables anywhere). The schema is the real work; routes and nav are already waiting. The user-facing promise text in `lib/coming-soon/registry.ts` IS the spec.

### Known issues
1. This repo has many concurrent agent sessions — check `git status` for files you don't own; prefer additive changes.
2. Legacy site URL shim: `/marketing/sites/[siteId]/**` client-redirects to brand-nested canonical. Deliberate; do not clean up.
3. Banned Lucide icons bit this work: `Bot`, `Sparkles` (eslint-blocked), `Youtube` (removed from lucide — aliased to `Video` in `MarketingHub.tsx`).
4. `MarketingComingSoon` throws by design if a route id is missing from `MARKETING_PILLARS` or the registry — the guard, not a bug.
5. **Open product question for Arman (not blocking):** whether Content Plan drafts live in `features/cms` or a new marketing table — `/marketing/content-studio` is the reserved production lane. The end-to-end seam is now documented in [website-factory-vision.md](website-factory-vision.md) + the growth-loop docs; the storage-ownership call is still his.

## 3. Architecture

`features/marketing/lib/marketing-nav.ts` (`MARKETING_PILLARS`) is the shape. Readers: `app/(core)/marketing/page.tsx` + `tools/page.tsx` (→ `MarketingHub.tsx`), `features/shell/constants/nav-data.ts` (`marketingNavChildren()`), `features/marketing/lib/route-metadata.ts` (`RESERVED_ROUTES`), `MarketingLanding.tsx` (`listMarketingLandingAreas()` — derives Live vs Coming soon from what's actually built). **Adding a surface = one edit there.**

Routes: `app/(core)/marketing/` — `layout.tsx` (guest/authed branch), `page.tsx` (hub), `admin/`, the live verticals (`brands/`, `content-plan/`, `keyword-research/`, `discovery/`, `tools/`, `connections/`, `batches/`, `cost/`, `ranks/`, `initiatives/`, `reports/`, `ai-visibility/`, `competitors/`), and 11 reserved stubs, each 3 lines: `<MarketingComingSoon comingSoonId="marketing.<id>" />`.

Feature layout: `features/marketing/` — `lib/routes.ts` (never hand-build a `/marketing` URL), `lib/route-metadata.ts`, `components/MarketingHub.tsx`, `components/MarketingComingSoon.tsx`, the websites vertical under `components/`, plus `content-plan/`, `seo/`, `google/ bing/ crawler/ pagespeed/ analytics/ data/`. Public analyzers stay at `app/(public)/seo/*` reading from `features/marketing/seo/`.

Related reading: `features/marketing/FEATURE.md` (rules + pillar table), `lib/coming-soon/FEATURE.md`, skills `module-landing-pages` + `surface-authoring`, `features/shell/components/header/variants/USAGE.md`, `docs/WEB_SCHEMA_CANONICAL_REFERENCE.md`.

Testing: `/login` admin@admin.com / Password1234#. Dev server ONLY via `pnpm preview:start` (port 3001); check `pnpm dev:status` first.

## 4. Next steps, in order

1. **Keep `/marketing/analytics` reserved until GA4 has honest synced evidence.** Reports now consume the GSC data that exists; `seo.web_analytics_daily` remains empty. GA4 activation is server work (aidream seo-vertical.md; OAuth/GA4 threads tracked in brand-coverage-program.md item 13).
2. **The access-asymmetry question (§2 Partial 2).**
3. **Open defects touching this module** (from `FOUND_DEFECTS.md`, all still open 2026-08-15): D199 GSC keyword-class rules dark in prod · D180 hydration mismatch on every `(core)` marketing route · D150 item surfaces hide identities/doors · D141 audit dead-ends on large sites · D153 no per-site cost attribution · D74 `web.link_edge.http_status` never populated (no broken-link detection). Backlinks follow-ups are chipped in `.matrx/AGENT_TASKS.md` (`TASK-BL-*`).

Everything else is genuine greenfield; order is Arman's call. **`pnpm check:dead-ends` is clean for the whole module** (0 findings under `features/marketing` or `app/(core)/marketing`, 2026-08-15) — keep it that way.

## 5. Gotchas

1. **`git push` deploys NOTHING — only `./scripts/release.sh` builds.** Vercel skips non-release-prefixed commits; the deployment reads `CANCELED` and production stays on the last release. Verify a release with a `READY` deployment whose commit is yours or a descendant (Vercel MCP `list_deployments`, project `prj_ZIeMm2FW8RgOAO9BJgQ2YQcXpwrH`, team `team_zWxJHqDHuRr1kpl9Hu9oON3g`), then assert on a string that exists **only** in the new build.
2. **Never move a reserved URL once it has shipped.** Permanence is the promise; after ship, a wrong name changes the label, not the href — no exceptions, because someone has the URL. **Before ship there is one narrow carve-out, used exactly once (2026-08-13, `/marketing/campaigns` → `/marketing/initiatives`) and amended into this law in the same change rather than asserted around it:** a reserved stub may be renamed if the promise text the user was shown is unchanged, a permanent 308 leaves the old path working forever, and every generated surface moves in lockstep (`MARKETING_PILLARS`, the coming-soon registry, `routes.ts`, `route-metadata.ts`, the admin map, the hub manifest). The law protects a *destination a user was given*, not a string — the redirect is what keeps that true, so it is not optional. If you cannot add the redirect, you cannot rename.
3. **A new SCHEMA has four registration surfaces and none of them announce themselves** (learned building `marketing`, 2026-08-15 — each was found by a guard, not by reading): the `db-types` script in `package.json` carries a **hardcoded** schema list, so a new schema is silently missing from `database.types.ts` until it is added there; aidream's `db/matrx_orm.yaml` is a second, separate list; PostgREST exposure is `ALTER ROLE authenticator SET pgrst.db_schemas`, which **replaces the whole value** — read the live setting and append to THAT, because a dropped name is an instant platform-wide PGRST002 outage, not a degraded feature; and a `shareable_resource_registry` row whose `url_path_template` has no matching route FAILS `registry.routes.test.ts`, so it ships with the detail route, never before. Related standing trap: that registry's TS mirror and its committed snapshot can go stale **together**, so the parity test stays green while the FE is missing rows — nine had drifted by 2026-08-15. Run `pnpm check:shareable-registry` (it compares against the LIVE DB) whenever you touch sharing.
4. **Never render a bare "coming soon" string** — register it; unregistered ids throw in dev on purpose.
5. **`/marketing` must never redirect.** That single line caused the websites over-emphasis this work undid.
6. **Never add a marketing route to `requiresAuth` in `utils/supabase/middleware.ts`** — guests always get a rendered page; protect at the resource level.
7. **The scraper is out of scope** (Arman's ruling, §1.4).
8. **`pnpm check:page-headers` has pre-existing `(dev)`/`(public)` failures** — only act on `(core)` findings.
9. **Marketing FEATURE.md is large and actively edited by other sessions** — append to the change log; no drive-by restructures.
