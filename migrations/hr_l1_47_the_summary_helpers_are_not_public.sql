-- hr_l1_47_the_summary_helpers_are_not_public.sql
--
-- 🚨 THE SAME DEFAULT GRANT hr_l1_46 FOUND, ON THREE MORE FUNCTIONS I CREATED.
-- A SECURITY DEFINER function is created with PostgreSQL's default PUBLIC execute grant.
-- hr_l1_46 revoked it from the repair door. These are the same shape and the same author:
-- SECURITY DEFINER, no ACL, therefore PUBLIC EXECUTE.
--
-- What makes them worth locking rather than shrugging at: each takes a ROW ID and returns
-- that row's contents — a home address, a salary, a leave request — and each performs NO
-- permission check of its own, by design, because `_wf_display` does the entitlement
-- gating once for all of them. That division of labour is correct while only that caller
-- can reach them, and it is a hole the moment anything else can.
--
-- Today `hr` is not in `pgrst.db_schemas`, so PostgREST cannot call them and this was not
-- exploitable. That is a DEPLOYMENT FACT, not a property of the function — exactly the
-- kind of thing that changes without anyone re-reading these grants.
--
-- The whole chain (public.hr_wf_inbox → hr.wf_inbox → hr._wf_display → these) runs inside
-- SECURITY DEFINER functions owned by the same role, so inner calls execute as the owner
-- and revoking the world costs the product nothing. Verified after applying, through the
-- PUBLIC door as an authenticated caller: the pay change still renders
-- "Base pay … 96,000.00 USD per year" and the leave request still renders
-- "Monday 7 Dec 2026 · 8 hours · ZZZ L5 PROOF — PTO bank".
--
-- Applied live 2026-08-28 and ledgered.

revoke all on function hr._wf_change_digest(text, uuid, jsonb) from public, anon, authenticated;
revoke all on function hr._wf_pay_change_digest(jsonb, uuid) from public, anon, authenticated;
revoke all on function hr._wf_row_summary(text, text, uuid) from public, anon, authenticated;
revoke all on function hr._wf_value_text(jsonb) from public, anon, authenticated;
revoke all on function hr._money_text(numeric, text) from public, anon, authenticated;

do $verify$
declare v_bad text;
begin
  select string_agg(p.proname, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr'
     and p.proname in ('_wf_change_digest','_wf_pay_change_digest','_wf_row_summary',
                       '_wf_value_text','_money_text')
     and (p.proacl is null
          or array_to_string(p.proacl, ' ') ~ '(^|[^a-z])(=X|anon=|authenticated=)');
  if v_bad is not null then
    raise exception 'hr_l1_47: still world-executable: %', v_bad;
  end if;
end $verify$;
