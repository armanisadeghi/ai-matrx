-- chair-step: DOORS-ONLY-3 inverse -- there is nothing here a person would want to undo. The
-- forward file only schema-qualified `'editor'::public.permission_level` inside three doors
-- whose `search_path` is pinned to `pg_catalog`; reverting it makes all three raise
-- `type "permission_level" does not exist` for every signed-in caller, which is the defect it
-- fixed. Re-apply the original bodies with --reapply only if you mean to reproduce that.
select 1;
