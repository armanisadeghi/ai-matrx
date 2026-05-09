# Agent Apps — Many-to-Many Scope Migration Design

**Status:** `proposal` — design only, no migration run yet.
**Owner:** agent-apps
**Related:** [`features/scope-system/FEATURE.md`](../scope-system/FEATURE.md), [`features/agent-shortcuts/FEATURE.md`](../agent-shortcuts/FEATURE.md)
**Created:** 2026-05-09 (Phase 1d round-3 follow-up)

---

## 1. Problem

`aga_apps` currently has three single-value scope columns:

| Column | Type | Meaning |
|---|---|---|
| `user_id` | `uuid` (FK `auth.users`) | Owner — who created the row |
| `organization_id` | `uuid` (FK `organizations`) | The single org this app is filed under |
| `project_id` | `uuid` | The single project |
| `task_id` | `uuid` | The single task |

The product reality is M2M. A single Flashcard Generator app should be reachable from:

- Multiple **organizations** (e.g. cross-tenant publishing).
- Multiple **projects** within those orgs (lesson-plan project, study-group project, training project).
- Multiple **tasks** (per-week study plan, exam prep, onboarding).

Today the only escape valve is "make the app `is_public = true` and let the world have it." That's too broad. Users want **scoped multi-association** — visible to N specific places, hidden everywhere else.

The same problem exists on `agx_shortcut` ([`migrations/scope_rls_on_agx_shortcut.sql`](../../migrations/scope_rls_on_agx_shortcut.sql)). Solving it here should solve it there with shared primitives.

---

## 2. The three options

### Option A — Three junction tables (per-dimension)

```sql
CREATE TABLE aga_app_organizations (
  app_id          uuid REFERENCES aga_apps(id)      ON DELETE CASCADE,
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  added_by        uuid REFERENCES auth.users(id),
  added_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (app_id, organization_id)
);
CREATE TABLE aga_app_projects (
  app_id     uuid REFERENCES aga_apps(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  added_by   uuid REFERENCES auth.users(id),
  added_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (app_id, project_id)
);
CREATE TABLE aga_app_tasks (
  app_id   uuid REFERENCES aga_apps(id) ON DELETE CASCADE,
  task_id  uuid REFERENCES tasks(id)    ON DELETE CASCADE,
  added_by uuid REFERENCES auth.users(id),
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (app_id, task_id)
);
```

**Pros**
- Real foreign keys per dimension. `ON DELETE CASCADE` cleans up automatically when an org/project/task disappears — no triggers needed.
- Standard, idiomatic Postgres. Planner loves it.
- Composite PK doubles as a covering index for both directions.
- RLS is straightforward — same `EXISTS` joins the codebase already uses against `organization_members`.
- Per-dimension policies — adding an app to an org has different rules than adding it to a task; this lets each junction express its own check cleanly.

**Cons**
- Three new tables instead of one.
- More boilerplate in CRUD code paths (one writer, one reader per junction).
- Adding a new scope level later (e.g. workspace) means another table.

### Option B — One polymorphic junction with `scope_type` enum

```sql
CREATE TYPE aga_scope_kind AS ENUM ('organization','project','task');
CREATE TABLE aga_app_scopes (
  app_id     uuid REFERENCES aga_apps(id) ON DELETE CASCADE,
  scope_type aga_scope_kind NOT NULL,
  scope_id   uuid NOT NULL,
  added_by   uuid REFERENCES auth.users(id),
  added_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (app_id, scope_type, scope_id)
);
```

**Pros**
- Single table; single CRUD code path.
- Easy to add a new scope level — extend the enum.

**Cons**
- **No FK on `scope_id`.** A `uuid` can't reference both `organizations(id)` and `projects(id)` and `tasks(id)`. You lose the cascade story; you'd need three triggers (one per parent) to clean up dangling rows.
- Polymorphic associations are a known Postgres anti-pattern — hard to enforce referential integrity, awkward to join, brittle as the schema evolves.
- RLS has to branch on `scope_type` (`is_org_member` vs. `is_project_member` vs. `is_task_member`) — a `CASE` chain in a `USING` clause that runs per row.
- "All apps in org X" requires a partial index per `scope_type` — back to N indexes anyway.

