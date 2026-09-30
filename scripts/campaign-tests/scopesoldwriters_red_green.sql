-- scripts/campaign-tests/scopesoldwriters_red_green.sql — lane SCOPES-OLD-WRITERS (L11, SCOPES-CUTOVER-PLAN 3.1).
--
-- RED-THEN-GREEN AND A SHADOW COMPARE, ON THE DEV CLONE ONLY, IN ONE TRANSACTION THAT ROLLS BACK.
--
--   psql "<clone>" -v up=<abs path of the campaign file> -v down=<abs path of its inverse> -f scopesoldwriters_red_green.sql
--
-- What it proves, with the file's own bodies (the up is applied INSIDE this transaction):
--   F1 the catalogue: the five writers (S6 scope_system_apply, S7 accept_*_suggestion, S8 edu_class_join_code /
--      edu_class_set_access) write context.* themselves BEFORE (5) and none does AFTER (0).
--   F2 the doors no longer need the old functions' client grant: with EXECUTE on public.create_scope taken from
--      `authenticated` for this transaction, a signed-in owner's custom.context_scope_write is REFUSED before (42501)
--      and LANDS after.
--   F3 the shadow compare: every writer is run as the same person on the same data before and after, and what it
--      leaves in context.* (and whether the store holds each row) is compared as JSON, ids and clocks set aside.
--      S6: one batch of every operation (type / item / scope upserts both ways, a parent moved, a limit cleared,
--      a custom component, a value, three archives). S7: a suggestion into an existing type with two seeded
--      values, a suggestion that makes its own type, a field suggestion. S8: join code rotate → disable, access
--      mode paid. Refusals: a member (not an admin) calling S6, and a non-owner calling S8, answer the same
--      error before and after.
--   F4 the inverse puts every body back (hashes equal the pre-file bodies).
--   A planted divergence (RED of the compare itself): one scope's name changed after the NEW run must make the
--      compare fail, or the compare proves nothing.
--
-- Identities are admin@admin.com (owner of admin's Workspace) and test@test.com (a member there), the platform's
-- test accounts. Nothing survives the final ROLLBACK.

\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned

begin;
set local lock_timeout = '15s';
set local statement_timeout = '120s';

do $$ begin
  if (select count(*) from cron.job where active) > 0 then
    raise exception 'scopesoldwriters_red_green runs on the dev clone only (this database has active cron jobs)';
  end if;
end $$;

\set W '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f'
\set ADMIN '87a6e699-3622-4869-8843-d0867456c0dd'
\set MEMBER '4060701e-706a-4c76-b3ca-0bbc69fa5a14'
\set PET '2f4c0d35-a510-4e38-b2b7-fbea0ff6afe0'
\set CLASS 'e8a6ba36-9a4f-4fc2-a2fb-60a4cddeddc0'

create temp table l11_result(check_name text primary key, ok boolean, detail text) on commit drop;
grant all on l11_result to authenticated;

-- ── the normalizer: what a writer left behind, ids and clocks set aside ────────────────────────
create function pg_temp.l11_strip(j jsonb) returns jsonb language sql immutable as $$
  select coalesce(j, 'null'::jsonb) - array['id','created_at','updated_at','version','status_updated_at','scope_type_id',
                                            'parent_type_id','parent_scope_id','context_item_id','scope_id','search_vector',
                                            'published_to_web_at','deleted_at','next_review_date','last_reviewed_at']
$$;
create function pg_temp.l11_snapshot(p_org uuid) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'types', (select coalesce(jsonb_agg(pg_temp.l11_strip(to_jsonb(t)) || jsonb_build_object(
                'parent', (select p.slug from context.scope_types p where p.id = t.parent_type_id),
                'archived', t.deleted_at is not null,
                'in_store', exists (select 1 from custom.record r where r.organization_id = p_org and r.id = t.id
                                      and (r.deleted_at is not null) = (t.deleted_at is not null))) order by t.slug), '[]')
                from context.scope_types t where t.organization_id = p_org and (t.slug like 'l11probe%' or t.label_singular like 'L11 probe%')),
    'items', (select coalesce(jsonb_agg(pg_temp.l11_strip(to_jsonb(i)) || jsonb_build_object(
                'type', t.slug, 'archived', i.deleted_at is not null,
                'in_store', exists (select 1 from custom.record r where r.organization_id = p_org and r.id = i.id
                                      and (r.deleted_at is not null) = (i.deleted_at is not null))) order by t.slug, i.key), '[]')
                from context.context_items i join context.scope_types t on t.id = i.scope_type_id
               where t.organization_id = p_org and (t.slug like 'l11probe%' or i.key like 'l11probe%')),
    'scopes', (select coalesce(jsonb_agg(pg_temp.l11_strip(to_jsonb(s)) - 'sort_order' || jsonb_build_object(
                'type', t.slug, 'parent', (select p.slug from context.scopes p where p.id = s.parent_scope_id),
                'archived', s.deleted_at is not null,
                'in_store', exists (select 1 from custom.record r where r.organization_id = p_org and r.id = s.id
                                      and (r.deleted_at is not null) = (s.deleted_at is not null))) order by s.slug), '[]')
                from context.scopes s join context.scope_types t on t.id = s.scope_type_id
               where s.organization_id = p_org and (s.slug like 'l11probe%' or s.name like 'L11 probe%')),
    'values', (select coalesce(jsonb_agg(pg_temp.l11_strip(to_jsonb(v)) || jsonb_build_object('scope', s.slug, 'item', i.key)
                order by s.slug, i.key, v.version), '[]')
                from context.context_item_values v join context.scopes s on s.id = v.scope_id
                join context.context_items i on i.id = v.context_item_id
               where s.organization_id = p_org and (s.slug like 'l11probe%' or s.name like 'L11 probe%')),
    'class', (select jsonb_build_object('access_mode', s.settings ->> 'access_mode',
                                        'join_code_len', length(s.settings ->> 'join_code'),
                                        'keys', (select jsonb_agg(k order by k) from jsonb_object_keys(s.settings) k),
                                        'store_access_mode', (select custom._ctx_scope_settings(r.organization_id, r.table_id, r.data) ->> 'access_mode'
                                                                from custom.record r where r.id = s.id),
                                        'store_has_join_code', (select custom._ctx_scope_settings(r.organization_id, r.table_id, r.data) ? 'join_code'
                                                                  from custom.record r where r.id = s.id),
                                        'updated_by', s.updated_by)
                from context.scopes s where s.id = 'e8a6ba36-9a4f-4fc2-a2fb-60a4cddeddc0'),
    'suggestions', (select coalesce(jsonb_agg(jsonb_build_object('name', x.suggested_name, 'status', x.status) order by x.suggested_name), '[]')
                      from rag.scope_suggestions x where x.suggested_name like 'L11 probe%'),
    'item_suggestions', (select coalesce(jsonb_agg(jsonb_build_object('key', x.suggested_key, 'status', x.status) order by x.suggested_key), '[]')
                           from rag.context_item_suggestions x where x.suggested_key like 'l11probe%'))
