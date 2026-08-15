---
status: active
updated: 2026-08-15
repos: [matrx-frontend]
vision:
  [
    features/marketing/FEATURE.md,
    /Users/armanisadeghi/code/common-docs/systems/ai-dream-platform/USER.md,
  ]
---

# Marketing navigation — Media placement and sidebar polish

**The navigation rebuild and the ruled non-website moves are DONE and live.**
What this doc still owns is the one placement decision Arman deliberately left
open — Media — plus the shared sidebar-primitive polish.

Sibling docs: [marketing-module.md](marketing-module.md) owns the module SHAPE
(pillars, reserved routes, landing). This doc owns navigation and placement
below the pillar level.

## Vision — Arman's words

> "it has gotten out of hands with having so many features that are all just
> icons at the top."

> "My hunch is we should go with the one where the menu switches, like chat and
> agent run, because it provides a more immersive environment where you're in
> marketing, and that's what you're doing, and trying to go to other things
> requires you to actively get out of it, which I think is the way that marketing
> should be."

> "I think the biggest thing that has happened is too many things have been
> associated with the website, that don't necessarily need to be within website."

> "we can still keep that top menu because on pages where it only has three to six
> options, it actually looks great because you can see the text and the icons…"

> "we have not properly organized things with a bit more of a parent/child
> relationship so inside of a website, we have a ton of first-level things without
> consideration for how we can better categorize them"

## Resources

- **The registries — one declaration each, everything reads them.**
  `lib/route-sections.ts` (21 sections + the 7 groups) ·
  `lib/site-subviews.ts` (43 sub-views, query- or path-style hrefs) ·
  `lib/site-section-icons.ts` · `lib/site-subview-icons.ts`
- **The guards.** `lib/site-subviews.test.ts` counts every destination
  (21 + 43 = **64**) and fails when one disappears · `lib/site-subnav.test.ts`
  pins what the header renders on all 21 sections · `lib/route-sections.test.ts`
  diffs the registry against the App Router filesystem.
- **The surfaces.** `components/shell/MarketingSidebarMenu.tsx` (registered in
  `features/shell/constants/route-menu-registry.ts`) ·
  `components/site/MarketingSiteLayoutClient.tsx` (the header) ·
  `lib/useMarketingSubView.ts` (`useMarketingSubView` to read a view;
  `buildMarketingSubNav` is its pure, tested core).
- **Do not change `EntityModeHeader` or `RouteModeNav` to fix a fit problem** —
  ~20 surfaces share them and they are correct. If a section's sub-nav does not
  fit, the section has too many views.
- Testing: `/login` admin@admin.com / Password1234#. Dev server ONLY via
  `pnpm preview:start` — see Gotchas before you fight it.

## Remaining work

1. **Decide Media placement with Arman** (details below). Do not split or relabel
   it by inference.
2. **Finish the sidebar-primitive polish** (spun off): the switch button loses
   its label when the sidebar is collapsed (`styles/shell.css:1008-1027`), and
   `NAV_ITEM_CLASS` / `ICON_SIZE` / `ICON_STROKE` are copied into all five
   consumer menus.

## Decision needed — Media placement

**The grouping** (live): Command · Content · Collection · Health & Fixes ·
Search · Links & Reputation · Configuration. No group larger than five. Group
names deliberately avoid colliding with a section name and avoid SEO jargon.

**Situation.** Only Crawled and Videos filter by `site_id`. Library is
`brand_id`, Research is `organization_id`, Sources combines brand + org, and
Generate is brand-scoped. The current seven-view section is therefore a
brand/org asset manager with two website views attached.

**Decision needed.** Should Library, Research, Sources, and Generate move into
the brand cockpit (leaving a smaller site Media section), or should Media stay
together and be renamed/described honestly as a mixed-scope asset workspace?
Arman must choose; no implementation should guess.

**Not twins despite looking like them** (do not "collapse" these):
`/marketing/changes/[changeId]` and `/marketing/pages/[pageId]` are server
short-link redirects into the site route; `/marketing/growth-loop/[loopRunId]`
and `/marketing/sites/[siteId]/[...rest]` are client redirect shims;
`/marketing/discovery/youtube` is an unrelated feature.

## Done

- **Non-website surfaces moved (2026-08-15).** Discovery is now
  `/marketing/brands/[brandId]/discovery`; Capabilities is the shared
  `/marketing/capabilities` catalogue; Access, Integrations, and Intake are six
  linkable Settings views; the duplicate `/marketing/ai-visibility` selector
  redirects to Sites. All five old site URLs remain explicit redirects.
- **The no-lost-surface guard records the move.** Website inventory is now 21
  sections + 43 sub-views = 64 destinations. The two-destination reduction is
  exactly Discovery + Capabilities; folding configuration lost nothing.

- **The 26 sections have a parent/child structure** — seven groups on `MARKETING_SITE_SECTIONS`, priority-ordered within each.
- **Marketing is a sidebar mode** — `MarketingSidebarMenu` + one `route-menu-registry` entry (the fifth Large Route). Pillars outside a site, grouped sections inside, both from the same declarations as the hub and the global flyout.
- **The header shows sub-views, not sections** — all ten multi-view sections migrated onto one read hook; five competing mechanisms (Radix `Tabs`, `?view=`, `?tab=`, `useState`, local switchers) collapsed to one. Verified live at 1680px: the worst case (backlinks, 7 views) renders icon + label.
- **Every sub-view has a URL** — `structure/columns`, `authority/routes|evidence`, `access/organizations|public`, `changes/untracked` were component state and could not be linked, shared, restored, or opened by an agent.
- **The migration scaffolding is retired** — the ledger, the per-entry legacy fields, and the header gate came out once the last section landed.
- Shared shell fixes: the mode switch is deterministic and its view derived (`resolveSidebarView`, tested); `RouteModeNav` no longer rebuilds its ResizeObserver on every parent render (~20 consumers).

## Gotchas

- **`LinksInspectionTable` keeps a local switcher on purpose.** It serves the
  site's Links section AND a crawl's links page; on a crawl the header already
  carries that crawl's six modes, so its switcher stays local (keyed off
  `crawlId`). Not a missed migration.
- **`changes` has three levels.** The section's tracked/untracked lives in
  `?view=`; the six tabs on a SELECTED change set are a record-level nav using
  `?changeTab=` and deliberately stay in the page.
- **The dev server can struggle to hold a marketing route.**
  `scripts/agent-dev-server.sh` caps RSS (`MATRX_PREVIEW_MAX_RSS_GB`); it was 8,
  which reaped the server mid-compile leaving only a line in
  `<tmp>/matrx-frontend-preview-501/shared-next-dev.failed`, and is now 192,
  which lets a runaway consume the machine instead. Servers were observed at
  73 / 106 / 128 GB. **Root-causing this is its own focused task** — do not treat
  the cap as the fix.
