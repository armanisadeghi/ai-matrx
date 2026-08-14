---
status: active
updated: 2026-08-13
repos: [matrx-frontend]
vision:
  [
    features/marketing/FEATURE.md,
    features/shell/components/header/variants/USAGE.md,
    /Users/armanisadeghi/code/common-docs/systems/ai-dream-platform/USER.md,
  ]
---

# Marketing navigation — mode sidebar + the site hierarchy under it

Marketing's site shell has **26 flat top-level sections** and no declared
hierarchy below them. This doc owns the fix: declare the hierarchy, move the 26
into a mode sidebar, and demote the top bar to the sub-view level where it works.

Sibling docs own the verticals — [marketing-module.md](marketing-module.md) owns
the module SHAPE (pillars, reserved routes, landing); this doc owns NAVIGATION
below the pillar level. Do not restate either in the other.

## Vision — Arman's words

> "the UI has grown tremendously, and it makes me incredibly happy and proud that
> we've built such an amazing system. But at the same time, I feel as though it
> has gotten out of hands with having so many features that are all just icons at
> the top."

> "My hunch is we should go with the one where the menu switches, like chat and
> agent run, because it provides a more immersive environment where you're in
> marketing, and that's what you're doing, and trying to go to other things
> requires you to actively get out of it, which I think is the way that marketing
> should be."

> "it's not as simple as just moving things to the menu… the bigger thing is going
> to be to fully map out and understand all of the structures of the pages and the
> tabs so that we can make it easy and user friendly to access everything."

> "I think the biggest thing that has happened is too many things have been
> associated with the website, that don't necessarily need to be within website."

> "we can still keep that top menu because on pages where it only has three to six
> options, it actually looks great because you can see the text and the icons, and
> it works really well. It becomes a problem, however, where you get to pages like
> what we have for sites right now that have dozens of them."

> "we have not properly organized things with a bit more of a parent/child
> relationship so inside of a website, we have a ton of first-level things without
> consideration for how we can better categorize them"

**Chosen model (2026-08-13):** the CHAT / AGENT RUN pattern — the marketing menu
REPLACES the global sidebar — over the RESEARCH pattern (both visible at once).
**Chosen order:** hierarchy first, sidebar second.

## Resources

- **The 26 sections:** `features/marketing/lib/route-sections.ts`
  (`MARKETING_SITE_SECTIONS` — a flat array, **no group field**).
- **The site shell:** `features/marketing/components/site/MarketingSiteLayoutClient.tsx`
  (icon map at :92-122; renders `EntityModeHeader modes={siteModes}`).
- **The degrading top bar:** `features/shell/components/header/RouteModeNav.tsx` —
  measures the center slot and picks `full` (icon+label) → `icons` (icon-only) →
  `menu` (one dropdown). 26 items can never reach `full`. This is Arman's
  "3 to 6 looks great" observation, as an algorithm.
- **Do NOT change `EntityModeHeader`** — ~20 surfaces use it (podcasts, projects,
  CMS, shapes, schedules, agent sets, artifacts, RAG, user-lists). It is correct;
  it is being fed 26 things.
- **The mode-sidebar primitive:** `features/shell/constants/route-menu-registry.ts`
  — regex→dynamic-import registry, 4 consumers today (agent runs, administration,
  chat, code). Slot: `features/shell/components/sidebar/RouteMenuSlot.tsx`;
  mobile twin `mobile-sheet/MobileRouteMenuSlot.tsx`; CSS view swap in
  `styles/shell.css:912-1030`. **Adding marketing = one registry entry + one
  component taking `{ expanded: boolean }`.**
- **Closest model to copy:** `features/admin/components/AdminRouteSidebarMenu.tsx`
  (grouped registry, collapsed + expanded states).
- **The pillar level is already done:** `features/shell/constants/nav-data.ts`
  `marketingNavChildren()` generates the global flyout from `MARKETING_PILLARS`.
  The marketing sidebar MUST read the same declaration so they cannot drift.
- **Filesystem drift guard to extend:** `features/marketing/lib/route-sections.test.ts`
  (already fails when a child page exists with no registered section).
- Testing: `/login` admin@admin.com / Password1234#. Dev server ONLY via
  `pnpm preview:start` (port 3001); check `pnpm dev:status` first.

## The undeclared second level — the real work

Twelve of the 26 sections already have internal sub-navs, built **five different
ways**, none of them declared data:

