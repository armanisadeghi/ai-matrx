-- LANE 9 SCOPES-ON-THE-STORE, sublane W2-W round 3 — THE ARCHIVE AND RESTORE DOORS (custom.context_scope_archive,
-- context_scope_restore, context_type_archive, context_type_restore) DECIDE AND WRITE IN THE STORE FIRST AND GIVE
-- THE SAME ANSWER WITH THE SAME EFFECT AS THE OLD BODIES, on the dev clone
-- (migrations/campaign/scopesw2w_the_archive_and_restore_doors_write_the_store_first.sql).
--
-- THE USE CASE: admin@admin.com runs the clinic programs of admin's Workspace (an owner there): archives the
-- Return-to-sport program with its ACL protocol sub-program, restores the Balance clinic it archived with its
-- Vestibular sub-program last week, retires the Clinic Program type and brings back the Retired Program type with
-- its scope and context field. test@test.com is a member there but no admin (refused); at Castellano & Reyes she is
-- no member at all (refused). North Park East, archived before its slug had a home in the store, is restored.
-- HOW: each case on the OLD bodies (the inverse) and the NEW ones, each in its own rolled-back sub-transaction.
-- Effect: for the case's row AND every scope, type and context field under it — the old row (image), the store
-- Record, and the side effects (_scopesw2w_side_effects.sql: sweep queue exactly once per thing, search index,
-- history, made rows). RED on any difference, on a sweep queued twice by the new bodies, or when a seat class
-- compared nothing.

\set ON_ERROR_STOP on
\timing off
\set suite 'scopesw2w_the_archive_and_restore_doors_write_the_store_first_same_answer.sql'
\set expect 'clone'
\set requires 'function:custom.context_scope_archive|function:custom.context_type_restore|function:custom._ctx_store_scope'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '20s';
set local statement_timeout = '600s';

create temp table w2a_res (body text, seat text, name text, ok boolean, state text, msg text, answer text, effect text) on commit drop;
create temp table w2a_fx (k text primary key, v uuid) on commit drop;
insert into w2a_fx values
  ('test', '4060701e-706a-4c76-b3ca-0bbc69fa5a14'), ('admin', '87a6e699-3622-4869-8843-d0867456c0dd'),
  ('workspace', '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f'), ('doe', '2645730c-97a9-4080-9471-2546d0ce2b66'),
  ('north_park', '711dc551-3b54-4fbf-839d-abd50733ca78');

-- The setup both runs share, through the doors as they stand.
do $setup$
declare
  f jsonb := (select jsonb_object_agg(k, v) from w2a_fx);
  o uuid := (f->>'workspace')::uuid; v jsonb; tp uuid; tr uuid; p uuid; b uuid;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', f->>'admin', 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  tp := (custom.context_type_write(o, null, '{"label_singular":"Clinic Program","label_plural":"Clinic Programs"}') -> 'row' ->> 'id')::uuid;
  perform custom.context_item_write(null, tp, '{"key":"program_lead","display_name":"Program lead","value_type":"string"}');
  p := (custom.context_scope_write(o, null, tp, '{"name":"Return-to-sport"}') -> 'row' ->> 'id')::uuid;
  perform custom.context_scope_write(o, null, tp, jsonb_build_object('name', 'ACL protocol', 'parent_scope_id', p));
  perform custom.context_scope_write(o, null, tp, '{"name":"Concussion clinic"}');
  b := (custom.context_scope_write(o, null, tp, '{"name":"Balance clinic"}') -> 'row' ->> 'id')::uuid;
  perform custom.context_scope_write(o, null, tp, jsonb_build_object('name', 'Vestibular', 'parent_scope_id', b));
  perform custom.context_scope_archive(b);
  tr := (custom.context_type_write(o, null, '{"label_singular":"Retired Program","label_plural":"Retired Programs"}') -> 'row' ->> 'id')::uuid;
  perform custom.context_item_write(null, tr, '{"key":"sunset_reason","display_name":"Sunset reason","value_type":"string"}');
  perform custom.context_scope_write(o, null, tr, '{"name":"Aquatic program"}');
  perform custom.context_type_archive(tr);
  perform set_config('role', 'none', true);
  insert into w2a_fx values ('tp', tp), ('tr', tr), ('ret', p), ('balance', b);
end $setup$;

\i scripts/campaign-tests/_scopesw2w_side_effects.sql