### Option C — Array columns

```sql
ALTER TABLE aga_apps
  ADD COLUMN organization_ids uuid[] DEFAULT '{}',
  ADD COLUMN project_ids      uuid[] DEFAULT '{}',
  ADD COLUMN task_ids         uuid[] DEFAULT '{}';
```

**Pros**
- One row, no joins for reads.
- GIN indexes work for membership queries.

**Cons**
- **No FK** at all — array elements can't reference rows in another table. Worse than Option B: no enum even narrows down which table they point at.
- Mutations are read-modify-write (`array_append`, `array_remove`) and lose entries on concurrent edits unless wrapped in serialized updates.
- No native uniqueness within the array (need a check constraint).
- Deleting an org leaves zombie UUIDs in every app's `organization_ids` — needs an `AFTER DELETE` trigger on `organizations` that scans every `aga_apps` row.
- RLS works (`EXISTS (SELECT 1 FROM unnest(organization_ids) o WHERE is_org_member(o))`) but the planner can't always optimize through `unnest`.

---

## 3. Recommendation: **Option A — three junction tables**

### Why

1. **Postgres is built for this.** Composite-PK junctions are the textbook M2M shape; every part of the stack — query planner, RLS, indexes, FK cascades — Just Works.
2. **Per-dimension semantics are already different.** RLS gates differ by dimension (`is_org_member` ≠ `is_project_member` ≠ `is_task_member`); CRUD UX differs by dimension (org pickers vs. project pickers vs. task pickers); cascade rules differ by dimension. Jamming them into one table doesn't actually save code — you re-create the per-dimension branching one layer up.
3. **FK cascade is non-negotiable.** Options B and C require maintenance triggers to keep state consistent across parents. Junction tables get this for free.
4. **The codebase already favors junction tables.** `organization_members`, the `permissions` resource registry — the project's idiom is "small, named, junctions." This proposal continues that idiom.
5. **Easy to lift to a generic table later** if we ever conclude three is too many. Going the other direction (generic → typed) is much harder.

### What "ownership" vs. "association" means now

The mental model needs one decomposition the current schema doesn't have:

- **Ownership** — who created and can edit the row. Stays single-column: `user_id` (or `user_id IS NULL AND owner_organization_id` for admin-created org apps). Don't multiplex this.
- **Association** — which orgs/projects/tasks can *see and use* the app, in addition to the owner. **This** is what becomes M2M.

Renaming `organization_id` to `owner_organization_id` clarifies the split and is recommended as part of the migration. `project_id` and `task_id` are demoted entirely — the row no longer "lives in" a specific project/task; projects/tasks pick it up via the junction.

---

## 4. Migration plan (5 phases, additive)

The constraint: never break existing single-column reads in one shot. There are ~50+ callsites that read `app.organization_id` / `app.project_id` / `app.task_id`. Roll the migration forward additively.

### Phase 4.1 — Create the junction tables, backfill, dual-write (one PR)

1. Create the three junction tables (DDL above).
2. Add per-junction RLS:
   - **SELECT**: any user who can SELECT the parent app row can SELECT its junction rows (mirror via `EXISTS (SELECT 1 FROM aga_apps WHERE id = app_id AND <readable predicate>)`).
   - **INSERT**: requester must own the app AND be a member of the target scope.
   - **DELETE**: requester must own the app OR be platform admin.
3. Backfill:
   ```sql
   INSERT INTO aga_app_organizations (app_id, organization_id)
   SELECT id, organization_id FROM aga_apps WHERE organization_id IS NOT NULL;
   -- same for projects, tasks
   ```
