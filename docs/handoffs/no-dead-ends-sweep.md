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
   The agent-adjacent card/panel surfaces named here are DONE — see the
   agent-adjacent entry under **Done**. The `MatrxColumnDef` files under
   `features/marketing/**` are DONE too — see the marketing-tables entry.
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

   ⚠️ **"Zero JSX consumers" does NOT mean the file is dead — do not delete it.**
   The MODULE is still the shared type contract: `WarRoomResourcesList`,
   `useThreadResourcesAdapter` and `ThreadResourcesTab` all import
   `ContainerResourcesAdapter` / `ContainerResourceRow` from it. Deleting the
   component without first moving those types breaks war-room's build. Collapse
   means "one implementation, types where they belong", not "remove the loser".

   Also scoped-out deliberately: this is a Tier-1 refactor, not door work. It
   stays tracked here rather than being folded into a doors wave.

### Blocked / needs a decision

0. ~~**`scope` still has no registry `hrefFor`.**~~ RESOLVED 2026-08-09 —
   `entityRegistry.ts` now carries `scope: { hrefFor: (id) => scopeShortHref(id) }`
   (verified live at `entityRegistry.ts:418`), so every surface naming a scope
   resolves a door with no call-site change. Call sites that still pass
   `scopeShortHref(id)` as an explicit `href` override are harmless but
   redundant — drop the override opportunistically.
   **Still open:** `scope_type` has no `hrefFor`, no resolver route, and no peek.
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
14. ~~**`scope` has a real route the registry doesn't know.**~~ FULLY RESOLVED —
    the resolver route was built (`/scopes/s/[scopeId]`, `scopeShortHref`) AND
    the registry now points at it (see item 0). `scope_type` still has no
    resolver and no peek.
15. ~~**`brand` and marketing `site` are not registered tokens at all.**~~
    RESOLVED — `web_brand` (`/marketing/brands/<id>`), `web_site`
    (`/marketing/sites/<id>`, the id-only shim that resolves `brand_id` and
    redirects) and `web_page` (`/marketing/pages/[pageId]`, the same resolver
    shape) all carry `hrefFor` now — verified at `entityRegistry.ts:310/319/396`
    against the route file `app/(core)/marketing/pages/[pageId]/page.tsx`.
    **Follow-up, not a blocker:** the GSC breakdown / dig / insight / watch /
    crawl-ledger / cost-rollup columns still build their own
    `marketingRoutes.sitePage(...)` href. That is correct and NOT a dead end —
    but each one could now drop the local builder for an `EntityRef`, gaining
    peek and new-tab for free. Do NOT re-register `web_page`; it exists.
16. **Registry entries that need an owner's call, not a call-site patch.**
    - `user_feedback` — HAS a working route
      (`/administration/users/feedback?feedback=<id>`, see `Done`). Registering
      `hrefFor` would light up every feedback reference at once, but the route
      sits behind the super-admin `(admin)` layout, so it is the same
      "403 door" question as `skill` in item 11.
    - `context_item` / `scope_type` — registered tokens, no `hrefFor` and no
      peek. The System Context console falls back to an in-surface filter for a
      category and a copy-only uuid for the item. A peek on each is the cheap
      fix (same argument as item 12).
17. **`/sandbox/[id]` is owner-only** — `app/api/sandbox/[id]/route.ts` filters
    `.eq("user_id", user.id)`, so the FLEET-WIDE console at
    `/administration/compute/sandbox` can only open the viewer's OWN instances;
    the rest would 404. Needs a super-admin read path (or an admin-side sandbox
    detail route) before every row can open. Same family as item 13.
18. **Industries have no entity token at all** (`public.industries`), so every
    "Industry — X" grant label in shared-knowledge is unavoidably plain text.
19. **Agent-set MEMBERS cannot be linked from the set CARD.** `/agents/sets`
    renders each member as an anonymous glyph because `AgentSetSummary` (the
    `agent_set_list()` RPC) carries only `memberCount` — no member ids, no
    names. The count is now a door to the builder, where every member IS named
    and linked, which is the honest fix without a per-card fetch. Naming them on
    the card needs `agent_set_list()` to return the first N member
    `(id, name)` pairs.
20. **An agent app's `N runs` has no user-side destination.** `AgentAppCard`
    shows `total_executions`; the only executions console is
    `/administration/agents/agent-apps/executions?app=<id>`, behind the
    super-admin `(admin)` layout — the same "403 door" question as item 11. A
    `/agent-apps/[id]/executions` route would light up the count for owners.
