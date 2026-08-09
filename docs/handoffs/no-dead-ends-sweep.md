---
status: active
updated: 2026-08-09
repos: [matrx-frontend, aidream]
vision: [/Users/armanisadeghi/code/common-docs/policies/no-dead-ends.md]
---

# No Dead Ends sweep — every identity is a door

Campaign to bring the whole UI onto THE DOOR LAW. Expect weeks. Waves ship
independently; the registry work lights up many surfaces per edit, so it always
outranks per-surface patches.

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

> "We have so many features, and they're just not used. We cannot have amazing,
> powerful code dying in a corner because an agent was too lazy to go looking
> before it built a feature."

No size threshold, no exemption for admin pages, demos, dialogs, or toasts.

## Resources

- Doctrine: `/Users/armanisadeghi/code/common-docs/policies/no-dead-ends.md`
- Recipe: the `no-dead-ends` skill · CLAUDE.md § NO DEAD ENDS
- Primitives: `components/official/entity-ref/EntityRef.tsx` (name + doors) ·
  `components/official/entity-ref/doors.ts` (the one resolver) ·
  `components/official/matrx-data-table/MatrxUuidCell.tsx` (id + doors)
- Registries to EDIT (never patch a call site): `features/scopes/registry/entityRegistry.ts`
  (`hrefFor`) · `features/organizations/peek/registry.ts` + `kinds-list.ts` (peek) ·
  `features/overlays/openers/` (window)
- Worked reference: `features/admin/agent-slots/` (FEATURE.md § THE DOOR LAW)
- Test login: `/login` → `admin@admin.com` / `Password1234#`

## 🚨 NOTHING IN THIS CAMPAIGN HAS BEEN SEEN IN A BROWSER

**Every door landed so far is verified by reading route files, route builders,
live function definitions, `pnpm type-check`, ESLint and unit tests — never by
loading a page.** No agent on this campaign has run a browser, and the ones that
tried could not.

This is not laziness to be scolded out of the next agent: **a cloud agent session
cannot reach the app.** The network policy refuses `aimatrx.com`, both Vercel
preview hosts, and `db.matrxserver.com` outright (403 at CONNECT — check it with
`curl -sS "$HTTPS_PROXY/__agentproxy/status"` before spending a wave on it). No
page loads, and no Supabase read succeeds, so the `/login` credentials above are
useless from here. Do not burn a wave rediscovering this, and do not claim a
surface is "verified" on the strength of a type-check.

What that leaves unverified, and what a human or a session that CAN reach the app
should look at: layout under the new anchors (a name that became a link inside a
truncating flex row), the `/chat` sidebar agent chip at narrow widths, the two
structured-list sidebars after their `<button>` → `<div>` + controls split, and
every "hover reveals peek / new-tab" affordance — hover states are exactly what
static analysis cannot see. The per-wave "routes to open" lists in **Done** below
are written for that pass.

Two specific questions an adversarial review raised that ONLY a browser can
settle — both are "did we add a door that doesn't open?":

1. **Does `/organizations/[orgId]` degrade gracefully for an org the user can see
   but not open?** Shared rows carry an `organization_id` for orgs the viewer
   may not be a member of, and several surfaces now mint a door from it
   (`ProjectsHub`, `/agents/all` Organization cell). If that route hard-errors
   instead of showing a "no access" state, those are NEW dead ends on the
   shared/orgs scopes. Needs a two-account pass.
2. **Does dnd-kit swallow clicks on the new door controls in the files table?**
   The `<tr>` spreads `useDraggable` listeners, and the door controls are ~20px
   targets — a few pixels of pointer drift could be captured by the drag sensor
   before the click resolves. The pre-existing name button has the same
   exposure, so this may be a non-issue.

## Remaining work

Ordered by traffic. Each item is independently actionable.

