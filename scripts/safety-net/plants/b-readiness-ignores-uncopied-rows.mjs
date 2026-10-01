// SAFETY-NET-B · C01. Readiness stops counting rows that are missing from, or stale in, their copies (the count every
// "rows_present" / "rows_current" check reads). The switch chain's P1 must go RED: "readiness says Ready while admin's
// Workspace has an older row its copy does not have". In-transaction: rolled back with the suite.
export default {
  id: "b-readiness-ignores-uncopied-rows",
  check: "cutover.switch-chain",
  items: ["C01"],
  description: "platform.cutover_tables_copied answers rows_missing = 0 and rows_stale = 0 whatever the tables hold",
  mode: "env", // spliced by probes/b_clone_suite.py right after the suite's first `begin`; rolled back with it
  env: { SN_B_PLANT_SQL: `alter function platform.cutover_tables_copied(uuid) rename to cutover_tables_copied__sn_real;
create function platform.cutover_tables_copied(p_org uuid) returns jsonb language sql stable set search_path to 'pg_catalog'
  as $$ select platform.cutover_tables_copied__sn_real(p_org) || jsonb_build_object('rows_missing', 0, 'rows_stale', 0) $$;` },
};
