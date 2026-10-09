-- chair-step: adds users.calendar_feed_list and users.calendar_feed_read (service_role only) and four platform.client_callable_door rows. Inverse: migrations/inverse/calfeed_b_a_calendar_feed_is_a_private_link_read_as_its_owner_down.sql.
-- additive: yes
-- guard: custom/system_enabled
-- lock: platform
-- lane: CAL-FEED-CHART
--
-- CAL-FEED-CHART calendar subscription, part 3 of 3. See calfeed_b_a_... part 1 for the whole story.

create or replace function users.calendar_feed_list()
 returns jsonb
 language plpgsql security definer stable
 set search_path to 'pg_catalog'
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', f.id, 'title', f.title, 'organization_id', f.organization_id, 'table_id', f.table_id,
             'view_id', f.view_id, 'token_prefix', f.token_prefix, 'time_zone', f.time_zone,
             'created_at', f.created_at, 'expires_at', f.expires_at, 'last_read_at', f.last_read_at,
             'read_count', f.read_count, 'expired', coalesce(f.expires_at < now(), false)) order by f.created_at desc)
      from users.calendar_feed f
     where f.created_by = v_uid and f.deleted_at is null and f.revoked_at is null), '[]'::jsonb);
end
$function$;

-- THE READ. service_role only (the Next route is the transport); the identity that reads is the link's owner.
create or replace function users.calendar_feed_read(p_token text)
 returns jsonb
 language plpgsql security definer
 set search_path to 'pg_catalog'
as $function$
declare
  f        users.calendar_feed%rowtype;
  v_page   jsonb := null;
  v_view   jsonb := null;
  v_fields jsonb := '[]'::jsonb;
  v_table  jsonb := null;
begin
  select * into f from users.calendar_feed
   where token_hash = users._calendar_feed_hash(coalesce(p_token, '')) and deleted_at is null;
  if not found or f.revoked_at is not null or (f.expires_at is not null and f.expires_at < now()) then
    return jsonb_build_object('status', 'gone');
  end if;
  update users.calendar_feed set last_read_at = now(), read_count = read_count + 1 where id = f.id;

  -- From here the transaction IS the person who made the link: their identity, the ordinary role.
  perform set_config('request.jwt.claims', json_build_object('sub', f.created_by::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', f.created_by::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('role', 'authenticated', true);
  begin
    v_page := custom.read_records_page(f.organization_id, f.table_id, '{}'::jsonb, null, '[]'::jsonb, f.view_id, false, 5000, 0, f.time_zone);
    if f.view_id is not null then
      select definition || jsonb_build_object('name', name) into v_view from platform.saved_view where id = f.view_id and deleted_at is null;
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'type', type, 'config', config)), '[]'::jsonb)
      into v_fields from custom.field where entity_definition_id = f.table_id;
    select jsonb_build_object('name', name, 'title_field', title_field) into v_table from custom."table" where id = f.table_id;
  exception when others then
    -- Lost access (or the table is gone): the calendar is empty, never someone else's data.
    v_page := null;
  end;
  return jsonb_build_object(
    'status', 'ok', 'feed_id', f.id, 'title', f.title, 'organization_id', f.organization_id, 'table_id', f.table_id,
    'time_zone', f.time_zone, 'description_field', f.description_field, 'date_field', f.date_field, 'end_field', f.end_field,
    'view', v_view, 'fields', v_fields, 'table', v_table,
    'rows', coalesce(v_page -> 'rows', '[]'::jsonb), 'total', coalesce((v_page ->> 'total')::int, 0));
end
$function$;

revoke all on function users.calendar_feed_read(text) from public, anon, authenticated;
grant execute on function users.calendar_feed_read(text) to service_role;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
values
 ('users', 'calendar_feed_read', 'p_token text', array['text'::regtype::oid],
  'Granted to service_role only (the Next route is the transport); resolves a hashed token, then answers as the link owner through custom.read_records_page, so the ordinary wall and ladder decide every row.',
  'calfeed_b3_a_calendar_subscription_lists_and_reads_as_its_owner.sql', 'The Next route handler for the calendar feed is the transport, using service_role; nobody signed in or anonymous may call it, and the token inside the call is the only credential.', false, false),
 ('users', 'calendar_feed_list', '',
  array[]::oid[],
  'Lists only the caller''s own links (created_by = auth.uid()), never a token, only its first characters.',
  'calfeed_b_a_calendar_feed_is_a_private_link_read_as_its_owner.sql', null, true, false)
on conflict do nothing;
