# FEATURE.md — agent org chart

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-09-27`

---

## Purpose

Shows how an organization's agents are arranged: who sits under whom. Arman, 2026-09-27: a high-value
employee becomes 50–100 agents, and Orchestras already work like an org chart (managers over managers
over the ones doing the work), so the chart is real structure, not decoration.

## Boxes and links

**Boxes** (any can sit under any): **Agent** (an Orchestra's Conductor is an agent),
**Person** = a `membership` (their place in ONE organization — `iam.has_access` has no rule for a
bare `user`), **Team** (`iam.team`), **Position** (`agent.position`, a named seat a person may
fill — vocabulary row ruled 2026-10-04). Box ids are `type:entityId` (`constants.ts`).

**Link types** are a registry (`ORG_LINK_KIND_META`), not code paths:

| Type | Tree or arrow | Enforced? | Drawn as |
|---|---|---|---|
| **Directs** | tree | yes — an Orchestra; derived from its member edges | solid `--primary` |
| **Reports to** | tree (one manager per box) | no | dashed `--warning` |
| **Hands off to** | arrow across the tree | no — work passes on and doesn't come back | `--success` arrow |
| **Dotted line** | arrow across the tree | no — advises, no authority | dashed muted arrow |

## Data — no new link table

- Directs links ARE the Orchestra member edges (`features/agents/docs/ORCHESTRAS.md`).
- Every other link: `platform.associations`, **role `org_chart`**, source = the box above (or the
  arrow's start), target = the box below (or its end), type in `metadata.link_kind`. All 16 pairs of
  {agent, membership, team, position} are registered in `platform.association_types` (no access
  conveyed). Written only through `associationsService` via `orgChartService.ts`.
- One recorded manager per box; a tree loop is refused (read fresh from the server); hand-offs may loop.
- Positions: `positionsService.ts` (canonical entity, certified; `agent` schema because `iam` is
  write-through-doors only). A new position lands in the active organization, shown and changeable in
  the picker — never a silent wait on the organization gate.
- Redux: `orchestras.manualOrgChart` (links + positions). Refreshes MERGE; links leave the store only
  through the remove thunks (a read racing a save once erased a new link).

## Entry points

- `/agents/org-chart` — the whole chart the viewer can see (`components/AgentOrgChartPage.tsx`).
- `/agents/orchestras/[conductorId]?view=chart` — the chart rooted at one Conductor.
- The Orchestra builder **canvas** shows each member's own team (nested Orchestra and manual reports)
  beneath it, read-only, with a "Team of N" toggle (`OrchestraBuilderCanvasImpl.tsx`).
- `/agents/orchestras` header → "Org chart".

## How it is built

- `buildAgentOrgForest.ts` (pure, tested) turns Orchestras + manual links into the forest. An agent
  under several parents appears under each and says how many other places it holds; a loop is cut where
  it closes and labelled; an agent only reachable inside a loop still gets a tree.
- `useAgentOrgChart.ts` loads level by level: Orchestra list → every reachable Orchestra's members →
  manual links of every reachable agent, until nothing new appears.
- `useOrgChartActivity.ts` — live activity on every agent box: running (×N), stalled, or how its last
  run ended and when. Read from `chat.user_request` (row security decides which runs a viewer sees),
  kept live by one realtime channel (the table is in the `supabase_realtime` publication), re-read on
  reconnect. Knobs: `agents.org_chart.activity_window_hours`, `agents.org_chart.stalled_after_minutes`.
  Cards read it through context, so a status tick never re-lays the chart.
- The drawing is the shared `components/official/org-chart/OrgChart.tsx` — THE org chart primitive for
  any hierarchy (layout adapted from Paperclip, MIT, credited in `layout.ts`). Never a second one.

## Change log

- 2026-10-05 — Live activity across the whole chart (any run the viewer may see, from any surface).
  Second review fixed: a cancelled drag never unplaces; a touch hold no longer also opens the menu;
  remembered view per chart; removed or re-typed links are not undone by an older read; a failed
  placement keeps the pair's hand-off; directory failures shown with Retry; fill picker scoped to
  the position's organization.

- 2026-10-04 — Link types as a registry (directs / reports to / hands off to / dotted line);
  drag to move with Undo, multi-select, right-click, "+", keyboard, branch focus, deep links,
  remembered view; Person (membership), Team and Position boxes with one picker; positions
  (`agent.position`) with rename / fill / delete; `@ai-matrx/associations` 0.13.146.

- 2026-09-28 — Separate trees wrap into rows to fit the screen; phone layout fixed (the chart layer opts
  out of the phone `max-width: 100%` default that collapsed cards); canvas teams reuse the shared stacked
  layout with one trunk line; independent review findings fixed (safe moves, whole reads past the
  1000-row cap, loop check read fresh from the server, failed Orchestras say so).
- 2026-09-27 — Created (Claude Opus 5.5, with Arman): automatic + manual links, one UI, nested
  Orchestras on the builder canvas.
