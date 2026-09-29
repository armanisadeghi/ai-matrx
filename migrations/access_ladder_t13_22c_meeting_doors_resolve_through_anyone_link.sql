-- access_ladder_t13_22c_meeting_doors_resolve_through_anyone_link.sql
--
-- T-13 step 2.2, part c of e (common-docs/projects/access-ladder/t13/PLAN.md).
-- The meeting guest lane stops reading visibility 'link': meet_meeting_by_slug and
-- meet_record_consent admit a signed-out caller when the meeting is public or carries an
-- active Anyone link (slug -> meeting -> link). The two creators stop writing 'link' and write
-- the meeting's Anyone link instead. Rollback: re-apply the bodies named by the based-on lines.
-- based-on: communication.meet_meeting_by_slug(text) ef0c469daaf225614e36d5aafd8ba3e893482a1677eab3071dc12083c86f1639
-- based-on: communication.meet_record_consent(uuid, text, timestamp with time zone) 360e7d73cc048ce259b2cd3dc4ae8e7b4973988c0f3e93f6dff7b1ce683e00a3
-- based-on: communication.meet_get_or_create_meeting(uuid, uuid, text, text, timestamp with time zone, integer, boolean, text, boolean, text) 0af2707641171682903bacf0ac061e51f46470206a4ceb31e1c6ab5f07341026
-- based-on: communication.meet_schedule_meeting(uuid, uuid, text, timestamp with time zone, text, integer, text, text, jsonb) 265053a91ac92b6a2ee719133a431b7e9ee78d83072b08a9ff1621ddcf615d77

CREATE OR REPLACE FUNCTION communication.meet_meeting_by_slug(p_slug text)
 RETURNS communication.meet_meetings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_row communication.meet_meetings;
