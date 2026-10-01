// SN-T3 plant: custom.dashboard_declare stops asking for the admin rung, so a viewer-level member can
// rewrite the organization's dashboard (a read-only seat that can write). In-transaction on the clone.
export default {
  id: "t3-dashboard-declare-lets-member-rewrite",
  check: "tables.sql-dashboard-share-ladder",
  items: ["T46"],
  description: "a member holding only the viewer rung can rewrite a dashboard (the rung check is gone)",
  mode: "in-transaction",
  apply: `do $p$
declare v text;
begin
  select regexp_replace(pg_get_functiondef(p.oid), 'perform custom\\.assert_client_may_change\\(p_organization_id, p_table_id, ''custom\\.dashboard_declare'',[^;]*;', 'null;')
    into v from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'custom' and p.proname = 'dashboard_declare';
  if v not like '%null;%' then raise exception 'plant did not apply'; end if;
  execute v;
end $p$;
`,
};
