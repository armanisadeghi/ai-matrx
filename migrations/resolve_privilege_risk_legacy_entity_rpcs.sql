-- resolve_privilege_risk_legacy_entity_rpcs.sql
--
-- Resolves all nine advisory privilege-risk findings identified on 2026-08-13.
-- Eight function objects belong to the deliberately removed dynamic entity
-- system and have no caller. They move intact to graveyard so PostgREST stops
-- exposing them; nothing is dropped. The ninth function,
-- ensure_updated_at_on_table(text,text), is still called by the installed
-- trg_ensure_updated_at event trigger, so it stays public and gains the caller
-- privilege boundary used by get_project_references.
--
-- Caller inventory before this migration:
--   * exact-name sweep across matrx-frontend, aidream, matrx-extend,
--     matrx-local, matrx-sandbox, and my-matrx: no runtime caller of any of the
--     eight retired functions (generated types, historical docs, and unrelated
--     Python methods named update_by_id are not RPC callers);
--   * every dynamic .rpc(variable) path was inspected: the frontend dispatcher
--     selects only agx_usage_scan/agx_usage_scan_admin; matrx-orm's generic
--     SupabaseManager.rpc has no application caller in the repo;
--   * tool.definition and tool.binding contain no matching registry row;
--   * pg_depend, view/default definitions, and other SQL/plpgsql function
--     bodies contain no dependent on the eight retired functions;
--   * public.ensure_updated_at_trigger_evt() DOES call
--     public.ensure_updated_at_on_table(text,text), and the enabled event
--     trigger trg_ensure_updated_at invokes it after CREATE/ALTER TABLE.
--
-- Idempotent. Safe to re-run.

create or replace function public.ensure_updated_at_on_table(
  p_schema text,
  p_table text
) returns boolean
language plpgsql
security invoker
as $function$
declare
  v_is_regular boolean;
  v_has_col boolean;
  v_has_handler boolean;
begin
  select c.relkind = 'r'
    into v_is_regular
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = p_schema and c.relname = p_table;

  if not coalesce(v_is_regular, false) then
    return false;
  end if;

  -- The event trigger runs with the DDL caller's privileges. Never inspect or
  -- build dynamic DDL against a relation that caller cannot reach and modify.
  if not has_schema_privilege(current_user, p_schema, 'usage') then
    return false;
  end if;
  if not has_table_privilege(
    current_user,
    format('%I.%I', p_schema, p_table),
    'trigger'
  ) then
    return false;
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = p_schema
      and table_name = p_table
      and column_name = 'updated_at'
  ) into v_has_col;
  if not v_has_col then
    return false;
  end if;

  -- Preserve a table's custom updated_at handler when it already has one.
  select exists (
    select 1
    from pg_trigger tg
    join pg_class cls on cls.oid = tg.tgrelid
    join pg_namespace nsp on nsp.oid = cls.relnamespace
    join pg_proc p on p.oid = tg.tgfoid
    where not tg.tgisinternal
      and nsp.nspname = p_schema
      and cls.relname = p_table
      and pg_get_functiondef(p.oid) ilike '%updated_at%'
  ) into v_has_handler;
  if v_has_handler then
    return false;
  end if;

  execute format(
    'create trigger set_updated_at before update on %I.%I '
    || 'for each row execute function public.set_updated_at()',
    p_schema,
    p_table
  );
  return true;
end;
$function$;

insert into audit.function_runtime_probe(function_signature, probe_sql, note)
values (
  'public.ensure_updated_at_on_table(text,text)',
  'select 1 / case when pg_get_functiondef(''public.ensure_updated_at_on_table(text,text)''::regprocedure) ~* ''has_schema_privilege[[:space:]]*\([[:space:]]*current_user'' and pg_get_functiondef(''public.ensure_updated_at_on_table(text,text)''::regprocedure) ~* ''has_table_privilege[[:space:]]*\([[:space:]]*current_user'' and public.ensure_updated_at_on_table(''public'', ''app_config'') = false then 1 else 0 end',
  'Invoker-boundary contract plus no-write execution probe against public.app_config, whose existing set_updated_at trigger makes this call a no-op.'
)
on conflict (function_signature) do update
set probe_sql = excluded.probe_sql,
    enabled = true,
    note = excluded.note;

do $retire$
declare
  v_signature text;
  v_name text;
  v_oid oid;
  v_identity_args text;
  v_dependency text;
