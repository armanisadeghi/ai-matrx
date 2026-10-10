-- chair-step: lane HR-REVIEWS. Creates two NEW functions — hr._rev_review_goal_ids(uuid) (the goals a review shows for a goal_review question) and a three-argument hr._rev_answer_problems(jsonb, jsonb, uuid[]) that adds the goal_review branch — and replaces hr.hr_review_submit_response (declared below) to call it. Plain (invoker) functions only reached from inside the SECURITY DEFINER doors; no grant, no REVOKE, no DROP, no data row changed.
-- lane: HR-REVIEWS
-- based-on: hr.hr_review_submit_response(uuid, text) fd8c4b7d35bdf18192cb452858f2946da417ab5f14d464dfd3815712cc026f42
--
-- hr_rev_09 — A GOAL_REVIEW QUESTION WAS NEVER CHECKED AT SUBMIT. The two-argument validator had no
-- goal_review branch, so a submit accepted unrated goals and off-scale values (ratings["goals.x"]=99).
-- Now every goal the review shows needs a rating within the cycle's frozen scale (when the question
-- is required), and a "goals.<id>" key naming a goal the review does not show is refused.

create function hr._rev_review_goal_ids(p_review_id uuid)
 returns uuid[] language sql stable set search_path to 'hr', 'public'
as $function$
  -- the same overlap hr_review_get shows: the employee's live goals touching the cycle period
  select coalesce(array_agg(g.id order by g.id), '{}'::uuid[])
    from hr.review r join hr.review_cycle c on c.id = r.cycle_id
    join hr.goal g on g.employment_id = r.employment_id and g.deleted_at is null and g.status <> 'dropped'
                  and (g.start_on is null or g.start_on <= c.period_end)
                  and (g.due_on is null or g.due_on >= c.period_start)
   where r.id = p_review_id
     and exists (select 1 from jsonb_array_elements(coalesce(c.template_snapshot -> 'sections', '[]'::jsonb)) s,
                              jsonb_array_elements(coalesce(s -> 'questions', '[]'::jsonb)) q
                  where q ->> 'type' = 'goal_review');
$function$;

