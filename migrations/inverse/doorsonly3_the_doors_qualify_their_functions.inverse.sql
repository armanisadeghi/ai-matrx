-- chair-step: DOORS-ONLY-3 inverse -- nothing here a person would want to undo. The forward
-- file only schema-qualified `public.is_platform_admin()` inside two doors whose `search_path`
-- is pinned to `pg_catalog`; reverting it makes both raise
-- `function is_platform_admin() does not exist` for every signed-in caller.
select 1;
