-- based-on: communication.meet_schedule_meeting(uuid, uuid, text, timestamp with time zone, text, integer, text, text, jsonb) 6dc782f2c8312dfd01e395886e97034b7de1af1d1cbcbf20c086319c30e79846
-- lane: HR-360
--
-- HR-360 WAVE 2 — MEET APP PANEL SLOT + SILENT OBSERVER (Meet duplicates register MD-15, MD-16).
--   1. communication.meet_schedule_meeting (same signature) accepts two more settings:
--      `app_panel` {key, record_id} → metadata.app_panel, and `observers` [user ids] →
--      metadata.observers. Every other line of the body is the live body, verbatim.
--   2. One knob row: meet.observers_visible_to (everyone · hosts, default everyone) — whether
--      people other than the hosts see the "Observing" line. Read by aidream's join gate
--      (services/meet/observer.py) and carried in the token response.
--   Nothing is dropped, no constraint, policy or grant is touched; no row is migrated.
--   Inverse: migrations/inverse/hr360_w2_meet_app_panel_and_observer_down.sql
--   Proof: aidream services/meet/tests/test_meet_observer_and_app_focus.py (gate + focus) and the
--   package test app-panel.test.ts (schedule patch); live: a schedule call with app_panel set.

CREATE OR REPLACE FUNCTION communication.meet_schedule_meeting(p_organization_id uuid, p_host_user_id uuid, p_title text, p_scheduled_for timestamp with time zone, p_time_zone text, p_duration_minutes integer, p_agenda text, p_recurrence_rule text, p_settings jsonb)
 RETURNS communication.meet_meetings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_actor uuid; v_row communication.meet_meetings; v_key text; v_rule text; v_dur int;
  v_lobby boolean; v_policy text; v_ai boolean; v_jbh boolean; v_settings jsonb; v_profile text;
  v_panel jsonb; v_observers jsonb; v_meta jsonb := '{}'::jsonb;
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
    if v_key not in ('lobby_enabled', 'recording_policy', 'ai_enabled', 'join_before_host', 'behavior_profile', 'app_panel', 'observers') then
      raise exception 'meet_schedule_meeting: "%" is not a meeting setting (lobby_enabled, recording_policy, ai_enabled, join_before_host, behavior_profile, app_panel, observers)', v_key
        using errcode = '22023';
    end if;
  end loop;

  -- HR-360 wave 2 (Meet register MD-15): an APP PANEL — a surface the host app registered,
  -- opened beside the call on one record. Only its key and the record's id are stored; the
  -- panel reads the record through each person's own doors.
  v_panel := v_settings->'app_panel';
  if v_panel is not null and jsonb_typeof(v_panel) <> 'null' then
    if jsonb_typeof(v_panel) <> 'object'
       or coalesce(v_panel->>'key', '') !~ '^[a-z0-9][a-z0-9_.-]{0,119}$'
       or char_length(coalesce(v_panel->>'record_id', '')) not between 1 and 200 then
      raise exception 'meet_schedule_meeting: app_panel is {key, record_id} — a lowercase registered key and the record''s id' using errcode = '22023';
    end if;
    v_meta := v_meta || jsonb_build_object('app_panel',
      jsonb_build_object('key', v_panel->>'key', 'record_id', v_panel->>'record_id'));
  end if;
  -- MD-16: the people the host NAMES as silent observers (the join gate reads this list).
  v_observers := v_settings->'observers';
  if v_observers is not null and jsonb_typeof(v_observers) <> 'null' then
    if jsonb_typeof(v_observers) <> 'array' or jsonb_array_length(v_observers) > 50 then
      raise exception 'meet_schedule_meeting: observers is a list of up to 50 user ids' using errcode = '22023';
    end if;
    v_meta := v_meta || jsonb_build_object('observers', (
      select coalesce(jsonb_agg(distinct (e #>> '{}')::uuid::text), '[]'::jsonb)
        from jsonb_array_elements(v_observers) e));
  end if;

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
     time_zone, agenda, recurrence_rule, join_before_host, behavior_profile, metadata)
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
     nullif(btrim(coalesce(p_agenda, '')), ''), v_rule, v_jbh, v_profile, v_meta)
  returning * into v_row;
  perform platform.ensure_anyone_link('meet_meeting', v_row.id, v_actor, p_organization_id,
    jsonb_build_object('origin', 'meeting_join_link'));
  return v_row;
end;
$function$;

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value, allowed_values, label, description,
   set_by, basis, review_due, overridable_by, override_direction, ui, propagation, public_read, delegable)
values
  ('meet', 'observers_visible_to', '"everyone"'::jsonb, '"everyone"'::jsonb, 'enum', null, null, null,
   '["everyone","hosts"]'::jsonb,
   'Who sees observers',
   'Whether everyone in a meeting sees a silent observer listed as "Observing" in People, or only the hosts.',
   'agent', 'HR-360 wave 2 (Meet MD-16): honest by default — a person in a meeting can see who is watching.',
   '2026-12-08', array['organization'], 'any', '{}'::jsonb, 'next_load', false, true)
on conflict (feature, key) do nothing;
