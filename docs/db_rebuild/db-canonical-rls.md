# Canonical RLS — the ONE way to govern a table

> **Single source of truth for how any governed table gets its row-level security.**
> No table hand-writes policies. No feature invents its own access logic. There is
> one generator and one resolver. If you need behavior they don't cover, you extend
> the generator/resolver — you do **not** write a per-table exception.

Read alongside [`db-canonical-access-model.md`](./db-canonical-access-model.md) (the access *rulebook* — what access *means*). This doc is the *mechanism* — how that rulebook is enforced on every table.

---

## The two primitives (this is all there is)

1. **The resolver — `iam.has_access(p_type text, p_id uuid, p_required permission_level) → boolean`.**
   The single function that answers "may the current user do `p_required` to row `p_id` of type `p_type`." It reads the two registries (`platform.entity_types`, `platform.entity_relationships`) and implements the rulebook §4 resolution order (owner → public → org → containment → grant; components defer to their composition parent). **Both RLS policies and Python call this same function.** Never reimplement its logic anywhere.

2. **The generator — `iam.apply_rls(p_schema, p_table, p_token, p_variant)`.**
   The single function that stamps a table's policies. Calling it **drops every existing policy on the table and recreates the canonical set** (`svc_all`, `std_select`, `std_insert`, `std_update`, `std_delete`). That's what makes it "the only thing that governs the table." Idempotent — safe to re-run.

```sql
SELECT iam.apply_rls('public', 'wr_threads', 'thread', 'entity');
```

---

## The canonical policy shapes (what the generator emits)

**Standard governed entity** (`variant => 'entity'`) — owner is a **direct branch** (read straight off the row), everything else delegates to the resolver:

| cmd | expression |
|---|---|
| SELECT | `deleted_at IS NULL AND (created_by = (select auth.uid()) OR iam.has_access(token, id, 'viewer'))` |
| INSERT | `WITH CHECK (created_by = (select auth.uid()) AND (organization_id IS NULL OR iam.has_org_access(organization_id)))` |
| UPDATE | `… (created_by = (select auth.uid()) OR iam.has_access(token, id, 'editor'))` (USING + CHECK) |
| DELETE | `created_by = (select auth.uid()) OR iam.has_access(token, id, 'admin')` |

**Component entity** (`is_component=true` in the registry — auto-detected) — no own owner/visibility; gates entirely on its composition **parent**, whose id lives on the row (`fk_column` from `entity_relationships`):

| cmd | expression |
|---|---|
| SELECT | `deleted_at IS NULL AND iam.has_access(parent_type, <fk_column>, 'viewer')` |
| INSERT | `WITH CHECK (iam.has_access(parent_type, <fk_column>, 'editor'))` |
| UPDATE/DELETE | `iam.has_access(parent_type, <fk_column>, 'editor')` |

**Ledger** (`variant => 'ledger'`) — org-scoped read, writes are service-role only: `std_select USING iam.has_org_access(organization_id)`.

`svc_all` (service role, `USING true WITH CHECK true`) is always created so the backend keeps full access.

---

## Why owner is a direct branch — the bug this killed (2026-06-26)

The hard-won reason the SELECT/UPDATE policies lead with `created_by = (select auth.uid())` instead of folding the owner check inside `iam.has_access`:

`iam.has_access(type, id, …)` resolves access by **re-reading the row by id**. During `INSERT … RETURNING` — which is exactly what supabase-js `.insert().select()` emits — Postgres evaluates the **SELECT policy against the still-in-flight row**. The resolver's self-read can't see the row yet (same statement, not committed), returns `false`, and the insert dies with `42501 "new row violates row-level security policy"`. Owner creates were **100% broken** on every table whose policy was just `iam.has_access(token, id, 'viewer')`.

The owner branch reads `created_by` **directly off the NEW row** (like `deleted_at` already was), so the inserter — who is always the owner (`INSERT` check forces `created_by = auth.uid()`) — passes immediately, no self-read. This is rulebook §4 step 3 / §5 ("owner is a direct branch"), restored.

> **Rule of thumb:** an RLS policy may read the row's **own columns** directly, but must reach the **one resolver** for anything that requires reading *other* rows. Never put `iam.has_access(self_token, id, …)` as the *only* branch on a root entity — always lead with the owner short-circuit.

---

## How to onboard a table (the only procedure)

1. Register it in `platform.entity_types` (token, schema, table, `is_component`, `default_visibility`). Component? add its `composition` edge to `platform.entity_relationships`.
2. Ensure the base columns exist (`created_by`, `organization_id`, `visibility`, `version`, `deleted_at` where applicable) via the base retrofit — `iam.apply_rls` **raises loudly** if a standard entity lacks `created_by`/`organization_id`, rather than emitting a broken policy.
3. `SELECT iam.apply_rls(schema, table, token, variant);`
4. **Verify live** as a real authenticated user (not service role): an `INSERT … RETURNING` must succeed for the owner, and a *different* user must NOT see the row.

---

## Known gaps / open canonical decisions (tracked in [`db-canonical-rls-sweep-todo.md`](./db-canonical-rls-sweep-todo.md))

- **`_stamp_actor` doesn't auto-fill `created_by` over PostgREST.** It reads `current_setting('app.user_id')`, which PostgREST never sets (it sets `request.jwt.claims`). So `created_by` is only filled if the **client passes it**. Either every insert path passes `created_by`, or we fix the trigger to fall back to `(select auth.uid())`. (Recommended: fix the trigger — makes the canonical insert robust.)
- **`anon` / public visibility read.** Canonical policies are `TO authenticated`; `iam.has_access` returns false for a null uid, so `visibility='public'` rows are not anon-readable through these policies. Public/share surfaces need a separate canonical decision (dedicated public-read policy or service-role path).
- **`thread → war_room` containment edge is missing** from `entity_relationships`, so a war-room member who doesn't own a thread can't reach it via cascade (owner is unaffected). Needed for War Room sharing.
- **INSERT org check** is `organization_id IS NULL OR has_org_access(...)`. If a personal/member-less org context legitimately has no `organization_members` row with a non-null org, that insert would be blocked — revisit when the org/scope security overhaul lands (KNOWN_DEFECTS D2).

---

## Change Log
- **2026-06-26** — Built `iam.apply_rls` v2 (this doc). Replaced the v1 inline generator + all hand-written `has_access` policies with one generator that funnels through `iam.has_access` and leads with the owner short-circuit. Applied to `public.wr_sessions`, `public.wr_threads` (fixes the War Room create `42501`). Sweep of remaining governed tables tracked in the TODO.