begin
  select * into v_row from communication.meet_meetings m
    where m.slug = p_slug and m.deleted_at is null;
  if not found then
    perform platform.refuse_not_found('meet_meeting_by_slug: no meeting for that link');
  end if;
  -- DD-152 / DD-116 class: declaring this an anonymous door says a caller with no account may
  -- REACH it; it never said every meeting behind it is open to one. A guest resolves a meeting
  -- only when it is public or carries an active Anyone link (T-13 2.2: `link` is never a row
  -- state; the slug is the address, the Anyone link is the capability). A signed-in caller is
  -- unchanged — the same page serves members and guests.
  if auth.uid() is null
     and v_row.visibility is distinct from 'public'::platform.visibility
     and not platform.anyone_link_active('meet_meeting', v_row.id) then
    raise exception 'meet_meeting_by_slug: this meeting is not open to guests — sign in with an '
                    'account in the meeting''s organization, or ask the host to share it by link'
      using errcode = '42501';
  end if;
  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION communication.meet_record_consent(p_meeting_id uuid, p_identity text, p_acknowledged_at timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_org uuid; v_vis platform.visibility;
begin
  select organization_id, visibility into v_org, v_vis from communication.meet_meetings
    where id = p_meeting_id and deleted_at is null;
  if v_org is null then
    perform platform.refuse_not_found('meet_record_consent: no such meeting');
  end if;
  -- DD-152: the same guest bound as meet_meeting_by_slug. Without it an anonymous caller holding
  -- any meeting UUID could mint a participant row on a meeting no guest may join.
  -- T-13 2.2: public, or an active Anyone link on the meeting — the same test as the slug door.
  if auth.uid() is null
     and v_vis is distinct from 'public'::platform.visibility
     and not platform.anyone_link_active('meet_meeting', p_meeting_id) then
    raise exception 'meet_record_consent: this meeting is not open to guests' using errcode = '42501';
  end if;
  insert into communication.meet_participants
    (meeting_id, identity, consent_acknowledged_at, organization_id)
  values (p_meeting_id, p_identity, coalesce(p_acknowledged_at, now()), v_org)
  on conflict (meeting_id, identity) do update
    set consent_acknowledged_at = coalesce(
          communication.meet_participants.consent_acknowledged_at,
          excluded.consent_acknowledged_at);
end;
$function$;

CREATE OR REPLACE FUNCTION communication.meet_get_or_create_meeting(p_organization_id uuid, p_host_user_id uuid, p_title text, p_kind text, p_scheduled_for timestamp with time zone, p_scheduled_duration_minutes integer, p_lobby_enabled boolean, p_recording_policy text, p_ai_enabled boolean, p_slug text)
 RETURNS communication.meet_meetings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_actor uuid; v_row communication.meet_meetings; v_slug text;
begin
  v_actor := communication._meet_actor(p_host_user_id);
  if p_organization_id is null then
    raise exception 'meet_get_or_create_meeting: organization_id is required' using errcode = '23502';
  end if;
  if not iam.has_org_access_for(v_actor, p_organization_id) then
    raise exception 'meet_get_or_create_meeting: not a member of this organization' using errcode = '42501';
  end if;

  -- A RECURRING MEETING KEEPS ONE LINK (R3): a known slug resolves, it never
  -- creates a second row behind the same public link.
  if p_slug is not null then
    select * into v_row from communication.meet_meetings m
      where m.slug = p_slug and m.deleted_at is null;
    if found then
      if v_row.organization_id <> p_organization_id then
        raise exception 'meet_get_or_create_meeting: that link belongs to another organization'
          using errcode = '42501';
      end if;
      return v_row;
    end if;
    v_slug := p_slug;
  else
    v_slug := lower(
      substr(md5(gen_random_uuid()::text), 1, 3) || '-' ||
      substr(md5(gen_random_uuid()::text), 1, 4) || '-' ||
      substr(md5(gen_random_uuid()::text), 1, 3));
  end if;

  -- DD-152 / T-13 2.2: a meeting with a durable join link carries an active Anyone link (written
  -- right after the insert); the row keeps its column default. `link` is never a row state.
  insert into communication.meet_meetings
    (room_name, slug, title, kind, host_user_id, scheduled_for, scheduled_duration_minutes,
     locked, lobby_enabled, recording_policy, ai_enabled, organization_id, created_by, updated_by)
  values
    ('mx-' || replace(gen_random_uuid()::text, '-', ''), v_slug,
     coalesce(nullif(btrim(p_title), ''), 'Meeting'), coalesce(p_kind, 'instant'), v_actor,
     p_scheduled_for, p_scheduled_duration_minutes, false, coalesce(p_lobby_enabled, true),
     coalesce(p_recording_policy, 'host-controlled'), coalesce(p_ai_enabled, true),
     p_organization_id, v_actor, v_actor)
  returning * into v_row;
  perform platform.ensure_anyone_link('meet_meeting', v_row.id, v_actor, p_organization_id,
    jsonb_build_object('origin', 'meeting_join_link'));
  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION communication.meet_schedule_meeting(p_organization_id uuid, p_host_user_id uuid, p_title text, p_scheduled_for timestamp with time zone, p_time_zone text, p_duration_minutes integer, p_agenda text, p_recurrence_rule text, p_settings jsonb)
 RETURNS communication.meet_meetings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_actor uuid; v_row communication.meet_meetings; v_key text; v_rule text; v_dur int;
  v_lobby boolean; v_policy text; v_ai boolean; v_jbh boolean; v_settings jsonb;
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
    if v_key not in ('lobby_enabled', 'recording_policy', 'ai_enabled', 'join_before_host') then
      raise exception 'meet_schedule_meeting: "%" is not a meeting setting (lobby_enabled, recording_policy, ai_enabled, join_before_host)', v_key
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
  v_lobby := coalesce((v_settings->>'lobby_enabled')::boolean,
                      communication._meet_knob('default_lobby_enabled', p_organization_id, v_actor)::boolean);
  v_policy := coalesce(v_settings->>'recording_policy',
                       communication._meet_knob('default_recording_policy', p_organization_id, v_actor));
  if v_policy not in ('disabled', 'host-controlled', 'always-on') then
    raise exception 'meet_schedule_meeting: recording policy is disabled, host-controlled or always-on (got %)', v_policy
      using errcode = '22023';
  end if;
  v_ai := coalesce((v_settings->>'ai_enabled')::boolean,
                   communication._meet_knob('default_ai_enabled', p_organization_id, v_actor)::boolean);
  v_jbh := coalesce((v_settings->>'join_before_host')::boolean,
                    communication._meet_knob('default_join_before_host', p_organization_id, v_actor)::boolean);

  insert into communication.meet_meetings
    (room_name, slug, title, kind, host_user_id, scheduled_for, scheduled_duration_minutes,
     locked, lobby_enabled, recording_policy, ai_enabled, organization_id, created_by, updated_by,
     time_zone, agenda, recurrence_rule, join_before_host)
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
     nullif(btrim(coalesce(p_agenda, '')), ''), v_rule, v_jbh)
  returning * into v_row;
  perform platform.ensure_anyone_link('meet_meeting', v_row.id, v_actor, p_organization_id,
    jsonb_build_object('origin', 'meeting_join_link'));
  return v_row;
end;
$function$;
