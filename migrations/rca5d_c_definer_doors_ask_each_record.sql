-- RC-A5d (round 2) — EVERY DEFINER DOOR ASKS ABOUT EACH RECORD IT NAMES.
-- Register row RC-A5d (common-docs/projects/rich-content-unification/REGISTER.md). Verifier report:
-- common-docs/projects/rich-content-unification/evidence/verify-RC-A5d.md (NOT MET, §3).
--
-- THE DEFECT (measured live 2026-09-26 as test@test.com, rolled back): rca5d_b hid association labels
-- and metadata that copy an endpoint at the TABLE, but SECURITY DEFINER functions read the table as
-- postgres (BYPASSRLS) and checked only the record they were asked about — never the other end:
--   * public.get_task_associations: gated on organization membership (not even the task), then
--     returned every edge's label + metadata and the joined note title, file name, message preview
--     and conversation title (live: a conversation→task label equal to a personal conversation title).
--     NOT replaced here: its fix is migrations/rca5g_task_associations_follow_both_ends.sql (RC-A5g,
--     same rule, written against the same live body) — one file per function, so neither silently
--     reverts the other; the suite and the guard below cover it;
--   * public.war_room_recent_activity: gated on the room only; 16 of 32 rows named records the member
--     cannot open, 8 labels equal to private note/task titles, task titles as the fallback label, and
--     thread titles of threads RC-A2c hides (a thread title copies its anchor);
--   * public.conversation_files: gated on the conversation, not the file (file names; latent);
--   * public.get_tasks_for_entity: no check on the record asked about; task titles gated on
--     organization membership (other members' personal task titles);
--   * public.get_user_full_context / get_user_nav_tree: every project (and task, and scope) in the
--     caller's organizations, named, with no access check on any of them (latent today);
--   * public.agx_get_shortcuts_for_context(_m): shortcuts (labels, agent names) of any project/task
--     id passed in, unasked; agx_get_user_shortcuts(_m): the scope_name column is the attached
--     task's title / project's name, unasked;
--   * public.conversation_shared_room_notice: the owner's warning named the first container her
--     conversation is reachable from by reading its title, unasked (a collaborator's private project).
--
-- THE FIX (the class, one rule, for the ten doors below): each door asks the SAME per-record question the assoc_* doors ask —
-- iam.assoc_side_readable (the kernel, iam.has_access viewer, when signed in) and, for an edge,
-- iam.org_readable on its tenancy — about EVERY record it names; iam.has_access_for(v_uid, …) where
-- the door answers for a named person. A record the reader may not open yields no row (or, for a
-- name column, null): nothing is re-implemented by hand, and nothing is replaced by a placeholder —
-- the frontend links every row it shows (THE DOOR LAW), so a row it could not open would be a dead end.
-- Platform-admin arms are kept (public.is_platform_admin() is true only inside the admin lane).
-- Every body is the live body with only the marked lines changed.
--
-- Census (every client-callable SECURITY DEFINER function that reads associations or returns another
-- record's title, with verdicts) and the guard that keeps the class closed:
-- aidream db/tests/test_definer_doors_ask_each_record.py. Forcing suite:
-- aidream db/tests/test_rca5d_definer_doors_ask_each_record.py.
-- Inverse: migrations/inverse/rca5d_c_definer_doors_ask_each_record_down.sql.
-- based-on: public.war_room_recent_activity(uuid, integer, timestamp with time zone) d3486bf3de5c09c0951ecae23b053a45b84f78dfd60450543d66c28f083d931a
-- based-on: public.conversation_files(uuid) 583ae1e8e794235dc9c07f912544f63499dc99e09896e89cf88fa2c710e83cdc
-- based-on: public.get_tasks_for_entity(text, uuid) 158f9f687f43c593b8c0b21c989422a3ebe30074a9bedcd9765d0aca5e405220
-- based-on: public.get_user_nav_tree(uuid) 5d6efd5d0e41f2dc56839a381542ced2ce0a94ddd2472d6a733fe3eb28ff0cf8
-- based-on: public.get_user_full_context(uuid) e670503dcdf279c4845eef740b8b978add675fc8dab1eee9688f97f5a97babb8
-- based-on: public.agx_get_shortcuts_for_context(uuid, uuid) 39d38422e6c989b8e86dd939cdf4a4980d8945c05ef7fe87bfef79fbe6273a1b
-- based-on: public.agx_get_shortcuts_for_context_m(uuid, uuid) 06b44a69ab73d16a6a326f779e11b7e0fdca2d5a468027c6899445802e0bdfbd
-- based-on: public.agx_get_user_shortcuts() d7abf0b3da478bc85c43ee971e7645af5c27fe10256b908e61f72e023ab64714
-- based-on: public.agx_get_user_shortcuts_m() 7b8faeb95f2818956a390465c698a9f8ea67ba43be878a997af2909acf005dc5
-- based-on: public.conversation_shared_room_notice(uuid) 3afd7b2f7a43fd196adaab499f5653ba18145536d056c88b44c9b6be1ffa3b94

set local lock_timeout = '2s';

CREATE OR REPLACE FUNCTION public.war_room_recent_activity(p_war_room_id uuid, p_limit integer DEFAULT 25, p_since timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(occurred_at timestamp with time zone, thread_id uuid, thread_title text, entity_type text, entity_id uuid, label text, action text, actor_id uuid, detail text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'workspace', 'chat', 'workbench', 'transcripts', 'files', 'iam'
AS $function$
#variable_conflict use_column
declare
  -- RC-A5d (rca5d_c): true only inside the admin lane, where the platform admin reads everything.
  v_admin boolean := public.is_platform_admin();
begin
  if not (v_admin or iam.has_access('war_room', p_war_room_id)) then
    raise exception 'not authorized for war_room %', p_war_room_id using errcode = '42501';
  end if;
  return query
  with threads as (
    -- RC-A5d (rca5d_c): only the threads this reader may open (RC-A2c: a thread whose anchor she
    -- may not open is not open to her, so its title — and the anchor-title fallback below — never
    -- reaches her either).
    select a.source_id as thread_id from platform.associations_live a
    where a.target_type='war_room' and a.target_id=p_war_room_id and a.source_type='thread'
      and (v_admin or iam.assoc_side_readable('thread', a.source_id))),
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
    from platform.associations_live a
    where ((a.target_type='thread' and a.target_id in (select thread_id from threads))
       or (a.target_type='war_room' and a.target_id=p_war_room_id))
      -- RC-A5d (rca5d_c): and each record an edge names is asked (DD-195): an entity this reader may
      -- not open yields no row — not the edge label, not its title, not its activity.
      and (v_admin or (iam.org_readable(a.organization_id, a.source_type) and iam.assoc_side_readable(a.source_type, a.source_id)))),
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
end; $function$;

CREATE OR REPLACE FUNCTION public.conversation_files(p_conversation_id uuid)
 RETURNS TABLE(file_id uuid, label text, metadata jsonb, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'conversation_files: authenticated user required'
      using errcode = '42501';
  end if;

  if not public.can_view_chat_conversation(v_uid, p_conversation_id) then
    raise exception 'conversation_files: viewer access to conversation required'
      using errcode = '42501';
  end if;

  return query
  select a.source_id, a.label, a.metadata, a.created_at
  from platform.associations_live a
  where a.source_type = 'file'
    and a.target_type = 'conversation'
    and a.target_id = p_conversation_id
    and a.role is null
    -- RC-A5d (rca5d_c): viewing the conversation is not viewing every file attached to it. The file
    -- is asked too (DD-195); a file this reader may not open is not listed — not its name, not its
    -- metadata. The platform-admin arm is true only inside the admin lane.
    and (public.is_platform_admin()
         or (iam.org_readable(a.organization_id, a.source_type)
             and iam.assoc_side_readable(a.source_type, a.source_id)))
  order by a.created_at, a.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_tasks_for_entity(p_entity_type text, p_entity_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_tasks jsonb; v_admin boolean;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  -- RC-A5d (rca5d_c): the record asked about is asked first (DD-205) — naming a record you may not
  -- open lists nothing — and each task is asked of the kernel, not of organization membership
  -- (a member read the titles of other people's personal tasks here). Admin lane keeps everything.
  v_admin := public.is_platform_admin();
  if not (v_admin or iam.assoc_side_readable(p_entity_type, p_entity_id)) then
    return jsonb_build_object('tasks', '[]'::jsonb);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'task_id', t.id, 'title', t.title, 'status', t.status, 'priority', t.priority,
      'due_date', t.due_date, 'organization_id', t.organization_id, 'project_id', t.project_id,
      'association_id', a.id, 'associated_at', a.created_at) order by a.created_at desc), '[]'::jsonb)
    from platform.associations_live a
    join workspace.tasks t on t.id = a.target_id
   where a.target_type = 'task' and a.source_type = p_entity_type and a.source_id = p_entity_id
     and (v_admin or (iam.org_readable(a.organization_id, a.target_type)
                      and iam.assoc_side_readable('task', t.id)))
    into v_tasks;
  return jsonb_build_object('tasks', v_tasks);
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_nav_tree(p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid; v_result jsonb;
BEGIN
  v_uid := COALESCE(p_user_id, auth.uid());
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  -- 🚨 DD-192: p_user_id NAMES A PERSON, AND UNTIL 2026-09-13 NOBODY CHECKED IT WAS
  -- THE CALLER. `coalesce(p_user_id, auth.uid())` reads as a convenience default;
  -- in a SECURITY DEFINER function granted to `authenticated` it is an argument
  -- that REPLACES the caller. Any signed-in user passed a stranger's id and got
  -- that stranger's whole navigation tree back: every organization they belong
  -- to, their role in each, and every project inside. Proven live against
  -- admin@admin.com's organizations as test@test.com and as a user who is a
  -- member of nothing. The guard is the one the rest of the p_user_id family
  -- already uses, word for word.
  if not (auth.role() = 'service_role' or v_uid = ( SELECT auth.uid()) or public.is_platform_admin()) then
    raise exception 'access denied: caller is not the target user' using errcode = '42501';
  end if;
  WITH user_orgs AS (
    SELECT o.id, o.name, o.slug, o.is_personal, om.role::text AS role
    FROM iam.organizations o JOIN iam.organization_member om ON om.organization_id = o.id AND om.user_id = v_uid
  ), org_projects AS (
    SELECT p.id, p.name, p.slug, p.organization_id, COALESCE(po.is_personal, false) AS is_personal
    FROM workspace.projects p
    JOIN iam.organizations po ON po.id = p.organization_id
    WHERE p.organization_id IN (SELECT id FROM user_orgs)
      -- RC-A5d (rca5d_c): an organization's projects are listed only when the person may open them
      -- (a member read the names of other members' personal projects here).
      AND iam.has_access_for(v_uid, 'project', p.id, 'viewer'::public.permission_level)
  )
  SELECT jsonb_build_object('organizations', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', uo.id, 'name', uo.name, 'slug', uo.slug, 'is_personal', uo.is_personal, 'role', uo.role,
      'projects', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', op.id, 'name', op.name, 'slug', op.slug, 'is_personal', op.is_personal) ORDER BY op.name) FROM org_projects op WHERE op.organization_id = uo.id), '[]'::jsonb))
    ORDER BY uo.is_personal DESC, uo.name ASC) FROM user_orgs uo), '[]'::jsonb))
  INTO v_result;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_full_context(p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_uid uuid;
    v_personal_org_id constant uuid := '00000000-0000-0000-0000-000000000001'::uuid;
    v_result jsonb; v_personal_row jsonb; v_real_rows jsonb;
begin
    v_uid := coalesce(p_user_id, auth.uid());
    if v_uid is null then return jsonb_build_object('organizations', '[]'::jsonb); end if;
    -- 🚨 DD-192: the same defect as get_user_nav_tree, one layer deeper — this one
    -- also hands back the target's scope types, scopes and context items.
    if not (auth.role() = 'service_role' or v_uid = ( SELECT auth.uid()) or public.is_platform_admin()) then
      raise exception 'access denied: caller is not the target user' using errcode = '42501';
    end if;
    with
    user_orgs as (
        select o.id, o.name, o.slug, o.is_personal, om.role::text as role
        from iam.organizations o join iam.organization_member om on om.organization_id = o.id and om.user_id = v_uid
    ),
    org_scope_types as (
        select st.organization_id,
            jsonb_agg(jsonb_build_object('id',st.id,'label_singular',st.label_singular,'label_plural',st.label_plural,'icon',st.icon,'color',st.color,'sort_order',st.sort_order,'parent_type_id',st.parent_type_id,'max_assignments_per_entity',st.max_assignments_per_entity) order by st.sort_order) as types
        from context.scope_types st where st.organization_id in (select id from user_orgs) and st.deleted_at is null group by st.organization_id
    ),
    org_scopes as (
        select s.organization_id,
            jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'scope_type_id',s.scope_type_id,'parent_scope_id',s.parent_scope_id,'type_label',st.label_singular,'type_icon',st.icon,'type_color',st.color) order by st.sort_order, s.name) as scopes
        from context.scopes s join context.scope_types st on s.scope_type_id = st.id where s.organization_id in (select id from user_orgs) and s.deleted_at is null and st.deleted_at is null
          and iam.has_access_for(v_uid, 'scope', s.id, 'viewer'::public.permission_level) group by s.organization_id
    ),
    org_projects as (
        select p.id, p.name, p.slug, p.organization_id,
            coalesce((select jsonb_agg(jsonb_build_object('scope_id',sc.id,'scope_name',sc.name,'type_label',st.label_singular,'type_icon',st.icon,'type_color',st.color) order by st.sort_order)
                from platform.associations_live sa
                join context.scopes sc on sa.target_id = sc.id
                join context.scope_types st on sc.scope_type_id = st.id
                where sa.target_type = 'scope' and sa.source_type = 'project' and sa.source_id = p.id and sc.deleted_at is null and st.deleted_at is null
                  and iam.has_access_for(v_uid, 'scope', sc.id, 'viewer'::public.permission_level)), '[]'::jsonb) as scope_tags,
            (select count(*) from workspace.tasks t where t.project_id = p.id and t.deleted_at is null and t.status not in ('completed','cancelled','dismissed')) as open_task_count,
            (select count(*) from workspace.tasks t where t.project_id = p.id and t.deleted_at is null) as total_task_count
        from workspace.projects p where p.organization_id in (select id from user_orgs)
          -- RC-A5d (rca5d_c): only projects (and, below, tasks and scopes) this person may open;
          -- a member read other members' personal project names and task titles here.
          and iam.has_access_for(v_uid, 'project', p.id, 'viewer'::public.permission_level)
    ),
    personal_projects as (
        select p.id, p.name, p.slug, true::boolean as is_personal, '[]'::jsonb as scope_tags,
            (select count(*) from workspace.tasks t where t.project_id = p.id and t.deleted_at is null and t.status not in ('completed','cancelled','dismissed')) as open_task_count,
            (select count(*) from workspace.tasks t where t.project_id = p.id and t.deleted_at is null) as total_task_count
        from workspace.projects p join iam.memberships m on m.container_type='project' and m.container_id=p.id and m.user_id=v_uid and m.deleted_at is null
        where p.organization_id is null
    ),
    all_tasks as (
        select t.id, t.title, t.status, t.priority::text as priority, t.project_id, t.parent_task_id, t.due_date, t.assignee_id,
            t.created_by, t.origin, t.source_type, t.source_url, t.source_label, t.start_date, t.completed_at, t.updated_at, t.recurrence_rule,
            case
                when p.id is not null and p.organization_id is not null then p.organization_id
                when p.id is not null and p.organization_id is null then v_personal_org_id
                else coalesce((select om.organization_id from iam.organization_member om where om.user_id = coalesce(t.created_by,t.assignee_id,v_uid) and om.organization_id in (select id from user_orgs) limit 1), v_personal_org_id)
            end as organization_id
        from workspace.tasks t left join workspace.projects p on t.project_id = p.id
        where t.deleted_at is null
          and (t.status not in ('completed','cancelled','dismissed')
               or coalesce(t.completed_at, t.updated_at) > now() - interval '90 days')
          and (t.created_by=v_uid or t.assignee_id=v_uid
               or ((t.project_id in (select id from org_projects) or t.project_id in (select id from personal_projects))
                   and iam.has_access_for(v_uid, 'task', t.id, 'viewer'::public.permission_level)))
    )
    select coalesce(jsonb_agg(real_org_obj order by uo_is_personal desc, uo_name asc), '[]'::jsonb) into v_real_rows
    from (
        select uo.is_personal as uo_is_personal, uo.name as uo_name,
            jsonb_build_object('id',uo.id,'name',uo.name,'slug',uo.slug,'is_personal',uo.is_personal,'role',uo.role,
                'scope_types',coalesce(ost.types,'[]'::jsonb),'scopes',coalesce(os.scopes,'[]'::jsonb),
                'projects',coalesce((select jsonb_agg(jsonb_build_object('id',op.id,'name',op.name,'slug',op.slug,'is_personal',uo.is_personal,'scope_tags',op.scope_tags,'open_task_count',op.open_task_count,'total_task_count',op.total_task_count) order by op.name) from org_projects op where op.organization_id=uo.id),'[]'::jsonb),
                'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',at.id,'title',at.title,'status',at.status,'priority',at.priority,'project_id',at.project_id,'parent_task_id',at.parent_task_id,'due_date',at.due_date,'assignee_id',at.assignee_id,'created_by',at.created_by,'origin',at.origin,'source_type',at.source_type,'source_url',at.source_url,'source_label',at.source_label,'start_date',at.start_date,'completed_at',at.completed_at,'updated_at',at.updated_at,'recurrence_rule',at.recurrence_rule) order by case at.priority when 'high' then 0 when 'medium' then 1 when 'low' then 2 else 3 end, at.due_date nulls last) from all_tasks at where at.organization_id=uo.id),'[]'::jsonb)
            ) as real_org_obj
        from user_orgs uo left join org_scope_types ost on ost.organization_id=uo.id left join org_scopes os on os.organization_id=uo.id
    ) sub;
    with
    personal_projects_v as (
        select p.id, p.name, p.slug,
            (select count(*) from workspace.tasks t where t.project_id=p.id and t.deleted_at is null and t.status not in ('completed','cancelled','dismissed')) as open_task_count,
            (select count(*) from workspace.tasks t where t.project_id=p.id and t.deleted_at is null) as total_task_count
        from workspace.projects p join iam.memberships m on m.container_type='project' and m.container_id=p.id and m.user_id=v_uid and m.deleted_at is null where p.organization_id is null
    ),
    personal_tasks_v as (
        select t.id, t.title, t.status, t.priority::text as priority, t.project_id, t.parent_task_id, t.due_date, t.assignee_id,
            t.created_by, t.origin, t.source_type, t.source_url, t.source_label, t.start_date, t.completed_at, t.updated_at, t.recurrence_rule
        from workspace.tasks t left join workspace.projects p on t.project_id=p.id
        where t.deleted_at is null
          and (t.status not in ('completed','cancelled','dismissed')
               or coalesce(t.completed_at, t.updated_at) > now() - interval '90 days')
          and (
            (p.id is not null and p.organization_id is null and exists (select 1 from iam.memberships m where m.container_type='project' and m.container_id=p.id and m.user_id=v_uid and m.deleted_at is null))
            or (p.id is null and (t.created_by=v_uid or t.assignee_id=v_uid) and not exists (select 1 from iam.organization_member om where om.user_id=coalesce(t.created_by,t.assignee_id,v_uid) and om.organization_id in (select id from iam.organization_member where user_id=v_uid)))
        )
    )
    select case when exists (select 1 from personal_projects_v) or exists (select 1 from personal_tasks_v) then
        jsonb_build_object('id',v_personal_org_id,'name','Personal','slug','personal','is_personal',true,'role','owner','scope_types','[]'::jsonb,'scopes','[]'::jsonb,
            'projects',coalesce((select jsonb_agg(jsonb_build_object('id',pp.id,'name',pp.name,'slug',pp.slug,'is_personal',true,'scope_tags','[]'::jsonb,'open_task_count',pp.open_task_count,'total_task_count',pp.total_task_count) order by pp.name) from personal_projects_v pp),'[]'::jsonb),
            'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',pt.id,'title',pt.title,'status',pt.status,'priority',pt.priority,'project_id',pt.project_id,'parent_task_id',pt.parent_task_id,'due_date',pt.due_date,'assignee_id',pt.assignee_id,'created_by',pt.created_by,'origin',pt.origin,'source_type',pt.source_type,'source_url',pt.source_url,'source_label',pt.source_label,'start_date',pt.start_date,'completed_at',pt.completed_at,'updated_at',pt.updated_at,'recurrence_rule',pt.recurrence_rule) order by case pt.priority when 'high' then 0 when 'medium' then 1 when 'low' then 2 else 3 end, pt.due_date nulls last) from personal_tasks_v pt),'[]'::jsonb))
    end into v_personal_row;
    select jsonb_build_object('organizations', case when v_personal_row is not null then jsonb_build_array(v_personal_row)||v_real_rows else v_real_rows end) into v_result;
    return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.agx_get_shortcuts_for_context(p_project_id uuid DEFAULT NULL::uuid, p_task_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(shortcut_id uuid, category_id uuid, label text, description text, icon_name text, keyboard_shortcut text, sort_order integer, resolved_id uuid, is_version boolean, is_behind boolean, agent_id uuid, agent_version_id uuid, current_version integer, use_latest boolean, enabled_features jsonb, scope_mappings jsonb, context_mappings jsonb, display_mode text, allow_chat boolean, auto_run boolean, show_variable_panel boolean, variables_panel_style text, show_definition_messages boolean, show_definition_message_content boolean, hide_reasoning boolean, hide_tool_results boolean, show_pre_execution_gate boolean, pre_execution_message text, bypass_gate_seconds integer, default_user_input text, default_variables jsonb, context_overrides jsonb, llm_overrides jsonb, shortcut_user_id uuid, shortcut_org_id uuid, shortcut_project_id uuid, shortcut_task_id uuid, agent_name text, agent_variable_definitions jsonb, agent_context_policies jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    s.id, s.category_id, s.label, s.description, s.icon_name, s.keyboard_shortcut, s.sort_order,
    CASE
      WHEN s.agent_id IS NULL THEN NULL
      WHEN s.use_latest THEN s.agent_id
      WHEN COALESCE(av.version_number, a.version) >= a.version THEN s.agent_id
      ELSE s.agent_version_id
    END,
    CASE
      WHEN s.agent_id IS NULL THEN false
      WHEN s.use_latest THEN false
      WHEN COALESCE(av.version_number, a.version) >= a.version THEN false
      ELSE true
    END,
    CASE
      WHEN s.agent_id IS NULL THEN false
      WHEN s.use_latest THEN false
      ELSE a.version > COALESCE(av.version_number, a.version)
    END,
    s.agent_id, s.agent_version_id, a.version, s.use_latest,
    s.enabled_features, s.scope_mappings, s.context_mappings,
    s.display_mode, s.allow_chat, s.auto_run,
    s.show_variable_panel, s.variables_panel_style,
    s.show_definition_messages, s.show_definition_message_content,
    s.hide_reasoning, s.hide_tool_results,
    s.show_pre_execution_gate, s.pre_execution_message, s.bypass_gate_seconds,
    s.default_user_input, s.default_variables, s.context_overrides, s.llm_overrides,
    s.created_by, s.organization_id, sp.target_id, st.target_id,
    CASE WHEN s.agent_id IS NULL THEN NULL
         WHEN s.use_latest OR COALESCE(av.version_number, a.version) >= a.version THEN a.name
         ELSE av.name END,
    CASE WHEN s.agent_id IS NULL THEN NULL
         WHEN s.use_latest OR COALESCE(av.version_number, a.version) >= a.version THEN a.variable_definitions
         ELSE av.variable_definitions END,
    CASE WHEN s.agent_id IS NULL THEN NULL
         WHEN s.use_latest OR COALESCE(av.version_number, a.version) >= a.version THEN a.context_policies
         ELSE av.context_policies END
  FROM agent.shortcut s
  LEFT JOIN agent.definition a ON a.id = s.agent_id AND a.deleted_at IS NULL
  LEFT JOIN agent.definition_version av ON av.id = s.agent_version_id
  LEFT JOIN LATERAL (
    SELECT x.target_id FROM platform.associations_live x
    WHERE x.source_type = 'agent_shortcut' AND x.source_id = s.id AND x.target_type = 'project'
    ORDER BY x.created_at LIMIT 1
  ) sp ON true
  LEFT JOIN LATERAL (
    SELECT x.target_id FROM platform.associations_live x
    WHERE x.source_type = 'agent_shortcut' AND x.source_id = s.id AND x.target_type = 'task'
    ORDER BY x.created_at LIMIT 1
  ) st ON true
  WHERE s.is_active = true
    AND (
      -- RC-A5d (rca5d_c): the project / task a shortcut is attached to is asked (DD-205): naming a
      -- record you may not open lists none of its shortcuts (their labels and agent names leaked).
      (p_project_id IS NOT NULL AND sp.target_id = p_project_id AND iam.assoc_side_readable('project', sp.target_id))
      OR (p_task_id IS NOT NULL AND st.target_id = p_task_id AND iam.assoc_side_readable('task', st.target_id))
      OR EXISTS (
        SELECT 1 FROM iam.permissions p
        WHERE p.resource_type = 'agent_shortcut'
          AND p.resource_id = s.id
          AND (
            p.granted_to_user_id = (select auth.uid())
            OR p.granted_to_organization_id IN (
              SELECT organization_id FROM iam.organization_member WHERE user_id = (select auth.uid())
            )
          )
      )
    )
  ORDER BY s.category_id, s.sort_order;
END;
$function$;

CREATE OR REPLACE FUNCTION public.agx_get_shortcuts_for_context_m(p_project_id uuid DEFAULT NULL::uuid, p_task_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(shortcut_id uuid, category_id uuid, label text, description text, icon_name text, keyboard_shortcut text, sort_order integer, resolved_id uuid, is_version boolean, is_behind boolean, agent_id uuid, agent_version_id uuid, current_version integer, use_latest boolean, enabled_features jsonb, scope_mappings jsonb, context_mappings jsonb, display_mode text, allow_chat boolean, auto_run boolean, show_variable_panel boolean, variables_panel_style text, show_definition_messages boolean, show_definition_message_content boolean, hide_reasoning boolean, hide_tool_results boolean, show_pre_execution_gate boolean, pre_execution_message text, bypass_gate_seconds integer, default_user_input text, default_variables jsonb, context_overrides jsonb, llm_overrides jsonb, shortcut_user_id uuid, shortcut_org_id uuid, shortcut_project_id uuid, shortcut_task_id uuid, agent_name text, agent_variable_definitions jsonb, agent_context_policies jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    s.id, s.category_id, s.label, s.description, s.icon_name, s.keyboard_shortcut, s.sort_order,
    CASE
      WHEN s.agent_id IS NULL THEN NULL
      WHEN s.use_latest THEN s.agent_id
      WHEN COALESCE(av.version_number, a.version) >= a.version THEN s.agent_id
      ELSE s.agent_version_id
    END,
    CASE
      WHEN s.agent_id IS NULL THEN false
      WHEN s.use_latest THEN false
      WHEN COALESCE(av.version_number, a.version) >= a.version THEN false
      ELSE true
    END,
    CASE
      WHEN s.agent_id IS NULL THEN false
      WHEN s.use_latest THEN false
      ELSE a.version > COALESCE(av.version_number, a.version)
    END,
    s.agent_id, s.agent_version_id, a.version, s.use_latest,
    s.enabled_features, s.scope_mappings, s.context_mappings,
    s.display_mode, s.allow_chat, s.auto_run,
    s.show_variable_panel, s.variables_panel_style,
    s.show_definition_messages, s.show_definition_message_content,
    s.hide_reasoning, s.hide_tool_results,
    s.show_pre_execution_gate, s.pre_execution_message, s.bypass_gate_seconds,
    s.default_user_input, s.default_variables, s.context_overrides, s.llm_overrides,
    s.created_by, s.organization_id, sp.target_id, st.target_id,
    CASE WHEN s.agent_id IS NULL THEN NULL
         WHEN s.use_latest OR COALESCE(av.version_number, a.version) >= a.version THEN a.name
         ELSE av.name END,
    CASE WHEN s.agent_id IS NULL THEN NULL
         WHEN s.use_latest OR COALESCE(av.version_number, a.version) >= a.version THEN a.variable_definitions
         ELSE av.variable_definitions END,
    CASE WHEN s.agent_id IS NULL THEN NULL
         WHEN s.use_latest OR COALESCE(av.version_number, a.version) >= a.version THEN a.context_policies
         ELSE av.context_policies END
  FROM mandate.vw_shortcut s
  LEFT JOIN agent.definition a ON a.id = s.agent_id AND a.deleted_at IS NULL
  LEFT JOIN agent.definition_version av ON av.id = s.agent_version_id
  LEFT JOIN LATERAL (
    SELECT x.target_id FROM platform.associations_live x
    WHERE x.source_type = 'agent_shortcut' AND x.source_id = s.id AND x.target_type = 'project'
    ORDER BY x.created_at LIMIT 1
  ) sp ON true
  LEFT JOIN LATERAL (
    SELECT x.target_id FROM platform.associations_live x
    WHERE x.source_type = 'agent_shortcut' AND x.source_id = s.id AND x.target_type = 'task'
    ORDER BY x.created_at LIMIT 1
  ) st ON true
  WHERE s.is_active = true
    AND (
      -- RC-A5d (rca5d_c): the project / task a shortcut is attached to is asked (DD-205): naming a
      -- record you may not open lists none of its shortcuts (their labels and agent names leaked).
      (p_project_id IS NOT NULL AND sp.target_id = p_project_id AND iam.assoc_side_readable('project', sp.target_id))
      OR (p_task_id IS NOT NULL AND st.target_id = p_task_id AND iam.assoc_side_readable('task', st.target_id))
      OR EXISTS (
        SELECT 1 FROM iam.permissions p
        WHERE p.resource_type = 'agent_shortcut'
          AND p.resource_id = s.id
          AND (
            p.granted_to_user_id = (select auth.uid())
            OR p.granted_to_organization_id IN (
              SELECT organization_id FROM iam.organization_member WHERE user_id = (select auth.uid())
            )
          )
      )
    )
  ORDER BY s.category_id, s.sort_order;
END;
$function$;

CREATE OR REPLACE FUNCTION public.agx_get_user_shortcuts()
 RETURNS TABLE(id uuid, label text, description text, icon_name text, keyboard_shortcut text, sort_order integer, category_id uuid, category_label text, agent_id uuid, agent_name text, agent_version_id uuid, use_latest boolean, scope_type text, scope_name text, user_id uuid, organization_id uuid, project_id uuid, task_id uuid, enabled_features jsonb, scope_mappings jsonb, context_mappings jsonb, display_mode text, allow_chat boolean, auto_run boolean, show_variable_panel boolean, variables_panel_style text, show_definition_messages boolean, show_definition_message_content boolean, hide_reasoning boolean, hide_tool_results boolean, show_pre_execution_gate boolean, pre_execution_message text, bypass_gate_seconds integer, default_user_input text, default_variables jsonb, context_overrides jsonb, llm_overrides jsonb, is_active boolean, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid();
begin
  return query
  select
    s.id, s.label, s.description, s.icon_name, s.keyboard_shortcut, s.sort_order,
    s.category_id, sc.name,
    s.agent_id, a.name, s.agent_version_id, s.use_latest,
    (case when st.target_id is not null then 'task' when sp.target_id is not null then 'project'
          when s.organization_id is not null then 'organization' when s.created_by is not null then 'personal'
          else 'system' end)::text,
    (case when st.target_id is not null then (select t.title from workspace.tasks t where t.id = st.target_id and iam.assoc_side_readable('task', t.id))
          when sp.target_id is not null then (select p.name from workspace.projects p where p.id = sp.target_id and iam.assoc_side_readable('project', p.id))
          when s.organization_id is not null then (select o.name from iam.organizations o where o.id = s.organization_id)
          when s.created_by is not null then 'Personal' else 'System' end)::text,
    s.created_by, s.organization_id, sp.target_id, st.target_id,
    s.enabled_features, s.scope_mappings, s.context_mappings,
    s.display_mode, s.allow_chat, s.auto_run,
    s.show_variable_panel, s.variables_panel_style,
    s.show_definition_messages, s.show_definition_message_content,
    s.hide_reasoning, s.hide_tool_results,
    s.show_pre_execution_gate, s.pre_execution_message, s.bypass_gate_seconds,
    s.default_user_input, s.default_variables, s.context_overrides, s.llm_overrides,
    s.is_active, s.created_at, s.updated_at
  from agent.shortcut s
  left join agent.definition a on a.id = s.agent_id
  left join platform.categories sc on sc.id = s.category_id and sc.dimension = 'shortcut'
  left join lateral (
    select x.target_id from platform.associations_live x
    where x.source_type = 'agent_shortcut' and x.source_id = s.id and x.target_type = 'project'
    order by x.created_at limit 1
  ) sp on true
  left join lateral (
    select x.target_id from platform.associations_live x
    where x.source_type = 'agent_shortcut' and x.source_id = s.id and x.target_type = 'task'
    order by x.created_at limit 1
  ) st on true
  where s.created_by = v_uid
     or s.organization_id in (select om.organization_id from iam.organization_member om
        where om.user_id = v_uid and om.role in ('owner','admin'))
     or sp.target_id in (select m.container_id from iam.memberships m
        where m.container_type='project' and m.user_id = v_uid and m.deleted_at is null and m.role in ('owner','admin'))
  order by case when s.created_by is not null then 0 when s.organization_id is not null then 1
                when sp.target_id is not null then 2 when st.target_id is not null then 3 else 4 end,
           s.sort_order, s.label;
end;
$function$;

CREATE OR REPLACE FUNCTION public.agx_get_user_shortcuts_m()
 RETURNS TABLE(id uuid, label text, description text, icon_name text, keyboard_shortcut text, sort_order integer, category_id uuid, category_label text, agent_id uuid, agent_name text, agent_version_id uuid, use_latest boolean, scope_type text, scope_name text, user_id uuid, organization_id uuid, project_id uuid, task_id uuid, enabled_features jsonb, scope_mappings jsonb, context_mappings jsonb, display_mode text, allow_chat boolean, auto_run boolean, show_variable_panel boolean, variables_panel_style text, show_definition_messages boolean, show_definition_message_content boolean, hide_reasoning boolean, hide_tool_results boolean, show_pre_execution_gate boolean, pre_execution_message text, bypass_gate_seconds integer, default_user_input text, default_variables jsonb, context_overrides jsonb, llm_overrides jsonb, is_active boolean, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid();
begin
  return query
  select
    s.id, s.label, s.description, s.icon_name, s.keyboard_shortcut, s.sort_order,
    s.category_id, sc.name,
    s.agent_id, a.name, s.agent_version_id, s.use_latest,
    (case when st.target_id is not null then 'task' when sp.target_id is not null then 'project'
          when s.organization_id is not null then 'organization' when s.created_by is not null then 'personal'
          else 'system' end)::text,
    (case when st.target_id is not null then (select t.title from workspace.tasks t where t.id = st.target_id and iam.assoc_side_readable('task', t.id))
          when sp.target_id is not null then (select p.name from workspace.projects p where p.id = sp.target_id and iam.assoc_side_readable('project', p.id))
          when s.organization_id is not null then (select o.name from iam.organizations o where o.id = s.organization_id)
          when s.created_by is not null then 'Personal' else 'System' end)::text,
    s.created_by, s.organization_id, sp.target_id, st.target_id,
    s.enabled_features, s.scope_mappings, s.context_mappings,
    s.display_mode, s.allow_chat, s.auto_run,
    s.show_variable_panel, s.variables_panel_style,
    s.show_definition_messages, s.show_definition_message_content,
    s.hide_reasoning, s.hide_tool_results,
    s.show_pre_execution_gate, s.pre_execution_message, s.bypass_gate_seconds,
    s.default_user_input, s.default_variables, s.context_overrides, s.llm_overrides,
    s.is_active, s.created_at, s.updated_at
  from mandate.vw_shortcut s
  left join agent.definition a on a.id = s.agent_id
  left join platform.categories sc on sc.id = s.category_id and sc.dimension = 'shortcut'
  left join lateral (
    select x.target_id from platform.associations_live x
    where x.source_type = 'agent_shortcut' and x.source_id = s.id and x.target_type = 'project'
    order by x.created_at limit 1
  ) sp on true
  left join lateral (
    select x.target_id from platform.associations_live x
    where x.source_type = 'agent_shortcut' and x.source_id = s.id and x.target_type = 'task'
    order by x.created_at limit 1
  ) st on true
  where s.created_by = v_uid
     or s.organization_id in (select om.organization_id from iam.organization_member om
        where om.user_id = v_uid and om.role in ('owner','admin'))
     or sp.target_id in (select m.container_id from iam.memberships m
        where m.container_type='project' and m.user_id = v_uid and m.deleted_at is null and m.role in ('owner','admin'))
  order by case when s.created_by is not null then 0 when s.organization_id is not null then 1
                when sp.target_id is not null then 2 when st.target_id is not null then 3 else 4 end,
           s.sort_order, s.label;
end;
$function$;

CREATE OR REPLACE FUNCTION public.conversation_shared_room_notice(p_conversation_id uuid)
 RETURNS TABLE(in_shared_room boolean, room_count integer, room_label text, room_type text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'iam', 'chat', 'workspace'
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_vis platform.visibility;
  v_owner uuid;
  r record;
  v_count integer := 0;
  v_label text; v_first_type text;
  v_schema text; v_table text; v_title_col text; v_type_label text;
begin
  if v_uid is null then
    -- Signed out: no conversation, no sentence. Never a NULL row that a client reads as "fine".
    return;
  end if;

  -- 🚨 THE DOOR NEVER WIDENS ANYTHING. It answers only about a conversation the caller can ALREADY
  -- read — asked through the same kernel every policy asks — so it cannot become a way to probe
  -- somebody else's rooms by id.
  if not iam.has_access('conversation', p_conversation_id, 'viewer'::public.permission_level) then
    return;
  end if;

  select c.visibility, c.created_by into v_vis, v_owner
    from chat.conversation c where c.id = p_conversation_id;
  if v_vis is null then return; end if;

  -- The sentence is for the OWNER of a conversation that is still marked private. A conversation
  -- that is already `internal` says what it is; a reader who is not the owner is being told nothing
  -- they do not know by being in the room.
  if v_vis > 'personal'::platform.visibility or v_owner is distinct from v_uid then
    return query select false, 0, null::text, null::text;
    return;
  end if;

  -- 🚨 THE ROOM'S NAME IS RESOLVED FROM THE REGISTRY, NOT FROM A LIST OF THREE CONTAINER TYPES.
  -- `platform.entity_types` already knows every token's schema, table and `title_column`, so this
  -- names a war room today and names whatever container someone registers next year without anybody
  -- editing this function. A hard-coded `case container_type` here would be a second registry that
  -- silently says "thread" for every container it had not heard of.
  for r in
    select rr.container_type, rr.container_id
      from platform.reachability rr
     where rr.item_type = 'conversation'
       and rr.item_id = p_conversation_id
       and rr.max_level >= 'viewer'::public.permission_level
       and (rr.container_type, rr.container_id) is distinct from ('conversation', p_conversation_id)
     order by rr.container_type, rr.container_id
  loop
    v_count := v_count + 1;
    if v_label is null then
      select et.schema_name, et.table_name, et.title_column, et.label
        into v_schema, v_table, v_title_col, v_type_label
        from platform.entity_types et where et.token = r.container_type and et.is_active;
      v_type_label := coalesce(v_type_label, r.container_type);
      -- RC-A5d (rca5d_c): the container's NAME is read only when the owner may open that container;
      -- otherwise the warning still says what kind of place it is ("a shared Project") — true, and
      -- not another person's title.
      if v_schema is not null and v_title_col is not null
         and iam.assoc_side_readable(r.container_type, r.container_id)
         and to_regclass(format('%I.%I', v_schema, v_table)) is not null then
        begin
          execute format('select %I from %I.%I where id = $1', v_title_col, v_schema, v_table)
            into v_label using r.container_id;
        exception when others then
          -- A name we cannot read is not a reason to say nothing: the sentence's JOB is the warning,
          -- and "a shared room" is still true.
          v_label := null;
        end;
      end if;
      v_label := coalesce(nullif(btrim(coalesce(v_label,'')), ''), v_type_label);
      v_first_type := r.container_type;
    end if;
  end loop;

  return query select v_count > 0, v_count, v_label, v_first_type;
end
$function$;
