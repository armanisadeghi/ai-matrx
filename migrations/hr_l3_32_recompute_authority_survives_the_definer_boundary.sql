-- HR domain L3 — register item HRB-015, lane l3-time (lane owner).
--
-- 🚨 A LIVE PRIVILEGE ESCALATION ON THE COMPUTED-HOURS TABLE. `hr.recompute_apply`'s authority
-- check began with `current_user in ('service_role','postgres')`. That function is itself
-- `SECURITY DEFINER` owned by `postgres`, so **inside its own body `current_user` IS `postgres`,
-- for every caller, always.** The first disjunct was therefore unconditionally true and the
-- `_can_edit_punch` / `working_record.write` branches after it could never be reached.
--
-- Why that mattered rather than being a tidiness point: `public.hr_recompute_apply` is granted
-- EXECUTE to `authenticated`, and `public` IS exposed to PostgREST (`hr` is not). So any signed-in
-- user could call `.rpc('hr_recompute_apply', …)` straight from a browser, name any employment id,
-- and supersede that person's `hr.work_interval` and `hr.workweek` rows — the computed-hours table
-- payroll exports from. The aidream router's `require_capability(user_id, 'time.recompute')` is a
-- real gate but it is not in that path, and SPEC-ACCESS's posture is that authority is enforced at
-- the definer boundary, not in application code.
--
-- THE FIX, and why it is this and not the wrapper. A `SECURITY DEFINER` function can never use
-- `current_user` to learn who called it — that is what the keyword means. Making the `public`
-- wrapper `SECURITY INVOKER` does not help either: the body is DEFINER too, so `current_user`
-- resets at its own boundary. The discriminator has to be something that survives the crossing,
-- and `auth.uid()` does, because it reads the request's JWT claim rather than the session role.
--
--   * a user calling through PostgREST or through aidream's `acting_as_user` carries a JWT, so
--     `auth.uid()` is NON-NULL → the real authority branches must run;
--   * the D23 worker lane under `acting_as_service()` carries no JWT, so `auth.uid()` is NULL and
--     `current_user` is genuinely `postgres`/`service_role` → the service short-circuit applies.
--
-- So the short-circuit becomes `(v_uid is null and current_user in ('service_role','postgres'))`.
-- Nothing else in the function changes, and the scheduled lane keeps working.
--
-- Authority: SPEC-ACCESS §1.4 (audited-tier gates resolve on `hr.capability`, never on something
-- the caller controls) and §4.2 (a denial names what was missing — the refusal below already does).
-- Applied live as `hr_l3_32_recompute_authority_survives_the_definer_boundary`. Idempotent.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. THIS PATCHES THE SHIPPED DEFINITION IN PLACE RATHER THAN RESTATING 17.5 KB OF FUNCTION.
--    Re-declaring the whole body would mean transcribing it, and a transcription error in a
--    function that writes payroll hours is a worse risk than the one being fixed. The tradeoff is
--    that this file reads the live definition instead of carrying it — so it is written to be
--    SAFE ON REPLAY rather than merely idempotent-looking:
--      * if the corrected form is already present it NO-OPS and says so;
--      * if the original expression is not present EXACTLY ONCE it RAISES rather than guessing,
--        because a body that has moved on is a body this patch has not been reviewed against.
--    A later rewrite of `hr.recompute_apply` should fold the guard into its own source and this
--    file becomes a historical record. (The lane has been bitten before by a migration whose file
--    still carried a broken read after the live body was repaired — see `hr_l3_03a`.)
--
-- 2. THE SERVICE LANE IS NARROWED, NOT REMOVED. `close_point='none'`-style paranoia would be to
--    drop the service branch entirely, but the D23 worker genuinely has no `auth.uid()` and
--    genuinely must recompute. Requiring BOTH conditions is what makes the branch mean "nobody is
--    signed in" instead of "somebody crossed a definer boundary".
-- ===================================================================================

do $mig$
declare
  v_def  text;
  v_old  constant text := 'if not (current_user in (''service_role'',''postgres'')';
  v_new  constant text := 'if not ((v_uid is null and current_user in (''service_role'',''postgres''))';
  v_hits int;
begin
  select pg_get_functiondef(p.oid)
    into v_def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'recompute_apply';

  if v_def is null then
    raise exception
      'hr.recompute_apply does not exist. This patch has nothing to correct; build the function first.';
  end if;

  if position(v_new in v_def) > 0 then
    raise notice 'hr.recompute_apply already carries the auth.uid() guard — nothing to do.';
    return;
  end if;

  v_hits := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_hits <> 1 then
    raise exception
      'Expected exactly ONE authority short-circuit in hr.recompute_apply, found %. The body has '
      'changed since this patch was reviewed against it — refusing to rewrite a payroll-hours '
      'writer on a guess. Re-read the function and fold the guard into its own source instead.',
      v_hits;
  end if;

  execute replace(v_def, v_old, v_new);
  raise notice 'hr.recompute_apply: authority short-circuit now requires auth.uid() IS NULL.';
end
$mig$;

-- Proof, in the same transaction as the change: the corrected predicate is present and the naked
-- one is gone. A migration that cannot show its own effect is a migration nobody can trust.
do $verify$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'recompute_apply';

  if position('v_uid is null and current_user in' in v_def) = 0 then
    raise exception 'POST-CONDITION FAILED: the auth.uid() guard is not in the shipped definition.';
  end if;
  if position('if not (current_user in' in v_def) > 0 then
    raise exception 'POST-CONDITION FAILED: the unguarded short-circuit is still present.';
  end if;
  raise notice 'verified: hr.recompute_apply no longer trusts current_user across its own definer boundary.';
end
$verify$;
