-- Safe, narrow recovery for a worker crash during one exact offered SMS command.
-- Ordinary pending claims intentionally keep their no-reclaim invariant.

drop function if exists communication.claim_recoverable_sms_command_turns(text, integer, integer);
create function communication.claim_recoverable_sms_command_turns(
  p_worker_id text,
  p_limit integer default 10,
  p_lease_seconds integer default 900
)
returns table (
  inbound_message_id uuid,
  sms_conversation_id uuid,
  chat_conversation_id uuid,
  chat_conversation_is_new boolean,
  user_id uuid,
  organization_id uuid,
  agent_id uuid,
  agent_version_id uuid,
  text text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if nullif(btrim(p_worker_id), '') is null then
    raise exception 'worker id is required' using errcode = '22023';
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
      and m.ai_processing_status = 'processing'
      and m.lease_expires_at is not null
      and m.lease_expires_at <= now()
      and nullif(btrim(m.processing_worker_id), '') is not null
      and regexp_replace(upper(btrim(coalesce(m.body, ''))), '[[:space:]]+', ' ', 'g') = 'DONE'
      and nullif(btrim(m.idempotency_key), '') is not null
      and nullif(btrim(m.provider), '') is not null
      and nullif(btrim(m.provider_account_id), '') is not null
      and nullif(btrim(m.twilio_sid), '') is not null
      and m.idempotency_key = concat(
        m.provider, ':inbound:', m.provider_account_id, ':', m.twilio_sid
      )
      and c.status = 'active'
      and c.deleted_at is null
      and c.identity_status = 'resolved'
      and c.chat_conversation_id is not null
      and c.user_id is not null
      and c.agent_id is not null
      and p.is_active
      and p.assistant_enabled
      and p.deleted_at is null
      and 1 = (
        select count(*)
        from platform.assists a
        cross join lateral (
          select a.metadata -> 'sms_reply_offer' as offer
        ) parsed
        join communication.sms_messages outbound
          on outbound.id = case
            when jsonb_typeof(parsed.offer -> 'outbound_sms_message_id') = 'string'
             and pg_input_is_valid(
               parsed.offer ->> 'outbound_sms_message_id', 'uuid'
             )
            then (parsed.offer ->> 'outbound_sms_message_id')::uuid
            else null
          end
         and outbound.direction = 'outbound'
         and outbound.conversation_id = m.conversation_id
         and outbound.organization_id = m.organization_id
         and outbound.deleted_at is null
        where a.user_id = c.user_id
          and a.organization_id = m.organization_id
          and a.source_key = 'notifications.task.sms_reply'
          and a.deleted_at is null
          and jsonb_typeof(a.metadata) = 'object'
          and jsonb_typeof(parsed.offer) = 'object'
          and not exists (
            select 1
            from jsonb_object_keys(
              case when jsonb_typeof(parsed.offer) = 'object'
                then parsed.offer else '{}'::jsonb end
            ) offer_key
            where offer_key not in (
              'version', 'allowed_aliases', 'operation', 'target_entity_type',
              'target_entity_id', 'outbound_sms_message_id'
            )
          )
          and parsed.offer ?& array[
            'version', 'allowed_aliases', 'operation', 'target_entity_type',
            'target_entity_id', 'outbound_sms_message_id'
          ]
          and jsonb_typeof(parsed.offer -> 'version') = 'number'
          and parsed.offer -> 'version' = '1'::jsonb
          and jsonb_typeof(parsed.offer -> 'allowed_aliases') = 'array'
          and jsonb_array_length(
            case when jsonb_typeof(parsed.offer -> 'allowed_aliases') = 'array'
              then parsed.offer -> 'allowed_aliases' else '[]'::jsonb end
          ) between 1 and 10
          and not exists (
            select 1
            from jsonb_array_elements(
              case when jsonb_typeof(parsed.offer -> 'allowed_aliases') = 'array'
                then parsed.offer -> 'allowed_aliases' else '[]'::jsonb end
            ) alias_value
            where jsonb_typeof(alias_value) <> 'string'
               or nullif(btrim(alias_value #>> '{}'), '') is null
          )
          and (
            select count(*) = count(distinct regexp_replace(
              upper(btrim(alias_value #>> '{}')), '[[:space:]]+', ' ', 'g'
            ))
            from jsonb_array_elements(
              case when jsonb_typeof(parsed.offer -> 'allowed_aliases') = 'array'
                then parsed.offer -> 'allowed_aliases' else '[]'::jsonb end
            ) alias_value
          )
          and exists (
            select 1
            from jsonb_array_elements(
              case when jsonb_typeof(parsed.offer -> 'allowed_aliases') = 'array'
                then parsed.offer -> 'allowed_aliases' else '[]'::jsonb end
            ) alias_value
            where jsonb_typeof(alias_value) = 'string'
              and regexp_replace(
                upper(btrim(alias_value #>> '{}')), '[[:space:]]+', ' ', 'g'
              ) = 'DONE'
          )
          and jsonb_typeof(parsed.offer -> 'operation') = 'object'
          and (parsed.offer -> 'operation') ?& array['kind', 'arguments']
          and not exists (
            select 1
            from jsonb_object_keys(
              case when jsonb_typeof(parsed.offer -> 'operation') = 'object'
                then parsed.offer -> 'operation' else '{}'::jsonb end
            ) operation_key
            where operation_key not in ('kind', 'arguments')
          )
          and jsonb_typeof(parsed.offer -> 'operation' -> 'kind') = 'string'
          and parsed.offer -> 'operation' ->> 'kind' = 'task.complete'
          and parsed.offer -> 'operation' -> 'arguments' = '{}'::jsonb
          and jsonb_typeof(parsed.offer -> 'target_entity_type') = 'string'
          and parsed.offer ->> 'target_entity_type' = 'task'
          and a.entity_type = parsed.offer ->> 'target_entity_type'
          and jsonb_typeof(parsed.offer -> 'target_entity_id') = 'string'
          and pg_input_is_valid(parsed.offer ->> 'target_entity_id', 'uuid')
          and a.entity_id = case
            when jsonb_typeof(parsed.offer -> 'target_entity_id') = 'string'
             and pg_input_is_valid(parsed.offer ->> 'target_entity_id', 'uuid')
            then (parsed.offer ->> 'target_entity_id')::uuid
            else null
          end
          and jsonb_typeof(parsed.offer -> 'outbound_sms_message_id') = 'string'
          and pg_input_is_valid(parsed.offer ->> 'outbound_sms_message_id', 'uuid')
          and (
            a.status = 'pending'
            or (
              a.status = 'accepted'
              and jsonb_typeof(a.result) = 'object'
              and a.result ->> 'idempotency_key' = m.idempotency_key
              and a.result ->> 'sms_message_id' = m.id::text
              and regexp_replace(
                upper(btrim(coalesce(a.result ->> 'alias', ''))),
                '[[:space:]]+', ' ', 'g'
              ) = 'DONE'
              and (
                (
                  a.result ->> 'kind' = 'sms_command_claim'
                  and a.result -> 'version' = '1'::jsonb
                  and a.result ->> 'status' = 'executing'
                )
                or (
                  a.result ->> 'kind' = 'sms_command_receipt'
                  and a.result -> 'version' = '1'::jsonb
                  and a.result ->> 'actor_user_id' = c.user_id::text
                )
              )
            )
          )
      )
    order by m.created_at
    for update of m skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 50))
  ), claimed as (
    update communication.sms_messages m
    set claimed_at = now(),
        lease_expires_at = now() + pg_catalog.make_interval(
          secs => greatest(15, least(coalesce(p_lease_seconds, 900), 900))
        ),
        processing_worker_id = p_worker_id,
        outcome_uncertain_at = null,
        updated_at = now()
    from candidates
    where m.id = candidates.id
      and m.ai_processing_status = 'processing'
      and m.lease_expires_at <= now()
    returning m.*
  )
  select
    claimed.id,
    c.id,
    c.chat_conversation_id,
    not exists (
      select 1
      from chat.conversation chat_row
      where chat_row.id = c.chat_conversation_id
    ),
    c.user_id,
    c.organization_id,
    c.agent_id,
    c.canonical_agent_version_id,
    claimed.body
  from claimed
  join communication.sms_conversations c on c.id = claimed.conversation_id
  order by claimed.created_at;
end;
$$;

revoke execute on function communication.claim_recoverable_sms_command_turns(text, integer, integer)
  from public, anon, authenticated;
grant execute on function communication.claim_recoverable_sms_command_turns(text, integer, integer)
  to service_role;

comment on function communication.claim_recoverable_sms_command_turns(text, integer, integer) is
  'Reclaims only expired processing DONE turns with one exact, correlated, replay-safe SMS task offer. Ordinary agent claims never reclaim leases.';
