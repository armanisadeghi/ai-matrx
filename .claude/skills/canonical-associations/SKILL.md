---
name: canonical-associations
description: The repeatable recipe for canonicalizing entity-to-entity relationships onto the ONE association system (platform.associations) and for canonicalizing Supabase table references post-2026-reorg. Use whenever a task touches a bespoke M2M junction table, an associate_*/get_*_associations/attach_*/tag_* RPC, FK-tag duplication (project_id/task_id columns used as "tagging"), a "list/attach/count things related to X" UI, or a bare .from("<moved-table>") that should be schema-qualified. Triggers on "associate", "attach", "link", "tag", "related to", "M2M", "junction table", "resources for this org/scope/project", "PGRST205 / 42703 table-not-found", or "canonicalize table ref". Holds the load-bearing boundary (associations vs iam.permissions/iam.memberships), the three recipes (replace-an-M2M, put-a-card-on-a-container, canonicalize-a-table-ref), the entity-token + registry rules, and the campaign backlog.
---

# Canonical Associations — the campaign playbook

There is **ONE** way to relate two entities (content↔content, content↔container) in this app: an edge in **`platform.associations`**, written ONLY through `associationsService` (`features/scopes/service/associationsService.ts`), which is the sole caller of the `assoc_*` RPCs. Every bespoke M2M junction table, `associate_*`/`get_*_associations` RPC, and FK-tag column used as a relationship is **debt to migrate onto this edge**. This skill is the exact recipe a subagent follows, one file at a time.

## The one load-bearing boundary — DO NOT cross it

`platform.associations` is the M2M association edge. It does **NOT** absorb two adjacent single-home domains. Leave them alone:

- **`iam.permissions`** = access control / RLS visibility / sharing (`share_resource_with_org`, `has_permission`, `check_resource_access`, the `shareable_resource_registry`). Deleting/repointing it tears out who-can-see-what. **KEEP.**
- **`iam.memberships`** = org/project membership (`mbr_*`). **KEEP.**

If a relationship answers *"who is allowed to see/do this?"* → it's `iam.*`, not associations. If it answers *"what content/containers is this attached to?"* → it's `platform.associations`. When unsure, ask; do not guess and migrate a permissions grant into an association edge.

## Non-negotiable token rule (this caused the original disaster)

Every `sourceType`/`targetType` MUST be a **canonical `EntityTypeToken`** — generated 1:1 from `platform.entity_types` into `types/generated/entity-types.generated.ts`. **ZERO legacy/guessed names.** `associationGuards` rejects non-canonical tokens and non-UUID ids at the call site, so a wrong token throws in code, not at Postgres.

- A token missing for a **real** entity → register the entity in `platform.entity_types` (DB), regenerate (`pnpm tsx scripts/generate-entity-types.ts`), then use it. Never alias.
- A token that's just a wrong name (`agent_app`→`app`, `user_file`→`file`, `notes`→`note`) → repoint the callsite to the canonical token. Never add a compatibility map.
- Ids are **row UUIDs**, never display strings. (The original bug: an agent passed a cute string as an id.)

---

## Recipe A — Replace a bespoke M2M / association RPC with `associationsService`

**Direction is canonical and fixed: the RESOURCE is the source, the CONTAINER is the target.** `task → organization`, `file → scope`, `note → project`. (Same direction as scope-tagging; a container's attached resources are its INCOMING edges.)

1. **Identify the edge.** What two entities does the junction/RPC relate, and which is the container? Map both to canonical tokens.
2. **Replace writes:**
   - attach → `associationsService.add({ sourceType, sourceId, targetType, targetId, orgId?, label?, role? })`
   - detach → `associationsService.remove({ sourceType, sourceId, targetType, targetId, role? })`
   - "make the set exactly these" → `associationsService.setTargets({ sourceType, sourceId, targetType, targetIds, orgId? })`
   - entity deleted → `associationsService.removeForEntity(type, id)` (purges both directions)
3. **Replace reads:**
   - one entity's edges (both directions) → `associationsService.listForEntity(type, id)`
   - many containers at once → `associationsService.listForTargets(targetType, targetIds)`
   - many sources at once (e.g. scope tags of every visible row) → `associationsService.listForSources(sourceType, sourceIds, targetType?)`
4. **Prefer the hooks** in React: `useAssociations({ type, id })` (entity-centric) or `useContainerLinks({ containerType, containerId, orgId })` (container-centric: `countFor` / `attachedIdsFor` / `linksFor` / `totalCount` / `attach` / `detach`). Never call the service or `assoc_*` RPC directly from a component, and never dispatch `appContextSlice` from association code (durable relationships are not the user's active working context — see `features/scopes/FEATURE.md`).
5. **Retire the old path:** delete the bespoke RPC caller and, on the DB side (Phase 6, after FE soak), graveyard the junction table / RPC via the `db-graveyard-table` skill. Add a `dead-relations.json` entry the moment you stop reading a table.

> A relationship has **exactly one** canonical path. If two surfaces reach the same edge two ways (one via associations, one via a junction), that's the bug — collapse to associations.

---

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

---

## Recipe C — Canonicalize a table reference (kills PGRST205 / 42703)

The 2026 reorg moved tables out of `public` into domain schemas. A bare `supabase.from("tasks")` now resolves to `public.tasks` → **PGRST205** (or a wrong-column **42703**).

1. **Find the canonical home.** Resolve the schema via the entity registry (`getEntityInfo(token).schema`/`.table`) or, for sharing-domain reads, the shareable registry (`getShareableResource(type).schemaName`/`.physicalTable`). Confirm live with a Supabase MCP `execute_sql` against `information_schema` if unsure — never guess a schema.
2. **Qualify the read/write:** `supabase.schema("workspace").from("tasks")`, `supabase.schema("files").from("files")`, etc. (Reads/writes go DIRECT to Postgres — never route a plain DB op through Python or a Next.js API route.)
3. **Register the move** in `scripts/dead-relations.json` (+ run the guard) so the old bare name lights up red until every callsite is repointed.
4. **Verify:** `pnpm check:schema` (live-schema diff: `direct-from-schema` + `dead-relations`) and `pnpm check:dead-relations` (fast offline subset, on every commit). `:strict` variants exit non-zero for CI.

---

## Campaign workflow (per file)

1. Pick one file from `WORK-QUEUE.md`.
2. Apply Recipe A / B / C as it fits. One canonical path only.
3. `pnpm check:schema` + `pnpm check:dead-relations` green; touched files type-check (`pnpm tsc --noEmit` or the type-check skill).
4. Update the feature's `FEATURE.md` + Change Log if behavior changed.
5. Tick the item in `WORK-QUEUE.md`.

**Guardrails to lean on:** `scripts/schema-check/` (live diff + dead-relations), `eslint.config.mjs` (direct-schema ban — extend it to fail-fast in-editor when a whole class is done), `pnpm check:doctrine`. **Loud recovery:** any fallback you add (RLS-only candidate read, etc.) must `console.error` when it fires — a recovery firing means a real ref is still wrong.

## Backlog

The prioritized, file-anchored campaign backlog lives in **[`WORK-QUEUE.md`](./WORK-QUEUE.md)** next to this skill. Start there; keep it current as items land.
