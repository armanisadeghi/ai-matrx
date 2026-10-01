-- chair-step: lane OLD-READERS-REMOVAL (2026-10-01). ADDS custom.pick_list_create(uuid, text, text, jsonb), the client door a person makes a new pick list through. Step two's file c turned public.create_user_list into the older-tables sentence, and with it went the only client path to platform._pick_list_born_in_store — after it, "New list" was refused for everyone. A new list is born in the record store as a Table of choices, in the person's own seat, exactly as create_user_list did for a switched organization. No row of any table is written by this file. No lock beyond one function definition and one registry row.
-- lane: OLD-READERS-REMOVAL
-- INVERSE: migrations/inverse/oldreadersremoval_a_a_new_pick_list_is_born_in_the_store_down.sql
--
-- WHO MAY. The store's switch first (custom.assert_store_door), then the organization wall
-- (custom.assert_client_may_reach): a person makes a list only in an organization she belongs to.
-- The list is hers (created_by is the signed-in person; platform._pick_list_born_in_store refuses
-- a call with no signed-in person). The organization is the one the person is making it in: a new
-- object has no organization of its own yet.

create or replace function custom.pick_list_create(
  p_organization_id uuid,
  p_list_name text,
  p_description text default null,
  p_items jsonb default '[]'::jsonb
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
begin
  perform custom.assert_store_door(p_organization_id, 'custom.pick_list_create');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.pick_list_create');
  if p_items is not null and jsonb_typeof(p_items) <> 'array' then
    raise exception 'A new list''s items are a list of choices, each with a label.'
      using errcode = '22023',
            hint = 'Send p_items as an array like [{"label": "Aetna"}], or leave it out for an empty list.';
  end if;
  return platform._pick_list_born_in_store(p_organization_id, p_list_name, p_description, coalesce(p_items, '[]'::jsonb));
end;
$function$;

comment on function custom.pick_list_create(uuid, text, text, jsonb) is
  'OLD-READERS-REMOVAL: a new pick list, born in the record store as a Table of choices in the caller''s own seat (platform._pick_list_born_in_store) — the store door that replaces public.create_user_list.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, signed_in_callers, anonymous_callers, argument_rules)
select 'custom', 'pick_list_create', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       'migrations/campaign/oldreadersremoval_a_a_new_pick_list_is_born_in_the_store.sql (lane OLD-READERS-REMOVAL)',
       'The store''s switch, then the organization wall (custom.assert_client_may_reach) before anything is written; the list is born as the signed-in person''s own Table of choices in that organization (platform._pick_list_born_in_store refuses a call with no signed-in person). It names nothing but the list it made.',
       true, false,
       jsonb_build_object('version', 1, 'arguments', jsonb_build_object('p_organization_id', jsonb_build_object(
         'type', 'uuid',
         'check', 'this body decides it with custom.assert_client_may_reach(arg1) — the organization wall — a non-member is refused before anything is written, and that call stands before every other use of this argument in the body.',
         'entity', 'organization',
         'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
         'position', 1,
         'verified', '2026-10-01 lane OLD-READERS-REMOVAL — written with this body')),
         'declared_at', '2026-10-01 lane OLD-READERS-REMOVAL',
         'declared_by', 'oldreadersremoval_a_a_new_pick_list_is_born_in_the_store.sql')
  from pg_proc p where p.oid = 'custom.pick_list_create(uuid, text, text, jsonb)'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do nothing;

grant execute on function custom.pick_list_create(uuid, text, text, jsonb) to authenticated, service_role;
