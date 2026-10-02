-- LANE CHAIR-DOORS-1 — FIVE STORE DOORS, ASKED FROM THE MEMBER'S SEAT.
-- Guard for migrations/campaign/chairdoors1_a_* , _b_* , _c_* , _e_* (and the lane 9 tree doors' grant).
--
-- Every check runs as `authenticated` with test@test.com's claims (set local role — the grants are part of
-- what is proven), except the public form, which runs as the server lane with NOBODY signed in, as the
-- web's /f/<id> route calls it. One transaction, rolled back; nothing is left behind.
--   A. custom.table_kind_facts: answers a Table in Cedar Ridge Physical Therapy (an organization she is a
--      member of, not her active one — the door finds it), every live Field, the list Fields' choices, a
--      stamp; the stamp moves when a Field changes; a Table of an organization she is not in and an
--      invented id are refused with the same 42501 sentence.
--   B. custom.io_import_begin(p_format 'rows') opens; io_import_rows lands a typed number as a number.
--   C. custom.rule_eval with a Field reference answers from her seat; an organization she is not in is
--      refused 42501; history.capture_is_open answers.
--   E. custom.form_submit signed out: a drawn signature becomes a File, the Value is 'Signed' and its
--      envelope names the File; a non-signature answer passes unchanged.
-- THE VERDICT IS THE EXIT CODE: RED raises (psql exits 3 under ON_ERROR_STOP), GREEN exits 0.
--
-- RUN IT (dev clone only; rolled back), session pooler:
--   cd matrx-frontend && psql "${CLONE_DATABASE_URL/:6543/:5432}" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/chairdoors1_doors_from_the_member_seat.sql
\set ON_ERROR_STOP on
\set suite 'chairdoors1_doors_from_the_member_seat.sql'
\set expect 'clone'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
\set QUIET on
begin;
set local statement_timeout = '120s';
set local lock_timeout = '10s';

create temp table res (check_name text, ok boolean, detail text) on commit drop;
grant all on res to authenticated, service_role;

-- Fixtures read as the owner, before any seat is taken.
select '4060701e-706a-4c76-b3ca-0bbc69fa5a14'::uuid as me,             -- test@test.com
       '0a54df90-eab8-4d07-ab29-81a45fb41e04'::uuid as cedar,          -- Cedar Ridge Physical Therapy (member)
       '031d3690-4a02-4cee-a575-454ffd96c992'::uuid as visit_tracker,  -- its Patient Visit Tracker
       '65c38022-ac9e-477f-aa9a-0b08d8ff63d8'::uuid as foreign_table,  -- a Table of an org she is not in
       '9b8278c0-82b9-4034-9deb-1fc215522002'::uuid as dry_run,        -- an org she owns
       'e1eb83b8-4f47-4961-b523-c2ab0fe6da0f'::uuid as visits,         -- its Visits table
       '7ba9f8ae-b0d5-4d73-9efe-5712becdc4d9'::uuid as visit_form      -- Cedar Ridge PT's patient visits form
\gset
select count(*) as want_fields from custom.record f
 where f.organization_id = :'cedar' and f.table_id = custom.field_kernel_id() and f.deleted_at is null
   and (f.data ->> 'entity_definition_id')::uuid = :'visit_tracker' \gset
select count(*) as want_lists from custom.record f
 where f.organization_id = :'cedar' and f.table_id = custom.field_kernel_id() and f.deleted_at is null
   and (f.data ->> 'entity_definition_id')::uuid = :'visit_tracker'
   and nullif(f.data -> 'config' ->> 'options_table_id', '') is not null \gset
select f.id as a_field from custom.record f
 where f.organization_id = :'cedar' and f.table_id = custom.field_kernel_id() and f.deleted_at is null
   and (f.data ->> 'entity_definition_id')::uuid = :'visit_tracker' order by f.id limit 1 \gset
select (select f.id from custom.record f where f.organization_id = :'dry_run' and f.table_id = custom.field_kernel_id()
         and f.deleted_at is null and (f.data ->> 'entity_definition_id')::uuid = :'visits' and f.data ->> 'key' = 'title') as title_field \gset
select set_config('t.' || k, v, true) from (values ('me', :'me'), ('cedar', :'cedar'), ('visit_tracker', :'visit_tracker'),
  ('foreign_table', :'foreign_table'), ('dry_run', :'dry_run'), ('visits', :'visits'), ('visit_form', :'visit_form'),
  ('want_fields', :'want_fields'), ('want_lists', :'want_lists'), ('a_field', :'a_field'), ('title_field', coalesce(:'title_field', ''))) x(k, v) \g /dev/null
