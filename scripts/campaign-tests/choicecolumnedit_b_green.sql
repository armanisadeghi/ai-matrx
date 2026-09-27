-- LANE CHOICE-COLUMN-EDIT, FILE b — THE GREEN SUITE. A choice column made with no choices yet stays
-- a choice column with an empty list, in every door that makes one, and its first choice arrives
-- from a cell (options_add / custom.record_update_adding_choices) or its settings.
--
-- THE REAL USE CASE: admin@admin.com's Workspace on the clone, "Table 1 · 2nd". The owner adds a
-- column "Support Tier" as text and makes it a choice column before she has decided the tiers
-- (the Sheet's Add column does exactly this: the column first, then its format); she declares
-- "Plan Level" as a choice column with no choices. Then she types "Gold" into a Support Tier cell
-- and answers Add. Everything is rolled back. (custom.table_declare and custom.entity_field_declare
-- carry the same one-statement change as custom.field_declare; not driven here.)
--
-- RUN IT (clone; always rolled back):
--   psql "<clone DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/choicecolumnedit_b_green.sql
-- ITS RED: before file b, step 1 fails with "the list field Support Tier has to say which table its
-- choices come from" (and field_declare / table_declare with "A list of choices needs its choices").

\set ON_ERROR_STOP on
\timing off

\set suite 'choicecolumnedit_b_green.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '20s';
set local statement_timeout = '120s';

create temp table _cb on commit drop as
  select '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f'::uuid as ws,
         'dd073d8c-f6cd-419e-8a81-7ce17cf50b81'::uuid as tbl,
         null::uuid as tier, null::uuid as plan, null::uuid as onboarding;
grant select, update on _cb to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated","session_id":"5d0c3f5e-2f7b-4b36-9d0c-choicecolb001"}', true);

do $t$
declare f _cb; v_n int;
begin
  select * into f from _cb;
  -- 1. text → choice with no choices yet (the Sheet's Add column + its format)
  f.tier := custom.field_declare(f.ws, f.tbl, '{"label":"Support Tier","type":"text"}'::jsonb);
  perform custom.field_update(f.ws, f.tier, '{"type":"select","allow_other":false}'::jsonb);
  select count(*) into v_n from custom.field_options(f.ws, f.tier);
  if v_n <> 0 then raise exception '1: a choice column made with no choices has % choices', v_n; end if;

  -- 2. declared as a choice column with no choices
  f.plan := custom.field_declare(f.ws, f.tbl, '{"label":"Plan Level","type":"select"}'::jsonb);

  update _cb set tier = f.tier, plan = f.plan, onboarding = f.onboarding;
end
$t$;

reset role;
do $t$
declare f _cb; v_row uuid; v_ver int;
begin
  select * into f from _cb;
  if (select data ->> 'type' from custom.record where id = f.tier) <> 'list'
     or nullif((select data -> 'config' ->> 'options_table_id' from custom.record where id = f.tier), '') is null then
    raise exception '1b: Support Tier is not a choice column with its own (empty) Table of choices: %',
      (select data from custom.record where id = f.tier);
  end if;
  if (select data ->> 'type' from custom.record where id = f.plan) <> 'list'
     or nullif((select data -> 'config' ->> 'options_table_id' from custom.record where id = f.plan), '') is null then
    raise exception '2: Plan Level, declared with no choices, is not a choice column with an empty list';
  end if;
  select r.id into v_row from custom.record r where r.table_id = f.tbl and r.data_class = 'record' and r.deleted_at is null
   order by r.created_at, r.id limit 1;
  update _cb set onboarding = v_row;
end
$t$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated","session_id":"5d0c3f5e-2f7b-4b36-9d0c-choicecolb002"}', true);
do $t$
declare f _cb; v_key text;
begin
  select * into f from _cb;
  -- 4. the first choice arrives from a cell: "Gold", answered Add, in one save
  perform custom.record_update_adding_choices(f.ws, f.onboarding,
            jsonb_build_object('support_tier', 'Gold'),
            jsonb_build_object('support_tier', jsonb_build_array('Gold')));
end
$t$;

reset role;
do $t$
declare f _cb;
begin
  select * into f from _cb;
  if (select r.data ->> 'support_tier' from custom.record r where r.id = f.onboarding) is distinct from 'gold'
     or (select count(*) from custom.record o
          where o.table_id = (select (data -> 'config' ->> 'options_table_id')::uuid from custom.record where id = f.tier)
            and o.deleted_at is null and o.data ->> 'title' = 'Gold') <> 1 then
    raise exception '4: the first choice typed into an empty choice column was not added and taken (cell %)',
      (select r.data -> 'support_tier' from custom.record r where r.id = f.onboarding);
  end if;
  raise notice 'choicecolumnedit_b_green.sql: GREEN — a choice column with no choices yet stays one (field_update, field_declare) and takes its first choice from a cell in one save.';
end
$t$;

rollback;
