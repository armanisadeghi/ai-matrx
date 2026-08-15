-- Regression proof for communication.claim_recoverable_sms_command_turns.
-- Every fixture and claim is rolled back. Run with ON_ERROR_STOP=1.

begin;

create temporary table sms_reclaim_context on commit drop as
select
  c.organization_id,
  c.user_id,
  a.id as agent_id
from communication.sms_conversations c
cross join lateral (
  select definition.id
  from agent.definition
  where definition.deleted_at is null
  order by definition.created_at
  limit 1
) a
where c.user_id is not null
  and c.organization_id is not null
limit 1;

do $fixture$
begin
  if not exists (select 1 from sms_reclaim_context) then
    raise exception 'SMS reclaim test requires one user/org and one canonical agent';
  end if;
end;
$fixture$;

create function pg_temp.sms_reclaim_offer(p_outbound uuid, p_target uuid, p_aliases jsonb default '["DONE"]'::jsonb)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'sms_reply_offer', jsonb_build_object(
      'version', 1,
      'allowed_aliases', p_aliases,
      'operation', jsonb_build_object('kind', 'task.complete', 'arguments', '{}'::jsonb),
      'target_entity_type', 'task',
      'target_entity_id', p_target::text,
      'outbound_sms_message_id', p_outbound::text
    )
  );
$$;

insert into communication.sms_phone_numbers (
  id, user_id, phone_number, twilio_sid, organization_id,
  provider, provider_account_id, program_key, is_active, assistant_enabled
)
select
  '10000000-0000-4000-8000-000000000001', user_id,
  '+19995550001', 'PN_RECLAIM_TEST', organization_id,
  'twilio', 'AC_RECLAIM_TEST', 'sms_reclaim_test', true, true
from sms_reclaim_context;

insert into communication.sms_conversations (
  id, organization_id, user_id, external_phone_number, our_phone_number,
  status, conversation_type, provider, provider_account_id,
  destination_identity_id, program_key, chat_conversation_id,
  agent_id, identity_status
)
select
  fixture.id, context.organization_id, context.user_id,
  fixture.external_number, '+19995550001', 'active', 'user_initiated',
  'twilio', 'AC_RECLAIM_TEST', '10000000-0000-4000-8000-000000000001',
  'sms_reclaim_test', fixture.chat_id, context.agent_id, 'resolved'
from sms_reclaim_context context
cross join (values
  ('20000000-0000-4000-8000-000000000001'::uuid, '+19995551001', '70000000-0000-4000-8000-000000000001'::uuid),
  ('20000000-0000-4000-8000-000000000002'::uuid, '+19995551002', '70000000-0000-4000-8000-000000000002'::uuid),
  ('20000000-0000-4000-8000-000000000003'::uuid, '+19995551003', '70000000-0000-4000-8000-000000000003'::uuid),
  ('20000000-0000-4000-8000-000000000004'::uuid, '+19995551004', '70000000-0000-4000-8000-000000000004'::uuid),
  ('20000000-0000-4000-8000-000000000005'::uuid, '+19995551005', '70000000-0000-4000-8000-000000000005'::uuid),
  ('20000000-0000-4000-8000-000000000006'::uuid, '+19995551006', '70000000-0000-4000-8000-000000000006'::uuid),
  ('20000000-0000-4000-8000-000000000007'::uuid, '+19995551007', '70000000-0000-4000-8000-000000000007'::uuid),
  ('20000000-0000-4000-8000-000000000008'::uuid, '+19995551008', '70000000-0000-4000-8000-000000000008'::uuid),
  ('20000000-0000-4000-8000-000000000009'::uuid, '+19995551009', '70000000-0000-4000-8000-000000000009'::uuid),
  ('20000000-0000-4000-8000-000000000010'::uuid, '+19995551010', '70000000-0000-4000-8000-000000000010'::uuid),
  ('20000000-0000-4000-8000-000000000011'::uuid, '+19995551011', '70000000-0000-4000-8000-000000000011'::uuid),
  ('20000000-0000-4000-8000-000000000012'::uuid, '+19995551012', '70000000-0000-4000-8000-000000000012'::uuid),
  ('20000000-0000-4000-8000-000000000013'::uuid, '+19995551013', '70000000-0000-4000-8000-000000000013'::uuid)
) fixture(id, external_number, chat_id);

-- One outbound message for every offer; the last belongs to another conversation.
insert into communication.sms_messages (
  id, organization_id, conversation_id, twilio_sid, direction,
  from_number, to_number, body, status, sent_by_type,
  ai_processing_status, provider, provider_account_id, idempotency_key
)
select
  fixture.id, context.organization_id, fixture.conversation_id,
  'SM_OUT_' || right(fixture.id::text, 4), 'outbound',
  '+19995550001', '+19995551001', 'Reply DONE', 'sent', 'system',
  'completed', 'twilio', 'AC_RECLAIM_TEST', 'test:outbound:' || fixture.id::text
