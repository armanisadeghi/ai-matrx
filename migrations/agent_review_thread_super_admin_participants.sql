-- Agent Review is super-admin scoped, so its linked DM threads must be visible
-- from every account that can open the review surface. Applied live.

insert into communication.dm_conversation_participants (
  conversation_id, user_id, role, organization_id, created_by, metadata
)
select
  q.conversation_id,
  a.user_id,
  'owner',
  '5dc930e9-bd65-44a1-8369-af773f6e1a5b'::uuid,
  a.user_id,
  jsonb_build_object('kind', 'agent_review_owner')
from agent.review_queue q
cross join admin.admins a
where q.conversation_id is not null
  and a.level = 'super_admin'
on conflict (conversation_id, user_id) do nothing;

create or replace function agent.create_review_thread()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, agent, communication, platform, admin
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
  )
  select
    v_conversation_id, a.user_id, 'owner', v_org, a.user_id,
    jsonb_build_object('kind', 'agent_review_owner')
  from admin.admins a
  where a.level = 'super_admin'
  on conflict (conversation_id, user_id) do nothing;

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

revoke all on function agent.create_review_thread() from public, anon, authenticated;
grant execute on function agent.create_review_thread() to service_role, postgres;