1. **`(core)` surfaces — audited 2026-08-09, in progress.** The audit found ~30
   HIGH/MED surfaces and ~130 `router.push`-only navigations (a row that
   navigates on click but is not an anchor: no cmd-click, no middle-click, no
   new tab — a Door Law violation even though clicking "works").
   **In flight:** `lib/entity-list/` shell, `/agents/all` columns, `/chat`
   history sidebar, `/rag/library`, `/war-room/all`, `/lists`, `/files`,
   `/tasks`, `/projects`, `/marketing/{brands,sites,pages}`.
   **Still open after that:**
   `features/agents/components/agent-listings/AgentCard.tsx:184` (hand-rolled
   `window.open` on cmd-click instead of an anchor),
   `features/agents/components/shortcuts/AgentShortcutsPanel.tsx:83`,
   `features/agent-apps/components/agent-app-listings/AgentAppCard.tsx:138`,
   `features/agents/agent-sets/components/AgentSetCard.tsx` (member agents
   rendered as anonymous glyphs — neither named nor linked),
   and the ~35 remaining
   `MatrxColumnDef` files under `features/marketing/**` (NONE declare `href`).
   Already correct, do not redo: `features/crm/components/record/*`,
   `features/dashboard/**`, `components/user-generated-table-data/TableCards.tsx`,
   `features/research/components/landing/TopicList.tsx`,
   the conversation-history ROW level, `features/data-tables/components/DocumentListCard.tsx`,
   `features/rag/components/RagHomePage.tsx`, `features/tasks/components/CompactTaskItem.tsx`.

2. **Remaining admin consoles.** Routes rendering
   from `features/agents` / `features/skills` / `features/podcasts` /
   `features/content-ir` rather than `features/admin`:
   `/administration/agents/system-agents/agents`, `…/shortcuts/all`,
   `…/mcp-tools`, `…/skills`, `…/bundles`,
   `/administration/knowledge/{podcasts/shows,kg-inspector}`,
   `/administration/utilities/{kind-registry,content-blocks}`.
3. **Dialogs / drawers / warnings** that name an entity.
4. **Toasts and badges.**
5. **`(dev)` demos** — last.
6. **aidream admin surfaces** — after matrx-frontend.
7. **Collapse the `AssociationList` fork.** It has ZERO live JSX consumers;
   war-room renders `WarRoomResourcesList`, a second implementation of the same
   grouped row list, while three war-room docblocks still call `AssociationList`
   "canonical". Both carry doors now, so this is cleanup, not a dead end.
   Logged in `.matrx/PATROL_SIGHTINGS.md` (P2).

### Blocked / needs a decision

0. **`scope` still has no registry `hrefFor`.** `/scopes/s/[scopeId]` now
   resolves a scope from its id alone, so the blocker in item 14 is gone — the
   registry edit is a one-liner (`hrefFor: (id) => scopeShortHref(id)`) that was
   deliberately NOT made here to avoid a concurrent-edit conflict in
   `entityRegistry.ts`. Until it lands, call sites pass `scopeShortHref(id)` as
   an `href` override to `EntityRef`; registering it changes no call site.
   `scope_type` has the same gap and no resolver route yet.
0b. **`ContextSummaryChips` cannot carry doors yet.** It is THE context-selection
   display (file rows, note footers, chat header, transcripts sidebar) and every
   chip names a record with an id — org, scope, project, task, all four of which
   have routes. It renders INSIDE a `<button>` in `ActiveContextButton`, so
   anchors are invalid DOM there. **Needs** an opt-in `withDoors` prop that the
   four non-button consumers (`FileInfoTab`, `FileContextSection`,
   `ProjectContextSection`, `TaskContextSection`) turn on.
0c. **`ContextValueDisplay` renders a legacy `value_reference_id` as
   `→ <uuid>`** — a bare id with no copy and no door. The docblock says zero
   current rows use the pre-fence column, so this is a restored-old-version
   path only; the cell shape would need `value_reference_type` to resolve a
   token.

8. **No canonical user-account route** (FOUND_DEFECTS D138) — the most common
   remaining dead end in `(admin)`; every actor column. The stand-in is
   `features/admin/users/components/AdminUserRef.tsx` (a menu of param-consuming
   per-user admin pages); **consume it, don't hand-roll**. Give
   `/administration/users` a deep-link param + register a token with `hrefFor`
   and every `user_id` column lights up at once. Note
   `/administration/users/admins` accepts NO param, so an existing Accounts
   row-menu item promises a filter it cannot deliver.
