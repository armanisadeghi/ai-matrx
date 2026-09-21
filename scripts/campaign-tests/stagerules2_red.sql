-- LANE STAGE-RULES-2 — THE RED TWIN. It executes the REAL BYTES of this lane's three
-- inverse migrations, then asserts that each clause the green suite proves goes RED
-- against the store as it was before this lane — and rolls the whole thing back.
--
-- A guard nobody has seen fail is not a guard. These are the failures.
--
-- RUN IT:  ./binlocal/p.sh -f scripts/campaign-tests/stagerules2_red.sql

\set ON_ERROR_STOP on
\timing off

begin;

-- The real bytes, newest first. Nothing is paraphrased here: if an inverse is wrong, this
-- file is where that shows.
\i migrations/inverse/stagerules2_a_half_written_rule_is_refused_down.sql
\i migrations/inverse/stagerules2_the_cards_it_names_have_names_down.sql
\i migrations/inverse/stagerules2_a_gate_remembers_what_it_was_asked_down.sql
\i migrations/inverse/stagerules2_a_test_that_is_null_is_not_a_test_down.sql

do $t$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org     constant uuid := '1a7fefc6-77e1-4c48-826f-003b1a2e17fd';
  v_quotes  constant uuid := '0e108f31-5078-48ec-9a15-b492baa414ba';
  v_f_room  constant uuid := '7c973e94-e0d2-4dc7-b2d9-dda9a4c0aa7d';
  v_f_co    constant uuid := '91bce902-bfa9-45d4-9ec0-c615dfa98e60';
  v_f_amt   constant uuid := 'dba92ed7-a224-4897-899a-bd9274ae66fa';
  v_gate    jsonb;
  v_read    jsonb;
  v_rule    jsonb;
  v_red     integer := 0;
  v_boss    text := current_user;
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'this file runs on the MAIN database only';
  end if;
  perform set_config('app.actor_system', 'campaign-test/stagerules2_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'this suite did not take the seat — current_user is %', current_user;
  end if;

  v_gate := jsonb_build_object(
    'name',    'A second quote before a big one is approved',
    'message', 'Nothing over $5,000 moves to Approved without a second quote from a different contractor.',
    'when',    jsonb_build_object('op','gt','args', jsonb_build_array(
                 jsonb_build_object('field', v_f_amt), jsonb_build_object('const', 5000))),
    'demands', jsonb_build_object('op','gte','args', jsonb_build_array(
                 jsonb_build_object('op','sibling_count',
                   'same', jsonb_build_array(v_f_room), 'differs', jsonb_build_array(v_f_co)),
                 jsonb_build_object('const', 1))),
    'on_fail', 'refuse');

  -- RED 1 — the gate does not read back. The editor would open it blank.
  perform custom.pipeline_declare(v_org, v_quotes, jsonb_build_object(
    'stage_field', jsonb_build_object('key','quote_stage'),
    'gates', jsonb_build_object('Approved', jsonb_build_array(v_gate))));
  v_read := custom.pipeline_read(v_org, v_quotes);
  select r into v_rule from jsonb_array_elements(v_read -> 'rules') r
   where r ->> 'kind' like 'gate:%' and r ->> 'stage' = 'approved' limit 1;
  if v_rule -> 'demands' is not null then
    raise exception 'RED 1 DID NOT GO RED: the old read door handed back a demand';
  end if;
  v_red := v_red + 1;
  raise notice 'RED 1 — the old read door answers a gate with no WHEN and no DEMANDS. RED';

  -- RED 2 — and no on_fail, so an approval gate is indistinguishable from a refusal.
  if v_rule -> 'on_fail' is not null then
    raise exception 'RED 2 DID NOT GO RED: the old read door handed back on_fail';
  end if;
  v_red := v_red + 1;
  raise notice 'RED 2 — the old read door cannot tell an approval gate from a refusal. RED';

  -- RED 3 — there is no preview at all.
  begin
    perform custom.pipeline_gate_preview(v_org, v_quotes, 'Approved', v_gate);
    raise exception 'RED 3 DID NOT GO RED: the preview door survived its own inverse';
  exception when undefined_function then
    v_red := v_red + 1;
    raise notice 'RED 3 — there is no preview door to ask. RED';
  end;

  -- RED 4 — the half-written gate walks in and turns the working rule off.
  perform custom.pipeline_declare(v_org, v_quotes, jsonb_build_object(
    'stage_field', jsonb_build_object('key','quote_stage'),
    'gates', jsonb_build_object('Approved', jsonb_build_array('{"message":"half written"}'::jsonb))));
  v_read := custom.pipeline_read(v_org, v_quotes);
  select r into v_rule from jsonb_array_elements(v_read -> 'rules') r
   where r ->> 'kind' like 'gate:%' and r ->> 'stage' = 'approved' limit 1;
  if v_rule ->> 'message' <> 'half written' then
    raise exception 'RED 4 DID NOT GO RED: the old door refused the half-written gate';
  end if;
  v_red := v_red + 1;
  raise notice 'RED 4 — a gate with no demand replaced the house rule and the call said it had succeeded. RED';

  -- RED 5 — and the node the gates are built on evaluates a `previous` that points at
  -- nothing instead of refusing it, so a gate whose demand reads a field it never named
  -- stops nobody. The inverse took the preview door with it, so this one asks the node
  -- directly — outside the seat, and asserting nothing about a person's reach.
  perform set_config('role', v_boss, true);
  begin
    -- It ANSWERS. The answer is the jsonb word `null`, which `custom.rule_truth` reads as
    -- neither true nor false, so the gate built on it stops nobody and says nothing.
    perform custom.rule_eval(v_org, '{"op":"previous"}'::jsonb, '{}'::jsonb, '{}'::jsonb);
  exception when others then
    raise exception 'RED 5 DID NOT GO RED: the old body refused a bare previous node';
  end;
  perform set_config('role', 'authenticated', true);
  v_red := v_red + 1;
  raise notice 'RED 5 — a previous node pointing at nothing evaluates to null, and a gate built on it stops nobody. RED';

  if v_red <> 5 then
    raise exception 'expected 5 red blocks and got %', v_red;
  end if;
  raise notice '% BLOCKS RED', v_red;
end;
$t$;

rollback;

-- And outside the transaction: the store is the one this lane left, not the one the
-- inverse built. A red twin that rolled back badly would be a red twin that broke the
-- board it was testing.
do $v$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'custom' and p.proname = 'pipeline_gate_preview') then
    raise exception 'ROLLBACK FAILED — the preview door is gone from the live store';
  end if;
  if (custom.pipeline_gate_preview('1a7fefc6-77e1-4c48-826f-003b1a2e17fd'::uuid,
        '0e108f31-5078-48ec-9a15-b492baa414ba'::uuid, 'Approved',
        '{"message":"x","demands":{"op":"gte","args":[{"op":"sibling_count","same":["7c973e94-e0d2-4dc7-b2d9-dda9a4c0aa7d"],"differs":["91bce902-bfa9-45d4-9ec0-c615dfa98e60"]},{"const":1}]}}'::jsonb)
      ->> 'considered')::int <= 0 then
    raise exception 'ROLLBACK VERIFY FAILED — the preview answers nothing';
  end if;
  raise notice 'ROLLBACK VERIFIED — the preview door is there and the board still answers it';
end;
$v$;
