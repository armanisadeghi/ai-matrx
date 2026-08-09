# THE INVENTORY LAW SWEEP — powerful primitives that nothing uses

**Status:** active, long-running (weeks). **Owner:** rotating agents.
**Doctrine:** `/Users/armanisadeghi/code/common-docs/policies/no-dead-ends.md` LAW 2 ·
`docs/reuse-first.md` · `PRINCIPLES.md` · the `no-dead-ends` skill.

> Reuse-first says *don't build a SECOND one*. This sweep is the harder half:
> **don't build a POORER one.** A surface that hand-rolls a weak version of
> something we already own is the same defect as forking it — the user gets the
> weak surface either way, and the strong code rots.

Arman, 2026-08-08: *"We have so many features, and they're just not used… We
cannot have amazing, powerful code dying in a corner because an agent was too
lazy to go looking before it built a feature."*

**How to work a wave:** pick a primitive → establish the "using it well" bar
from its best consumer → convert surfaces in traffic order → **delete the
hand-rolled code as you go** (no shims, no fallbacks) → `pnpm type-check` →
browser-verify → commit → `./scripts/release.sh`. Extend the primitive when a
surface genuinely needs more; never exempt the surface. If a primitive is
nearly-unused because it is genuinely *bad*, say so to Arman with evidence
instead of mass-adopting it.

**This campaign IS a registered Pattern Patrol.** CLAUDE.md's Pattern Patrols
section lists "unused primitives" among the 10 live patrols
(`common-docs/systems/pattern-patrols/PATROL_REGISTRY.md`), so this sweep is the
standing patrol for that pattern, not a one-off. Two consequences: a fix batch
from here wants **certification by a second adversarial agent** (that is the
patrol contract, and it is what caught five real defects on PR #72), and a
violation you spot while off-mission goes to
[`.matrx/PATROL_SIGHTINGS.md`](../../.matrx/PATROL_SIGHTINGS.md) as one line
rather than being fixed mid-task. Invoke the `pattern-patrol` skill for the
mechanics.

**Respect THE FRAGMENTATION LAW.** Invoke the `code-splitting` skill before
changing how anything enters a chunk. Mass-adopting a heavy primitive across
many surfaces is exactly how this repo OOM-killed 14 production builds. Measure
build time as you go.

---

## THE CONVERSION CHECKLIST — read before replacing any hand-rolled door

Ten review findings have landed on the Wave 2/3 PR so far. **Most were the same
mistake in different clothes:** a conversion changed what the original door DID.
Two later ones (6 and 7 below) are a distinct class worth knowing about — a
conversion that is correct on the main deployment and broken on a satellite, and
one that is correct for the surface's rare case and wrong for its common one. Adopting `EntityRef` is not a drop-in — the hand-rolled code
it replaces encodes decisions you must carry over deliberately.

Before replacing hand-rolled code with a shared primitive, answer all eight.
1-3 and 6-7 are door-specific; 4, 5 and 8 apply to ANY primitive adoption:

1. **Where did the old primary click go?** `router.push` (in place) or
   `window.open` (new tab)? Preserve it. A rail, sheet, side panel, or dialog
   must NEVER navigate the current tab — that costs the user the thing the
   surface is embedded in. Use `openInNewTab` for a target swap, `onOpen` for a
   behaviour swap. *(Caught twice: `AssociationList`, `ContainerResourceSheet`.)*

2. **Could the old control actually open anything?** If the old handler was
   gated on a route existing, `onOpen` must be gated the same way —
   `onOpen={canOpen ? handler : undefined}`. Handing `EntityRef` a no-op
   handler renders a link-styled title that does nothing, which is a dead end
   with extra steps and strictly worse than the inert text you replaced.
   *(Caught in `WarRoomResourcesList`; `AssociationList` had it too.)*

3. **Are you resolving by canonical TOKEN, not by a local key?** Six org
   catalogue keys differ from their token; keying off the key silently loses
   both the route and the peek for exactly those six.

4. **Does the primitive's value range exceed the surface's?** A shared type is
   usually WIDER than any one consumer. `ListViewPrefs["view"]` allows
   `table | cards | rows`, but a Cards/Table hub only renders two of those —
   read `prefs.view === "table" ? "table" : "cards"`, never raw. Reading raw
   let the layout fall through to cards while NEITHER toggle rendered as
   selected. Narrow on read; never cast, and never widen the shared type to
   fit one caller. *(Caught in `ProjectsHub`.)*

5. **Does the route you're now pointing at exist?** Verify the page file AND
   that the id TYPE matches (a session id is not an assessment id; a card id is
   not a set id). Where no route exists, render plain text — never fabricate.

6. **Which DEPLOYMENT does this surface ship in?** The registry's canonical
   route is not canonical everywhere. `manage.aimatrx.com` (`admin` profile)
   and `demos.aimatrx.com` PARK the other route groups, and `proxy.ts`'s
   satellite gate redirects any foreign path to the main host — so on an admin
   surface, `hrefFor` → `/agents/{id}` is not a different page, it is a
   different ORIGIN, and following it throws away the console with all its
   filters and grouping. Pass `EntityRef.href` with the admin-side route (the
   prop is documented for this). **Tell:** the component takes a `mode` prop, or
   sits under `app/(admin)`, or its neighbours already resolve their urls
   through a mode-aware helper — if the other urls on the row branch on mode and
   yours doesn't, yours is the bug. *(Caught in `ShortcutDirectory`; the fix
   lives in `resolveAgentUrl`, beside the two mode-aware helpers that existed
   already.)*

   **The precise rule, checked against `proxy.ts:128`** — the gate redirects to
   `new URL(pathname + search, MAIN_HOST)`, so it **preserves the path**: the
   record IS reached, just on the other origin. So this is not "never use a
   registry route on an admin surface". It is:
   - **Same-tab** navigation off a satellite is the bug — a full cross-origin
     load that costs the console, the list, and every filter. Fix it.
   - **`openInNewTab`** makes a registry route acceptable anywhere: the console
     survives, the record opens on the origin that actually serves it. This is
     why the two admin-relationship surfaces converted in the same wave are
     fine — they pass `openInNewTab`, chosen to protect the audit, which turns
     out to be exactly the right mitigation for the origin hop too.
   - **An admin-side route, when the entity has one**, is better than either.
     `agent` does; most tokens an audit lists do not.

