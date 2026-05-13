# Org "Shared Resources" — implementation plan & status

This doc tracks the work to make every tile on `app/(a)/organizations/[orgId]/page.tsx`
("Shared Resources" grid) show real counts and link to a real list page, plus
add a "Share with organization" path for each resource type.

Source of truth for sharing is `features/sharing/FEATURE.md` and
`utils/permissions/registry.ts` (the TS mirror of `public.shareable_resource_registry`).

---

## Tile status

| Tile | Resource type | Count source | List page | Share-with-org path | Status |
|---|---|---|---|---|---|
| Agents | `agent` (`agx_agent`) | `organization_id` + permissions | placeholder | `ShareModal` (registered) | **Count ✓ / List TODO / RLS broken on table** |
| Agent Apps | not registered | — | placeholder | needs registration | **Blocked on DB migration A** |
| Agent Shortcuts | n/a (scope-system) | `useAgentShortcuts({scope:'organization'})` | real page | n/a (built-in scope) | ✓ Complete |
| Content Templates | not registered, table TBD | — | placeholder | needs registration | **Blocked on DB migration B** |
| Notes | `note` (`notes`) | `organization_id` + permissions | **real page (this PR)** | `ShareNoteDialog` (already wires `shareWithOrg`) | ✓ Count + List complete; RLS still broken on table |
| Files | `user_files` | permissions only | placeholder | `ShareModal` (registered) | **Count ✓ / List TODO** |
| Projects | n/a (built-in `ctx_projects.organization_id`) | `getOrgProjects` | real page | n/a | ✓ Complete |
| Tasks | `task` (`ctx_tasks`) | join through `projects` + permissions | placeholder | `ShareModal` (registered) | **Count ✓ / List TODO / RLS broken on table** |
| Tables | `udt_datasets` | permissions only | placeholder | `ShareModal` (registered) | **Count ✓ / List TODO** |
| Workflows | not registered, table TBD | — | placeholder | needs registration | **Blocked on DB migration C** |

---

## Three DB migrations needed (one per unregistered feature)

Each follows the same pattern — `features/sharing/FEATURE.md` § "Adding a new
shareable resource type" is the contract.

### Migration A — register `agent-apps` (`aga_apps`)

```sql
-- 1. Confirm the table has an `is_public boolean` column. If not, add it.
ALTER TABLE public.aga_apps
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

-- 2. Add to the registry.
INSERT INTO public.shareable_resource_registry
  (resource_type, table_name, id_column, owner_column, is_public_column, display_label, url_path_template, rls_uses_has_permission)
VALUES
  ('agent_app', 'aga_apps', 'id', 'user_id', 'is_public', 'Agent App',
   '/agent-apps/{id}', true);

-- 3. RLS — replace SELECT/UPDATE/DELETE policies with the standard form:
--    USING (user_id = auth.uid() OR is_public OR has_permission('aga_apps', id, 'viewer'))
--    See features/sharing/FEATURE.md § "RLS enforcement" for canonical wording.
```

Then mirror in `utils/permissions/registry.ts` (the parity test will block merge until you do).

Frontend follow-up (separate change, post-migration):
- Replace `/organizations/[orgId]/agent-apps/page.tsx` with a real list page using
  `aga_apps.organization_id` (already exists on the row) + `listOrgSharedResources(orgId, 'agent_app')`.
- Add `<ShareButton resourceType="agent_app" />` to each agent-app card on the
  user-scoped `/agent-apps` list page.

### Migration B — register Content Templates

**First step:** audit the table. Check `features/content-templates/` to find
the canonical table name. Likely candidates: `content_template`, `prompt_templates`, `agent_content_blocks`.

```sql
-- Once table is identified (call it <T>):

ALTER TABLE public.<T>
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id),
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

INSERT INTO public.shareable_resource_registry (...)
VALUES ('content_template', '<T>', 'id', 'user_id', 'is_public', 'Content Template',
        '/settings/content-templates/{id}', true);

-- + RLS standard form
```

Same TS mirror + parity test as Migration A.

### Migration C — register `workflow`

```sql
-- Audit features/workflows/ for the canonical table name first.
-- Assume `workflow` for now; adjust as needed.

ALTER TABLE public.workflow
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id),
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

INSERT INTO public.shareable_resource_registry (...)
VALUES ('workflow', 'workflow', 'id', 'user_id', 'is_public', 'Workflow',
        '/workflows/{id}', true);

-- + RLS standard form
```

---

## RLS bug — affects Agents, Notes, Prompts, Tasks (separate fix)

Four already-registered resource types have `rls_uses_has_permission = false`:
`agent` (`agx_agent`), `note` (`notes`), `prompt` (`prompts`), `task` (`ctx_tasks`).
This means **sharing rows insert successfully but RLS on the underlying table
does not grant access to the grantee.** Org members will not see shared rows in
the org list until this is fixed.

Standard fix per table:

```sql
DROP POLICY IF EXISTS "Users can view their own notes" ON public.notes;
CREATE POLICY "users_and_grantees_can_select"
  ON public.notes FOR SELECT
  USING (
    user_id = auth.uid()
    OR is_public = true
    OR has_permission('notes', id, 'viewer')
  );
-- (repeat with 'editor' for UPDATE, 'admin' for DELETE)
```

Once fixed, set `rls_uses_has_permission = true` in the registry row AND in the
TS mirror.

---

## Generic primitives delivered this PR

- `utils/permissions/orgResources.ts` — `countOrgSharedResources(orgId, resourceType)` and `listOrgSharedResources(orgId, resourceType)`. Drives every org tile count and powers org-scoped lists. No per-feature service rewrite required.
- `app/(a)/organizations/[orgId]/page.tsx` — fetches all counts in parallel; tiles display them.
- `app/(a)/organizations/[orgId]/notes/page.tsx` — real list of org-owned + shared-with-org notes.

The 5 remaining TODOs (org list pages for agents, agent-apps, files, tasks, tables, workflows, content-templates) all follow the same pattern as the new notes page — clone, swap resource type and display fields.
