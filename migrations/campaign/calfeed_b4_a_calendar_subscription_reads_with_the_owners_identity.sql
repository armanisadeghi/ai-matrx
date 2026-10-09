-- chair-step: replaces users.calendar_feed_read (created minutes earlier by calfeed_b3) so it no longer calls SET ROLE, which Postgres refuses inside a SECURITY DEFINER function; the owner's identity is carried by the JWT claims and the read door judges it. Inverse: migrations/inverse/calfeed_b_a_calendar_feed_is_a_private_link_read_as_its_owner_down.sql.
-- additive: yes
-- guard: custom/system_enabled
-- lock: platform
-- lane: CAL-FEED-CHART
-- based-on: users.calendar_feed_read(text) c58632cee5dc1d73be58a135b34707e02ba9b80e97409605cffb60ba5001ae43
--
-- CAL-FEED-CHART part 4: the feed read carries the owner's identity without switching role.

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

  -- From here the transaction carries the identity of the person who made the link. Postgres forbids SET ROLE inside a
  -- SECURITY DEFINER function, so the person's wall and ladder are applied by the door itself: custom.read_records_page
  -- judges auth.uid() / custom.caller_role() and never the connection's role. The view, field and table metadata below
  -- is read only AFTER that door has let the person in, and only for this link's own table.
  perform set_config('request.jwt.claims', json_build_object('sub', f.created_by::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', f.created_by::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  begin
    v_page := custom.read_records_page(f.organization_id, f.table_id, '{}'::jsonb, null, '[]'::jsonb, f.view_id, false, 5000, 0, f.time_zone);
    if f.view_id is not null then
      select definition || jsonb_build_object('name', name) into v_view from platform.saved_view
       where id = f.view_id and deleted_at is null and definition ->> 'table_id' = f.table_id::text;
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