$$;
grant execute on function pg_temp.l11_strip(jsonb) to authenticated;
grant execute on function pg_temp.l11_snapshot(uuid) to authenticated;

-- A receipt without its ids (S6 hands back {op, id, record}).
create function pg_temp.l11_receipt(r jsonb) returns jsonb language sql immutable as $$
  select jsonb_build_object('applied', r -> 'applied', 'results',
    (select jsonb_agg(jsonb_build_object('op', e ->> 'op', 'record',
             case when (e -> 'record') ? 'archived' then (e -> 'record') - 'id'
                  else pg_temp.l11_strip(e -> 'record') - 'sort_order' end) order by n)
       from jsonb_array_elements(r -> 'results') with ordinality as a(e, n)))
$$;

-- The S6 batch: every operation the tool has, keyed so the two runs name the same rows.
\set BATCH '[{"op":"upsert_scope_type","key":"l11probe-matters","label_singular":"Matter","label_plural":"Matters","icon":"briefcase","max_assignments":"2"},{"op":"upsert_scope_type","key":"l11probe-practice","label_singular":"Practice area","description":"Where a matter sits"},{"op":"upsert_scope_type","key":"l11probe-matters","label_plural":"Open matters","max_assignments":""},{"op":"upsert_context_item","scope_type_key":"l11probe-matters","key":"l11probe_court","display_name":"Court","value_type":"string","custom_component":{"name":"CourtPicker"}},{"op":"upsert_context_item","scope_type_key":"l11probe-matters","key":"l11probe_court","display_name":"Court of record","max_items":3},{"op":"upsert_context_item","scope_type_key":"l11probe-matters","key":"l11probe_filed","display_name":"Filed on","value_type":"date"},{"op":"upsert_scope","scope_type_key":"l11probe-practice","key":"l11probe-injury","name":"Personal injury"},{"op":"upsert_scope","scope_type_key":"l11probe-practice","key":"l11probe-employment","name":"Employment"},{"op":"upsert_scope","scope_type_key":"l11probe-practice","key":"l11probe-auto","name":"Auto collisions","parent_key":"l11probe-injury"},{"op":"upsert_scope","scope_type_key":"l11probe-practice","key":"l11probe-auto","name":"Vehicle collisions","parent_key":"l11probe-employment"},{"op":"upsert_scope","scope_type_key":"l11probe-matters","key":"l11probe-reyes","name":"Reyes v. Pinnacle","settings":{"court_level":"superior"}},{"op":"upsert_scope","scope_type_key":"l11probe-matters","key":"l11probe-reyes","name":"Reyes v. Pinnacle Freight","description":"Rear-end collision on I-5"},{"op":"set_value","scope_key":"l11probe-reyes","item_key":"l11probe_court","value":"Los Angeles Superior Court","change_summary":"Filed"},{"op":"set_value","scope_key":"l11probe-reyes","item_key":"l11probe_filed","value":"2026-03-14"},{"op":"upsert_scope","scope_type_key":"l11probe-matters","key":"l11probe-okafor","name":"Okafor v. Lumen"},{"op":"archive_scope","key":"l11probe-okafor"},{"op":"archive_context_item","scope_type_key":"l11probe-matters","key":"l11probe_filed"},{"op":"upsert_scope_type","key":"l11probe-retired","label_singular":"Retired kind"},{"op":"upsert_scope_type","key":"l11probe-retired","parent_key":"l11probe-practice"},{"op":"archive_scope_type","key":"l11probe-retired"}]'

