-- chair-step: adds users.calendar_feed_default_days, _calendar_feed_token, _calendar_feed_hash, calendar_feed_create, calendar_feed_rotate, calendar_feed_revoke (new functions only). Inverse: migrations/inverse/calfeed_b_a_calendar_feed_is_a_private_link_read_as_its_owner_down.sql.
-- additive: yes
-- guard: custom/system_enabled
-- lock: platform
-- lane: CAL-FEED-CHART
--
-- CAL-FEED-CHART calendar subscription, part 2 of 3. See calfeed_b_a_... part 1 for the whole story.

create or replace function users.calendar_feed_default_days()
 returns integer language sql immutable set search_path to 'pg_catalog'
as $$ select 365 $$;

create or replace function users._calendar_feed_token()
 returns text language sql volatile set search_path to 'pg_catalog'
as $$ select 'mxcal_' || replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') $$;

create or replace function users._calendar_feed_hash(p_token text)
 returns text language sql immutable set search_path to 'pg_catalog'
as $$ select encode(sha256(convert_to(p_token, 'UTF8')), 'hex') $$;

create or replace function users.calendar_feed_create(
  p_organization_id uuid, p_table_id uuid, p_view_id uuid, p_title text,
  p_description_field text default null, p_time_zone text default null, p_expires_days integer default null)
 returns jsonb
 language plpgsql security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_uid   uuid := auth.uid();
  v_def   jsonb;
  v_token text;
  v_days  integer := coalesce(p_expires_days, users.calendar_feed_default_days());
  v_id    uuid;
  v_exp   timestamptz;
  v_tz    text := coalesce(nullif(btrim(p_time_zone), ''), 'UTC');
begin
  if v_uid is null then
    raise exception 'Sign in to subscribe to a calendar.' using errcode = '28000';
  end if;
  if not exists (select 1 from pg_timezone_names where name = v_tz) then
    raise exception '% is not a time zone name, so the calendar could not be set to it.', v_tz using errcode = '22023';
  end if;
  -- The caller must be able to read this view's rows RIGHT NOW: the ordinary door judges it.
  perform custom.read_records_page(p_organization_id, p_table_id, '{}'::jsonb, null, '[]'::jsonb, p_view_id, false, 1, 0, v_tz);
  if p_view_id is not null then
    select definition into v_def from platform.saved_view where id = p_view_id and deleted_at is null;
  end if;
  if coalesce(v_def ->> 'date_field', v_def ->> 'start_field') is null then
    raise exception 'A calendar subscription needs a view with a date field - open a Calendar or Timeline view and subscribe from there.'
      using errcode = '22023';
  end if;
  if v_days < 1 or v_days > 3650 then
    raise exception 'A calendar link lives between 1 day and 10 years, and % days was asked.', v_days using errcode = '22023';
  end if;
  v_token := users._calendar_feed_token();
  v_exp := now() + make_interval(days => v_days);
  insert into users.calendar_feed
    (organization_id, created_by, table_id, view_id, title, description_field, time_zone, token_hash, token_prefix, expires_at)
  values (p_organization_id, v_uid, p_table_id, p_view_id, coalesce(nullif(btrim(p_title), ''), 'Calendar'),
          nullif(btrim(p_description_field), ''), v_tz, users._calendar_feed_hash(v_token), left(v_token, 11), v_exp)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'token', v_token, 'expires_at', v_exp, 'time_zone', v_tz);
end
$function$;

create or replace function users.calendar_feed_rotate(p_id uuid, p_expires_days integer default null)
 returns jsonb
 language plpgsql security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_uid   uuid := auth.uid();
  v_token text := users._calendar_feed_token();
  v_days  integer := coalesce(p_expires_days, users.calendar_feed_default_days());
  v_exp   timestamptz := now() + make_interval(days => coalesce(p_expires_days, users.calendar_feed_default_days()));
