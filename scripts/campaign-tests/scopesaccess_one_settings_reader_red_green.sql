-- LANE SCOPES-READS-ACCESS — ONE READER OF A SCOPE'S SETTINGS (chair ruling 2026-09-29 (4)), measured on the dev clone,
-- rolled back.
--
-- A class's settings ("Fall 2026", "Ms. Okafor", its exam dates, its price) were rebuilt from the store in four places:
-- this lane's custom._ctx_scope_settings, L6's custom.scope_rows_of (+ custom.scope_setting_back), and L10's
-- custom.context_tree / custom.context_scopes / custom.context_class_for_checkout — and L10's three did not read a list
-- of objects back (the exam dates came back as JSON text). After scopesaccess_one_reader_of_a_scopes_settings.sql all of
-- them call one reader.
--
--   S1  L6's scope rows are byte-identical before and after, for every organization          (the move changes nothing)
--   S2  L6's value decode (custom.scope_setting_back) answers the same for every value of every scope Record
--   S3  L10's class checkout hands back exactly the old context.scopes.settings for every scope    ← RED before (exam dates)
--   S4  L10's scopes door, as admin@admin.com, hands back exactly the old settings for every scope it returns, and
--       every other word it returns is unchanged                                                    ← RED before
--   S5  L10's tree, as admin@admin.com, the same                                                    ← RED before

\set ON_ERROR_STOP on
\timing off
\set suite 'scopesaccess_one_settings_reader_red_green.sql'
\set expect 'clone'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

set transaction_timeout = '40min';
begin isolation level repeatable read;
set local statement_timeout = 0;
set local lock_timeout = '30s';

create temp table s_orgs on commit drop as
  select distinct t.organization_id as org from custom.record t
   where t.table_id = custom.table_kernel_id() and t.data @> '{"kept_for": "context"}'::jsonb and t.deleted_at is null;
create temp table s_admin_orgs on commit drop as
  select o.org from s_orgs o where exists (select 1 from iam.memberships m where m.container_type = 'organization'
     and m.container_id = o.org and m.user_id = '87a6e699-3622-4869-8843-d0867456c0dd' and m.status = 'active' and m.deleted_at is null);
create temp table s_ans (side text, what text, id uuid, v jsonb) on commit drop;

create function pg_temp.s_capture(p_side text) returns void language plpgsql as $f$
declare o record; v_ids uuid[]; v jsonb; x jsonb;
begin
  perform set_config('request.jwt.claims', '', true);
  insert into s_ans select p_side, 'rows_of', r.id, r.row_doc from s_orgs o cross join lateral custom.scope_rows_of(o.org) r;
  insert into s_ans select p_side, 'checkout', s.id, custom.context_class_for_checkout(s.id) from context.scopes s;
  insert into s_ans select p_side, 'setting_back', null, jsonb_build_object('k', e.key, 'b', f.data ->> 'type',
                           'v', custom.scope_setting_back(e.value, f.data ->> 'type'))
    from custom.record r
    join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id and t.data ->> 'kept_for' = 'context'
    cross join lateral jsonb_each(r.data - '_values' - '_sources') e
    join custom.record f on f.organization_id = r.organization_id and f.table_id = custom.field_kernel_id()
                        and f.data @> jsonb_build_object('entity_definition_id', r.table_id::text) and f.data ->> 'key' = e.key
   where r.data_class = 'record';
  perform set_config('request.jwt.claims', json_build_object('sub', '87a6e699-3622-4869-8843-d0867456c0dd', 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  for o in select org from s_admin_orgs loop
    select array_agg(s.id) into v_ids from (select s.id from context.scopes s where s.organization_id = o.org and s.deleted_at is null order by s.id limit 1000) s;
    if v_ids is not null then
      v := custom.context_scopes(v_ids);
      for x in select * from jsonb_array_elements(v) loop
        insert into s_ans values (p_side, 'scopes', (x ->> 'id')::uuid, x);
      end loop;
    end if;
  end loop;
  v := custom.context_tree((select array_agg(org) from s_admin_orgs));
  for x in select * from jsonb_array_elements(v -> 'scopes') loop
    insert into s_ans values (p_side, 'tree', (x ->> 'id')::uuid, x);
  end loop;
  perform set_config('role', 'none', true);
end $f$;

select pg_temp.s_capture('before');
\i migrations/campaign/scopesaccess_one_reader_of_a_scopes_settings.sql
select pg_temp.s_capture('after');

select a.what, count(*) as answers,
       count(*) filter (where a.v is distinct from b.v) as moved,
       count(*) filter (where a.what in ('checkout', 'scopes', 'tree') and (a.v -> 'settings') is distinct from s.settings) as before_differs_from_old,
       count(*) filter (where a.what in ('checkout', 'scopes', 'tree') and (b.v -> 'settings') is distinct from s.settings) as after_differs_from_old,
       count(*) filter (where a.what in ('checkout', 'scopes', 'tree') and (a.v - 'settings') is distinct from (b.v - 'settings')) as other_words_moved
  from s_ans a
  join s_ans b on b.what = a.what and b.side = 'after' and b.id is not distinct from a.id
       and (a.what <> 'setting_back' or (b.v ->> 'k' = a.v ->> 'k'))
  left join context.scopes s on s.id = a.id
 where a.side = 'before' and a.what <> 'setting_back'
 group by a.what order by a.what;
select count(*) as setting_back_values,
       (select count(*) from (select v from s_ans where side = 'before' and what = 'setting_back'
                              except all select v from s_ans where side = 'after' and what = 'setting_back') x) as setting_back_moved;

do $v$
declare r record;
begin
  if exists (select 1 from s_ans a join s_ans b on b.what = a.what and b.side = 'after' and b.id = a.id
              where a.side = 'before' and a.what = 'rows_of' and a.v is distinct from b.v) then
    raise exception 'S1 RED: L6''s scope rows moved';
  end if;
  if exists (select v from s_ans where side = 'before' and what = 'setting_back'
             except all select v from s_ans where side = 'after' and what = 'setting_back') then
    raise exception 'S2 RED: a value decodes differently';
  end if;
  for r in select a.what, count(*) filter (where (b.v -> 'settings') is distinct from s.settings) as bad,
                  count(*) filter (where (a.v - 'settings') is distinct from (b.v - 'settings')) as other
             from s_ans a join s_ans b on b.what = a.what and b.side = 'after' and b.id = a.id
             join context.scopes s on s.id = a.id
            where a.side = 'before' and a.what in ('checkout', 'scopes', 'tree') group by a.what loop
    if r.bad > 0 then raise exception '% RED: % scopes answer settings unlike the old ones', r.what, r.bad; end if;
    if r.other > 0 then raise exception '% RED: % answers moved in a word other than settings', r.what, r.other; end if;
  end loop;
  raise notice 'GREEN S1–S5: one reader; L6''s rows and decode unchanged; L10''s tree, scopes and checkout hand back the old settings exactly';
end $v$;
rollback;
