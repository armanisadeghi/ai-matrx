-- LANE 9 SCOPES-ON-THE-STORE, sublane W2-W round 3 — THE PLATFORM'S OWN WRITERS THROUGH THE ROUND-3 STORE-FIRST
-- DOORS (archive/restore, context fields, values) GIVE THE SAME ANSWER WITH THE SAME EFFECT, on the dev clone
-- (chair hazard 7). Also: what the new archive doors remove, the trash's own restore (public.entity_undelete, chair
-- item CA3, still on the old functions) brings back the same way.
--
-- The writers that reach the round-3 doors from inside the database (pg_proc census 2026-10-03):
-- public.scope_system_apply (archive_scope, archive_scope_type, upsert_context_item, archive_context_item,
-- set_value), public.accept_context_item_suggestion, public.accept_scope_suggestion (its slot values), and the
-- trash's public.entity_undelete restoring what these doors archived.
-- THE USE CASE: admin@admin.com runs admin's Workspace through the scope tool (an organization admin there):
-- adds and renames a context field, sets a value, retires a program and a program type; accepts a suggested
-- field and a suggested scope with a slot value; restores from the trash. test@test.com, a member but no admin,
-- is refused by the scope tool. HOW: each case on the OLD bodies (the three round-3 inverses) and the NEW ones,
-- each rolled back; answer and effect (every context row the case changed: image, store, side effects) compared.

\set ON_ERROR_STOP on
\timing off
\set suite 'scopesw2w_the_platform_writers_through_the_round3_doors_same_answer.sql'
\set expect 'clone'
\set requires 'function:public.scope_system_apply|function:public.accept_context_item_suggestion|function:public.entity_undelete'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '300s';

create temp table w2q_res (body text, seat text, name text, ok boolean, state text, msg text, answer text, effect text) on commit drop;
create temp table w2q_fx (k text primary key, v uuid) on commit drop;
insert into w2q_fx values
  ('test', '4060701e-706a-4c76-b3ca-0bbc69fa5a14'), ('admin', '87a6e699-3622-4869-8843-d0867456c0dd'),
  ('cedar', '0a54df90-eab8-4d07-ab29-81a45fb41e04'), ('workspace', '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f'),
  ('sugg_item', '3d7b1f90-5c2e-4a84-9b16-7e0f2d4c8a51'), ('sugg_scope', '9b4e2c71-0a3d-4f58-8c69-1d5e7f2a3b40');

-- The setup both runs share: a scope type with a field and two scopes, made through the doors as they stand.
do $setup$
declare f jsonb := (select jsonb_object_agg(k, v) from w2q_fx); o uuid := (f->>'workspace')::uuid; tp uuid; lead uuid; ret uuid; bal uuid;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', f->>'admin', 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  tp := (custom.context_type_write(o, null, '{"label_singular":"Clinic Program","label_plural":"Clinic Programs","slug":"clinic-programs"}') -> 'row' ->> 'id')::uuid;
  lead := (custom.context_item_write(null, tp, '{"key":"program_lead","display_name":"Program lead","value_type":"string"}') -> 'row' ->> 'id')::uuid;
  ret := (custom.context_scope_write(o, null, tp, '{"name":"Return-to-sport","slug":"return-to-sport"}') -> 'row' ->> 'id')::uuid;
  bal := (custom.context_scope_write(o, null, tp, '{"name":"Balance clinic","slug":"balance-clinic"}') -> 'row' ->> 'id')::uuid;
  perform set_config('role', 'none', true);
  insert into w2q_fx values ('tp', tp), ('lead', lead), ('ret', ret), ('bal', bal);
  insert into rag.context_item_suggestions (id, user_id, organization_id, scope_type_id, suggested_key, display_name, rationale, confidence, status)
  values ((f->>'sugg_item')::uuid, (f->>'admin')::uuid, o, tp, 'insurance_contact', 'Insurance contact',
          'Four intake notes name the payer contact for the program.', 0.77, 'pending');
  insert into rag.scope_suggestions (id, user_id, organization_id, source_kind, source_id, scope_type_id, scope_type_label, suggested_name,
                                     suggested_slot_values, reasoning, confidence)
  values ((f->>'sugg_scope')::uuid, (f->>'admin')::uuid, o, 'note', o, tp, 'Clinic Program', 'Pediatric gait lab',
          '{"program_lead":"Dr. Ana Ruiz, DPT"}'::jsonb, 'Two notes describe a gait lab for children.', 0.71);
end $setup$;

\i scripts/campaign-tests/_scopesw2w_side_effects.sql

