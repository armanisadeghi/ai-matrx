// The data home's door ignores what was typed in search: it answers the unsearched home (in the suite's transaction).
export default {
  id: "dh-search-ignored",
  check: "datahome.sql-search",
  items: ["D03"],
  description: "custom.data_home(uuid, text) drops p_search: every search answers the whole home",
  mode: "in-transaction",
  apply: `alter function custom.data_home(uuid, text) rename to data_home__sn_orig;
create function custom.data_home(p_organization_id uuid default null, p_search text default null) returns jsonb language sql stable security definer set search_path to 'pg_catalog' as $f$ select custom.data_home__sn_orig(p_organization_id, null) $f$;
grant execute on function custom.data_home(uuid, text) to authenticated;`,
};
