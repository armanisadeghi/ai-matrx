-- AP3-PHASEB-U4 SOAK (Attack M7): the paging guarantee of platform.entity_list_scoped, stated in
-- PHASE-B-APPLETS §5: "a row whose sort values did not change between two page reads appears exactly once across
-- the pages; a row whose sort values changed may move". admin@admin.com pages her whole task list ("all" lane,
-- 1,616 rows) to the end while a writer changes rows between page reads. Every page is its own statement, so each
-- page sees every write made before it, exactly as it would see another session's committed write (READ
-- COMMITTED); the writer runs as postgres between the pages. Rolled back: nothing a soak writes survives.
--   ap3.part = 'renames'  sort [priority desc, title asc], pages of 100. Before every page the writer renames
--                         3 unread rows to sort BEFORE the cursor ("Aaa …"), 3 read rows to sort AFTER it
--                         ("Zzz …") and 2 unread rows in place (" (edited)").
--                         Expect unchanged_not_once = 0 (every row whose sort values never changed: exactly once);
--                         the renamed rows' fates are reported (0, 1 or 2 appearances), not asserted.
--   ap3.part = 'inserts'  the default order (newest first), pages of 100. Before every page the writer inserts one
--                         task dated now (sorts before the cursor: never on a later page) and one dated 2020
--                         (sorts after it: on a later page exactly once).
--                         Expect original_not_once = 0, old_inserts_not_once = 0, new_inserts_seen = 0.
-- Run as postgres (Supabase MCP execute_sql); set ap3.part below and run both.
begin;
select set_config('ap3.part', 'renames', true);   -- renames | inserts
select set_config('app.actor_system', 'ap3_u4_soak', true);
create temp table _seen(n int, id uuid) on commit drop;
create temp table _changed(id uuid primary key, how text) on commit drop;
create temp table _ins(id uuid primary key, how text) on commit drop;
create temp table _out(k text, v jsonb) on commit drop;
grant all on _seen, _changed, _ins, _out to authenticated;
select set_config('request.headers', '{}', true);
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
set local statement_timeout = '300s';
do $soak$
declare
  v_part text := current_setting('ap3.part');
  v_sort jsonb := case when current_setting('ap3.part') = 'renames' then '[{"column":"priority","dir":"desc"},{"column":"title","dir":"asc"}]'::jsonb end;
  v_after text; v_page jsonb; v_n int := 0; v_total int; v_start uuid[]; v_last uuid; v_id uuid;
begin
  -- the list as it stands before the walk (the rows the guarantee is about)
  execute 'set local role authenticated';
  v_page := platform.entity_list_scoped('task', '{"kind":"all"}', p_sort => v_sort, p_page_size => 500);
  v_total := (v_page ->> 'total')::int;
  v_start := array(select (r ->> 'id')::uuid from jsonb_array_elements(v_page -> 'rows') r);
  v_after := v_page ->> 'next_after';
  while v_after is not null loop
    v_page := platform.entity_list_scoped('task', '{"kind":"all"}', p_sort => v_sort, p_page_size => 500, p_after => v_after);
    v_start := v_start || array(select (r ->> 'id')::uuid from jsonb_array_elements(v_page -> 'rows') r);
    v_after := v_page ->> 'next_after';
  end loop;
  -- the walk
  v_after := null;
  loop
    if v_n > 0 then
      -- the writer, between two page reads
      execute 'set local role postgres';
      if v_part = 'renames' then
        for v_id in select t.id from projects.tasks t where t.id = any (v_start) and t.id not in (select id from _seen)
                      and t.id not in (select id from _changed) order by md5(t.id::text || v_n) limit 3 loop
          update projects.tasks set title = 'Aaa ' || title where id = v_id;
          insert into _changed values (v_id, 'unread, moved before the cursor');
        end loop;
        for v_id in select s.id from _seen s where s.id not in (select id from _changed) order by md5(s.id::text || v_n) limit 3 loop
          update projects.tasks set title = 'Zzz ' || title where id = v_id;
          insert into _changed values (v_id, 'read, moved after the cursor');
        end loop;
        for v_id in select t.id from projects.tasks t where t.id = any (v_start) and t.id not in (select id from _seen)
                      and t.id not in (select id from _changed) order by md5(v_n || t.id::text) limit 2 loop
          update projects.tasks set title = title || ' (edited)' where id = v_id;
          insert into _changed values (v_id, 'unread, edited in place');
        end loop;
      else
        insert into projects.tasks(title, organization_id, created_by, created_at)
        values ('Confirm venue deposit for the spring offsite', '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f', '87a6e699-3622-4869-8843-d0867456c0dd', clock_timestamp())
        returning id into v_id;
        insert into _ins values (v_id, 'new');
        insert into projects.tasks(title, organization_id, created_by, created_at)
        values ('Archive 2020 vendor contracts', '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f', '87a6e699-3622-4869-8843-d0867456c0dd', ('2020-03-0' || (1 + v_n % 9) || 'T10:00:00Z')::timestamptz)
        returning id into v_id;
        insert into _ins values (v_id, 'old');
      end if;
      execute 'set local role authenticated';
    end if;
    v_page := platform.entity_list_scoped('task', '{"kind":"all"}', p_sort => v_sort, p_page_size => 100, p_after => v_after, p_with_total => false);
    v_n := v_n + 1;
    insert into _seen select v_n, (r ->> 'id')::uuid from jsonb_array_elements(v_page -> 'rows') r;
    v_after := v_page ->> 'next_after';
    exit when v_after is null or v_n > 60;
  end loop;
  execute 'set local role postgres';
  if v_part = 'renames' then
    insert into _out select 'renames', jsonb_build_object(
      'list_rows', v_total, 'start_ids', cardinality(v_start), 'pages', v_n, 'rows_read', (select count(*) from _seen),
      'changed_rows', (select count(*) from _changed),
      'unchanged_rows', (select count(*) from unnest(v_start) x where x not in (select id from _changed)),
      'unchanged_not_once', (select count(*) from unnest(v_start) x where x not in (select id from _changed)
                               and (select count(*) from _seen s where s.id = x) <> 1),
      'renamed_fates', (select jsonb_object_agg(how, fates) from (
          select how, jsonb_object_agg('seen_' || seen, n) fates from (
            select c.how, (select count(*) from _seen s where s.id = c.id) seen, count(*) n from _changed c group by 1, 2) a group by how) b));
  else
    insert into _out select 'inserts', jsonb_build_object(
      'list_rows', v_total, 'start_ids', cardinality(v_start), 'pages', v_n, 'rows_read', (select count(*) from _seen),
      'original_not_once', (select count(*) from unnest(v_start) x where (select count(*) from _seen s where s.id = x) <> 1),
      'old_inserts', (select count(*) from _ins where how = 'old'),
      'old_inserts_not_once', (select count(*) from _ins i where how = 'old' and (select count(*) from _seen s where s.id = i.id) <> 1),
      'new_inserts', (select count(*) from _ins where how = 'new'),
      'new_inserts_seen', (select count(*) from _ins i join _seen s on s.id = i.id where how = 'new'));
  end if;
end $soak$;
select k, v from _out;
rollback;
