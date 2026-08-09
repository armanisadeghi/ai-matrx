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

1. **Registry route gaps.** Tokens with no `hrefFor` that have a real route:
   audit in progress. Every one added is a door on every surface at once.
2. **Admin consoles** under `app/(admin)/administration/**` — the densest
   concentration of entity tables. Audit in progress.
3. **(core) feature list/detail surfaces** — `/agents`, `/notes`, `/files`,
   `/tasks`, `/transcripts`, `/marketing/*`.
4. **Association surfaces** — `features/scopes/components/associations/`
   (`AssociationCard`, `AssociationList`, `AttachedItemsSheet`). These render
   entity names BY TOKEN, so one fix covers every container that shows attached
   items.
5. **Dialogs / drawers / warnings** that name an entity.
6. **Toasts and badges.**
7. **`(dev)` demos** — last.
8. **aidream admin surfaces** — after matrx-frontend.
9. **BLOCKED — association edges have no listable destination.** Every
   `edge_count` / `closure_rows` / `reverse_edge_count` in the Relationship
   Manager (`RelationshipRulesClient`, `ProblemsPanel`) counts real
   `platform.associations` rows that NOTHING in the app can list, so those
   counts stay inert on purpose (a count is a door only when a destination
   lists the records). A client-side read is not the fix: `platform.associations`
   RLS is `iam.has_org_access(organization_id)` on SELECT, while the counts come
   from `is_super_admin()` RPCs — the panel would silently under-report.
   **Needs:** an `admin_association_edges(p_source_type, p_target_type, p_label,
   p_direction)` SECURITY DEFINER RPC + an Edges destination on the
   Relationships hub (each endpoint rendered with `EntityRef`). Then the counts
   become links in one edit.
10. **Registry route gaps found in the Relationships hub audit (2026-08-09):**
    no `user`/`user_profile` `hrefFor` and no `/administration/users/[id]`
    route — the console's user door is `features/admin/users/components/AdminUserRef.tsx`
    (a menu of param-consuming per-user admin pages). Consume it; don't
    hand-roll. `organization` has a route but no peek.

## Done

- Door resolution centralized — `components/official/entity-ref/doors.ts`;
  `EntityRef` and `MatrxUuidCell` both consume it, so a registry edit can never
  light one up and not the other.
- `MatrxDataTable` FK columns open themselves: `fk.token` declares the target,
  and a column literally named `<token>_id` resolves its route + peek with no
  wiring (`tokenFromColumnName`). Same for the row inspector's raw FK fields.
- Agent Slots console — the surface that provoked the ruling. See
  `features/admin/agent-slots/FEATURE.md`.
