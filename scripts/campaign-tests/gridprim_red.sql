-- LANE GRID-PRIMITIVES — THE RED TWIN of gridprim_g1_green.sql, gridprim_g2_green.sql,
-- gridprim_g3_green.sql and gridprim_g4_green.sql.
--
-- A guard you cannot demonstrate failing is not a guard. This file plants, one arm at a time and
-- inside one transaction that ends in ROLLBACK, the world BEFORE each gap was closed, and RAISES
-- if the green suites' own predicate would still read clean in it. Nothing here survives.
--
--   ARM A (G1) custom.agg_operations back to count/sum/avg/min/max → the summary bar's median
--              is refused ("is not a measure").
--   ARM B (G2) custom.action_run replaced by the older grid's shape — each record written on its
--              own, a refusal swallowed → Juniper's deposit moves although Moose's refused.
--   ARM C (G3) custom.formula_value back to Rule-only evaluation → a typed formula reads empty.
--   ARM D (G4) the io_outbox → activity trigger disabled → add / change / archive / restore on a
--              record reach no webhook: zero events.
--
-- USE CASE: Cedar Ridge Veterinary Clinic's Appointments day sheet (_gridprim_clinic.sql).
-- RUN IT on the clone or the branch, after the four gridprim_* migrations:
--   "$PSQL" "<clone or branch DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/gridprim_red.sql

\set ON_ERROR_STOP on
\timing off

\set suite 'gridprim_red.sql'
\set requires 'function:custom.action_run|function:custom.formula_eval|function:custom.table_webhook_declare|function:custom.table_decorate'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

\i scripts/campaign-tests/_gridprim_clinic.sql

-- ── ARM A ────────────────────────────────────────────────────────────────────────────────
savepoint arm_a;
create or replace function custom.agg_operations() returns text[] language sql immutable
  set search_path to 'pg_catalog' as $$ select array['count', 'sum', 'avg', 'min', 'max']::text[] $$;
