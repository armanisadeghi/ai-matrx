-- chair-step: restores communication.meet_schedule_meeting to the body it had before hr360_w2_meet_app_panel_and_observer.sql (verbatim, 2026-10-08) and archives nothing else; the knob row meet.observers_visible_to is left in place (an unread knob row is harmless and removing it is a DELETE).
-- lane: HR-360

CREATE OR REPLACE FUNCTION communication.meet_schedule_meeting(p_organization_id uuid, p_host_user_id uuid, p_title text, p_scheduled_for timestamp with time zone, p_time_zone text, p_duration_minutes integer, p_agenda text, p_recurrence_rule text, p_settings jsonb)
 RETURNS communication.meet_meetings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_actor uuid; v_row communication.meet_meetings; v_key text; v_rule text; v_dur int;
  v_lobby boolean; v_policy text; v_ai boolean; v_jbh boolean; v_settings jsonb; v_profile text;
begin
  v_actor := communication._meet_actor(p_host_user_id);
  if v_actor is null then
    raise exception 'meet_schedule_meeting: a meeting needs a host — name the host user' using errcode = '22023';
  end if;
  if p_organization_id is null then
    raise exception 'meet_schedule_meeting: organization_id is required' using errcode = '23502';
  end if;
  if not iam.has_org_access_for(v_actor, p_organization_id) then
    raise exception 'meet_schedule_meeting: not a member of this organization' using errcode = '42501';
  end if;

  v_settings := coalesce(p_settings, '{}'::jsonb);
  if jsonb_typeof(v_settings) <> 'object' then
    raise exception 'meet_schedule_meeting: settings must be an object' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(v_settings) loop
    if v_key not in ('lobby_enabled', 'recording_policy', 'ai_enabled', 'join_before_host', 'behavior_profile') then
      raise exception 'meet_schedule_meeting: "%" is not a meeting setting (lobby_enabled, recording_policy, ai_enabled, join_before_host, behavior_profile)', v_key
        using errcode = '22023';
    end if;
  end loop;

  v_rule := nullif(btrim(coalesce(p_recurrence_rule, '')), '');
  if v_rule is not null then
    perform communication.meet_rrule_parse(v_rule);
    if p_scheduled_for is null then
      raise exception 'meet_schedule_meeting: a repeating meeting needs its first start time' using errcode = '22023';
    end if;
    v_rule := upper(regexp_replace(v_rule, '^rrule:', '', 'i'));
  end if;

  v_dur := coalesce(p_duration_minutes, communication._meet_knob('default_duration_minutes', p_organization_id, v_actor)::int);
  if v_dur < 1 or v_dur > 1440 then
    raise exception 'meet_schedule_meeting: a meeting lasts 1 to 1440 minutes (got %)', v_dur using errcode = '22023';
  end if;
  -- The meeting's rules: an explicit profile is stored on the row; otherwise the
  -- column stays null and the host's meet.behavior_profile answers (CORE-DESIGN §4.1).
  v_profile := nullif(btrim(coalesce(v_settings->>'behavior_profile', '')), '');
  if v_profile is not null and v_profile not in ('meet', 'zoom', 'teams') then
    raise exception 'meet_schedule_meeting: behavior profile is meet, zoom or teams (got %)', v_profile using errcode = '22023';
  end if;
  -- The column-backed rules default from the profile through the ONE resolver.
  v_lobby := coalesce((v_settings->>'lobby_enabled')::boolean,
                      (communication.meet_policy_for(p_organization_id, v_actor, v_profile, null, 'lobby_enabled') #>> '{}')::boolean);
  v_policy := coalesce(v_settings->>'recording_policy',
                       communication.meet_policy_for(p_organization_id, v_actor, v_profile, null, 'recording_policy') #>> '{}');
  if v_policy not in ('disabled', 'host-controlled', 'always-on') then
    raise exception 'meet_schedule_meeting: recording policy is disabled, host-controlled or always-on (got %)', v_policy
      using errcode = '22023';
  end if;
  v_ai := coalesce((v_settings->>'ai_enabled')::boolean,
                   communication._meet_knob('default_ai_enabled', p_organization_id, v_actor)::boolean);
  v_jbh := coalesce((v_settings->>'join_before_host')::boolean,
                    (communication.meet_policy_for(p_organization_id, v_actor, v_profile, null, 'join_before_host') #>> '{}')::boolean);

  insert into communication.meet_meetings
    (room_name, slug, title, kind, host_user_id, scheduled_for, scheduled_duration_minutes,
     locked, lobby_enabled, recording_policy, ai_enabled, organization_id, created_by, updated_by,
     time_zone, agenda, recurrence_rule, join_before_host, behavior_profile)
  values
    ('mx-' || replace(gen_random_uuid()::text, '-', ''),
     lower(substr(md5(gen_random_uuid()::text), 1, 3) || '-' ||
           substr(md5(gen_random_uuid()::text), 1, 4) || '-' ||
           substr(md5(gen_random_uuid()::text), 1, 3)),
     coalesce(nullif(btrim(p_title), ''), 'Meeting'),
     case when v_rule is not null then 'recurring'
          when p_scheduled_for is not null then 'scheduled' else 'instant' end,
     v_actor, p_scheduled_for, v_dur, false, v_lobby, v_policy, v_ai,
     p_organization_id, v_actor, v_actor,
     -- DD-152 / T-13 2.2: the durable join link is an Anyone link, written after the insert.
     communication._meet_valid_tz(coalesce(p_time_zone, 'UTC')),
     nullif(btrim(coalesce(p_agenda, '')), ''), v_rule, v_jbh, v_profile)
  returning * into v_row;
  perform platform.ensure_anyone_link('meet_meeting', v_row.id, v_actor, p_organization_id,
    jsonb_build_object('origin', 'meeting_join_link'));
  return v_row;
end;
$function$;