| Section | Sub-views | Mechanism |
| --- | --- | --- |
| `backlinks` | 7 | exported `BACKLINK_TABS` (`components/backlinks/lib/vocab.ts`) + `?tab=` |
| `media` | 7 | local `VIEWS` (`SiteMediaWorkspace.tsx:62`) + `?view=` |
| `changes` | 6 | Radix `Tabs` (`SeoChangeTrackingWorkspace.tsx`) |
| `reputation` | 5 | local `TABS` (`ReputationWorkspace.tsx`) |
| `ai-visibility` | 4 | Radix `Tabs` **and** a real `[view]` sub-route family |
| `links` | 4 | local view switcher (`LinksInspectionTable.tsx`) |
| `access` | 3 | local `subTabs` |
| `discovery` | 3 | `STATUS_TABS` |
| `keywords`, `authority`, `structure`, `pages` | 2-3 each | four more local variants |

Plus a declared one that got it right: `MARKETING_CRAWL_SECTIONS` (6) rendered by
`components/crawls/CrawlSubnav.tsx`.

**The platform does not know its own marketing hierarchy below the site.** Every
later phase is guesswork until this is declared.

## Remaining work, in order

1. **Migrate the twelve components onto the registry.** The sub-views are
   declared (`lib/site-subviews.ts`) but each component still owns its local copy
   on one of five mechanisms. Move them all to `?view=` — the majority mechanism
   and the one `WorkspaceViewToggle` already uses — consuming
   `listMarketingSubViews(section)` instead of a local const. Drop each entry's
   `legacyMechanism` / `legacyNotLinkable` as it lands, and delete that section's
   drift guard in `site-subviews.test.ts`. **Start with the four that have no URL
   at all** (`access`, `authority`, `changes`, `structure`) — those views cannot
   be linked, shared, restored on reload, or opened by an agent.
   `changes` is the deep one: it hides a whole level (tracked/untracked) plus a
   third below it (six tabs on a selected change set, also not linkable).
2. **Demote the top bar one level.** With the sidebar owning the 26,
   `EntityModeHeader` renders the CURRENT SECTION's sub-views — 3-7 items, which
   is where `RouteModeNav` reaches its icon+label variant. The top bar is kept,
   not deleted, and the five competing sub-nav mechanisms collapse onto it.
   Depends on 1. This also closes the board's parking-lot item "Header overlap at
   1500-1700px: Marketing's mode pill renders over the site name."
3. **Execute the promotions/demotions** ruled below: Discovery → brand,
   Capabilities → marketing level, the Media library/research views → brand,
   Access + Integrations + Intake folded into Settings, and collapse the
   duplicate `/marketing/ai-visibility` site-picker route. Each move updates the
   destination counts in `site-subviews.test.ts` **in the same commit** — that is
   what makes a deliberate move distinguishable from a lost surface.
4. **Finish the shared-primitive cleanup.** Two smaller items remain: the switch
   button loses its label when the sidebar is collapsed
   (`styles/shell.css:1008-1027`), degrading to an unlabeled rail glyph; and
   `NAV_ITEM_CLASS` / `ICON_SIZE` / `ICON_STROKE` are now copied into all five
   consumer menus — extract them.
5. **Verify in a browser after 1-3.** The sidebar was confirmed live (7 groups,
   28 links, correct active section); the switch-logic refactor after that is
   covered by unit tests but has NOT been re-confirmed visually, because this
   machine's dev server died repeatedly mid-compile.

## Decisions needed

### 1. How the 26 site sections group

**Situation.** A website in Marketing has 26 first-level sections with no
categories. They cannot fit across the top, so the header collapses them to
icon-only (or, narrower, to a flat 26-row dropdown). Grouping them is a product
call about what a website's parts ARE, not a technical one.

**Decide.** Ratify, edit, or replace this strawman:

| Group | Sections |
| --- | --- |
| Command | Overview, Growth Loop |
| Content | Pages, Structure, Sitemaps, Media, Coverage |
| Collection | Crawls |
| Diagnosis | Audit, Analysis, Findings, Performance |
| Search | Keywords, Ranks, AI Visibility |
| Authority | Links, Authority, Backlinks, Reputation |
| Interventions | Changes |
| Configuration | Settings (absorbing Access, Integrations, Intake) |

All 26 are accounted for: 24 land in the eight groups above (Media as
site-media only), and 2 leave the site entirely — Discovery → brand,
Capabilities → marketing level. Result: **8 groups, ~3 items each**, and no
group larger than 5.

