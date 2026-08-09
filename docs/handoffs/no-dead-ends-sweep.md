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

## Remaining work

Ordered by traffic. Each item is independently actionable.

1. **`(core)` feature list/detail surfaces** — `/agents`, `/notes`, `/files`,
   `/tasks`, `/transcripts`, `/marketing/*`, `/crm`, `/research`. Highest user
   traffic and NOT yet audited. Start with a census like the admin one: find
   names rendered as `<span>`, bare uuids, and counts.
2. **Remaining admin consoles.** Not yet swept: `/administration/shared-knowledge`
   (Access Explorer, Stores & Grants, Industries — names live only as
   `<SelectItem>`), `/administration/scopes-context/system-context`,
   `/administration/users/feedback` (feedback id, parent_id, assignee),
   `/administration/database/sql-functions` (`{usage_count} tables`),
   `/administration/compute/sandbox`, `/administration/users/email`,
   `/administration/users/{announcements,invitations}`. Plus routes rendering
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
  (`features/scopes/components/associations/`) + war-room resource lists.
