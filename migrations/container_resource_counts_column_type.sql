-- Keep the dynamic container predicate aligned with each registered column's
-- physical type. canvas.canvas_items.task_id is text while canonical task ids
-- are UUIDs; binding the UUID parameter directly produced 42883 (text = uuid)
-- and aborted the entire inventory RPC.

create or replace function public.container_resource_counts(p_column text, p_container_id uuid)
 returns table(resource_key text, n bigint)
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  rec record;
  v_count bigint;
  v_has_arch boolean;
  v_has_del boolean;
  v_column_type text;
  v_sql text;
begin
  if p_column not in ('organization_id', 'project_id', 'task_id') then
    raise exception 'invalid container column: %', p_column;
  end if;
  if p_container_id is null then return; end if;

  for rec in
    select e.user_artifact_kind as k,
           e.schema_name as sch,
           e.table_name as tbl,
           case when e.token in ('agent','canvas_item') then 'is_archived' end as arch
      from platform.entity_types e
     where e.user_artifact_kind is not null
       and e.is_active
     order by e.user_artifact_kind
  loop
    begin
      if rec.k = 'research' and p_column = 'project_id' then
        select count(*) into v_count from platform.associations_live a
          join research.rs_topic rt on rt.id = a.source_id and rt.deleted_at is null
          where a.source_type='research_topic' and a.target_type='project' and a.target_id = p_container_id;
        resource_key := rec.k; n := v_count; return next; continue;
      end if;

      if to_regclass(format('%I.%I', rec.sch, rec.tbl)) is null then continue; end if;

      select pg_catalog.format_type(a.atttypid, a.atttypmod)
        into v_column_type
        from pg_catalog.pg_attribute a
        join pg_catalog.pg_class c on c.oid = a.attrelid
        join pg_catalog.pg_namespace ns on ns.oid = c.relnamespace
       where ns.nspname = rec.sch
         and c.relname = rec.tbl
         and a.attname = p_column
         and a.attnum > 0
         and not a.attisdropped;
      if v_column_type is null then continue; end if;

      v_has_arch := false;
      if rec.arch is not null then
        select exists (select 1 from information_schema.columns
          where table_schema = rec.sch and table_name = rec.tbl and column_name = rec.arch) into v_has_arch;
      end if;
      select exists (select 1 from information_schema.columns
        where table_schema = rec.sch and table_name = rec.tbl and column_name = 'deleted_at') into v_has_del;

      v_sql := format(
        'select count(*) from %I.%I where %I = $1::%s',
        rec.sch, rec.tbl, p_column, v_column_type
      );
      if v_has_arch then v_sql := v_sql || format(' and %I = false', rec.arch); end if;
      if v_has_del then v_sql := v_sql || ' and deleted_at is null'; end if;
      execute v_sql into v_count using p_container_id;
      resource_key := rec.k; n := v_count; return next;
    exception when undefined_table or undefined_column or insufficient_privilege then continue;
    end;
  end loop;
end;
$function$;

revoke execute on function public.container_resource_counts(text, uuid) from public, anon;
grant execute on function public.container_resource_counts(text, uuid) to authenticated;

comment on function public.container_resource_counts(text, uuid) is
  'RLS-filtered resource counts for an organization, project, or task. Registered container columns are compared using their physical Postgres type.';
