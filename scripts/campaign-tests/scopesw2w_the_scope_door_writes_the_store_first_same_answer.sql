-- LANE 9 SCOPES-ON-THE-STORE, sublane W2-W — THE SCOPE DOOR (custom.context_scope_write) DECIDES AND WRITES IN THE
-- STORE FIRST AND GIVES THE SAME ANSWER WITH THE SAME EFFECT AS THE OLD BODY, for both seats and a non-member,
-- on the dev clone (migrations/campaign/scopesw2w_the_scope_door_writes_the_store_first.sql).
--
-- THE USE CASE: Cedar Ridge Physical Therapy's Practice Areas. test@test.com and admin@admin.com are members;
-- test@test.com is no member of Castellano & Reyes, LLP (the non-member seat).
-- HOW: one transaction, rolled back. Every case runs on the OLD body (the inverse), then on the NEW body (the
-- file), each case in its own sub-transaction rolled back after its effect is read. Compared per (seat, case):
--   answer — ok or refused, SQLSTATE, message, and the answer JSON (the new scope's id normalised);
--   effect — the context.scopes image row, the custom.record store Record (version, data, owner, archive), and
--            the Table's settings Fields, ids normalised.
-- Two refusals change ON PURPOSE and are named (the store decides first and says it in its own words):
--   wrong_type_parent   P0001 (the old trigger) -> 23514 (the store's parent rule), the same sentence
--   duplicate_slug      the raw unique-constraint text -> the store's plain sentence, both 23505
-- Any other difference is RED. RED also when a seat class compared no case (pair count 0).
-- THE BREAK THIS CATCHES: a store-first body that decides or writes differently from the old functions
-- (a planted change: the new body's sort-order default off by one turns C1/C2/C4 RED — see the report).

\set ON_ERROR_STOP on
\timing off
\set suite 'scopesw2w_the_scope_door_writes_the_store_first_same_answer.sql'
\set expect 'clone'
\set requires 'function:custom.context_scope_write|function:custom._ctx_store_scope'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '300s';

create temp table w2s_res (body text, seat text, name text, ok boolean, state text, msg text, answer text, effect text) on commit drop;
create temp table w2s_fx (k text primary key, v uuid) on commit drop;
insert into w2s_fx values
  ('test', '4060701e-706a-4c76-b3ca-0bbc69fa5a14'), ('admin', '87a6e699-3622-4869-8843-d0867456c0dd'),
  ('cedar', '0a54df90-eab8-4d07-ab29-81a45fb41e04'), ('castellano', '7cd12da2-2213-4378-8fba-a9e2dc4ea657'),
  ('practice', '7fe0bdd8-b758-450b-a81e-767111e4b909'), ('sports', 'dff514a6-c1fc-4470-97d4-d979145356e6'),
  ('ortho', '9243f75e-07e1-4ea8-bd6b-8c907562a841'), ('matter_type', '1aaba65d-68de-457e-8a0c-0f2731161d13'),
  ('doe', '2645730c-97a9-4080-9471-2546d0ce2b66');

-- The setup both runs share: a second Practice Area, so a scope can move under a sibling.
do $setup$
declare f jsonb := (select jsonb_object_agg(k, v) from w2s_fx); v jsonb;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', f->>'admin', 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v := custom.context_scope_write((f->>'cedar')::uuid, null, (f->>'practice')::uuid, '{"name":"Youth athletics"}');
  perform set_config('role', 'none', true);
  insert into w2s_fx values ('youth', (v -> 'row' ->> 'id')::uuid);
end $setup$;

create or replace function pg_temp.w2s_effect(p_org uuid, p_type uuid, p_id uuid) returns text language sql as $e$
  select jsonb_build_object(
    'image', (select to_jsonb(sc) - 'id' from context.scopes sc where sc.id = p_id),
    'store', (select jsonb_build_object('version', r.version, 'data', r.data, 'created_by', r.created_by,
                                        'archived', r.deleted_at is not null, 'table_id', r.table_id, 'metadata', r.metadata - 'moved_from',
                                        'moved_from_table', r.metadata -> 'moved_from' ->> 'table')
                from custom.record r where r.organization_id = p_org and r.id = p_id),
    'settings_fields', (select jsonb_agg(f.data - 'sort' order by f.data ->> 'key') from custom.record f
                         where f.organization_id = p_org and f.table_id = custom.field_kernel_id()
                           and f.data ->> 'entity_definition_id' = p_type::text
                           and f.metadata -> 'moved_from' ->> 'note' like 'the % key of this type''s scopes'' settings%'))::text
$e$;

create or replace function pg_temp.w2s_run(p_body text) returns void language plpgsql as $run$
declare
  f jsonb := (select jsonb_object_agg(k, v) from w2s_fx);
  c record; v_out jsonb; v_state text; v_msg text; v_eff text; v_id uuid; v_ans text;
begin
  for c in
    select * from (values
      ('test',  'test',  'C1 create',            (f->>'cedar')::uuid, null::uuid, (f->>'practice')::uuid, '{"name":"Pediatric vestibular rehab"}'::jsonb),
      ('admin', 'admin', 'C1 create',            (f->>'cedar')::uuid, null, (f->>'practice')::uuid, '{"name":"Pediatric vestibular rehab"}'::jsonb),
      ('test',  'test',  'C2 create, settings',  (f->>'cedar')::uuid, null, (f->>'practice')::uuid,
         '{"name":"Concussion return-to-learn","description":"Graduated return to class after a sports concussion.","settings":{"intake_form":"concussion-v3","accepts_workers_comp":true}}'::jsonb),
      ('admin', 'admin', 'C2 create, settings',  (f->>'cedar')::uuid, null, (f->>'practice')::uuid,
         '{"name":"Concussion return-to-learn","description":"Graduated return to class after a sports concussion.","settings":{"intake_form":"concussion-v3","accepts_workers_comp":true}}'::jsonb),
      ('test',  'test',  'C3 create, slug+sort', (f->>'cedar')::uuid, null, (f->>'practice')::uuid, '{"name":"Aquatic therapy","slug":"Aquatic PT","sort_order":9}'::jsonb),
      ('admin', 'admin', 'C4 create under same type', (f->>'cedar')::uuid, null, (f->>'practice')::uuid,
         jsonb_build_object('name', 'ACL return-to-sport testing', 'parent_scope_id', f->>'sports')),
      ('test',  'test',  'C5 wrong_type_parent', (f->>'cedar')::uuid, null, (f->>'practice')::uuid,
         jsonb_build_object('name', 'Hand therapy', 'parent_scope_id', f->>'ortho')),
      ('test',  'test',  'C6 type of another org', (f->>'cedar')::uuid, null, (f->>'matter_type')::uuid, '{"name":"Hand therapy"}'::jsonb),
      ('admin', 'admin', 'C7 duplicate_slug',    (f->>'cedar')::uuid, null, (f->>'practice')::uuid, '{"name":"Sports rehab"}'::jsonb),
      ('test',  'test',  'C8 no name',           (f->>'cedar')::uuid, null, (f->>'practice')::uuid, '{"description":"no name given"}'::jsonb),
      ('test',  'test',  'C9 parent invented',   (f->>'cedar')::uuid, null, (f->>'practice')::uuid,
         '{"name":"Hand therapy","parent_scope_id":"0b9a64c1-5e2d-4f7a-9c3e-8d1f6a2b7e40"}'::jsonb),
      ('test',  'test',  'U1 rename',            null, (f->>'sports')::uuid, null,
         '{"name":"Sports rehabilitation","description":"Return-to-sport care for athletes."}'::jsonb),
      ('admin', 'admin', 'U2 settings',          null, (f->>'sports')::uuid, null, '{"settings":{"intake_form":"sports-v2"}}'::jsonb),
      ('admin', 'admin', 'U3 move under sibling', null, (f->>'sports')::uuid, null, jsonb_build_object('parent_scope_id', f->>'youth')),
      ('test',  'test',  'U4 move under itself', null, (f->>'sports')::uuid, null, jsonb_build_object('parent_scope_id', f->>'sports')),
      ('test',  'test',  'U5 move under other type', null, (f->>'sports')::uuid, null, jsonb_build_object('parent_scope_id', f->>'ortho')),
      ('admin', 'admin', 'U6 clear parent',      null, (f->>'youth')::uuid, null, '{"parent_scope_id":null,"sort_order":4}'::jsonb),
      ('test',  'test',  'U7 slug only',         null, (f->>'youth')::uuid, null, '{"slug":"youth-athletes"}'::jsonb),
      ('non-member', 'test', 'N1 create in a firm she is not in', (f->>'castellano')::uuid, null, (f->>'matter_type')::uuid, '{"name":"Reyes v. Coastline"}'::jsonb),
      ('non-member', 'test', 'N2 rename a firm''s matter', null, (f->>'doe')::uuid, null, '{"name":"Doe v. CSV (renamed)"}'::jsonb),
      ('admin', 'admin', 'N3 update an invented scope', null, '5d3c2b1a-9e8f-4a7b-8c6d-1e2f3a4b5c6d'::uuid, null, '{"name":"Nothing"}'::jsonb)
    ) t(seat, who, name, org, scope_id, type_id, spec)
  loop
    v_out := null; v_state := null; v_msg := null; v_eff := null; v_id := null;
    begin
      perform set_config('request.jwt.claims', jsonb_build_object('sub', f ->> c.who, 'role', 'authenticated')::text, true);
      perform set_config('role', 'authenticated', true);
      v_out := custom.context_scope_write(c.org, c.scope_id, c.type_id, c.spec);
      perform set_config('role', 'none', true);
      v_id := coalesce((v_out -> 'row' ->> 'id')::uuid, c.scope_id);
      v_eff := pg_temp.w2s_effect(coalesce(c.org, (f->>'cedar')::uuid), coalesce(c.type_id, (f->>'practice')::uuid), v_id);
      raise exception using errcode = 'P0W2S', message = 'rolled back';
    exception
      when sqlstate 'P0W2S' then null;
      when others then get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    end;
    perform set_config('role', 'none', true);
    v_ans := v_out::text;
    if c.scope_id is null and v_id is not null then
      v_ans := replace(v_ans, v_id::text, '<new>');
      v_eff := replace(v_eff, v_id::text, '<new>');
    end if;
    insert into w2s_res values (p_body, c.seat, c.name, v_state is null, v_state, v_msg, v_ans, v_eff);
  end loop;
end
$run$;

select position('LANE 9 W2-W' in pg_get_functiondef('custom.context_scope_write(uuid,uuid,uuid,jsonb)'::regprocedure)) > 0 as file_is_live \gset
\if :file_is_live
\i migrations/inverse/scopesw2w_the_scope_door_writes_the_store_first_down.sql
\endif
select pg_temp.w2s_run('old');
\i migrations/campaign/scopesw2w_the_scope_door_writes_the_store_first.sql
select pg_temp.w2s_run('new');

do $cmp$
declare
  r record; v_fails text[] := '{}'; v_pairs jsonb;
begin
  for r in
    select o.seat, o.name, o.ok o_ok, n.ok n_ok, o.state o_state, n.state n_state, o.msg o_msg, n.msg n_msg,
           o.answer o_ans, n.answer n_ans, o.effect o_eff, n.effect n_eff
      from w2s_res o join w2s_res n on n.body = 'new' and n.seat = o.seat and n.name = o.name
     where o.body = 'old' order by o.seat, o.name
  loop
    if r.name like '%wrong_type_parent%' or r.name like '%move under other type%' then
      if not (r.o_ok = false and r.n_ok = false and r.n_state = '23514' and r.o_msg = r.n_msg) then
        v_fails := v_fails || format('%s / %s RED: named divergence broke — old %s "%s", new %s "%s"', r.seat, r.name, r.o_state, r.o_msg, r.n_state, r.n_msg);
      else raise notice '% / % NAMED: old % -> new 23514, same sentence "%"', r.seat, r.name, r.o_state, r.n_msg; end if;
    elsif r.name like '%duplicate_slug%' then
      if not (r.o_ok = false and r.n_ok = false and r.o_state = '23505' and r.n_state = '23505') then
        v_fails := v_fails || format('%s / %s RED: named divergence broke — old %s "%s", new %s "%s"', r.seat, r.name, r.o_state, r.o_msg, r.n_state, r.n_msg);
      else raise notice '% / % NAMED: old "%" -> new "%"', r.seat, r.name, r.o_msg, r.n_msg; end if;
    elsif r.o_ok is distinct from r.n_ok or r.o_state is distinct from r.n_state or r.o_msg is distinct from r.n_msg then
      v_fails := v_fails || format('%s / %s RED (answer): old %s %s "%s" — new %s %s "%s"', r.seat, r.name,
                                   r.o_ok, coalesce(r.o_state, ''), coalesce(r.o_msg, ''), r.n_ok, coalesce(r.n_state, ''), coalesce(r.n_msg, ''));
    elsif r.o_ans is distinct from r.n_ans then
      v_fails := v_fails || format(E'%s / %s RED (answer JSON):\n old %s\n new %s', r.seat, r.name, r.o_ans, r.n_ans);
    elsif r.o_eff is distinct from r.n_eff then
      v_fails := v_fails || format(E'%s / %s RED (effect):\n old %s\n new %s', r.seat, r.name, r.o_eff, r.n_eff);
    else
      raise notice '% / % SAME (%)', r.seat, r.name, case when r.n_ok then 'accepted' else 'refused ' || r.n_state || ' "' || r.n_msg || '"' end;
    end if;
  end loop;
  select jsonb_object_agg(seat, n) into v_pairs from (select seat, count(*) n from w2s_res where body = 'new' group by seat) x;
  if coalesce((v_pairs ->> 'test')::int, 0) = 0 or coalesce((v_pairs ->> 'admin')::int, 0) = 0 or coalesce((v_pairs ->> 'non-member')::int, 0) = 0 then
    v_fails := v_fails || format('PAIRS RED: a seat class compared nothing %s', v_pairs);
  end if;
  if (select count(*) from w2s_res where body = 'new' and ok) = 0 or (select count(*) from w2s_res where body = 'new' and not ok) = 0 then
    v_fails := v_fails || 'PAIRS RED: the cases must hold both accepted and refused answers'::text;
  end if;
  if array_length(v_fails, 1) > 0 then
    raise exception E'scopesw2w scope door: % difference(s):\n%', array_length(v_fails, 1), array_to_string(v_fails, E'\n');
  end if;
  raise notice 'scopesw2w scope door: SAME answer and effect, pairs %', v_pairs;
end $cmp$;
rollback;
\echo 'scopesw2w_the_scope_door_writes_the_store_first_same_answer: PASS'
