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
-- ROOT CAUSE OF (2), and it is a class, not an instance:
--   `supabase/migrations/20260715044723_d31_workbench_rpc_access_guards.sql` (D31)
--   already revoked client EXECUTE from all six workbench `_d31_impl_*` functions.
--   The grant came BACK because a later `CREATE OR REPLACE FUNCTION` in `public`
--   re-applies the schema's default privileges (EXECUTE to PUBLIC) — aidream
--   `db/migrations/0457_udt_dataset_detail_impl_hides_tombstones.sql` did exactly
--   that to `_d31_impl_get_user_table_complete`.
--   The db-rules §6d-4 event trigger `platform.enforce_definer_client_grants`
--   exists to re-revoke precisely this, but every `_d31_impl_*` function is listed
--   in `platform.definer_client_grant_grandfather` (they predate 2026-08-28), so
--   the guard deliberately stood down. A grandfather row on a function that is NOT
--   a client door is a permanently re-openable hole.
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
--   B. DELETE their grandfather rows, so from now on the §6d-4 guard re-revokes
--      automatically on the next `CREATE OR REPLACE` and writes a
--      `platform.ddl_guard_log` row under `definer_client_grant_revoked`.
--      This is what turns the instance fix into a class fix.
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
