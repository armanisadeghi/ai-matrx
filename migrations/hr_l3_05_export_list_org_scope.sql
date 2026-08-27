-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- hr_l3_05_export_list_org_scope.sql — lane L3 / HRB-015, 2026-08-26.
--
-- APPLIED LIVE and verified: `scoped_now=true`, `ambient_remains=false`, `anon_can_exec=false`,
-- `authed_can_exec=true` against `brsgrqvjdzwihsvnfqkf` (db.matrxserver.com).
--
-- 🚨 THE DEFECT — the last ambient `hr.capability` call site.
-- After the HRB-007 cross-org hardening, `hr.capability(uid, cap)` with no organization answers
-- *"does this user hold it in ANY org"*. `public.hr_payroll_export_list` called it exactly that
-- way, so a payroll administrator at org A satisfied the `payroll.read` test while asking for
-- org B's export history.
--
-- The reader was not wide open: it already required an ACTIVE EMPLOYMENT in the requested org
-- (`v_mine`), so a stranger reached nothing. But **working somewhere and being allowed to read its
-- payroll are different facts**, and this door accepted the first as proof of the second. Someone
-- employed at org B in any capacity, who also held `payroll.read` at org A, passed both checks and
-- was handed org B's payroll files — which name people, their hours and their money.
--
-- THE FIX is one argument, matching how every other HR door was converted (frontend 0b04a021ba /
-- d449e5c55f): pass the organization the query already filters by into the capability check. The
-- `org` scope fails closed without it.
--
-- WHY A prosrc REPLACE RATHER THAN A RE-DECLARATION. The body is ~90 lines of projection owned by
-- lane L13 in `hr_l13_02_export_grain_and_reader.sql`. Restating it here to change one call is how
-- two versions of a reader begin to drift. The declaring file has been given the same scoped call
-- so that re-applying IT cannot reopen this hole either — the two now agree, and this migration is
-- idempotent against both.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

do $$
declare
  v_def text;
  v_new text;
  v_old_call constant text := $q$hr.capability(v_user, 'payroll.read')$q$;
  v_new_call constant text := $q$hr.capability(v_user, 'payroll.read', null, current_date, p_organization_id)$q$;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_payroll_export_list';

  if v_def is null then
    raise exception 'public.hr_payroll_export_list does not exist';
  end if;

  if position(v_new_call in v_def) > 0 then
    raise notice 'hr_payroll_export_list already scopes payroll.read to the organization';
    return;
  end if;

  if position(v_old_call in v_def) = 0 then
    raise exception
      'hr_payroll_export_list carries neither the ambient nor the scoped payroll.read call — the body changed underneath this migration; re-derive the replacement rather than forcing it';
  end if;

  v_new := replace(v_def, v_old_call, v_new_call);
  execute v_new;
end $$;

-- ── Assertions. A migration that cannot fail proves nothing. ────────────────────────────────────
do $$
declare
  v_src text;
begin
  select prosrc into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_payroll_export_list';

  if position($q$hr.capability(v_user, 'payroll.read', null, current_date, p_organization_id)$q$ in v_src) = 0 then
    raise exception 'ASSERTION FAILED: payroll.read is still checked without an organization';
  end if;

  if v_src ~ $re$hr\.capability\s*\(\s*v_user\s*,\s*'payroll\.read'\s*\)$re$ then
    raise exception 'ASSERTION FAILED: an ambient hr.capability(v_user, ''payroll.read'') call remains';
  end if;

  -- The anon revoke must still hold. `create or replace` re-applies pg_default_acl, which carries
  -- postgres → public schema → functions → anon=X: every new function in `public` is born
  -- executable by `anon` through an EXPLICIT grant that a PUBLIC revoke does not touch. A payroll
  -- history reader reachable without a bearer token is a worse hole than the one this closes.
  if has_function_privilege('anon', 'public.hr_payroll_export_list(uuid,uuid,integer)', 'execute') then
    raise exception 'ASSERTION FAILED: anon can execute hr_payroll_export_list';
  end if;

  raise notice 'OK: payroll.read is scoped to p_organization_id and anon is revoked';
end $$;

revoke all on function public.hr_payroll_export_list(uuid, uuid, integer) from public;
revoke all on function public.hr_payroll_export_list(uuid, uuid, integer) from anon;
grant execute on function public.hr_payroll_export_list(uuid, uuid, integer) to authenticated;