4. **Dual-write shim** in the API layer for the brief overlap window:
   - On create/update of an app's scope: write to both the legacy column AND the junction.
   - On delete: cascade handles junction; the legacy column nulls itself with the row.

After this PR ships, the database has both representations. No reader has changed yet.

### Phase 4.2 — Add the new readers (one PR)

1. Update API responses to include `organization_ids: string[]`, `project_ids: string[]`, `task_ids: string[]` projected from the junctions.
2. Add Redux state for the arrays alongside the existing scalars.
3. Wire the new multi-pickers in `/agent-apps/[id]/settings` (see §6 UI shape). UI writes to junctions only; the dual-write shim keeps the legacy column populated with the *first* association so legacy readers don't break.

### Phase 4.3 — Update RLS to use junctions (one PR)

Rewrite the SELECT/INSERT/UPDATE/DELETE policies on `aga_apps` so they read membership from the junctions, not the legacy column. (See §5 below for the exact predicate.)

This is the riskiest single change — every read against `aga_apps` re-evaluates against the new policy. Ship it after 4.2 so the data is definitely populated.

### Phase 4.4 — Read-only on legacy columns (one PR)

1. Stop writing the legacy `organization_id` / `project_id` / `task_id` columns from app code.
2. Replace them with a `BEFORE INSERT OR UPDATE` trigger on `aga_apps` that derives them from the junctions (e.g. `(SELECT organization_id FROM aga_app_organizations WHERE app_id = NEW.id ORDER BY added_at LIMIT 1)`). This is a **back-compat shim** so straggler readers see "the org" until they migrate.
3. Sweep the codebase: replace `app.organization_id` reads with `app.organization_ids[0]` for "primary" needs, or full M2M iteration where needed.

### Phase 4.5 — Drop the legacy columns (final PR, weeks later)

1. Confirm zero readers (grep + Sentry-style breadcrumb on the trigger if paranoid).
2. Drop the trigger.
3. `ALTER TABLE aga_apps DROP COLUMN organization_id, DROP COLUMN project_id, DROP COLUMN task_id;`.
4. Optionally rename `organization_id` → `owner_organization_id` if we kept it for "this org owns the row" (recommended; see §3).

Total wall-clock: 4.1 ships first; 4.2/4.3 within a week; 4.4 within two; 4.5 after a soak window with zero hits on the back-compat shim.

---

## 5. RLS implications

### Current SELECT policy (`agent_apps_read_public`):
```sql
(status = 'published' AND is_public = true)
OR user_id = auth.uid()
OR (organization_id IS NOT NULL AND public.is_org_member(organization_id))
OR (user_id IS NULL AND organization_id IS NULL AND project_id IS NULL AND task_id IS NULL
    AND public.is_platform_admin())
```

### Proposed SELECT policy:
```sql
(status = 'published' AND is_public = true)
OR user_id = auth.uid()
OR EXISTS (
  SELECT 1 FROM public.aga_app_organizations ao
  WHERE ao.app_id = aga_apps.id
    AND public.is_org_member(ao.organization_id)
)
OR EXISTS (
  SELECT 1 FROM public.aga_app_projects ap
  WHERE ap.app_id = aga_apps.id
    AND public.is_project_member(ap.project_id)   -- NEW HELPER, see prerequisites
)
OR EXISTS (
  SELECT 1 FROM public.aga_app_tasks at
  WHERE at.app_id = aga_apps.id
    AND public.is_task_member(at.task_id)         -- NEW HELPER, see prerequisites
)
OR (
  user_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.aga_app_organizations WHERE app_id = aga_apps.id)
  AND NOT EXISTS (SELECT 1 FROM public.aga_app_projects      WHERE app_id = aga_apps.id)
  AND NOT EXISTS (SELECT 1 FROM public.aga_app_tasks         WHERE app_id = aga_apps.id)
  AND public.is_platform_admin()
)
```

The "global / platform admin" arm now means "no associations exist" rather than "all four columns are NULL."

