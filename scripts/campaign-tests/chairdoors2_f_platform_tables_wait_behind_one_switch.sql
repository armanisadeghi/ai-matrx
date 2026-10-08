-- LANE CHAIR-DOORS-2 (f) — A TABLE THE APP KEEPS FOR AN AGENT'S OUTPUT IS IN NO DEFAULT LIST.
-- Guard for migrations/campaign/chairdoors2_f_a_table_kept_for_agent_output_waits_behind_show_app_tables.sql
-- (asked by v6 lane 4 KINDS-GLUE, need N-C8).
--
-- One fixture Table in Cedar Ridge Physical Therapy, placed as the app keeps it for an agent's output
-- (`kept_by_the_app: true`, `kept_for: "agent_output"`, SC-1 placement), and the clinic's own Patient
-- Visit Tracker as the control. From test@test.com's seat (`set local role authenticated` + her claims),
-- every list door is asked twice — as a default list asks, and with p_include_platform_tables => true:
--   P  custom.table_kept_out_of_lists — the one predicate: agent_output yes; choices, context, null no.
--   H  custom.data_home_tables — /data's rows, one organization and all of them.
--   D  custom.data_home — ⌘K and the data home's one call, unsearched and searched.
--   L  custom.table_list_everywhere — the resource picker, quick sheet, scheduling, webhooks.
--   K  no regression: every other kept table (lists behind columns, scopes, forms …) is still listed by
--      default, exactly as many as with the switch on.
-- THE VERDICT IS THE EXIT CODE: RED raises (psql exits 3 under ON_ERROR_STOP), GREEN exits 0.
-- One transaction, rolled back; nothing is left behind.
--
-- RUN IT (dev clone only), session pooler:
--   cd matrx-frontend && psql "${CLONE_DATABASE_URL/:6543/:5432}" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/chairdoors2_f_platform_tables_wait_behind_one_switch.sql
\set ON_ERROR_STOP on
\set suite 'chairdoors2_f_platform_tables_wait_behind_one_switch.sql'
\set expect 'clone'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
\set QUIET on
begin;
set local statement_timeout = '180s';
set local lock_timeout = '10s';
select set_config('app.actor_system', 'chairdoors2_f_suite', true) \g /dev/null

create temp table res (check_name text, ok boolean, detail text) on commit drop;
grant all on res to authenticated, service_role;

select '4060701e-706a-4c76-b3ca-0bbc69fa5a14'::uuid as me,             -- test@test.com
       '0a54df90-eab8-4d07-ab29-81a45fb41e04'::uuid as cedar,          -- Cedar Ridge Physical Therapy (member)
       '031d3690-4a02-4cee-a575-454ffd96c992'::uuid as control,        -- its Patient Visit Tracker
       '87a6e699-3622-4869-8843-d0867456c0dd'::uuid as admin            -- admin@admin.com, who made the tracker
\gset
select data ->> 'parent_id' as home from custom.record where id = :'control' \gset

-- THE FIXTURE, made as the owner: the outputs table an agent's flashcards would land in.
select custom.table_declare(:'cedar', jsonb_build_object(
  'name', 'Post-op knee exercise flashcards', 'slug', 'agent_output_flashcard_cdf',
  'label_singular', 'Flashcard', 'label_plural', 'Flashcards', 'type', 'entity', 'display', 'list',
  'ordered', false, 'weight', 'light', 'retention_days', 30, 'default_sort', '[]'::jsonb, 'row_order', 'sorted',
  'agent_writable', true, 'parent_id', :'home',
  'fields', jsonb_build_array(jsonb_build_object('name', 'title', 'kind', 'text')),
  'title_field', 'title')) as outputs \gset
update custom.record
   set data = data || jsonb_build_object('kept_by_the_app', true, 'kept_for', 'agent_output', 'kind', 'flashcard'),
       visibility = 'internal', created_by = :'admin'
 where organization_id = :'cedar' and id = :'outputs';
select set_config('t.' || k, v, true) from (values ('me', :'me'), ('cedar', :'cedar'), ('control', :'control'),
  ('outputs', :'outputs')) x(k, v) \g /dev/null

-- ── the member's seat ────────────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'me', 'role', 'authenticated')::text, true) \g /dev/null

-- P — the one predicate
do $$ begin
  insert into res values ('P agent_output is kept out of lists', custom.table_kept_out_of_lists('agent_output'), 'agent_output');
  insert into res values ('P choices, context, app and none are not',
    not (custom.table_kept_out_of_lists('choices') or custom.table_kept_out_of_lists('context')
         or custom.table_kept_out_of_lists('app') or coalesce(custom.table_kept_out_of_lists(null), false)), 'choices/context/app/null');
exception when others then insert into res values ('P predicate answers', false, sqlerrm);
end $$;

-- H — custom.data_home_tables
do $$
declare c uuid := current_setting('t.cedar')::uuid; o uuid := current_setting('t.outputs')::uuid; k uuid := current_setting('t.control')::uuid;
begin
  insert into res values ('H1 one org, default: outputs hidden',
    not exists (select 1 from custom.data_home_tables(c) t where t.table_id = o), 'data_home_tables(cedar)');
  insert into res values ('H2 one org, default: own table listed',
    exists (select 1 from custom.data_home_tables(c) t where t.table_id = k), 'data_home_tables(cedar)');
  insert into res values ('H3 all orgs, default: outputs hidden',
    not exists (select 1 from custom.data_home_tables() t where t.table_id = o), 'data_home_tables()');
  begin
    insert into res values ('H4 one org, with the switch: outputs shown',
      exists (select 1 from custom.data_home_tables(c, true) t where t.table_id = o and t.kept_by_the_app), 'data_home_tables(cedar, true)');
    insert into res values ('H5 all orgs, with the switch: outputs shown',
      exists (select 1 from custom.data_home_tables(null, p_include_platform_tables => true) t where t.table_id = o), 'data_home_tables(null, true)');
    -- the switch is for its one call: the next default ask in the same transaction is default again
    insert into res values ('H6 the switch does not linger',
      not exists (select 1 from custom.data_home_tables(c) t where t.table_id = o)
      and current_setting('custom.include_platform_tables', true) is distinct from 'on', 'data_home_tables(cedar) after (cedar, true)');
  exception when others then insert into res values ('H4/H5 the switch exists', false, sqlerrm);
  end;