begin
  for v_signature in
    select signature
    from (values
      ('add_one_entry(text,jsonb,text)'),
      ('fetch_all_fk_ifk_with_list(text,uuid)'),
      ('fetch_custom_rels(text,uuid,text[])'),
      ('fetch_filtered_with_fk_ifk(text,jsonb)'),
      ('fetch_filtered_with_fk_ifk(text,jsonb,boolean,boolean)'),
      ('fetch_paginated_with_all_ids(text,integer,integer,boolean,text)'),
      ('fetch_paginated_with_ids_names(text,integer,integer,boolean,text)'),
      ('update_by_id(text,jsonb,text)')
    ) retired(signature)
  loop
    v_name := split_part(v_signature, '(', 1);
    v_oid := to_regprocedure('public.' || v_signature);

    if v_oid is null then
      -- Already moved is the only acceptable absent-public state. The final
      -- assertions reject a missing body.
      continue;
    end if;

    select pg_describe_object(d.classid, d.objid, d.objsubid)
      into v_dependency
    from pg_depend d
    where d.refclassid = 'pg_proc'::regclass
      and d.refobjid = v_oid
      and not (d.classid = 'pg_proc'::regclass and d.objid = d.refobjid)
    limit 1;
    if v_dependency is not null then
      raise exception '% acquired a catalog dependent (%); re-verify before retiring',
        v_signature, v_dependency;
    end if;

    select p.oid::regprocedure::text
      into v_dependency
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname not in ('pg_catalog', 'information_schema', 'graveyard')
      and p.prokind = 'f'
      and p.proname not in (
        'add_one_entry',
        'fetch_all_fk_ifk_with_list',
        'fetch_custom_rels',
        'fetch_filtered_with_fk_ifk',
        'fetch_paginated_with_all_ids',
        'fetch_paginated_with_ids_names',
        'update_by_id'
      )
      and pg_get_functiondef(p.oid) ~* ('\m' || v_name || '\M')
    limit 1;
    if v_dependency is not null then
      raise exception '% acquired an in-DB textual caller (%); re-verify before retiring',
        v_signature, v_dependency;
    end if;

    if exists (
      select 1 from pg_views
      where definition ~* ('\m' || v_name || '\M')
    ) or exists (
      select 1 from pg_matviews
      where definition ~* ('\m' || v_name || '\M')
    ) or exists (
      select 1
      from pg_attrdef ad
      where pg_get_expr(ad.adbin, ad.adrelid) ~* ('\m' || v_name || '\M')
    ) then
      raise exception '% acquired a view/materialized-view/default caller; re-verify before retiring',
        v_signature;
    end if;

    if exists (
      select 1 from tool.definition d
      where to_jsonb(d)::text ~* ('\m' || v_name || '\M')
    ) or exists (
      select 1 from tool.binding b
      where to_jsonb(b)::text ~* ('\m' || v_name || '\M')
    ) then
      raise exception '% acquired a tool registry caller; re-verify before retiring',
        v_signature;
    end if;

    select pg_get_function_identity_arguments(v_oid) into v_identity_args;
    execute format(
      'alter function public.%I(%s) set schema graveyard',
      v_name,
      v_identity_args
    );
  end loop;
end;
$retire$;

insert into platform.deprecated_relations(old_ref, new_ref, archived_as, reason)
values
  ('public.add_one_entry(text,jsonb,text)',
   'direct Supabase writes + Matrx ORM',
   'graveyard.add_one_entry(text,jsonb,text)',
   'Legacy generic entity-system create RPC. Zero callers across all six repos, in-DB dependencies, dynamic RPC dispatchers, and tool.definition/tool.binding. Retired intact to remove its PostgREST exposure.'),
  ('public.fetch_all_fk_ifk_with_list(text,uuid)',
   'direct schema-specific Supabase reads + canonical association RPCs',
   'graveyard.fetch_all_fk_ifk_with_list(text,uuid)',
   'Legacy dynamic entity relationship reader. Zero callers across all six repos, in-DB dependencies, dynamic RPC dispatchers, and tool.definition/tool.binding. Retired intact to remove its PostgREST exposure.'),
  ('public.fetch_custom_rels(text,uuid,text[])',
   'canonical association RPCs',
   'graveyard.fetch_custom_rels(text,uuid,text[])',
   'Legacy dynamic entity relationship reader. Zero callers across all six repos, in-DB dependencies, dynamic RPC dispatchers, and tool.definition/tool.binding. Retired intact to remove its PostgREST exposure.'),
  ('public.fetch_filtered_with_fk_ifk(text,jsonb)',
   'direct schema-specific Supabase reads + canonical association RPCs',
   'graveyard.fetch_filtered_with_fk_ifk(text,jsonb)',
   'Legacy generic entity-system filtered reader. Zero callers across all six repos, in-DB dependencies, dynamic RPC dispatchers, and tool.definition/tool.binding. Retired intact to remove its PostgREST exposure.'),
  ('public.fetch_filtered_with_fk_ifk(text,jsonb,boolean,boolean)',
   'direct schema-specific Supabase reads + canonical association RPCs',
   'graveyard.fetch_filtered_with_fk_ifk(text,jsonb,boolean,boolean)',
   'Legacy generic entity-system filtered reader overload. Zero callers across all six repos, in-DB dependencies, dynamic RPC dispatchers, and tool.definition/tool.binding. Retired intact to remove its PostgREST exposure.'),
  ('public.fetch_paginated_with_all_ids(text,integer,integer,boolean,text)',
   'schema-specific list RPCs and direct Supabase reads',
   'graveyard.fetch_paginated_with_all_ids(text,integer,integer,boolean,text)',
   'Legacy generic entity-system paginator. Zero callers across all six repos, in-DB dependencies, dynamic RPC dispatchers, and tool.definition/tool.binding. Retired intact to remove its PostgREST exposure.'),
  ('public.fetch_paginated_with_ids_names(text,integer,integer,boolean,text)',
   'schema-specific list RPCs and direct Supabase reads',
   'graveyard.fetch_paginated_with_ids_names(text,integer,integer,boolean,text)',
   'Legacy generic entity-system paginator. Zero callers across all six repos, in-DB dependencies, dynamic RPC dispatchers, and tool.definition/tool.binding. Retired intact to remove its PostgREST exposure.'),
  ('public.update_by_id(text,jsonb,text)',
   'direct Supabase guarded writes + Matrx ORM optimistic writes',
   'graveyard.update_by_id(text,jsonb,text)',
   'Legacy generic entity-system update RPC. Zero callers across all six repos, in-DB dependencies, dynamic RPC dispatchers, and tool.definition/tool.binding. Retired intact to remove its PostgREST exposure.')
