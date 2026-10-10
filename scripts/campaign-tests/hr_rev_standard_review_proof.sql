-- HR-REVIEWS proof (2026-10-09): repeatable, ROLLED BACK (the block ends by raising its report; nothing is kept).
-- The standard performance review, end to end through the hr.hr_review_* doors as the real seats
-- (role authenticated + request.jwt.claims, so the EXECUTE grants are exercised too):
--   blind rule (manager cannot read the self review before both submit; employee cannot read the
--   manager review before it is shared), wrong-organization refusal, non-respondent save refused,
--   a draft save leaves the workflow instance unchanged, submit closes the step, acknowledge writes
--   acknowledged_at through the engine, reopen requires a fresh acknowledgment.
-- Seats (organization "admin's Workspace" 884d1ce8-…): admin@admin.com = HR owner AND Elena Marquez's
-- manager (a party is a party first, so the blind rule binds him); test@test.com = Elena Marquez;
-- an outsider = any account holding no employment in that organization.
-- RED before hr_rev_01/02 (the doors do not exist); GREEN after.
-- Ends with an error whose text is 'HR_REV PROOF: ALL PASS' (rolled back) or names the failed checks.
do $proof$
declare
  c_org   constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';
  c_hr    constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_hremp constant uuid := '6ee5ede7-fead-4de5-a0c3-523fa5073af7';   -- his employment (no manager)
  c_emp   constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com = Elena Marquez
  c_eemp  constant uuid := '59bc7d74-6b17-4349-b75e-7a324e42b77e';   -- her employment
  v_out uuid; v_fail text[] := '{}'; v_j jsonb; v_cycle uuid; v_rev uuid; v_inst uuid; v_inst2 uuid;
  v_before jsonb; v_after jsonb; v_snap jsonb; v_self jsonb; v_mgr jsonb; v_x jsonb; v_t text;
  d text;
