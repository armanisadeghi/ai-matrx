-- lock: custom
-- lane: PERSON-TIMEZONE
-- based-on: custom.day_zone(uuid) 8ebe0b159f66820101d89913ac63722620ec8c557b75891667eeb3fdfe702655
--
-- THE PERSON'S TIME ZONE LIVES ON THE PERSON. The browser captures `Intl...timeZone` into the person's own
-- saved preferences (users.user_preferences.preferences -> display -> timeZone, an IANA name; the Settings
-- "Time zone" field edits the same value), and custom.day_zone now reads THAT first:
--   1. the person's saved time zone (preferences.display.timeZone),
--   2. else a zone she declared for notifications / texts (the previous first step, kept behind it),
--   3. else the organization's (custom/time_zone), else the connection's (custom.time_zone), else UTC.
-- Only the first step is new; the rest of the body is unchanged.

set local lock_timeout = '2s';
set local statement_timeout = '60s';

create or replace function custom.day_zone(p_organization_id uuid default null)
returns text
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_me  uuid := custom.query_principal();
  v_tz  text;
begin
  if v_me is not null then
    select n.name into v_tz
      from users.user_preferences up
      join pg_catalog.pg_timezone_names n on n.name = nullif(btrim(up.preferences -> 'display' ->> 'timeZone'), '')
     where up.user_id = v_me
     limit 1;
    if v_tz is not null then return v_tz; end if;

    select z.tz into v_tz
      from (select p.timezone as tz, p.updated_at, (p.organization_id is not distinct from p_organization_id) as same_org
              from communication.notification_channel_preference p
             where p.created_by = v_me and p.deleted_at is null and nullif(btrim(p.timezone), '') is not null
            union all
            select s.timezone, s.updated_at, (s.organization_id is not distinct from p_organization_id)
              from communication.sms_notification_preferences s
             where s.user_id = v_me and nullif(btrim(s.timezone), '') is not null) z
      join pg_catalog.pg_timezone_names n on n.name = z.tz
     order by z.same_org desc, z.updated_at desc nulls last
     limit 1;
    if v_tz is not null then return v_tz; end if;
  end if;
  if p_organization_id is not null then
    v_tz := custom.agg_calendar(p_organization_id) ->> 'time_zone';
    if v_tz is not null and v_tz <> 'UTC' then return v_tz; end if;
  end if;
  v_tz := nullif(btrim(current_setting('custom.time_zone', true)), '');
  if v_tz is not null and exists (select 1 from pg_catalog.pg_timezone_names n where n.name = v_tz) then
    return v_tz;
  end if;
  return 'UTC';
end
$fn$;

comment on function custom.day_zone(uuid) is
  'The zone a person''s own day is read in: her saved time zone (preferences.display.timeZone), else a zone she declared for notifications, else the organization''s (custom/time_zone), else the connection''s (custom.time_zone), else UTC. The one resolver for every date-only write and TODAY().';
