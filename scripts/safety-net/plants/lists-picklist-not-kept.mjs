// A new picklist is no longer platform-owned for its choices: it shows up among a person's tables.
export default {
  id: "lists-picklist-not-kept",
  check: "lists.sql-new-picklist-kept",
  items: ["L01"],
  description: "custom.table_placement says kept_by_the_app = false for every table (in the suite's transaction)",
  mode: "in-transaction",
  apply: `alter function custom.table_placement(uuid, uuid, jsonb, boolean) rename to table_placement__sn_orig;
create function custom.table_placement(p_organization_id uuid, p_table_id uuid, p_data jsonb, p_is_kernel boolean default false) returns jsonb language sql stable as $f$ select custom.table_placement__sn_orig(p_organization_id, p_table_id, p_data, p_is_kernel) || jsonb_build_object('kept_by_the_app', false) $f$;
grant execute on function custom.table_placement(uuid, uuid, jsonb, boolean) to authenticated;`,
};
