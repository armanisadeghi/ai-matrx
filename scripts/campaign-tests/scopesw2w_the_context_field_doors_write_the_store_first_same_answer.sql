-- LANE 9 SCOPES-ON-THE-STORE, sublane W2-W round 3 — THE CONTEXT FIELD DOORS (custom.context_item_write,
-- context_item_archive, context_item_restore) DECIDE AND WRITE IN THE STORE FIRST AND GIVE THE SAME ANSWER WITH THE
-- SAME EFFECT AS THE OLD BODIES, on the dev clone
-- (migrations/campaign/scopesw2w_the_context_field_doors_write_the_store_first.sql).
--
-- THE USE CASE: admin@admin.com (an owner of admin's Workspace) gives the Clinic Program scope type a "Referral
-- source" field and one with every word set, renames one, keeps one away from assistants, sets a review interval,
-- retires one and brings back one retired last week. test@test.com is a member there but no admin (refused); at
-- Castellano & Reyes she is no member (refused). JSON-null words on both paths are compared.
-- HOW: each case on the OLD bodies (the inverse) and the NEW ones, each in its own rolled-back sub-transaction;
-- answer (ok, SQLSTATE, message, JSON, the new id normalised) and effect (the old row, the store Field, the Table's
-- field list and the side effects of _scopesw2w_side_effects.sql) compared. RED on any difference, on a sweep queued
-- twice by the new bodies, or when a seat class compared nothing.

\set ON_ERROR_STOP on
\timing off
\set suite 'scopesw2w_the_context_field_doors_write_the_store_first_same_answer.sql'
\set expect 'clone'
\set requires 'function:custom.context_item_write|function:custom._ctx_store_item|function:custom.scope_item_row_of'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '20s';
set local statement_timeout = '600s';

create temp table w2i_res (body text, seat text, name text, ok boolean, state text, msg text, answer text, effect text) on commit drop;
create temp table w2i_fx (k text primary key, v uuid) on commit drop;
insert into w2i_fx values
  ('test', '4060701e-706a-4c76-b3ca-0bbc69fa5a14'), ('admin', '87a6e699-3622-4869-8843-d0867456c0dd'),
  ('workspace', '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f'), ('doe', '2645730c-97a9-4080-9471-2546d0ce2b66'),
  ('firm_item', '1b833082-535d-4e70-be5c-abc07598213f');

-- The setup both runs share, through the doors as they stand.
do $setup$
declare
  f jsonb := (select jsonb_object_agg(k, v) from w2i_fx);
  o uuid := (f->>'workspace')::uuid; tp uuid; tr uuid; i1 uuid; i2 uuid;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', f->>'admin', 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  tp := (custom.context_type_write(o, null, '{"label_singular":"Clinic Program","label_plural":"Clinic Programs"}') -> 'row' ->> 'id')::uuid;
  i1 := (custom.context_item_write(null, tp, '{"key":"program_lead","display_name":"Program lead","value_type":"string"}') -> 'row' ->> 'id')::uuid;
  i2 := (custom.context_item_write(null, tp, '{"key":"intake_note","display_name":"Intake note","value_type":"string"}') -> 'row' ->> 'id')::uuid;
  perform custom.context_item_archive(i2);
  tr := (custom.context_type_write(o, null, '{"label_singular":"Retired Program","label_plural":"Retired Programs"}') -> 'row' ->> 'id')::uuid;
  perform custom.context_type_archive(tr);
  perform set_config('role', 'none', true);
  insert into w2i_fx values ('tp', tp), ('tr', tr), ('lead', i1), ('note', i2);
end $setup$;

\i scripts/campaign-tests/_scopesw2w_side_effects.sql

create or replace function pg_temp.w2i_effect(p_id uuid) returns text language sql as $e$
  select jsonb_build_object(
    'image', (select to_jsonb(ci) - 'id' from context.context_items ci where ci.id = p_id),
    'store', (select jsonb_build_object('version', r.version, 'data', r.data, 'metadata', r.metadata, 'created_by', r.created_by,
                                        'deleted_at', r.deleted_at) from custom.record r where r.id = p_id),
    'table_fields', (select t.data -> 'fields' from custom.record r join custom.record t
                       on t.organization_id = r.organization_id and t.id::text = r.data ->> 'entity_definition_id' where r.id = p_id),
    'side_effects', (select pg_temp.w2w_side_effects(r.organization_id, r.id, (r.data ->> 'entity_definition_id')::uuid)
                       from custom.record r where r.id = p_id))::text
$e$;

create or replace function pg_temp.w2i_run(p_body text) returns void language plpgsql as $run$
declare
  f jsonb := (select jsonb_object_agg(k, v) from w2i_fx);
  c record; v_out jsonb; v_state text; v_msg text; v_eff text; v_ans text; v_id uuid;
begin
  for c in
    select * from (values
      ('admin', 'admin', 'I1 create a field', 'write', null::uuid, (f->>'tp')::uuid, '{"key":"referral_source","display_name":"Referral source","value_type":"string"}'::jsonb),
      ('admin', 'admin', 'I2 create with every word', 'write', null::uuid, (f->>'tp')::uuid,
         '{"key":"payer_mix","display_name":"Payer mix","value_type":"string","description":"Share of visits by payer.","category":"billing","fetch_hint":"never","sensitivity":"restricted","tags":["billing","quarterly"],"max_items":3,"sort_order":7}'::jsonb),
      ('test',  'test',  'I3 a member who is no admin may not create', 'write', null::uuid, (f->>'tp')::uuid, '{"key":"referral_source","display_name":"Referral source","value_type":"string"}'::jsonb),
      ('admin', 'admin', 'I4 create on a retired type', 'write', null::uuid, (f->>'tr')::uuid, '{"key":"x_note","display_name":"Note","value_type":"string"}'::jsonb),
      ('admin', 'admin', 'U1 rename on the plain path', 'write', (f->>'lead')::uuid, null::uuid, '{"display_name":"Program director","description":"Who runs the program day to day."}'::jsonb),
      ('admin', 'admin', 'U2 keep away from assistants', 'write', (f->>'lead')::uuid, null::uuid, '{"fetch_hint":"never","sensitivity":"privileged"}'::jsonb),
      ('admin', 'admin', 'U3 the row path: review interval and component', 'write', (f->>'lead')::uuid, null::uuid, '{"review_interval_days":30,"custom_component":{"kind":"person_picker"}}'::jsonb),
      ('admin', 'admin', 'U4 a JSON-null word on the row path', 'write', (f->>'lead')::uuid, null::uuid, '{"category":null,"display_name":"Program lead (interim)"}'::jsonb),
      ('admin', 'admin', 'U5 tags and status', 'write', (f->>'lead')::uuid, null::uuid, '{"tags":["staffing"],"status":"gathering","status_note":"Waiting on HR."}'::jsonb),
      ('test',  'test',  'U6 a member who is no admin may not rename', 'write', (f->>'lead')::uuid, null::uuid, '{"display_name":"Program head"}'::jsonb),
      ('test',  'test',  'U7 nor on the row path', 'write', (f->>'lead')::uuid, null::uuid, '{"review_interval_days":7}'::jsonb),
      ('admin', 'admin', 'U8 rename a retired field', 'write', (f->>'note')::uuid, null::uuid, '{"display_name":"Intake summary"}'::jsonb),
      ('admin', 'admin', 'A1 retire a field', 'archive', (f->>'lead')::uuid, null::uuid, null::jsonb),
      ('admin', 'admin', 'A2 retire one already retired', 'archive', (f->>'note')::uuid, null::uuid, null::jsonb),
      ('test',  'test',  'A3 a member who is no admin may not retire', 'archive', (f->>'lead')::uuid, null::uuid, null::jsonb),
      ('admin', 'admin', 'R1 bring back a retired field', 'restore', (f->>'note')::uuid, null::uuid, null::jsonb),
      ('admin', 'admin', 'R2 bring back one in use', 'restore', (f->>'lead')::uuid, null::uuid, null::jsonb),
      ('test',  'test',  'R3 a member who is no admin may not', 'restore', (f->>'note')::uuid, null::uuid, null::jsonb),
      ('admin', 'admin', 'R4 an invented field', 'restore', '4e2c9a1b-7d3f-4b5e-8a6c-2f1d0e9b8a7c'::uuid, null::uuid, null::jsonb),
      ('non-member', 'test', 'N1 rename a firm''s field', 'write', (f->>'firm_item')::uuid, null::uuid, '{"display_name":"Client kind"}'::jsonb),
      ('non-member', 'test', 'N2 retire a firm''s field', 'archive', (f->>'firm_item')::uuid, null::uuid, null::jsonb)
    ) t(seat, who, name, act, id, type_id, spec)
  loop
    v_out := null; v_state := null; v_msg := null; v_eff := null; v_ans := null; v_id := null;
    begin
      perform set_config('request.jwt.claims', jsonb_build_object('sub', f ->> c.who, 'role', 'authenticated')::text, true);
      perform set_config('role', 'authenticated', true);
      v_out := case c.act
        when 'write'   then custom.context_item_write(c.id, c.type_id, c.spec)
        when 'archive' then custom.context_item_archive(c.id)
        else                custom.context_item_restore(c.id) end;
      perform set_config('role', 'none', true);
      v_id := coalesce(c.id, (v_out -> 'row' ->> 'id')::uuid);
      v_eff := pg_temp.w2i_effect(v_id);
      v_ans := v_out::text;
      if c.id is null and v_id is not null then
        v_eff := replace(v_eff, v_id::text, '<new>');
        v_ans := replace(v_ans, v_id::text, '<new>');
      end if;
      raise exception using errcode = 'P0W2I', message = 'rolled back';
    exception
      when sqlstate 'P0W2I' then null;
      when others then get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    end;
    perform set_config('role', 'none', true);
    insert into w2i_res values (p_body, c.seat, c.name, v_state is null, v_state, v_msg, v_ans, v_eff);
  end loop;
end
$run$;

select position('LANE 9 W2-W' in pg_get_functiondef('custom.context_item_write(uuid,uuid,jsonb)'::regprocedure)) > 0 as file_is_live \gset
\if :file_is_live
\i migrations/inverse/scopesw2w_the_context_field_doors_write_the_store_first_down.sql
\endif
select pg_temp.w2i_run('old');
\i migrations/campaign/scopesw2w_the_context_field_doors_write_the_store_first.sql
select pg_temp.w2i_run('new');
do $cmp$
declare r record; v_fails text[] := '{}'; v_pairs jsonb;
begin
  for r in
    select o.seat, o.name, o.ok o_ok, n.ok n_ok, o.state o_state, n.state n_state, o.msg o_msg, n.msg n_msg,
           o.answer o_ans, n.answer n_ans, o.effect o_eff, n.effect n_eff
      from w2i_res o join w2i_res n on n.body = 'new' and n.seat = o.seat and n.name = o.name
     where o.body = 'old' order by o.seat, o.name
  loop
    if r.o_ok is distinct from r.n_ok or r.o_state is distinct from r.n_state or r.o_msg is distinct from r.n_msg then
      v_fails := v_fails || format('%s / %s RED (answer): old %s %s "%s" — new %s %s "%s"', r.seat, r.name,
                                   r.o_ok, coalesce(r.o_state, ''), coalesce(r.o_msg, ''), r.n_ok, coalesce(r.n_state, ''), coalesce(r.n_msg, ''));
      continue;
    end if;
    if coalesce((r.n_eff::jsonb #>> '{side_effects,sweep_extra}')::int, 0) <> 0 then
      v_fails := v_fails || format('%s / %s RED (H1 class): the new bodies queued a sweep more than once per thing', r.seat, r.name);
    end if;
    if r.o_ans is distinct from r.n_ans then
      v_fails := v_fails || format(E'%s / %s RED (answer JSON):\n old %s\n new %s', r.seat, r.name, r.o_ans, r.n_ans);
    end if;
    if (r.o_eff::jsonb #- '{side_effects,sweep_extra}') is distinct from (r.n_eff::jsonb #- '{side_effects,sweep_extra}') then
      v_fails := v_fails || format(E'%s / %s RED (effect):\n old %s\n new %s', r.seat, r.name, r.o_eff, r.n_eff);
    end if;
    raise notice '% / % compared (%)', r.seat, r.name, case when r.n_ok then 'accepted' else 'refused ' || r.n_state || ' "' || r.n_msg || '"' end;
  end loop;
  select jsonb_object_agg(seat, n) into v_pairs from (select seat, count(*) n from w2i_res where body = 'new' group by seat) x;
  if coalesce((v_pairs ->> 'test')::int, 0) = 0 or coalesce((v_pairs ->> 'admin')::int, 0) = 0 or coalesce((v_pairs ->> 'non-member')::int, 0) = 0
     or (select count(*) from w2i_res where body = 'new' and ok) = 0 then
    v_fails := v_fails || format('PAIRS RED: a seat class compared nothing, or nothing was accepted %s', v_pairs);
  end if;
  if array_length(v_fails, 1) > 0 then
    raise exception E'scopesw2w field doors: % difference(s):\n%', array_length(v_fails, 1), array_to_string(v_fails, E'\n');
  end if;
  raise notice 'scopesw2w field doors: SAME answer and effect, pairs %', v_pairs;
end $cmp$;
rollback;
\echo 'scopesw2w_the_context_field_doors_write_the_store_first_same_answer: PASS'
