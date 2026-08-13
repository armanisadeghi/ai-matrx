-- Applied via Supabase MCP 2026-08-12 (tool_app_children_inherit_org_backstop).
-- REQUIRED backstop for NOT NULL organization_id on component children (caught by the FE type
-- gate): _inherit_org BEFORE-INSERT triggers (platform.inherit_org_from_parent) on the 9 tool/app
-- children, matching the agent children. Live-proven: app/tool snapshot triggers + org-less
-- execution inserts all inherit org from the parent row (rolled-back smoke test).
do $$
declare r record;
begin
  for r in select * from (values
      ('tool','definition_version','tool','definition','tool_id'),
      ('tool','ui','tool','definition','tool_id'),
      ('tool','ui_version','tool','definition','tool_id'),
      ('tool','ui_incident','tool','ui','component_id'),
      ('tool','test_sample','tool','definition','tool_id'),
      ('app','definition_version','app','definition','app_id'),
      ('app','execution','app','definition','app_id'),
      ('app','error','app','definition','app_id'),
      ('app','rate_limit','app','definition','app_id')
    ) as t(sch, tbl, psch, ptbl, fk)
  loop
    if not exists (
      select 1 from pg_trigger tg join pg_proc p on p.oid=tg.tgfoid
      where tg.tgrelid=(r.sch||'.'||r.tbl)::regclass and not tg.tgisinternal
        and p.proname='inherit_org_from_parent'
    ) then
      execute format('create trigger _inherit_org before insert on %I.%I for each row execute function platform.inherit_org_from_parent(%L,%L,%L)',
                     r.sch, r.tbl, r.psch, r.ptbl, r.fk);
    end if;
  end loop;
end $$;
