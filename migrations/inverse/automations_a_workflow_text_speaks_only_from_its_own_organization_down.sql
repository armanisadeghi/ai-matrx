-- additive: no
-- Inverse of migrations/campaign/automations_a_workflow_text_speaks_only_from_its_own_organization.sql: restores the two bodies exactly as they were
-- before it (the event row is left in place: the server's startup reconcile owns it).
-- lane: AUTOMATIONS-AND-PAGES
-- based-on: communication.enqueue_notification_sms(uuid, text) 7dfc60f47a640f5162c05a7690789828e3061d5358b066ecf4b646af8013e551
-- based-on: communication.sms_notification_gate(uuid, timestamp with time zone) 6b51a6cd71f090c0108c93c2a2d13ce8e93cdfb1c73f8c47fb8388dcd6e09250

CREATE OR REPLACE FUNCTION communication.enqueue_notification_sms(p_notification_id uuid, p_program_key text DEFAULT 'ai_matrx_owner_beta'::text)
 RETURNS TABLE(outbound_message_id uuid, sms_conversation_id uuid, refusal text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_n     communication.notification%rowtype;
  v_dest  communication.sms_phone_numbers%rowtype;
  v_conv  communication.sms_conversations%rowtype;
  v_res   record;
  v_key   text;
  v_msg   uuid;
begin
  select * into v_n from communication.notification where id = p_notification_id;
  if not found then
    return query select null::uuid, null::uuid, 'unknown_notification'::text; return;
  end if;
  if nullif(btrim(coalesce(v_n.to_address, '')), '') is null then
    return query select null::uuid, null::uuid, 'no_address'::text; return;
  end if;
  if nullif(btrim(coalesce(v_n.body, '')), '') is null then
    return query select null::uuid, null::uuid, 'no_body'::text; return;
  end if;

  -- The identity behind the number, from THE ONE resolver. Used for the seam only: the
  -- number we text is the notice's frozen to_address (AR2 LOCK 5).
  select r.party_id, r.contact_point_id, r.contact_medium_id
    into v_res
    from communication.resolve_channel_address(
           'sms', v_n.organization_id, v_n.recipient_kind, v_n.recipient_user_id,
           v_n.recipient_party_id, v_n.recipient_actor_token_id, v_n.to_address) r;

  select d.* into v_dest
    from communication.sms_phone_numbers d
   where d.program_key = p_program_key
     and d.is_active
     and d.provider_account_id is not null
     and d.deleted_at is null
   order by (d.organization_id = v_n.organization_id) desc, d.created_at
   limit 1;
  if not found then
    return query select null::uuid, null::uuid, 'no_sending_number'::text; return;
  end if;

  -- Get-or-create on the transport-context key the inbound webhook and the SMS assistant
  -- lane already use, so an inbound reply lands on the same conversation.
  select c.* into v_conv
    from communication.sms_conversations c
   where c.provider_account_id = v_dest.provider_account_id
     and c.destination_identity_id = v_dest.id
     and c.external_phone_number = v_n.to_address
     and c.program_key = v_dest.program_key
     and c.status = 'active'
     and c.deleted_at is null;

  if not found then
    insert into communication.sms_conversations (
      organization_id, user_id, external_phone_number, our_phone_number,
      conversation_type, provider, provider_account_id, destination_identity_id, program_key,
      party_id, contact_point_id, contact_medium_id, identity_status
    ) values (
      v_n.organization_id, v_n.recipient_user_id, v_n.to_address, v_dest.phone_number,
      'notification', v_dest.provider, v_dest.provider_account_id, v_dest.id,
      v_dest.program_key,
      v_res.party_id, v_res.contact_point_id, v_res.contact_medium_id,
      case when v_res.party_id is not null then 'resolved' else 'unresolved' end
    ) returning * into v_conv;
  elsif v_res.party_id is not null and v_conv.party_id is null then
    -- 🚨 THE SEAM CLOSING on a conversation that predates this lane: it declared these three
    -- columns and populated none of them. Only ever fills blanks — an existing answer is
    -- never overwritten by a resolution.
    update communication.sms_conversations c
       set party_id          = v_res.party_id,
           contact_point_id  = coalesce(c.contact_point_id, v_res.contact_point_id),
           contact_medium_id = coalesce(c.contact_medium_id, v_res.contact_medium_id),
           identity_status   = 'resolved',
           updated_at        = now()
     where c.id = v_conv.id
     returning * into v_conv;
  end if;

  v_key := 'notification:' || v_n.id::text;

  insert into communication.sms_messages (
    organization_id, conversation_id, provider, provider_account_id,
    direction, from_number, to_number, body, status,
    sent_by_type, ai_processed, ai_processing_status,
    idempotency_key, attempt_count, next_attempt_at, metadata
  ) values (
    v_n.organization_id, v_conv.id, v_dest.provider, v_dest.provider_account_id,
    'outbound', v_dest.phone_number, v_n.to_address, v_n.body, 'queued',
    'notification', true, 'completed',
    v_key, 0, now(),
    jsonb_build_object(
      'producer', 'communication.enqueue_notification_sms',
      'notification_id', v_n.id,
      'event_key', v_n.event_key,
      'program_key', v_dest.program_key,
      'party_id', v_res.party_id,
      'contact_point_id', v_res.contact_point_id,
      'contact_medium_id', v_res.contact_medium_id
    )
  )
  on conflict (idempotency_key) where idempotency_key is not null do nothing
  returning id into v_msg;

  if v_msg is null then
    -- A replay. The lane is idempotent by construction; hand back the row that exists.
    select m.id into v_msg
      from communication.sms_messages m
     where m.idempotency_key = v_key;
  end if;

  return query select v_msg, v_conv.id, null::text;
end
$function$;

CREATE OR REPLACE FUNCTION communication.sms_notification_gate(p_notification_id uuid, p_now timestamp with time zone DEFAULT now())
 RETURNS TABLE(decision text, refusal text, defer_until timestamp with time zone, resolved_timezone text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_n         communication.notification%rowtype;
  v_number    text;
  v_tz        text;
  v_tz_src    text;
  v_windows   jsonb;
  v_w         record;
  v_config    jsonb;
  v_exempt    boolean;
  v_mandatory boolean;
  v_sup       timestamptz;
  v_uns       timestamptz;
  v_dnc       text;
  v_qh_start  time;
  v_qh_end    time;
  v_local_now timestamp;
  v_probe     timestamp;
  v_probe_t   time;
  v_end_at    timestamp;
  v_moved     boolean;
  v_i         integer;
  v_max_hour  integer;
  v_max_day   integer;
  v_count     integer;
  v_day_start timestamptz;
  v_day_end   timestamptz;
begin
  select * into v_n from communication.notification where id = p_notification_id;
  if not found then
    return query select 'skip'::text, 'unknown_notification'::text, null::timestamptz, null::text;
    return;
  end if;

  v_number := nullif(btrim(coalesce(v_n.to_address, '')), '');
  if v_number is null then
    return query select 'skip'::text, 'no_address'::text, null::timestamptz, null::text;
    return;
  end if;

  ---------------------------------------------------------------- SUPPRESSION (terminal)
  -- crm.contact_medium is THE ONE suppression store. See the header.
  select cm.suppressed_at, cm.unsubscribed_at, cm.dnc_state
    into v_sup, v_uns, v_dnc
    from crm.contact_medium cm
   where cm.organization_id = v_n.organization_id
     and cm.channel = 'phone'
     and cm.value_key = v_number
     and cm.deleted_at is null
   order by cm.updated_at desc
   limit 1;
  if v_uns is not null then
    return query select 'skip'::text, 'opted_out'::text, null::timestamptz, null::text;
    return;
  elsif v_sup is not null then
    return query select 'skip'::text, 'suppressed'::text, null::timestamptz, null::text;
    return;
  elsif v_dnc = 'listed' then
    return query select 'skip'::text, 'dnc'::text, null::timestamptz, null::text;
    return;
  end if;

  ---------------------------------------------------------------- CONSENT (terminal)
  -- Keyed (phone_number, consent_type) GLOBALLY — §3.5: consent is per number, not per org.
  -- Personal Staff is its own program with its own consent row (consent_type 'ai_agent').
  -- A number with no ai_agent row at all enrolled before the split and keeps its legacy
  -- notifications consent; an ai_agent row, once present, is the only answer.
  if v_n.event_key like 'personal_staff.%' then
    if exists (
      select 1 from communication.sms_consent c
       where c.phone_number = v_number
         and c.consent_type in ('all', 'ai_agent')
         and c.status = 'opted_out'
         and c.deleted_at is null
    ) then
      return query select 'skip'::text, 'opted_out'::text, null::timestamptz, null::text;
      return;
    end if;
    if not exists (
      select 1 from communication.sms_consent c
       where c.phone_number = v_number
         and c.consent_type = 'ai_agent'
         and c.status = 'opted_in'
         and c.deleted_at is null
    ) and (
      exists (
        select 1 from communication.sms_consent c
         where c.phone_number = v_number
           and c.consent_type = 'ai_agent'
           and c.deleted_at is null
      ) or not exists (
        select 1 from communication.sms_consent c
         where c.phone_number = v_number
           and c.consent_type in ('all', 'notifications')
           and c.status = 'opted_in'
           and c.deleted_at is null
      )
    ) then
      return query select 'skip'::text, 'not_consented'::text, null::timestamptz, null::text;
      return;
    end if;
  elsif exists (
    select 1 from communication.sms_consent c
     where c.phone_number = v_number
       and c.consent_type in ('all', 'notifications')
       and c.status = 'opted_out'
       and c.deleted_at is null
  ) then
    return query select 'skip'::text, 'opted_out'::text, null::timestamptz, null::text;
    return;
  elsif not exists (
    select 1 from communication.sms_consent c
     where c.phone_number = v_number
       and c.consent_type in ('all', 'notifications')
       and c.status = 'opted_in'
       and c.deleted_at is null
  ) then
    -- "Employment is not consent." Absent or pending is a terminal skip with a reason.
    return query select 'skip'::text, 'not_consented'::text, null::timestamptz, null::text;
    return;
  end if;

  ---------------------------------------------------------------- the event's own flags
  select t.config into v_config
    from communication.notification_event_type t
   where t.event_key = v_n.event_key;
  v_exempt    := coalesce((v_config ->> 'quiet_hours_exempt')::boolean, false);
  v_mandatory := coalesce((v_config ->> 'mandatory')::boolean, false);

  ---------------------------------------------------------------- THE PERSON'S WINDOW
  -- 0998: the quiet window and the clock it is read on come from the PERSON, through
  -- the one ladder. What used to be inlined here could only see the org-scoped row.
  select w.timezone, w.timezone_source, w.quiet_windows
    into v_tz, v_tz_src, v_windows
    from communication.person_notification_window(
           v_n.recipient_user_id, v_n.organization_id, 'sms') w;

  if v_tz is null then
    -- The LOUD last resort. UTC is a guess about somebody's night, so it says so.
    v_tz := 'UTC';
    if not exists (
      select 1 from ops.system_error e
       where e.kind = 'notification_timezone_unknown'
         and e.organization_id = v_n.organization_id
         and e.user_id is not distinct from v_n.recipient_user_id
         and e.occurred_at > p_now - interval '24 hours'
    ) then
      perform ops.record_system_error(jsonb_build_object(
      'kind', 'notification_timezone_unknown',
      'user_id', v_n.recipient_user_id,
      'error_type', 'quiet_hours_timezone_fallback',
      'error_text', 'No timezone is known for this recipient, so their quiet hours were judged in UTC — '
        'a text can be held back in the middle of their afternoon, or land in the middle of '
        'their night. Remedy: ask the person for their timezone once (it belongs on '
        'communication.sms_notification_preferences.timezone at enrollment), or set the '
        'organization default (knob communication.notifications / default_timezone).',
      'source_app', 'aidream',
      'source_feature', 'communication.sms_notification_gate',
      'organization_id', v_n.organization_id,
      'occurred_at', p_now,
      'context', jsonb_build_object('notification_id', v_n.id, 'event_key', v_n.event_key,
                           'channel', 'sms', 'timezone_source', v_tz_src)));
    end if;
  end if;

  begin
    v_local_now := p_now at time zone v_tz;
  exception when others then
    v_tz := 'UTC';
    v_local_now := p_now at time zone v_tz;
  end;

  ---------------------------------------------------------------- QUIET HOURS (defer)
  -- The UNION of every window this person is owed, walked forward until no window
  -- contains the probe any more: an organization can only ever ADD quiet time.
  v_probe := v_local_now;
  if not v_exempt and jsonb_array_length(coalesce(v_windows, '[]'::jsonb)) > 0 then
    for v_i in 1..4 loop
      v_moved := false;
      for v_w in select value from jsonb_array_elements(v_windows) loop
        v_qh_start := (v_w.value ->> 'start')::time;
        v_qh_end   := (v_w.value ->> 'end')::time;
        if v_qh_start = v_qh_end then
          continue;
        end if;
        v_probe_t := v_probe::time;
        if (case
              when v_qh_start > v_qh_end then v_probe_t >= v_qh_start or v_probe_t < v_qh_end
              else v_probe_t >= v_qh_start and v_probe_t < v_qh_end
            end) then
          if v_qh_start > v_qh_end and v_probe_t >= v_qh_start then
            v_end_at := date_trunc('day', v_probe) + interval '1 day' + v_qh_end;
          else
            v_end_at := date_trunc('day', v_probe) + v_qh_end;
          end if;
          if v_end_at > v_probe then
            v_probe := v_end_at;
            v_moved := true;
          end if;
        end if;
      end loop;
      exit when not v_moved;
    end loop;
  end if;

  if v_probe > v_local_now then
    -- Jitter, so a whole shift is not texted in the same second (§3.4).
    return query select 'defer'::text, 'quiet_hours'::text,
                        (v_probe at time zone v_tz)
                          + make_interval(secs => floor(random() * 900)::integer),
                        v_tz;
    return;
  end if;

  ---------------------------------------------------------------- VOLUME CAPS (defer)
  -- 1016: how much we may say to this person comes from the PERSON, through the one
  -- ladder, exactly as the night does. What used to be inlined here could only see the
  -- org-scoped row, so the 10/50 on somebody's own enrollment was never read.
  select c.max_per_hour, c.max_per_day
    into v_max_hour, v_max_day
    from communication.person_notification_caps(
           v_n.recipient_user_id, v_n.organization_id, 'sms') c;

  if not v_mandatory and not v_exempt then
    select count(*) into v_count
      from communication.sms_messages m
     where m.organization_id = v_n.organization_id
       and m.to_number = v_number
       and m.direction = 'outbound'
       and m.created_at >= p_now - interval '1 hour'
       and m.deleted_at is null;
    if v_count >= v_max_hour then
      return query select 'defer'::text, 'hourly_rate_limit'::text,
                          date_trunc('hour', p_now) + interval '1 hour'
                            + make_interval(secs => floor(random() * 300)::integer),
                          v_tz;
      return;
    end if;

    v_day_start := date_trunc('day', v_local_now) at time zone v_tz;
    v_day_end   := (date_trunc('day', v_local_now) + interval '1 day') at time zone v_tz;
    select count(*) into v_count
      from communication.sms_messages m
     where m.organization_id = v_n.organization_id
       and m.to_number = v_number
       and m.direction = 'outbound'
       and m.created_at >= v_day_start
       and m.created_at <  v_day_end
       and m.deleted_at is null;
    if v_count >= v_max_day then
      return query select 'defer'::text, 'daily_rate_limit'::text,
                          v_day_end + make_interval(secs => floor(random() * 900)::integer),
                          v_tz;
      return;
    end if;
  end if;

  return query select 'send'::text, null::text, null::timestamptz, v_tz;
end
$function$;