7. **Is the name you're passing ever null on the surface's DOMINANT case?**
   `EntityRef` truncates an id to 8 chars when it has no name — right for a
   record whose title just hasn't loaded, wrong when the name is *structurally*
   absent. `adminNonGlobalRowToDirectoryRow` hardcodes `agentName: null`, so
   every admin row lost the full id it used to print, while the filter dropdown
   beside it still listed full ids to match against. When the id IS the
   information, **pass the id as `name` — plus `wrap`**, or it renders
   TRUNCATED and you have destroyed the thing you were preserving (see 8).
   *(Caught in `ShortcutDirectory`; the same pattern is deliberate in the
   reachability inspector.)*

8. **Does the primitive's default LAYOUT destroy the content?** Not behaviour —
   *presentation*. `EntityRef` truncates its label because its home is a table
   cell; the audit markup it replaced was `break-all`, deliberately wrapping.
   Converting silently ellipsised the UUID an admin came to copy, and a
   call-site `className` could NOT fix it (that lands on the outer wrapper,
   while `truncate` is on the label element) — so the surface's only escape
   would have been not to use the primitive. **That pressure is the signal to
   extend it**: `EntityRef.wrap` now exists. Before converting, read what the
   old markup did about overflow (`truncate` / `break-all` / `whitespace-*` /
   `line-clamp`) and carry it over deliberately. *(Caught in the events audit
   detail — and I had written "the id stays whole" in a code comment AND a
   commit message while it did not, which is the version of this that stops the
   next reader from checking.)*

Everything the primitive cannot decide for itself is documented on the props;
read them rather than inferring from a neighbouring call site.

---

## Two constraints the next agent must know

**1. EVERYTHING HERE IS LIVE — do not write "not deployed yet".** CLAUDE.md
(§ YOU commit and YOU deploy): a PR/branch session's code **auto-merges to
`main` and goes live within ~30 minutes**; nobody reviews PRs, and you must not
spend output deciding what to do with yours. An earlier revision of this doc
told the next agent to treat the work as pending a ship decision — that was
wrong, and it was written before the doctrine landed (`2b4e7854`). Corrected.

The one true observation underneath it: **a Vercel PREVIEW never COMPLETES for
a branch here.** The release-prefix gate (`scripts/vercel-ignore-build.sh`)
marks every non-release-prefixed commit `Ignored`, previews included (verified
2026-08-09 across all three projects). So "browser-verified" cannot mean a
preview URL — use a local `pnpm dev`, or verify the LIVE app after the merge
lands.

**Precision that matters if you are watching the PR:** each push DOES flip the
three projects to `Building` for a moment, because the ignore script runs as
part of the build. The status then settles to `Ignored`. An agent that sees
`Building` and waits for a preview URL is waiting for something that will never
arrive — check for the `Ignored` settle, don't poll the preview host.

**1b. `pnpm check:doc-claims` is RED in any cloud/container session, and it is
not your change.** CLAUDE.md links cross-repo docs by absolute path
(`/Users/armanisadeghi/code/common-docs/...`), which only resolves on Arman's
machine — in a remote session common-docs is checked out elsewhere (here:
`/home/user/matrx-common-docs/`), so `doc-paths-resolve` reports ~11 dead
pointers on a clean tree. Verified against `origin/main`. Read past that
failure to the OTHER claims, which are real; do not "fix" it by rewriting the
paths, which would break the check on the machine where it works.

**2. There is sibling work in flight — coordinate before re-doing it.**
As of 2026-08-09 other branches are touching the same doctrine:
- `claude/no-dead-ends-detector-dashboard-vrm0aj` — a dead-ends DETECTOR, an
  admin scoreboard at `/administration/reporting/dead-ends`, and a
  `matrx/no-bare-id-text` ESLint rule. That detector's output should become the
  input to this sweep's Wave 2 list rather than a second hand-built inventory.
- PR #74 (`claude/linked-agent-sync-compare-rnrki6`) is already consuming
  `EntityRef` for linked-agent relatives. EntityRef adoption is no longer
  single-threaded through this campaign — re-count consumers before quoting
  "1 consumer" anywhere.

---

## Audit provenance

Four exhaustive read-only audits, 2026-08-09, over the whole repo. Counts below
are from those audits unless marked **verified** (re-checked by hand — several
audit claims were wrong; verify before acting on a number).

---

## Primitive ledger

