// SAFETY-NET-B · C04. The press's list of older write doors forgets one (add_data_row_to_user_table), so the press
// leaves it executable by signed-in callers. The chain's C04 must go RED: "a signed-in person still reaches
// add_data_row_to_user_table on a moved table". In-transaction: rolled back with the suite.
export default {
  id: "b-old-door-stays-open",
  check: "cutover.switch-chain",
  items: ["C04"],
  description: "platform._final_switch_old_write_doors() leaves out public.add_data_row_to_user_table(uuid,jsonb)",
  mode: "env", // spliced by probes/b_clone_suite.py right after the suite's first `begin`; rolled back with it
  env: { SN_B_PLANT_SQL: `alter function platform._final_switch_old_write_doors() rename to _final_switch_old_write_doors__sn_real;
create function platform._final_switch_old_write_doors() returns regprocedure[] language sql stable set search_path to 'pg_catalog'
  as $$ select array(select d from unnest(platform._final_switch_old_write_doors__sn_real()) d
                      where d <> 'public.add_data_row_to_user_table(uuid,jsonb)'::regprocedure) $$;` },
};
