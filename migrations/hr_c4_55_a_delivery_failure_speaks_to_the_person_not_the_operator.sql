-- hr_c4_55 — a delivery failure speaks to the PERSON, not to the operator; and a decision
--            history names what was decided.
--
-- ===================================================================================
-- D2 (P0) — SERVER CONFIG AND RAW PROVIDER STRINGS WERE PRINTED TO AN HR MANAGER
--
-- An adversarial walk of `/hr/tasks` and `/hr/tasks/{id}` as an ordinary HR manager read, in the
-- "What was sent about this" panel and in the NOTIFIED column:
--
--     not sent — RESEND_API_KEY / EMAIL_FROM are not set on this server.
--     not sent — Missing `html` or `text` field.
--     not sent — no address on file for this channel        ← the only one that was right
--
-- The first names our server's ENVIRONMENT VARIABLES and our mail vendor to a non-technical user.
-- The second is Resend's own API validation string, passed through verbatim. The third is what all
-- three should look like: a fact about the RECIPIENT, in words the reader can act on.
--
-- WHERE IT ACTUALLY CAME FROM — and why the renderer was never the right place to fix it.
--
--   `communication.notification` correctly keeps TWO fields: `error_code` (a stable token, the
--   spine's own vocabulary) and `error_message` (operator detail — env var names, provider
--   strings, SQLSTATEs). That split is right and stays. What was wrong is that the HR lane read
--   the OPERATOR half, and preferred it:
--
--       hr.workflow_notice.failure_reason := coalesce(error_message, error_code)
--
--   …so the operator's sentence won on every failing row. Worse, `hr.wf_instance` returned
--   `to_jsonb(n)` for each notice — the WHOLE view row — so `error_message` travelled to the
--   browser on the wire whether or not anything rendered it. Narrowing in the client (which
--   `envelope.ts` does) cannot unsend a payload.
--
--   The renderer then string-matched the operator message against a hand-kept map of code names
--   and, on no match, fell through to `not sent — ${reason}`: printing the raw string. That
--   fallthrough is what produced both leaks. It also meant the ONE good sentence was an accident —
--   `no_contact_point`'s message happens to contain the word "address", so a substring test caught
--   it. A rule that works by coincidence is not a rule.
--
-- THE FIX IS IN THE WRITER SIDE OF THE SPINE, because the string is STORED.
--   `communication.delivery_failure_sentence(error_code, channel)` is the ONE place a delivery
--   failure becomes words for somebody who is not an operator. `hr.workflow_notice.failure_reason`
--   is now that sentence, derived from the stable CODE and never from the operator message; and
--   `hr.wf_instance` ships the six delivery-evidence fields instead of the whole row, so
--   `error_code` and `error_message` stop leaving the database at all on the HR path.
--
--   The operator lane is unchanged and complete: `communication.notification` still holds both
--   fields, `hr.workflow_notice` still exposes both columns to anyone querying the view directly,
--   and the dispatcher still logs. Nothing was deleted; it was routed.
--
--   UNKNOWN CODES ARE NOT GUESSED AT. Anything the catalogue does not name — a new provider, a new
--   HTTP status, an exception — resolves to "we could not send this <channel>; nobody was
--   notified". That is the true and useful thing to tell the reader, and it can never contain a
--   token, a vendor name or a config key, because it is not built from the failure at all.
--
-- SWEEP FOR THE CLASS — one more live hit, fixed here.
--   `hr.wf_bulk_decide` caught `when others` around each step and returned
--   `'detail', sqlerrm` — a raw Postgres error message, rendered verbatim by the bulk-outcome
--   panel on `/hr/tasks` (`outcome.detail ?? outcome.reason`). Same defect, different lane. The
--   sqlerrm now goes to the Postgres log (`raise warning`, with its SQLSTATE — the operator lane)
--   and the decider is told what it means for them: the item was not decided and is still theirs.
--
--   While there: `WF_BULK_FORBIDDEN` listed raw flow KEYS ("these flows are decided one at a time:
--   pay_change, termination"). It now lists the labels the rest of the surface uses.
--
--   Checked and NOT changed: `hr.wf_request` / `hr.wf_resolve_approvers` carry sqlerrm into a
--   `hr._governance_refusal` detail, which is the audited operator record for a request that could
--   not be built — not a queue row an HR manager reads. `hr._wf_call_hook` / `hr._wf_project_step`
--   write sqlstate into workflow EVENT payloads (the operator trail). Those stay.
--
-- ===================================================================================
-- D10 — "Recently decided" was a wall of verbs with no subject.
--
-- A manager's own decision history rendered ~40 consecutive rows of `approved  8/27/2026,
-- 10:05:25 PM`: the machine verb and a timestamp, no employee, no request kind, nothing to click
-- through to. `hr.wf_pending` built that section from `hr.workflow_decision` alone and never asked
-- the display rule — even though the decision row carries `workflow_step_id`, which is exactly
-- what `hr._wf_display` takes.
--
-- 🚨 THE NAMING COMES FROM THE DOOR, NOT FROM A CLIENT-SIDE JOIN. `hr._wf_display` is the ONE
-- place that decides whether this caller may be told the subject's name, and the decider passes
-- its entitlement test by construction (they are in `resolved_user_ids` for the step they
-- decided). Rendering the name from a second lookup in the browser would be inventing disclosure;
-- this asks the rule that already exists. Identical in shape to the two the lane already solved:
-- the bulk-decide outcome panel and the attestation panel.
--
-- The section was also UNORDERED — `jsonb_agg` with no `order by` over a 30-day window. It is now
-- newest-first, which is the only ordering a history has.
--
-- Applied live as `hr_c4_55_a_delivery_failure_speaks_to_the_person_not_the_operator`. Idempotent.
-- ===================================================================================


-- -----------------------------------------------------------------------------------
-- 1. The ONE user-facing sentence for a delivery failure.
-- -----------------------------------------------------------------------------------
create or replace function communication.delivery_failure_sentence(
  p_error_code text,
  p_channel    text default null)
returns text
language sql
immutable
as $function$
  with c as (
    -- Some adapters write `code: a long explanation` into error_code (the in-app one does).
    -- Match the leading token so a sloppy code still resolves to the right sentence.
    select lower(split_part(btrim(coalesce(p_error_code, '')), ':', 1)) as code
  ), w as (
    select case lower(coalesce(p_channel, ''))
             when 'email'  then 'email'
             when 'sms'    then 'text message'
             when 'in_app' then 'in-app notice'
             else               'notice'
           end as word
  )
  select case
    when c.code = '' then null

    -- A real lane gap, honestly reported: nothing to send to, so nothing was sent.
    when c.code in ('missing_recipient_address', 'no_contact_point', 'no_address')
      then 'not sent — no address on file for this channel'
    when c.code = 'no_in_app_inbox'
      then 'not sent — this recipient has no in-app inbox'

    -- Ours, and visible as ours: the notice row itself is still readable on the task.
    when c.code in ('unknown_channel', 'unsupported_channel')
      then 'not sent — no adapter for this channel; the notice itself is readable here'

    -- The recipient's own choice, or a compliance suppression. Never retried, never a fault.
    when c.code in ('not_consented', 'opted_out', 'suppressed', 'unverified')
      then 'not sent — this recipient has not agreed to be reached this way'

    -- Waiting, not lost. These say "not yet", and a reader must not read them as failure.
    when c.code = 'quiet_hours'
      then 'waiting — outside this recipient''s contact hours'
    when c.code in ('daily_rate_limit', 'hourly_rate_limit')
      then 'waiting — this recipient has had their limit of messages for now'
    when c.code in ('sms_a2p_gate_closed', 'a2p_unverified')
      then 'waiting on text-message coverage'

    when c.code in ('notification_delivery_disabled', 'email_delivery_disabled')
      then 'not sent — delivery is switched off platform-wide'

    -- 🚨 EVERYTHING ELSE. A provider string, an env var name, an HTTP status, a SQLSTATE, an
    -- exception — none of it is a fact about the recipient and none of it is actionable by the
    -- person reading this screen. They are told the true consequence instead. This branch is
    -- built from the CHANNEL only, so it is structurally incapable of leaking the failure text.
    else 'not sent — we could not send this ' || w.word || '; nobody was notified'
  end
  from c, w;
$function$;

comment on function communication.delivery_failure_sentence(text, text) is
  'SPEC-NOTIFICATIONS — the ONE user-facing sentence for a delivery failure, derived from the '
  'stable error_code and the channel, NEVER from error_message. error_message is operator detail '
  '(env var names, provider strings, SQLSTATEs) and must not reach an end-user surface; unknown '
  'codes resolve to a generic consequence rather than being echoed. hr_c4_55 / D2.';

grant execute on function communication.delivery_failure_sentence(text, text)
  to authenticated, service_role;


-- -----------------------------------------------------------------------------------
-- 2. hr.workflow_notice — failure_reason is the sentence, not the operator's message.
--    Column list and order are unchanged (create-or-replace requires it); `error_code` and
--    `error_message` stay on the view for the operator lane.
-- -----------------------------------------------------------------------------------
create or replace view hr.workflow_notice as
  select id,
         organization_id,
         target_id as workflow_step_id,
         ((payload ->> 'instance_id'::text))::uuid as workflow_instance_id,
         id as notification_id,
         event_key,
         (payload ->> 'flow_key'::text) as flow_key,
         (payload ->> 'notice_kind'::text) as notice_kind,
         recipient_user_id,
         ((payload ->> 'employment_id'::text))::uuid as recipient_employment_id,
         channel,
         deep_link,
         status,
         attempt_count,
         sent_at,
         delivered_at,
         read_at,
         acted_at,
         outcome,
         error_code,
         error_message,
         communication.delivery_failure_sentence(error_code, channel) as failure_reason
    from communication.notification n
   where (target_kind = 'hr_workflow_step'::text);

comment on view hr.workflow_notice is
  'SPEC-NOTIFICATIONS §5.3 — HR''s read of the notification spine. There is no hr_workflow_notice '
  'token and nothing is copied. `failure_reason` is the USER-FACING sentence '
  '(communication.delivery_failure_sentence); `error_code` / `error_message` are the OPERATOR '
  'pair and must never be shipped to an HR surface (hr_c4_55 / D2).';


-- -----------------------------------------------------------------------------------
-- 3. hr.wf_instance — ship the six delivery-evidence fields, not the whole notice row.
-- -----------------------------------------------------------------------------------
create or replace function hr.wf_instance(p_instance_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'hr', 'public'
as $function$
declare inst hr.workflow_instance%rowtype; v_uid uuid := auth.uid();
begin
  select * into inst from hr.workflow_instance where id = p_instance_id;
  if not found then return jsonb_build_object('granted', false, 'reason', 'not_found'); end if;
  -- 🚨 ONE VISIBILITY RULE, ASKED — NEVER A SECOND COPY. This disjunction used to live here
  -- inline, and hr.wf_for_target had no gate at all. Restating it there would have been two
  -- implementations of one rule; this lane has already paid for that twice (hr_c4_20, hr_c4_31).
  if not hr._wf_instance_visible(p_instance_id, v_uid) then
    return hr._governance_refusal(inst.organization_id, 'hr_workflow_instance', 'no_read_reach',
      'you have no standing on this request', inst.subject_employment_id, ARRAY[p_instance_id]);
  end if;

  return jsonb_build_object(
    'granted', true,
    'instance', to_jsonb(inst),
    'steps',     coalesce((select jsonb_agg(to_jsonb(s) order by s.step_order, s.step_key)
                             from hr.workflow_step s where s.workflow_instance_id = p_instance_id), '[]'::jsonb),
    'decisions', coalesce((select jsonb_agg(to_jsonb(d) order by d.decided_at)
                             from hr.workflow_decision d where d.workflow_instance_id = p_instance_id), '[]'::jsonb),
    'events',    coalesce((select jsonb_agg(to_jsonb(e) order by e.occurred_at)
                             from hr.workflow_event e where e.workflow_instance_id = p_instance_id), '[]'::jsonb),
    'failures',  coalesce((select jsonb_agg(to_jsonb(f) order by f.occurred_at)
                             from hr.workflow_failure f where f.workflow_instance_id = p_instance_id), '[]'::jsonb),
    -- §1.7: notices come from the VIEW over the notification spine, never from an HR table.
    -- 🚨 NAMED FIELDS, NEVER THE WHOLE VIEW ROW — hr_c4_55 / D2. The view carries the operator
    -- pair (`error_code`, `error_message`: env var names, provider strings, SQLSTATEs) and a
    -- whole-row cast put both on the wire to the browser on every open. Narrowing in the client
    -- cannot unsend a payload. These are exactly the six fields the panel renders, and
    -- `failure_reason` is already the user-facing sentence.
    -- (The contract row for this function forbids the whole-row cast by name; do not restore it.)
    'notices',   coalesce((select jsonb_agg(jsonb_build_object(
                                    'channel', n.channel, 'status', n.status, 'sent_at', n.sent_at,
                                    'delivered_at', n.delivered_at, 'read_at', n.read_at,
                                    'failure_reason', n.failure_reason) order by n.sent_at nulls last)
                             from hr.workflow_notice n where n.workflow_instance_id = p_instance_id), '[]'::jsonb));
end
$function$;


-- -----------------------------------------------------------------------------------
-- 4. hr.wf_pending — "recently decided" names what was decided and about whom (D10).
-- -----------------------------------------------------------------------------------
create or replace function hr.wf_pending(
  p_employment_id uuid default null::uuid,
  p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable security definer
set search_path to 'hr', 'public'
as $function$
declare v_uid uuid := auth.uid(); v_users uuid[]; v_emp uuid[]; v_org uuid; v_show_wait boolean;
begin
  if v_uid is null then return jsonb_build_object('granted', false, 'reason', 'no_caller'); end if;

  if p_employment_id is null then
    v_emp := hr.employments_of(v_uid); v_users := ARRAY[v_uid];
  else
    select organization_id into v_org from hr.employment where id = p_employment_id;
    -- RECORDED DECISION 2: the subject of `workflow.view_queue` is the EMPLOYMENT whose queue is
    -- being read. Passing v_org here made hr.population_contains and the manager lane both false,
    -- so this branch refused every holder of the capability and the feature never worked.
    if not hr.capability(v_uid, 'workflow.view_queue', p_employment_id)
       and not (p_employment_id = any(hr.employments_of(v_uid))) then
      return hr._governance_refusal(v_org, 'hr_workflow_step', 'no_queue_authority',
        'reading another person''s approval queue needs workflow administration standing',
        p_employment_id, '{}');
    end if;
    v_emp := ARRAY[p_employment_id]; v_users := ARRAY[hr._wf_login_of(p_employment_id)];
  end if;
  v_show_wait := (hr._knob('hr.workflow','inbox_show_waiting') #>> '{}')::boolean;

  return jsonb_build_object(
    'granted', true,
    -- the hot query, served by workflow_step_approvers_idx (a partial GIN on resolved_user_ids)
    'needs_my_decision', coalesce((
      select jsonb_agg(x order by x -> 'urgent' desc, x ->> 'due_at' nulls last)
        from (select jsonb_build_object(
                'step_id', s.id, 'instance_id', i.id, 'flow_key', i.flow_key,
                'step_key', s.step_key, 'due_at', s.due_at, 'activated_at', s.activated_at,
                'priority', i.priority, 'urgent', i.priority = 'urgent',
                'resolution_path', s.resolution_path, 'autonomy_mode', s.autonomy_mode,
                'timeout_at', s.timeout_at, 'sensitivity_tier', i.sensitivity_tier,
                'deep_link', '/hr/tasks/' || i.id::text || '?step=' || s.id::text || coalesce('&notice=' || (select nt.id::text from communication.notification nt where nt.recipient_user_id = v_uid and nt.target_id = s.id and nt.channel = 'in_app' order by nt.created_at desc limit 1), '')) x
                from hr.workflow_step s join hr.workflow_instance i
                  on i.id = s.workflow_instance_id
               where s.state = 'active' and s.resolved_user_ids && v_users
                 and (p_filters ->> 'flow_key' is null or i.flow_key = p_filters ->> 'flow_key')) q),
      '[]'::jsonb),
    -- 🚨 THE COUNTDOWN LIST SAYS THE KIND IN WORDS TOO. It carried only `flow_key`, so the one
    -- section whose whole point is "this decides itself unless you act" named the thing about to
    -- happen in machine vocabulary. Same label path as every other list (hr_c4_55 / D12h).
    'auto_applying_soon', coalesce((
      select jsonb_agg(jsonb_build_object('step_id', s.id, 'instance_id', i.id,
                                          'flow_key', i.flow_key,
                                          'flow_label', coalesce(ft.label, i.flow_key),
                                          'timeout_at', s.timeout_at)
                       order by s.timeout_at nulls last)
        from hr.workflow_step s join hr.workflow_instance i on i.id = s.workflow_instance_id
        left join lateral (
          select ft2.label from hr.workflow_flow_type ft2
           where ft2.flow_key = i.flow_key and ft2.deleted_at is null
           order by (ft2.organization_id = i.organization_id) desc limit 1) ft on true
       where s.state = 'active' and s.autonomy_mode = 3 and s.timeout_at is not null
         and s.resolved_user_ids && v_users), '[]'::jsonb),
    'waiting_on_others', case when not v_show_wait then '[]'::jsonb else coalesce((
      -- 🚨 THE SUBJECT READS THE SAME WORDS THE DECIDER DOES.
      -- The decider's queue was given human labels and a change summary; this list —
      -- the person's own filed requests — kept sending only the raw flow key, so they
      -- read "leave_request" about their own leave while the approver read "Leave
      -- request · 18 Sep – 19 Sep 2026 · 8 hours". A rendering fix that lands on one
      -- side of a transaction and not the other leaves the person with less
      -- information about their own request than the stranger deciding it.
      select jsonb_agg(jsonb_build_object('instance_id', i.id, 'flow_key', i.flow_key,
                                          'flow_label', coalesce(ft.label, i.flow_key),
                                          'summary', hr._wf_row_summary(i.flow_key, i.target_token, i.target_id),
                                          'state', i.state, 'submitted_at', i.submitted_at))
        from hr.workflow_instance i
        left join lateral (
          select ft2.label from hr.workflow_flow_type ft2
           where ft2.flow_key = i.flow_key and ft2.deleted_at is null
           order by (ft2.organization_id = i.organization_id) desc limit 1) ft on true
       where i.state in ('validating','routing','active','applying','verifying')
         -- 🚨 THE PERSON'S OWN FILED REQUESTS ARE AN IDENTITY STANDING (hr_c4_39 / D284). Resolved
         -- through the date-scoped array, a pre-start hire's own inbox could not list a request
         -- they had just filed. The other arms of this function stay on hr.employments_of: an
         -- assigned failure and a recorded decision are work by somebody with CURRENT standing.
         and (i.requester_employment_id = any(hr._employments_of_identity(v_uid))
              or i.subject_employment_id = any(hr._employments_of_identity(v_uid)))),
      '[]'::jsonb) end,
    'failures_assigned_to_me', coalesce((
      select jsonb_agg(jsonb_build_object('failure_id', f.id, 'instance_id', f.workflow_instance_id,
                                          'failure_class', f.failure_class, 'state', f.state,
                                          'occurred_at', f.occurred_at,
                                          -- the request the failure is ON, so the row is not a
                                          -- bare class token (hr_c4_55 / D12h)
                                          'flow_label', coalesce(ft.label, i.flow_key),
                                          'flow_key', i.flow_key)
                       order by f.occurred_at desc)
        from hr.workflow_failure f
        join hr.workflow_instance i on i.id = f.workflow_instance_id
        left join lateral (
          select ft2.label from hr.workflow_flow_type ft2
           where ft2.flow_key = i.flow_key and ft2.deleted_at is null
           order by (ft2.organization_id = i.organization_id) desc limit 1) ft on true
       where f.state in ('open','retrying') and f.assigned_employment_id = any(v_emp)), '[]'::jsonb),
    -- 🚨 A DECISION HISTORY THAT NAMES ONLY THE VERB IS NOT A HISTORY (hr_c4_55 / D10).
    -- This returned {decision_id, instance_id, decision, decided_at} and nothing else, so a
    -- manager's own last thirty days rendered as forty identical lines of "approved" and a
    -- timestamp — no employee, no kind of request, and unordered. The display rule was one join
    -- away the whole time: `workflow_decision` carries `workflow_step_id`, which is exactly what
    -- `hr._wf_display` takes, and the decider passes its entitlement test by construction
    -- (they are in the step's `resolved_user_ids`). Asking the ONE rule is what keeps this from
    -- being a client-side join that invents disclosure.
    'recently_decided', coalesce((
      select jsonb_agg(jsonb_build_object(
               'decision_id',      d.id,
               'instance_id',      d.workflow_instance_id,
               'step_id',          d.workflow_step_id,
               'decision',         d.decision,
               'decided_at',       d.decided_at,
               'reason',           d.reason,
               'title',            coalesce(dd.disp ->> 'title', ft.label, i.flow_key),
               'flow_key',         i.flow_key,
               'flow_label',       coalesce(dd.disp ->> 'flow_label', ft.label, i.flow_key),
               'step_label',       coalesce(dd.disp ->> 'step_label', d.step_key),
               'subject_label',    dd.disp ->> 'subject_label',
               'subject_withheld', coalesce((dd.disp ->> 'subject_withheld')::boolean, false),
               'digest',           dd.disp ->> 'digest')
             order by d.decided_at desc)
        from hr.workflow_decision d
        join hr.workflow_instance i on i.id = d.workflow_instance_id
        left join lateral (select hr._wf_display(d.workflow_step_id) as disp) dd on true
        left join lateral (
          select ft2.label from hr.workflow_flow_type ft2
           where ft2.flow_key = i.flow_key and ft2.deleted_at is null
           order by (ft2.organization_id = i.organization_id) desc limit 1) ft on true
       where d.actor_employment_id = any(v_emp)
         and d.decided_at > now() - interval '30 days'), '[]'::jsonb));
end
$function$;


-- -----------------------------------------------------------------------------------
-- 5. hr.wf_bulk_decide — the sweep hit: sqlerrm was rendered to the decider.
-- -----------------------------------------------------------------------------------
create or replace function hr.wf_bulk_decide(
  p_step_ids uuid[], p_decision text, p_reason text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'hr', 'public'
as $function$
declare v_max integer; s uuid; v_out jsonb := '[]'::jsonb; v_one jsonb; v_bad text;
begin
  v_max := (hr._knob('hr.workflow','inbox_bulk_max') #>> '{}')::integer;
  if cardinality(coalesce(p_step_ids,'{}'::uuid[])) > v_max then
    return jsonb_build_object('granted', false, 'reason', 'WF_BULK_LIMIT',
      'detail', format('a bulk decision may cover at most %s steps', v_max));
  end if;

  -- §5.2: bulk is unavailable for any definition that says so, and it is refused for the WHOLE
  -- batch when any member's definition forbids it — not silently split.
  -- 🚨 NAMED IN THE WORDS THE SURFACE USES, not in flow keys (hr_c4_55 / D12h): this refusal read
  -- "these flows are decided one at a time: pay_change, termination" on a page whose every other
  -- line says "Pay change" and "Termination".
  select string_agg(distinct coalesce(ft.label, i.flow_key), ', ') into v_bad
    from hr.workflow_step s2
    join hr.workflow_instance i on i.id = s2.workflow_instance_id
    join hr.workflow_definition d on d.id = i.workflow_definition_id
    left join lateral (
      select ft2.label from hr.workflow_flow_type ft2
       where ft2.flow_key = i.flow_key and ft2.deleted_at is null
       order by (ft2.organization_id = i.organization_id) desc limit 1) ft on true
   where s2.id = any(p_step_ids) and not d.allow_bulk_decide;
  if v_bad is not null then
    return jsonb_build_object('granted', false, 'reason', 'WF_BULK_FORBIDDEN',
      'detail', format('these are decided one at a time: %s', v_bad));
  end if;

  -- §5.2: refusal is PER-STEP, never all-or-nothing. A stale digest comes back as a typed skip and
  -- the rest still go through.
  foreach s in array coalesce(p_step_ids,'{}'::uuid[]) loop
    begin
      v_one := hr.wf_decide(s, p_decision, p_reason);
    exception when others then
      -- 🚨 A POSTGRES ERROR IS NOT A SENTENCE FOR AN HR MANAGER (hr_c4_55 / D2, same class).
      -- Returning sqlerrm as the user-facing detail put raw database text — column names,
      -- constraint names, SQLSTATEs — straight into the bulk-outcome panel, which renders
      -- `detail` verbatim. The operator half goes to the server log with its SQLSTATE; the
      -- decider is told the consequence. The contract row forbids the old form by name.
      raise warning 'hr.wf_bulk_decide: step % raised %: %', s, sqlstate, sqlerrm;
      v_one := jsonb_build_object('granted', false, 'reason', 'raised',
        'detail', 'something went wrong on our side, so this one was not decided — '
               || 'it is still in your queue');
    end;
    v_out := v_out || jsonb_build_object('step_id', s,
                                         'granted', coalesce((v_one ->> 'granted')::boolean, false),
                                         'reason', v_one ->> 'reason',
                                         'detail', v_one ->> 'detail');
  end loop;

  return jsonb_build_object(
    'granted', true, 'results', v_out,
    'succeeded', (select count(*) from jsonb_array_elements(v_out) r where (r ->> 'granted')::boolean),
    'skipped',   (select count(*) from jsonb_array_elements(v_out) r where not (r ->> 'granted')::boolean));
end
$function$;


-- -----------------------------------------------------------------------------------
-- 6. Contract rows — this class comes back the moment somebody "simplifies" one of these.
-- -----------------------------------------------------------------------------------
insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason, is_active)
values
  ('hr', 'wf_instance', 'hr_c4_55',
   array['''failure_reason'', n.failure_reason'],
   array['to_jsonb(n)'],
   'hr_c4_55 / D2: the notices arm must ship the six named delivery fields. to_jsonb() of '
   || 'hr.workflow_notice carries error_code and error_message — env var names, provider strings '
   || 'and SQLSTATEs — to the browser on every task open, and narrowing in the client cannot '
   || 'unsend a payload. Operator detail stays in the database.',
   true),
  ('hr', 'wf_bulk_decide', 'hr_c4_55',
   array['raise warning ''hr.wf_bulk_decide'],
   array['''detail'', sqlerrm'],
   'hr_c4_55 / D2: the per-step exception arm must log sqlerrm to the operator lane and hand the '
   || 'decider a consequence. The bulk-outcome panel renders `detail` verbatim, so sqlerrm there '
   || 'is raw Postgres text on an HR manager''s screen.',
   true),
  ('hr', 'wf_pending', 'hr_c4_55',
   array['hr._wf_display(d.workflow_step_id)', 'order by d.decided_at desc'],
   array[]::text[],
   'hr_c4_55 / D10: recently_decided must name what was decided and about whom, through the ONE '
   || 'display rule (which owns the entitlement decision), and must be newest-first. Without it '
   || 'the section renders as N identical lines of a machine verb and a timestamp.',
   true)
on conflict do nothing;


-- -----------------------------------------------------------------------------------
-- 7. Self-proof — falsify the leak live, and re-assert the contracts on declaration.
-- -----------------------------------------------------------------------------------
do $$
declare v_def text; v_bad text; v_n integer; v_s text;
begin
  -- D2: the sentence function never echoes what it was given.
  if communication.delivery_failure_sentence('email_provider_unconfigured', 'email')
       like '%RESEND%' then
    raise exception 'hr_c4_55: the sentence function echoed the config code';
  end if;
  if communication.delivery_failure_sentence('resend_http_422', 'email')
       <> 'not sent — we could not send this email; nobody was notified' then
    raise exception 'hr_c4_55: an unmapped provider code did not resolve to the generic sentence';
  end if;
  if communication.delivery_failure_sentence('no_contact_point', 'email')
       <> 'not sent — no address on file for this channel' then
    raise exception 'hr_c4_55: the address-gap sentence changed';
  end if;
  if communication.delivery_failure_sentence(null, 'email') is not null
     or communication.delivery_failure_sentence('', 'email') is not null then
    raise exception 'hr_c4_55: a notice with no failure got a failure sentence';
  end if;

  -- D2: no live notice row can now hand an HR surface a provider or config string.
  select count(*) into v_n
    from hr.workflow_notice n
   where n.failure_reason is not null
     and (n.failure_reason like '%RESEND%' or n.failure_reason like '%EMAIL_FROM%'
          or n.failure_reason like '%`html`%' or n.failure_reason like '%Resend%'
          or n.failure_reason like '%to_address%' or n.failure_reason like '%adapter registered%');
  if v_n > 0 then
    raise exception 'hr_c4_55: % live workflow_notice rows still expose operator text', v_n;
  end if;

  -- and every failing row DOES get a sentence — silence would be its own defect
  select count(*) into v_n
    from hr.workflow_notice n
   where n.error_code is not null and n.failure_reason is null;
  if v_n > 0 then
    raise exception 'hr_c4_55: % failing notice rows resolved to no sentence at all', v_n;
  end if;

  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_instance';
  if v_def like '%to_jsonb(n)%' then
    raise exception 'hr_c4_55: wf_instance still ships the whole notice row';
  end if;

  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_bulk_decide';
  if v_def like '%''detail'', sqlerrm%' then
    raise exception 'hr_c4_55: wf_bulk_decide still returns sqlerrm as the user-facing detail';
  end if;

  -- D10: the display rule is asked, and the section is ordered.
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_pending';
  if v_def not like '%hr._wf_display(d.workflow_step_id)%' then
    raise exception 'hr_c4_55: recently_decided does not ask the display rule';
  end if;
  if v_def not like '%order by d.decided_at desc%' then
    raise exception 'hr_c4_55: recently_decided is still unordered';
  end if;

  -- every contract this file declares must hold right now
  for v_bad in
    select c.schema_name || '.' || c.function_name
      from hr.function_contract c
     where c.home_migration = 'hr_c4_55' and c.is_active
       and (
         exists (select 1 from unnest(c.must_contain) m
                  where (select pg_get_functiondef(p.oid) from pg_proc p
                           join pg_namespace n on n.oid = p.pronamespace
                          where n.nspname = c.schema_name and p.proname = c.function_name limit 1)
                        not like '%' || m || '%')
         or exists (select 1 from unnest(c.must_not_contain) m
                     where (select pg_get_functiondef(p.oid) from pg_proc p
                              join pg_namespace n on n.oid = p.pronamespace
                             where n.nspname = c.schema_name and p.proname = c.function_name limit 1)
                           like '%' || m || '%'))
  loop
    raise exception 'hr_c4_55: contract violated on declaration for %', v_bad;
  end loop;
end $$;
