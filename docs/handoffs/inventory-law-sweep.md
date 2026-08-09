---
status: active
updated: 2026-08-09
repos: [matrx-frontend]
vision: [/Users/armanisadeghi/code/common-docs/policies/no-dead-ends.md]
---

# Inventory Law sweep — surfaces built without looking at what the platform gives them

## Vision — Arman's words (2026-08-08)

> "We have so many features, and they're just not used. We cannot have amazing,
> powerful code dying in a corner because an agent was too lazy to go looking
> before it built a feature."

**LAW 2 — THE INVENTORY LAW.** You may not build a surface before you know what
the platform already gives it. Reuse-first says *don't build a second one*; this
is the other half and the harder one: **don't build a poorer one.** Failing to
reach for a primitive that exists is the same defect as forking it — the user
gets the weak surface either way, and the strong code rots unused.

Full doctrine, the inventory pass, and the smell list:
`/Users/armanisadeghi/code/common-docs/policies/no-dead-ends.md` §LAW 2.

## Resources

- **Skill:** `no-dead-ends` (step 1 is the inventory pass, with the exact
  greps). Also `docs/reuse-first.md` — the ladder and the Primitives Index.
- **Scoreboard:** `/administration/reporting/dead-ends`, filtered to the
  **`no-doors-in-file`** rule — that rule *is* this campaign's detector. Each
  row's **Copy repair brief** button hands you the work order.
- **Detector:** `pnpm check:dead-ends --rule=no-doors-in-file`.
- **The primitives a surface most often fails to reach for:**
  | Need | Primitive |
  |---|---|
  | name → route + new tab + peek | `components/official/entity-ref/EntityRef.tsx` |
  | route + icon + label per token | `getEntityInfo(token)` — `features/scopes/registry/entityRegistry.ts` |
  | non-blocking preview | `hasPeek` (`features/organizations/peek/kinds-list.ts`) + `<ResourcePeekHost>` |
  | record actions | the entity's action registry, e.g. `features/agents/browse/agentActionRegistry.tsx`; `components/official/item/` |
  | a list page | `<EntityListPage config={…} />` — `lib/entity-list/` |
  | a table | `MatrxDataTable` — `components/official/matrx-data-table/` |
  | open beside the work | `features/overlays/openers/` + `features/window-panels/` |
- **Reference implementation:** `features/admin/agent-slots/AgentSlotsConsole.tsx`.

## Remaining work

The `no-doors-in-file` rule flags a file that reads real records, names them,
and imports **no** door mechanism at all — no `next/link`, no `EntityRef`, no
router, no overlay opener. That is the inventory pass skipped wholesale, and it
is the highest-confidence signal we have for this law.

**Baseline 2026-08-09: 9 files.** Deliberately short — earlier cuts flagged 21
and then 16, and audits found most of those DID own a door the checker could
not see (a local `scopeHref` helper, an `openFilePreview` import, a row whose
`onClick` hands the handler the record's own id). The rule was tightened each
time rather than left noisy. Do the inventory pass ONCE per feature.

1. **Agent comparison (2)** — `features/agent-comparison/components/MasterInputWindow.tsx`,
   `RunsComparisonTable.tsx`. The whole feature was built blind (5 findings, all
   high). A comparison must also **state the verdict, not a timestamp**
   (corollary 3) — check that too.
2. **Agents (2)** —
   `features/agents/components/inputs/smart-input/RunSkillPicker.tsx`,
   `features/agents/ui-first-tools/ui/lists/TaskPanel.tsx`. TaskPanel is the
   sharpest case in the list: it makes a task title a `<button>` that opens an
   **inline rename**, so the user can edit the record's name but can never reach
   the record. An affordance that looks like a door and isn't is worse than none.
3. **Scopes & skills (2)** —
   `features/scopes/components/entity-context/EntityScopeTagger.tsx`,
   `features/skills/components/SkillResourcesPanel.tsx`. Both name records the
   platform can open; neither `scope` nor `skill` has a registry route yet (see
   the registry-gaps table in `no-dead-ends-sweep.md` — 11 and 3 findings
   respectively), so these two are gated on that decision.
4. **Code library (1)** — `features/code/views/library/LibraryTreeNode.tsx`.
5. **Surfaces (1)** — `features/surfaces/components/bind/SurfaceAgentBindPanel.tsx`.
6. **Demos (1)** — `app/(dev)/demos/scopes/context-lab/page.dev.tsx`. Demos are
   in scope; the doctrine has no size threshold.

Two files that appeared on the 2026-08-09 morning cut —
`features/notes/components/mobile/MobileNotesList.tsx` and
`features/files/components/surfaces/MobileStack.tsx` — dropped off when the
row-detection gates were tightened that afternoon. They were false positives,
not fixes.

**Beyond the nine**, this law is not fully machine-detectable — the checker
sees a *missing import*, not a *poorer surface*. The scoreboard's worst-features
ranking is the better hunting ground, and `scripts/dead-ends/FEATURE.md`
§ Known limits says what the detector cannot see (notably: `hooks/`, `utils/`,
`providers/` and `packages/` are not scanned at all).

### What "done" looks like for one file

Not "added a link". Run the pass and write the result into your summary:

1. Which entities does this surface display? For each — registry entry, route,
   icon, peek, action menu, overlay opener, window panel?
2. What can these entities do elsewhere? If the canonical action registry has
   eleven actions and this surface has three, you owe the other eight or an
   explanation.
3. What does the **best** existing surface for this entity look like? Yours may
   be smaller in scope. It may not be dumber about the same object.
4. What did you hand-roll? Each piece is either a primitive you failed to find
   (go find it) or one the platform is missing (build it generically, in the
   shared location, then consume it — the task is the probe, the primitive is
   the deliverable).

### Known parallel surfaces to collapse while sweeping

Spotted by the detector's worst-files ranking, both doctrine violations in their
own right:

- `components/admin/state-analyzer/sliceViewers/agent-definitions/AgentDefinitionSliceViewer.tsx`
  and `…ViewerShadcn.tsx` — two viewers of the same slice, both printing agent
  ids as text. Collapse to one.
- The applet builder's `SmartAppList` / `AppListTable` / `MultiAppletSelector` /
  `SmartAppletList` family — hand-rolled list surfaces beside `lib/entity-list/`.

## Done

- `no-doors-in-file` detector + the scoreboard's rule filter — see
  `scripts/dead-ends/FEATURE.md`.

## Decisions needed

**Situation.** The applet builder (`features/applet/`) carries several
hand-rolled list/table surfaces that the canonical `lib/entity-list/` shell
would replace, but `features/applet` sits in the transitional group and may be
on its way out. Rebuilding a surface that is scheduled for deletion is waste.

**Decide.** Is `features/applet` being replaced (in which case leave its
surfaces alone and note them as knowingly-skipped), or is it staying long
enough to justify migrating its lists onto `lib/entity-list/`?
