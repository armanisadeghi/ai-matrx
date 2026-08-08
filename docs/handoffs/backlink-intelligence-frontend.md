---
status: active
updated: 2026-08-08
repos: [matrx-frontend]
vision: []
---

# Backlink intelligence — frontend phase 2

Phase 1 (merged via PR #32, 2026-08-08) rebuilt
`/marketing/brands/[brandId]/sites/[siteId]/backlinks` on the GSC
architecture: tabs (`?tab=`), KPI band, recharts trend, full observation +
dimension tables, Insights lenses, anchor-profile classifier. Phase 2 items
are the chips `TASK-BL-1…6` in `.matrx/AGENT_TASKS.md` — each independently
runnable; this doc is the shared context so chips stay short.

## Vision — Arman's words

> "it should be as good and as powerful and even more powerful than the gsc
> and it should actually lead to something much more that allows you to even
> do link outreach and other types of things."

> "with backlinks, you don't wanna have the same anchor text… there's all
> these rules about what percentage should be what, but those are the things
> that we could build in. They're such great tools that have those sort of
> systems created, and we could easily do the same thing."

> "look at what we have in general for marketing and for websites… on the
> pages, we're tracking for example, for internal linking, what anchor text
> we want and things like that."

## Resources

- Feature code: `features/marketing/components/backlinks/` — workspace
  (`BacklinksWorkspace.tsx`), tables, KPI band, trend chart, insights tab;
  pure libs under `lib/` (`vocab.ts`, `extras.ts` jsonb narrowers,
  `anchors.ts` classifier + `anchors.test.ts`).
- Data layer: `features/marketing/data/backlinks-{types,queries,hooks}.ts` —
  direct RLS reads on `seo.backlink_snapshot` / `backlink_observation` /
  `backlink_dimension_snapshot`; lens filters live server-side in
  `listLatestBacklinks`; `clearTableUrlParams` in `data/query-state.ts`.
- The GSC exemplars to copy patterns from:
  `features/marketing/search-console/` — drilldown panels
  (`windows/GscDrilldownWindow.tsx` + `features/overlays/openers/gscDrilldownWindow.tsx`),
  watch (`lib/watch.ts`, `hooks/useWatchState.ts`, `components/watch/`),
  URL state (`lib/url-state.ts`), delta cells (`lib/columns.tsx`).
- Doctrine: `features/marketing/FEATURE.md` (backlinks bullet + invariants);
  marketing surface manifest
  `features/surfaces/manifests/marketing-backlinks.manifest.ts` (two unbound
  agent roles: `backlink_analyst`, `outreach_strategist`).
- Internal-link truth: `web.link_edge` (~420K rows with anchor_text; RPC
  `web.count_link_edges`), per-page anchor policy in
  `web.page.desired_values` (`accepted_anchor_texts`, scored by
  `data/page-links.ts#scorePlannedLinks` — read the "Internal-link two-plan
  contract" section of `features/marketing/FEATURE.md` before touching).
- Test login: `/login` → `admin@admin.com` / `Password1234#`. Site with the
  richest data: allgreenrecycling.com
  (`/marketing/brands/c2db36a1-15b5-4717-b8d6-161600aa5db7/sites/d0aff5b6-0710-4848-8304-164db3c80ab7/backlinks`).

## Remaining work

The chips in `.matrx/AGENT_TASKS.md` (TASK-BL-1 drilldown panels ·
TASK-BL-2 watchlist · TASK-BL-3 snapshot movers · TASK-BL-4
internal↔external anchor integration · TASK-BL-5 disavow export ·
TASK-BL-6 surface-agent enablement). Backend prerequisites (link-gap
intersections, >1000-row pagination, `seo` tool backlink actions, bulk
metrics) are aidream work: `aidream/docs/handoffs/backlink-intelligence-backend.md`
(merged, active).

## Done

- Phase-1 workspace rebuild — see `features/marketing/components/backlinks/`
  and the 2026-08-08 change-log entry in `features/marketing/FEATURE.md`.

## Known traps

- Every tab/lens table shares `useMarketingTableState` URL params — any new
  view swap must call `clearTableUrlParams` (Bugbot regression class).
- "Broken" is defined in ONE place semantically: provider `is_broken` OR
  target status ≥ 400; keep lens + table + any new consumer in parity.
- `extras` jsonb is read only through `lib/extras.ts` narrowers — never poke
  raw jsonb in components.
- Two sites sit at exactly 1000 observations (provider fetch cap) — never
  present observation counts as profile totals; summaries hold the truth.
