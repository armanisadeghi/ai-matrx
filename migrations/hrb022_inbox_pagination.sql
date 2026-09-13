-- HRB-022 — one bounded HR inbox, independently paged by section.
--
-- Keep the public signature and envelope stable. `page_offsets` is deliberately inside the
-- existing filters object so this remains the one inbox RPC, while each section is bounded before
-- JSON construction (and before the display/notice decoration in wf_inbox).

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, min_value, max_value,
   label, description, set_by, basis, review_due)
values
  ('hr.workflow', 'inbox_page_size', '50'::jsonb, '50'::jsonb, 'integer',
   1, 200, 'Workflow inbox page size',
   'Rows returned per independently paged section of the one HR task inbox.',
   'agent', 'HRB-022 inbox load bound; review after production pagination evidence', date '2026-12-12')
on conflict (feature, key) do nothing;

create or replace function hr.wf_pending(
  p_employment_id uuid default null::uuid,
  p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable security definer
set search_path to 'hr', 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_users uuid[];
  v_emp uuid[];
  v_org uuid;
  v_show_wait boolean;
  v_limit integer := (hr._knob('hr.workflow', 'inbox_page_size') #>> '{}')::integer;
  v_offsets jsonb := coalesce(p_filters -> 'page_offsets', '{}'::jsonb);
  v_key text;
  v_value jsonb;
  v_offset integer;
  v_needs_offset integer := 0;
  v_auto_offset integer := 0;
  v_wait_offset integer := 0;
  v_failures_offset integer := 0;
  v_recent_offset integer := 0;
  v_needs_total integer; v_auto_total integer; v_wait_total integer; v_failures_total integer; v_recent_total integer;
begin
  if v_uid is null then return jsonb_build_object('granted', false, 'reason', 'no_caller'); end if;
  if jsonb_typeof(p_filters) <> 'object' then
    return jsonb_build_object('granted', false, 'reason', 'bad_page_offsets',
      'detail', 'filters must be an object');
  end if;
  if jsonb_typeof(v_offsets) <> 'object' then
    return jsonb_build_object('granted', false, 'reason', 'bad_page_offsets',
      'detail', 'page_offsets must be an object keyed by inbox section');
  end if;
  for v_key, v_value in select key, value from jsonb_each(v_offsets) loop
    if v_key not in ('needs_my_decision', 'scope_rows', 'auto_applying_soon',
                     'waiting_on_others', 'failures_assigned_to_me', 'recently_decided')
       or jsonb_typeof(v_value) <> 'number'
       or (v_value #>> '{}')::numeric < 0
       or (v_value #>> '{}')::numeric <> trunc((v_value #>> '{}')::numeric)
       or (v_value #>> '{}')::numeric > 2147483647 then
      return jsonb_build_object('granted', false, 'reason', 'bad_page_offsets',
        'detail', 'page_offsets must contain only non-negative whole-number inbox section offsets');
    end if;
  end loop;
  v_needs_offset := coalesce((v_offsets ->> 'needs_my_decision')::integer, 0);
  v_auto_offset := coalesce((v_offsets ->> 'auto_applying_soon')::integer, 0);
  v_wait_offset := coalesce((v_offsets ->> 'waiting_on_others')::integer, 0);
  v_failures_offset := coalesce((v_offsets ->> 'failures_assigned_to_me')::integer, 0);
  v_recent_offset := coalesce((v_offsets ->> 'recently_decided')::integer, 0);
  -- URLs may name any non-negative integer; the server returns the containing page, never a
  -- non-boundary offset the strict envelope would reject.
  v_needs_offset := (v_needs_offset / v_limit) * v_limit;
  v_auto_offset := (v_auto_offset / v_limit) * v_limit;
  v_wait_offset := (v_wait_offset / v_limit) * v_limit;
  v_failures_offset := (v_failures_offset / v_limit) * v_limit;
  v_recent_offset := (v_recent_offset / v_limit) * v_limit;

  if p_employment_id is null then
    v_emp := hr.employments_of(v_uid); v_users := array[v_uid];
  else
    select organization_id into v_org from hr.employment where id = p_employment_id;
    if not hr.capability(v_uid, 'workflow.view_queue', p_employment_id)
       and not (p_employment_id = any(hr.employments_of(v_uid))) then
      return hr._governance_refusal(v_org, 'hr_workflow_step', 'no_queue_authority',
        'reading another person''s approval queue needs workflow administration standing',
        p_employment_id, '{}');
    end if;
    v_emp := array[p_employment_id]; v_users := array[hr._wf_login_of(p_employment_id)];
  end if;
  v_show_wait := (hr._knob('hr.workflow', 'inbox_show_waiting') #>> '{}')::boolean;
  select count(*) into v_needs_total from hr.workflow_step s join hr.workflow_instance i on i.id=s.workflow_instance_id where s.state='active' and s.resolved_user_ids && v_users and (p_filters->>'flow_key' is null or i.flow_key=p_filters->>'flow_key');
  select count(*) into v_auto_total from hr.workflow_step s join hr.workflow_instance i on i.id=s.workflow_instance_id where s.state='active' and s.autonomy_mode=3 and s.timeout_at is not null and s.resolved_user_ids && v_users and (p_filters->>'flow_key' is null or i.flow_key=p_filters->>'flow_key');
  select count(*) into v_wait_total from hr.workflow_instance i where i.state in ('validating','routing','active','applying','verifying') and (i.requester_employment_id=any(hr._employments_of_identity(v_uid)) or i.subject_employment_id=any(hr._employments_of_identity(v_uid))) and (p_filters->>'flow_key' is null or i.flow_key=p_filters->>'flow_key');
  select count(*) into v_failures_total from hr.workflow_failure f join hr.workflow_instance i on i.id=f.workflow_instance_id where f.state in ('open','retrying') and f.assigned_employment_id=any(v_emp) and (p_filters->>'flow_key' is null or i.flow_key=p_filters->>'flow_key');
  select count(*) into v_recent_total from hr.workflow_decision d join hr.workflow_instance i on i.id=d.workflow_instance_id where d.actor_employment_id=any(v_emp) and d.decided_at > now()-interval '30 days' and (p_filters->>'flow_key' is null or i.flow_key=p_filters->>'flow_key');
  v_needs_offset := case when v_needs_total=0 then 0 else least(v_needs_offset, ((v_needs_total-1)/v_limit)*v_limit) end;
  v_auto_offset := case when v_auto_total=0 then 0 else least(v_auto_offset, ((v_auto_total-1)/v_limit)*v_limit) end;
  v_wait_offset := case when not v_show_wait or v_wait_total=0 then 0 else least(v_wait_offset, ((v_wait_total-1)/v_limit)*v_limit) end;
  v_failures_offset := case when v_failures_total=0 then 0 else least(v_failures_offset, ((v_failures_total-1)/v_limit)*v_limit) end;
  v_recent_offset := case when v_recent_total=0 then 0 else least(v_recent_offset, ((v_recent_total-1)/v_limit)*v_limit) end;

  return jsonb_build_object(
    'granted', true,
    'needs_my_decision', coalesce((
      select jsonb_agg(jsonb_build_object(
        'step_id', q.id, 'instance_id', q.instance_id, 'flow_key', q.flow_key,
        'step_key', q.step_key, 'due_at', q.due_at, 'activated_at', q.activated_at,
        'priority', q.priority, 'urgent', q.urgent, 'resolution_path', q.resolution_path,
        'autonomy_mode', q.autonomy_mode, 'timeout_at', q.timeout_at,
        'sensitivity_tier', q.sensitivity_tier, 'deep_link', q.deep_link)
        order by q.urgent desc, q.due_at asc nulls last, q.id)
      from (
        select s.id, i.id instance_id, i.flow_key, s.step_key, s.due_at, s.activated_at,
               i.priority, i.priority = 'urgent' urgent, s.resolution_path, s.autonomy_mode,
               s.timeout_at, i.sensitivity_tier,
               '/hr/tasks/' || i.id::text || '?org=' || i.organization_id::text || '&step=' || s.id::text || coalesce(
                 '&notice=' || (select nt.id::text from communication.notification nt
                   where nt.recipient_user_id = v_uid and nt.target_id = s.id and nt.channel = 'in_app'
                   order by nt.created_at desc limit 1), '') deep_link
          from hr.workflow_step s join hr.workflow_instance i on i.id = s.workflow_instance_id
         where s.state = 'active' and s.resolved_user_ids && v_users
           and (p_filters ->> 'flow_key' is null or i.flow_key = p_filters ->> 'flow_key')
         order by (i.priority = 'urgent') desc, s.due_at asc nulls last, s.id
         limit v_limit offset v_needs_offset) q), '[]'::jsonb),
    'auto_applying_soon', coalesce((
      select jsonb_agg(jsonb_build_object('step_id', q.id, 'instance_id', q.instance_id,
        'flow_key', q.flow_key, 'flow_label', q.flow_label, 'timeout_at', q.timeout_at)
        order by q.timeout_at asc nulls last, q.id)
      from (
        select s.id, i.id instance_id, i.flow_key, coalesce(ft.label, i.flow_key) flow_label, s.timeout_at
          from hr.workflow_step s join hr.workflow_instance i on i.id = s.workflow_instance_id
          left join lateral (select ft2.label from hr.workflow_flow_type ft2
            where ft2.flow_key = i.flow_key and ft2.deleted_at is null
            order by (ft2.organization_id = i.organization_id) desc limit 1) ft on true
         where s.state = 'active' and s.autonomy_mode = 3 and s.timeout_at is not null
           and s.resolved_user_ids && v_users
           and (p_filters ->> 'flow_key' is null or i.flow_key = p_filters ->> 'flow_key')
         order by s.timeout_at asc nulls last, s.id limit v_limit offset v_auto_offset) q), '[]'::jsonb),
    'waiting_on_others', case when not v_show_wait then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('instance_id', q.id, 'flow_key', q.flow_key,
        'flow_label', q.flow_label, 'summary', q.summary, 'state', q.state, 'submitted_at', q.submitted_at)
        order by q.submitted_at desc nulls last, q.id)
      from (
        select i.id, i.flow_key, coalesce(ft.label, i.flow_key) flow_label,
               hr._wf_row_summary(i.flow_key, i.target_token, i.target_id) summary, i.state, i.submitted_at
          from hr.workflow_instance i
          left join lateral (select ft2.label from hr.workflow_flow_type ft2
            where ft2.flow_key = i.flow_key and ft2.deleted_at is null
            order by (ft2.organization_id = i.organization_id) desc limit 1) ft on true
         where i.state in ('validating','routing','active','applying','verifying')
           and (i.requester_employment_id = any(hr._employments_of_identity(v_uid))
                or i.subject_employment_id = any(hr._employments_of_identity(v_uid)))
           and (p_filters ->> 'flow_key' is null or i.flow_key = p_filters ->> 'flow_key')
         order by i.submitted_at desc nulls last, i.id limit v_limit offset v_wait_offset) q), '[]'::jsonb) end,
    'failures_assigned_to_me', coalesce((
      select jsonb_agg(jsonb_build_object('failure_id', q.id, 'instance_id', q.instance_id,
        'failure_class', q.failure_class, 'state', q.state, 'occurred_at', q.occurred_at,
        'flow_label', q.flow_label, 'flow_key', q.flow_key)
        order by q.occurred_at desc nulls last, q.id)
      from (
        select f.id, f.workflow_instance_id instance_id, f.failure_class, f.state, f.occurred_at,
               coalesce(ft.label, i.flow_key) flow_label, i.flow_key
          from hr.workflow_failure f join hr.workflow_instance i on i.id = f.workflow_instance_id
          left join lateral (select ft2.label from hr.workflow_flow_type ft2
            where ft2.flow_key = i.flow_key and ft2.deleted_at is null
            order by (ft2.organization_id = i.organization_id) desc limit 1) ft on true
         where f.state in ('open','retrying') and f.assigned_employment_id = any(v_emp)
           and (p_filters ->> 'flow_key' is null or i.flow_key = p_filters ->> 'flow_key')
         order by f.occurred_at desc nulls last, f.id limit v_limit offset v_failures_offset) q), '[]'::jsonb),
    'recently_decided', coalesce((
      select jsonb_agg(jsonb_build_object('decision_id', q.id, 'instance_id', q.instance_id,
        'step_id', q.step_id, 'decision', q.decision, 'decided_at', q.decided_at, 'reason', q.reason,
        'title', q.title, 'flow_key', q.flow_key, 'flow_label', q.flow_label,
        'step_label', q.step_label, 'subject_label', q.subject_label,
        'subject_withheld', q.subject_withheld, 'digest', q.digest)
        order by q.decided_at desc nulls last, q.id)
      from (
        select d.id, d.workflow_instance_id instance_id, d.workflow_step_id step_id, d.decision,
               d.decided_at, d.reason, coalesce(dd.disp ->> 'title', ft.label, i.flow_key) title,
               i.flow_key, coalesce(dd.disp ->> 'flow_label', ft.label, i.flow_key) flow_label,
               coalesce(dd.disp ->> 'step_label', d.step_key) step_label, dd.disp ->> 'subject_label' subject_label,
               coalesce((dd.disp ->> 'subject_withheld')::boolean, false) subject_withheld, dd.disp ->> 'digest' digest
          from hr.workflow_decision d join hr.workflow_instance i on i.id = d.workflow_instance_id
          left join lateral (select hr._wf_display(d.workflow_step_id) disp) dd on true
          left join lateral (select ft2.label from hr.workflow_flow_type ft2
            where ft2.flow_key = i.flow_key and ft2.deleted_at is null
            order by (ft2.organization_id = i.organization_id) desc limit 1) ft on true
         where d.actor_employment_id = any(v_emp) and d.decided_at > now() - interval '30 days'
           and (p_filters ->> 'flow_key' is null or i.flow_key = p_filters ->> 'flow_key')
         order by d.decided_at desc nulls last, d.id limit v_limit offset v_recent_offset) q), '[]'::jsonb),
    'pagination', jsonb_build_object(
      'needs_my_decision', jsonb_build_object('offset', v_needs_offset, 'limit', v_limit, 'total',
        (select count(*) from hr.workflow_step s join hr.workflow_instance i on i.id=s.workflow_instance_id where s.state='active' and s.resolved_user_ids && v_users and (p_filters->>'flow_key' is null or i.flow_key=p_filters->>'flow_key'))),
      'scope_rows', jsonb_build_object('offset', 0, 'limit', v_limit, 'total', 0),
      'auto_applying_soon', jsonb_build_object('offset', v_auto_offset, 'limit', v_limit, 'total',
        (select count(*) from hr.workflow_step s join hr.workflow_instance i on i.id=s.workflow_instance_id where s.state='active' and s.autonomy_mode=3 and s.timeout_at is not null and s.resolved_user_ids && v_users and (p_filters->>'flow_key' is null or i.flow_key=p_filters->>'flow_key'))),
      'waiting_on_others', jsonb_build_object('offset', v_wait_offset, 'limit', v_limit, 'total', case when v_show_wait then (select count(*) from hr.workflow_instance i where i.state in ('validating','routing','active','applying','verifying') and (i.requester_employment_id=any(hr._employments_of_identity(v_uid)) or i.subject_employment_id=any(hr._employments_of_identity(v_uid))) and (p_filters->>'flow_key' is null or i.flow_key=p_filters->>'flow_key')) else 0 end),
      'failures_assigned_to_me', jsonb_build_object('offset', v_failures_offset, 'limit', v_limit, 'total',
        (select count(*) from hr.workflow_failure f join hr.workflow_instance i on i.id=f.workflow_instance_id where f.state in ('open','retrying') and f.assigned_employment_id=any(v_emp) and (p_filters->>'flow_key' is null or i.flow_key=p_filters->>'flow_key'))),
      'recently_decided', jsonb_build_object('offset', v_recent_offset, 'limit', v_limit, 'total',
        (select count(*) from hr.workflow_decision d join hr.workflow_instance i on i.id=d.workflow_instance_id where d.actor_employment_id=any(v_emp) and d.decided_at > now() - interval '30 days' and (p_filters->>'flow_key' is null or i.flow_key=p_filters->>'flow_key')))));
end
$function$;

-- The outer door retains the established visibility checks and only decorates the already-bounded
-- page of actionable rows. Scope rows are separately bounded here because their population differs.
create or replace function hr.wf_inbox(
  p_scope text default 'mine', p_employment_id uuid default null, p_filters jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path to 'hr','public' as $function$
declare
  v_uid uuid := auth.uid(); v_emp uuid[]; v_base jsonb; v_rows jsonb := '[]'::jsonb; r jsonb;
  v_extra jsonb := '[]'::jsonb; v_offsets jsonb := coalesce(p_filters -> 'page_offsets', '{}'::jsonb);
  v_scope_offset integer := 0;
  v_limit integer := (hr._knob('hr.workflow', 'inbox_page_size') #>> '{}')::integer;
  v_scope_total integer := 0;
begin
  if v_uid is null then return jsonb_build_object('granted', false, 'reason', 'no_caller'); end if;
  if p_scope not in ('mine','team','queue') then return jsonb_build_object('granted', false, 'reason', 'bad_scope', 'detail', 'scope is one of mine | team | queue (SPEC-UI-IA §5.9)'); end if;
  v_base := hr.wf_pending(p_employment_id, p_filters);
  if not coalesce((v_base ->> 'granted')::boolean, false) then return v_base; end if;
  v_scope_offset := coalesce((v_offsets ->> 'scope_rows')::integer, 0);
  v_scope_offset := (v_scope_offset / v_limit) * v_limit;
  v_emp := coalesce(case when p_employment_id is null then hr.employments_of(v_uid) else array[p_employment_id] end, '{}'::uuid[]);
  for r in select value from jsonb_array_elements(v_base -> 'needs_my_decision') loop
    v_rows := v_rows || (r || coalesce(hr._wf_display((r ->> 'step_id')::uuid), '{}'::jsonb) || jsonb_build_object('notices', coalesce((
      select jsonb_agg(jsonb_build_object('channel',n.channel,'status',n.status,'sent_at',n.sent_at,'delivered_at',n.delivered_at,'read_at',n.read_at,'failure_reason',n.failure_reason,'body', n.body) order by n.sent_at nulls last)
      from hr.workflow_notice n where n.workflow_step_id=(r->>'step_id')::uuid and n.recipient_user_id = v_uid), '[]'::jsonb)));
  end loop;
  if p_scope = 'queue' then
    -- THIS CHECK IS AN AFFORDANCE GATE AND IS ORG-LESS ON PURPOSE.
    if not hr.capability(v_uid, 'workflow.view_queue', null) then return jsonb_build_object('granted', false, 'reason', 'no_queue_authority', 'detail', 'the HR queue scope needs workflow administration standing'); end if;
    -- THE ITEMS BIND TO WHERE THE GRANT IS, NOT ONLY TO WHERE THE CALLER WORKS.
    -- SCOPE MEANS SCOPE WHEREVER THE POPULATION IS EVALUABLE.
    select count(*) into v_scope_total from hr.workflow_step s join hr.workflow_instance i on i.id=s.workflow_instance_id
     where s.state='active' and i.organization_id in (select organization_id from hr.employment where id=any(v_emp))
       and hr.capability(v_uid, 'workflow.view_queue', i.subject_employment_id,
                         current_date, i.organization_id)
       and not (s.resolved_user_ids && array[v_uid]) and (p_filters->>'flow_key' is null or i.flow_key=p_filters->>'flow_key');
    v_scope_offset := case when v_scope_total=0 then 0 else least(v_scope_offset, ((v_scope_total-1)/v_limit)*v_limit) end;
    select coalesce(jsonb_agg(jsonb_build_object('step_id',q.id,'instance_id',q.instance_id,'flow_key',q.flow_key,'step_key',q.step_key,'due_at',q.due_at,'activated_at',q.activated_at,'priority',q.priority,'urgent',q.urgent,'sensitivity_tier',q.sensitivity_tier,'deep_link',q.deep_link) || coalesce(hr._wf_display(q.id),'{}'::jsonb) order by q.urgent desc,q.due_at asc nulls last,q.id),'[]'::jsonb) into v_extra from (
      select s.id,i.id instance_id,i.flow_key,s.step_key,s.due_at,s.activated_at,i.priority,i.priority='urgent' urgent,i.sensitivity_tier,'/hr/tasks/'||i.id::text||'?org='||i.organization_id::text||'&step='||s.id::text||coalesce('&notice='||(select nt.id::text from communication.notification nt where nt.recipient_user_id = v_uid and nt.target_id=s.id and nt.channel = 'in_app' order by nt.created_at desc limit 1),'') deep_link from hr.workflow_step s join hr.workflow_instance i on i.id=s.workflow_instance_id where s.state='active' and i.organization_id in (select organization_id from hr.employment where id=any(v_emp)) and hr.capability(v_uid, 'workflow.view_queue', i.subject_employment_id, current_date, i.organization_id) and not(s.resolved_user_ids && array[v_uid]) and (p_filters->>'flow_key' is null or i.flow_key=p_filters->>'flow_key') order by (i.priority='urgent') desc,s.due_at asc nulls last,s.id limit v_limit offset v_scope_offset) q;
  elsif p_scope = 'team' then
    select count(*) into v_scope_total from hr.workflow_step s join hr.workflow_instance i on i.id=s.workflow_instance_id where s.state='active' and not(s.resolved_user_ids && array[v_uid]) and i.subject_employment_id is not null and exists(select 1 from hr.manager_chain(i.subject_employment_id) mc where mc.manager_employment_id=any(v_emp)) and (p_filters->>'flow_key' is null or i.flow_key=p_filters->>'flow_key');
    v_scope_offset := case when v_scope_total=0 then 0 else least(v_scope_offset, ((v_scope_total-1)/v_limit)*v_limit) end;
    select coalesce(jsonb_agg(jsonb_build_object('step_id',q.id,'instance_id',q.instance_id,'flow_key',q.flow_key,'step_key',q.step_key,'due_at',q.due_at,'activated_at',q.activated_at,'priority',q.priority,'urgent',q.urgent,'sensitivity_tier',q.sensitivity_tier,'deep_link',q.deep_link) || coalesce(hr._wf_display(q.id),'{}'::jsonb) order by q.urgent desc,q.due_at asc nulls last,q.id),'[]'::jsonb) into v_extra from (select s.id,i.id instance_id,i.flow_key,s.step_key,s.due_at,s.activated_at,i.priority,i.priority='urgent' urgent,i.sensitivity_tier,'/hr/tasks/'||i.id::text||'?org='||i.organization_id::text||'&step='||s.id::text||coalesce('&notice='||(select nt.id::text from communication.notification nt where nt.recipient_user_id = v_uid and nt.target_id=s.id and nt.channel = 'in_app' order by nt.created_at desc limit 1),'') deep_link from hr.workflow_step s join hr.workflow_instance i on i.id=s.workflow_instance_id where s.state='active' and not(s.resolved_user_ids && array[v_uid]) and i.subject_employment_id is not null and exists(select 1 from hr.manager_chain(i.subject_employment_id) mc where mc.manager_employment_id=any(v_emp)) and (p_filters->>'flow_key' is null or i.flow_key=p_filters->>'flow_key') order by (i.priority='urgent') desc,s.due_at asc nulls last,s.id limit v_limit offset v_scope_offset) q;
  end if;
  return v_base || jsonb_build_object('scope',p_scope,'needs_my_decision',v_rows,'scope_rows',v_extra,
    'pagination',(v_base->'pagination') || jsonb_build_object('scope_rows',jsonb_build_object('offset',v_scope_offset,'limit',v_limit,'total',v_scope_total)),
    'bulk_max',(hr._knob('hr.workflow','inbox_bulk_max')#>>'{}')::integer,'default_sort',hr._knob('hr.workflow','inbox_default_sort')#>>'{}','can_view_queue',hr.capability(v_uid,'workflow.view_queue',null),'employment_ids',to_jsonb(v_emp),'as_of',now());
end $function$;

comment on function hr.wf_inbox(text, uuid, jsonb) is
  'SPEC-WORKFLOW-ENGINE §5.2 / SPEC-UI-IA §5.9 — the ONE HR task inbox read. Six independently paged, database-bounded sections preserve the queue, access, display, notice and redaction rules.';

-- CREATE OR REPLACE preserves the existing public door signature, attributes, owner, and grants.
do $$
declare v_signature text;
begin
  select pg_get_function_identity_arguments(p.oid) into v_signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='hr_wf_inbox';
  if v_signature <> 'p_scope text, p_employment_id uuid, p_filters jsonb' then raise exception 'hrb022 pagination: public.hr_wf_inbox signature changed: %', v_signature; end if;
  if not has_function_privilege('authenticated','public.hr_wf_inbox(text,uuid,jsonb)','execute') then raise exception 'hrb022 pagination: authenticated lost public inbox execute'; end if;
end $$;

do $$
declare v_def text; v_broken text;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='hr' and p.proname='wf_inbox';
  if v_def not like '%THE ITEMS BIND TO WHERE THE GRANT IS, NOT ONLY TO WHERE THE CALLER WORKS%'
     or v_def not like '%THIS CHECK IS AN AFFORDANCE GATE AND IS ORG-LESS ON PURPOSE%'
     or v_def not like '%SCOPE MEANS SCOPE WHEREVER THE POPULATION IS EVALUABLE%' then
    raise exception 'hrb022 pagination: wf_inbox lost access-contract markers';
  end if;
  select string_agg(to_jsonb(b)::text, '; ') into v_broken
    from hr.function_contracts_broken() b
   where b.qname in ('hr.wf_pending', 'hr.wf_inbox');
  if v_broken is not null then
    raise exception 'hrb022 pagination: workflow function contracts broke: %', v_broken;
  end if;
end $$;
