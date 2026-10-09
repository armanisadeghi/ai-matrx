-- lock: communication
-- lane: PERSON-TIMEZONE-2
-- based-on: communication.record_person_timezone(uuid, uuid, text, text, text), communication.person_notification_window(uuid, uuid, text)
--
-- ONE TIME ZONE PER PERSON. The text-message capture (sign-in, SMS enrollment, the Chief of Staff's answer) used to
-- write a SECOND zone, notification_channel_preference.timezone. It now writes the one saved zone,
-- users.user_preferences.preferences -> display -> timeZone (what Settings edits and custom.day_zone reads first),
-- and only when the person has none saved. The notification ladder reads that same value as its first rung
-- ('person_preference'). The parallel writer is gone; old captured rows stay readable behind it.

set local lock_timeout = '2s';
set local statement_timeout = '60s';

create or replace function communication.record_person_timezone(
  p_user_id         uuid,
  p_organization_id uuid,
  p_timezone        text,
  p_source          text default 'browser',
  p_channel         text default 'sms'
)
returns table (outcome text, timezone text, timezone_source text)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_tz    text;
  v_saved text;
begin
  if p_user_id is null or p_organization_id is null then
    return query select 'refused_missing_identity'::text, null::text, null::text;
    return;
  end if;
  v_tz := nullif(btrim(coalesce(p_timezone, '')), '');
  if v_tz is null
     or not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = v_tz) then
    return query select 'invalid_timezone'::text, v_tz, null::text;
    return;
  end if;

  -- The one saved zone. A browser reading fills a hole; it never overrules what the person saved.
  select n.name into v_saved
    from users.user_preferences up
    join pg_catalog.pg_timezone_names n
      on n.name = nullif(btrim(up.preferences -> 'display' ->> 'timeZone'), '')
   where up.user_id = p_user_id;
  if v_saved is not null then
    return query select 'already_known'::text, v_saved, 'person_preference'::text;
    return;
  end if;

  insert into users.user_preferences as up (user_id, preferences, created_by, updated_by)
  values (p_user_id,
          jsonb_build_object('display', jsonb_build_object('timeZone', v_tz)),
          p_user_id, p_user_id)
  on conflict (user_id) do update
    set preferences = jsonb_set(
          coalesce(up.preferences, '{}'::jsonb),
          '{display}',
          coalesce(up.preferences -> 'display', '{}'::jsonb) || jsonb_build_object('timeZone', v_tz)),
        updated_by = p_user_id,
        updated_at = now();

  return query select 'stored'::text, v_tz, 'person_preference'::text;
end
$function$;

do $do$
declare
  v_def text;
  v_old text := E'  if v_has_pref then\n    v_cand := nullif(btrim(coalesce(v_pref.timezone, '''')), '''');';
  v_new text := E'  -- THE ONE SAVED ZONE first: preferences.display.timeZone (PERSON-TIMEZONE-2).\n' ||
    E'  if p_user_id is not null then\n' ||
    E'    select n.name into v_cand\n' ||
    E'      from users.user_preferences up\n' ||
    E'      join pg_catalog.pg_timezone_names n\n' ||
    E'        on n.name = nullif(btrim(up.preferences -> ''display'' ->> ''timeZone''), '''')\n' ||
    E'     where up.user_id = p_user_id;\n' ||
    E'    if v_cand is not null then v_tz := v_cand; v_src := ''person_preference''; end if;\n' ||
    E'  end if;\n\n' ||
    E'  if v_tz is null and v_has_pref then\n    v_cand := nullif(btrim(coalesce(v_pref.timezone, '''')), '''');';
begin
  select pg_get_functiondef('communication.person_notification_window(uuid,uuid,text)'::regprocedure) into v_def;
  if position('person_preference' in v_def) > 0 then return; end if;
  if position(v_old in v_def) = 0 then raise exception 'person_notification_window body drifted; not patched'; end if;
  execute replace(v_def, v_old, v_new);
end
$do$;
