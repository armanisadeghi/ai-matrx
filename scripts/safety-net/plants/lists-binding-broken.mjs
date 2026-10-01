// A choice column bound to a list stops offering the list's words (in Cedar Ridge only): the door that reads
// "the choices of this field" answers nothing there. Committed on the clone, restored and read back.
export default {
  id: "lists-binding-broken",
  check: "lists.walk-lists",
  items: ["L02"],
  description: "custom.field_options answers no choices in Cedar Ridge (clone, committed, restored)",
  mode: "committed",
  apply: `alter function custom.field_options(uuid, uuid) rename to field_options__sn_orig;
create function custom.field_options(p_organization_id uuid, p_field_id uuid) returns setof custom.record language sql stable security definer set search_path to 'pg_catalog' as $f$
  select * from custom.field_options__sn_orig(p_organization_id, p_field_id) where p_organization_id <> '0a54df90-eab8-4d07-ab29-81a45fb41e04'::uuid
$f$;
grant execute on function custom.field_options(uuid, uuid) to authenticated;
notify pgrst, 'reload schema';`,
  restore: `drop function if exists custom.field_options(uuid, uuid);
alter function custom.field_options__sn_orig(uuid, uuid) rename to field_options;
grant execute on function custom.field_options(uuid, uuid) to authenticated;
notify pgrst, 'reload schema';`,
  readback: `select to_regprocedure('custom.field_options__sn_orig(uuid,uuid)') is null
  and (select prosrc from pg_proc where oid = 'custom.field_options(uuid,uuid)'::regprocedure) like '%assert_store_door%'
  and has_function_privilege('authenticated', 'custom.field_options(uuid,uuid)', 'execute');`,
};