-- The effect of one case: for every store row the case made or touched in the two organizations, its image row,
-- its store Record and its side effects; ids the case made are named by their order, the join code by <code>.
create or replace function pg_temp.w2q_effect(p_ids uuid[]) returns text language sql as $e$
  select coalesce(jsonb_agg(jsonb_build_object(
           'image_scope', (select to_jsonb(sc) - 'id' from context.scopes sc where sc.id = r.id),
           'image_type', (select to_jsonb(st) - 'id' from context.scope_types st where st.id = r.id),
           'image_item', (select to_jsonb(ci) - 'id' from context.context_items ci where ci.id = r.id),
           'image_values', (select jsonb_agg(to_jsonb(v) - 'id' - 'created_at' order by v.context_item_id, v.version)
                              from context.context_item_values v where v.scope_id = r.id),
           'store', jsonb_build_object('version', r.version, 'data', r.data, 'created_by', r.created_by,
                                       'archived', r.deleted_at is not null, 'class', r.data_class, 'table_id', r.table_id),
           'side_effects', pg_temp.w2w_side_effects(r.organization_id, r.id, coalesce(
                             case when r.data_class = 'table' then r.id
                                  when r.data_class = 'field' then (r.data ->> 'entity_definition_id')::uuid end, r.table_id)))
           order by r.data_class, r.data ->> 'key', r.data ->> 'name', r.data ->> 'label_singular'), '[]'::jsonb)::text
    from custom.record r where r.id = any (p_ids) and r.data_class in ('record', 'table', 'field')
$e$;

create or replace function pg_temp.w2q_run(p_body text) returns void language plpgsql as $run$
declare
  f jsonb := (select jsonb_object_agg(k, v) from w2q_fx);
  c record; v_out jsonb; v_state text; v_msg text; v_eff text; v_ans text; v_ids uuid[]; v_new text[]; v_i int;
  v_flds text[]; v_j int;
