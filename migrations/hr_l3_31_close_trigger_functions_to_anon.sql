-- HR domain L3 — migration 12 (register item HRB-015, lane L3 time-and-attendance, builder SQL-2).
--
-- The two trigger functions this lane added — `hr._timecard_reject_reopen` (the §14 D7 rejection
-- rule) and `hr._ot_preapproval_decided` (the OT denial handler) — shipped with PUBLIC's default
-- EXECUTE, so `anon` held it. Found by a live grant read at the end of the lane, not by inspection
-- of the migrations that created them.
--
-- Nothing was actually exposed: both return `trigger`, PostgREST does not surface a trigger
-- function as an RPC, and calling one outside a trigger context raises immediately. But "grant
-- `anon` nothing" is the rule, and a rule with an unwritten exception is how the next one gets
-- missed. The `do $$ ... $$` grant loops in `hr_l3_26` and `hr_l3_27` enumerated the callable
-- functions and simply did not list the triggers.
--
-- Applied live as `hr_l3_31_close_trigger_functions_to_anon`. Idempotent.
-- ===================================================================================

revoke all on function hr._timecard_reject_reopen() from public;
revoke all on function hr._timecard_reject_reopen() from anon;
revoke all on function hr._ot_preapproval_decided() from public;
revoke all on function hr._ot_preapproval_decided() from anon;

do $$
begin
  if has_function_privilege('anon', 'hr._timecard_reject_reopen()', 'execute')
     or has_function_privilege('anon', 'hr._ot_preapproval_decided()', 'execute') then
    raise exception 'hr_l3_31: anon still holds EXECUTE on an L3 trigger function';
  end if;
end $$;
