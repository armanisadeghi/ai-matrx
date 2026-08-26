-- ADOPTION DROPPED THE GUARDS. seo.adopt_starter_pack copies a pack's matchers
-- to a site by naming columns explicitly; `exclusions` was not among them, so
-- every adopted matcher landed with exclusions NULL. The pack said "free,
-- except gluten-free"; the site heard "free". Found live 2026-08-26 on
-- Titanium Success, where all 86 adopted matchers came back unguarded.
--
-- Same class as the pack-normaliser bug fixed the day before: a write path
-- that rebuilds a matcher from a subset of its keys and silently discards the
-- rest. Patched from the LIVE definition. Idempotent.
do $$
declare
  v_def text; v_old text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'seo' and p.proname = 'adopt_starter_pack';
  if v_def is null then
    raise exception 'seo.adopt_starter_pack not found';
  end if;
  if position('m->''exclusions''' in v_def) > 0 then
    raise notice 'adoption already carries exclusions; nothing to do';
    return;
  end if;
  v_old := '(site_id, value_id, kind, pattern, enabled, origin, pack_id, notes,
           organization_id, created_by, updated_by, metadata)
        select p_site_id, v_value, m->>''kind'', m->>''pattern'',';
  v_new := '(site_id, value_id, kind, pattern, exclusions, enabled, origin, pack_id, notes,
           organization_id, created_by, updated_by, metadata)
        select p_site_id, v_value, m->>''kind'', m->>''pattern'',
               case when jsonb_typeof(m->''exclusions'') = ''array''
                    then array(select jsonb_array_elements_text(m->''exclusions''))
                    else null end,';
  if position(v_old in v_def) = 0 then
    raise exception 'adopt_starter_pack matcher insert not in the expected shape — inspect before re-running';
  end if;
  v_def := replace(v_def, v_old, v_new);
  execute v_def;
  raise notice 'adoption now carries matcher exclusions';
end $$;