from sms_reclaim_context context
cross join (values
  ('31000000-0000-4000-8000-000000000001'::uuid, '20000000-0000-4000-8000-000000000001'::uuid),
  ('31000000-0000-4000-8000-000000000002'::uuid, '20000000-0000-4000-8000-000000000002'::uuid),
  ('31000000-0000-4000-8000-000000000003'::uuid, '20000000-0000-4000-8000-000000000003'::uuid),
  ('31000000-0000-4000-8000-000000000004'::uuid, '20000000-0000-4000-8000-000000000006'::uuid),
  ('31000000-0000-4000-8000-000000000005'::uuid, '20000000-0000-4000-8000-000000000007'::uuid),
  ('31000000-0000-4000-8000-000000000006'::uuid, '20000000-0000-4000-8000-000000000008'::uuid),
  ('31000000-0000-4000-8000-000000000007'::uuid, '20000000-0000-4000-8000-000000000009'::uuid),
  ('31000000-0000-4000-8000-000000000008'::uuid, '20000000-0000-4000-8000-000000000005'::uuid),
  ('31000000-0000-4000-8000-000000000009'::uuid, '20000000-0000-4000-8000-000000000005'::uuid),
  ('31000000-0000-4000-8000-000000000010'::uuid, '20000000-0000-4000-8000-000000000013'::uuid),
  ('31000000-0000-4000-8000-000000000011'::uuid, '20000000-0000-4000-8000-000000000011'::uuid)
) fixture(id, conversation_id);

-- Twelve expired processing fixtures plus one nonexpired fixture.
insert into communication.sms_messages (
  id, organization_id, conversation_id, twilio_sid, direction,
  from_number, to_number, body, status, sent_by_type,
  ai_processing_status, provider, provider_account_id, idempotency_key,
  claimed_at, lease_expires_at, processing_worker_id
)
select
  fixture.id, context.organization_id,
  fixture.conversation_id, fixture.sid, 'inbound',
  '+19995551001', '+19995550001', fixture.body, 'received', 'user',
  'processing', 'twilio', 'AC_RECLAIM_TEST',
  'twilio:inbound:AC_RECLAIM_TEST:' || fixture.sid,
  now() - interval '20 minutes',
  case when fixture.nonexpired then now() + interval '5 minutes' else now() - interval '5 minutes' end,
  'dead-worker'
from sms_reclaim_context context
cross join (values
  ('41000000-0000-4000-8000-000000000001'::uuid, '20000000-0000-4000-8000-000000000001'::uuid, 'SM_IN_PENDING', ' done ', false),
  ('41000000-0000-4000-8000-000000000002'::uuid, '20000000-0000-4000-8000-000000000002'::uuid, 'SM_IN_CLAIM', 'DONE', false),
  ('41000000-0000-4000-8000-000000000003'::uuid, '20000000-0000-4000-8000-000000000003'::uuid, 'SM_IN_RECEIPT', 'DONE', false),
  ('41000000-0000-4000-8000-000000000004'::uuid, '20000000-0000-4000-8000-000000000004'::uuid, 'SM_IN_ZERO', 'DONE', false),
  ('41000000-0000-4000-8000-000000000005'::uuid, '20000000-0000-4000-8000-000000000005'::uuid, 'SM_IN_AMBIG', 'DONE', false),
  ('41000000-0000-4000-8000-000000000006'::uuid, '20000000-0000-4000-8000-000000000006'::uuid, 'SM_IN_CHAT', 'hello', false),
  ('41000000-0000-4000-8000-000000000007'::uuid, '20000000-0000-4000-8000-000000000007'::uuid, 'SM_IN_POLICY', 'STOP', false),
  ('41000000-0000-4000-8000-000000000008'::uuid, '20000000-0000-4000-8000-000000000008'::uuid, 'SM_IN_OTHERKEY', 'DONE', false),
  ('41000000-0000-4000-8000-000000000009'::uuid, '20000000-0000-4000-8000-000000000009'::uuid, 'SM_IN_NONEXPIRED', 'DONE', true),
  ('41000000-0000-4000-8000-000000000010'::uuid, '20000000-0000-4000-8000-000000000010'::uuid, 'SM_IN_BADUUID', 'DONE', false),
  ('41000000-0000-4000-8000-000000000011'::uuid, '20000000-0000-4000-8000-000000000011'::uuid, 'SM_IN_BADALIASES', 'DONE', false),
  ('41000000-0000-4000-8000-000000000012'::uuid, '20000000-0000-4000-8000-000000000012'::uuid, 'SM_IN_WRONGCONV', 'DONE', false)
) fixture(id, conversation_id, sid, body, nonexpired);