begin
  -- ---- RED: every door and table must exist
  foreach d in array array['hr.hr_review_template_ensure_default(uuid)','hr.hr_review_cycle_create(jsonb)',
      'hr.hr_review_cycle_launch(uuid,jsonb)','hr.hr_review_get(uuid)',
      'hr.hr_review_save_response(uuid,text,jsonb,integer)','hr.hr_review_submit_response(uuid,text)',
      'hr.hr_review_share(uuid)','hr.hr_review_acknowledge(uuid,text)','hr.hr_review_reopen(uuid,text)',
      'hr.hr_review_history(uuid)','hr.hr_review_cycle_close(uuid)'] loop
    if to_regprocedure(d) is null then v_fail := array_append(v_fail, 'door missing: ' || d); end if;
  end loop;
  if to_regclass('hr.review') is null or to_regclass('hr.review_response') is null then
    v_fail := array_append(v_fail, 'tables hr.review / hr.review_response missing');
  end if;
  if not exists (select 1 from hr.workflow_flow_type where flow_key = 'performance_review') then
    v_fail := array_append(v_fail, 'flow type performance_review missing');
  end if;
  if cardinality(v_fail) > 0 then
    raise exception 'HR_REV PROOF FAILED (RED): %', array_to_string(v_fail, '; ');
  end if;

  select u.id into v_out from auth.users u
   where u.id not in (c_hr, c_emp)
     and not exists (select 1 from hr.employment em join hr.employee e on e.id = em.employee_id
                      where e.login_user_id = u.id and em.organization_id = c_org)
   order by u.created_at limit 1;

  -- ================= HR launches a cycle
  perform set_config('request.jwt.claims', json_build_object('sub', c_hr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_j := hr.hr_review_template_ensure_default(c_org);
  if not (v_j ->> 'ok')::boolean then v_fail := array_append(v_fail, 'ensure_default: ' || v_j::text); end if;
  v_j := hr.hr_review_cycle_create(jsonb_build_object('organization_id', c_org,
           'name', 'H2 2026 performance review', 'period_start', '2026-07-01', 'period_end', '2026-12-31',
           'self_due_on', '2026-10-23', 'manager_due_on', '2026-10-30', 'share_due_on', '2026-11-06'));
  v_cycle := (v_j ->> 'cycle_id')::uuid;
  if v_cycle is null then raise exception 'HR_REV PROOF FAILED: cycle_create %', v_j; end if;
  v_j := hr.hr_review_cycle_launch(v_cycle, jsonb_build_object('employment_ids', jsonb_build_array(c_eemp, c_hremp)));
  v_rev := (v_j #>> '{created,0,review_id}')::uuid;
  if v_rev is null or jsonb_array_length(v_j -> 'created') <> 1 then
    raise exception 'HR_REV PROOF FAILED: launch %', v_j;
  end if;
  if not coalesce((v_j #>> '{created,0,workflow,launched}')::boolean, false) then
    v_fail := array_append(v_fail, 'launch: workflow not launched: ' || (v_j #>> '{created,0,workflow}'));
  end if;
  if (v_j #>> '{refused,0,reason}') is distinct from 'no_manager' then
    v_fail := array_append(v_fail, 'launch: an employment with no manager was not refused by name: ' || (v_j -> 'refused')::text);
  end if;
  v_j := hr.hr_review_cycle_launch(v_cycle, jsonb_build_object('employment_ids', jsonb_build_array(c_eemp)));
  if (v_j #>> '{refused,0,reason}') is distinct from 'already_in_cycle' then
    v_fail := array_append(v_fail, 'launch: a second launch was not refused already_in_cycle');
  end if;
  reset role;
  select workflow_instance_id into v_inst from hr.review where id = v_rev;
  select c.template_snapshot into v_snap from hr.review_cycle c where c.id = v_cycle;
  if (select state from hr.workflow_step where workflow_instance_id = v_inst and step_key = 'self') <> 'active'
     or (select state from hr.workflow_step where workflow_instance_id = v_inst and step_key = 'manager') <> 'active' then
    v_fail := array_append(v_fail, 'routing: self and manager steps are not both active');
  end if;
  if (select due_at from hr.workflow_step where workflow_instance_id = v_inst and step_key = 'self')
       is distinct from ('2026-10-24'::timestamp at time zone 'UTC') then
    v_fail := array_append(v_fail, 'routing: the self step is not due on the cycle''s self date');
  end if;

  -- realistic answers built from the frozen template
  v_self := jsonb_build_object('__kind', 'performance_review_answers',
    'lists', jsonb_build_object(
      'responsibilities', jsonb_build_array('Run the monthly close for the client services ledger',
                                            'Onboard and train new account coordinators'),
      'accomplishments', jsonb_build_array('Cut the month-end close from six days to four',
                                           'Rebuilt the vendor onboarding checklist used by the whole team'),
      'strengths', jsonb_build_array('Calm, precise follow-through under deadline',
                                     'Explains reconciliations clearly to non-finance staff'),
      'opportunities', jsonb_build_array('Delegate routine entries instead of doing them herself',
                                         'Speak up earlier when a deadline is at risk')),
    'ratings', (select jsonb_object_agg((q ->> 'key') || '.' || (i ->> 'key'), 4)
                  from jsonb_array_elements(v_snap -> 'sections') s,
                       jsonb_array_elements(s -> 'questions') q,
                       jsonb_array_elements(coalesce(q -> 'items', '[]'::jsonb)) i
                 where q ->> 'type' = 'rating'),
    'texts', jsonb_build_object('goals', 'Lead the Q1 audit preparation end to end.'));
  v_mgr := jsonb_set(jsonb_set(v_self, '{texts,goals}', '"Own the Q1 audit file and mentor one new coordinator."'),
                     '{lists,opportunities}', '["Hand off routine journal entries by March","Flag schedule risk at the weekly check-in"]');

  -- ================= wrong organization: an outsider reaches nothing
  if v_out is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_out, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_j := hr.hr_review_get(v_rev);
    if (v_j ->> 'reason') is distinct from 'not_reachable' then v_fail := array_append(v_fail, 'wrong-org get: ' || v_j::text); end if;
    v_j := hr.hr_review_save_response(v_rev, 'self', v_self, null);
    if (v_j ->> 'reason') is distinct from 'not_reachable' then v_fail := array_append(v_fail, 'wrong-org save: ' || v_j::text); end if;
    v_j := hr.hr_review_cycle_get(v_cycle);
    if (v_j ->> 'reason') is distinct from 'not_reachable' then v_fail := array_append(v_fail, 'wrong-org cycle_get: ' || v_j::text); end if;
    v_j := hr.hr_review_list_mine(c_org);
    if jsonb_array_length(coalesce(v_j -> 'reviews', '[]'::jsonb)) <> 0 then v_fail := array_append(v_fail, 'wrong-org list_mine returned rows'); end if;
    reset role;
  else
    v_fail := array_append(v_fail, 'fixture: no outsider account found');
  end if;

  -- ================= the employee saves a draft: the instance must not move
  select jsonb_build_object('state', i.state, 'digest', i.target_digest, 'updated_at', i.updated_at,
           'version', i.version, 'events', (select count(*) from hr.workflow_event e where e.workflow_instance_id = i.id),
           'steps', (select jsonb_agg(jsonb_build_object(s.step_key, s.state) order by s.step_key) from hr.workflow_step s where s.workflow_instance_id = i.id))
    into v_before from hr.workflow_instance i where i.id = v_inst;
  perform set_config('request.jwt.claims', json_build_object('sub', c_emp, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_j := hr.hr_review_save_response(v_rev, 'self', jsonb_set(v_self, '{lists,accomplishments}', '["Cut the close to four days"]'), null);
  if not coalesce((v_j ->> 'ok')::boolean, false) then v_fail := array_append(v_fail, 'employee draft save: ' || v_j::text); end if;
  v_j := hr.hr_review_save_response(v_rev, 'self', v_self, (v_j ->> 'version')::int);
  if not coalesce((v_j ->> 'ok')::boolean, false) then v_fail := array_append(v_fail, 'employee second save: ' || v_j::text); end if;
  v_j := hr.hr_review_save_response(v_rev, 'self', v_self, 1);
  if (v_j ->> 'reason') is distinct from 'version_conflict' then v_fail := array_append(v_fail, 'stale version not refused: ' || v_j::text); end if;
  -- non-respondent: the employee cannot write the manager's review
  v_j := hr.hr_review_save_response(v_rev, 'manager', v_mgr, null);
  if (v_j ->> 'reason') is distinct from 'not_respondent' then v_fail := array_append(v_fail, 'non-respondent save: ' || v_j::text); end if;
  -- an incomplete submit is refused, naming questions only
  reset role;
  select jsonb_build_object('state', i.state, 'digest', i.target_digest, 'updated_at', i.updated_at,
           'version', i.version, 'events', (select count(*) from hr.workflow_event e where e.workflow_instance_id = i.id),
           'steps', (select jsonb_agg(jsonb_build_object(s.step_key, s.state) order by s.step_key) from hr.workflow_step s where s.workflow_instance_id = i.id))
    into v_after from hr.workflow_instance i where i.id = v_inst;
  if v_after is distinct from v_before then
    v_fail := array_append(v_fail, format('draft save moved the workflow instance: %s -> %s', v_before, v_after));
  end if;

  -- ================= the manager drafts; the self review stays blind
  perform set_config('request.jwt.claims', json_build_object('sub', c_hr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_j := hr.hr_review_save_response(v_rev, 'manager', v_mgr, null);
  if not coalesce((v_j ->> 'ok')::boolean, false) then v_fail := array_append(v_fail, 'manager draft save: ' || v_j::text); end if;
  v_j := hr.hr_review_get(v_rev);
  select x into v_x from jsonb_array_elements(v_j -> 'responses') x where x ->> 'role' = 'self';
  if v_x ? 'answers' or (v_x ->> 'visible')::boolean then
    v_fail := array_append(v_fail, 'BLIND: manager read the self draft');
  end if;
  reset role;

  -- the employee submits; the self step closes
  perform set_config('request.jwt.claims', json_build_object('sub', c_emp, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_j := hr.hr_review_submit_response(v_rev, 'self');
  if not coalesce((v_j ->> 'ok')::boolean, false) then v_fail := array_append(v_fail, 'self submit: ' || v_j::text); end if;
  if not coalesce((v_j #>> '{workflow,closed}')::boolean, false) then v_fail := array_append(v_fail, 'self submit did not close the step: ' || (v_j -> 'workflow')::text); end if;
  v_j := hr.hr_review_save_response(v_rev, 'self', v_self, null);
  if (v_j ->> 'reason') is distinct from 'already_submitted' then v_fail := array_append(v_fail, 'save after submit not refused: ' || v_j::text); end if;
  v_j := hr.hr_review_get(v_rev);
  select x into v_x from jsonb_array_elements(v_j -> 'responses') x where x ->> 'role' = 'manager';
  if v_x ? 'answers' then v_fail := array_append(v_fail, 'BLIND: employee read the manager draft'); end if;
  reset role;
  if (select state from hr.workflow_step where workflow_instance_id = v_inst and step_key = 'self') <> 'approved' then
    v_fail := array_append(v_fail, 'self step not approved after submit');
  end if;

  -- manager: self submitted, manager not yet -> still blind
  perform set_config('request.jwt.claims', json_build_object('sub', c_hr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_j := hr.hr_review_get(v_rev);
  select x into v_x from jsonb_array_elements(v_j -> 'responses') x where x ->> 'role' = 'self';
  if v_x ? 'answers' then v_fail := array_append(v_fail, 'BLIND: manager read the submitted self review before submitting his own'); end if;
  if (v_x ->> 'status') is distinct from 'submitted' then v_fail := array_append(v_fail, 'manager cannot see that the self review was submitted'); end if;
  v_j := hr.hr_review_share(v_rev);
  if (v_j ->> 'reason') is distinct from 'not_both_submitted' then v_fail := array_append(v_fail, 'share before both submitted not refused: ' || v_j::text); end if;
  v_j := hr.hr_review_submit_response(v_rev, 'manager');
  if (v_j ->> 'review_status') is distinct from 'both_submitted' or not coalesce((v_j #>> '{workflow,closed}')::boolean, false) then
    v_fail := array_append(v_fail, 'manager submit: ' || v_j::text);
  end if;
  v_j := hr.hr_review_get(v_rev);
  select x into v_x from jsonb_array_elements(v_j -> 'responses') x where x ->> 'role' = 'self';
  if not (v_x ? 'answers') then v_fail := array_append(v_fail, 'manager cannot read the self review after both submitted'); end if;
  reset role;

  -- employee: both submitted but not shared -> manager review still blind
  perform set_config('request.jwt.claims', json_build_object('sub', c_emp, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_j := hr.hr_review_get(v_rev);
  select x into v_x from jsonb_array_elements(v_j -> 'responses') x where x ->> 'role' = 'manager';
  if v_x ? 'answers' then v_fail := array_append(v_fail, 'BLIND: employee read the manager review before it was shared'); end if;
  if (v_j #>> '{review,overall_rating}') is not null then v_fail := array_append(v_fail, 'BLIND: employee saw the overall rating before sharing'); end if;
  reset role;

  -- manager rates and shares
  perform set_config('request.jwt.claims', json_build_object('sub', c_hr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_j := hr.hr_review_share(v_rev);
  if (v_j ->> 'reason') is distinct from 'overall_rating_missing' then v_fail := array_append(v_fail, 'share without an overall rating not refused: ' || v_j::text); end if;
  v_j := hr.hr_review_set_overall(v_rev, 'excellent');
  if (v_j ->> 'reason') is distinct from 'validation' then v_fail := array_append(v_fail, 'off-scale overall not refused'); end if;
  v_j := hr.hr_review_set_overall(v_rev, 'exceeds');
  v_j := hr.hr_review_share(v_rev);
  if not coalesce((v_j ->> 'ok')::boolean, false) or not coalesce((v_j #>> '{workflow,closed}')::boolean, false) then
    v_fail := array_append(v_fail, 'share: ' || v_j::text);
  end if;
  reset role;
  if (select state from hr.workflow_step where workflow_instance_id = v_inst and step_key = 'acknowledge') <> 'active' then
    v_fail := array_append(v_fail, 'acknowledge step not active after share');
  end if;

  -- employee reads the manager review, then acknowledges through the engine
  perform set_config('request.jwt.claims', json_build_object('sub', c_emp, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_j := hr.hr_review_get(v_rev);
  select x into v_x from jsonb_array_elements(v_j -> 'responses') x where x ->> 'role' = 'manager';
  if not (v_x ? 'answers') then v_fail := array_append(v_fail, 'employee cannot read the shared manager review'); end if;
  v_j := hr.hr_review_acknowledge(v_rev, 'Thank you. I agree with the goals for Q1.');
  if (v_j ->> 'acknowledged_at') is null or (v_j ->> 'review_status') is distinct from 'acknowledged' then
    v_fail := array_append(v_fail, 'acknowledge: ' || v_j::text);
  end if;
  reset role;
  if (select acknowledged_at from hr.review where id = v_rev) is null then v_fail := array_append(v_fail, 'acknowledged_at not written'); end if;
  select state into v_t from hr.workflow_instance where id = v_inst;
  if v_t not in ('closed', 'completed') then v_fail := array_append(v_fail, 'instance not closed after acknowledgment: ' || v_t); end if;

  -- ================= reopen: history kept, a FRESH acknowledgment required
  perform set_config('request.jwt.claims', json_build_object('sub', c_hr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_j := hr.hr_review_reopen(v_rev, 'Overall rating corrected after calibration');
  if (v_j ->> 'review_status') is distinct from 'reopened' or not coalesce((v_j #>> '{workflow,launched}')::boolean, false) then
    v_fail := array_append(v_fail, 'reopen: ' || v_j::text);
  end if;
  v_inst2 := (v_j ->> 'workflow_instance_id')::uuid;
  reset role;
  if (select acknowledged_at from hr.review where id = v_rev) is not null then v_fail := array_append(v_fail, 'reopen kept the old acknowledgment'); end if;
  if (select jsonb_array_length(reopen_history) from hr.review where id = v_rev) <> 1 then v_fail := array_append(v_fail, 'reopen history not kept'); end if;
  if (select state from hr.workflow_step where workflow_instance_id = v_inst2 and step_key = 'self') <> 'skipped'
     or (select state from hr.workflow_step where workflow_instance_id = v_inst2 and step_key = 'manager') <> 'active' then
    v_fail := array_append(v_fail, 'reopened routing is not manager-only');
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', c_emp, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_j := hr.hr_review_acknowledge(v_rev, null);
  if (v_j ->> 'reason') is distinct from 'not_shared' then v_fail := array_append(v_fail, 'acknowledge on a reopened review not refused: ' || v_j::text); end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c_hr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_j := hr.hr_review_set_overall(v_rev, 'successful');
  v_j := hr.hr_review_submit_response(v_rev, 'manager');
  if (v_j ->> 'review_status') is distinct from 'both_submitted' then v_fail := array_append(v_fail, 'resubmit after reopen: ' || v_j::text); end if;
  v_j := hr.hr_review_share(v_rev);
  if not coalesce((v_j ->> 'ok')::boolean, false) then v_fail := array_append(v_fail, 're-share: ' || v_j::text); end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c_emp, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_j := hr.hr_review_acknowledge(v_rev, null);
  if (v_j ->> 'acknowledged_at') is null then v_fail := array_append(v_fail, 'fresh acknowledgment: ' || v_j::text); end if;
  v_j := hr.hr_review_history(c_eemp);
  if jsonb_array_length(coalesce(v_j -> 'reviews', '[]'::jsonb)) <> 1 or (v_j #>> '{reviews,0,overall_rating}') <> 'successful' then
    v_fail := array_append(v_fail, 'employee history: ' || v_j::text);
  end if;
  reset role;

  -- ================= HR completion view and close
  perform set_config('request.jwt.claims', json_build_object('sub', c_hr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_j := hr.hr_review_cycle_get(v_cycle);
  if (v_j #>> '{counts,total}')::int <> 1 or (v_j #>> '{reviews,0,status}') <> 'acknowledged' then
    v_fail := array_append(v_fail, 'cycle_get: ' || (v_j - 'cycle')::text);
  end if;
  v_j := hr.hr_review_cycle_close(v_cycle);
  if (v_j ->> 'cycle_status') is distinct from 'closed' then v_fail := array_append(v_fail, 'cycle_close: ' || v_j::text); end if;
  v_j := hr.hr_review_reopen(v_rev, 'late correction');
  if (v_j ->> 'reason') is distinct from 'cycle_not_open' then v_fail := array_append(v_fail, 'closed cycle did not lock the review: ' || v_j::text); end if;
  reset role;

  if cardinality(v_fail) > 0 then
    raise exception 'HR_REV PROOF FAILED: %', array_to_string(v_fail, '; ');
  end if;
  raise exception 'HR_REV PROOF: ALL PASS (rolled back). review %, instances % then %', v_rev, v_inst, v_inst2;
end
$proof$;