21. **MCP servers have no entity token.** `features/agent-connections`'
    `McpServersSection` lists real `McpCatalogEntry` records (and the admin
    console at `/administration/agents/mcp-tools` exists), but there is no
    registered token, so `ListRow`'s new `door` slot has nothing to resolve and
    those rows stay panel-only. Registering `mcp_server` with an `hrefFor` would
    serve that section and the tools manager at once.
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
- **Agent-adjacent cards + panels** (`features/agents` outside `browse/` and
  `conversation-*`, `features/agent-shortcuts`, `features/agent-apps`,
  `features/agent-connections`). The recurring shape was a card or row whose
  ONLY way in was a JS click — `AgentCard` / `AgentListItem` even hand-rolled
  `window.open` on cmd-click, which is not an anchor and gives nothing to
  middle-click, keyboard or the context menu:
  - names became `EntityRef` anchors: the agent on `AgentCard` /
    `AgentListItem` (registry route, `basePath`-aware so an admin card stays in
    the system-agents shell), the app AND **the agent it runs** on
    `AgentAppCard` (that line was `Agent: <name>` with the id right there and
    no door), the shortcut label + the agent column in `ShortcutDirectory` (it
    printed a raw uuid when the join missed), and the agent in the
    agent-connections detail pane.
  - `AgentShortcutsPanel`'s shortcut rows were `<button onClick={router.push}>`
    → whole-row anchors.
  - `AgentSetCard` — see the dedicated commit; the tile's four doors plus a
    mouse-only overlay link that replaces the old `role="button"` + `onClick`.
  - agent-sets member surfaces (`AgentRoleCard`, `AgentLibraryRail`,
    `SetMemberGrid`, `MemberInspector`, `OrchestratorInspector`) had a peek and
    nothing else — a member agent could be previewed but never opened. They now
    carry `EntityDoorControls` beside the peek (new tab always; same-tab Open
    only where leaving does not discard a canvas in progress), and the invented
    fallback labels (`"Member"`, `"Orchestrator"`, `"Agent"` for an agent the
    slice had not loaded) were replaced with `null` so the id shows instead.
  - **Primitives extended, not forked:** `EntityRef` gained `nameClassName` so a
    CARD title can wrap (`line-clamp-2/3`) instead of being forced onto one
    truncated line — the reason card surfaces were hand-rolling name anchors.
    `features/agent-connections/components/ListRow` split into a button + a
    `door` slot rendered as its SIBLING (the row's click means "show in this
    panel", so the name cannot be the anchor and `<a>`-inside-`<button>` is
    invalid DOM).
  - Verified by `pnpm type-check`, ESLint on every changed file, and reading
    each destination route on disk (`app/(core)/agents/[id]`, `…/sets/
    [orchestratorId]`, `…/[id]/shortcuts/[shortcutId]`, `app/(core)/agent-apps/
    [id]`, `app/(admin)/administration/agents/system-agents/agents/[id]`).
    `getAgent`/`getAgentApp` both filter `deleted_at is null`, and neither list
    surface has a trash view, so no door lands on a soft-deleted row. **No
    browser** — see the banner above.
- **Marketing table columns** (every `MatrxColumnDef` file under
  `features/marketing/**`). The domain-wide shape was a record printed as text
  with a whole-row `onRowOpen` as its only way in — no cmd-click, no
  middle-click, no keyboard, nothing for the context menu. Identity cells now
  declare `href`, so the table renders a real `next/link`:
  - **Site workspace tables** — crawl sessions (`CrawlsTable`), snapshots
    (`SnapshotsTable`), findings (`FindingsTable`), the analysis priority queue
    (`SiteAnalysisTable`), sitemap listings (`SitemapDetail`), and the crawl run
    URL ledger (`CrawlUrlsTable`). Each destination is the one `onRowOpen`
    already used.
  - **Relationships that were knowable and unreachable** — a finding's affected
    page was a `<button onClick={router.push}>` (no new-tab gesture reached it);
    a crawl run URL and the crawl-report response ledger both carried the
    `page_id` the crawler had already resolved and printed the URL as text.
  - **Cross-site hubs** — `BatchesTable` (the id fragment was an inner link
    while the rest of the identity cell was inert), `BatchDetailWorkspace`,
    `SiteCostWorkspace`, `WorkspaceCostWorkspace`, `CrossSiteRanksHub`.
  - **Search Console, in ONE edit** — `buildGscKeyColumn`
    (`search-console/lib/columns.tsx`) takes an optional per-row `recordHref`
    and renders the door itself, so `GscDimensionTable`, `DigResultsTable`,
    `InsightsTab` (CTR-gap + trend), and `ClassInsights` (movers + juice) all
    light up at once. `gsc_perf_breakdown` / `_dig` / `_ctr_gap` / `_trend` /
    `_class_movers` / `_juice` every one RETURNS `page_id` — the page was
    knowable in all six. `WatchlistTab` resolves the same door through
    `entity_id` when `kind === "page"`; `NewPagesTab` rows ARE pages.
  - The door in those tables is a trailing anchor, not the whole cell, because
    the row click there is the DRILLDOWN (queries for this page / pages for this
    query). Swallowing that gesture would trade one destination for another
    rather than adding one.
  - **Bare ids that became doors:** the site-access grant's `grantee_id` when
    `grantee_type === "organization"`, and the workspace cost rollup's
    `client_org_id` — both via `fk.token: "organization"`, so route + new tab +
    peek come from the registries with no call-site wiring. A `user` grantee
    stays copy-only (no canonical account route — D138).
  - **Route builders, not string concatenation:** `marketingRoutes` gained
    `sitePage(brandId, siteId, pageId)` and `batch(batchId)`; six hand-built
    `/marketing/sites/<id>` / `/marketing/batches/<id>` paths now go through the
    builders.
  - Verified by `pnpm type-check` (green), ESLint on every changed file, and
    reading each route leaf on disk under
    `app/(core)/marketing/brands/[brandId]/sites/[siteId]/` plus
    `/marketing/batches/[batchId]`. Cross-site links that know only `site_id`
    use the id-only form, whose `[...rest]` shim resolves the brand and replaces
    the URL. **No browser** — see the banner above.
  - **Deliberately left door-less, do not "fix":** `DismissedPagesTable` (its
    rows ARE soft-deleted pages and the single-page fetchers exclude them — a
    door there is the /files/trash 404 bug); `CrawlLogsTable` (crawl events have
    no route); `FindingDetail`'s result rows and its `run_id` /
    `payload_instance_id` (analysis results and runs have no route);
    `PlanNodesTable` (a plan node has NO shareable URL at all — the workbench
    holds the selection in React state; a `?node=<id>` deep link is the fix and
    is a workbench change, not a column change); both backlink tables (external
    domains/anchors, already real anchors, and no internal record id on the
    row); `SiteKeywordPerformanceWorkspace`'s query column (keywords have no
    route — its "Strongest page" column was already a door).
