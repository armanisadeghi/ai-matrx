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

# Marketing navigation — the Media split

**Everything else is DONE and live.** The sidebar, the grouped sections, the
header demotion, the sub-view registry, and every ruled non-website move have
shipped. One item remains: splitting Media, which Arman ruled on 2026-08-15.

Sibling doc: [marketing-module.md](marketing-module.md) owns the module SHAPE
(pillars, reserved routes, landing). This doc owns navigation and placement
below the pillar level, and should be DELETED when the Media split lands.

## Vision — Arman's words

> "it has gotten out of hands with having so many features that are all just
> icons at the top."

> "My hunch is we should go with the one where the menu switches, like chat and
> agent run… it provides a more immersive environment where you're in marketing,
> and that's what you're doing, and trying to go to other things requires you to
> actively get out of it, which I think is the way that marketing should be."

> "I think the biggest thing that has happened is too many things have been
> associated with the website, that don't necessarily need to be within website."

> "we can still keep that top menu because on pages where it only has three to six
> options, it actually looks great because you can see the text and the icons…"

## Remaining work — the Media split (RULED 2026-08-15, spun off as a task)

```
WEBSITE > Media            BRAND > Assets
  Crawled                    Library
  Videos                     Research
  Standards                  Sources
  -> door to brand library   Generate
```

**Why:** `components/media/SiteMediaWorkspace.tsx` renders seven views, but only
Crawled and Videos are site-scoped. Library reads `brand_asset` by `brand_id`,
Research reads `rs_media` by `organization_id` (`data/media-library.ts`), Sources
takes brand + org, Generate is brand-scoped, and Standards is a `site.settings`
blob. Two sites under one brand therefore render identical Library / Research /
Sources / Generate, and someone editing there believes they are changing one
website while changing everything under that brand — the same defect that moved
Discovery.

**Follow the Discovery move**, which shipped this exact shape and is live:
`app/(core)/marketing/brands/[brandId]/discovery/page.tsx`, with the old site URL
kept as an explicit redirect. `BrandWorkspace.tsx` is the receiving cockpit.

**Watch:** the cross-view flows in that file (a crawled asset promotes to the
library; a research image becomes a creative brief and jumps to Generate) now
cross a level boundary. They must keep working, and must not silently navigate
the user out of the website without it being obvious.

## Resources

- **The registries — one declaration each, everything reads them.**
  `lib/route-sections.ts` (21 sections + the 7 groups) ·
  `lib/site-subviews.ts` (43 sub-views, query- or path-style hrefs) ·
  `lib/site-section-icons.ts` · `lib/site-subview-icons.ts`
- **The guards.** `lib/site-subviews.test.ts` counts every destination
  (21 + 43 = **64**) and fails when one disappears · `lib/site-subnav.test.ts`
  pins what the header renders on every section · `lib/route-sections.test.ts`
  diffs the registry against the App Router filesystem.
  **Moving a surface MUST update those counts in the same commit, naming where
  it went** — that is what separates a deliberate move from a surface that
  quietly went dark.
- **The surfaces.** `components/shell/MarketingSidebarMenu.tsx` (registered in
  `features/shell/constants/route-menu-registry.ts`) ·
  `components/site/MarketingSiteLayoutClient.tsx` (the header) ·
  `lib/useMarketingSubView.ts` (`useMarketingSubView` reads a view;
  `buildMarketingSubNav` is its pure, tested core).
- **Do not change `EntityModeHeader` or `RouteModeNav` to fix a fit problem** —
  ~20 surfaces share them and they are correct. If a section's sub-nav does not
  fit, the section has too many views.
- Testing: `/login` admin@admin.com / Password1234#. Dev server ONLY via
  `pnpm preview:start` — see Gotchas.

## Done

- **The header shows sub-views, not sections.** It was handed all 26 sections, which no width fits, so it sat permanently at bare icons. Ten sections migrated onto one read hook; five competing mechanisms (Radix `Tabs`, `?view=`, `?tab=`, `useState`, local switchers) collapsed to one. Verified live at 1680px: the worst case (backlinks, 7 views) renders icon + label.
- **Marketing is a sidebar mode** — `MarketingSidebarMenu` + one `route-menu-registry` entry (the fifth Large Route), reading the same declarations as the hub and the global flyout.
- **The sections have a parent/child structure** — seven groups, priority-ordered, none larger than five.
- **Every sub-view has a URL.** `structure/columns`, `authority/routes|evidence`, the Access views and `changes/untracked` were component state and could not be linked, shared, restored, or opened by an agent.
- **The non-website moves shipped** — Discovery → the brand cockpit, Capabilities → `/marketing/capabilities`, Access + Integrations + Intake folded into six linkable Settings views, and the duplicate `/marketing/ai-visibility` selector redirects to Sites. All five old site URLs remain explicit redirects.
- Shared shell fixes: the mode switch is deterministic and its view derived (`resolveSidebarView`, tested); `RouteModeNav` no longer rebuilds its ResizeObserver on every parent render (~20 consumers); route-menu row styling is shared via `features/shell/constants/route-menu-style.ts` and the collapsed switch keeps a tooltip.
- The migration scaffolding was retired once the last section landed.

## Gotchas

- **`LinksInspectionTable` keeps a local switcher on purpose.** It serves the
  site's Links section AND a crawl's links page; on a crawl the header already
  carries that crawl's six modes, so its switcher stays local (keyed off
  `crawlId`). Not a missed migration.
- **`changes` has three levels.** The section's tracked/untracked lives in
  `?view=`; the six tabs on a SELECTED change set are record-level nav using
  `?changeTab=` and deliberately stay in the page.
- **`AgentRunSidebarMenu` is not a missed consumer** of `route-menu-style.ts` —
  it renders a different row design, not the shared `shell-nav-item` shape.
- **The dev server can struggle to hold a marketing route.** Root-causing that
  is its own focused work — see `docs/handoffs/preview-memory-bloat.md`, which
  now carries this session's evidence (73 / 106 / 128 GB within minutes of
  compiling a marketing SITE route). Do not treat the RSS cap as the fix.
