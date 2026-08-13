-- project_reference_excluded_schema_qualification.sql
-- Qualify meta.excluded_schema.schema_name because the RPC return column named
-- schema_name is also a PL/pgSQL variable. The runtime-probe audit caught this
-- as SQLSTATE 42702 immediately after the boundary fix was applied.

create or replace function public.get_project_references(p_project_id uuid)
returns table(schema_name text, table_name text, column_name text, row_count bigint)
language plpgsql
stable
set search_path = public
as $function$
declare r record; v_count bigint; v_sql text;
begin
  for r in
    select n.nspname as schema_name, c.relname as table_name, a.attname as column_name
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_class fc on fc.oid = con.confrelid
    join pg_namespace fn on fn.oid = fc.relnamespace
    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
    where con.contype = 'f'
      and fn.nspname = 'workspace'
      and fc.relname = 'projects'
      and array_length(con.conkey, 1) = 1
      and n.nspname not in (select es.schema_name from meta.excluded_schema es)
      and has_schema_privilege(current_user, n.oid, 'usage')
      and has_table_privilege(current_user, c.oid, 'select')
    order by n.nspname, c.relname
  loop
    v_sql := format('select count(*) from %I.%I where %I = $1', r.schema_name, r.table_name, r.column_name);
    execute v_sql into v_count using p_project_id;
    schema_name := r.schema_name; table_name := r.table_name; column_name := r.column_name; row_count := v_count;
    return next;
  end loop;
end;
$function$;

create or replace function public.get_project_references_detailed(
  p_project_id uuid,
  p_sample_limit integer default 5
)
returns table(schema_name text, table_name text, column_name text, row_count bigint, sample_ids uuid[])
language plpgsql
stable
set search_path = public
as $function$
declare r record; v_count bigint; v_samples uuid[]; v_has_id boolean; v_sql text;
begin
  for r in
    select n.nspname as schema_name, c.relname as table_name, a.attname as column_name
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_class fc on fc.oid = con.confrelid
    join pg_namespace fn on fn.oid = fc.relnamespace
    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
    where con.contype = 'f'
      and fn.nspname = 'workspace'
      and fc.relname = 'projects'
      and array_length(con.conkey, 1) = 1
      and n.nspname not in (select es.schema_name from meta.excluded_schema es)
      and has_schema_privilege(current_user, n.oid, 'usage')
      and has_table_privilege(current_user, c.oid, 'select')
    order by n.nspname, c.relname
  loop
    v_sql := format('select count(*) from %I.%I where %I = $1', r.schema_name, r.table_name, r.column_name);
    execute v_sql into v_count using p_project_id;
    select exists (
      select 1 from pg_attribute
      where attrelid = format('%I.%I', r.schema_name, r.table_name)::regclass
        and attname = 'id' and not attisdropped and attnum > 0
    ) into v_has_id;
    v_samples := null;
    if v_has_id and v_count > 0 then
      v_sql := format('select array_agg(id) from (select id from %I.%I where %I = $1 limit $2) sub', r.schema_name, r.table_name, r.column_name);
      execute v_sql into v_samples using p_project_id, p_sample_limit;
    end if;
    schema_name := r.schema_name; table_name := r.table_name; column_name := r.column_name;
    row_count := v_count; sample_ids := v_samples;
    return next;
  end loop;
end;
$function$;
