-- Revert: web.create_site defaulted p_visibility to 'public', which in
-- iam.has_access_for_base grants viewer to EVERY authenticated user. Org work
-- defaults to 'internal' per docs/official/db-rules.md.
do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'web' and p.proname = 'create_site';
  v_def := replace(
    v_def,
    'p_visibility platform.visibility DEFAULT ''public''::platform.visibility',
    'p_visibility platform.visibility DEFAULT ''internal''::platform.visibility');
  execute v_def;
end$$;
