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

Four review findings landed on the Wave 2 PR. **Three were real, and all three
were the same mistake in different clothes:** a conversion changed what the
original door DID. Adopting `EntityRef` is not a drop-in — the hand-rolled code
it replaces encodes decisions you must carry over deliberately.

Before replacing hand-rolled code with a shared primitive, answer all five.
The first three are door-specific; 4 and 5 apply to ANY primitive adoption:

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

The one true observation underneath it: **a Vercel PREVIEW never builds for a
branch here.** The release-prefix gate (`scripts/vercel-ignore-build.sh`) marks
every non-release-prefixed commit `Ignored`, previews included (verified
2026-08-09 across all three projects). So "browser-verified" cannot mean a
preview URL — use a local `pnpm dev`, or verify the LIVE app after the merge
lands. Never claim a surface is verified on the strength of a preview that
never built.

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
| P3 | `components/official/entity-ref/EntityRef.tsx` | **9+** (agent-slots, association rail, 2 org surfaces, war-room, scheduling, `/documents` table, shortcut directory, + PR #74) | adopted; gained `onOpen`/`openInNewTab` | 2 ✅ |
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

- [ ] **`GlobalSearchResults` is NOT a drop-in — do not convert it blind.** The
      note name at `features/notes/components/GlobalSearchResults.tsx:147` lives
      INSIDE a `<button>` whose click collapses/expands the hit list. Dropping
      an `EntityRef` there nests an `<a>` in a `<button>` (invalid HTML, React
      warns) and, worse, `onOpen` would have to mean "collapse", which is not
      opening. The fix is to split the chevron toggle from the name first, then
      convert — a small restructure, not a substitution.
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
2. `features/files/components/surfaces/desktop/FileTableRow.tsx:259` — a bare
   `<button>`, so no cmd-click/middle-click at all.
3. `features/dashboard/components/PinnedSection.tsx:61` — favorites already
   carry `(entityType, entityId)` via `favoriteEntityRef()`; drop-in.
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

**Bare-UUID violations** (`never render an id you can't open`):
`features/admin/relationships/components/ReachabilityInspectorClient.tsx:162`
(token and id side by side, prints the UUID) ·
`ExposureAuditClient.tsx:173` (a security audit you cannot click through) ·
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