do $a$
declare v_org uuid; v_appts uuid; v_caught text;
begin
  select v into v_org from gp where k = 'org'; select v into v_appts from gp where k = 'appts';
  perform set_config('request.jwt.claims', '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);
  begin
    perform * from custom.record_aggregate(v_org, v_appts, '[]'::jsonb, '[{"op":"median","key":"visit_fee"}]'::jsonb);
    raise exception 'ARM A: with the old measure list a median still answered — the G1 green part 7 would not catch its loss';
  exception when invalid_parameter_value then
    get stacked diagnostics v_caught = message_text;
  end;
  raise notice 'ARM A RED as it must be — %', v_caught;
end $a$;
rollback to savepoint arm_a;

-- ── ARM B ────────────────────────────────────────────────────────────────────────────────
savepoint arm_b;
create or replace function custom.action_run(p_organization_id uuid, p_action_id uuid, p_record_ids uuid[])
returns jsonb language plpgsql security definer set search_path to 'pg_catalog' as $$
declare v_id uuid; v_fee jsonb;
begin
  -- The older grid's shape: one write per record, a refusal skipped, the rest kept.
  foreach v_id in array p_record_ids loop
    begin
      select custom.record_values(p_organization_id, v_id) -> 'visit_fee' into v_fee;
      perform custom.record_update(p_organization_id, v_id, jsonb_build_object('deposit', v_fee));
    exception when others then null;
    end;
  end loop;
  return '{}'::jsonb;
end $$;
do $b$
declare v_org uuid; v_appts uuid; v_list jsonb; v_pay uuid; v_dep numeric;
begin
  select v into v_org from gp where k = 'org'; select v into v_appts from gp where k = 'appts';
  perform set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  perform custom.field_update(v_org, (select v from gp where k = 'f_deposit'),
    jsonb_build_object('rules', jsonb_build_array(jsonb_build_object('kind', 'max', 'value', 300))));
  v_list := custom.action_declare(v_org, v_appts, jsonb_build_array(jsonb_build_object('name', 'Take full payment',
    'steps', jsonb_build_array(jsonb_build_object('field', (select v from gp where k = 'f_deposit'), 'set', 'compute', 'formula_text', '{Visit fee}')))));
  v_pay := (v_list -> 0 ->> 'id')::uuid;
  perform custom.action_run(v_org, v_pay, array[(select v from gp where k = 'r2'), (select v from gp where k = 'r3')]);
  select (custom.record_values(v_org, (select v from gp where k = 'r2')) ->> 'deposit')::numeric into v_dep;
  if v_dep is not distinct from 50 then
    raise exception 'ARM B: the per-record shape left Juniper''s deposit at 50 — the G2 green part 4b would not catch a half-applied selection';
  end if;
  raise notice 'ARM B RED as it must be — the older shape moved Juniper''s deposit to % while Moose''s refused: a half-applied selection.', v_dep;
end $b$;
rollback to savepoint arm_b;

-- ── ARM C ────────────────────────────────────────────────────────────────────────────────
savepoint arm_c;
create or replace function custom.formula_value(p_organization_id uuid, p_record_id uuid, p_field_data jsonb, p_values jsonb default null)
returns jsonb language plpgsql stable set search_path to 'pg_catalog' as $$
begin
  return custom.rule_eval(p_organization_id, p_field_data -> 'config' -> 'expr',
                          coalesce(p_values, custom.record_values(p_organization_id, p_record_id)),
                          custom.rule_context(p_organization_id, p_record_id));
end $$;
do $c$
declare v_org uuid; v_appts uuid; v_bal text;
begin
  select v into v_org from gp where k = 'org'; select v into v_appts from gp where k = 'appts';
  perform set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  perform custom.field_declare(v_org, v_appts, jsonb_build_object('key', 'balance_due', 'label', 'Balance due',
            'type', 'formula', 'formula_text', '{Visit fee} - {Deposit taken}'));
  v_bal := custom.read_record(v_org, (select v from gp where k = 'r1'), true) ->> 'balance_due';
  if v_bal is not distinct from '135' then
    raise exception 'ARM C: Rule-only evaluation still worked out Biscuit''s balance — the G3 green part 3a would not catch the loss';
  end if;
  raise notice 'ARM C RED as it must be — with Rule-only evaluation Biscuit''s balance reads %.', coalesce(v_bal, 'empty');
end $c$;
rollback to savepoint arm_c;

-- ── ARM D ────────────────────────────────────────────────────────────────────────────────
savepoint arm_d;
alter table custom.io_outbox disable trigger zz_gridprim_record_events_s_i;
do $d$
declare v_org uuid; v_appts uuid; v_rec uuid; v_n integer;
begin
  select v into v_org from gp where k = 'org'; select v into v_appts from gp where k = 'appts';
  perform set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  perform custom.table_webhook_declare(v_org, v_appts, 'https://reminders.cedarridgevet.com/hooks/matrx-appointments', null, null);
  v_rec := custom.record_write(v_org, v_appts, jsonb_build_object('patient', 'Clementine (Osei)', 'species', 'Cat', 'visit_status', 'Scheduled'));
  perform custom.record_update(v_org, v_rec, jsonb_build_object('visit_on', '2026-09-25'));
  perform custom.record_delete(v_org, v_rec);
  perform custom.record_restore(v_org, v_rec);
  select count(*) into v_n from platform.activity_log a where a.organization_id = v_org and a.entity_id = v_rec;
  if v_n <> 0 then
    raise exception 'ARM D: with the trigger off, % events were still written — the G4 green part 2 would not catch its loss', v_n;
  end if;
  raise notice 'ARM D RED as it must be — without the delivery door, add / change / archive / restore wrote 0 events: nothing reaches a webhook.';
end $d$;
rollback to savepoint arm_d;

rollback;
