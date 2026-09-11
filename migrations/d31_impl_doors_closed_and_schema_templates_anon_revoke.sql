-- B-6 / DD — close the anonymous write hole in the Workbench schema.
--
-- WHAT WAS OPEN (reproduced live on brsgrqvjdzwihsvnfqkf, 2026-09-11, in rolled-back
-- transactions, as role `anon`):
--   1. `insert into workbench.schema_templates(...)` as `anon` SUCCEEDED.
--      `pg_class.relrowsecurity = false`, 0 policies, and `anon` held
--      SELECT/INSERT/UPDATE/DELETE while `workbench` is in `pgrst.db_schemas`,
--      so the published anon key could rewrite or delete all 5 template rows
--      over /rest/v1/schema_templates.
--   2. `select public._d31_impl_add_data_row_to_user_table(<dataset uuid>, '{...}')`
--      as `anon` SUCCEEDED and returned a new `workbench.udt_dataset_rows` id.
--      The `_impl` body carries no `iam.has_access` call and no owner check —
--      the check lives in the wrapper, which `anon` was able to walk around.
--
-- WHY (2) WAS OPEN — corrected 2026-09-11 after independent verification (V-6 §B5).
--   Only these facts are verified, and the first cut of this header asserted more
--   than them. What is TRUE:
--     * The client EXECUTE grants were live on 12 of the 15 `public._d31_impl_*`
--       functions, measured directly. That is the hole, whatever its history.
--     * `platform.definer_client_grant_grandfather` holds a row for every
--       `_d31_impl_*` function (they predate the 2026-08-28 cutoff), and for a
--       listed function the db-rules §6d-4 event trigger
--       `platform.enforce_definer_client_grants` DELIBERATELY STANDS DOWN. So
--       nothing was ever going to take those grants back on its own.
--   What is NOT established, and must not be repeated as if it were:
--     * An identical `CREATE OR REPLACE FUNCTION` does NOT re-apply the schema's
--       default privileges — it PRESERVES the existing ACL. Measured in a
--       rolled-back transaction on `_d31_impl_get_user_table_complete`:
--       acl before = `{postgres=X/postgres}`, acl after = `{postgres=X/postgres}`.
--       Default privileges apply at a fresh `CREATE` (i.e. after a `DROP`) or
--       while the ACL is still NULL.
--     * `aidream/db/migrations/0457_udt_dataset_detail_impl_hides_tombstones.sql`
--       contains one `create or replace function` and NO `DROP` and NO `GRANT`,
--       so it did not re-open anything.
--     * `supabase/migrations/20260715044723_d31_workbench_rpc_access_guards.sql`
--       (D31) does contain six matching revokes on disk, but NEITHER ledger
--       records it as applied: `public._schema_migrations` has no D31 row and
--       `supabase_migrations.schema_migrations`' oldest version is
--       `20260820182802` — no July rows at all. The likeliest reading is that the
--       July revoke never landed and the functions simply carried their
--       birth-time default EXECUTE until today. Not chased; not asserted.
--
-- THE RULE THIS LEAVES, which IS proven:
--   A grandfather row on a function that is NOT a declared client door is a
--   permanently re-openable hole. The guard stands down for it, so ANY path that
--   establishes a client grant — a fresh `CREATE` after a `DROP`, a hand-written
--   `GRANT` — re-opens the door with no warning and no `ddl_guard_log` row.
--   Deleting the grandfather row is the fix; revoking alone is not.
--
-- THE FIX HAS TWO HALVES:
--   A. Revoke client EXECUTE from ALL 15 `public._d31_impl_*` functions (census
--      taken live: 12 of 15 held `anon` EXECUTE). db-rules §6d-4: an `_impl`
--      helper is never a client door. Every one of the 15 has exactly one
--      same-named wrapper, all SECURITY DEFINER, all owned by `postgres`, all
--      calling the impl — so the owner path is untouched and the wrappers keep
--      working. Three of the 15 (`_d31_impl_reply_to_user_review`,
--      `_d31_impl_send_user_review_message`, `_d31_impl_admin_reply_user_review`)
--      already had no client EXECUTE and are live proof the pattern holds.
--   B. DELETE their grandfather rows, so the §6d-4 guard stops standing down for
--      this family. Proven live (V-6 §A3): an explicit
--      `grant execute on function public._d31_impl_add_data_row_to_user_table(uuid, jsonb)
--       to anon, authenticated` is taken back INSIDE the GRANT statement —
--      `anon EXECUTE = false` afterwards — and a durable `platform.ddl_guard_log`
--      row is written under `definer_client_grant_revoked`. This is what turns
--      the instance fix into a class fix.
--      (An identical `CREATE OR REPLACE` also fires the guard, but its revoke is
--      a no-op, because that statement never re-granted anything. The explicit
--      GRANT above is the probe that actually proves the door stays shut.)
--
--   The grandfather half is itself guarded by nothing in the database — a
--   re-INSERT would silently restore the stand-down — so it is held by a repo
--   gate: `pnpm check:impl-doors[:strict]` (`scripts/check-impl-doors.ts`),
--   which asserts against the live DB that no `public.%_impl_%` definer is
--   client-callable, that no grandfather row names an undeclared function
--   (baseline `scripts/impl-doors/grandfather-baseline.json`, may only shrink),
--   and that `anon` holds no privilege on `workbench.schema_templates`.
--
-- `workbench.schema_templates`:
--   It is NOT registered in `platform.entity_types`, so `iam.apply_rls` cannot be
--   used (db-rules §0.5 / §6d: RLS is generated from a token, never hand-written),
--   and it carries NO owner column at all (id, template_name, description, fields,
--   version, created_at) so there is nothing for a policy to key on. The honest
--   minimum tonight is therefore: `anon` loses every privilege; `authenticated`
--   keeps exactly the four operations the live frontend performs
--   (`utils/user-table-utls/template-utils.ts` does .select/.insert/.update/.delete
--   via `.schema('workbench').from('schema_templates')`).
--   RLS stays OFF and that residual is real — see the CONVERGE note below.
--
-- Idempotent (REVOKE/GRANT/DELETE are all re-runnable).
-- Reversible: re-grant EXECUTE and re-insert the grandfather rows.
-- Ledger: public._schema_migrations (source 'matrx-frontend').

