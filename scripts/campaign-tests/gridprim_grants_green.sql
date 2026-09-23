-- LANE GRID-PRIMITIVES — a signed-in person's summary picker may ask which measures and periods
-- the store computes. Marisol Vega (test@test.com), front desk at Cedar Ridge Veterinary Clinic,
-- opens the summary menu under the Visit fee column: it lists what custom.record_aggregate
-- actually computes, never a list typed into the screen.
-- RED before gridprim_a_signed_in_person_may_ask_which_measures_there_are.sql ("permission denied
-- for function agg_operations"), GREEN after. One transaction, ROLLBACK.

\set ON_ERROR_STOP on
\timing off
\set suite 'gridprim_grants_green.sql'
\set requires 'function:custom.agg_operations|function:custom.agg_buckets'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
do $t$
declare v_ops text[]; v_buckets text[];
begin
  perform set_config('request.jwt.claims', '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);
  perform set_config('role', 'authenticated', true);
  if current_user is distinct from 'authenticated' then raise exception '0: not seated'; end if;
  v_ops := custom.agg_operations();
  v_buckets := custom.agg_buckets();
  if not ('sum' = any (v_ops)) or not ('month' = any (v_buckets)) then
    raise exception '1: the picker read % / %', v_ops, v_buckets;
  end if;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
  begin
    perform custom.agg_operations();
    raise exception '2: a signed-out visitor was handed the measure list';
  exception when insufficient_privilege then null;
  end;
  raise notice 'GRIDPRIM GRANTS GREEN — Marisol''s picker reads % and %; a signed-out visitor is refused.', v_ops, v_buckets;
end $t$;
rollback;
