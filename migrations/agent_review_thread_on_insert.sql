-- Every new review submission gets its Messages thread atomically. Applied live.

alter table agent.review_queue alter column status set default 'submitted';

create or replace function agent.create_review_thread()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, agent, communication, platform
as $$
declare
  v_conversation_id uuid;
  v_admin_user constant uuid := '4cf62e4e-2679-484f-b652-034e697418df';
  v_org constant uuid := '5dc930e9-bd65-44a1-8369-af773f6e1a5b';
begin
  if new.conversation_id is not null then return new; end if;

  insert into communication.dm_conversations (
    type, group_name, created_by, organization_id, visibility, metadata
  ) values (
    'group', new.title, v_admin_user, v_org, 'personal',
    jsonb_build_object(
      'kind', 'agent_review',
      'review_queue_id', new.id,
      'review_url', '/administration/users/agent-review/' || new.id,
      'source', new.source,
      'repo_slug', new.repo_slug,
      'domain_id', new.domain_id,
      'feature_id', new.feature_id
    )
  ) returning id into v_conversation_id;

  insert into communication.dm_conversation_participants (
    conversation_id, user_id, role, organization_id, created_by, metadata
  ) values (
    v_conversation_id, v_admin_user, 'owner', v_org, v_admin_user,
    jsonb_build_object('kind', 'agent_review_owner')
  );

  insert into communication.dm_messages (
    conversation_id, sender_id, content, message_type, status,
    client_message_id, organization_id, created_by, metadata, action_data
  ) values (
    v_conversation_id, v_admin_user, new.instructions, 'system', 'sent',
    'agent-review:' || new.id || ':submission', v_org, v_admin_user,
    jsonb_build_object(
      'actor_kind', 'agent',
      'actor_label', coalesce(new.metadata->'origin'->>'agent_label', new.source),
      'review_event', 'submitted',
      'review_queue_id', new.id
    ),
    jsonb_build_object(
      'kind', 'open_link', 'version', 1,
      'payload', jsonb_build_object(
        'href', '/administration/users/agent-review/' || new.id,
        'label', 'Open review'
      )
    )
  );

  new.conversation_id := v_conversation_id;
  return new;
end $$;

drop trigger if exists review_queue_create_thread on agent.review_queue;
create trigger review_queue_create_thread
  before insert on agent.review_queue
  for each row execute function agent.create_review_thread();

revoke all on function agent.create_review_thread() from public, anon, authenticated;
grant execute on function agent.create_review_thread() to service_role, postgres;