begin
  if v_uid is null then
    raise exception 'Sign in to change a calendar link.' using errcode = '28000';
  end if;
  if v_days < 1 or v_days > 3650 then
    raise exception 'A calendar link lives between 1 day and 10 years, and % days was asked.', v_days using errcode = '22023';
  end if;
  update users.calendar_feed
     set token_hash = users._calendar_feed_hash(v_token), token_prefix = left(v_token, 11),
         expires_at = v_exp, revoked_at = null, updated_at = now()
   where id = p_id and created_by = v_uid and deleted_at is null;
  if not found then
    raise exception 'That calendar link is not one of yours.' using errcode = '42501';
  end if;
  return jsonb_build_object('id', p_id, 'token', v_token, 'expires_at', v_exp);
end
$function$;

create or replace function users.calendar_feed_revoke(p_id uuid)
 returns jsonb
 language plpgsql security definer
 set search_path to 'pg_catalog'
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sign in to change a calendar link.' using errcode = '28000';
  end if;
  update users.calendar_feed set revoked_at = now(), updated_at = now()
   where id = p_id and created_by = v_uid and deleted_at is null and revoked_at is null;
  if not found then
    raise exception 'That calendar link is not one of yours, or it is already ended.' using errcode = '42501';
  end if;
  return jsonb_build_object('id', p_id, 'revoked', true);
end
$function$;


insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values
 ('users', 'calendar_feed_create',
  'p_organization_id uuid, p_table_id uuid, p_view_id uuid, p_title text, p_description_field text, p_time_zone text, p_expires_days integer',
  array['uuid'::regtype::oid, 'uuid'::regtype::oid, 'uuid'::regtype::oid, 'text'::regtype::oid, 'text'::regtype::oid, 'text'::regtype::oid, 'integer'::regtype::oid],
  'Reads the caller from the session, refuses unless the ordinary read door custom.read_records_page lets the caller read the view right now, and writes one row owned by the caller; the token is answered once and only its SHA-256 is kept.',
  'calfeed_b2_a_calendar_subscription_mints_and_ends_a_link.sql', null, true, false,
  jsonb_build_object('version',1,'arguments',jsonb_build_object('p_organization_id', jsonb_build_object('type','uuid','check','read through the ordinary read door as the caller, which refuses what the caller cannot open; a foreign id reads nothing.','entity',null,'foreign',jsonb_build_object('bounded',true,'same_as_invented',true,'note','read through the ordinary read door as the caller, which refuses what the caller cannot open; a foreign id reads nothing.')), 'p_table_id', jsonb_build_object('type','uuid','check','read through the ordinary read door as the caller, which refuses what the caller cannot open; a foreign id reads nothing.','entity',null,'foreign',jsonb_build_object('bounded',true,'same_as_invented',true,'note','read through the ordinary read door as the caller, which refuses what the caller cannot open; a foreign id reads nothing.')), 'p_view_id', jsonb_build_object('type','uuid','check','read through the ordinary read door as the caller, which refuses what the caller cannot open; a foreign id reads nothing.','entity',null,'foreign',jsonb_build_object('bounded',true,'same_as_invented',true,'note','read through the ordinary read door as the caller, which refuses what the caller cannot open; a foreign id reads nothing.'))))),
 ('users', 'calendar_feed_rotate', 'p_id uuid, p_expires_days integer',
  array['uuid'::regtype::oid, 'integer'::regtype::oid],
  'Changes only a row the caller created (created_by = auth.uid()); answers the new token once.',
  'calfeed_b2_a_calendar_subscription_mints_and_ends_a_link.sql', null, true, false,
  jsonb_build_object('version',1,'arguments',jsonb_build_object('p_id', jsonb_build_object('type','uuid','check','matched only against rows the caller created; a foreign id matches nothing.','entity',null,'foreign',jsonb_build_object('bounded',true,'same_as_invented',true,'note','matched only against rows the caller created; a foreign id matches nothing.'))))),
 ('users', 'calendar_feed_revoke', 'p_id uuid',
  array['uuid'::regtype::oid],
  'Ends only a link the caller created (created_by = auth.uid()).',
  'calfeed_b2_a_calendar_subscription_mints_and_ends_a_link.sql', null, true, false,
  jsonb_build_object('version',1,'arguments',jsonb_build_object('p_id', jsonb_build_object('type','uuid','check','matched only against rows the caller created; a foreign id matches nothing.','entity',null,'foreign',jsonb_build_object('bounded',true,'same_as_invented',true,'note','matched only against rows the caller created; a foreign id matches nothing.')))))
on conflict do nothing;