exception when others then insert into res values ('H data_home_tables answers', false, sqlerrm);
end $$;

-- D — custom.data_home (⌘K and /data's one call)
do $$
declare c uuid := current_setting('t.cedar')::uuid; o text := current_setting('t.outputs'); v jsonb;
begin
  v := custom.data_home(c);
  insert into res values ('D1 unsearched, default: outputs hidden',
    not exists (select 1 from jsonb_array_elements(v -> 'tables') e where e ->> 'table_id' = o), 'data_home(cedar)');
  v := custom.data_home(null, 'knee exercise flashcards');
  insert into res values ('D2 searched, default: outputs hidden',
    not exists (select 1 from jsonb_array_elements(v -> 'tables') e where e ->> 'table_id' = o), 'data_home(null, search)');
  begin
    v := custom.data_home(c, null, true);
    insert into res values ('D3 unsearched, with the switch: outputs shown',
      exists (select 1 from jsonb_array_elements(v -> 'tables') e where e ->> 'table_id' = o), 'data_home(cedar, null, true)');
    v := custom.data_home(null, 'knee exercise flashcards', true);
    insert into res values ('D4 searched, with the switch: outputs shown',
      exists (select 1 from jsonb_array_elements(v -> 'tables') e where e ->> 'table_id' = o), 'data_home(null, search, true)');
  exception when others then insert into res values ('D3/D4 the switch exists', false, sqlerrm);
  end;
exception when others then insert into res values ('D data_home answers', false, sqlerrm);
end $$;

-- L — custom.table_list_everywhere
do $$
declare c uuid := current_setting('t.cedar')::uuid; o text := current_setting('t.outputs'); k text := current_setting('t.control'); v jsonb;
begin
  v := custom.table_list_everywhere(c);
  insert into res values ('L1 one org, default: outputs hidden',
    not exists (select 1 from jsonb_array_elements(v -> 'tables') e where e ->> 'id' = o), 'table_list_everywhere(cedar)');
  insert into res values ('L2 one org, default: own table listed',
    exists (select 1 from jsonb_array_elements(v -> 'tables') e where e ->> 'id' = k), 'table_list_everywhere(cedar)');
  v := custom.table_list_everywhere();
  insert into res values ('L3 all orgs, default: outputs hidden',
    not exists (select 1 from jsonb_array_elements(v -> 'tables') e where e ->> 'id' = o), 'table_list_everywhere()');
  begin
    v := custom.table_list_everywhere(c, true);
    insert into res values ('L4 one org, with the switch: outputs shown',
      exists (select 1 from jsonb_array_elements(v -> 'tables') e where e ->> 'id' = o and e ->> 'kept_for' = 'agent_output'), 'table_list_everywhere(cedar, true)');
    v := custom.table_list_everywhere(null, true);
    insert into res values ('L5 all orgs, with the switch: outputs shown',
      exists (select 1 from jsonb_array_elements(v -> 'tables') e where e ->> 'id' = o), 'table_list_everywhere(null, true)');
  exception when others then insert into res values ('L4/L5 the switch exists', false, sqlerrm);
  end;
exception when others then insert into res values ('L table_list_everywhere answers', false, sqlerrm);
end $$;

-- K — nothing else the app keeps left the default lists
do $$
declare c uuid := current_setting('t.cedar')::uuid; a int; b int; x int; y int;
begin
  select count(*) into a from custom.data_home_tables(c) t where t.kept_by_the_app;
  begin
    select count(*) into b from custom.data_home_tables(c, true) t where t.kept_by_the_app and t.kind <> 'agent_output';
    select count(*) into x from jsonb_array_elements(custom.table_list_everywhere(c) -> 'tables') e where (e ->> 'kept_by_the_app')::boolean;
    select count(*) into y from jsonb_array_elements(custom.table_list_everywhere(c, true) -> 'tables') e
     where (e ->> 'kept_by_the_app')::boolean and e ->> 'kept_for' is distinct from 'agent_output';
    insert into res values ('K other kept tables stay in the default lists', a > 0 and a = b and x = y and x > 0, format('home %s=%s list %s=%s', a, b, x, y));
  exception when others then insert into res values ('K other kept tables stay in the default lists', false, sqlerrm);
  end;
end $$;

reset role;
select check_name, coalesce(ok, false) as ok, left(detail, 160) as detail from res order by check_name;
select coalesce(bool_or(not coalesce(ok, false)), true) as red, count(*) filter (where not coalesce(ok, false)) as nred, count(*) as n from res \gset
\if :red
\echo 'RED —' :nred 'of' :n 'checks failed'
do $$ begin raise exception 'chairdoors2_f_platform_tables_wait_behind_one_switch.sql is RED'; end $$;
\else
\echo 'GREEN —' :n 'checks'
\endif
rollback;
