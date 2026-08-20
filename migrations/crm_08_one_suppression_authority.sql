-- ONE SUPPRESSION AUTHORITY (Arman, 2026-08-14; violation found and fixed 2026-08-19).
--
-- A legal opt-out is ONE decision. Before this migration it had THREE deciders,
-- each with its own keyword list and its own store:
--
--   1. `crm.honor_reply_opt_out`      — the declared authority, but email-reply
--                                        shaped: it could only find a medium by
--                                        correlating a provider message id, so an
--                                        inbound SMS STOP could not use it.
--   2. `lib/sms/receive.ts:663-720`   — hand-wrote `crm.contact_medium` and
--                                        `crm.party_contact_point` directly.
--   3. `public.sms_handle_opt_out_keywords` (trigger on
--      `communication.sms_messages`)  — a THIRD keyword list writing
--                                        `communication.sms_consent`, and only
--                                        `WHERE status = 'opted_in'`, so a STOP
--                                        from a number with no consent row wrote
--                                        nothing at all.
--
-- This replaces all three with one channel-agnostic, direction-aware authority.
-- `crm.contact_medium` remains the one suppression store; `communication
-- .sms_consent` is demoted to a preference/verification record and is no longer
-- consulted as a suppression gate (`lib/sms/receive.ts:isPhoneNumberOptedOut`
-- now reads the medium).
--
-- `crm.honor_reply_opt_out` is DROPPED, not left beside its replacement: we do
-- not do legacy, and two functions would also make the 5-arg call ambiguous.

-- ---------------------------------------------------------------------------
-- 1. THE ONE AUTHORITY
-- ---------------------------------------------------------------------------
drop function if exists crm.honor_reply_opt_out(uuid, text, text, text, timestamptz);

-- Parameter ORDER is load-bearing: the correlated-reply arguments come first so
-- aidream's positional `call_function` can reach them without padding six
-- unrelated NULLs (a NULL whose only job is to move a cursor is a future bug).
create or replace function crm.honor_consent_decision(
  p_decision text,                                    -- 'opt_out' | 'opt_in'
  p_via text,                                         -- 'reply' | 'sms_keyword' | 'call' | 'link'
  p_reason text default null,                         -- suppression_reason to record
  p_identity_id uuid default null,                    -- correlated-reply path ...
  p_in_reply_to_provider_message_id text default null,
  p_reply_provider_message_id text default null,
  p_detected_phrase text default null,
  p_received_at timestamptz default now(),
  p_detail jsonb default '{}'::jsonb,
  p_medium_id uuid default null,                      -- medium-scoped path
  p_organization_id uuid default null,                -- value-scoped path ...
  p_channel text default null,                        --  ... (org, channel, value_key)
  p_value_key text default null,
  p_value_raw text default null
) returns jsonb
language plpgsql security definer
set search_path = crm, public, pg_temp
as $fn$
declare
  original crm.sending_event;
  v_correlated boolean := false;   -- never read `original` without this
  v_medium_id uuid := p_medium_id;
  v_created_medium boolean := false;
  v_already boolean := false;
  v_event_id uuid := null;
  v_via text := nullif(btrim(p_via), '');
  v_reason text;
  v_evidence jsonb := nullif(coalesce(p_detail, '{}'::jsonb), '{}'::jsonb);
