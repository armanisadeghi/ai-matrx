-- war_room_recent_activity_rpc.sql
-- Recent-activity feed for a War Room, for the agent <activity> context block
-- (and any future activity UI). VS Code-style "recently touched" list: the
-- LATEST activity per associated entity across every thread in the room —
-- chat messages, note edits, audio, task/project/file updates, and resource
-- attaches — newest first. This is a COMPUTED cross-table union (there is no
-- populated content-level activity_log), so it lives in one SECURITY DEFINER
-- RPC gated by iam.has_access('war_room', ...).
--
-- Scope: the room's threads are resolved from thread->war_room membership
-- edges; content is resolved from platform.associations edges (source=entity ->
-- target=thread|war_room). thread_title is best-effort (thread row title, else
-- task/project anchor, else 'Thread'); the caller enriches with its own
-- resolved thread display titles. Actor is the last message author (chat) or
-- the entity's created_by/updated_by (a proxy — most content tables have no
-- updated_by). Removals are not timelined (edge deletes leave no row).
--
-- Idempotent: CREATE OR REPLACE.

create or replace function public.war_room_recent_activity(
  p_war_room_id uuid, p_limit int default 25, p_since timestamptz default null
)
returns table (
  occurred_at timestamptz, thread_id uuid, thread_title text, entity_type text,
  entity_id uuid, label text, action text, actor_id uuid, detail text
)
language plpgsql stable security definer
set search_path = public, platform, workspace, chat, workbench, transcripts, files, iam
as $$
begin
  if not iam.has_access('war_room', p_war_room_id) then
    raise exception 'not authorized for war_room %', p_war_room_id using errcode = '42501';
  end if;
  return query
  with threads as (
    select a.source_id as thread_id from platform.associations a
    where a.target_type='war_room' and a.target_id=p_war_room_id and a.source_type='thread'),
  tmeta as (
    select t.id as thread_id,
      coalesce(t.title,
        case t.anchor_type
          when 'task' then (select tk.title from workspace.tasks tk where tk.id=t.anchor_id)
          when 'project' then (select pj.name from workspace.projects pj where pj.id=t.anchor_id)
          else null end, 'Thread') as thread_title
    from workspace.threads t where t.id in (select thread_id from threads)),
  edges as (
    select a.id edge_id, a.source_type, a.source_id, a.label, a.created_at, a.created_by,
           case when a.target_type='thread' then a.target_id end as thread_id
    from platform.associations a
    where (a.target_type='thread' and a.target_id in (select thread_id from threads))
       or (a.target_type='war_room' and a.target_id=p_war_room_id)),
  acts as (
    select mm.last_at as occurred_at, e.thread_id, e.source_type as entity_type, e.source_id as entity_id,
           e.label, 'chat_message'::text as action, mm.actor as actor_id,
           (mm.cnt::text||' message'||case when mm.cnt=1 then '' else 's' end) as detail
    from edges e join lateral (
      select max(m.created_at) last_at, count(*) cnt, (array_agg(m.created_by order by m.created_at desc))[1] actor
      from chat.message m where m.conversation_id=e.source_id and m.deleted_at is null) mm on true
    where e.source_type='conversation' and mm.last_at is not null
    union all select n.updated_at,e.thread_id,'note',e.source_id,e.label,'note_edited',n.created_by,null::text
      from edges e join workbench.notes n on n.id=e.source_id and n.deleted_at is null where e.source_type='note'
    union all select greatest(s.updated_at,s.started_at,s.created_at),e.thread_id,'studio_session',e.source_id,
      coalesce(e.label,s.title),'audio_activity',s.created_by,null::text
      from edges e join transcripts.studio_sessions s on s.id=e.source_id and s.deleted_at is null where e.source_type='studio_session'
    union all select t.updated_at,e.thread_id,'task',e.source_id,coalesce(e.label,t.title),'task_updated',t.created_by,t.title
      from edges e join workspace.tasks t on t.id=e.source_id and t.deleted_at is null where e.source_type='task'
    union all select p.updated_at,e.thread_id,'project',e.source_id,coalesce(e.label,p.name),'project_updated',p.created_by,p.name
      from edges e join workspace.projects p on p.id=e.source_id and p.deleted_at is null where e.source_type='project'
    union all select f.updated_at,e.thread_id,'file',e.source_id,e.label,'file_updated',f.created_by,null::text
      from edges e join files.files f on f.id=e.source_id and f.deleted_at is null where e.source_type='file'
    union all select e.created_at,e.thread_id,e.source_type,e.source_id,e.label,'attached',e.created_by,null::text
      from edges e where e.source_type<>'thread'
    union all select t.updated_at,t.id,'thread',t.id,null,'thread_updated',t.updated_by,null::text
      from workspace.threads t where t.id in (select thread_id from threads) and t.deleted_at is null)
  select a.occurred_at, a.thread_id, tm.thread_title, a.entity_type, a.entity_id, a.label, a.action, a.actor_id, a.detail
  from acts a left join tmeta tm on tm.thread_id=a.thread_id
  where a.occurred_at is not null and (p_since is null or a.occurred_at >= p_since)
  order by a.occurred_at desc
  limit greatest(1, least(coalesce(p_limit,25),200));
end; $$;

grant execute on function public.war_room_recent_activity(uuid,int,timestamptz) to authenticated;

comment on function public.war_room_recent_activity is
  'Recent activity feed for a war room: latest touch per associated entity (chat messages, note edits, audio, task/project/file updates, resource attaches) across all its threads, newest first. SECURITY DEFINER, gated by iam.has_access(war_room). Powers the agent <activity> context block.';