on conflict do nothing;

-- Refresh executes the new no-write probe and removes graveyard functions from
-- the scored universe before the post-conditions are checked.
select audit.refresh();

do $assert$
declare
  v_signature text;
  v_real integer;
  v_advisory integer;
  v_rows text;
begin
  for v_signature in
    select signature
    from (values
      ('add_one_entry(text,jsonb,text)'),
      ('fetch_all_fk_ifk_with_list(text,uuid)'),
      ('fetch_custom_rels(text,uuid,text[])'),
      ('fetch_filtered_with_fk_ifk(text,jsonb)'),
      ('fetch_filtered_with_fk_ifk(text,jsonb,boolean,boolean)'),
      ('fetch_paginated_with_all_ids(text,integer,integer,boolean,text)'),
      ('fetch_paginated_with_ids_names(text,integer,integer,boolean,text)'),
      ('update_by_id(text,jsonb,text)')
    ) retired(signature)
  loop
    if to_regprocedure('public.' || v_signature) is not null then
      raise exception 'public.% still exists; retirement did not remove its PostgREST exposure',
        v_signature;
    end if;
    if to_regprocedure('graveyard.' || v_signature) is null then
      raise exception 'graveyard.% is missing; the function body was lost instead of retired',
        v_signature;
    end if;
  end loop;

  if not exists (
    select 1
    from pg_event_trigger
    where evtname = 'trg_ensure_updated_at'
      and evtenabled <> 'D'
      and evtfoid = 'public.ensure_updated_at_trigger_evt()'::regprocedure
  ) then
    raise exception 'The live ensure_updated_at event-trigger caller is missing or disabled';
  end if;

  if pg_get_functiondef('public.ensure_updated_at_on_table(text,text)'::regprocedure)
       !~* 'has_schema_privilege[[:space:]]*\([[:space:]]*current_user'
     or pg_get_functiondef('public.ensure_updated_at_on_table(text,text)'::regprocedure)
       !~* 'has_table_privilege[[:space:]]*\([[:space:]]*current_user'
  then
    raise exception 'ensure_updated_at_on_table is missing its invoker privilege boundary';
  end if;

  if not exists (
    select 1
    from audit.function_runtime_probe
    where function_signature = 'public.ensure_updated_at_on_table(text,text)'
      and enabled
  ) then
    raise exception 'ensure_updated_at_on_table runtime probe is missing or disabled';
  end if;

  if (
    select count(*)
    from platform.deprecated_relations
    where old_ref in (
      'public.add_one_entry(text,jsonb,text)',
      'public.fetch_all_fk_ifk_with_list(text,uuid)',
      'public.fetch_custom_rels(text,uuid,text[])',
      'public.fetch_filtered_with_fk_ifk(text,jsonb)',
      'public.fetch_filtered_with_fk_ifk(text,jsonb,boolean,boolean)',
      'public.fetch_paginated_with_all_ids(text,integer,integer,boolean,text)',
      'public.fetch_paginated_with_ids_names(text,integer,integer,boolean,text)',
      'public.update_by_id(text,jsonb,text)'
    )
  ) <> 8 then
    raise exception 'Expected exactly 8 platform.deprecated_relations rows for this retirement';
  end if;

  select count(*) into v_real
  from audit.broken_functions
  where severity = 'real';
  if v_real <> 0 then
    select string_agg(signature || ' — ' || coalesce(message, ''), '; ')
      into v_rows
    from audit.broken_functions
    where severity = 'real';
    raise exception 'Expected 0 real findings, found %: %', v_real, v_rows;
  end if;

  select count(*) into v_advisory
  from audit.broken_functions
  where severity = 'advisory';
  if v_advisory <> 0 then
    select string_agg(signature || ' — ' || coalesce(message, ''), '; ')
      into v_rows
    from audit.broken_functions
    where severity = 'advisory';
    raise exception 'Expected 0 advisory findings, found %: %', v_advisory, v_rows;
  end if;
end;
$assert$;
