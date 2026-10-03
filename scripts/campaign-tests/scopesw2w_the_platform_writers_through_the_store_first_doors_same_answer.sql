-- LANE 9 SCOPES-ON-THE-STORE, sublane W2-W — THE PLATFORM'S OWN WRITERS THROUGH THE STORE-FIRST DOORS GIVE THE
-- SAME ANSWER WITH THE SAME EFFECT, on the dev clone (chair hazard 7: a file that changes a write path is rehearsed
-- with the platform's own writers too, not only with direct door calls).
--
-- The writers that reach custom.context_scope_write / custom.context_type_write from inside the database (pg_proc
-- census 2026-10-03): public.edu_class_join_code, public.edu_class_set_access, public.scope_system_apply (the MCP
-- scope tool and aidream's scope_system service), public.accept_scope_suggestion (the suggestions screen), and
-- custom.context_template_define (template authoring, chair's family — covered by its own suites).
--
-- THE USE CASE: admin@admin.com teaches "World Literature" in admin's Workspace (rotates and disables its join
-- code, sets who may join); test@test.com, a member there, may not change it. admin@admin.com files a referral
-- partner through the scope tool; test@test.com accepts a suggested Practice Area at Cedar Ridge Physical Therapy,
-- and admin@admin.com accepts one that needs a new scope type.
-- HOW: each case on the OLD bodies (the three W2-W inverses) and on the NEW ones, each in its own rolled-back
-- sub-transaction; answer (ok, SQLSTATE, message, JSON) and effect (image rows, store Records, the side effects of
-- _scopesw2w_side_effects.sql) compared, with every id this case made named by its order and a rotated join code
-- named <code>. RED on any difference, or when no case compared.

\set ON_ERROR_STOP on
\timing off
\set suite 'scopesw2w_the_platform_writers_through_the_store_first_doors_same_answer.sql'
\set expect 'clone'
\set requires 'function:public.edu_class_join_code|function:public.scope_system_apply|function:public.accept_scope_suggestion'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '300s';

create temp table w2p_res (body text, seat text, name text, ok boolean, state text, msg text, answer text, effect text) on commit drop;
create temp table w2p_fx (k text primary key, v uuid) on commit drop;
insert into w2p_fx values
  ('test', '4060701e-706a-4c76-b3ca-0bbc69fa5a14'), ('admin', '87a6e699-3622-4869-8843-d0867456c0dd'),
  ('cedar', '0a54df90-eab8-4d07-ab29-81a45fb41e04'), ('workspace', '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f'),
  ('world_lit', '027fbb4e-ad14-4c35-b015-d62f4d532372'),
  ('sugg_test', '5c1e7a90-2b4d-4f63-9a18-3e6d0b7c4f21'), ('sugg_admin', '7a2f9c14-6e3b-4d8a-b5c0-1f9e2d4a6b83');

-- Two pending suggestions, as the suggestion sweep leaves them.
insert into rag.scope_suggestions (id, user_id, organization_id, source_kind, source_id, scope_type_label, suggested_name, reasoning, confidence)
values ('5c1e7a90-2b4d-4f63-9a18-3e6d0b7c4f21', '4060701e-706a-4c76-b3ca-0bbc69fa5a14', '0a54df90-eab8-4d07-ab29-81a45fb41e04',
        'note', '0a54df90-eab8-4d07-ab29-81a45fb41e04', 'Practice Area', 'Pelvic floor therapy',
        'Six intake notes this month mention pelvic floor referrals.', 0.82),
       ('7a2f9c14-6e3b-4d8a-b5c0-1f9e2d4a6b83', '87a6e699-3622-4869-8843-d0867456c0dd', '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f',
        'note', '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f', 'Reading Circle', 'Tuesday evening readers',
        'Three class notes name the same evening reading group.', 0.74);

\i scripts/campaign-tests/_scopesw2w_side_effects.sql

-- The effect of one case: for every store row the case made or touched in the two organizations, its image row,
-- its store Record and its side effects; ids the case made are named by their order, the join code by <code>.
create or replace function pg_temp.w2p_effect(p_ids uuid[]) returns text language sql as $e$
  select coalesce(jsonb_agg(jsonb_build_object(
           'image_scope', (select to_jsonb(sc) - 'id' from context.scopes sc where sc.id = r.id),
           'image_type', (select to_jsonb(st) - 'id' from context.scope_types st where st.id = r.id),
           'store', jsonb_build_object('version', r.version, 'data', r.data, 'created_by', r.created_by,
                                       'archived', r.deleted_at is not null, 'class', r.data_class, 'table_id', r.table_id),
           'side_effects', pg_temp.w2w_side_effects(r.organization_id, r.id, coalesce(
                             case when r.data_class = 'table' then r.id end, r.table_id)))
           order by r.data_class, r.data ->> 'name', r.data ->> 'label_singular'), '[]'::jsonb)::text
    from custom.record r where r.id = any (p_ids) and r.data_class in ('record', 'table')
$e$;

create or replace function pg_temp.w2p_run(p_body text) returns void language plpgsql as $run$
declare
  f jsonb := (select jsonb_object_agg(k, v) from w2p_fx);
  c record; v_out jsonb; v_state text; v_msg text; v_eff text; v_ans text; v_ids uuid[]; v_new text[]; v_i int;
begin
  for c in
    select * from (values
      ('admin', 'admin', 'E1 rotate the join code',    'join_rotate',  null::jsonb),
      ('admin', 'admin', 'E2 disable the join code',   'join_disable', null::jsonb),
      ('admin', 'admin', 'E3 class open to requests',  'access_closed', null::jsonb),
      ('test',  'test',  'E4 a member may not change it', 'access_paid', null::jsonb),
      ('admin', 'admin', 'S1 the scope tool files a partner', 'apply',
         '[{"op":"upsert_scope_type","key":"referral-partners","label_singular":"Referral Partner","label_plural":"Referral Partners"},
           {"op":"upsert_scope","scope_type_key":"referral-partners","key":"harbor-sports-medicine","name":"Harbor Sports Medicine","settings":{"fax":"562-555-0148"}},
           {"op":"upsert_scope","scope_type_key":"referral-partners","key":"harbor-sports-medicine","description":"Orthopedic group in Long Beach."}]'::jsonb),
      ('test',  'test',  'S2 the scope tool needs an organization admin', 'apply_cedar',
         '[{"op":"upsert_scope_type","key":"referral-partners","label_singular":"Referral Partner","label_plural":"Referral Partners"}]'::jsonb),
      ('test',  'test',  'G1 accept a suggested Practice Area', 'accept_test', null::jsonb),
      ('admin', 'admin', 'G2 accept a suggestion that needs a new type', 'accept_admin', null::jsonb)
    ) t(seat, who, name, act, ops)
  loop
    v_out := null; v_state := null; v_msg := null; v_eff := null; v_ans := null;
    begin
      perform set_config('request.jwt.claims', jsonb_build_object('sub', f ->> c.who, 'role', 'authenticated')::text, true);
      perform set_config('role', 'authenticated', true);
      v_out := case c.act
        when 'join_rotate'   then public.edu_class_join_code((f->>'world_lit')::uuid, 'rotate')
        when 'join_disable'  then public.edu_class_join_code((f->>'world_lit')::uuid, 'disable')
        when 'access_closed' then to_jsonb(public.edu_class_set_access((f->>'world_lit')::uuid, 'closed'))
        when 'access_paid'   then to_jsonb(public.edu_class_set_access((f->>'world_lit')::uuid, 'paid'))
        when 'apply'         then public.scope_system_apply((f->>'workspace')::uuid, c.ops)
        when 'apply_cedar'   then public.scope_system_apply((f->>'cedar')::uuid, c.ops)
        when 'accept_test'   then public.accept_scope_suggestion((f->>'sugg_test')::uuid, null)
        else                      public.accept_scope_suggestion((f->>'sugg_admin')::uuid, null) end;
      perform set_config('role', 'none', true);
      -- every store row this case made or changed in the two organizations
      select coalesce(array_agg(r.id), '{}') into v_ids from custom.record r
       where r.organization_id in ((f->>'cedar')::uuid, (f->>'workspace')::uuid)
         and (r.updated_at >= now() or r.created_at >= now()) and r.data_class in ('record', 'table')
         and (r.data ->> 'kept_for' = 'context'
              or exists (select 1 from custom.record t where t.organization_id = r.organization_id and t.id = r.table_id
                           and t.data ->> 'kept_for' = 'context'));
      v_eff := pg_temp.w2p_effect(v_ids);
      v_ans := v_out::text;
      select coalesce(array_agg(r.id::text order by r.data_class, r.data ->> 'name', r.data ->> 'label_singular'), '{}') into v_new
        from custom.record r where r.id = any (v_ids) and r.created_at >= now();
      for v_i in 1 .. coalesce(array_length(v_new, 1), 0) loop
        v_eff := replace(v_eff, v_new[v_i], '<made-' || v_i || '>');
        v_ans := replace(v_ans, v_new[v_i], '<made-' || v_i || '>');
      end loop;
      -- the column Fields of a type this case made have ids derived from its id
      for v_i in 1 .. coalesce(array_length(v_new, 1), 0) loop
        v_eff := replace(replace(replace(replace(v_eff,
                   custom._ctx_id('scope-column-field', v_new[v_i], 'name')::text, '<col-name-' || v_i || '>'),
                   custom._ctx_id('scope-column-field', v_new[v_i], 'description')::text, '<col-description-' || v_i || '>'),
                   custom._ctx_id('scope-column-field', v_new[v_i], 'slug')::text, '<col-slug-' || v_i || '>'),
                   custom._ctx_id('scope-column-field', v_new[v_i], 'sort_order')::text, '<col-sort_order-' || v_i || '>');
      end loop;
      if c.act = 'join_rotate' and v_out ->> 'code' is not null then
        v_eff := replace(v_eff, v_out ->> 'code', '<code>');
        v_ans := replace(v_ans, v_out ->> 'code', '<code>');
      end if;
      raise exception using errcode = 'P0W2P', message = 'rolled back';
    exception
      when sqlstate 'P0W2P' then null;
      when others then get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    end;
    perform set_config('role', 'none', true);
    insert into w2p_res values (p_body, c.seat, c.name, v_state is null, v_state, v_msg, v_ans, v_eff);
  end loop;
end
$run$;

-- OLD = the bodies before the three W2-W files (their inverses, newest first); NEW = the files in their order.
select position('LANE 9 W2-W' in pg_get_functiondef('custom.context_scope_write(uuid,uuid,uuid,jsonb)'::regprocedure)) > 0 as scope_live \gset
\if :scope_live
\i migrations/inverse/scopesw2w_the_scope_door_writes_the_store_first_down.sql
\endif
select position('LANE 9 W2-W' in pg_get_functiondef('custom._context_side_effects(jsonb)'::regprocedure)) > 0 as type_live \gset
\if :type_live
\i migrations/inverse/scopesw2w_the_scope_type_door_writes_the_store_first_down.sql
\endif
select pg_temp.w2p_run('old');
\i migrations/campaign/scopesw2w_the_scope_type_door_writes_the_store_first.sql
\i migrations/campaign/scopesw2w_the_scope_door_writes_the_store_first.sql
select pg_temp.w2p_run('new');

do $cmp$
declare r record; v_fails text[] := '{}'; v_n int := 0;
begin
  for r in
    select o.seat, o.name, o.ok o_ok, n.ok n_ok, o.state o_state, n.state n_state, o.msg o_msg, n.msg n_msg,
           o.answer o_ans, n.answer n_ans, o.effect o_eff, n.effect n_eff
      from w2p_res o join w2p_res n on n.body = 'new' and n.seat = o.seat and n.name = o.name
     where o.body = 'old' order by o.seat, o.name
  loop
    v_n := v_n + 1;
    if r.o_ok is distinct from r.n_ok or r.o_state is distinct from r.n_state or r.o_msg is distinct from r.n_msg then
      v_fails := v_fails || format('%s / %s RED (answer): old %s %s "%s" — new %s %s "%s"', r.seat, r.name,
                                   r.o_ok, coalesce(r.o_state, ''), coalesce(r.o_msg, ''), r.n_ok, coalesce(r.n_state, ''), coalesce(r.n_msg, ''));
    else
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
    end if;
  end loop;
  if v_n = 0 or (select count(*) from w2p_res where body = 'new' and ok) = 0 then
    v_fails := v_fails || 'PAIRS RED: no accepted case compared'::text;
  end if;
  if array_length(v_fails, 1) > 0 then
    raise exception E'scopesw2w platform writers: % difference(s):\n%', array_length(v_fails, 1), array_to_string(v_fails, E'\n');
  end if;
  raise notice 'scopesw2w platform writers: SAME answer and effect over % cases', v_n;
end $cmp$;
rollback;
\echo 'scopesw2w_the_platform_writers_through_the_store_first_doors_same_answer: PASS'