-- The suggestions S7 accepts (made by the server's sweep in real life; planted here as that row).
create function pg_temp.l11_plant_suggestions() returns void language sql as $$
  insert into rag.scope_suggestions (id, user_id, organization_id, source_kind, source_id, scope_type_id, scope_type_label,
                                     suggested_name, suggested_slot_values, status)
  values ('11111111-1111-4111-8111-000000000001', '87a6e699-3622-4869-8843-d0867456c0dd', '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f',
          'note', 'l11-probe-note-1', '2f4c0d35-a510-4e38-b2b7-fbea0ff6afe0', 'Pet', 'L11 probe Biscuit',
          '{"species":"Dog","breed":"Border Collie","l11_no_such_field":"ignored"}', 'pending'),
         ('11111111-1111-4111-8111-000000000002', '87a6e699-3622-4869-8843-d0867456c0dd', '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f',
          'note', 'l11-probe-note-2', null, 'L11 probe Vendor', 'L11 probe Acme Fasteners', '{}', 'pending');
  insert into rag.context_item_suggestions (id, user_id, organization_id, scope_type_id, suggested_key, display_name, rationale, status)
  values ('11111111-1111-4111-8111-000000000003', '87a6e699-3622-4869-8843-d0867456c0dd', '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f',
          '2f4c0d35-a510-4e38-b2b7-fbea0ff6afe0', 'l11probe_insurer', 'Pet insurer', 'Named in three vet invoices', 'pending');
$$;

-- ═══ F1 BEFORE: the catalogue names the five writers ═══════════════════════════════════════════
select count(*) as n_before from pg_proc p
 where p.oid in ('public.scope_system_apply(uuid,jsonb)'::regprocedure, 'public.accept_scope_suggestion(uuid,uuid)'::regprocedure,
                 'public.accept_context_item_suggestion(uuid)'::regprocedure, 'public.edu_class_join_code(uuid,text)'::regprocedure,
                 'public.edu_class_set_access(uuid,text)'::regprocedure)
   and p.prosrc ~* '(insert\s+into|update|delete\s+from)\s+(context\.)?(scope_types|scopes|context_items|context_item_values)\M' \gset
insert into l11_result values ('F1 red: the five old writers write context.* themselves', :n_before = 5, 'before: ' || :n_before);

create temp table l11_bodies_before on commit drop as
select p.oid::regprocedure::text as fn, p.prosecdef, encode(sha256(convert_to(pg_get_functiondef(p.oid), 'utf8')), 'hex') as h
  from pg_proc p where p.proname in ('context_type_write','context_scope_write','context_item_write','scope_system_apply',
    'accept_scope_suggestion','accept_context_item_suggestion','edu_class_join_code','edu_class_set_access','context_type_archive',
    'context_type_restore','context_scope_archive','context_scope_restore','context_item_archive','context_item_restore','context_tags_set');

-- ═══ F2 BEFORE: an invoker door dies without the old function's client grant ═══════════════════
savepoint f2;
revoke execute on function public.create_scope(uuid, uuid, text, uuid, text, jsonb, text, smallint) from authenticated;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'ADMIN', 'role', 'authenticated')::text, true) \gset
\set ON_ERROR_STOP 0
select custom.context_scope_write(:'W', null, :'PET', '{"name":"L11 probe Pepper"}') is not null as f2_before_landed \gset f2b_
\set ON_ERROR_STOP 1
rollback to savepoint f2;
insert into l11_result values ('F2 red: without EXECUTE on create_scope the invoker door is refused', :{?f2b_f2_before_landed} is false, 'landed variable set: ' || :{?f2b_f2_before_landed});