9. **Association edges have no listable destination.** `edge_count` /
   `closure_rows` / `reverse_edge_count` (`RelationshipRulesClient`,
   `ProblemsPanel`) count real `platform.associations` rows nothing can list, so
   they stay inert on purpose. A client read would LIE: SELECT is
   `iam.has_org_access(organization_id)` while the counts come from
   `is_super_admin()` RPCs. **Needs** `admin_association_edges(p_source_type,
   p_target_type, p_label, p_direction)` + an Edges destination on the hub.
   Same shape blocks Exposure Audit's "N link" / "N grant" and the Entitlements
   "Events" / "Users" counts.
10. **Stale `url_path_template` rows** (FOUND_DEFECTS D137). Mitigated — a
    registered token with no `hrefFor` now returns null instead of the template
    — but the rows are still wrong. Decide: correct each (then
    `pnpm tsx scripts/regen-shareable-registry-snapshot.ts`), or drop the column
    so the entity registry is the only route authority. Shared with aidream.
11. **Routes that do not exist for real entities.** `workflow` (D139 — lives in
    aidream's workflow-studio), `skill` (admin-only route; a 403 door is still a
    dead end), `quiz_session`, `flashcard_data`, `canvas_items`. Peeks render;
    no route does. Decide per entity: build the route, or link out.
12. **Association-edge endpoints with NO door at all** — `crm_campaign`,
    `seo_keyword`, `folder`, `working_document`, `flashcard_set`, `quiz_session`,
    `code_folder`, `code_repository`. These are valid edge endpoints, so an
    attached item of these types is plain text. **A peek each is the cheapest
    fix** — the picker is where "which one is that?" actually bites.
13. **Scheduling admin consoles show only the viewer's own rows** (D140) — they
    present as fleet-wide and are not.
14. ~~**`scope` has a real route the registry doesn't know.**~~ RESOLVED — the
    resolver route was built (`/scopes/s/[scopeId]`, `scopeShortHref`). All that
    remains is the registry one-liner; see item 0. `scope_type` still has no
    resolver and no peek.
15. **`brand` and marketing `site` are not registered tokens at all**, though
    `marketingRoutes.brand()` / `.site()` exist. Registering them would let
    `EntityRef` serve the ~35 marketing tables instead of each hand-rolling.
16. **`context_item` needs a peek**; `user_feedback` now has a real route
    (`/administration/users/feedback?feedback=<id>`) but sits behind the
    super-admin gate — same "403 door" question as `skill`.
17. **`/sandbox/[id]` is owner-only** (`app/api/sandbox/[id]/route.ts` filters
    `.eq("user_id", user.id)`), so the fleet-wide sandbox console can only open
    the viewer's own rows. Needs a super-admin read path.
18. **Industries have no entity token at all** (`public.industries`), so every
    "Industry — X" grant label is unavoidably plain text.
