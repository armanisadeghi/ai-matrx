-- A text that is only a picture, a video, a voice memo, a contact or a file is a
-- message the person's agent must answer.
--
-- Until 2026-09-27 the agent-turn claim required a non-blank body, so an MMS
-- with no words was never claimed: it stayed `ai_processing_status='pending'`
-- forever and the person heard nothing. The claim now admits a row with a body
-- OR at least one attachment. The SMS worker reads the attachments itself
-- (aidream `communications/inbound_attachments.py`); the returned `text` stays
-- the body, which may now be ''.
--
-- Body-only change: same signature, same grants.

CREATE OR REPLACE FUNCTION communication.claim_pending_sms_agent_turns(p_worker_id text, p_limit integer DEFAULT 10, p_lease_seconds integer DEFAULT 120)
 RETURNS TABLE(inbound_message_id uuid, sms_conversation_id uuid, chat_conversation_id uuid, chat_conversation_is_new boolean, user_id uuid, organization_id uuid, agent_id uuid, agent_version_id uuid, text text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if nullif(btrim(p_worker_id), '') is null then
    raise exception 'worker id is required';
  end if;

  return query
  with candidates as (
    select m.id
    from communication.sms_messages m
    join communication.sms_conversations c on c.id = m.conversation_id
    join communication.sms_phone_numbers p on p.id = c.destination_identity_id
    where m.direction = 'inbound'
      and m.status = 'received'
      and m.deleted_at is null
      and m.next_attempt_at <= now()
      and m.ai_processing_status = 'pending'
      and c.status = 'active'
      and c.deleted_at is null
      and c.identity_status = 'resolved'
      and c.chat_conversation_id is not null
      and c.user_id is not null
      and p.is_active
      and p.assistant_enabled
      and p.deleted_at is null
      and (
        nullif(btrim(coalesce(m.body, '')), '') is not null
        or coalesce(m.num_media, 0) > 0
        or coalesce(cardinality(m.media_urls), 0) > 0
      )
    order by m.created_at
    for update of m skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 50))
  ), claimed as (
    update communication.sms_messages m
    set ai_processing_status = 'processing',
        claimed_at = now(),
        lease_expires_at = now() + pg_catalog.make_interval(
          secs => greatest(15, least(coalesce(p_lease_seconds, 120), 900))
        ),
        processing_worker_id = p_worker_id,
        outcome_uncertain_at = null,
        updated_at = now()
    from candidates
    where m.id = candidates.id
    returning m.*
  )
  select
    claimed.id,
    c.id,
    c.chat_conversation_id,
    not exists (
      select 1 from chat.conversation chat_row
      where chat_row.id = c.chat_conversation_id
    ),
    c.user_id,
    c.organization_id,
    c.agent_id,
    c.canonical_agent_version_id,
    coalesce(claimed.body, '')
  from claimed
  join communication.sms_conversations c on c.id = claimed.conversation_id
  order by claimed.created_at;
end;
$function$;