-- ═══ F3 OLD RUN ═══════════════════════════════════════════════════════════════════════════════
savepoint old_run;
select pg_temp.l11_plant_suggestions();
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'ADMIN', 'role', 'authenticated')::text, true) \gset
select pg_temp.l11_receipt(public.scope_system_apply(:'W', :'BATCH'::jsonb))::text as old_receipt \gset
select public.accept_scope_suggestion('11111111-1111-4111-8111-000000000001')::text as old_s7a \gset
select public.accept_scope_suggestion('11111111-1111-4111-8111-000000000002')::text as old_s7b \gset
reset role;
set local role service_role;
select set_config('request.jwt.claims', json_build_object('sub', :'ADMIN', 'role', 'service_role')::text, true) \gset
select public.accept_context_item_suggestion('11111111-1111-4111-8111-000000000003')::text as old_s7c \gset
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'ADMIN', 'role', 'authenticated')::text, true) \gset
select (public.edu_class_join_code(:'CLASS', 'rotate') ->> 'code') is not null as old_rotated \gset
select public.edu_class_set_access(:'CLASS', 'paid')::text as old_s8b \gset
reset role;
select pg_temp.l11_snapshot(:'W')::text as old_snap_mid \gset
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'ADMIN', 'role', 'authenticated')::text, true) \gset
select public.edu_class_join_code(:'CLASS', 'disable')::text as old_s8c \gset
reset role;
select pg_temp.l11_snapshot(:'W')::text as old_snap \gset
-- refusals, old
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'MEMBER', 'role', 'authenticated')::text, true) \gset
\set ON_ERROR_STOP 0
savepoint r1;
select public.scope_system_apply(:'W', '[{"op":"upsert_scope_type","key":"l11probe-x","label_singular":"X"}]');
\set old_r1 :LAST_ERROR_SQLSTATE '|' :LAST_ERROR_MESSAGE
rollback to savepoint r1;
savepoint r2;
select public.edu_class_set_access(:'CLASS', 'open');
\set old_r2 :LAST_ERROR_SQLSTATE '|' :LAST_ERROR_MESSAGE
rollback to savepoint r2;
savepoint r2b;
select custom.context_scope_archive((select s.id from context.scopes s where s.organization_id = :'W' and s.deleted_at is null order by s.id limit 1));
\set old_r3 :LAST_ERROR_SQLSTATE '|' :LAST_ERROR_MESSAGE
rollback to savepoint r2b;
savepoint r2c;
select custom.context_item_write((select i.id from context.context_items i join context.scope_types t on t.id = i.scope_type_id where t.organization_id = :'W' and i.deleted_at is null order by i.id limit 1), null, '{"max_items":5}');
\set old_r4 :LAST_ERROR_SQLSTATE '|' :LAST_ERROR_MESSAGE
rollback to savepoint r2c;
\set ON_ERROR_STOP 1
reset role;
rollback to savepoint old_run;