| # | Primitive | Real consumers | Verdict | Wave |
|---|---|---|---|---|
| P1 | `features/scopes/registry/entityRegistry.ts` `hrefFor` | **21 tokens** (was 13) | **strong, under-populated** | 1 ✅ |
| P2 | `features/organizations/peek/` (19 kinds) | EntityRef + 2 org surfaces | strong, key-vocabulary mismatch fixed | 1 ✅ |
| P3 | `components/official/entity-ref/EntityRef.tsx` | **13 files, verified** (`git grep -l "entity-ref/EntityRef" -- '*.tsx'` minus the primitive's own dir, 2026-08-09) | adopted; gained `onOpen` / `openInNewTab` / `wrap` / pointer-events-on-hidden-controls | 2 ✅ |
| P4 | `lib/entity-list/` (`EntityListPage`) | **2** (`/agents/all`, `/transcripts`) | strong, 26 bespoke list pages | 4 |
| P5 | `components/official/item/` (`ItemMenuConfig`) | 30 files, mostly sidebars | strong, absent from list pages | 3 |
| P6 | `features/agents/browse/agentActionRegistry.tsx` (23 actions) | **1 route** | strong, 3 rival agent action lists | 3 |
| P7 | `lib/list-views/useListViewPrefs` | **9** | **zero hand-rolled list-style copies left** | 3 ✅ |
| P8 | `features/context-menu-v3/` | 45 files | **healthy** — backlog doc is stale | 5 |
| P9 | `features/window-panels/` (153 entries) | very uneven | strong; 4 dead, ~24 grid-only | 6 |
| P10 | `features/assists/` | **3 producers, 2 render sites** | new (2026-08-08), unadopted | 7 |

---

## WAVE 1 — registry route coverage ✅ SHIPPED (commit `51a28922`)

**The find.** Eleven of the nineteen registered peek kinds had a preview
component and **no route**. The platform had built a previewer for each —
proving they are user-facing records — and `EntityRef` could not link any of
them. Separately, the peek registry is keyed by the **legacy resource-catalogue
vocabulary**, not canonical entity tokens, so a caller passing the *correct*
token silently lost the peek door.

**Done:**
- `hrefFor` added for 8 tokens whose detail route was verified to exist:
  `app`, `agent_shortcut`, `project`, `transcript`, `message_template`,
  `assessment`, `organization`, `sandbox_instance`.
- `transcript` reuses the exact target `primaryRowHref`
  (`features/transcripts/browse/types.ts`) navigates to — one open target.
- `PEEK_KEY_BY_TOKEN` in `EntityRef.tsx` bridges the 4 real token↔peek-key
  mismatches, each verified against the table the peek queries:
  `canvas_item`, `flashcard_data`, `sandbox_instance`, `quiz_session`.
- New overlay entries (icon + label) for `flashcard_data`, `assessment`,
  `canvas_item`, `sandbox_instance`.

**Deliberately NOT done:**
- `skill`, `workflow` — no detail route exists anywhere in `app/`
  (`/agent-connections/skills` is a list; workflows appear only nested under an
  org). An `hrefFor` that 404s is worse than none. **Building those two routes
  is real product work, not a registry edit.**
- `canvas_item` — `/canvas/{id}` 404s. **FOUND_DEFECTS D137.**

**Verification:** `pnpm type-check` clean. Not yet browser-verified.

### Wave 1 remainder (open)
- [ ] Browser-verify a peek+open door on `/agents/all` and one org resource row.
- [ ] **Rename the peek registry keys to canonical tokens** and delete
      `PEEK_KEY_BY_TOKEN`. Touches `features/organizations/resource-catalogue.ts`
      and the two surfaces that key off `entry.key`
      (`OrgResourceDetail.tsx:136`, `ContainerResourceSheet.tsx:97`).
- [ ] Decide + build the `skill` and `workflow` detail routes, then add `hrefFor`.
- [ ] D137: canvas route.

---

## WAVE 2 — EntityRef adoption (IN PROGRESS)

### Shipped

- **`AssociationList`** (`77dd9e16`, `c4d0af3c`) — the generic association row.
  Title `<button>` + duplicate hover `ExternalLink` → `EntityRef`. Every
  association surface (org, scope, project, war-room) gains peek. `EntityRef`
  gained `onOpen` (intercepts only the PLAIN click; modified clicks keep the
  native new tab) so a rail inside a workspace never replaces its container.
- **`ContainerResourceSheet`** — inert `<span>` + hand-rolled Eye peek +
  hand-rolled new-tab `<a>` → `EntityRef`. Resolves by TOKEN.
- **`OrgResourceEntry.token`** — the catalogue now carries the canonical entity
  token beside its legacy `key`. Six keys differ (`agent_app`→`app`,
  `sandbox`→`sandbox_instance`, `flashcard`→`flashcard_data`,
  `quiz`→`quiz_session`, `canvas`→`canvas_item`, `research`→`research_topic`);
  keying off `key` silently lost the route AND the peek for exactly those six.
- **`peekHref` — all 19 peeks now resolve their Open door from the registry.**
  **Six shipped a 404 as the peek's primary action**: `/quizzes/{id}`,
  `/flashcards/{id}`, `/skills/{id}`, `/transcripts/{id}`, `/workflows/{id}`,
  `/canvas/{id}` — none of those routes exist. Two more (`project`,
  `agent_shortcut`) passed no href at all for kinds that DO have a route.
  Nineteen private copies of a fact the registry owns; now one call.
  A kind with no route shows NO Open button, which is honest.

- **`OrgResourceDetail`** — both row types → `EntityRef`. Deleted `openItem`,
  the local `itemHref` share-registry resolver, the `peekId` state, the
  `ResourcePeekHost` mount, and the hover new-tab buttons. `RowContextMenu`
  survives as Share/Unshare only — the actions `EntityRef` does NOT cover.
  Peek moved from buried-in-right-click to inline on every row.
- **`useOrgSharedItems.href`** deleted — it derived from the stale sharing
  registry and had no reader left.
- **`WarRoomResourcesList`** — inert `<p>{title}</p>` → `EntityRef` with
  `onOpen={() => openRow(row)}`, preserving the existing **new tab** (it is a
  rail inside the war room). Dropped the now-duplicate `Open` menu item;
  `ResourceIdCopy` kept (copying a full id is a distinct action).
- **`OutputRefLink`** — the whole component is now one `EntityRef`. Deleted
  `hrefForOutputRef` (the FOURTH private route table) and the `#{id.slice(0,8)}`
  dead-end fallback. Route audit: `conversation` now uses the canonical
  `/chat/{id}`; **`capture` and `workflow_run` have no route and no entity token
  — they render as plain text, no fabricated href.** Both named in the file
  header so they can get a registry route later.
- **`EntityRef.openInNewTab`** (`3cce4904`) — added after review caught the same
  regression twice: replacing a hand-rolled `window.open` with `EntityRef`
  silently turns "open beside my work" into "replace my work". Real
  `target="_blank"`, not a JS intercept.

**All five hand-rolled route/open/peek resolvers named at the top of this wave
are now deleted.**

- **The three rails' `window.open` follow-up** — `OutputRefLink`,
  `WarRoomResourcesList` and `AssociationList` were converted BEFORE
  `openInNewTab` existed, so each kept a `window.open(href, "_blank")` behind
  `EntityRef.onOpen`: the primitive resolving the route while the surface still
  hand-rolled the door. All three now pass `openInNewTab`. **A JS `window.open`
  is strictly worse than the anchor it replaces** — no middle-click, no
  cmd-click, and a popup blocker can eat it. This also deleted both `canOpenRow`
  guards: with the door expressed as an anchor, `EntityRef` degrades to plain
  text by itself when a token has no route, so there is nothing left to guard.
  `openRow` survives in both rails — it still backs `ResourceRowContext.onOpen`,
  the imperative opener handed to custom `renderRow` implementations.
- **`DocumentsHubTable`** — the name was a plain `<span>` in a `router.push`
  row, so `/documents` was reachable by exactly ONE gesture: a left-click that
  replaces the list. Now `EntityRef`; the row's own href comes from the same
  registry entry instead of a second inline template; the triplicate "Open" eye
  button is deleted.
- **`ShortcutDirectory`** — the Agent column printed `agentName ?? agentId`, so
  an unresolved name rendered a bare UUID: the Door Law's explicitly named worst
  case, on the column whose whole job is saying which agent a shortcut runs.
  The 2-branch conditional became 3 deliberately — a row with a name but no id
  kept its plain span rather than being folded into "has id" and dropped.

### Open

- [ ] **THE `<button>`-NESTING BLOCKER — this is a CLASS, not three one-offs.**
      Several remaining targets put the record's name *inside a `<button>`*
      (a collapse toggle, a picker, a selectable card). `EntityRef` renders an
      `<a>` and its controls render `<button>`s, so dropping it in produces
      invalid nesting that React warns about and that breaks click handling.
      **Confirmed at:** `features/notes/components/GlobalSearchResults.tsx:147`
      (collapse toggle) · `features/skills/components/SkillConfigPicker.tsx:486`
      and `:598` (both selection buttons; `skill` also has NO registry route, so
      the only door EntityRef could add there is the peek — and that peek
      control is itself a `<button>`).
      **The fix is the same everywhere and is a small restructure, not a
      substitution:** split the row into a non-button container, keep the
      toggle/select as its own control, and let the NAME be the `EntityRef`.
      Budget it as such — an agent who plans these as drop-ins will produce
      broken markup or, worse, skip them and record them as "done".
- [x] **`GlobalSearchResults` — DONE, and the recipe worked.** The row was one
      `<button>`; it is now a `<div>` that still toggles on click anywhere, with
      the chevron kept as a real `<button>` (stopPropagation, so the container's
      toggle doesn't fire twice and cancel it) and the name as an `EntityRef`.
      **The two constraints a blind conversion would have missed**, both
      load-bearing:
      - `handleMouseDown` preventDefaults on MOUSEDOWN to keep focus in the find
        input — it protects a shipped Ctrl+F re-focus fix. It has to stay on the
        CONTAINER, where it still covers the name and chevron by bubbling.
      - **"Open" here is not the registry route.** `/notes?active={id}` would
        reload the notes app and discard the find state the user is standing in.
        Plain click dispatches the in-app tab switch (`onOpen`); the registry
        route is the cmd/middle-click destination only. This is checklist
        question 1 with a twist — the old door didn't *navigate* at all, so
        "preserve what it did" meant preserving an absence.
- [ ] **`SkillConfigPicker` (both sites) — still open, same class.** The
      name sits inside a selection `<button>` at
      `features/skills/components/SkillConfigPicker.tsx:486` and `:598`. Same
      split applies. Extra wrinkle: `skill` has NO registry route, so the only
      door `EntityRef` can add there is the peek — and that control is itself a
      `<button>`, so the split is mandatory, not cosmetic.
- [ ] **`PinnedSection` is a poor EntityRef target** — it is a card with a large
      colored icon and its own layout, not an inline name reference, and it is
      already a real `<Link>`. What it actually lacks is a peek control; that
      means composing `ResourcePeekHost` on the card, not replacing the card
      body with `EntityRef`. Re-rank it accordingly.
- [ ] **The two `editable` name columns** (`features/agents/browse/columns.tsx`,
      `features/transcripts/browse/columns.tsx`) need the inline-edit interplay
      checked before conversion — both are `editable: "string"` with
      `editTrigger: "pencil"`. `/agents/all` additionally opens
      `AgentActionModal` on row click ON PURPOSE (an agent has four UIs, so
      there is no single "the" route); converting its name to a plain link would
      REPLACE that chooser. The additive form is `onOpen={openActionModal}` plus
      the peek and new-tab controls — verify against the modal, don't assume.
- [ ] `features/war-room/components/thread/ThreadResourcesTab.tsx` —
      `FileResourceRow` renders its own `<p>{name}</p>` via the `renderRow`
      override (it swaps in a media thumbnail). Same dead-end class, missed by
      the sweep because it overrides the row.
- [ ] Nothing here is browser-verified yet.



`EntityRef` is the Door Law made importable and has **one** consumer. Wave 1
made it much more capable; now spend it. Convert in traffic order, **deleting
the hand-rolled equivalent each time**.

**The five hand-rolled route/open/peek resolvers to delete** (this is the
primitive-duplication defect, not merely an adoption gap):

| File | What it hand-rolls |
|---|---|
| `features/scopes/components/associations/AssociationList.tsx:385` | open + hover `window.open` new-tab, no peek — and it already holds `tryGetEntityInfo` at `:186`. **Generic: one conversion fixes every association surface.** |
| `features/organizations/components/OrgResourceDetail.tsx:494,576` | open + new-tab (`:514`) + peek behind right-click. ~60 lines. |
| `features/organizations/components/ContainerResourceSheet.tsx:170` | second copy of the above |
| `features/war-room/components/resources/WarRoomResourcesList.tsx:389` | title text + `window.open` in a menu + a raw UUID beside it |
| `features/scheduling/components/shared/OutputRefLink.tsx:23,39-50` | a **fourth private route table** (`hrefForOutputRef`) that should be the registry |

**Then the top inert-name surfaces** (ranked by traffic):

1. `features/agents/browse/columns.tsx:68` + `AgentBrowseRows.tsx:89` +
   `AgentBrowseCards.tsx:115` — `/agents/all`. Convert all three together or
   one entity gets three behaviours.
2. ~~`features/files/components/surfaces/desktop/FileTableRow.tsx`~~ **SHIPPED**
   — was a bare `<button>`, so no cmd-click/middle-click at all. Now `EntityRef`
   with `onOpen={onActivate}`: the in-app open is unchanged, the name is also a
   real anchor to `/files/f/{id}`, and the file peek arrives with it.
3. ~~`features/dashboard/components/PinnedSection.tsx`~~ **RE-RANKED, not a
   drop-in** — see the Open list above. It is a card, already a link; it wants a
   peek control, not an `EntityRef` body swap.
4. `features/agent-shortcuts/components/ShortcutDirectory.tsx:387` — renders
   **name OR a raw UUID**, both inert.
5. `features/transcripts/browse/columns.tsx:58` — now unblocked by Wave 1.
6. `features/data-tables/components/DocumentsHubTable.tsx:523` — the href
   exists two lines above and is never rendered as a link.
7. `features/tasks/components/TasksTableView.tsx:696` (task) and `:563` +
   `AllTasksView.tsx:162` (project — unblocked by Wave 1).
8. `features/agents/components/builder/AgentResourcesManager.tsx:253` —
   resolves the entity at `:248` and throws the route away.
9. `features/notes/components/GlobalSearchResults.tsx:147` — search results are
   exactly where peek earns its keep.

**Bare-UUID violations** (`never render an id you can't open`).
**Both admin-relationship surfaces are SHIPPED** — `ReachabilityInspectorClient`
(token and id were side by side; the full id is now the LABEL of an `EntityRef`,
so an admin can still copy it AND open it) and `ExposureAuditClient` (the named
resource now opens). Both use `openInNewTab` so the audit survives the click.
Remaining:
`app/(admin)/administration/reporting/events/page.tsx:265-271` (three raw
UUIDs) · `features/skills/components/SkillConfigPicker.tsx:486,598` ·
`features/pdf-extractor/components/LineageTreeView.tsx:97,224,266` ·
`features/administration/kg-cost/components/KgCostDashboard.tsx:279,827`.

---

## WAVE 3 — one action list per entity

**The defect, still live:** `agent` has **three** divergent action lists.
`agentActionRegistry.tsx` (23 entries) is consumed by **one route**.

| Rival list | Consumers | Missing vs registry |
|---|---|---|
| `agent-listings/AgentListDropdown.tsx` (+`AgentDetailCard`,`AgentRow`) | **42** | 20 of 23; favorite star is display-only |
| `agent-listings/AgentCard.tsx` | `/agents/classic` + admin system-agents | 12 of 23; has 2 things the registry only promises as `Soon` |
| `agent-listings/AgentListItem.tsx` | `/agents/classic` list | 13 of 23 |
| `agent-listings/AgentActionModal.tsx` | **the primary click target on all three** | 16 of 23 |

`/agents/classic` is slated for deletion ~mid-Aug 2026, which retires two of
these — but **not** `AgentListDropdown` (42 consumers) or `AgentActionModal`.

- [ ] Point `AgentListDropdown` + `AgentActionModal` at `useAgentRowActions`.
- [x] **Doc lie corrected (2026-08-09).** `agentActionRegistry.tsx` and
      `features/agents/browse/FEATURE.md` both asserted the config drives
      "table row menu, card kebab, **and right-click**". Right-click was never
      wired on any view. Both now say so and point here.
- [ ] **Wire right-click on the canonical list shell** — one change covers BOTH
      `/agents/all` and `/transcripts`. Scouted 2026-08-09:
      - `ItemContextMenu` (`components/official/item/ItemMenu.tsx:419`) already
        takes the same `ItemMenuConfig`, so no new config work.
      - **Blocker:** `MatrxDataTable` has no row-wrapper seam — `rowActions`
        only injects into the actions CELL (`MatrxDataTable.tsx:803`). Needs a
        `rowWrapper?: (row, children) => ReactNode` prop, then
        `EntityListTable.tsx:223` passes `ItemContextMenu`.
      - **NOT a fragmentation risk** (checked): the eslint ban targets
        `MenuContent`/`MobileMenuContent`, the heavy layer, which stays behind
        the shell's dynamic edge. `ItemMenu` already statically imports the thin
        `NonEditableContextMenu`, and `EntityListTable` already imports
        `ItemMenu` — so the chunk graph does not change.
      - **THE REAL HAZARD, and why this wasn't done blind:** `MatrxDataTable`
        has inline-editable cells (`EditableTableCell`). A row-level context
        menu swallows the native right-click inside a text input, destroying
        copy/paste there. Any wiring MUST exclude editable cells (and verify it
        in a browser, which a preview URL cannot do — see constraint 1).
      - Note while there: `ItemContextMenu` hardcodes `sourceFeature="files"`
        for every consumer. Wrong for agents/transcripts; make it a prop.
- [ ] `useListViewPrefs` — migrate the 4 hand-rolled localStorage copies, each
      deleting a `useState` + `useEffect` + a local type:
      `features/projects/components/ProjectsHub.tsx:93,111,116` ·
      `features/tasks/components/TaskListPane.tsx:47,78,83` ·
      `app/(core)/documents/page.tsx:43,59,65` ·
      `components/image/cloud/CloudImagesTab.tsx:110,122,167`.
- [ ] **Doc contradiction:** `CLAUDE.md` says four copies,
      `lib/list-views/FEATURE.md:7-12` says three (it omits `CloudImagesTab`).
      Four is correct — fix the FEATURE.md.
- [ ] Extract the 5 inline `ItemMenuConfig` builders into registries:
      `CrmListPage.tsx:143` · `SitesPortfolio.tsx:206` ·
      `PlanSitesList.tsx:192` (near-duplicate of the previous) ·
      `KeywordResearchWorkbench.tsx:608` · `SiteKeywordPerformanceWorkspace.tsx:116`.
- [ ] Entities with **no** registry, by surface count: **file/folder** (4 rival
      vocabularies; `FileContextMenu.tsx` alone has 29 `DropdownMenuItem`s),
      **task** (6 surfaces), agent shortcut (5+), agent app, agent set,
      schedule, project, document, podcast, artifact, image, agent template,
      surface.
- [ ] **`messageActionRegistry` is forked three ways** — `features/agents/…/
      message-options/` (2004 lines), `features/cx-chat/actions/` (710),
      `features/messaging/actions/` (203), with overlapping-but-divergent
      implementations of the same actions. The drift problem, one level up.

---

## WAVE 4 — the canonical list shell

26 bespoke list surfaces; full ranked table in the audit. Highest value first:

> ### 🚨 SCOPED 2026-08-09 — `/crm` is NOT the next conversion, and the reason matters
>
> A full scope of `/crm` against `lib/entity-list` (file:line evidence in the
> commit that added this note) settles it: **this is a "build the missing
> service layer first" task, not a "write a config" task.** The three service
> methods are all non-optional (`config.tsx:37-44`) and CRM has **no
> `fetchFacets` at all**; both exemplars pay for a three-RPC set
> (`agx_list_scoped`/`_scope_counts`/`_facets`, `trx_*` likewise) BEFORE the
> config, and `types/database.types.ts` has no `crm_list_*` RPC of any kind.
>
> **The finding that changes this wave's framing:** three of the blockers are
> not CRM being weird, they are the SHELL missing capabilities — no
> `presentation` prop (so it cannot render in a `WindowPanel`, which
> `CrmListPage` already supports), no surfaces-runtime slot (converting would
> DROP CRM's 16-field agent manifest), and no axis for a top-level segmented
> control that isn't a scope. Filed as **D140**. On those three points the
> bespoke page is strictly MORE capable than the canonical shell.
>
> So "26 bespoke list pages" is not purely 26 agents failing to look. Some
> surfaces cannot adopt the shell as it stands. **Before converting any of the
> remaining 25, scope it the same way** — if the same three gaps recur, fixing
> the SHELL unblocks many conversions at once and is the higher-leverage move.
> That is this campaign's own operating principle applied to itself.
>
> Also filed: **D139** — CRM's scope counts fire `3 + N_orgs` round trips per
> keystroke. Independent of the conversion, and it disappears when
> `crm_list_scope_counts` exists.
>
> Approach when it IS scheduled (decided, don't re-litigate): three SECURITY
> DEFINER RPCs in the `agx_`/`trx_` mold per `lib/list-scope/FEATURE.md`, then
> re-sign `features/crm/service.ts` to `(query, sort)` — which deletes
> `usePartyList.ts` (176 lines) and its `getUserOrganizations()` prefetch — then
> the config (~120-200 lines) plus a `columns.tsx` rewrite to
> `EntityColumnSpec` and a `useCrmRowActions` extraction. **Two decisions need
> Arman:** trash-vs-`archived` (different axes, one name) and where
> People/Companies lives.

| Route | File | Effort | Note |
|---|---|---|---|
| `/crm` | `features/crm/components/CrmListPage.tsx` (493) | **M** (audit said S — wrong, see below) | Closest in UI terms: already uses `EntityScopeTabs`, `useListViewPrefs`, `ItemMenu`, controlled `MatrxDataTable`, and hand-writes a filter bridge the shell owns. |
| `/marketing/sites` | `SitesPortfolio.tsx` (647) | **S** | Best non-adopter: has `MatrxDataTable` + `ItemMenu` already |
| `/schedules` | `ScheduleList.tsx` (98) | **S** | Small, zero primitives, cheap win |
| `/agents/sets` | `AgentSetsBrowser.tsx` (150) | **S** | Sits inside the feature that owns the gold standard |
| `/documents` | `DocumentsHubTable.tsx` (579) | **M** | textbook bespoke hub |
| `/workbooks` | `app/(core)/workbooks/page.tsx` (568) | **M** | all in the route file, nothing extracted |
| `/notes` | — | **M** | **No list page exists** — `page.tsx` returns `null`. Violates the "feature entry pages are LIST views" doctrine head-on. `noteMenuRegistry` + `ItemRow` are already done; only the route + scoped RPC are missing. |
| `/projects` | `ProjectsHub.tsx` (**1335**) | **L** | largest offender |
| `/files/all` | `FileTable`/`FileGrid`/`FileList` | **L** | highest traffic; genuinely hierarchical — needs a decision on the shell's flat scoped-list model first |

**Scouted 2026-08-09 — the audit's "S" rating for `/crm` is wrong; do not plan
against it.** `EntityListService` requires all THREE methods, none optional
(`lib/entity-list/config.tsx:37-43`): `fetchPage`, `fetchCounts`, `fetchFacets`.
CRM has the first two in shape already (`fetchPartyPage`,
`fetchPartyScopeCounts` in `features/crm/service.ts:136,224`) — but as direct
`supabase.schema("crm").from("party")` reads, not the `*_list_scoped` RPC set,
and **`fetchFacets` does not exist at all**.

Facets are the real work, and doctrine forbids the cheap version: they must be
server-computed WITH counts (deriving them from the loaded page is the exact
anti-pattern `features/agents/browse/` was built to kill — one account has 34
categories and 773 tags). So this conversion needs either a new
`crm_list_facets` RPC — which per CLAUDE.md means a live migration applied via
the Supabase MCP plus `pnpm db-types` — or a set of PostgREST count queries.
That is a DB-touching change, not config assembly. Budget accordingly.

**Approach is DECIDED, don't re-litigate it: write a `crm_list_facets` RPC.**
Both live consumers already do exactly that — `agx_list_facets`
(`features/agents/browse/service.ts:123`) and `trx_list_facets`
(`features/transcripts/browse/service.ts:88`). A third surface inventing a
PostgREST-count-query variant would be a second implementation of a solved
problem, i.e. the defect this campaign exists to kill, committed by the
campaign itself. Template: `lib/list-scope/FEATURE.md`. Apply the migration
live via the Supabase MCP and regenerate types — a `.sql` file alone changes
nothing (CLAUDE.md § Database migrations).

Also: `features/user-lists/` declares `ActionConfig<T>[]` and
`features/tool-call-visualization/renderers/**` declares `EntityAction[]` —
**parallel action schemas**, worse than a hand-rolled dropdown.

---

## WAVE 5 — context-menu-v3

**Correct the record first:** the backlog in `features/context-menu-v3/FEATURE.md:192-203`
is **stale** — items 1, 2, 4, 5, 6, 7 are done. 45 live consumers.

Remaining bespoke/fake right-click menus:
- `features/organizations/components/OrgResourceDetail.tsx:392-450` — the **only**
  remaining ad-hoc `@/components/ui/context-menu` consumer. Zero v3 capability.
- `features/notes/components/NotesSidebar.tsx` + `NoteTabs.tsx` + `NoteTabItem.tsx`
  — coordinate-anchored `AdvancedMenu` masquerading as right-click (legacy shell;
  dies with it — the modern `NoteSidebarRow` is already on v3).
- `json-explorer/NavigationRows.tsx` + `processor-extractor/NavigationRows.tsx` —
  dead `onContextMenu` plumbing predating the v3 wiring in their own hosts.
- `features/pdf/components/viewer/annotation-layer/PdfAnnotationLayer.tsx:367` —
  suppresses the native menu; `RegionContextMenu.tsx:21` warns not to pass the
  handler on the v3 path, so any surface that does has a **genuine dead end**.

Missing-entirely, ranked: `/agents/all` rows (see the Wave 3 doc lie) ·
`/transcripts` rows · `AgentListDropdown` · tasks list rows · scheduling ·
agent shortcuts · agent apps · agent sets · chat pinned agents · CRM rows.

---

## WAVE 6 — window-panels

**The single highest-leverage change:** `features/organizations/peek/PeekDialog.tsx`
is a `max-w-lg` **blocking** `<Dialog>` shared by all **19** peek kinds — so the
doctrine's fourth door ("Window — beside the work, not instead of it") is
unreachable for every peekable entity. One "Open as window" affordance lights up
19 kinds at once.

**Genuinely dead — candidates for deletion** (registered, reachable from nowhere):
`brokerState` · `saveToNotesFullscreen` (duplicate registration of `saveToNotes`,
same exported hook name) · `structuredListManagerV1Window` (superseded by V2/V3) ·
`resourcePickerWindow` (opener + controller block deleted 2026-06-14; the registry
entries are orphan residue).

**Duplicate-opener defect** — 7 windows where the canonical
`features/overlays/openers/*.tsx` file has **zero** call sites while a colocated
twin does the work: `createProjectWindow` (12) · `imageUploaderWindow` (12) ·
`contentEditorWindow` (8) · `curatedIconPickerWindow` (7) ·
`surfaceAgentBindWindow` (6) · `smartCodeEditorWindow` (6) ·
`multiFileSmartCodeEditorWindow` (3). Pick one path and delete the other.

**Blocking modals that should offer a window** — where the twin already exists,
this is nearly free: `AgentSneakPeekModal` (6 consumers; `AgentPeekWindow.tsx`
already wraps this exact modal in a `WindowPanel` with 1 consumer) ·
`AgentSettingsModal` (`agentSettingsWindow` exists; `SystemInstructionModal`
already offers Dialog/Window side by side two files over) · `TaskDetails`
(`taskEditorWindow` has 13 call sites) · `UserTableViewer` (`userTableWindow`
exists). No twin yet: `AdvancedTranscriptViewer` (1278 LOC) ·
`DocumentViewer` (RAG) · `FeedbackDetailDialog` (2648 LOC, the record's only door).

**Already dead, delete rather than migrate:** `AICodeEditorModal`,
`ContextAwareCodeEditorModal`, `SmartCodeEditorModal`, `ChatDebugModal` — zero
import sites each, superseded by live windows.

Six components render `<WindowPanel>` inline with no registry entry and no
`@registry-status` marker — surfaces reinventing the pattern locally.

---

## WAVE 7 — assists

3 producers, 2 render sites, 8 referencing files. Ranked friction points:

1. **`lib/coming-soon/announce.ts`** — 34 registered promises, and the announce
   is a blocking confirm with a single "Got it". **One function; fixing it lights
   up all 34.** Add a "Do it with AI now" chip pre-filled from the promise text.
2. **`features/marketing/components/MarketingComingSoon.tsx`** — 20 reserved
   routes whose promised tasks an agent already does today.
3. **`lib/entity-list/config.tsx:185`** — the canonical list shell's `emptyState`
   is title + description with **no action and no assist**. One optional
   `emptyAssist` config field covers every current and future entity list.
4. **Zero-result search** — `RagSearchHits.tsx:97` detects zero hits and tells
   the user to rewrite the query by hand; `DocumentSearch.tsx:288` names the AI
   alternative *in prose* instead of offering it.
5. **`OverlayErrorFallback`** — builds a rich diagnostics payload and hands it to
   a clipboard for admins only. Send it instead.
6. **Error Inspector** — `"assists"` is already a registered `CapturedErrorSource`,
   but the wiring is one-directional. A sweep producing "Fix this error" assists
   is the flagship "system uses its own AI on itself" case.
7. `components/official/cards/EmptyStateCard.tsx` (13 consumers) — add an
   `assist?` slot; 13 surfaces inherit an AI path for free. Seven bespoke
   empty-state components should collapse onto it.

---

## Primitives Index (`docs/reuse-first.md`) — the highest-leverage output

**An agent cannot reuse what it cannot find.** Every primitive validated by this
sweep gets a row. Guarded by `pnpm check:reuse-index`.

- [x] `EntityRef` — added
- [ ] peek registry / `hasPeek` (+ the "import from `kinds-list`, never
      `registry`" fragmentation rule)
- [ ] `EntityListPage` + `EntityColumnSpec`
- [ ] `ItemMenuConfig` / `ItemMenu` / `ItemContextMenu` / `ItemRow` / `EditableLabel`
- [ ] `useListViewPrefs`
- [ ] `agentActionRegistry` / `useAgentRowActions` (+ note/conversation/pdf-doc registries)
- [ ] `EditableContextMenu` / `NonEditableContextMenu` (+ `contentSource`/`entity` unlocks)
- [ ] window-panels registration API + `useOpen*` openers
- [ ] `emitAssistTracked` / `makeEphemeralAssist` / `AssistChip` / `useAssistRunner`
- [ ] `announceComingSoon` + the registry

---

## Genuinely dead primitives (deletion candidates — need Arman's call)

| Item | Evidence |
|---|---|
| `brokerState` window | zero references outside its own registration |
| `saveToNotesFullscreen` window | zero references; duplicate of `saveToNotes` |
| `structuredListManagerV1Window` | superseded by V2 (5 sites) + V3 |
| `resourcePickerWindow` registry entries | opener + controller block deleted 2026-06-14 |
| `AICodeEditorModal`, `ContextAwareCodeEditorModal`, `SmartCodeEditorModal`, `ChatDebugModal` | zero import sites; live windows supersede |

---

## Change log

- **2026-08-09** — Wave 2, fifth batch: `KgCostDashboard`'s org column (named
  the org, wouldn't open it; printed a truncated id when the name hadn't
  resolved). The trap there is worth copying: **that row's click is an in-page
  drill-down (`onPick`), not navigation**, so a plain link would have silently
  replaced the dashboard's primary interaction. `onOpen` preserves it and the
  doors arrive purely as additions.

  Also found and recorded above: the `<button>`-nesting blocker is a CLASS
  covering three remaining targets, not three separate surprises.

  Repeat mistake worth naming: my scripted import-inserter targets "the last
  line starting with `import `", which lands INSIDE a multi-line `import { ... }`
  block. It broke `ExposureAuditClient` earlier today and I let it break
  `KgCostDashboard` the same way. `pnpm type-check` caught both instantly —
  which is the argument for running it per-file rather than per-batch.
- **2026-08-09** — Wave 2, fourth batch: `/administration/reporting/events`.
  The audit log printed "Entity type: note" and "Entity ID: <uuid>" one line
  apart, both inert — it knew exactly what the record was and would not open it,
  on the page whose only question is "what WAS this thing?". Entity and
  organization are `EntityRef` now (id as label so it stays copyable,
  `openInNewTab` so the log survives). `actor_id` deliberately left as text:
  there is no canonical entity token for a user, and fabricating a route is the
  failure this campaign prevents.

  **Correction to that commit's own verification line:** it claims "eslint
  clean". It is not — the file carries one pre-existing
  `setState synchronously within an effect` error at its data-loading effect
  (line 80), which my diff does not touch (the diff is the import at :21 and the
  render at :265+). I read the count, saw `1`, and committed before reading the
  finding. The rule that makes this campaign's numbers trustworthy is *compare
  before and after*, not *glance at a total*.

  **Tooling note that cost real time:** `find app -type d -name x` returns
  NOTHING in this repo — the parenthesized route-group directories break it — so
  a route that exists looks absent, and for a moment I believed `app/` itself
  was empty. Use `git ls-files | grep` to locate a route here.
- **2026-08-09** — Wave 2, third batch: `FileTableRow` (a filename that was a
  `<button>`, so a file could not be opened into a tab at all), plus the two
  admin-relationship surfaces that printed identities they would not open —
  `ReachabilityInspectorClient` and `ExposureAuditClient`. Both admin ones use
  `openInNewTab`: an audit that navigates away from itself is a worse tool than
  one that doesn't link. Pattern worth reusing: where the id must stay readable
  (an inspector), pass it as `name` — the full id renders AND opens.
- **2026-08-09** — Wave 2 continued: the three converted rails still hand-rolled
  `window.open` inside `EntityRef.onOpen` — all now `openInNewTab`, both
  `canOpenRow` guards deleted. `/documents` and the shortcut directory converted
  (the latter was printing a bare UUID). Three surfaces re-ranked as NOT
  drop-ins with the reason recorded, so the next agent doesn't convert them
  blind: `GlobalSearchResults` (name inside a `<button>`), `PinnedSection` (a
  card, already a link — wants a peek control, not a body swap), and the two
  `editable` name columns (inline-edit interplay; `/agents/all` opens a chooser
  modal on purpose).
- **2026-08-09** — Two review findings on the Wave 3 migrations, both closed
  with no code change, both checked against the code first:
  - *"Cloud gallery ignores invalid view"* — **refuted.** The claim was that a
    stored `view: "table"` could leave all three toggles inactive. It cannot:
    `isActiveViewOption` splits on `view === "rows"` vs `view !== "rows"` — the
    **same** partition the render uses (`isListView ? list : gridDensity`). Both
    sides treat `table` as "not rows", so the highlight and the grid can never
    disagree, and no third state exists. Narrowing on read (the `ProjectsHub`
    fix) was needed there because that surface compared against `"table"`
    directly; here the projection already covers the full union.
  - *"Legacy view prefs discarded"* — **real, deliberately not fixed.** The four
    surfaces' device-local keys (`projects-view`, `tasks-list-view`,
    `documents-hub-view`, `image-manager:cloud-images-view`) are not imported, so
    a user who had actively changed one toggle on one device sees that surface's
    default once more. Defaults themselves are unchanged (verified per surface in
    `8dc4d7d9`), so a user who never touched a toggle loses nothing. The cost of
    the fix is a `legacyImport` option on `useListViewPrefs` that must be deleted
    later and that nothing tracks; the loss it prevents is one click of a style
    toggle, after which the choice syncs to every device — which is the upgrade
    this wave shipped. **If Arman wants it anyway it is ~25 safe lines**: gate the
    one-time write on `state.userPreferences._meta.loadedPreferences !== null`
    (the real hydration signal — the slice has no `isHydrated` flag, but
    `loadedPreferences` is `null` until the load lands), then write only when
    `listViews[surfaceKey]` is still absent and delete the legacy key.
- **2026-08-09** — Wave 2 in progress: AssociationList + ContainerResourceSheet
  converted, `peekHref` fixed 6 peeks that shipped a 404 Open door, catalogue
  gained the canonical token. D138 filed (sharing registry = a 2nd route
  authority that disagrees with itself). CLAUDE.md route-group build column
  corrected for 4 groups (`(core)`/`(transitional)`/`(public)`/`(popup)` are
  parked in the admin+demos profiles, not "always").
- **2026-08-09** — Campaign opened. Four exhaustive audits. Wave 1 shipped
  (`51a28922`): 8 new `hrefFor` routes + the peek token bridge. D137 filed
  (`/canvas/{id}` 404s, incl. email links).
