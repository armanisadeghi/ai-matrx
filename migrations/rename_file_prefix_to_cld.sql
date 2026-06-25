-- rename_file_prefix_to_cld.sql
-- Applied 2026-06-24 (Wave 4 prefix consolidation).
--
-- file_* → cld_* — cld_ is the canonical cloud-file prefix; the file_ tables were created
-- in error. NON-BREAKING: each old name is kept as a security_invoker auto-updatable compat
-- VIEW → existing readers + writers + RLS all keep working until consumers (Python backend /
-- DB functions) migrate to the new names, then the views are dropped. 0 FE `.from()` consumers
-- confirmed. Idempotent (skips a table already renamed). Verified live: cld_analysis=725 /
-- file_analysis(view)=725, cld_pages=6408 / file_pages(view)=6408.

do $$
declare r record;
begin
  for r in select * from (values
    ('file_analysis','cld_analysis'),
    ('file_analysis_result','cld_analysis_result'),
    ('file_entities','cld_entities'),
    ('file_overrides','cld_overrides'),
    ('file_page_annotations','cld_page_annotations'),
    ('file_pages','cld_pages'),
    ('file_structure','cld_structure')) as v(old_name, new_name)
  loop
    if to_regclass('public.'||r.new_name) is null then
      execute format('alter table public.%I rename to %I', r.old_name, r.new_name);
      execute format('create view public.%I with (security_invoker=true) as select * from public.%I', r.old_name, r.new_name);
    end if;
  end loop;
end $$;

do $$
declare n_tbl int; n_view int;
begin
  select count(*) into n_tbl from information_schema.tables
   where table_schema='public' and table_type='BASE TABLE'
     and table_name in ('cld_analysis','cld_analysis_result','cld_entities','cld_overrides','cld_page_annotations','cld_pages','cld_structure');
  select count(*) into n_view from information_schema.views
   where table_schema='public'
     and table_name in ('file_analysis','file_analysis_result','file_entities','file_overrides','file_page_annotations','file_pages','file_structure');
  if n_tbl <> 7 then raise exception 'file→cld: expected 7 renamed tables, got %', n_tbl; end if;
  if n_view <> 7 then raise exception 'file→cld: expected 7 compat views, got %', n_view; end if;
  raise notice 'file→cld OK: 7 tables renamed, 7 compat views';
end $$;
