---
status: active
updated: 2026-08-11
repos: [matrx-frontend, aidream]
vision: []
---

# Backlink intelligence — frontend

The backlinks workspace is live at
`/marketing/brands/[brandId]/sites/[siteId]/backlinks` and now carries three
layers: the provider profile (tabs, KPI band, trend, dimension tables), a
first-party **source-page capture + AI assessment** layer, and the human
ruling/opinion layer. Remaining work is the chips `TASK-BL-*` in
`.matrx/AGENT_TASKS.md`; this doc is the shared context so chips stay short.

## Vision — Arman's words

> "it should be as good and as powerful and even more powerful than the gsc
> and it should actually lead to something much more that allows you to even
> do link outreach and other types of things."

> "with backlinks, you don't wanna have the same anchor text… there's all
> these rules about what percentage should be what, but those are the things
> that we could build in. They're such great tools that have those sort of
> systems created, and we could easily do the same thing."

> "one of the big things that we need with it is to make sure that we are
> creating a really nice, clean user interface." (2026-08-11)

## Resources

- **Workspace:** `features/marketing/components/backlinks/` — `BacklinksGate`
  (the route's one dynamic edge) → `BacklinksWorkspace` (tabs, `?tab=`) →
  KPI band, trend chart, observation table, dimension table, insights tab,
  anchor profile, `ReferringDomainIntelligenceTable`,
  `BacklinkEnrichmentDetail` / `RunPanel`, `useBacklinkAnalysis`.
- **Pure libs** (extend these, never re-derive): `lib/vocab.ts` (tabs, lenses,
  verdict/action vocabularies), `lib/extras.ts` (jsonb narrowers),
  `lib/anchors.ts` (anchor classifier), `lib/enrichment.ts` +
  `lib/enrichment-run.ts` (assessment narrowers + stream reducer),
  `lib/columns.tsx`. All unit-tested except the query layer.
- **Data:** `features/marketing/data/backlinks-{types,queries,hooks}.ts` —
  direct RLS reads. **The row table is `seo.backlink`** (47 cols, stable
  identity, carries the assessment); `seo.backlink_observation` is the older
  immutable provider table — do not target it in new code. Rollups:
  `seo.backlink_snapshot` / `backlink_dimension_snapshot`; domain opinions:
  `seo.referring_domain_profile`. Writes go ONLY through the RPCs
  (`update_backlink_human_ruling`, `update_referring_domain_human_ruling`).
- **Sibling surfaces born from this work** (read before duplicating):
  `features/marketing/authority/` (`.../authority` — turns evidence into
  internal-link actions, reuses `normalizePlanUrl` + `web.page.desired_values`)
  and `features/marketing/components/reputation/` (`.../reputation` — the only
  one of the three with `AssistStrip` wired).
- **Patterns to copy, never fork:** GSC drilldown panels
  (`features/marketing/search-console/windows/GscDrilldownWindow.tsx` +
  `features/overlays/openers/gscDrilldownWindow.tsx`), watch
  (`search-console/lib/watch.ts` + `useRowWatch` + `WatchButton`), assists
  producers (`search-console/insights-assists-producer.ts`), delta cells
  (`search-console/lib/columns.tsx`).
- **Doctrine that binds this surface:** the non-technical-SME user rule, THE
  DOOR LAW + INVENTORY LAW (`no-dead-ends` skill), the Assists ruling
  (`features/assists/FEATURE.md`), scroll-chain rules — all in root
  `CLAUDE.md`.
- **Backend half:** `aidream/docs/handoffs/backlink-intelligence-backend.md`
  (link-gap intersections, >1000-row pagination, `seo` tool backlink actions,
  bulk metrics) — chips filed in aidream's `.matrx/AGENT_TASKS.md`.
- **Durable test fixture** (verified alive; the one two reviews died on was a
  false "deleted" error, not a deleted site): All Green Recycling —
  `/marketing/brands/c2db36a1-15b5-4717-b8d6-161600aa5db7/sites/d0aff5b6-0710-4848-8304-164db3c80ab7/backlinks`
  — 1,000 links, 3,391 dimension rows. Login `admin@admin.com` / `Password1234#`.

## Remaining work

Chips in `.matrx/AGENT_TASKS.md`, priority order. Arman's 2026-08-11 ask —
a clean UI — is the first three:

1. **TASK-BL-UI-A** — plain-language pass (the surface speaks provider and
   pipeline vocabulary to a non-technical user).
2. **TASK-BL-UI-B** — verdict-first Overview + coherent tab set (14 tiles and
   no health answer; Anchors appears twice; three levels of nav before a row).
3. **TASK-BL-UI-C** — mobile pass (hover-only explainers, banned `vh`, iOS
   zoom-triggering inputs, no `pb-safe`).
4. **TASK-BL-ASSISTS** — mount `AssistStrip` + ship the producer; this is also
   the missing one-click fix for problems the UI already detects.
5. **TASK-BL-AGENTS** — bind the two dead-end surface roles.
6. **TASK-BL-DISAVOW** · **TASK-BL-DRILL** · **TASK-BL-MOVERS** ·
   **TASK-BL-ANCHORFOOT** · **TASK-BL-WATCH** — the feature remainder.
7. **TASK-BL-7** — the false "site deleted" error (platform-wide).

A correctness batch (broken deep link, unreachable tab branch, inert counts
that should be doors, empty drawer, orphaned batch progress, missing retry)
was fixed in the same session as this rewrite — see the Change Log entry in
`features/marketing/FEATURE.md`.

## Done

- Phase-1 GSC-architecture rebuild (tabs, KPI band, recharts trend, full
  tables, lenses, anchor classifier) — `features/marketing/components/backlinks/`.
- Source-page capture + AI assessment + human rulings + referring-domain
  opinions — same directory plus `seo.backlink` / `referring_domain_profile`.
- Authority Router and Reputation workspaces — `features/marketing/authority/`,
  `features/marketing/components/reputation/`.

## Known traps

- Every tab/lens table shares `useMarketingTableState` URL params — any new
  view swap must call `clearTableUrlParams`.
- "Broken" is defined once: provider `is_broken` OR target status ≥ 400 —
  keep lens, table, and any new consumer in parity.
- `extras` jsonb is read only through `lib/extras.ts`; assessment jsonb only
  through `lib/enrichment.ts`.
- Two sites sit at exactly 1,000 stored links (provider fetch cap) — never
  present a row count as a profile total; the summary snapshot holds truth.
- `backlinks-queries.ts` is ~620 lines behind an 18-line test file — the least
  covered part of the feature.