-- The form is published inside this transaction only (it is a draft on production).
update custom.anon_form set published_at = coalesce(published_at, now()), closed_at = null where id = :'visit_form';

-- ── the member's seat ────────────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'me', 'role', 'authenticated')::text, true) \g /dev/null

-- A
do $$
declare v jsonb; v2 jsonb; m text;
begin
  v := custom.table_kind_facts(current_setting('t.visit_tracker')::uuid);
  insert into res values ('A org found by the door', v ->> 'organization_id' = current_setting('t.cedar'), v ->> 'organization_id');
  insert into res values ('A every live field', jsonb_array_length(v -> 'fields') = current_setting('t.want_fields')::int,
                          format('%s of %s', jsonb_array_length(v -> 'fields'), current_setting('t.want_fields')));
  insert into res values ('A choices per list field', (select count(*) from jsonb_object_keys(v -> 'choices')) = current_setting('t.want_lists')::int
                          and (select bool_and(jsonb_array_length(e.value) > 0 and e.value -> 0 ? 'key' and e.value -> 0 ? 'label' and e.value -> 0 ? 'id' and e.value -> 0 ? 'retired') from jsonb_each(v -> 'choices') e),
                          (select string_agg(k, ',') from jsonb_object_keys(v -> 'choices') k));
  insert into res values ('A stamp present', length(coalesce(v ->> 'stamp', '')) = 32, v ->> 'stamp');
  begin
    perform custom.table_kind_facts(current_setting('t.foreign_table')::uuid);
    insert into res values ('A foreign table refused', false, 'answered');
  exception when insufficient_privilege then
    get stacked diagnostics m = message_text;
    insert into res values ('A foreign table refused', m like 'You do not have access to this table%', m);
  end;
  begin
    perform custom.table_kind_facts(gen_random_uuid());
    insert into res values ('A invented id refused alike', false, 'answered');
  exception when insufficient_privilege then
    get stacked diagnostics m = message_text;
    insert into res values ('A invented id refused alike', m = 'You do not have access to this table, so custom.table_kind_facts has nothing to show you.', m);
  end;
exception when others then
  get stacked diagnostics m = message_text;
  insert into res values ('A door answers', false, m);
end $$;

do $$ begin
  perform set_config('t.stamp1', coalesce(custom.table_kind_facts(current_setting('t.visit_tracker')::uuid) ->> 'stamp', ''), true);
exception when others then perform set_config('t.stamp1', '', true);
end $$;
reset role;
update custom.record set data = data || jsonb_build_object('description', 'Asked at check-in')
 where id = :'a_field' and organization_id = :'cedar';
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'me', 'role', 'authenticated')::text, true) \g /dev/null
do $$
declare v text := custom.table_kind_facts(current_setting('t.visit_tracker')::uuid) ->> 'stamp';
begin
  insert into res values ('A stamp moves when a field changes', v is distinct from current_setting('t.stamp1') and current_setting('t.stamp1') <> '', format('%s -> %s', current_setting('t.stamp1'), v));
exception when others then
  insert into res values ('A stamp moves when a field changes', false, sqlerrm);
end $$;

-- C
do $$
declare v jsonb; m text;
begin
  v := custom.rule_eval(current_setting('t.dry_run')::uuid,
         jsonb_build_object('op', 'eq', 'args', jsonb_build_array(
           jsonb_build_object('field', current_setting('t.title_field')), jsonb_build_object('const', 'Knee rehab follow-up'))),
         '{"title": "Knee rehab follow-up"}'::jsonb,
         jsonb_build_object('table_id', current_setting('t.visits')));
  insert into res values ('C rule with a field, from her seat', v = 'true'::jsonb, v::text);
  begin
    perform custom.rule_eval('3e790542-fdaf-40b2-8bf3-658bf94fe67f'::uuid, '{"const": 1}'::jsonb, '{}'::jsonb, '{}'::jsonb);
    insert into res values ('C org she is not in refused', false, 'answered');
  exception when insufficient_privilege then
    insert into res values ('C org she is not in refused', true, sqlerrm);
  end;
  insert into res values ('C capture_is_open answers', history.capture_is_open(current_setting('t.dry_run')::uuid) is not null, 'ok');
exception when others then
  get stacked diagnostics m = message_text;
  insert into res values ('C rule_eval reachable', false, m);
end $$;