### INSERT/UPDATE/DELETE on `aga_apps`

These don't change much — they gate on **ownership** (`user_id = auth.uid()` or the owner-org check), not on associations. Associations are managed via the junction tables, which have their own policies.

### Junction table policies

```sql
-- aga_app_organizations
CREATE POLICY ao_select ON aga_app_organizations FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM aga_apps a
    WHERE a.id = aga_app_organizations.app_id
      AND (a.user_id = auth.uid() OR is_org_member(aga_app_organizations.organization_id))
  )
);
CREATE POLICY ao_insert ON aga_app_organizations FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM aga_apps a WHERE a.id = app_id AND a.user_id = auth.uid())
  AND is_org_member(organization_id)
);
CREATE POLICY ao_delete ON aga_app_organizations FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM aga_apps a WHERE a.id = app_id AND a.user_id = auth.uid())
  OR is_platform_admin()
);
```

The `INSERT` policy is **two-sided**: you must own the app (so randos can't tag your apps onto their org) AND be a member of the target org (so you can't sneak your app into an org you don't belong to). Symmetric policies for `aga_app_projects` and `aga_app_tasks`.

### Prerequisite — membership helpers for project/task

`is_org_member(uuid)` already exists. The proposal needs:

- `public.is_project_member(uuid)` — true if `auth.uid()` has any access path to the project (member of the owning org, plus any direct project assignment via `permissions`).
- `public.is_task_member(uuid)` — true if `auth.uid()` is assigned to the task or has access to its parent project.

These should be created as `SECURITY DEFINER` SQL functions in a precursor migration (`scope_helpers_project_task.sql`). They're broadly useful — `agx_shortcut`'s scope RLS will want them too.

### Public anonymous reads

`agent_apps_read_anon` (anon-only) is unchanged: `status = 'published' AND is_public = true`. Anonymous users never read scoped apps; that arm of the policy is only consulted by `authenticated`.

### Performance

Each `EXISTS` clause adds an index lookup, but every junction table has a covering composite PK and a reverse index (see DDL — add `CREATE INDEX idx_aga_app_organizations_org ON aga_app_organizations(organization_id, app_id)` for the inverse direction). Listing "all apps for org X" stays O(matching rows). Listing "is this app readable by user Y" becomes a small constant-bound `EXISTS` per dimension — measurable but not painful, and only paid on rows that fall through the cheap arms (`user_id = auth.uid()`, public).

---

## 6. UI shape — `/agent-apps/[id]/settings`

The current Scope card holds three single-UUID `<Input>` fields with the placeholder "UUID — leave empty for personal scope." Replace with three multi-pickers.

### Component contract (lives in `features/scope-system/components/`)

Build once, reused by `agent-apps`, `agent-shortcuts`, and any future multi-scope feature (per CLAUDE.md "build once, reuse across admin/user/org" principle):

```tsx
<OrganizationsMultiPicker
  value={organizationIds}                      // string[]
  onAdd={(orgId) => addAssociation('org', orgId)}
  onRemove={(orgId) => removeAssociation('org', orgId)}
  // shows orgs the user is a member of, type-ahead search, chips with X
/>

<ProjectsMultiPicker
  scopedTo={organizationIds}                   // limits choices to these orgs
  value={projectIds}
  onAdd={...}
  onRemove={...}
/>

<TasksMultiPicker
  scopedTo={projectIds}
  value={taskIds}
  onAdd={...}
  onRemove={...}
/>
```

Each picker mirrors the existing `AgentAppCategoryPicker` / `AgentAppTagsInput` interaction model:
- Searchable popover with type-to-filter.
- Current selections render as removable chips inline.
- Each add/remove is an immediate junction insert/delete (idempotent — junction PK rejects duplicates, missing-row delete is a no-op).
- Optimistic update with toast on failure.

### Empty-state copy
> "Not associated with any organizations. This app is private to you. Add an organization to share it with members."

### Cascading enablement
- `ProjectsMultiPicker` is disabled (with helper text "Add an organization first") until at least one org is selected — projects belong to orgs.
- `TasksMultiPicker` is disabled until at least one project is selected.
- This is purely a UX nudge; the database doesn't enforce a project's parent org membership against the app's org list. (Should it? See §7 Open questions.)

### Where the card sits

Current settings layout has the Scope card after Agent binding and before Rate Limits. Keep that position. The card title changes from `Scope` to `Associations` and the helper text updates:

> "Add this app to organizations, projects, or tasks. Members of any associated scope can see and run this app. Public apps (`is_public: true`) ignore associations and are visible to everyone."

### Settings vs. /run UX

A user hitting `/agent-apps/[id]/run` can still use the app even if it's associated with multiple orgs — the run path doesn't depend on which scope the user came from. Consumption is the same. Listing/filtering is what changes: `/agent-apps` and `/org/[slug]/agent-apps` and (future) `/projects/[id]/apps` each query the appropriate junction.

---

## 7. Open questions for review

1. **Owner-org rename.** Recommend renaming `aga_apps.organization_id` → `owner_organization_id` to disambiguate from the `aga_app_organizations` association. Adds one ALTER but clears up a footgun. **Decide before Phase 4.5.**
2. **Project/org consistency.** Should the DB enforce that every `aga_app_projects.project_id` belongs to an org that's also in `aga_app_organizations`? Probably not — too coupled, and the user can always add a project to an org separately. Leave it as a UX nudge in the picker.
3. **Soft-delete semantics for parent rows.** When an org is *archived* (not deleted), should the app stay associated? Today there's no archive — a hard delete cascades. If archives ship later, the M2M entries should remain; surface "Archived" pill on the chip.
4. **Migration of `agx_shortcut`.** Same problem, same solution. Recommend running a parallel `agx_shortcut_organizations` / `_projects` / `_tasks` migration in a follow-up PR using the same shape and the same shared `is_project_member` / `is_task_member` helpers. Not in scope for this doc.
5. **Composition with `is_public`.** Today `is_public = true` overrides scope. That stays — public apps don't need associations. But should the UI hide the Associations card when `is_public = true`? Recommend showing it but greyed-out with helper text "Public apps are visible to everyone; associations have no effect."
6. **Backfill of "global" apps.** Rows with all scope columns NULL (platform-admin global apps) stay that way — no junction entries, the `is_platform_admin()` arm of the SELECT policy handles them.
7. **Rate-limit and analytics scope.** Out of scope. Per-association analytics (executions per org) is a separate feature; today the counters are denormalized on the row.

---

## 8. Out of scope

- Sharing tokens / public share links (handled by `features/sharing/` — orthogonal to scope per `features/scope-system/FEATURE.md` Flow 4).
- Per-association overrides (e.g. "this app shows a different name in Org A vs. Org B") — would require a join row with overrides, separate proposal.
- Workspace scope level (mentioned in the scope tree but not yet on `aga_apps`).
- Mobile UI — the desktop multi-picker pattern translates to a Drawer sheet on mobile per CLAUDE.md, but the contract is identical.

---

## 9. Decision required

Before any migration runs, the user should confirm:

1. **Approach: junction tables?** (recommended) or alternative (B/C)?
2. **Rename `organization_id` → `owner_organization_id`?** (recommended yes)
3. **Phase order:** ship Phase 4.1+4.2 in one window, then 4.3, then 4.4, then 4.5 after a soak — or batch them differently?
4. **Apply the same migration to `agx_shortcut`** in a follow-up? (recommended yes — same problem)

Once those are resolved, the migration script itself is mechanical (~150 lines of DDL + RLS + backfill); the bulk of the work is in the readers (RLS rewrite, API projection, UI multi-pickers).

---

## Change log

- `2026-05-09` — initial design proposal. No migration run.