-- ═══ APPLY THE FILE (inside this transaction) ═════════════════════════════════════════════════
\i :up
-- the register's deferred guards (door_body_must_decide, provision_shape_guard) judge now, not at a commit that never comes
set constraints all immediate;
set constraints all deferred;

-- ═══ F1 AFTER ══════════════════════════════════════════════════════════════════════════════════
select count(*) as n_after from pg_proc p
 where p.oid in ('public.scope_system_apply(uuid,jsonb)'::regprocedure, 'public.accept_scope_suggestion(uuid,uuid)'::regprocedure,
                 'public.accept_context_item_suggestion(uuid)'::regprocedure, 'public.edu_class_join_code(uuid,text)'::regprocedure,
                 'public.edu_class_set_access(uuid,text)'::regprocedure)
   and p.prosrc ~* '(insert\s+into|update|delete\s+from)\s+(context\.)?(scope_types|scopes|context_items|context_item_values)\M' \gset
insert into l11_result values ('F1 green: none of the five writes context.* itself', :n_after = 0, 'after: ' || :n_after);

-- ═══ F2 AFTER ══════════════════════════════════════════════════════════════════════════════════
savepoint f2a;
revoke execute on function public.create_scope(uuid, uuid, text, uuid, text, jsonb, text, smallint) from authenticated;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'ADMIN', 'role', 'authenticated')::text, true) \gset
select (custom.context_scope_write(:'W', null, :'PET', '{"name":"L11 probe Pepper"}') ->> 'ok')::boolean as f2_after_landed \gset
reset role;
rollback to savepoint f2a;
insert into l11_result values ('F2 green: the definer door lands without EXECUTE on create_scope', :'f2_after_landed'::boolean, 'ok = ' || :'f2_after_landed');

