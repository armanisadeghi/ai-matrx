# Canonical Associations — Recipe B (association surface on a container)

Companion to [`SKILL.md`](./SKILL.md) — read it first: the load-bearing boundary, the token rule, and the edge-direction rule govern every step here.

## Recipe B — Put an association surface on a container (the card system)

The container page shows one card per attachable entity kind, fully registry-driven. Adding a card is **one overlay line**, no per-page logic.

1. **Mount the provider** once on the container page:
   ```tsx
   <PrimaryEntityProvider value={{ type: "organization", id: orgId, orgId, label: orgName }}>
     <AssociationCardGrid />          {/* every listable token */}
     {/* or scope it: <AssociationCardGrid tokens={["task", "file", "note"]} /> */}
   </PrimaryEntityProvider>
   ```
   `type` must be an `AssociationTargetType` (org / scope / scope_type / project / task / …). For a single kind, use `<AssociationCard token="task" />`.
2. **Need a NEW kind of card?** Add ONE line to `ENTITY_OVERLAY` in `features/scopes/registry/entityRegistry.ts`: `token: { Icon, labelPlural, titleColumn }`. Owner/org columns are conventions (`created_by` / `organization_id`) — only override if the table truly diverges. The token must be a canonical `EntityTypeToken`. That's the whole change; the card, count, and picker light up.
3. **Resolve metadata** anywhere via `getEntityInfo(token)` (schema/table/title/icon/owner/org) — never hardcode a table name, icon, or label in a component, and never read the deprecated `features/organizations/resource-catalogue.ts` for display (that file survives only for the `iam.permissions` sharing surface).

The candidate reader (`associationCandidates.ts`) lists the user's own attachable rows (`created_by = me`) with loud RLS-only fallback on a missing-column error — extend it only via the registry.

**The third face — the name dropdown.** `AssociationEntitySelect` (`features/scopes/components/associations/`) is the canonical compact control for "which entity of token X is this panel bound to": name display + inline rename + always-visible switcher + unlink + "+ New" create-and-attach, adapter-driven (default `useAssociationEntitySelectAdapter`; bespoke reference = war-room `useThreadEntitySelect.ts`). Generic row create/rename lives in `service/entityRows.ts` (registry titleColumn + conventions). **Invoke the `association-entity-select` skill** before building any switcher/rename/add-new control for a container's entities.