begin
  for c in
    select * from (values
      ('admin', 'admin', 'S1 the scope tool adds and renames a field', 'apply',
         '[{"op":"upsert_context_item","scope_type_key":"clinic-programs","key":"intake_coordinator","display_name":"Intake coordinator","value_type":"string"},
           {"op":"upsert_context_item","scope_type_key":"clinic-programs","key":"program_lead","display_name":"Program director"}]'::jsonb),
      ('admin', 'admin', 'S2 the scope tool sets a value', 'apply',
         '[{"op":"set_value","scope_type_key":"clinic-programs","scope_key":"return-to-sport","item_key":"program_lead","value":"Dr. Jonah Reyes, DPT"}]'::jsonb),
      ('admin', 'admin', 'S3 the scope tool retires a program and a field', 'apply',
         '[{"op":"archive_scope","scope_type_key":"clinic-programs","key":"balance-clinic"},
           {"op":"archive_context_item","scope_type_key":"clinic-programs","key":"program_lead"}]'::jsonb),
      ('admin', 'admin', 'S4 the scope tool retires the type', 'apply',
         '[{"op":"archive_scope_type","key":"clinic-programs"}]'::jsonb),
      ('test',  'test',  'S5 a member who is no admin is refused', 'apply_test',
         '[{"op":"archive_scope","scope_type_key":"clinic-programs","key":"balance-clinic"}]'::jsonb),
      ('admin', 'admin', 'G1 accept a suggested field', 'accept_item', null::jsonb),
      ('admin', 'admin', 'G2 accept a suggested scope with a slot value', 'accept_scope', null::jsonb),
      ('admin', 'admin', 'T1 archive a program, then restore it from the trash', 'trash_scope', null::jsonb),
      ('admin', 'admin', 'T2 retire the type, then restore it from the trash', 'trash_type', null::jsonb),
      ('admin', 'admin', 'T3 retire a field, then restore it from the trash', 'trash_item', null::jsonb)
    ) t(seat, who, name, act, ops)
  loop
    v_out := null; v_state := null; v_msg := null; v_eff := null; v_ans := null;
    begin
      perform set_config('request.jwt.claims', jsonb_build_object('sub', f ->> c.who, 'role', 'authenticated')::text, true);
      perform set_config('role', 'authenticated', true);
      -- one statement per writer (a CASE expression would ask EXECUTE on every writer it names). The suggestion
      -- writer has no client EXECUTE: the server calls it, so it runs in the server's seat with the person named.
      if c.act in ('apply', 'apply_test') then
        v_out := public.scope_system_apply((f->>'workspace')::uuid, c.ops);
      elsif c.act = 'accept_item' then
        perform set_config('role', 'none', true);
        v_out := public.accept_context_item_suggestion((f->>'sugg_item')::uuid);
      elsif c.act = 'accept_scope' then
        v_out := public.accept_scope_suggestion((f->>'sugg_scope')::uuid, null);
      elsif c.act = 'trash_scope' then
        v_out := jsonb_build_object('archive', custom.context_scope_archive((f->>'bal')::uuid),
                                    'restore', to_jsonb(public.entity_undelete('scope', (f->>'bal')::uuid)));
      elsif c.act = 'trash_type' then
        v_out := jsonb_build_object('archive', custom.context_type_archive((f->>'tp')::uuid),
                                    'restore', to_jsonb(public.entity_undelete('scope_type', (f->>'tp')::uuid)));
      else
        v_out := jsonb_build_object('archive', custom.context_item_archive((f->>'lead')::uuid),
                                    'restore', to_jsonb(public.entity_undelete('context_item', (f->>'lead')::uuid)));
      end if;
      perform set_config('role', 'none', true);
      -- every store row this case made or changed in the two organizations
      select coalesce(array_agg(r.id), '{}') into v_ids from custom.record r
       where r.organization_id = (f->>'workspace')::uuid
         and (r.updated_at >= now() or r.created_at >= now()) and r.data_class in ('record', 'table', 'field')
         and (r.data ->> 'kept_for' = 'context'
              or exists (select 1 from custom.record t where t.organization_id = r.organization_id and t.id = r.table_id
                           and t.data ->> 'kept_for' = 'context')
              or (r.data_class = 'field' and r.metadata -> 'moved_from' ->> 'table' = 'context.context_items'));
      v_eff := pg_temp.w2q_effect(v_ids);
      v_ans := v_out::text;
      select coalesce(array_agg(r.id::text order by r.data_class, r.data ->> 'key', r.data ->> 'name', r.data ->> 'label_singular'), '{}') into v_new
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
      -- every Field of a Table this case made (its column and settings Fields, ids derived from the Table's)
      for v_i in 1 .. coalesce(array_length(v_new, 1), 0) loop
        select coalesce(array_agg(fd.id::text || chr(31) || coalesce(fd.data ->> 'key', '')), '{}') into v_flds
          from custom.record fd where fd.table_id = custom.field_kernel_id() and fd.data ->> 'entity_definition_id' = v_new[v_i];
        for v_j in 1 .. coalesce(array_length(v_flds, 1), 0) loop
          v_eff := replace(v_eff, split_part(v_flds[v_j], chr(31), 1), '<field-' || v_i || '-' || split_part(v_flds[v_j], chr(31), 2) || '>');
        end loop;
      end loop;
      -- a value row this case made has a random id in either run
      for v_i in 1 .. 1 loop
        select coalesce(array_agg(v.id::text order by v.context_item_id, v.version), '{}') into v_flds
          from context.context_item_values v
         where v.created_at >= now() and v.scope_id in (select r.id from custom.record r where r.id = any (v_ids));
        for v_j in 1 .. coalesce(array_length(v_flds, 1), 0) loop
          v_eff := replace(v_eff, v_flds[v_j], '<value-' || v_j || '>');
          v_ans := replace(v_ans, v_flds[v_j], '<value-' || v_j || '>');
        end loop;
      end loop;
      raise exception using errcode = 'P0W2P', message = 'rolled back';
    exception
      when sqlstate 'P0W2P' then null;
      when others then get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    end;
    perform set_config('role', 'none', true);
    insert into w2q_res values (p_body, c.seat, c.name, v_state is null, v_state, v_msg, v_ans, v_eff);
  end loop;
end
$run$;

-- OLD = the bodies before the three round-3 files (their inverses); NEW = the files.
select position('LANE 9 W2-W' in pg_get_functiondef('custom.context_scope_archive(uuid)'::regprocedure)) > 0 as a_live \gset
\if :a_live
\i migrations/inverse/scopesw2w_the_archive_and_restore_doors_write_the_store_first_down.sql
\endif
select position('LANE 9 W2-W' in pg_get_functiondef('custom.context_item_write(uuid,uuid,jsonb)'::regprocedure)) > 0 as i_live \gset
\if :i_live
\i migrations/inverse/scopesw2w_the_context_field_doors_write_the_store_first_down.sql
\endif
select position('LANE 9 W2-W' in pg_get_functiondef('custom._ctx_value_write_store(jsonb)'::regprocedure)) > 0 as v_live \gset
\if :v_live
\i migrations/inverse/scopesw2w_the_value_door_decides_on_the_store_down.sql
\endif
select pg_temp.w2q_run('old');
\i migrations/campaign/scopesw2w_the_archive_and_restore_doors_write_the_store_first.sql
\i migrations/campaign/scopesw2w_the_context_field_doors_write_the_store_first.sql
\i migrations/campaign/scopesw2w_the_value_door_decides_on_the_store.sql
select pg_temp.w2q_run('new');

do $cmp$
declare r record; v_fails text[] := '{}'; v_n int := 0;
begin
  for r in
    select o.seat, o.name, o.ok o_ok, n.ok n_ok, o.state o_state, n.state n_state, o.msg o_msg, n.msg n_msg,
           o.answer o_ans, n.answer n_ans, o.effect o_eff, n.effect n_eff
      from w2q_res o join w2q_res n on n.body = 'new' and n.seat = o.seat and n.name = o.name
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
  if v_n = 0 or (select count(*) from w2q_res where body = 'new' and ok) = 0 then
    v_fails := v_fails || 'PAIRS RED: no accepted case compared'::text;
  end if;
  if array_length(v_fails, 1) > 0 then
    raise exception E'scopesw2w round-3 platform writers: % difference(s):\n%', array_length(v_fails, 1), array_to_string(v_fails, E'\n');
  end if;
  raise notice 'scopesw2w round-3 platform writers: SAME answer and effect over % cases', v_n;
end $cmp$;
rollback;
\echo 'scopesw2w_the_platform_writers_through_the_store_first_doors_same_answer: PASS'
