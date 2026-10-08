-- lane: PERSON-TIMEZONE
-- lock: custom
-- chair-step: the inverse of person_timezone_day_zone_reads_the_profile_first.sql. It puts back the previous custom.day_zone body (the person's saved zone is no longer read first; a notification / text zone is the first step again).

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

