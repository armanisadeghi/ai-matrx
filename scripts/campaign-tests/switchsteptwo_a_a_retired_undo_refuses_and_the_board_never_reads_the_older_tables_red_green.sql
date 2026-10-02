-- LANE SWITCH-STEP-TWO (2026-10-01) — RED/GREEN for switchsteptwo_a_the_undo_is_retired_by_name_before_the_older_tables_leave.sql.
-- CLONE ONLY, one transaction, ROLLED BACK. Needs the clone PRESSED (final switch state 'new').
--   psql -f scripts/campaign-tests/switchsteptwo_a_a_retired_undo_refuses_and_the_board_never_reads_the_older_tables_red_green.sql
-- RED  on the bodies before file a: there is no "Retire the undo" (P1), the undo would still run (P2), and the board
--      still measures the older tables — with that measure made to fail as it will after the move, it dies 42P01 (P3).
-- GREEN with file a: retiring is recorded once (P1), the undo refuses by name with a people sentence (P2), the board
--      answers "retired" without touching workbench.udt_* (P3), a second retire refuses (P4), the press refuses (P5).
\set ON_ERROR_STOP on
\pset tuples_only on
begin;
set local statement_timeout = '5min';
do $guard$ begin
  if (select count(*) from cron.job where active) <> 0 or exists (select 1 from pg_extension where extname = 'pg_net') then
    raise exception 'refused: not the quarantined clone';
  end if;
end $guard$;
do $t$
declare
  c_claims constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated","session_id":"switch-step-two-test"}';
  c_page   constant text := '{"origin":"https://manage.aimatrx.com","x-matrx-admin-lane":"1"}';
  v jsonb; v_fail text[] := '{}';
begin
  if (platform.final_switch_state() ->> 'state') <> 'new' then
    raise exception 'PRECONDITION: the clone is not pressed (state %); press it first', platform.final_switch_state() ->> 'state';
  end if;
  perform set_config('request.jwt.claims', c_claims, true);
  perform set_config('request.headers', c_page, true);
  -- P1: the step exists and records once.
  if to_regprocedure('platform.final_switch_retire_undo(text)') is null then
    v_fail := v_fail || 'P1 there is no platform.final_switch_retire_undo(text): the undo cannot be retired by name'::text;
  else
    execute 'select platform.final_switch_retire_undo($1)' into v using 'switch-step-two test';
    if not coalesce((v ->> 'ok')::boolean, false) then v_fail := v_fail || ('P1 retire refused: ' || coalesce(v ->> 'says', v::text)); end if;
  end if;
  -- P2: the undo refuses with a people sentence and changes nothing.
  v := platform.final_switch_undo('switch-step-two test', true);
  if coalesce(v ->> 'reason', '') <> 'undo_retired' then
    v_fail := v_fail || ('P2 the undo did not refuse as retired: ' || coalesce(v ->> 'reason', '') || ' — ' || left(coalesce(v ->> 'says', ''), 160));
  elsif (v ->> 'says') !~ '^The undo was retired on' then
    v_fail := v_fail || ('P2 the refusal is not a people sentence: ' || (v ->> 'says'));
  end if;
  if (platform.final_switch_state() ->> 'state') <> 'new' then v_fail := v_fail || 'P2 the state changed'::text; end if;
  -- P3: the board never reads the older tables once the undo is retired.
  -- The full board is the one body that measures the older tables; inside this rolled-back transaction it is made to
  -- refuse the way it would once they are in the deprecated schema (42P01), so a board that still calls it goes RED.
  execute $b$create or replace function platform._final_switch_readiness() returns jsonb language plpgsql set search_path to 'pg_catalog' as $f$
    begin raise exception 'relation "workbench.udt_datasets" does not exist (test stand-in)' using errcode = '42P01'; end $f$$b$;
  begin
    v := platform.final_switch_readiness();
    if coalesce(v ->> 'undo_retired', '') = '' or (v ->> 'may_undo')::boolean or (v ->> 'state') <> 'new' then
      v_fail := v_fail || ('P3 the board does not say the undo is retired: ' || left(v::text, 200));
    end if;
  exception when undefined_table then
    v_fail := v_fail || ('P3 the board still reads the older tables: ' || sqlerrm);
  end;
  -- P4: retiring twice refuses.
  if to_regprocedure('platform.final_switch_retire_undo(text)') is not null then
    execute 'select platform.final_switch_retire_undo($1)' into v using 'again';
    if coalesce(v ->> 'reason', '') <> 'already_retired' then v_fail := v_fail || ('P4 a second retire was not refused: ' || v::text); end if;
  end if;
  -- P5: the press stays refused.
  begin
    v := platform.final_switch_press('switch-step-two test', null);
    if coalesce((v ->> 'ok')::boolean, true) then v_fail := v_fail || ('P5 the press did not refuse: ' || v::text); end if;
  exception when undefined_table then
    v_fail := v_fail || ('P5 the press measured the older tables instead of refusing: ' || sqlerrm);
  end;
  if cardinality(v_fail) > 0 then
    raise notice 'RED (%):%', cardinality(v_fail), E'\n  ' || array_to_string(v_fail, E'\n  ');
  else
    raise notice 'GREEN: retired once, the undo refuses by name, the board answers without the older tables, a second retire refuses, the press refuses';
  end if;
end $t$;
rollback;
