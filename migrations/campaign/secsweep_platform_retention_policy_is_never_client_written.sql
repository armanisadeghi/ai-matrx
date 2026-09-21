-- lane: SECURITY-SWEEP
-- Chair ruling 1: `platform` and `iam` are NOT client-writable through PostgREST. Every write
-- goes through a SECURITY DEFINER door that decides through the one ladder; reads stay under
-- RLS.
--
-- FIVE GOVERNANCE TABLES WITH A CLIENT WRITE DOOR THAT NO CLIENT WALKS. Each carries an
-- identity column the std_insert / std_update policy pins nothing about — the client chooses
-- WHOSE row it is — and each was left client-writable by the generated policy set:
--
--   iam.access_audit             actor_user_id, subject_user_id, granted_to_user_id.
--       THE AUDIT OF WHO GAVE WHOM ACCESS. A client that may INSERT here can write a record
--       saying somebody else granted the access, or that the access went to somebody else —
--       forging the very evidence the platform keeps to answer "who did this".
--   iam.emergency_door_request   subject_user_id — whose emergency access is being asked for.
--   iam.org_member_controls      user_id — which member the controls apply to.
--   platform.action_request      subject_user_id — who an approval link is about (this lane
--       already withheld its `token_hash`; the row itself was still client-writable).
--   platform.retention_policy    user_id — whose data a retention policy governs.
--
-- THE CENSUS. Zero references in ANY client repository: no `.from("access_audit")`,
-- `.from("emergency_door_request")`, `.from("org_member_controls")`, `.from("action_request")`
-- or `.from("retention_policy")` — and no mention of those names at all — across
-- matrx-frontend (features, app, lib, components, packages), matrx-extend and matrx-local.
--
-- EVERY WRITER IS ALREADY A DOOR, and all of them are SECURITY DEFINER owned by `postgres`,
-- which owns these tables, so none of them is subject to these policies:
--   iam._record_access_audit, iam._notify_door, iam.class_allows, iam.emergency_door_open,
--   iam.record_transfer_refusal, platform.action_request_remint,
--   public.org_admin_set_member_controls, public.org_admin_set_member_status,
--   and the two triggers that reach these tables (`_guard_audited_tier_grant` on
--   iam.permissions, `enforce_retention_policy_settling` on platform.retention_policy) — both
--   SECURITY DEFINER, checked rather than assumed.
--
-- So this removes a second path with no code in it, exactly as `iam.api_keys` did. RESTRICTIVE
-- policies AND with the permissive ones, so no permissive policy — present or future,
-- generated or hand-written — can re-open the write, and their bespoke names are deliberately
-- NOT in `iam.generated_policy_names()`, which makes `iam.apply_rls` preserve them across every
-- regeneration (DD-147). `service_role` (`svc_all`) and reads are untouched.
--
-- ADDITIVE. Nothing is dropped, renamed or revoked.
-- Inverse: migrations/inverse/secsweep_five_governance_tables_are_never_client_written.inverse.sql
-- Guard: `pnpm check:unpinned-security-columns` — a table closed by a restrictive refusal
-- yields no findings, so all five leave the baseline.

-- SPLIT, one table per file: CREATE POLICY takes an ACCESS EXCLUSIVE lock and the
-- five-table transaction timed out on iam.access_audit, which the audit triggers write
-- constantly. One table per file means a cut loses nothing and a busy table blocks only
-- itself.

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('platform','retention_policy')
    ) as t(schema_name, table_name)
  loop
    execute format(
      'create policy %I on %I.%I as restrictive for insert to authenticated, anon with check (false)',
      r.table_name || '_client_insert_refused', r.schema_name, r.table_name);
    execute format(
      'create policy %I on %I.%I as restrictive for update to authenticated, anon using (false) with check (false)',
      r.table_name || '_client_update_refused', r.schema_name, r.table_name);
    execute format(
      'create policy %I on %I.%I as restrictive for delete to authenticated, anon using (false)',
      r.table_name || '_client_delete_refused', r.schema_name, r.table_name);
    execute format(
      'comment on policy %I on %I.%I is %L',
      r.table_name || '_client_insert_refused', r.schema_name, r.table_name,
      'SECURITY-SWEEP 2026-09-21, chair ruling 1: platform and iam are never client-writable through PostgREST. This table''s identity columns were unpinned by the generated policy set and no client code writes it at all; every writer is a SECURITY DEFINER door. RESTRICTIVE so no permissive policy can re-open it; bespoke on purpose, so iam.apply_rls preserves it.');
    raise notice 'secsweep: %.% no longer takes a client write', r.schema_name, r.table_name;
  end loop;
end $$;
