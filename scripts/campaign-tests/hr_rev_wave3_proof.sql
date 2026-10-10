-- HR-REVIEWS wave 3 proof (2026-10-10): repeatable, ROLLED BACK (the block ends by raising its report).
-- Goals (OKR alignment, edit rights, progress history), the goal_review template question, and peer
-- feedback (nominate, approve, notice, peer response, visibility, anonymity) — through the hr doors as
-- the real seats (role authenticated + request.jwt.claims).
-- Organization "Oak Street Studio" 2643e470-…: admin@admin.com (Armani Sadeghi, HR owner) manages
-- Marcus Tillman; Jonas Whitfield is a colleague with a login and is the peer; test@test.com is not
-- employed there (the outsider).
-- RED before hr_rev_06/07; GREEN after. Ends with 'HR_REV WAVE3 PROOF: ALL PASS' or names the failures.
do $proof$
declare
  c_org    constant uuid := '2643e470-b275-47f3-95f3-ae275ad3ca47';
  c_admin  constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_aemp   constant uuid := '9c0b1d0c-a3d2-4ea1-b66b-0c45e5b0027a';
  c_marcus constant uuid := 'ab94c16c-b4a5-49f0-a068-e2a11db34a2c';
  c_memp   constant uuid := '1a7033e5-1536-4f15-9549-4e5dd85285c5';
  c_jonas  constant uuid := '381213e9-a1d5-459e-809d-956447f47ca5';
  c_jemp   constant uuid := '4ce46af4-0b94-4b34-892f-329b8810a472';
  c_out    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_fail text[] := '{}'; v_j jsonb; v_x jsonb; d text; v_team_goal uuid; v_goal uuid; v_tpl uuid; v_cycle uuid;
  v_rev uuid; v_nom uuid; v_ans jsonb; v_secs jsonb; v_scale jsonb; v_inst_before jsonb; v_inst_after jsonb; v_status text;