14. **Registry entries the admin sweep wanted and could not add** (they need an
    owner's call, not a call-site patch):
    - `user_feedback` — now HAS a working route
      (`/administration/users/feedback?feedback=<id>`, see `Done`). Registering
      `hrefFor` would light up every feedback reference at once, but the route
      sits behind the super-admin `(admin)` layout, so it is the same
      "403 door" question as `skill` in item 11.
    - `context_item` / `scope_type` — registered tokens, no `hrefFor` and no
      peek. The System Context console falls back to an in-surface filter for a
      category and a copy-only uuid for the item. A peek on each is the cheap
      fix (same argument as item 12).
    - Industries have **no token at all** (`public.industries`), so every
      "Industry — X" grant label in shared-knowledge is plain text.
15. **`/sandbox/[id]` is owner-only.** `/api/sandbox/[id]` filters
    `.eq("user_id", user.id)`, so the FLEET-WIDE admin console at
    `/administration/compute/sandbox` can only link the viewer's OWN instances —
    the rest would 404. Needs a super-admin read path (or an admin-side sandbox
    detail route) before every row can open. Same family as item 13.
16. **Counts still without a destination** (deliberately left inert): a library
    store's `N members` and the sandbox console's `Unique users` have no list to
    reach; the enum Usage tab's `schema.table` names have nowhere to go —
    `/administration/database/database-admin` reads only `?tab=`, no table
    param. An invitation request has no user FK and Accounts reads no deep-link
    param, so an applicant's email cannot reach an account.

## Done

- **`components/official/entity-ref/`** is the campaign's spine:
  `doors.ts` (the ONE resolver), `EntityRef` (name + doors),
  `EntityDoorControls` (doors WITHOUT the name, for a name that can't be an
  anchor — an inline editor, a picker toggle). `MatrxUuidCell`, `PeekDialog`,
  `OrgResourceList` and `getResourceSharePath` all consume the same resolver, so
  a registry edit can never light one surface and miss another.
- **Registry routes added**, each verified against the route AND the table it
  reads: `agent_shortcut`, `app`, `project`, `organization`, `message_template`,
  `transcript`, `studio_session`, `data_store`; `code_file` corrected; an
  `organization` peek added.
- **Live 404s removed**: six peeks with "Open" buttons to nonexistent routes;
  share links built from a stale DB template (incl. the public share page);
  the fork-a-shared-quiz redirect; agent-usage workflow links; the org workflows
  tile; `sourceLinkFor`'s hand-written transcript/code routes.
- **Wrong doors prevented**: column-name token inference is opt-in
  (`fk.token: "auto"`), because `scheduler.sch_run.task_id` is NOT a workspace
  task; a dangling-reference integrity check no longer links the record it just
  proved missing; a catalog deep link can no longer save under another
  application.
- **Consoles done**: Agent Slots (`features/admin/agent-slots/FEATURE.md`, the
  worked reference) · Users & Access · Relationships hub · reporting/events
  audit log · agent-apps · scheduling · applications · every association surface
  (`features/scopes/components/associations/`) + war-room resource lists ·
  shared-knowledge (Access Explorer / Stores & Grants / Industries) ·
  scopes-context/system-context · users/feedback · database/{enums,sql-functions}
  · compute/sandbox · users/{email,announcements,invitations}.
- **`AdminUserDoorControls`** (`features/admin/users/components/AdminUserRef.tsx`)
  — the user doors WITHOUT the name, the `EntityDoorControls` half of the user
  stand-in. For a name that labels a checkbox, sits in a `<SelectItem>`, or
  lives inside a "filter by this assignee" button. `AdminUserRef` composes it,
  so the verified destination list is still declared exactly once.
- **Feedback records became linkable** — `?feedback=<id>` on the console route
  (`app/(admin)/administration/users/feedback/doors.ts`) opens that row's detail
  dialog, so the id cell, the parent edge and a pasted URL all arrive somewhere.
  The parent edge used to copy the parent's id and toast a preview of the answer
  it already had.
- **Count-doors**: an enum's `{usage_count} tables` opens the detail's Usage tab
  (which lists those tables); an org's member count opens
  `/administration/users/organizations?org=<id>`.
- **`/scopes` surfaces**: the hub table's scope name is an `EntityRef` anchor and
  its owning org is a door; `AssignedScopesDisplay` (the read-only "what is this
  tagged with" display, used on project workspaces) links every scope chip/row
  and the org; the settings panel's active org is reachable. Backed by a new
  **`/scopes/s/[scopeId]` server resolver** (org + type lookup → redirect to the
  canonical `/organizations/{org}/scopes/{type}/{scope}` route), exposed as
  `scopeShortHref()` in `features/scope-system/utils/scopeRoutes.ts` — the same
  shape as `/marketing/pages/[pageId]`. This is what makes a scope openable from
  its id alone anywhere in the app.
- **`/documents` + `/workbooks`**: workbook cards are real anchors (they were
  `<button onClick={router.push}>`), the documents table name cell is an
  `EntityRef`, and both surfaces put `EntityDoorControls` on `original_file_id`
  so an imported file's ORIGINAL upload is reachable (it was persisted and
  emitted to the agent context, but no UI ever linked it).
- **Notes**: global-search hit groups carry `EntityDoorControls` beside the
  collapse button (peek + new tab; same-tab open deliberately off mid-search),
  and the info panel's Org / Project / Task ids render through `MatrxUuidCell`
  instead of as bare uuids.
- **Research sources**: `SourceResultsTable` titles are `EntityRef`s
  (`research_source`), `SourceList`'s desktop rows got the anchor its mobile
  cards already had, the decorative `ArrowUpRight` became the real new-tab door,
  and the source's own URL is reachable without opening the overflow menu.
