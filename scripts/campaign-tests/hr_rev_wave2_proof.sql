-- HR-REVIEWS wave 2 proof (2026-10-09): repeatable, ROLLED BACK (the block ends by raising its report).
-- Knobs read by the doors, template doors, calibration doors — through the hr.hr_review_* doors as the
-- real seats (role authenticated + request.jwt.claims). Organization overrides are written as
-- platform.knob_override rows inside the same rolled-back transaction.
-- Seats: admin@admin.com = HR owner and Elena Marquez's manager; test@test.com = Elena Marquez.
-- RED before hr_rev_04/05 (knobs and doors missing); GREEN after.
-- Ends with an error whose text is 'HR_REV WAVE2 PROOF: ALL PASS' (rolled back) or names the failed checks.
do $proof$
declare
  c_org   constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';
  c_hr    constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_emp   constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_eemp  constant uuid := '59bc7d74-6b17-4349-b75e-7a324e42b77e';
  v_fail text[] := '{}'; v_j jsonb; v_cycle uuid; v_rev uuid; v_inst uuid; v_snap jsonb; v_ans jsonb;
  v_tpl uuid; v_def jsonb; v_x jsonb; d text; v_secs jsonb; v_scale jsonb;
begin
  -- ---- RED
  foreach d in array array['hr.hr_review_template_list(uuid)','hr.hr_review_template_save(jsonb)',
      'hr.hr_review_template_archive(uuid)','hr.hr_review_calibration(uuid,jsonb)',
      'hr.hr_review_calibrate(uuid,text,text)'] loop
    if to_regprocedure(d) is null then v_fail := array_append(v_fail, 'door missing: ' || d); end if;
  end loop;
  if (select count(*) from platform.feature_knob where feature = 'hr.performance' and key in ('standard_review_self_days',
      'standard_review_manager_days','standard_review_reminder_cadence_hours','standard_review_manager_sees_self',
      'standard_review_calibration_required','standard_review_ack_comment')) <> 6 then
    v_fail := array_append(v_fail, 'the six standard_review_* knobs are not declared');
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'hr' and table_name = 'review' and column_name = 'calibrated_by') then
    v_fail := array_append(v_fail, 'hr.review.calibrated_by missing');
  end if;
  if cardinality(v_fail) > 0 then raise exception 'HR_REV WAVE2 PROOF FAILED (RED): %', array_to_string(v_fail, '; '); end if;

  -- ---- organization overrides (rolled back with everything else)
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('hr.performance', 'standard_review_reminder_cadence_hours', 'organization', c_org, c_org, '24'::jsonb, 'wave2 proof'),
         ('hr.performance', 'standard_review_manager_sees_self', 'organization', c_org, c_org, '"after_employee_submits"'::jsonb, 'wave2 proof'),
         ('hr.performance', 'standard_review_calibration_required', 'organization', c_org, c_org, 'true'::jsonb, 'wave2 proof'),
         ('hr.performance', 'standard_review_ack_comment', 'organization', c_org, c_org, 'false'::jsonb, 'wave2 proof');

  perform set_config('request.jwt.claims', json_build_object('sub', c_hr, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- ================= templates
  v_j := hr.hr_review_template_ensure_default(c_org);
  select t.sections, t.rating_scale into v_secs, v_scale from hr.review_template t where t.id = (v_j ->> 'template_id')::uuid;
  v_j := hr.hr_review_template_save(jsonb_build_object('organization_id', c_org, 'name', 'Customer support review',
           'sections', jsonb_build_array(jsonb_build_object('__kind', 'performance_review_template_section', 'key', 'impact',
             'title', 'Impact', 'questions', jsonb_build_array(jsonb_build_object('__kind', 'performance_review_question',
               'key', 'impact', 'type', 'essay', 'label', 'Impact')))),
           'rating_scale', v_scale));
  if (v_j ->> 'reason') is distinct from 'template_invalid' or (v_j #>> '{problems,0,problem}') is distinct from 'question_type' then
    v_fail := array_append(v_fail, 'template: an unknown question type was not refused: ' || v_j::text);
  end if;
  v_j := hr.hr_review_template_save(jsonb_build_object('organization_id', c_org, 'name', 'Customer support review',
           'sections', v_secs, 'rating_scale', jsonb_build_object('__kind', 'performance_review_rating_scale',
             'points', jsonb_build_array(jsonb_build_object('__kind', 'performance_review_rating_point', 'value', 1, 'key', 'low', 'label', 'Low')))));
  if (v_j #>> '{problems,0,problem}') is distinct from 'scale_needs_two_points' then
    v_fail := array_append(v_fail, 'template: a one-point scale was not refused: ' || v_j::text);
  end if;
  v_j := hr.hr_review_template_save(jsonb_build_object('organization_id', c_org, 'name', 'Customer support review',
           'description', 'Support team: responsibilities, wins, ratings.', 'sections', v_secs, 'rating_scale', v_scale));
  v_tpl := (v_j ->> 'template_id')::uuid;
  if v_tpl is null then v_fail := array_append(v_fail, 'template: valid save failed: ' || v_j::text); end if;
  v_j := hr.hr_review_template_list(c_org);
  if not exists (select 1 from jsonb_array_elements(v_j -> 'templates') x where (x ->> 'template_id')::uuid = v_tpl) then
    v_fail := array_append(v_fail, 'template: list does not show the saved template');
  end if;

  -- ================= cycle: due dates default from the day knobs; launch carries the cadence
  v_j := hr.hr_review_cycle_create(jsonb_build_object('organization_id', c_org, 'name', 'Q4 2026 support review',
           'period_start', '2026-10-01', 'period_end', '2026-12-31', 'template_id', v_tpl));
  v_cycle := (v_j ->> 'cycle_id')::uuid;
  if (v_j ->> 'self_due_on')::date is distinct from current_date + 14 or (v_j ->> 'manager_due_on')::date is distinct from current_date + 21 then
    v_fail := array_append(v_fail, 'knobs: due dates did not default from the day knobs: ' || v_j::text);
  end if;
  v_j := hr.hr_review_cycle_launch(v_cycle, jsonb_build_object('employment_ids', jsonb_build_array(c_eemp)));
  v_rev := (v_j #>> '{created,0,review_id}')::uuid;
  if (v_j ->> 'reminder_cadence_hours')::int is distinct from 24 then
    v_fail := array_append(v_fail, 'knobs: launch did not carry the organization cadence: ' || coalesce(v_j ->> 'reminder_cadence_hours', 'null'));
  end if;
  -- the template archive leaves the cycle's frozen snapshot alone
  v_j := hr.hr_review_template_archive(v_tpl);
  if not coalesce((v_j ->> 'ok')::boolean, false) then v_fail := array_append(v_fail, 'template archive: ' || v_j::text); end if;
  reset role;
  select workflow_instance_id into v_inst from hr.review where id = v_rev;
  select jsonb_build_object('org', d.organization_id = c_org, 'cad', d.reminder_cadence_hours) into v_def
    from hr.workflow_instance i join hr.workflow_definition d on d.id = i.workflow_definition_id where i.id = v_inst;
  if v_def is distinct from '{"org": true, "cad": 24}'::jsonb then
    v_fail := array_append(v_fail, 'knobs: the instance is not on an organization definition with cadence 24: ' || coalesce(v_def::text, 'null'));
  end if;
  select template_snapshot into v_snap from hr.review_cycle where id = v_cycle;
  if (v_snap ->> 'template_id')::uuid is distinct from v_tpl or v_snap -> 'sections' is null then
    v_fail := array_append(v_fail, 'template archive touched the cycle snapshot');
  end if;

  v_ans := jsonb_build_object('__kind', 'performance_review_answers',
    'lists', jsonb_build_object(
      'responsibilities', jsonb_build_array('Resolve escalated billing tickets within one business day'),
      'accomplishments', jsonb_build_array('Cut the escalation backlog from 140 to 30', 'Wrote the refund macro library'),
      'strengths', jsonb_build_array('Patient with frustrated customers', 'Documents fixes for the team'),
      'opportunities', jsonb_build_array('Hand off tickets earlier', 'Take on one training session a month')),
    'ratings', (select jsonb_object_agg((q ->> 'key') || '.' || (i ->> 'key'), 4)
                  from jsonb_array_elements(v_snap -> 'sections') s, jsonb_array_elements(s -> 'questions') q,
                       jsonb_array_elements(coalesce(q -> 'items', '[]'::jsonb)) i where q ->> 'type' = 'rating'),
    'texts', jsonb_build_object('goals', 'Own the refund policy rewrite.'));

  -- ================= manager_sees_self = after_employee_submits
  perform set_config('request.jwt.claims', json_build_object('sub', c_emp, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform hr.hr_review_save_response(v_rev, 'self', v_ans, null);
  v_j := hr.hr_review_submit_response(v_rev, 'self');
  if not coalesce((v_j #>> '{workflow,closed}')::boolean, false) then v_fail := array_append(v_fail, 'self submit: ' || v_j::text); end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c_hr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_j := hr.hr_review_get(v_rev);
  select x into v_x from jsonb_array_elements(v_j -> 'responses') x where x ->> 'role' = 'self';
  if not (v_x ? 'answers') then v_fail := array_append(v_fail, 'knobs: after_employee_submits did not show the self review to the manager'); end if;
  perform hr.hr_review_save_response(v_rev, 'manager', jsonb_set(v_ans, '{ratings,attendance.punctuality}', '5'), null);
  perform hr.hr_review_submit_response(v_rev, 'manager');
  perform hr.hr_review_set_overall(v_rev, 'exceeds');

  -- ================= calibration_required holds share until HR calibrates
  v_j := hr.hr_review_share(v_rev);
  if (v_j ->> 'reason') is distinct from 'calibration_required' then v_fail := array_append(v_fail, 'calibration_required did not hold share: ' || v_j::text); end if;
  v_j := hr.hr_review_calibration(v_cycle, '{}'::jsonb);
  select x into v_x from jsonb_array_elements(v_j -> 'rows') x where (x ->> 'review_id')::uuid = v_rev;
  if v_x is null or (v_x ->> 'self_overall')::numeric <> 4 or (v_x ->> 'manager_overall')::numeric <= 4 then
    v_fail := array_append(v_fail, 'calibration row means wrong: ' || coalesce(v_x::text, 'no row'));
  end if;
  if v_j::text like '%Cut the escalation backlog%' or v_j::text like '%refund policy%' then
    v_fail := array_append(v_fail, 'calibration leaked answer text');
  end if;
  if (v_j #>> '{distribution,by_rating,exceeds}')::int is distinct from 1 then
    v_fail := array_append(v_fail, 'calibration distribution: ' || (v_j -> 'distribution')::text);
  end if;
  v_j := hr.hr_review_calibrate(v_rev, 'successful', 'Aligned with the support team''s distribution.');
  if (v_j ->> 'overall_rating') is distinct from 'exceeds' or (v_j ->> 'calibrated_rating') is distinct from 'successful' then
    v_fail := array_append(v_fail, 'calibrate: ' || v_j::text);
  end if;
  v_j := hr.hr_review_share(v_rev);
  if not coalesce((v_j ->> 'ok')::boolean, false) then v_fail := array_append(v_fail, 'share after calibration: ' || v_j::text); end if;
  reset role;
  if (select calibrated_by from hr.review where id = v_rev) is distinct from c_hr or (select overall_rating from hr.review where id = v_rev) <> 'exceeds' then
    v_fail := array_append(v_fail, 'calibration did not record calibrated_by or did not keep the manager rating');
  end if;

  -- ================= ack_comment = false
  perform set_config('request.jwt.claims', json_build_object('sub', c_emp, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_j := hr.hr_review_acknowledge(v_rev, 'I disagree with the rating.');
  if (v_j ->> 'reason') is distinct from 'comment_not_enabled' then v_fail := array_append(v_fail, 'ack_comment=false did not refuse a comment: ' || v_j::text); end if;
  v_j := hr.hr_review_acknowledge(v_rev, null);
  if (v_j ->> 'acknowledged_at') is null then v_fail := array_append(v_fail, 'acknowledge without comment: ' || v_j::text); end if;
  reset role;

  -- ================= a non-HR caller reaches none of the HR doors
  perform set_config('request.jwt.claims', json_build_object('sub', c_emp, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if (hr.hr_review_calibration(v_cycle, '{}'::jsonb) ->> 'reason') is distinct from 'not_reachable'
     or (hr.hr_review_template_list(c_org) ->> 'reason') is distinct from 'not_permitted'
     or (hr.hr_review_calibrate(v_rev, 'outstanding', null) ->> 'reason') is distinct from 'not_reachable' then
    v_fail := array_append(v_fail, 'an employee reached an HR-only door');
  end if;
  reset role;

  if cardinality(v_fail) > 0 then raise exception 'HR_REV WAVE2 PROOF FAILED: %', array_to_string(v_fail, '; '); end if;
  raise exception 'HR_REV WAVE2 PROOF: ALL PASS (rolled back). review %, cycle %', v_rev, v_cycle;
end
$proof$;
