---
name: no-dead-ends
description: The concrete matrx-frontend recipe for THE DOOR LAW and THE INVENTORY LAW — if the UI names a record it must open it (open / new tab / peek / window), every resolvable relationship is rendered AND linked, every detected problem ships with its one-click fix, and no surface is built before its builder inventories the primitives that already exist. Use BEFORE building or fixing any surface that displays a record — a table cell, a list row, a dialog that names an agent/note/task/file, a health or drift badge, a "you're using X" warning, a comparison panel, an id or a count. Triggers on "this UI is useless", "there's no link to X", "why can't I click this", "add links to X", "dead end", "no way to open", EntityRef, peek, "open in new tab", "open in window", or an assignment from the no-dead-ends sweep campaign. NOT for page-level chrome (use core-route-headers) or for choosing what data to show (use canvas-doctrine).
---

# no-dead-ends — every identity is a door, every capability is on the table

**Read the doctrine first:** `/Users/armanisadeghi/code/common-docs/policies/no-dead-ends.md`.
It is canonical and cross-repo. This skill is the *frontend mechanics*: which
primitive to reach for, how to wire it, and how to prove it.

## The two laws, one paragraph

If the UI names a thing that has an id in our database, the user must be able to
reach it — **THE DOOR LAW**. And you may not build the surface before you know
what the platform already gives it — **THE INVENTORY LAW**. A surface that
prints "Deep Web Research Agent" as a `<span>` fails both: the agent has a
route, an icon, a peek, an action registry, a lineage index, and a sync window,
and the surface used none of them.

## Step 1 — the inventory pass (before the first line)

For every entity the surface names, run these and write the results into your
summary:

```bash
# Does it have a canonical route + icon?  → getEntityInfo(token).hrefFor
grep -n "hrefFor" features/scopes/registry/entityRegistry.ts

# Does it have a peek?
cat features/organizations/peek/kinds-list.ts

# Does it have an action registry / row-actions hook?
ls features/*/browse/*ActionRegistry.tsx components/official/item/

# Does it have an overlay opener or a window panel?
ls features/overlays/openers/ | grep -i <entity>
ls features/window-panels/windows/<entity>/
```

"Found nothing" is only acceptable when it names the queries you ran.

## Step 2 — put the doors on

**Use `EntityRef` (`components/official/entity-ref/EntityRef.tsx`).** It is the
Door Law made importable — name → route, plus new-tab, plus peek, all resolved
from the registries. Never hand-roll a name link.

```tsx
import { EntityRef } from "@/components/official/entity-ref/EntityRef";

<EntityRef token="agent" id={row.agentId} name={row.agentName} />

// Same record lives in two shells (system vs personal agents): override href.
<EntityRef token="agent" id={id} name={name} href={agentHref(id, agentType)} />

// Surface-specific extra doors go in `extraActions` — never forked into a copy.
<EntityRef token="note" id={id} name={title} extraActions={<OpenInWindowButton …/>} />
```

Safe inside clickable rows — every control stops propagation. Worked reference:
`features/admin/agent-slots/AgentSlotsConsole.tsx` (Agent column, Pin column,
Health column, and the drawer's identity card).

**Missing a door?** Fix the *registry*, not the call site:

| Missing | Fix |
|---|---|
| Route | add `hrefFor` to the token in `features/scopes/registry/entityRegistry.ts` |
| Peek | add the kind to `features/organizations/peek/registry.ts` **and** `kinds-list.ts` (a dev-time guard screams if they drift) |
| Window | register an opener under `features/overlays/openers/` (see the `overlay-system` skill) |

**Never import `features/organizations/peek/registry.ts` for the availability
check** — it statically imports 19 peek components. Import `hasPeek` from
`kinds-list.ts` and render the one dynamic edge, `<ResourcePeekHost>`.

## Step 3 — the corollaries (where the real damage lives)

1. **Render every relationship you can resolve, with its own door.** For agents
   the lineage is free: `selectAgentLineageIndex` /
   `selectAgentLineage` (`features/agents/redux/agent-definition/selectors.ts`)
   derive parent / children / **systemTwin** from the slice — zero extra
   queries. The twin can be a PARENT (personal copy of a system agent) or a
   CHILD (system agent promoted from a personal one); handle both.
   Cold surface with no slice? `fetchLinkedCounterpart` (thunks.ts) round-trips.

2. **Ship the fix beside the complaint.** "NOT a system agent" must come with
   the repin button and the twin's link, not a scolding badge.

3. **State the verdict, not the timestamp.** "Last synced Apr 29" is not an
   answer. Say identical / what differs / link to the diff.

4. **Never render an id you can't open**, and **never report green for data you
   couldn't read** — an unresolvable reference is its own loud state
   (`unresolved pin` in the slots console), never `ok`.

5. **A count is a door.** `3 overrides` reaches those overrides.

## Step 4 — prove it

- Browser: every named record shows Open / new-tab / peek. `read_page` and
  confirm the `link "Open X"` / `button "Quick look at X"` / `link "Open X in a
  new tab"` nodes exist per row.
- Data logic (lineage, twin resolution, health): a unit test, because the
  interesting rows are usually invisible to the test account under RLS —
  `features/agents/redux/agent-definition/__tests__/lineage-selectors.test.ts`
  is the pattern. Never claim a path works because it "should".
- Say plainly in your summary what you verified in a browser vs. by test.

## Anti-patterns — fix on sight

- `<span>{record.name}</span>` where `hrefFor` exists.
- A red badge naming a problem with no action next to it.
- A drawer that opens on a *picker* instead of showing what the user has.
- A local `<Dialog>` preview when a peek is registered for that kind.
- A hand-rolled row-action list beside an existing action registry.
- A bare UUID cell.