-- Every row under one row: its scope children (old parent link or store parent), a type's scopes and fields.
create or replace function pg_temp.w2a_family(p_id uuid) returns uuid[] language sql as $fam$
  with recursive kids(id) as (
    select p_id
    union
    select x.id from kids k
     cross join lateral (select s.id from context.scopes s where s.parent_scope_id = k.id or s.scope_type_id = k.id
                         union all
                         select i.id from context.context_items i where i.scope_type_id = k.id) x)
  select array_agg(id order by id) from kids
$fam$;

create or replace function pg_temp.w2a_effect(p_ids uuid[]) returns text language sql as $e$
  select coalesce(jsonb_agg(jsonb_build_object(
           'image', coalesce((select to_jsonb(sc) from context.scopes sc where sc.id = x.id),
                             (select to_jsonb(st) from context.scope_types st where st.id = x.id),
                             (select to_jsonb(ci) from context.context_items ci where ci.id = x.id)),
           'store', (select jsonb_build_object('version', r.version, 'data', r.data, 'created_by', r.created_by,
                                               'deleted_at', r.deleted_at, 'class', r.data_class)
                       from custom.record r where r.id = x.id),
           'side_effects', (select pg_temp.w2w_side_effects(r.organization_id, r.id,
                                     case when r.data_class = 'table' then r.id else r.table_id end)
                              from custom.record r where r.id = x.id))
           order by x.id), '[]'::jsonb)::text
    from unnest(p_ids) x(id)
$e$;

create or replace function pg_temp.w2a_run(p_body text) returns void language plpgsql as $run$
declare
  f jsonb := (select jsonb_object_agg(k, v) from w2a_fx);
  c record; v_out jsonb; v_state text; v_msg text; v_eff text; v_fam uuid[];
begin
  for c in
    select * from (values
      ('admin', 'admin', 'A1 archive a program with its sub-program', 'scope_archive', (f->>'ret')::uuid),
      ('test',  'test',  'A2 a member who is no admin may not',        'scope_archive', (f->>'ret')::uuid),
      ('admin', 'admin', 'A3 archive one already archived',            'scope_archive', (f->>'balance')::uuid),
      ('admin', 'admin', 'A4 archive an invented scope',               'scope_archive', '6b1d3e5f-2a4c-4e8b-9d7f-0c1a2b3e4d5f'::uuid),
      ('admin', 'admin', 'R1 restore a program with its sub-program',  'scope_restore', (f->>'balance')::uuid),
      ('admin', 'admin', 'R2 restore one that is live',                'scope_restore', (f->>'ret')::uuid),
      ('test',  'test',  'R3 a member who is no admin may not',        'scope_restore', (f->>'balance')::uuid),
      ('admin', 'admin', 'R4 restore one copied before its slug had a home', 'scope_restore', (f->>'north_park')::uuid),
      ('admin', 'admin', 'T1 retire a type with its scopes and field',  'type_archive', (f->>'tp')::uuid),
      ('test',  'test',  'T2 a member who is no admin may not',         'type_archive', (f->>'tp')::uuid),
      ('admin', 'admin', 'T3 bring back a retired type',                'type_restore', (f->>'tr')::uuid),
      ('admin', 'admin', 'T4 bring back a type that is live',           'type_restore', (f->>'tp')::uuid),
      ('admin', 'admin', 'T5 retire one already retired',               'type_archive', (f->>'tr')::uuid),
      ('non-member', 'test', 'N1 archive a firm''s matter',             'scope_archive', (f->>'doe')::uuid),
      ('non-member', 'test', 'N2 restore a firm''s archived scope',     'scope_restore', '726ac9e6-8430-4174-9fb2-72c41559172a'::uuid),
      ('non-member', 'test', 'N3 retire a firm''s type',                'type_archive', '1aaba65d-68de-457e-8a0c-0f2731161d13'::uuid)
    ) t(seat, who, name, act, id)
  loop
    v_out := null; v_state := null; v_msg := null; v_eff := null;
    v_fam := pg_temp.w2a_family(c.id);
    begin
      perform set_config('request.jwt.claims', jsonb_build_object('sub', f ->> c.who, 'role', 'authenticated')::text, true);
      perform set_config('role', 'authenticated', true);
      v_out := case c.act
        when 'scope_archive' then custom.context_scope_archive(c.id)
        when 'scope_restore' then custom.context_scope_restore(c.id)
        when 'type_archive'  then custom.context_type_archive(c.id)
        else                      custom.context_type_restore(c.id) end;
      perform set_config('role', 'none', true);
      v_eff := pg_temp.w2a_effect(v_fam);
      raise exception using errcode = 'P0W2A', message = 'rolled back';
    exception
      when sqlstate 'P0W2A' then null;
      when others then get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    end;
    perform set_config('role', 'none', true);
    insert into w2a_res values (p_body, c.seat, c.name, v_state is null, v_state, v_msg, v_out::text, v_eff);
  end loop;