-- Positive: pending, accepted same-key executing, accepted same-key final receipt.
insert into platform.assists (
  id, user_id, organization_id, entity_type, entity_id, source_key,
  title, action, status, decided_at, decided_by, result, metadata, dedupe_key
)
select
  fixture.assist_id, context.user_id, context.organization_id, 'task', fixture.target_id,
  'notifications.task.sms_reply', 'SMS task reply test', '{"kind":"navigate"}',
  fixture.status,
  case when fixture.status = 'accepted' then now() else null end,
  case when fixture.status = 'accepted' then context.user_id else null end,
  case
    when fixture.assist_id = '51000000-0000-4000-8000-000000000003'::uuid
      then jsonb_set(fixture.result, '{actor_user_id}', to_jsonb(context.user_id::text))
    else fixture.result
  end,
  pg_temp.sms_reclaim_offer(fixture.outbound_id, fixture.target_id),
  'sms-reclaim-test:' || fixture.assist_id::text
from sms_reclaim_context context
cross join (values
  (
    '51000000-0000-4000-8000-000000000001'::uuid,
    '61000000-0000-4000-8000-000000000001'::uuid,
    '31000000-0000-4000-8000-000000000001'::uuid,
    'pending'::text, null::jsonb
  ),
  (
    '51000000-0000-4000-8000-000000000002'::uuid,
    '61000000-0000-4000-8000-000000000002'::uuid,
    '31000000-0000-4000-8000-000000000002'::uuid,
    'accepted', jsonb_build_object(
      'kind','sms_command_claim','version',1,'status','executing',
      'idempotency_key','twilio:inbound:AC_RECLAIM_TEST:SM_IN_CLAIM',
      'sms_message_id','41000000-0000-4000-8000-000000000002','alias','DONE'
    )
  ),
  (
    '51000000-0000-4000-8000-000000000003'::uuid,
    '61000000-0000-4000-8000-000000000003'::uuid,
    '31000000-0000-4000-8000-000000000003'::uuid,
    'accepted', jsonb_build_object(
      'kind','sms_command_receipt','version',1,'status','completed',
      'idempotency_key','twilio:inbound:AC_RECLAIM_TEST:SM_IN_RECEIPT',
      'sms_message_id','41000000-0000-4000-8000-000000000003',
      'actor_user_id','ACTOR_PLACEHOLDER','alias','DONE',
      'action_receipt',jsonb_build_object('verb','update','noun','task','status','applied')
    )
  )
) fixture(assist_id, target_id, outbound_id, status, result);

-- Negative valid offers: ambiguity, chat, policy, other-key, nonexpired, wrong conversation.
insert into platform.assists (
  id, user_id, organization_id, entity_type, entity_id, source_key,
  title, action, status, decided_at, decided_by, result, metadata, dedupe_key
)
select
  fixture.assist_id, context.user_id, context.organization_id, 'task', fixture.target_id,
  'notifications.task.sms_reply', 'SMS task reply negative test', '{"kind":"navigate"}',
  fixture.status,
  case when fixture.status = 'accepted' then now() else null end,
  case when fixture.status = 'accepted' then context.user_id else null end,
  case when fixture.status = 'accepted' then jsonb_build_object(
    'kind','sms_command_claim','version',1,'status','executing',
    'idempotency_key',fixture.result_key,'sms_message_id',fixture.inbound_id::text,'alias','DONE'
  ) else null end,
  pg_temp.sms_reclaim_offer(fixture.outbound_id, fixture.target_id),
  'sms-reclaim-test:' || fixture.assist_id::text