-- B
do $$
declare v jsonb; w jsonb; m text;
begin
  v := custom.io_import_begin(current_setting('t.dry_run')::uuid, current_setting('t.visits')::uuid, 'rows',
                              'Agent: visit summary', '[]'::jsonb, null, '{"unmapped": "ignore"}'::jsonb);
  insert into res values ('B rows format opens', v ->> 'state' = 'open', v::text);
  w := custom.io_import_rows(current_setting('t.dry_run')::uuid, (v ->> 'import_id')::uuid,
         '[{"title": "Knee rehab follow-up — agent summary", "copay": 35}]'::jsonb, '{}'::jsonb);
  insert into res values ('B a typed row lands', coalesce((w ->> 'rows_written')::int, 0) = 1, left(w::text, 300));
  begin
    perform custom.io_import_begin(current_setting('t.dry_run')::uuid, current_setting('t.visits')::uuid, 'json');
    insert into res values ('B other format refused', false, 'opened');
  exception when invalid_parameter_value then
    insert into res values ('B other format refused', true, sqlerrm);
  end;
exception when others then
  get stacked diagnostics m = message_text;
  insert into res values ('B rows import', false, m);
end $$;

-- ── the public form, signed out (the server lane, nobody in the claims) ─────────────────────
reset role;
set local role service_role;
select set_config('request.jwt.claims', '', true) \g /dev/null
do $$
declare s record; m text; drawn text;
begin
  drawn := 'data:image/png;base64,' || repeat('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk', 2) || 'AAAAAElFTkSuQmCC';
  select * into s from custom.form_submit(current_setting('t.visit_form')::uuid, 'https://aimatrx.com',
    jsonb_build_object('title', 'Knee rehab follow-up', 'signature', drawn), 'chairdoors1-suite', null, null) limit 1;
  insert into res values ('E signed-out submit accepted', s.state in ('accepted', 'held'), format('%s %s', s.state, s.message));
  perform set_config('t.sub', s.submission_id::text, true);
  perform set_config('t.rec', coalesce(s.record_id::text, ''), true);
exception when others then
  get stacked diagnostics m = message_text;
  insert into res values ('E signed-out submit', false, m);
end $$;
reset role;

-- B and E, read back as the owner
do $$
declare p jsonb; d jsonb; f jsonb; fid text; got jsonb;
begin
  select r.data -> 'copay' into got from custom.record r
   where r.organization_id = current_setting('t.dry_run')::uuid and r.table_id = current_setting('t.visits')::uuid
     and r.data ->> 'title' = 'Knee rehab follow-up — agent summary' and r.deleted_at is null limit 1;
  insert into res values ('B typed value stays typed', jsonb_typeof(got) = 'number' and got = '35'::jsonb, coalesce(got::text, '(no record)'));
  select payload into p from custom.anon_submission where id = nullif(current_setting('t.sub', true), '')::uuid;
  fid := p -> '_values' -> 'signature' -> 'src' ->> 'signature_file_id';
  insert into res values ('E value is the word, not the drawing', p ->> 'signature' = 'Signed', left(coalesce(p ->> 'signature', '(none)'), 60));
  select data into f from custom.record where id = nullif(fid, '')::uuid and table_id = custom.file_kernel_id();
  insert into res values ('E the drawing is a File', f ->> 'kind' = 'signature' and f ->> 'content' like 'data:image/png;base64,%', coalesce(fid, '(no file id)'));
  insert into res values ('E other answers unchanged', p ->> 'title' = 'Knee rehab follow-up', p ->> 'title');
  if nullif(current_setting('t.rec', true), '') is not null then
    select data into d from custom.record where id = current_setting('t.rec')::uuid;
    insert into res values ('E record envelope names the File',
      d ->> 'signature' = 'Signed' and d -> '_sources' -> (d -> '_values' -> 'signature' ->> 'src') ->> 'signature_file_id' = fid,
      left(coalesce((d -> '_sources' -> (d -> '_values' -> 'signature' ->> 'src'))::text, '(no source)'), 200));
  end if;
end $$;

select check_name, coalesce(ok, false) as ok, left(detail, 160) as detail from res order by check_name;
select coalesce(bool_or(not coalesce(ok, false)), true) as red, count(*) filter (where not coalesce(ok, false)) as nred, count(*) as n from res \gset
\if :red
\echo 'RED —' :nred 'of' :n 'checks failed'
do $$ begin raise exception 'chairdoors1_doors_from_the_member_seat.sql is RED'; end $$;
\else
\echo 'GREEN —' :n 'checks'
\endif
rollback;
