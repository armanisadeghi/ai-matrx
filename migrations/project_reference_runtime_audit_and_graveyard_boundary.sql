-- project_reference_runtime_audit_and_graveyard_boundary.sql
-- Repairs the project-reference RPC permission failure and closes the two
-- discovery gaps that hid it from the canonicalization toolkit.
--
-- 1. Graveyard relations may not constrain live relations. Two flashcard tables
--    moved to graveyard after the platform-wide FK sweep and retained project FKs.
-- 2. Project-reference discovery must exclude retired schemas and relations the
--    invoking role cannot read.
-- 3. plpgsql_check is static and cannot execute dynamic SQL. A small, explicit
--    runtime-probe registry lets audit.refresh test high-risk read-only functions
--    without blindly invoking every database function.

alter table if exists graveyard.education_flashcard_data
  drop constraint if exists flashcard_data_project_id_fkey;
alter table if exists graveyard.education_flashcard_sets
  drop constraint if exists flashcard_sets_project_id_fkey;

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
      and n.nspname not in (select schema_name from meta.excluded_schema)
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
      and n.nspname not in (select schema_name from meta.excluded_schema)
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

create table if not exists audit.function_runtime_probe (
  function_signature text primary key,
  probe_sql text not null,
  enabled boolean not null default true,
  note text not null,
  created_at timestamptz not null default now(),
  constraint function_runtime_probe_read_only
    check (probe_sql ~* '^[[:space:]]*select[[:space:]]' and probe_sql !~ ';')
);

revoke all on audit.function_runtime_probe from public, anon, authenticated;

create or replace function audit.run_function_runtime_probes()
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare r record; v_failures integer := 0;
begin
  for r in
    select function_signature, probe_sql
    from audit.function_runtime_probe
    where enabled
    order by function_signature
  loop
    begin
      execute r.probe_sql;
    exception when others then
      v_failures := v_failures + 1;
      insert into audit.broken_functions(
        schema_name, function_name, signature, level, sqlstate, message, context
      ) values (
        split_part(r.function_signature, '.', 1),
        split_part(split_part(r.function_signature, '.', 2), '(', 1),
        r.function_signature,
        'runtime_error',
        sqlstate,
        sqlerrm,
        'Registered read-only runtime probe: ' || r.probe_sql
      );
    end;
  end loop;
  return v_failures;
end;
$function$;

revoke all on function audit.run_function_runtime_probes() from public, anon, authenticated;

do $block$
begin
  if to_regprocedure('audit.refresh_static()') is null then
    alter function audit.refresh() rename to refresh_static;
  end if;
end;
$block$;

create or replace function audit.refresh()
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare v_note text; v_runtime_failures integer;
begin
  v_note := audit.refresh_static();
  v_runtime_failures := audit.run_function_runtime_probes();
  return v_note || '; runtime_probe_failures=' || v_runtime_failures::text;
end;
$function$;

revoke all on function audit.refresh() from public, anon, authenticated;

insert into audit.function_runtime_probe(function_signature, probe_sql, note)
values
  ('public.get_project_references(uuid)',
   'select count(*) from public.get_project_references(null::uuid)',
   'Catalog-driven dynamic SQL: verifies every discovered relation is inside the live, caller-readable boundary.'),
  ('public.get_project_references_detailed(uuid,integer)',
   'select count(*) from public.get_project_references_detailed(null::uuid, 1)',
   'Detailed catalog-driven dynamic SQL: verifies count and sample discovery cannot cross into retired schemas.')
on conflict (function_signature) do update
set probe_sql = excluded.probe_sql, enabled = true, note = excluded.note;

comment on table audit.function_runtime_probe is
  'Explicit read-only runtime probes for functions whose dynamic SQL cannot be validated by plpgsql_check. audit.refresh records failures in audit.broken_functions.';
