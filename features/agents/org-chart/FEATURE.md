# FEATURE.md — agent org chart

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-09-27`

---

## Purpose

Shows how an organization's agents are arranged: who sits under whom. Arman, 2026-09-27: a high-value
employee becomes 50–100 agents, and Orchestras already work like an org chart (managers over managers
over the ones doing the work), so the chart is real structure, not decoration.

## The two kinds of link — and only two

| Kind | Where it comes from | Enforced? | Drawn as |
|---|---|---|---|
| **Automatic** | An Orchestra: its Conductor over its members. A member that is itself an Orchestra brings its whole team, recursively. Nobody maintains it by hand. | Yes — the Conductor directs them at run time | solid, `--primary` (on the builder canvas: the Orchestra's accent) |
| **Manual** | A person records "this agent sits under that one". | No — the agents don't act on it | dashed, `--warning` |

Both render in ONE chart, and mix freely (a manual box can sit above an automatic subtree). Tokens and
colours: `constants.ts` (`AGENT_ORG_EDGE_KINDS`).

## Data — no new table

- Automatic links ARE the Orchestra member edges (`features/agents/docs/ORCHESTRAS.md`).
- Manual links: `platform.associations` agent → agent, **role `org_chart`, manager = source, report =
  target** (same direction as a member edge), written only through `associationsService` via
  `orgChartService.ts`. The `agent → agent` pair is already registered in `platform.association_types`
  (open label, `allows_loops = false`).
- One manual manager per agent: `setManualManager` replaces any earlier placement and refuses a loop.
- Redux: `orchestras.manualOrgChart` in the orchestras slice; thunks in
  `features/agents/redux/orchestras/orgChartThunks.ts`.

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
- The drawing is the shared `components/official/org-chart/OrgChart.tsx` — THE org chart primitive for
  any hierarchy (layout adapted from Paperclip, MIT, credited in `layout.ts`). Never a second one.

## Change log

- 2026-09-27 — Created (Claude Opus 5.5, with Arman): automatic + manual links, one UI, nested
  Orchestras on the builder canvas.