begin
  -- ---- RED
  foreach d in array array['hr.hr_goal_list(uuid)','hr.hr_goal_list_team(uuid)','hr.hr_goal_save(jsonb)',
      'hr.hr_goal_update_progress(uuid,numeric,numeric,text,text)','hr.hr_goal_archive(uuid)',
      'hr.hr_review_peer_nominate(uuid,uuid[])','hr.hr_review_peer_approve(uuid,uuid[],boolean)',
      'hr.hr_review_peer_requests_mine()','hr.hr_review_peer_share(uuid,boolean)'] loop
    if to_regprocedure(d) is null then v_fail := array_append(v_fail, 'door missing: ' || d); end if;
  end loop;
  if to_regclass('hr.goal') is null then v_fail := array_append(v_fail, 'table hr.goal missing'); end if;
  if not exists (select 1 from platform.feature_knob where feature = 'hr.performance' and key = 'standard_review_peers_enabled') then
    v_fail := array_append(v_fail, 'knob standard_review_peers_enabled missing');
  end if;
  if cardinality(v_fail) > 0 then raise exception 'HR_REV WAVE3 PROOF FAILED (RED): %', array_to_string(v_fail, '; '); end if;

  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('hr.performance', 'standard_review_peers_enabled', 'organization', c_org, c_org, 'true'::jsonb, 'wave3 proof');

  -- ================= goals
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_j := hr.hr_goal_save(jsonb_build_object('employment_id', c_aemp, 'title', 'Grow studio retainer revenue 20% in H2',
           'measure', 'Monthly retainer revenue', 'target_value', 60000, 'unit', 'USD', 'start_on', '2026-07-01', 'due_on', '2026-12-31'));
  v_team_goal := (v_j ->> 'goal_id')::uuid;
  v_j := hr.hr_goal_save(jsonb_build_object('employment_id', c_memp, 'title', 'Land three new retainer clients',
           'measure', 'Signed retainers', 'target_value', 3, 'current_value', 0, 'unit', 'clients',
           'start_on', '2026-07-01', 'due_on', '2026-12-15', 'parent_goal_id', v_team_goal));
  v_goal := (v_j ->> 'goal_id')::uuid;
  if v_team_goal is null or v_goal is null then raise exception 'HR_REV WAVE3 PROOF FAILED: goal save %', v_j; end if;
  v_j := hr.hr_goal_save(jsonb_build_object('goal_id', v_team_goal, 'parent_goal_id', v_goal));
  if (v_j ->> 'detail') is distinct from 'alignment_loop' then v_fail := array_append(v_fail, 'goals: an alignment loop was not refused: ' || v_j::text); end if;
  v_j := hr.hr_goal_list_team(c_aemp);
  if not exists (select 1 from jsonb_array_elements(v_j -> 'members') m, jsonb_array_elements(m -> 'goals') g
                  where (g ->> 'goal_id')::uuid = v_goal) then
    v_fail := array_append(v_fail, 'goals: team list does not show the report''s goal');
  end if;
  reset role;
  -- the owner records progress; history is appended
  perform set_config('request.jwt.claims', json_build_object('sub', c_marcus, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_j := hr.hr_goal_update_progress(v_goal, 1, null, 'on_track', 'Signed Halvorsen Design in August.');
  if (v_j ->> 'progress')::numeric is distinct from 33.3 or jsonb_array_length(v_j -> 'history') <> 1 then
    v_fail := array_append(v_fail, 'goals: progress/history: ' || v_j::text);
  end if;
  reset role;
  -- a colleague reads (Organization) but may not edit; an outsider reads nothing
  perform set_config('request.jwt.claims', json_build_object('sub', c_jonas, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_j := hr.hr_goal_list(c_memp);
  if not coalesce((v_j ->> 'ok')::boolean, false) or (v_j ->> 'can_edit')::boolean then
    v_fail := array_append(v_fail, 'goals: colleague read/edit flags wrong: ' || (v_j - 'goals')::text);
  end if;
  if (hr.hr_goal_update_progress(v_goal, 2, null, null, null) ->> 'reason') is distinct from 'not_reachable' then
    v_fail := array_append(v_fail, 'goals: a colleague outside the chain edited a goal');
  end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c_out, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if (hr.hr_goal_list(c_memp) ->> 'reason') is distinct from 'not_reachable' then
    v_fail := array_append(v_fail, 'goals: another organization read the goals');
  end if;
  reset role;

  -- ================= goal_review template + cycle
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_j := hr.hr_review_template_ensure_default(c_org);
  select t.sections, t.rating_scale into v_secs, v_scale from hr.review_template t where t.id = (v_j ->> 'template_id')::uuid;
  v_secs := v_secs || jsonb_build_array(jsonb_build_object('__kind', 'performance_review_template_section', 'key', 'goals_review',
              'title', 'Goals', 'questions', jsonb_build_array(jsonb_build_object('__kind', 'performance_review_question',
                'key', 'goal_progress', 'type', 'goal_review', 'label', 'Progress on goals', 'required', true))));
  v_j := hr.hr_review_template_save(jsonb_build_object('organization_id', c_org, 'name', 'Studio review with goals',
           'sections', v_secs, 'rating_scale', v_scale));
  v_tpl := (v_j ->> 'template_id')::uuid;
  if v_tpl is null then v_fail := array_append(v_fail, 'template: goal_review question refused: ' || v_j::text); end if;
  v_j := hr.hr_review_cycle_create(jsonb_build_object('organization_id', c_org, 'name', 'H2 2026 studio review',
           'period_start', '2026-07-01', 'period_end', '2026-12-31', 'template_id', v_tpl));
  v_cycle := (v_j ->> 'cycle_id')::uuid;
  v_j := hr.hr_review_cycle_launch(v_cycle, jsonb_build_object('employment_ids', jsonb_build_array(c_memp)));
  v_rev := (v_j #>> '{created,0,review_id}')::uuid;
  if v_rev is null then raise exception 'HR_REV WAVE3 PROOF FAILED: launch %', v_j; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', c_marcus, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_j := hr.hr_review_get(v_rev);
  if not exists (select 1 from jsonb_array_elements(v_j -> 'goals') g where (g ->> 'goal_id')::uuid = v_goal
                   and g ->> 'answer_key' = 'goals.' || v_goal::text) then
    v_fail := array_append(v_fail, 'goal_review: the review does not carry the employee''s goal: ' || (v_j -> 'goals')::text);
  end if;
  -- ================= hr_rev_09: goal_review answers are checked at submit
  v_ans := jsonb_build_object('__kind', 'performance_review_answers',
    'lists', jsonb_build_object('responsibilities', jsonb_build_array('Own new-business pitches for the studio'),
      'accomplishments', jsonb_build_array('Signed Halvorsen Design', 'Rebuilt the pitch deck template'),
      'strengths', jsonb_build_array('Calm in client rooms', 'Follows up the same day'),
      'opportunities', jsonb_build_array('Qualify leads earlier', 'Hand off delivery sooner')),
    'ratings', (select jsonb_object_agg((q ->> 'key') || '.' || (i ->> 'key'), 4)
                  from jsonb_array_elements(v_j #> '{template,sections}') sct, jsonb_array_elements(sct -> 'questions') q,
                       jsonb_array_elements(coalesce(q -> 'items', '[]'::jsonb)) i where q ->> 'type' = 'rating'));
  perform hr.hr_review_save_response(v_rev, 'self', v_ans, null);
  v_x := hr.hr_review_submit_response(v_rev, 'self');
  if not exists (select 1 from jsonb_array_elements(v_x -> 'problems') pr where pr ->> 'question' = 'goals.' || v_goal::text and pr ->> 'problem' = 'unrated') then
    v_fail := array_append(v_fail, 'goal_review: an unrated goal was accepted: ' || v_x::text);
  end if;
  perform hr.hr_review_save_response(v_rev, 'self', jsonb_set(v_ans, array['ratings', 'goals.' || v_goal::text], '99'), null);
  v_x := hr.hr_review_submit_response(v_rev, 'self');
  if not exists (select 1 from jsonb_array_elements(v_x -> 'problems') pr where pr ->> 'problem' = 'out_of_scale' and pr ->> 'question' = 'goals.' || v_goal::text) then
    v_fail := array_append(v_fail, 'goal_review: an off-scale goal rating was accepted: ' || v_x::text);
  end if;
  perform hr.hr_review_save_response(v_rev, 'self', jsonb_set(jsonb_set(v_ans, array['ratings', 'goals.' || v_goal::text], '4'),
            array['ratings', 'goals.' || gen_random_uuid()::text], '3'), null);
  v_x := hr.hr_review_submit_response(v_rev, 'self');
  if not exists (select 1 from jsonb_array_elements(v_x -> 'problems') pr where pr ->> 'problem' = 'unknown_goal') then
    v_fail := array_append(v_fail, 'goal_review: a rating for a goal the review does not show was accepted: ' || v_x::text);
  end if;
  perform hr.hr_review_save_response(v_rev, 'self', jsonb_set(v_ans, array['ratings', 'goals.' || v_goal::text], '4'), null);
  v_x := hr.hr_review_submit_response(v_rev, 'self');
  if not coalesce((v_x ->> 'ok')::boolean, false) then v_fail := array_append(v_fail, 'goal_review: a complete self review was refused: ' || v_x::text); end if;
  -- ================= peers: the employee nominates; parties are refused; nothing opens before approval
  v_j := hr.hr_review_peer_nominate(v_rev, array[c_jemp, c_aemp]);
  v_nom := (v_j #>> '{nominations,0,nomination_id}')::uuid;
  if (v_j #>> '{nominations,0,status}') is distinct from 'pending' or (v_j #>> '{refused,0,reason}') is distinct from 'is_a_party' then
    v_fail := array_append(v_fail, 'peers: nominate: ' || v_j::text);
  end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c_jonas, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if (hr.hr_review_save_response(v_rev, 'peer', '{"__kind":"performance_review_answers"}'::jsonb, null) ->> 'reason') is distinct from 'not_reachable' then
    v_fail := array_append(v_fail, 'peers: an unapproved peer could write');
  end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_j := hr.hr_review_peer_approve(v_rev, array[v_nom], true);
  if (v_j #>> '{decided,0,status}') is distinct from 'approved' then v_fail := array_append(v_fail, 'peers: approve: ' || v_j::text); end if;
  reset role;
  if not exists (select 1 from communication.notification n where n.recipient_user_id = c_jonas
                   and n.event_key = 'hr.performance.peer_feedback_requested' and n.deep_link like '%/hr/performance/reviews/' || v_rev::text || '%') then
    v_fail := array_append(v_fail, 'peers: no notice with the review deep link reached the peer: ' || coalesce(v_j #>> '{decided,0,notice}', 'null'));
  end if;
  if (select config ->> 'deep_link_template' from communication.notification_event_type
       where event_key = 'hr.performance.peer_feedback_requested' and deleted_at is null) not like '/hr/performance/reviews/{{review.id}}%' then
    v_fail := array_append(v_fail, 'peers: the event''s link template does not open the standard review');
  end if;
  select jsonb_build_object('state', i.state, 'digest', i.target_digest, 'version', i.version) into v_inst_before
    from hr.workflow_instance i join hr.review r on r.workflow_instance_id = i.id where r.id = v_rev;
  select status into v_status from hr.review where id = v_rev;

  -- the peer's inbox, then their response through the ordinary save/submit doors
  perform set_config('request.jwt.claims', json_build_object('sub', c_jonas, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_j := hr.hr_review_peer_requests_mine();
  if not exists (select 1 from jsonb_array_elements(v_j -> 'requests') q where (q ->> 'review_id')::uuid = v_rev) then
    v_fail := array_append(v_fail, 'peers: the request is not in the peer''s inbox');
  end if;
  v_j := hr.hr_review_save_response(v_rev, 'peer', jsonb_build_object('__kind', 'performance_review_answers',
           'lists', jsonb_build_object('strengths', jsonb_build_array('Brings clients into the room early', 'Unblocks the design team fast')),
           'texts', jsonb_build_object('additional_comments', 'Marcus covered the Halvorsen pitch when I was out.')), null);
  if not coalesce((v_j ->> 'ok')::boolean, false) then v_fail := array_append(v_fail, 'peers: peer save: ' || v_j::text); end if;
  v_j := hr.hr_review_submit_response(v_rev, 'peer');
  if not coalesce((v_j ->> 'ok')::boolean, false) then v_fail := array_append(v_fail, 'peers: peer submit: ' || v_j::text); end if;
  v_j := hr.hr_review_get(v_rev);
  if (v_j #>> '{review,my_seat}') is distinct from 'peer' or jsonb_array_length(v_j -> 'responses') <> 1 then
    v_fail := array_append(v_fail, 'peers: the peer sees more than their own response: ' || (v_j -> 'responses')::text);
  end if;
  reset role;
  select jsonb_build_object('state', i.state, 'digest', i.target_digest, 'version', i.version) into v_inst_after
    from hr.workflow_instance i join hr.review r on r.workflow_instance_id = i.id where r.id = v_rev;
  if v_inst_after is distinct from v_inst_before or (select status from hr.review where id = v_rev) is distinct from v_status then
    v_fail := array_append(v_fail, 'peers: a peer response moved the review or its workflow');
  end if;

  -- visibility: employee blind until shared; manager sees the name; once shared the employee reads it, unnamed
  perform set_config('request.jwt.claims', json_build_object('sub', c_marcus, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_j := hr.hr_review_get(v_rev);
  if exists (select 1 from jsonb_array_elements(v_j -> 'responses') x where x ->> 'role' = 'peer') then
    v_fail := array_append(v_fail, 'peers: the employee saw peer feedback before it was shared');
  end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_j := hr.hr_review_get(v_rev);
  select x into v_x from jsonb_array_elements(v_j -> 'responses') x where x ->> 'role' = 'peer';
  if not (v_x ? 'answers') or (v_x ->> 'respondent_name') is distinct from 'Jonas Whitfield' then
    v_fail := array_append(v_fail, 'peers: the manager cannot read the named peer response: ' || coalesce(v_x::text, 'none'));
  end if;
  v_j := hr.hr_review_peer_share(v_rev, true);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c_marcus, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_j := hr.hr_review_get(v_rev);
  select x into v_x from jsonb_array_elements(v_j -> 'responses') x where x ->> 'role' = 'peer';
  if v_x is null or not (v_x ? 'answers') then v_fail := array_append(v_fail, 'peers: the employee cannot read shared peer feedback'); end if;
  if v_x ? 'respondent_name' or v_j::text like '%Jonas Whitfield%' and (v_j -> 'responses')::text like '%Jonas%' then
    v_fail := array_append(v_fail, 'peers: anonymous peer feedback named its author to the employee');
  end if;
  -- the goal owner archives the goal; it leaves the review's goals
  v_j := hr.hr_goal_archive(v_goal);
  if not coalesce((v_j ->> 'ok')::boolean, false) then v_fail := array_append(v_fail, 'goals: archive: ' || v_j::text); end if;
  if jsonb_array_length(hr.hr_review_get(v_rev) -> 'goals') <> 0 then v_fail := array_append(v_fail, 'goals: an archived goal still shows on the review'); end if;
  reset role;

  if cardinality(v_fail) > 0 then raise exception 'HR_REV WAVE3 PROOF FAILED: %', array_to_string(v_fail, '; '); end if;
  raise exception 'HR_REV WAVE3 PROOF: ALL PASS (rolled back). review %, goal %, nomination %', v_rev, v_goal, v_nom;
end
$proof$;
