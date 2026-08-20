-- Agent Review becomes an agent-first workflow with one durable DM conversation
-- per review item. Applied live to Matrx Main before this record was committed.

alter table agent.review_queue
  add column if not exists conversation_id uuid
    references communication.dm_conversations(id) on delete set null;

create unique index if not exists review_queue_conversation_id_uidx
  on agent.review_queue (conversation_id)
  where conversation_id is not null;

alter table agent.review_queue drop constraint if exists review_queue_status_check;

update agent.review_queue
set status = case status
  when 'pending' then 'submitted'
  when 'changes_requested' then 'human_changes_requested'
  else status
end;

alter table agent.review_queue
  add constraint review_queue_status_check check (
    status in (
      'submitted',
      'agent_review',
      'agent_changes_requested',
      'ready_for_human',
      'human_changes_requested',
      'approved',
      'archived'
    )
  );

comment on table agent.review_queue is
  'Agent-first review workflow. submitted/agent_review/agent_changes_requested are agent-owned; ready_for_human is Arman''s inbox; human_changes_requested returns to agents; approved/archived close the loop. Every item links to one communication.dm_conversations thread.';

comment on column agent.review_queue.conversation_id is
  'Durable conversation shared with the Messages system; review instructions, agent findings, human feedback, repairs, and later rounds are ordered messages, never overwritten fields.';

do $$
declare
  v_row agent.review_queue%rowtype;
  v_conversation_id uuid;
  v_admin_user constant uuid := '4cf62e4e-2679-484f-b652-034e697418df';
  v_org constant uuid := '5dc930e9-bd65-44a1-8369-af773f6e1a5b';
begin
  for v_row in
    select * from agent.review_queue
    where conversation_id is null and status <> 'archived'
    order by created_at
  loop
    insert into communication.dm_conversations (
      type, group_name, created_by, organization_id, visibility, metadata,
      created_at, updated_at
    ) values (
      'group', v_row.title, v_admin_user, v_org, 'personal',
      jsonb_build_object(
        'kind', 'agent_review',
        'review_queue_id', v_row.id,
        'review_url', '/administration/users/agent-review/' || v_row.id,
        'source', v_row.source,
        'repo_slug', v_row.repo_slug,
        'domain_id', v_row.domain_id,
        'feature_id', v_row.feature_id
      ),
      v_row.created_at, v_row.updated_at
    ) returning id into v_conversation_id;

    insert into communication.dm_conversation_participants (
      conversation_id, user_id, role, organization_id, created_by,
      joined_at, created_at, updated_at, metadata
    ) values (
      v_conversation_id, v_admin_user, 'owner', v_org, v_admin_user,
      v_row.created_at, v_row.created_at, v_row.updated_at,
      jsonb_build_object('kind', 'agent_review_owner')
    );

    insert into communication.dm_messages (
      conversation_id, sender_id, content, message_type, status,
      client_message_id, organization_id, created_by, created_at, updated_at,
      metadata, action_data
    ) values (
      v_conversation_id,
      v_admin_user,
      v_row.instructions,
      'system',
      'sent',
      'agent-review:' || v_row.id || ':submission',
      v_org,
      v_admin_user,
      v_row.created_at,
      v_row.created_at,
      jsonb_build_object(
        'actor_kind', 'agent',
        'actor_label', coalesce(v_row.metadata->'origin'->>'agent_label', v_row.source),
        'review_event', 'submitted',
        'review_queue_id', v_row.id
      ),
      jsonb_build_object(
        'kind', 'open_link',
        'version', 1,
        'payload', jsonb_build_object(
          'href', '/administration/users/agent-review/' || v_row.id,
          'label', 'Open review'
        )
      )
    );

    if nullif(btrim(v_row.feedback), '') is not null then
      insert into communication.dm_messages (
        conversation_id, sender_id, content, message_type, status,
        client_message_id, organization_id, created_by, created_at, updated_at,
        metadata
      ) values (
        v_conversation_id,
        v_admin_user,
        v_row.feedback,
        'text',
        'sent',
        'agent-review:' || v_row.id || ':legacy-feedback',
        v_org,
        v_admin_user,
        coalesce(v_row.feedback_at, v_row.updated_at),
        coalesce(v_row.feedback_at, v_row.updated_at),
        jsonb_build_object(
          'actor_kind', 'human',
          'actor_label', 'Arman',
          'review_event', case v_row.status
            when 'human_changes_requested' then 'changes_requested'
            when 'approved' then 'approved'
            else 'feedback'
          end,
          'review_queue_id', v_row.id
        )
      );
    end if;

    update agent.review_queue
    set conversation_id = v_conversation_id
    where id = v_row.id;
  end loop;
end $$;