-- ═══ F3 NEW RUN ═══════════════════════════════════════════════════════════════════════════════
savepoint new_run;
select pg_temp.l11_plant_suggestions();
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'ADMIN', 'role', 'authenticated')::text, true) \gset
select pg_temp.l11_receipt(public.scope_system_apply(:'W', :'BATCH'::jsonb))::text as new_receipt \gset
select public.accept_scope_suggestion('11111111-1111-4111-8111-000000000001')::text as new_s7a \gset
select public.accept_scope_suggestion('11111111-1111-4111-8111-000000000002')::text as new_s7b \gset
reset role;
set local role service_role;
select set_config('request.jwt.claims', json_build_object('sub', :'ADMIN', 'role', 'service_role')::text, true) \gset
select public.accept_context_item_suggestion('11111111-1111-4111-8111-000000000003')::text as new_s7c \gset
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'ADMIN', 'role', 'authenticated')::text, true) \gset
select (public.edu_class_join_code(:'CLASS', 'rotate') ->> 'code') is not null as new_rotated \gset
select public.edu_class_set_access(:'CLASS', 'paid')::text as new_s8b \gset
reset role;
select pg_temp.l11_snapshot(:'W')::text as new_snap_mid \gset
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'ADMIN', 'role', 'authenticated')::text, true) \gset
select public.edu_class_join_code(:'CLASS', 'disable')::text as new_s8c \gset
reset role;
select pg_temp.l11_snapshot(:'W')::text as new_snap \gset
-- the compare's own RED: a planted divergence must be seen
update context.scopes set name = name || ' (planted)' where organization_id = :'W' and slug = 'l11probe-reyes';
select pg_temp.l11_snapshot(:'W')::text as planted_snap \gset
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'MEMBER', 'role', 'authenticated')::text, true) \gset
\set ON_ERROR_STOP 0
savepoint r1n;
select public.scope_system_apply(:'W', '[{"op":"upsert_scope_type","key":"l11probe-x","label_singular":"X"}]');
\set new_r1 :LAST_ERROR_SQLSTATE '|' :LAST_ERROR_MESSAGE
rollback to savepoint r1n;
savepoint r2n;
select public.edu_class_set_access(:'CLASS', 'open');
\set new_r2 :LAST_ERROR_SQLSTATE '|' :LAST_ERROR_MESSAGE
rollback to savepoint r2n;
savepoint r2nb;
select custom.context_scope_archive((select s.id from context.scopes s where s.organization_id = :'W' and s.deleted_at is null order by s.id limit 1));
\set new_r3 :LAST_ERROR_SQLSTATE '|' :LAST_ERROR_MESSAGE
rollback to savepoint r2nb;
savepoint r2nc;
select custom.context_item_write((select i.id from context.context_items i join context.scope_types t on t.id = i.scope_type_id where t.organization_id = :'W' and i.deleted_at is null order by i.id limit 1), null, '{"max_items":5}');
\set new_r4 :LAST_ERROR_SQLSTATE '|' :LAST_ERROR_MESSAGE
rollback to savepoint r2nc;
\set ON_ERROR_STOP 1
reset role;
rollback to savepoint new_run;

