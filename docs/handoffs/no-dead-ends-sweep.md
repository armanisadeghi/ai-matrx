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

**Baseline 2026-08-09: 165 findings · 66 high · 105 files · 6,803 scanned.**
(bare id as text 111 · unlinked name 35 · unlinked count 11 · no doors at all 8)

1. **`features/notes` — 11 findings, 11 high.** Every one high: `note` has a
   route, so each is one `<EntityRef>`. `NoteInfoPanel.tsx` and
   `components/mobile/MobileNotesList.tsx` also import no door primitive at all.
2. **`components/admin` — 18 findings, 9 high.** The state-analyzer slice
   viewers (`AgentDefinitionSliceViewer.tsx` +
   `AgentDefinitionSliceViewerShadcn.tsx`) print agent ids as text.
   **Collapse the two viewers into one while you are in there** — a `…Shadcn`
   twin of an existing viewer is its own doctrine violation.
3. **`app/(dev)` — 33 findings, 11 high.** Demos are explicitly in scope.
   Biggest: `demos/context-menu/surface-mappings/page.dev.tsx`,
   `demos/local-tools/documents/page.dev.tsx`.
4. **`features/agents` (6/5)** and **`features/agent-comparison` (5/5)** — the
   feature the rant was about. Every agent-comparison file also lacks a door
   primitive entirely, and a comparison must **state the verdict, not a
   timestamp** (corollary 3) — check that in the same pass.
5. **`features/surfaces` (6/4)**, **`features/window-panels` (4/4)**,
   **`components/debug` (6/3)**, **`app/(admin)` (8/2)**.
6. **Then the medium tail** — tokens with no route. See "Registry gaps" below;
   ~28 mediums turn into fixes the moment their token gets an `hrefFor`.

### Registry gaps — fix once, clear many findings

Tokens the detector met that have **no `hrefFor`**, by how often they appear.
Each one is a registry line, not a per-call-site fix:

| Token | Findings | Note |
|---|---|---|
| `scope` | 11 | Needs a canonical scope route decision first. |
| `organization` | 5 | `/administration/users/organizations` is admin-only; a user-facing org route may not exist yet. |
| `project` | 3 | |
| `app` | 2 | Agent apps — `/apps/{id}` exists in the transitional group; confirm the target before wiring. |
| `skill` | 2 | |
| `seo_keyword` | 2 | |
| `agent_shortcut`, `quiz_session`, `transcript` | 1 each | |

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

**Situation.** Nine entity types are named across the UI but have no canonical
route in the entity registry, so ~28 findings cannot be fixed at the call site
— the biggest are `scope` (11), `organization` (5) and `project` (3). Some have
a page today in a transitional route group; some (a user-facing organization
page, a scope detail page) may not be intended to exist at all.

**Decide.** For each: is there a canonical route we should point `hrefFor` at
today, is one worth building, or should that entity deliberately have no door
(and the surfaces stop naming it as if it were openable)?
