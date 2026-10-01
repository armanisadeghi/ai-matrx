// The data home's door answers only Cedar Ridge's tables to the two test seats when no organization is named:
// "All organizations" is then really one organization. Committed on the clone, restored and read back.
export default {
  id: "dh-home-narrowed",
  check: "datahome.walk-home",
  items: ["D01", "D02"],
  description: "custom.data_home(null, …) lists only Cedar Ridge's tables for admin@admin.com and test@test.com (clone, committed, restored)",
  mode: "committed",
  apply: `alter function custom.data_home(uuid, text) rename to data_home__sn_orig;
create function custom.data_home(p_organization_id uuid default null, p_search text default null) returns jsonb language sql stable security definer set search_path to 'pg_catalog' as $f$
  select case when p_organization_id is null and custom.query_principal() in ('87a6e699-3622-4869-8843-d0867456c0dd', '4060701e-706a-4c76-b3ca-0bbc69fa5a14')
    then jsonb_set(r, '{tables}', coalesce((select jsonb_agg(t) from jsonb_array_elements(r -> 'tables') t where t ->> 'organization_id' = '0a54df90-eab8-4d07-ab29-81a45fb41e04'), '[]'::jsonb))
    else r end
  from (select custom.data_home__sn_orig(p_organization_id, p_search) as r) q
$f$;
grant execute on function custom.data_home(uuid, text) to authenticated;
notify pgrst, 'reload schema';`,
  restore: `drop function if exists custom.data_home(uuid, text);
alter function custom.data_home__sn_orig(uuid, text) rename to data_home;
grant execute on function custom.data_home(uuid, text) to authenticated;
notify pgrst, 'reload schema';`,
  readback: `select to_regprocedure('custom.data_home__sn_orig(uuid,text)') is null
  and (select prosrc from pg_proc where oid = 'custom.data_home(uuid,text)'::regprocedure) like '%tables_seen_once_per_group%'
  and has_function_privilege('authenticated', 'custom.data_home(uuid,text)', 'execute');`,
};
