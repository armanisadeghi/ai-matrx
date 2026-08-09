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
   `/tasks`, `/transcripts`, `/marketing/*`. Highest user traffic; not yet audited.
2. **Association surfaces** — `features/scopes/components/associations/`
   (`AssociationCard`, `AssociationList`, `AttachedItemsSheet`,
   `AssociationCardGrid`). These render entity names BY TOKEN, so one fix covers
   every container that shows attached items. Highest leverage left.
3. **Remaining admin consoles** not yet swept: `/administration/shared-knowledge`
   (Access Explorer, Stores & Grants, Industries — names live only as
   `<SelectItem>`), `/administration/scopes-context/system-context`,
   `/administration/users/feedback` (feedback id, parent_id, assignee),
   `/administration/database/sql-functions` (`{usage_count} tables` counts),
   `/administration/compute/sandbox`, `/administration/users/email`,
   `/administration/users/announcements`, `/administration/users/invitations`.
   Plus routes that render from `features/agents` / `features/skills` /
   `features/podcasts` / `features/content-ir` rather than `features/admin`:
   `/administration/agents/system-agents/agents`, `…/shortcuts/all`,
   `…/mcp-tools`, `…/skills`, `…/bundles`, `/administration/knowledge/podcasts/shows`,
   `/administration/knowledge/kg-inspector`, `/administration/utilities/kind-registry`,
   `/administration/utilities/content-blocks`.
4. **Dialogs / drawers / warnings** that name an entity.
5. **Toasts and badges.**
6. **`(dev)` demos** — last.
7. **aidream admin surfaces** — after matrx-frontend.

### Blocked / needs a decision

8. **No canonical user-account route** (FOUND_DEFECTS D138). The single most
   common remaining dead end in `(admin)` — every actor column. The console's
   stand-in is `features/admin/users/components/AdminUserRef.tsx` (a menu of
   param-consuming per-user admin pages); **consume it, don't hand-roll**. Give
   `/administration/users` a deep-link param + register a token with `hrefFor`
   and every `user_id` column lights up at once.
   Note `/administration/users/admins` accepts NO param, so an existing Accounts
   row-menu item promises a filter it cannot deliver.
9. **Association edges have no listable destination.** `edge_count` /
   `closure_rows` / `reverse_edge_count` (`RelationshipRulesClient`,
   `ProblemsPanel`) count real `platform.associations` rows nothing in the app
   can list, so they stay inert on purpose. A client read would LIE:
   `platform.associations` SELECT is `iam.has_org_access(organization_id)` while
   the counts come from `is_super_admin()` RPCs, so the panel would silently
   under-report. **Needs** an `admin_association_edges(p_source_type,
   p_target_type, p_label, p_direction)` SECURITY DEFINER RPC + an Edges
   destination on the Relationships hub. Then both become links in one edit.
   Same shape blocks the Exposure Audit's "N link" / "N grant" signals and the
   Entitlements "Events" / "Users" counts (no billing-event list route exists).
10. **The share registry's `url_path_template` is a stale second route
    authority** (FOUND_DEFECTS D137). Mitigated — `getResourceSharePath` asks the
    entity registry first and no longer guesses — but the stale rows remain.
    Decide: correct each row (then regenerate the TS mirror with
    `pnpm tsx scripts/regen-shareable-registry-snapshot.ts`), or drop the column
    and let the entity registry be the only route authority. Shared with aidream.
11. **`workflow` has no detail route in this repo** (FOUND_DEFECTS D139) — it
    lives in aidream's `apps/workflow-studio`. Several surfaces were shipping
    `/workflows/<id>` 404s; they now offer the peek instead. Decide: link out to
    workflow-studio, or build a detail route here.
12. **`skill` has no user-facing route** — only
    `/administration/agents/skills?open=<id>`, behind the super-admin gate. Left
    door-less rather than 403-ing non-admins. Same for `quiz_session`,
    `flashcard_data`, `canvas_items`: peeks render, no route exists.

## Done

- **`components/official/entity-ref/doors.ts`** — the ONE resolver. `EntityRef`
  (name + doors), `MatrxUuidCell` (id + doors), `PeekDialog`, `OrgResourceList`
  and `getResourceSharePath` all consume it, so a registry edit can never light
  one surface and miss another.
- **Registry routes added** (each verified against the route AND the table it
  reads): `agent_shortcut`, `app`, `project`, `organization`, `message_template`,
  `transcript`, `studio_session`, `data_store`; `code_file` corrected. Plus an
  `organization` peek.
- **Six peeks were shipping "Open" buttons that 404'd** — `PeekDialog` now takes
  `token` + `id` and asks the registry. `WorkflowPeek` also read a deprecated
  table that always errors; repointed at `workflow.definition`.
- **Share links no longer guess.** `getResourceSharePath` = entity registry →
  share-registry template → null (never a fabricated path); both share UIs and
  the five direct `urlPathTemplate` readers go through it.
- **Column-name token inference is opt-in** (`fk.token: "auto"`). It was
  default-on and would have mislinked `scheduler.sch_run.task_id` to a workspace
  task.
- Consoles done: Agent Slots (`features/admin/agent-slots/FEATURE.md`, the
  worked reference) · Users & Access · Relationships hub · reporting/events
  audit log · agent-apps · scheduling + applications.