CREATE FUNCTION hr._rev_answer_problems(p_snapshot jsonb, p_answers jsonb, p_goal_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'hr', 'public'
AS $function$
declare
  sec jsonb; q jsonb; it jsonb; v jsonb; n integer; v_out jsonb := '[]'::jsonb;
  v_points jsonb := coalesce(p_snapshot #> '{rating_scale,points}', '[]'::jsonb);
  v_list jsonb; v_req boolean; g uuid; k text;
begin
  if p_answers is null or jsonb_typeof(p_answers) <> 'object'
     or (p_answers ->> '__kind') is distinct from 'performance_review_answers' then
    return jsonb_build_array(jsonb_build_object('question', null, 'problem', 'not_performance_review_answers'));
  end if;
  for sec in select e from jsonb_array_elements(coalesce(p_snapshot -> 'sections', '[]'::jsonb)) e loop
    for q in select e from jsonb_array_elements(coalesce(sec -> 'questions', '[]'::jsonb)) e loop
      v_req := coalesce((q ->> 'required')::boolean, true);
      if q ->> 'type' in ('narrative_list', 'responsibilities') then
        v_list := p_answers #> array['lists', q ->> 'key'];
        if v_list is null or jsonb_typeof(v_list) <> 'array' then v_list := '[]'::jsonb; end if;
        select count(*) into n from jsonb_array_elements(v_list) e
         where jsonb_typeof(e) = 'string' and btrim(e #>> '{}') <> '';
        if v_req and n < coalesce((q ->> 'min_items')::integer, 1) then
          v_out := v_out || jsonb_build_object('question', q ->> 'key', 'problem', 'too_few',
                                               'min_items', coalesce((q ->> 'min_items')::integer, 1), 'have', n);
        elsif q ? 'max_items' and n > (q ->> 'max_items')::integer then
          v_out := v_out || jsonb_build_object('question', q ->> 'key', 'problem', 'too_many',
                                               'max_items', (q ->> 'max_items')::integer, 'have', n);
        end if;
      elsif q ->> 'type' = 'rating' then
        for it in select e from jsonb_array_elements(coalesce(q -> 'items', '[]'::jsonb)) e loop
          v := p_answers #> array['ratings', (q ->> 'key') || '.' || (it ->> 'key')];
          if v is null or v = 'null'::jsonb then
            if v_req then
              v_out := v_out || jsonb_build_object('question', (q ->> 'key') || '.' || (it ->> 'key'),
                                                   'problem', 'unrated');
            end if;
          elsif not exists (select 1 from jsonb_array_elements(v_points) p where p -> 'value' = v) then
            v_out := v_out || jsonb_build_object('question', (q ->> 'key') || '.' || (it ->> 'key'),
                                                 'problem', 'out_of_scale');
          end if;
        end loop;
      elsif q ->> 'type' = 'goal_review' then
        -- every goal the review shows needs a rating on the frozen scale (hr_rev_09)
        foreach g in array coalesce(p_goal_ids, '{}'::uuid[]) loop
          v := p_answers #> array['ratings', 'goals.' || g::text];
          if v is null or v = 'null'::jsonb then
            if v_req then
              v_out := v_out || jsonb_build_object('question', 'goals.' || g::text, 'problem', 'unrated');
            end if;
          elsif not exists (select 1 from jsonb_array_elements(v_points) p where p -> 'value' = v) then
            v_out := v_out || jsonb_build_object('question', 'goals.' || g::text, 'problem', 'out_of_scale');
          end if;
        end loop;
      elsif q ->> 'type' = 'text' then
        if v_req and btrim(coalesce(p_answers #>> array['texts', q ->> 'key'], '')) = '' then
          v_out := v_out || jsonb_build_object('question', q ->> 'key', 'problem', 'missing');
        end if;
      end if;
    end loop;
  end loop;
  -- "goals.<id>" is reserved for goal_review: a key naming a goal the review does not show is refused
  for k in select e.key from jsonb_each(case when jsonb_typeof(p_answers -> 'ratings') = 'object'
                                             then p_answers -> 'ratings' else '{}'::jsonb end) e
            where e.key like 'goals.%' loop
    if not (substr(k, 7) = any(coalesce(p_goal_ids, '{}'::uuid[])::text[])) then
      v_out := v_out || jsonb_build_object('question', k, 'problem', 'unknown_goal');
    end if;
  end loop;
  return v_out;
end
$function$;

CREATE OR REPLACE FUNCTION hr.hr_review_submit_response(p_review_id uuid, p_role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare
  v_uid uuid := auth.uid(); r hr.review%rowtype; c hr.review_cycle%rowtype; x hr.review_response%rowtype;
  v_lane text; v_resp uuid; v_problems jsonb; v_wf jsonb; v_self_done boolean; v_mgr_done boolean;
  v_status text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  if hr._rev_seat(v_uid, p_review_id) is null and hr._rev_lane(v_uid, p_review_id, 'peer') is null then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  if p_role is null or p_role not in ('self', 'manager', 'peer') then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'role');
  end if;
  v_lane := hr._rev_lane(v_uid, p_review_id, p_role);
  if v_lane is null then return jsonb_build_object('ok', false, 'reason', 'not_respondent', 'role', p_role); end if;
  select * into r from hr.review where id = p_review_id for update;
  select * into c from hr.review_cycle where id = r.cycle_id;
  if c.status <> 'open' then return jsonb_build_object('ok', false, 'reason', 'cycle_not_open', 'cycle_status', c.status); end if;
  if r.status = 'cancelled' then return jsonb_build_object('ok', false, 'reason', 'review_cancelled'); end if;
  if p_role = 'manager' and r.status in ('shared', 'acknowledged') then
    return jsonb_build_object('ok', false, 'reason', 'review_shared');
  end if;
  v_resp := case when v_lane = 'recorder' then null else v_uid end;
  select * into x from hr.review_response
   where review_id = r.id and role = p_role and deleted_at is null
     and respondent_user_id is not distinct from v_resp
   for update;
  if x.id is null then return jsonb_build_object('ok', false, 'reason', 'nothing_saved'); end if;
  if x.status = 'submitted' then return jsonb_build_object('ok', false, 'reason', 'already_submitted'); end if;
  -- a peer answers what they choose to; only the typed shape is required
  v_problems := case when p_role = 'peer' then
                  case when (x.answers ->> '__kind') = 'performance_review_answers' then '[]'::jsonb
                       else '[{"question":null,"problem":"not_performance_review_answers"}]'::jsonb end
                else hr._rev_answer_problems(c.template_snapshot, x.answers, hr._rev_review_goal_ids(r.id)) end;
  if jsonb_array_length(v_problems) > 0 then
    return jsonb_build_object('ok', false, 'reason', 'answers_incomplete', 'problems', v_problems);
  end if;

  update hr.review_response set status = 'submitted', submitted_at = now() where id = x.id;
  if p_role = 'peer' then
    -- peer feedback is a response row, not an engine step: nothing on the review or the workflow moves
    return jsonb_build_object('ok', true, 'review_id', r.id, 'role', 'peer', 'submitted_at', now());
  end if;
  v_self_done := p_role = 'self' or exists (select 1 from hr.review_response where review_id = r.id
                   and role = 'self' and status = 'submitted' and deleted_at is null);
  v_mgr_done := p_role = 'manager' or exists (select 1 from hr.review_response where review_id = r.id
                   and role = 'manager' and status = 'submitted' and deleted_at is null);
  v_status := case when v_self_done and v_mgr_done then 'both_submitted'
                   when v_self_done then 'self_submitted' else 'manager_submitted' end;
  update hr.review
     set self_submitted_at = case when p_role = 'self' then now() else self_submitted_at end,
         manager_submitted_at = case when p_role = 'manager' then now() else manager_submitted_at end,
         status = v_status
   where id = r.id;

  v_wf := hr._rev_close_step(r.id, p_role, 'attested', v_uid, v_lane);
  if v_status = 'both_submitted' then
    perform hr._rev_set_due(r.workflow_instance_id, 'share', c.share_due_on);
  end if;
  return jsonb_build_object('ok', true, 'review_id', r.id, 'role', p_role, 'submitted_at', now(),
    'review_status', v_status, 'both_submitted', v_status = 'both_submitted', 'workflow', v_wf);
end
$function$;
