-- LANE 9 SCOPES-ON-THE-STORE, sublane W2-W round 3 — THE VALUE DOOR (custom.context_value_write →
-- custom._ctx_value_write_store) DECIDES ON THE STORE AND GIVES THE SAME ANSWER WITH THE SAME EFFECT AS THE OLD BODY,
-- on the dev clone (migrations/campaign/scopesw2w_the_value_door_decides_on_the_store.sql).
--
-- THE USE CASE: in admin's Workspace the Clinic Program "Return-to-sport" carries a Program lead value. admin@admin.com
-- (owner) and test@test.com (a member, editor on the organization's scopes) set and change it; a value on an
-- archived program, on another firm's matter (test@test.com is no member of Castellano & Reyes), on an invented
-- scope, a null value and a missing id are compared too.
-- HOW: each case on the OLD body (the inverse) and the NEW one, each in its own rolled-back sub-transaction;
-- answer (the door's JSON, the new value id normalised) and effect (the current old value row, the store Record,
-- the side effects of _scopesw2w_side_effects.sql) compared. RED on any difference, on a sweep queued twice, or
-- when a seat class compared nothing.

\set ON_ERROR_STOP on
\timing off
\set suite 'scopesw2w_the_value_door_decides_on_the_store_same_answer.sql'
\set expect 'clone'
\set requires 'function:custom.context_value_write|function:custom._ctx_value_write_store'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '20s';
set local statement_timeout = '600s';

create temp table w2v_res (body text, seat text, name text, ok boolean, state text, msg text, answer text, effect text) on commit drop;
create temp table w2v_fx (k text primary key, v uuid) on commit drop;
insert into w2v_fx values
  ('test', '4060701e-706a-4c76-b3ca-0bbc69fa5a14'), ('admin', '87a6e699-3622-4869-8843-d0867456c0dd'),
  ('workspace', '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f'), ('doe', '2645730c-97a9-4080-9471-2546d0ce2b66'),
  ('doe_item', '1b833082-535d-4e70-be5c-abc07598213f');

do $setup$
declare
  f jsonb := (select jsonb_object_agg(k, v) from w2v_fx);
  o uuid := (f->>'workspace')::uuid; tp uuid; lead uuid; ret uuid; old uuid;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', f->>'admin', 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  tp := (custom.context_type_write(o, null, '{"label_singular":"Clinic Program","label_plural":"Clinic Programs"}') -> 'row' ->> 'id')::uuid;
  lead := (custom.context_item_write(null, tp, '{"key":"program_lead","display_name":"Program lead","value_type":"string"}') -> 'row' ->> 'id')::uuid;
  ret := (custom.context_scope_write(o, null, tp, '{"name":"Return-to-sport"}') -> 'row' ->> 'id')::uuid;
  perform custom.context_value_write(jsonb_build_object('context_item_id', lead, 'scope_id', ret, 'value_text', 'Dr. Maya Okafor, DPT', 'source_type', 'manual'));
  old := (custom.context_scope_write(o, null, tp, '{"name":"Balance clinic"}') -> 'row' ->> 'id')::uuid;
  perform custom.context_scope_archive(old);
  perform set_config('role', 'none', true);
  insert into w2v_fx values ('tp', tp), ('lead', lead), ('ret', ret), ('archived', old);
end $setup$;

\i scripts/campaign-tests/_scopesw2w_side_effects.sql

create or replace function pg_temp.w2v_effect(p_item uuid, p_scope uuid) returns text language sql as $e$
  select jsonb_build_object(
    'image', (select jsonb_agg(to_jsonb(v) - 'id' - 'created_at' order by v.version)
                from context.context_item_values v where v.context_item_id = p_item and v.scope_id = p_scope),
    'store', (select jsonb_build_object('version', r.version, 'data', r.data, 'deleted_at', r.deleted_at)
                from custom.record r where r.id = p_scope),
    'refs', (select count(*) from context.context_value_refs x where x.scope_id = p_scope),
    'side_effects', (select pg_temp.w2w_side_effects(r.organization_id, r.id, r.table_id) from custom.record r where r.id = p_scope))::text
$e$;

create or replace function pg_temp.w2v_run(p_body text) returns void language plpgsql as $run$
declare
  f jsonb := (select jsonb_object_agg(k, v) from w2v_fx);
  c record; v_out jsonb; v_state text; v_msg text; v_eff text; v_ans text; v_new text;
begin
  for c in
    select * from (values
      ('admin', 'admin', 'V1 change the program lead', (f->>'lead')::uuid, (f->>'ret')::uuid,
         '{"value_text":"Dr. Jonah Reyes, DPT, SCS","source_type":"manual","change_summary":"New lead from November."}'::jsonb),
      ('test',  'test',  'V2 a member editor changes it', (f->>'lead')::uuid, (f->>'ret')::uuid, '{"value_text":"Dr. Jonah Reyes","source_type":"manual"}'::jsonb),
      ('admin', 'admin', 'V3 an assistant fills it', (f->>'lead')::uuid, (f->>'ret')::uuid, '{"value_text":"Dr. Maya Okafor, DPT (from intake notes)"}'::jsonb),
      ('admin', 'admin', 'V4 a null value', (f->>'lead')::uuid, (f->>'ret')::uuid, '{"value_text":null,"source_type":"manual"}'::jsonb),
      ('admin', 'admin', 'V5 a value on an archived program', (f->>'lead')::uuid, (f->>'archived')::uuid, '{"value_text":"Dr. Lena Park","source_type":"manual"}'::jsonb),
      ('admin', 'admin', 'V6 an invented scope', (f->>'lead')::uuid, '8d2f4a6c-1b3e-4c5d-9e7f-0a1b2c3d4e5f'::uuid, '{"value_text":"x","source_type":"manual"}'::jsonb),
      ('admin', 'admin', 'V7 no scope named', (f->>'lead')::uuid, null::uuid, '{"value_text":"x"}'::jsonb),
      ('non-member', 'test', 'N1 a value on a firm''s matter', (f->>'doe_item')::uuid, (f->>'doe')::uuid, '{"value_text":"Self-insured employer","source_type":"manual"}'::jsonb)
    ) t(seat, who, name, item, scope, payload)
  loop
    v_out := null; v_state := null; v_msg := null; v_eff := null; v_ans := null;
    begin
      perform set_config('request.jwt.claims', jsonb_build_object('sub', f ->> c.who, 'role', 'authenticated')::text, true);
      perform set_config('role', 'authenticated', true);
      v_out := custom.context_value_write(c.payload || jsonb_build_object('context_item_id', c.item, 'scope_id', c.scope));
      perform set_config('role', 'none', true);
      v_eff := pg_temp.w2v_effect(c.item, c.scope);
      v_ans := v_out::text;
      v_new := v_out -> 'data' ->> 'id';
      if v_new is not null then
        v_eff := replace(v_eff, v_new, '<new>');
        v_ans := replace(v_ans, v_new, '<new>');
      end if;
      raise exception using errcode = 'P0W2V', message = 'rolled back';
    exception
      when sqlstate 'P0W2V' then null;
      when others then get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    end;
    perform set_config('role', 'none', true);
    insert into w2v_res values (p_body, c.seat, c.name, v_state is null, v_state, v_msg, v_ans, v_eff);
  end loop;
end
$run$;

select position('LANE 9 W2-W' in pg_get_functiondef('custom._ctx_value_write_store(jsonb)'::regprocedure)) > 0 as file_is_live \gset
\if :file_is_live
\i migrations/inverse/scopesw2w_the_value_door_decides_on_the_store_down.sql
\endif
select pg_temp.w2v_run('old');
\i migrations/campaign/scopesw2w_the_value_door_decides_on_the_store.sql
select pg_temp.w2v_run('new');

do $cmp$
declare r record; v_fails text[] := '{}'; v_pairs jsonb;
begin
  for r in
    select o.seat, o.name, o.ok o_ok, n.ok n_ok, o.state o_state, n.state n_state, o.msg o_msg, n.msg n_msg,
           o.answer o_ans, n.answer n_ans, o.effect o_eff, n.effect n_eff
      from w2v_res o join w2v_res n on n.body = 'new' and n.seat = o.seat and n.name = o.name
     where o.body = 'old' order by o.seat, o.name
  loop
    if r.o_ok is distinct from r.n_ok or r.o_state is distinct from r.n_state or r.o_msg is distinct from r.n_msg then
      v_fails := v_fails || format('%s / %s RED (answer): old %s %s "%s" — new %s %s "%s"', r.seat, r.name,
                                   r.o_ok, coalesce(r.o_state, ''), coalesce(r.o_msg, ''), r.n_ok, coalesce(r.n_state, ''), coalesce(r.n_msg, ''));
      continue;
    end if;
    if coalesce((r.n_eff::jsonb #>> '{side_effects,sweep_extra}')::int, 0) <> 0 then
      v_fails := v_fails || format('%s / %s RED (H1 class): the new body queued a sweep more than once per thing', r.seat, r.name);
    end if;
    if r.o_ans is distinct from r.n_ans then
      v_fails := v_fails || format(E'%s / %s RED (answer JSON):\n old %s\n new %s', r.seat, r.name, r.o_ans, r.n_ans);
    end if;
    if (r.o_eff::jsonb #- '{side_effects,sweep_extra}') is distinct from (r.n_eff::jsonb #- '{side_effects,sweep_extra}') then
      v_fails := v_fails || format(E'%s / %s RED (effect):\n old %s\n new %s', r.seat, r.name, r.o_eff, r.n_eff);
    end if;
    raise notice '% / % compared: %', r.seat, r.name, left(coalesce(r.n_ans, r.n_msg), 160);
  end loop;
  select jsonb_object_agg(seat, n) into v_pairs from (select seat, count(*) n from w2v_res where body = 'new' group by seat) x;
  if coalesce((v_pairs ->> 'test')::int, 0) = 0 or coalesce((v_pairs ->> 'admin')::int, 0) = 0 or coalesce((v_pairs ->> 'non-member')::int, 0) = 0
     or not exists (select 1 from w2v_res where body = 'new' and answer like '%"ok": true%') then
    v_fails := v_fails || format('PAIRS RED: a seat class compared nothing, or nothing was saved %s', v_pairs);
  end if;
  if array_length(v_fails, 1) > 0 then
    raise exception E'scopesw2w value door: % difference(s):\n%', array_length(v_fails, 1), array_to_string(v_fails, E'\n');
  end if;
  raise notice 'scopesw2w value door: SAME answer and effect, pairs %', v_pairs;
end $cmp$;
rollback;
\echo 'scopesw2w_the_value_door_decides_on_the_store_same_answer: PASS'