end
$run$;

select position('LANE 9 W2-W' in pg_get_functiondef('custom.context_scope_archive(uuid)'::regprocedure)) > 0 as file_is_live \gset
\if :file_is_live
\i migrations/inverse/scopesw2w_the_archive_and_restore_doors_write_the_store_first_down.sql
\endif
select pg_temp.w2a_run('old');
\i migrations/campaign/scopesw2w_the_archive_and_restore_doors_write_the_store_first.sql
select pg_temp.w2a_run('new');

do $cmp$
declare r record; v_fails text[] := '{}'; v_pairs jsonb;
begin
  for r in
    select o.seat, o.name, o.ok o_ok, n.ok n_ok, o.state o_state, n.state n_state, o.msg o_msg, n.msg n_msg,
           o.answer o_ans, n.answer n_ans, o.effect o_eff, n.effect n_eff
      from w2a_res o join w2a_res n on n.body = 'new' and n.seat = o.seat and n.name = o.name
     where o.body = 'old' order by o.seat, o.name
  loop
    if r.o_ok is distinct from r.n_ok or r.o_state is distinct from r.n_state or r.o_msg is distinct from r.n_msg then
      v_fails := v_fails || format('%s / %s RED (answer): old %s %s "%s" — new %s %s "%s"', r.seat, r.name,
                                   r.o_ok, coalesce(r.o_state, ''), coalesce(r.o_msg, ''), r.n_ok, coalesce(r.n_state, ''), coalesce(r.n_msg, ''));
      continue;
    end if;
    if r.n_eff is not null and exists (select 1 from jsonb_array_elements(r.n_eff::jsonb) e
                                        where coalesce((e #>> '{side_effects,sweep_extra}')::int, 0) <> 0) then
      v_fails := v_fails || format('%s / %s RED (H1 class): the new bodies queued a sweep more than once per thing', r.seat, r.name);
    end if;
    if r.o_ans is distinct from r.n_ans then
      v_fails := v_fails || format(E'%s / %s RED (answer JSON):\n old %s\n new %s', r.seat, r.name, r.o_ans, r.n_ans);
    end if;
    if (select jsonb_agg(e #- '{side_effects,sweep_extra}') from jsonb_array_elements(coalesce(r.o_eff, '[]')::jsonb) e)
       is distinct from
       (select jsonb_agg(e #- '{side_effects,sweep_extra}') from jsonb_array_elements(coalesce(r.n_eff, '[]')::jsonb) e) then
      v_fails := v_fails || format(E'%s / %s RED (effect):\n old %s\n new %s', r.seat, r.name, r.o_eff, r.n_eff);
    end if;
    raise notice '% / % compared (%)', r.seat, r.name, case when r.n_ok then 'accepted' else 'refused ' || r.n_state || ' "' || r.n_msg || '"' end;
  end loop;
  select jsonb_object_agg(seat, n) into v_pairs from (select seat, count(*) n from w2a_res where body = 'new' group by seat) x;
  if coalesce((v_pairs ->> 'test')::int, 0) = 0 or coalesce((v_pairs ->> 'admin')::int, 0) = 0 or coalesce((v_pairs ->> 'non-member')::int, 0) = 0
     or (select count(*) from w2a_res where body = 'new' and ok) = 0 then
    v_fails := v_fails || format('PAIRS RED: a seat class compared nothing, or nothing was accepted %s', v_pairs);
  end if;
  if array_length(v_fails, 1) > 0 then
    raise exception E'scopesw2w archive doors: % difference(s):\n%', array_length(v_fails, 1), array_to_string(v_fails, E'\n');
  end if;
  raise notice 'scopesw2w archive doors: SAME answer and effect, pairs %', v_pairs;
end $cmp$;
rollback;
\echo 'scopesw2w_the_archive_and_restore_doors_write_the_store_first_same_answer: PASS'
