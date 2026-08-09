---
status: active
updated: 2026-08-09
repos: [matrx-frontend]
vision: [/Users/armanisadeghi/code/common-docs/policies/no-dead-ends.md]
---

# No Dead Ends sweep — put a door on every named record

## Vision — Arman's words (2026-08-08)

> "It looks the part, but then it's just complete garbage. It's telling me I'm
> using one of my own agents, not a system agent. That's cool that the system
> gives me that data. But now I'm trying to do something about it, and the
> system is just missing all the tools I would need to do something about it.
> Where's the link to my agent? Where's the button I just click that opens a new
> tab to show me my agent?"

> "The entire Internet was built on that concept — that you refer to a site, you
> link to it. Yet within our own app, we refer to agents, but we don't link to
> the agent."

**LAW 1 — THE DOOR LAW.** If the UI names a thing that has an identity in our
system, the UI must let the user reach it. Four doors, in this order: **Open**
(always) · **New tab** (whenever navigating costs the user their state) ·
**Peek** (whenever the next question is "which one is that?") · **Window**.
No size threshold — admin, demos, dialogs and toasts are all in scope.

Full doctrine, corollaries and the "done means" checklist:
`/Users/armanisadeghi/code/common-docs/policies/no-dead-ends.md`.

## Resources

- **Skill:** `no-dead-ends` — invoke it before touching any surface here.
- **The scoreboard: `/administration/reporting/dead-ends`.** Ranked, filterable,
  every row opens its source line and its route, and every row/file/feature has
  a **Copy repair brief** button that hands you a paste-ready work order. Start
  there, not here — this doc is the standing brief; the scoreboard is the live
  worklist.
- **Detector:** `pnpm check:dead-ends` · scoped: `--path=features/notes` ·
  contract + how to add a rule: `scripts/dead-ends/FEATURE.md`.
- **Door primitive:** `<EntityRef token=… id=… name=… />`
  (`components/official/entity-ref/EntityRef.tsx`) — name → route + new tab +
  peek, all resolved from the registries. Never hand-roll a name link.
- **Registries to fix instead of the call site:** routes →
  `features/scopes/registry/entityRegistry.ts` (`hrefFor`); peeks →
  `features/organizations/peek/registry.ts` **and** `kinds-list.ts` together.
- **Reference implementation:** `features/admin/agent-slots/AgentSlotsConsole.tsx`
  (Agent / Pin / Health columns + the drawer identity card).
- **Login for verification:** `/login`, `admin@admin.com` / `Password1234#`.

## Remaining work

Ordered by high-severity density. `high` = the entity already has an `hrefFor`,
so the fix is one `<EntityRef>`. Refresh the numbers with
`pnpm check:dead-ends:write` after each batch and commit the snapshot.

**Baseline 2026-08-09: 170 findings · 90 high · 108 files · 6,803 scanned.**
(bare id as text 89 · unlinked name 61 · unlinked count 4 · no doors at all 16)

1. **`features/notes` — 13 findings, 13 high.** Every one high: `note` has a
   route, so each is one `<EntityRef>`. `NoteInfoPanel.tsx`,
   `GlobalSearchResults.tsx` and `components/mobile/MobileNotesList.tsx` also
   import no door primitive at all. Cheapest whole feature to clear.
2. **`components/admin` — 17 findings, 9 high.** The state-analyzer slice
   viewers (`AgentDefinitionSliceViewer.tsx` + `…ViewerShadcn.tsx`) print agent
   ids as text. **Collapse the two viewers into one while you are in there** —
   a `…Shadcn` twin of an existing viewer is its own doctrine violation.
3. **`features/agents` — 11 findings, 9 high.** The feature the rant was about.
   `agent-sets/components/AgentLibraryRail.tsx` and
   `components/inputs/smart-input/RunSkillPicker.tsx` have no door primitive.
4. **`app/(dev)` — 28 findings, 8 high.** Demos are explicitly in scope; the
   doctrine has no size threshold.
5. **`features/files` — 9 findings, 8 high.** All three surface shells
   (`EmbeddedShell`, `MobileStack`, `WindowPanelShell`) lack a door primitive
   while naming files; `file` has an `hrefFor`.
6. **`features/window-panels` (6/6)**, **`features/agent-comparison` (5/5)**,
   **`features/surfaces` (5/4)**, **`components/debug` (6/3)**,
   **`features/tasks` (5/3)**, **`features/resource-manager` (3/3)**.
7. **Then the medium tail** — tokens with no route. See "Registry gaps" below;
   ~33 mediums turn into fixes the moment their token gets an `hrefFor`.

### Registry gaps — fix once, clear many findings

Tokens the detector met that have **no `hrefFor`**, by how often they appear.
Each one is a registry line, not a per-call-site fix:

| Token | Findings | Note |
|---|---|---|
| `scope` | 14 | Needs a canonical scope route decision first. |
| `organization` | 8 | `/administration/users/organizations` is admin-only; a user-facing org route may not exist yet. |
| `skill` | 4 | |
| `app` | 2 | Agent apps — `/apps/{id}` exists in the transitional group; confirm the target before wiring. |
| `agent_shortcut` | 2 | |
| `project` | 2 | |
| `quiz_session` | 1 | |

**Not in the registry at all:** `broker` and tool-call ids are real records here
(`features/agent-context/FEATURE.md`; aidream's `cx_tool_call` + `/mcp/debug-traces`)
but have no entity token, so the detector can only rank them as unresolved.
Registering them is a prerequisite for those findings to be actionable.

**Do not mint a dead link.** `crm_campaign` is the precedent already in the
registry: no `hrefFor` because the builder does not exist yet, stated in a
comment. If a route genuinely does not exist, the work is to build it or to
record why not — not to point `hrefFor` at a 404.

### Corollaries the detector cannot see — check by hand per surface

The checker finds missing doors. It cannot find these, and they are where the
real damage lives (doctrine §Corollaries):

- **A resolvable relationship rendered but not linked** — parent / child /
  system twin / owner / source / version. For agents this is free:
  `selectAgentLineageIndex` (`features/agents/redux/agent-definition/selectors.ts`).
- **A detected problem shipped without its one-click fix** — a red badge naming
  a problem with no action beside it.
- **A comparison that states a timestamp instead of a verdict** — say
  *identical* / *what differs* / link the diff.

## Done

- Detector + scoreboard + ESLint rule built — see `scripts/dead-ends/FEATURE.md`.
- `EntityRef` primitive + Agent Slots console rebuilt on it — see
  `features/admin/agent-slots/AgentSlotsConsole.tsx`.

## Decisions needed

**Situation.** Seven entity types are named across the UI but have no canonical
route in the entity registry, so ~33 findings cannot be fixed at the call site
— the biggest are `scope` (14), `organization` (8) and `skill` (4). Some have
a page today in a transitional route group; some (a user-facing organization
page, a scope detail page) may not be intended to exist at all.

**Decide.** For each: is there a canonical route we should point `hrefFor` at
today, is one worth building, or should that entity deliberately have no door
(and the surfaces stop naming it as if it were openable)?