### 2. What stops being a "website" section

**Situation.** Arman's read is that things got attached to the website that do
not belong to it. Tracing what each section actually queries confirms it — some
are keyed to the BRAND, and some are org-wide data merely filtered to one site
(and already have a cross-site twin route).

**Decide.** Approve or reject each move. Evidence is the query scope each
section actually uses — traced through `data/*.ts` to the table filters.

| Section | Actually filters by | Proposed | Evidence |
| --- | --- | --- | --- |
| **Discovery** | `brand_id` **only** | → brand | `DiscoveryInbox.tsx:175,188` pass `site.brand_id`, never `site.id`; `service.ts:2114-2157` filters `discovered_item` on `brand_id`. **Two sites under one brand render byte-identical inboxes**, and every confirm writes brand-keyed rows. The brand page already shows the same count (`BrandWorkspace.tsx:373`). |
| **Media** | 2 of 7 views by `site_id` | → split | Crawled + Videos are `site.id`. Library is `brand_id` (`service.ts:2583`), Research is `organization_id` (`media-library.ts:75`), Sources is brand+org, Generate is brand. It is a brand/org asset manager with two site tabs bolted on. |
| **Capabilities** | ~nothing | → marketing level | `siteSeoCapabilities(sitePath)` is a hardcoded catalogue; only two live numbers per site (`SeoCapabilitiesWorkspace.tsx:68-74`). Renders identically for every site in the org. |
| **Intake** | site + **brand writes** | → into Settings | Applies `seo.site_topic_value` (site) **and** `web.brand.profile.brand_aliases` (brand) — `intake-service.ts:10,199`. The brand write is additive (`brand_aliases_add`), so nothing is clobbered, but a site-level wizard silently edits brand-level state the other sites share, with no indication. |
| **Access, Integrations** | site | → into Settings | Access is the generic `iam.permissions` sharing system (no marketing tables); Integrations edits one `site.integrations` JSONB column while `/marketing/connections` owns the real connection objects. Three slots, one job. |
| **AI Visibility** | `site_id` | collapse the twin | `/marketing/ai-visibility` is **not** an aggregate — `AiVisibilityHub.tsx:23` is a `<Select>` of sites feeding the identical workspace. A duplicate route, not a cross-site view. |
| **Ranks, Keywords** | site (over org libraries) | stay, as filtered views | Real cross-site twins exist. Keywords is an RPC over an org-level `keyword` library (`keyword-research/data/queries.ts:121,160,184`). |
| Reputation, Backlinks | `site_id` throughout | stay | Genuinely per-site (`backlinks-queries.ts`, `reputation-queries.ts:87-144`). Reputation joins brand `business_fact` only for context. |

**Not twins despite looking like them** (do not "collapse" these): `/marketing/changes/[changeId]`
and `/marketing/pages/[pageId]` are server short-link redirects into the site
route; `/marketing/growth-loop/[loopRunId]` and `/marketing/sites/[siteId]/[...rest]`
are client redirect shims; `/marketing/discovery/youtube` is an unrelated feature.

## Found while mapping — not part of this work order

- **`listCrossSiteRankPortfolio` is a bare RLS-filtered list read** —
  `features/marketing/components/ranks/cross-site-data.ts:84-93` selects
  `rank_target` with no scope predicate at all, only `deleted_at is null` plus a
  `TARGET_CAP` guard that **throws** past the cap. That is the exact pattern
  CLAUDE.md's THE VIEW LAW names a defect, and the hub breaks outright at scale
  rather than degrading. Tracked as a spin-off; do not fix inside the nav work.

## Done

- The site's second level is declared and guarded — `features/marketing/lib/site-subviews.ts` (39 sub-views) + `site-subviews.test.ts`, which counts every destination (26 sections + 39 = 65) and fails when one disappears.
- The 26 sections have a parent/child structure — seven groups on `MARKETING_SITE_SECTIONS`, ordered by priority within each, `pendingMoveTo` marking the two that are leaving.
- Marketing is a sidebar mode — `features/marketing/components/shell/MarketingSidebarMenu.tsx` + one `route-menu-registry` entry; icons shared via `lib/site-section-icons.ts`.
- The shared mode switch is deterministic and its view is derived, not synced — see `resolveSidebarView` + `route-menu-slot.test.ts`.
