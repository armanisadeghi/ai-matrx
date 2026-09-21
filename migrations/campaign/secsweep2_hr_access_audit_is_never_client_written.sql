-- lane: SECURITY-SWEEP-2
-- THE AUDIT OF WHO TOUCHED WHOSE HR RECORD IS NEVER CLIENT-WRITTEN.
--
-- hr.access_audit.actor_user_id is the last identity column in the baseline, and it is the same
-- forgery shape SECURITY-SWEEP closed on iam.access_audit: a client that may choose the actor
-- can write a record saying SOMEBODY ELSE looked at an employee's file -- forging the very
-- evidence the platform keeps to answer "who did this".
--
-- 🚨 IT IS ALREADY REFUSED TODAY, AND THIS IS A GUARD-VISIBILITY GAP RATHER THAN A HOLE. Read
-- before writing: the `hr` schema is NOT in PostgREST's exposed schema list, and every hr table
-- carries `_zz_guard_hr_write` -> hr._guard_hr_write(), which RAISES
-- `42501 hr_write_forbidden: % on %.% has no privileged HR write path` unless the statement has
-- armed hr.arm_write(). Its own hint states the law: "No client writes an hr table through
-- PostgREST." A client write of this table already dies twice over.
--
-- SO WHY ADD THE POLICY. Because `check:unpinned-security-columns` cannot SEE either refusal.
-- Its trigger rule deliberately requires the trigger function to be BESPOKE -- attached to
-- exactly one relation -- and hr._guard_hr_write serves the whole hr schema. That narrowness is
-- correct and was bought with real pain: the generous version cleared 107 genuine findings
-- because shared org-stampers name `user_id` in passing. hr._guard_hr_write is a different
-- animal (it REFUSES the write outright rather than mentioning a column), but teaching the
-- census to tell those apart statically is a rule I could not make honest, and an unverified
-- exemption in a security classifier is exactly what this lane refuses to add.
--
-- A RESTRICTIVE REFUSAL is the same statement in the form the guard already understands and
-- already verifies from the catalog on every run. It is belt-and-braces over a guard that
-- already holds, it costs nothing, and it makes the closure legible rather than asserted.
--
-- service_role and every SECURITY DEFINER hr RPC are unaffected (they run as an owner that
-- bypasses RLS). Reads and deletes are untouched.
--
-- ADDITIVE. Nothing is dropped, renamed or revoked.
-- Inverse: migrations/inverse/secsweep2_hr_access_audit_is_never_client_written.inverse.sql
-- Guard: `pnpm check:unpinned-security-columns` -- both baseline rows for this pair leave.

set local lock_timeout = '2s';

create policy access_audit_client_insert_refused on hr.access_audit
  as restrictive for insert to authenticated, anon with check (false);

create policy access_audit_client_update_refused on hr.access_audit
  as restrictive for update to authenticated, anon using (false) with check (false);

comment on policy access_audit_client_insert_refused on hr.access_audit is
  'SECURITY-SWEEP-2 2026-09-21: the audit of who touched whose HR record is never client-written -- a client that may choose actor_user_id forges the evidence of who did it. Already refused by hr._guard_hr_write and by hr not being PostgREST-exposed; this states the same closure in the form check:unpinned-security-columns verifies from the catalog. RESTRICTIVE so no permissive policy can re-open it; bespoke on purpose, so iam.apply_rls preserves it.';