begin
  if p_decision not in ('opt_out', 'opt_in') then
    raise exception 'p_decision must be opt_out or opt_in, got %', p_decision
      using errcode = '22023';
  end if;
  if v_via is null then
    raise exception 'a consent decision must say how it arrived (p_via)'
      using errcode = '22023';
  end if;
  v_reason := coalesce(nullif(btrim(p_reason), ''), v_via || '_opt_out');

  -- Path A: the caller already resolved the medium (SMS keyword, dialer).
  -- Path B: an email reply — correlate it to the send that provoked it.
  if v_medium_id is null
     and p_identity_id is not null
     and nullif(btrim(p_in_reply_to_provider_message_id), '') is not null then
    if nullif(btrim(p_reply_provider_message_id), '') is null
       or nullif(btrim(p_detected_phrase), '') is null then
      raise exception 'reply opt-out requires the original id, reply id, and detected phrase'
        using errcode = '22023';
    end if;

    select * into original
      from crm.sending_event
     where identity_id = p_identity_id
       and event_kind = 'sent'
       and provider_message_id = p_in_reply_to_provider_message_id
       and deleted_at is null
     order by occurred_at desc
     limit 1;

    if original.id is null or original.medium_id is null then
      return jsonb_build_object(
        'ok', false,
        'matched', false,
        'error', 'original_send_not_found');
    end if;
    v_correlated := true;
    v_medium_id := original.medium_id;
  end if;

  -- Path C: only the raw value is known. A STOP is the legal floor — it may
  -- never be silently dropped because we have not met this number before, so
  -- the medium is created rather than the decision discarded.
  if v_medium_id is null then
    if p_organization_id is null
       or nullif(btrim(p_channel), '') is null
       or nullif(btrim(p_value_key), '') is null then
      raise exception 'a consent decision needs a medium id, a correlated reply, or (organization_id, channel, value_key)'
        using errcode = '22023';
    end if;

    select id into v_medium_id
      from crm.contact_medium
     where organization_id = p_organization_id
       and channel = p_channel
       and coalesce(platform_slug, '') = ''
       and value_key = p_value_key
       and deleted_at is null
     limit 1;

    if v_medium_id is null then
      insert into crm.contact_medium
        (organization_id, channel, value_key, value_raw, consent_basis)
      values
        (p_organization_id, p_channel, p_value_key,
         coalesce(nullif(btrim(p_value_raw), ''), p_value_key), 'none')
      returning id into v_medium_id;
      v_created_medium := true;
    end if;
  end if;

  if p_decision = 'opt_out' then
    select unsubscribed_at is not null into v_already
      from crm.contact_medium where id = v_medium_id;

    -- Suppression never downgrades: an earlier opt-out keeps its own timestamp
    -- and reason, so a second STOP is a no-op rather than a rewritten history.
    update crm.contact_medium
       set unsubscribed_at = coalesce(unsubscribed_at, p_received_at),
           suppressed_at = coalesce(suppressed_at, p_received_at),
           suppression_reason = coalesce(suppression_reason, v_reason),
           suppression_expires_at = null,
           consent_basis = 'none',
           consent_source = v_via,
           -- An empty p_detail means "the caller had no evidence to add", not
           -- "erase what we already recorded".
           consent_evidence = coalesce(v_evidence, consent_evidence),
           consent_evidence_at = case when v_evidence is null
                                 then consent_evidence_at else p_received_at end
     where id = v_medium_id;

    update crm.party_contact_point
       set opt_out_at = coalesce(opt_out_at, p_received_at),
           opt_out_source = coalesce(opt_out_source, v_via)
     where medium_id = v_medium_id
       and deleted_at is null;

    -- The outreach ledger only exists where a sending identity sent something.
    -- An SMS STOP has no identity, so there is no event to write — the medium
    -- and the channel's own message log carry the trail.
    if v_correlated then
      insert into crm.sending_event
        (identity_id, event_kind, party_id, medium_id, outreach_list_id,
         interaction_id, to_address_key, provider_message_id, actor_kind,
         occurred_at, organization_id, detail)
      values
        (original.identity_id, 'unsubscribed', original.party_id,
         original.medium_id, original.outreach_list_id, original.interaction_id,
         original.to_address_key, p_reply_provider_message_id, 'system',
         p_received_at, original.organization_id,
         jsonb_build_object(
           'via', v_via,
           'in_reply_to_provider_message_id', p_in_reply_to_provider_message_id,
           'detected_phrase', p_detected_phrase) || coalesce(v_evidence, '{}'::jsonb))
      on conflict (identity_id, event_kind, provider_message_id)
        where provider_message_id is not null and deleted_at is null
      do nothing
      returning id into v_event_id;
    end if;
  else
    select consent_basis <> 'none' and unsubscribed_at is null into v_already
      from crm.contact_medium where id = v_medium_id;

    -- Only the person can reverse their own opt-out, and this is that act:
    -- START/UNSTOP arrived from the number itself. `consent_recorded_at` and
    -- `consent_source` are both required by the medium's consent constraints
    -- once the basis is anything other than 'none'.
    update crm.contact_medium
       set consent_basis = 'express',
           consent_recorded_at = p_received_at,
           consent_source = v_via,
           consent_evidence = coalesce(v_evidence, consent_evidence),
           consent_evidence_at = case when v_evidence is null
                                 then consent_evidence_at else p_received_at end,
           unsubscribed_at = null,
           suppressed_at = null,
           suppression_reason = null,
           suppression_expires_at = null
     where id = v_medium_id;

    update crm.party_contact_point
       set opt_out_at = null,
           opt_out_source = null
     where medium_id = v_medium_id
       and deleted_at is null;
  end if;

  return jsonb_build_object(
    'ok', true,
    'matched', true,
    'decision', p_decision,
    'already_unsubscribed', v_already,
    'medium_id', v_medium_id,
    'created_medium', v_created_medium,
    'event_id', v_event_id);
end
$fn$;

revoke all on function crm.honor_consent_decision(
  text, text, text, uuid, text, text, text, timestamptz, jsonb, uuid, uuid,
  text, text, text) from public, anon, authenticated;
grant execute on function crm.honor_consent_decision(
  text, text, text, uuid, text, text, text, timestamptz, jsonb, uuid, uuid,
  text, text, text) to service_role;

comment on function crm.honor_consent_decision(
  text, text, text, uuid, text, text, text, timestamptz, jsonb, uuid, uuid,
  text, text, text) is
  'THE ONE SUPPRESSION AUTHORITY. Every legal opt-out and self-service opt-in — an email reply, an SMS STOP/START, a spoken do-not-call — is written here and nowhere else. Resolves the medium three ways (id, correlated reply, or org+channel+value_key, creating the medium rather than dropping a STOP) and writes crm.contact_medium + crm.party_contact_point atomically. Replaced crm.honor_reply_opt_out, which could only express an email reply.';

-- ---------------------------------------------------------------------------
-- 2. KILL THE SECOND DECIDER
-- ---------------------------------------------------------------------------
-- `public.sms_handle_opt_out_keywords` classified STOP/START itself, off its own
-- keyword array, and wrote `communication.sms_consent` only when a row was
-- already `opted_in`. Nothing migrates: `sms_consent` holds 1 row and 0 are
-- `opted_out`, verified live before the drop.
drop trigger if exists trg_sms_opt_out_handler on communication.sms_messages;
drop function if exists public.sms_handle_opt_out_keywords();