from sms_reclaim_context context
cross join (values
  ('51000000-0000-4000-8000-000000000004'::uuid,'61000000-0000-4000-8000-000000000004'::uuid,'31000000-0000-4000-8000-000000000008'::uuid,'41000000-0000-4000-8000-000000000005'::uuid,'pending'::text,null::text),
  ('51000000-0000-4000-8000-000000000005'::uuid,'61000000-0000-4000-8000-000000000005'::uuid,'31000000-0000-4000-8000-000000000009'::uuid,'41000000-0000-4000-8000-000000000005'::uuid,'pending',null),
  ('51000000-0000-4000-8000-000000000006'::uuid,'61000000-0000-4000-8000-000000000006'::uuid,'31000000-0000-4000-8000-000000000004'::uuid,'41000000-0000-4000-8000-000000000006'::uuid,'pending',null),
  ('51000000-0000-4000-8000-000000000007'::uuid,'61000000-0000-4000-8000-000000000007'::uuid,'31000000-0000-4000-8000-000000000005'::uuid,'41000000-0000-4000-8000-000000000007'::uuid,'pending',null),
  ('51000000-0000-4000-8000-000000000008'::uuid,'61000000-0000-4000-8000-000000000008'::uuid,'31000000-0000-4000-8000-000000000006'::uuid,'41000000-0000-4000-8000-000000000008'::uuid,'accepted','twilio:inbound:AC_RECLAIM_TEST:OTHER'),
  ('51000000-0000-4000-8000-000000000009'::uuid,'61000000-0000-4000-8000-000000000009'::uuid,'31000000-0000-4000-8000-000000000007'::uuid,'41000000-0000-4000-8000-000000000009'::uuid,'pending',null),
  ('51000000-0000-4000-8000-000000000010'::uuid,'61000000-0000-4000-8000-000000000010'::uuid,'31000000-0000-4000-8000-000000000010'::uuid,'41000000-0000-4000-8000-000000000012'::uuid,'pending',null)
) fixture(assist_id,target_id,outbound_id,inbound_id,status,result_key);

-- Malformed UUID and duplicate normalized aliases must fail closed without raising.
insert into platform.assists (
  id, user_id, organization_id, entity_type, entity_id, source_key,
  title, action, metadata, dedupe_key
)
select
  fixture.assist_id, context.user_id, context.organization_id, 'task', fixture.target_id,
  'notifications.task.sms_reply', 'Malformed SMS task reply test', '{"kind":"navigate"}',
  fixture.metadata, 'sms-reclaim-test:' || fixture.assist_id::text
from sms_reclaim_context context
cross join (values
  (
    '51000000-0000-4000-8000-000000000011'::uuid,
    '61000000-0000-4000-8000-000000000011'::uuid,
    jsonb_build_object('sms_reply_offer',jsonb_build_object(
      'version',1,'allowed_aliases',jsonb_build_array('DONE'),
      'operation',jsonb_build_object('kind','task.complete','arguments','{}'::jsonb),
      'target_entity_type','task','target_entity_id','not-a-uuid',
      'outbound_sms_message_id','also-not-a-uuid'
    ))
  ),
  (
    '51000000-0000-4000-8000-000000000012'::uuid,
    '61000000-0000-4000-8000-000000000012'::uuid,
    pg_temp.sms_reclaim_offer(
      '31000000-0000-4000-8000-000000000011',
      '61000000-0000-4000-8000-000000000012',
      '["DONE"," done "]'::jsonb
    )
  )
) fixture(assist_id,target_id,metadata);

create temporary table first_claim on commit drop as
select *
from communication.claim_recoverable_sms_command_turns('recovery-worker-a', 50, 900);

do $assertions$
declare
  expected uuid[] := array[
    '41000000-0000-4000-8000-000000000001'::uuid,
    '41000000-0000-4000-8000-000000000002'::uuid,
    '41000000-0000-4000-8000-000000000003'::uuid
  ];
  actual uuid[];
  second_count integer;
  normal_claim_definition text;
begin
  select array_agg(inbound_message_id order by inbound_message_id)
  into actual
  from first_claim;
  if actual is distinct from expected then
    raise exception 'safe reclaim selected %, expected %', actual, expected;
  end if;

  if exists (
    select 1 from first_claim
    where sms_conversation_id is null or chat_conversation_id is null
      or user_id is null or organization_id is null or agent_id is null or text is null
  ) then
    raise exception 'safe reclaim did not return the canonical nine-column turn context';
  end if;

  -- A simultaneous claimant is serialized by the row lock; after commit it also sees the
  -- refreshed lease. This second claimant proves the persisted half of that concurrency fence.
  select count(*) into second_count
  from communication.claim_recoverable_sms_command_turns('recovery-worker-b', 50, 900);
  if second_count <> 0 then
    raise exception 'a second worker reclaimed % already-leased command turns', second_count;
  end if;

  select pg_get_functiondef(
    'communication.claim_recoverable_sms_command_turns(text,integer,integer)'::regprocedure
  ) into normal_claim_definition;
  if position('FOR UPDATE OF M SKIP LOCKED' in upper(normal_claim_definition)) = 0 then
    raise exception 'safe reclaim lost its atomic SKIP LOCKED concurrency fence';
  end if;

  select pg_get_functiondef(
    'communication.claim_pending_sms_agent_turns(text,integer,integer)'::regprocedure
  ) into normal_claim_definition;
  if encode(digest(normal_claim_definition, 'sha256'), 'hex')
     <> '6bf774df678fa9712d7ec385e2f4f628ae6590bd073a72e13317eca073e68088' then
    raise exception 'ordinary SMS claim changed while adding the isolated recovery path';
  end if;
end;
$assertions$;

rollback;
