# FEATURE.md — `reports`

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-06-12`

---

## Purpose

Cross-cutting reporting module — views that span many records to surface what needs attention. **Agent Drift** is report #1 (every agent whose usages have drifted); the module is built around it so the next report plugs into one registry.

---

## Mental model

A **metadata-only registry** (`registry.ts`, the spirit of the feature admin map) is the single source of truth: each `ReportDefinition` declares a `slug`, `title`, `iconName`, a user `href`, and an optional `adminHref` (platform-wide variant). The landing pages iterate the registry; a report's own page renders its component. **Adding a report = one registry entry + its route + component.** No speculative abstraction beyond the registry list.

---

## Entry points

**Routes**
- `app/(core)/reports/page.tsx` — user landing (card grid over the registry).
- `app/(core)/reports/agent-drift/page.tsx` — Agent Drift (user scope).
- `app/(admin)/administration/reports/page.tsx` — admin landing (reports with an `adminHref`). Super-admin gated by the `(admin)` layout.
- `app/(admin)/administration/reports/agent-drift/page.tsx` — Agent Drift (platform-wide).
- `app/(core)/reports/admin/page.tsx` — the feature admin map (`/reports/admin`).

**Components**
- `components/ReportsLanding.tsx` — registry-driven card grid (`mode: "user" | "admin"`).
- `components/agent-drift/AgentDriftReport.tsx` — master-detail report. The rollup table is the master; **the detail pane reuses `features/agents/components/usages/AgentUsagesEngine`** — zero forked detail UI.
- `components/agent-drift/AgentDriftReportHeader.tsx` — shell header via `<PageHeader>` (tap-button row, same height as agent build — no borders).
- `components/agent-drift/RollupTable.tsx` — sortable per-agent rollup.

**Nav** — `features/shell/constants/nav-data.ts` (primary "Reports" item with `dashboard: true` + "Agent Drift" child; admin-section row). Icons `FileChartColumn` / `GitCompareArrows` in `shellIconMap.ts`.

---

## Invariants

- **The registry is metadata-only.** No data fetching, no JSX — just `ReportDefinition[]`. Data lives in each report's own feature.
- **Agent Drift owns no data layer.** It reads the agent usages RPCs (`agx_usage_report` / `_admin`) via `useDriftReport` and reuses the agents `AgentUsagesEngine` for drill-in. The reports feature is the shell; the agents feature owns the drift domain. See [`features/agents/FEATURE.md`](../agents/FEATURE.md) → **Find Usages & Drift**.
- **Admin gating is inherited from the `(admin)` route layout** (super-admin); the underlying admin RPCs also enforce `is_super_admin()`.

---

## Related features

- **Agents** (`/agents/admin`) — owns the drift domain Agent Drift reports on.
- **Messaging** — drift notifications (sent from the find-usages UI) ride DM `action_data` chips.

---

## Change log

- `2026-06-29` — Agent Drift header uses `<PageHeader>` tap-button row (agent build pattern); severity summary moved into rollup table caption. Added `check:page-headers` guard.
- `2026-06-12` — **Module created** with Agent Drift as report #1 (registry + user/admin landings + user/admin agent-drift routes + nav + admin map). Detail pane reuses the agents `AgentUsagesEngine`.