-- ═══ F3 VERDICTS ═════════════════════════════════════════════════════════════════════════════
insert into l11_result values
  ('F3 S6 receipt equal', :'old_receipt'::jsonb = :'new_receipt'::jsonb, case when :'old_receipt'::jsonb = :'new_receipt'::jsonb then 'equal' else 'OLD ' || :'old_receipt' || E'\nNEW ' || :'new_receipt' end),
  ('F3 S6+S7 rows and store equal (types, items, scopes, values, suggestions)',
     (:'old_snap'::jsonb - 'class') = (:'new_snap'::jsonb - 'class'),
     case when (:'old_snap'::jsonb - 'class') = (:'new_snap'::jsonb - 'class') then 'equal' else 'OLD ' || :'old_snap' || E'\nNEW ' || :'new_snap' end),
  ('F3 S8 class after rotate + paid equal', (:'old_snap_mid'::jsonb -> 'class') = (:'new_snap_mid'::jsonb -> 'class'),
     (:'old_snap_mid'::jsonb -> 'class')::text || ' vs ' || (:'new_snap_mid'::jsonb -> 'class')::text),
  ('F3 S8 class after disable equal', (:'old_snap'::jsonb -> 'class') = (:'new_snap'::jsonb -> 'class'),
     (:'old_snap'::jsonb -> 'class')::text || ' vs ' || (:'new_snap'::jsonb -> 'class')::text),
  ('F3 S7 answers equal', (:'old_s7a'::jsonb #- '{data,scope_id}') = (:'new_s7a'::jsonb #- '{data,scope_id}')
                            and (:'old_s7b'::jsonb #- '{data,scope_id}' #- '{data,scope_type_id}') = (:'new_s7b'::jsonb #- '{data,scope_id}' #- '{data,scope_type_id}')
                            and (:'old_s7c'::jsonb #- '{data,context_item_id}') = (:'new_s7c'::jsonb #- '{data,context_item_id}'),
     :'old_s7a' || ' | ' || :'new_s7a' || ' | ' || :'old_s7b' || ' | ' || :'new_s7b' || ' | ' || :'old_s7c' || ' | ' || :'new_s7c'),
  ('F3 S8 answers equal', :'old_rotated'::boolean and :'new_rotated'::boolean and :'old_s8b'::jsonb = :'new_s8b'::jsonb and :'old_s8c'::jsonb = :'new_s8c'::jsonb,
     :'old_s8b' || ' ' || :'new_s8b' || ' ' || :'old_s8c' || ' ' || :'new_s8c'),
  ('F3 refusal: a member calling S6 hears the same', :'old_r1' = :'new_r1', :'old_r1' || ' | ' || :'new_r1'),
  ('F3 refusal: a non-owner calling S8 hears the same', :'old_r2' = :'new_r2', :'old_r2' || ' | ' || :'new_r2'),
  ('F3 refusal: a member (not an admin) archiving a scope through the door hears the same', :'old_r3' = :'new_r3' and :'old_r3' like '42501|%', :'old_r3' || ' | ' || :'new_r3'),
  ('F3 refusal: a member changing a field''s columns through the door hears the same', :'old_r4' = :'new_r4' and :'old_r4' like '42501|%', :'old_r4' || ' | ' || :'new_r4'),
  ('F3 the compare saw real rows (types, items, scopes, values, suggestions accepted)',
     jsonb_array_length(:'new_snap'::jsonb -> 'types') >= 4 and jsonb_array_length(:'new_snap'::jsonb -> 'items') >= 3
     and jsonb_array_length(:'new_snap'::jsonb -> 'scopes') >= 7 and jsonb_array_length(:'new_snap'::jsonb -> 'values') >= 4
     and (select bool_and(x ->> 'status' = 'accepted') from jsonb_array_elements(:'new_snap'::jsonb -> 'suggestions') x),
     format('types %s, items %s, scopes %s, values %s, suggestions %s', jsonb_array_length(:'new_snap'::jsonb -> 'types'),
            jsonb_array_length(:'new_snap'::jsonb -> 'items'), jsonb_array_length(:'new_snap'::jsonb -> 'scopes'),
            jsonb_array_length(:'new_snap'::jsonb -> 'values'), :'new_snap'::jsonb -> 'suggestions')),
  ('F3 red: a planted divergence is caught', (:'planted_snap'::jsonb - 'class') <> (:'new_snap'::jsonb - 'class'), 'planted differs');

-- ═══ F4 THE INVERSE ═══════════════════════════════════════════════════════════════════════════
\i :down
-- the register's deferred guards (door_body_must_decide, provision_shape_guard) judge now, not at a commit that never comes
set constraints all immediate;
set constraints all deferred;
insert into l11_result
select 'F4 the inverse puts every body and security back', count(*) = 0, coalesce(string_agg(b.fn, ', '), 'every body equal')
  from l11_bodies_before b
  join pg_proc p on p.oid::regprocedure::text = b.fn
 where b.h <> encode(sha256(convert_to(pg_get_functiondef(p.oid), 'utf8')), 'hex') or b.prosecdef <> p.prosecdef;

\pset tuples_only off
\pset format aligned
select case when ok then 'GREEN' else 'RED  ' end as verdict, check_name, left(detail, 3000) as detail from l11_result order by check_name;
select case when bool_and(ok) then 'ALL GREEN' else 'SOMETHING IS RED' end as suite from l11_result;
rollback;
