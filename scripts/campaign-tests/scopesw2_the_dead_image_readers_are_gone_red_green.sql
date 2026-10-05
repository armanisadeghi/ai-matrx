-- FTS-1 wave 2 — NO FUNCTION A SIGNED-IN CALLER CAN EXECUTE READS THE OLD context.* SCOPE TABLES WITH THE CALLER'S RIGHTS
-- (the revoke would turn each into a permission error). RED while any SECURITY INVOKER function with authenticated
-- EXECUTE names one of the six (the seven dead image readers, before this file); GREEN after. The allowlist names the
-- invoker helpers whose only callers are definer doors or triggers fired inside them, each with why.
\set ON_ERROR_STOP on
\set suite 'scopesw2_the_dead_image_readers_are_gone_red_green.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
do $g$
declare v text;
begin
  select string_agg(n.nspname || '.' || p.proname, ', ' order by 1) into v
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where not p.prosecdef and has_function_privilege('authenticated', p.oid, 'EXECUTE')
     and n.nspname not in ('pg_catalog', 'information_schema', 'deprecated')
     and p.prosrc ~ 'context\.(scopes|scope_types|context_items|context_item_values|context_value_refs|scope_dataset_instances)\M'
     and n.nspname || '.' || p.proname not in (
       'context.validate_reference_value', 'context.index_reference_value',   -- called by the definer value door (owner rights)
       'public.ctx_validate_scope_parent', 'public.ctx_validate_value_scope_type', 'public.ctx_version_context_item_value', -- triggers on context.*; every client write reaches them through a definer door
       'iam.apply_table_grants',                                               -- comment only
       'workbench.guard_used_template_fields');                                -- chair item C4 (rewrite or drop)
  if v is not null then
    raise exception 'RED: invoker functions a signed-in caller can execute still read the old scope tables: %', v;
  end if;
  raise notice 'GREEN: no client-executable invoker function reads the old scope tables outside the allowlist';
end $g$;