-- ── A. `_d31_impl_*` are implementation, never client doors (db-rules §6d-4) ───

DO $$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN
    SELECT n2.nspname AS sch, p.proname AS fn,
           pg_get_function_identity_arguments(p.oid) AS ia
    FROM pg_proc p
    JOIN pg_namespace n2 ON n2.oid = p.pronamespace
    WHERE n2.nspname = 'public'
      AND p.proname LIKE '\_d31\_impl\_%'
    ORDER BY p.proname
  LOOP
    EXECUTE format(
      'revoke all on function %I.%I(%s) from public, anon, authenticated, service_role',
      r.sch, r.fn, r.ia
    );
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'B-6: revoked client EXECUTE on % public._d31_impl_* functions', n;
END $$;

-- ── B. Stop grandfathering them, so the §6d-4 guard enforces from now on ──────

DELETE FROM platform.definer_client_grant_grandfather
WHERE schema_name = 'public'
  AND function_name LIKE '\_d31\_impl\_%';

-- ── C. `workbench.schema_templates` — anon loses everything ───────────────────

REVOKE ALL ON TABLE workbench.schema_templates FROM anon;

-- authenticated keeps exactly what the live frontend performs, no more.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE workbench.schema_templates TO authenticated;

COMMENT ON TABLE workbench.schema_templates IS
  'Shared catalog of user-generated-table field templates (5 rows, created 2025-05). '
  'CONVERGE (B-6, 2026-09-11): RLS is OFF and this table is NOT registered in '
  'platform.entity_types, so iam.apply_rls cannot be applied and no per-table policy '
  'may be hand-written (db-rules §0.5, §6d). It also has no owner column, so there is '
  'nothing an entity/personal variant could key on. anon was revoked outright (it could '
  'previously rewrite or delete every row through the published anon key); authenticated '
  'holds SELECT/INSERT/UPDATE/DELETE, which means ANY signed-in user can still edit or '
  'delete ANY template. Closing that residual needs an owner decision: register the table '
  'as an entity (needs organization_id + created_by + the base contract, db-rules §2) or '
  'retire it. Tracked as DD-033 (classify the remaining unregistered workbench base tables).';
