-- hr_l3_115 — THE INBOX SHOWS THE SENTENCE IT NOW HAS.
--
-- GAP 4 of the four 0556 reported. 0556 gave the eleven `hr.workflow.*` notices real words and
-- proved them arriving: an email subject reading "Leave request for Tomo Iversen-G32 was rejected."
-- and an `in_app` notice carrying the same sentence. `/hr/tasks` shows a row of delivery CHIPS for
-- each notice — "Email sent", "In-app delivered" — and has never shown the sentence itself, so the
-- one surface where the in-app notice is actually READ displays everything about the notice except
-- what it says.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- WHY IT WAS INVISIBLE: THE COLUMN NEVER LEFT THE DATABASE.
--
-- `HrInboxNotice` (matrx-frontend/features/hr/tasks/types.ts) has no `body` field, but that is the
-- last link in the chain, not the first. Measured here: `hr.workflow_notice`, the VIEW over
-- `communication.notification` that both doors read, does not select `body` or `subject` AT ALL.
-- Adding a field to the client type would have shown nothing, because the door has nothing to ship
-- and the view has nothing to give it. Three layers, one field, all three below the browser.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- THE NARROWING DISCIPLINE IS EXTENDED, NOT REVERSED.
--
-- hr_c4_55 narrowed the notices arm from `to_jsonb(n)` to six NAMED fields, because the whole-row
-- cast carried `error_code` and `error_message` — env var names, provider strings and SQLSTATEs —
-- to the browser on every task open. hr_c4_57 then did the same for the door's other five arms.
-- That ruling is not weakened here: `body` is added BY NAME, `to_jsonb(n)` stays forbidden, and the
-- pin that forbids it is AMENDED with the reason for the seventh field rather than silenced.
--
-- `body` is the right kind of field to add. It is the sentence a person was sent — the opposite of
-- operator detail — and it is already the text of the email and the in-app notice that person
-- received.
--
-- 🚨 BUT THE TWO DOORS ARE NOT THE SAME DOOR, AND THIS IS THE PART THAT COULD HAVE LEAKED.
--
--   hr.wf_inbox    filters notices by `n.recipient_user_id = v_uid` — the viewer's OWN notices.
--   hr.wf_instance filters by `n.workflow_instance_id` — EVERY notice about the request, on
--                  purpose, so a person looking at a request can see who was told and whether it
--                  reached them.
--
-- For the chips that is right and stays. For the body it is not, because since 0556 the body is
-- rendered PER RECIPIENT: `hr._wf_notify` reads the subject's name through
-- `hr._subject_display_name` with THE RECIPIENT as the viewer, precisely so a directory opt-out is
-- honoured per reader. A body written for recipient A can therefore name an employee that viewer B
-- is not permitted to see, and shipping it on the instance door would launder that name past the
-- opt-out 0556 went out of its way to respect. So on that door the body is returned only to the
-- person it was written for, and is NULL to everyone else. Other people's chips stay visible;
-- other people's words do not.
--
-- NULL is a real answer on both doors and the client must render it as "no sentence", never as an
-- error: a `render_pending` row's words are still being written, a `skipped` row was never sendable,
-- and every row written before 0556 genuinely never had a body. 0556 deliberately left those 202
-- historical rows empty rather than invent content nobody ever saw.

begin;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1. THE VIEW CARRIES THE WORDS.
--
-- Re-emitted with `body` added and every existing column in its existing position, so the doors and
-- `hr.workflow_notice`'s other readers are unaffected. `subject` is deliberately NOT added: the
-- email subject and the in-app body are the same sentence on all twelve of these events, and a
-- second field with no reader is a field that goes stale.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace view hr.workflow_notice as
 SELECT id,
    organization_id,
    target_id AS workflow_step_id,
    (payload ->> 'instance_id'::text)::uuid AS workflow_instance_id,
    id AS notification_id,
    event_key,
    payload ->> 'flow_key'::text AS flow_key,
    payload ->> 'notice_kind'::text AS notice_kind,
    recipient_user_id,
    (payload ->> 'employment_id'::text)::uuid AS recipient_employment_id,
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
    communication.delivery_failure_sentence(error_code, channel) AS failure_reason,
    -- APPENDED, not inserted: `create or replace view` may only add columns at the END, so the
    -- twenty-two existing columns keep their exact positions and every other reader is unaffected.
    body
   FROM communication.notification n
  WHERE target_kind = 'hr_workflow_step'::text;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2. THE QUEUE DOOR SHIPS THE SENTENCE. Re-emitted whole from the live body: this function carries
--    five contract pins (hr_c4_35, hr_c4_48, hr_l1_61, hr_l1_62, hr_l3_111) whose text must survive.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION hr.wf_inbox(p_scope text DEFAULT 'mine'::text, p_employment_id uuid DEFAULT NULL::uuid, p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare
  v_uid uuid := auth.uid(); v_emp uuid[];
  v_base jsonb; v_rows jsonb := '[]'::jsonb; r jsonb; v_extra jsonb := '[]'::jsonb;
begin
  if v_uid is null then return jsonb_build_object('granted', false, 'reason', 'no_caller'); end if;
  if p_scope not in ('mine','team','queue') then
    return jsonb_build_object('granted', false, 'reason', 'bad_scope',
      'detail', 'scope is one of mine | team | queue (SPEC-UI-IA §5.9)');
  end if;

  -- RECORDED DECISION 3: the queue of record answers "what is waiting on me", always.
  v_base := hr.wf_pending(p_employment_id, p_filters);
  if not coalesce((v_base ->> 'granted')::boolean, false) then return v_base; end if;

  v_emp := coalesce(case when p_employment_id is null then hr.employments_of(v_uid)
                         else ARRAY[p_employment_id] end, '{}'::uuid[]);

  -- decorate every actionable row with the ONE display rule and the notice evidence
  for r in select value from jsonb_array_elements(v_base -> 'needs_my_decision') loop
    v_rows := v_rows || (r || coalesce(hr._wf_display((r ->> 'step_id')::uuid), '{}'::jsonb)
      -- SPEC-UI-IA §5.9: "each row shows delivery and read state where a notification was sent",
      -- and the notice IS the evidence record — never a copy of it (SPEC-NOTIFICATIONS §5.3).
      || jsonb_build_object('notices', coalesce((
           select jsonb_agg(jsonb_build_object(
                    'channel', n.channel, 'status', n.status, 'sent_at', n.sent_at,
                    'delivered_at', n.delivered_at, 'read_at', n.read_at,
                    'failure_reason', n.failure_reason,
                    -- hr_l3_115: the SENTENCE the reader was actually sent. Every row this
                    -- selects is already `n.recipient_user_id = v_uid` — the viewer's OWN
                    -- notice — so there is nothing here to withhold. NULL is a real answer
                    -- (a render_pending row whose words are still being written, a skipped
                    -- row that was never sendable, or a pre-0556 row that never had any).
                    'body', n.body) order by n.sent_at nulls last)
             from hr.workflow_notice n
            where n.workflow_step_id = (r ->> 'step_id')::uuid
              and n.recipient_user_id = v_uid), '[]'::jsonb)));
  end loop;

  -- the two extra scopes. §5.9: scopes are shown only where the persona has them, and a scope the
  -- caller may not use REFUSES rather than returning an empty list that reads as "nothing waiting".
  if p_scope = 'queue' then
    -- 🚨 THIS CHECK IS AN AFFORDANCE GATE AND IS ORG-LESS ON PURPOSE: it answers "is the
    -- HR queue scope offered to this person at all", which is a property of the person
    -- rather than of one employer, and §5.9 requires a scope the caller may not use to
    -- REFUSE rather than return an empty list that reads as "nothing waiting". It is NOT
    -- what bounds the items — see the two organization predicates on the item query below.
    if not hr.capability(v_uid, 'workflow.view_queue', null) then
      return jsonb_build_object('granted', false, 'reason', 'no_queue_authority',
        'detail', 'the HR queue scope needs workflow administration standing');
    end if;
    v_extra := coalesce((
      select jsonb_agg(jsonb_build_object(
               'step_id', s.id, 'instance_id', i.id, 'flow_key', i.flow_key,
               'step_key', s.step_key, 'due_at', s.due_at, 'activated_at', s.activated_at,
               'priority', i.priority, 'urgent', i.priority = 'urgent',
               'sensitivity_tier', i.sensitivity_tier,
               'deep_link', '/hr/tasks/' || i.id::text || '?org=' || i.organization_id::text || '&step=' || s.id::text || coalesce('&notice=' || (select nt.id::text from communication.notification nt where nt.recipient_user_id = v_uid and nt.target_id = s.id and nt.channel = 'in_app' order by nt.created_at desc limit 1), ''))
             || coalesce(hr._wf_display(s.id), '{}'::jsonb)
             order by (i.priority = 'urgent') desc, s.due_at nulls last)
        from hr.workflow_step s join hr.workflow_instance i on i.id = s.workflow_instance_id
       where s.state = 'active'
         -- 🚨 THE ITEMS BIND TO WHERE THE GRANT IS, NOT ONLY TO WHERE THE CALLER WORKS.
         -- The employment predicate alone was one short: somebody employed by two
         -- employers who holds workflow.view_queue in only ONE of them would read the
         -- other employer's queue. No live user has that shape today, which is what
         -- makes this latent rather than a leak — and what makes it cheap to close now.
         -- BOTH predicates are kept: the conjunct can only ever REMOVE a row.
         --
         -- 🚨 AND SCOPE MEANS SCOPE WHEREVER THE POPULATION IS EVALUABLE (hr_l1_62). The
         -- gate above answers "may this person open a queue at all" and is org-less on
         -- purpose; it never followed that the CONTENTS are org-wide. A department-scoped
         -- admin was reading items about every person in the employer. Passing the item's
         -- own subject asks THE SAME PREDICATE the subject doors ask — never a second copy
         -- of the population rule, which would drift on the first change — and hr_l1_61's
         -- v_pop_at carries through it, so a prehire's and a leaver's items resolve to
         -- their intended / last-held department instead of vanishing.
         --
         -- An instance with NO subject has no population to evaluate, so it stays on the
         -- affordance rung and remains visible. That is the OPPOSITE of the subject doors'
         -- fail-closed rule, and deliberately: a read with an unestablished population
         -- risks disclosure, but a WORK ITEM nobody can see is stranded work — this is
         -- exactly the unactionable_no_reach failure, and it is not rebuilt here.
         and i.organization_id in (select organization_id from hr.employment where id = any(v_emp))
         and hr.capability(v_uid, 'workflow.view_queue', i.subject_employment_id,
                           current_date, i.organization_id)
         and not (s.resolved_user_ids && ARRAY[v_uid])
         and (p_filters ->> 'flow_key' is null or i.flow_key = p_filters ->> 'flow_key')), '[]'::jsonb);
  elsif p_scope = 'team' then
    -- RECORDED DECISION 4: a manager scope resolved in the browser is not a scope.
    v_extra := coalesce((
      select jsonb_agg(jsonb_build_object(
               'step_id', s.id, 'instance_id', i.id, 'flow_key', i.flow_key,
               'step_key', s.step_key, 'due_at', s.due_at, 'activated_at', s.activated_at,
               'priority', i.priority, 'urgent', i.priority = 'urgent',
               'sensitivity_tier', i.sensitivity_tier,
               'deep_link', '/hr/tasks/' || i.id::text || '?org=' || i.organization_id::text || '&step=' || s.id::text || coalesce('&notice=' || (select nt.id::text from communication.notification nt where nt.recipient_user_id = v_uid and nt.target_id = s.id and nt.channel = 'in_app' order by nt.created_at desc limit 1), ''))
             || coalesce(hr._wf_display(s.id), '{}'::jsonb)
             order by (i.priority = 'urgent') desc, s.due_at nulls last)
        from hr.workflow_step s join hr.workflow_instance i on i.id = s.workflow_instance_id
       where s.state = 'active'
         and not (s.resolved_user_ids && ARRAY[v_uid])
         and i.subject_employment_id is not null
         and exists (select 1 from hr.manager_chain(i.subject_employment_id) mc
                      where mc.manager_employment_id = any(v_emp))), '[]'::jsonb);
  end if;

  return v_base
    || jsonb_build_object(
         'scope', p_scope,
         'needs_my_decision', v_rows,
         'scope_rows', v_extra,
         'bulk_max', (hr._knob('hr.workflow','inbox_bulk_max') #>> '{}')::integer,
         'default_sort', hr._knob('hr.workflow','inbox_default_sort') #>> '{}',
         'can_view_queue', hr.capability(v_uid, 'workflow.view_queue', null),
         'employment_ids', to_jsonb(v_emp),
         'as_of', now());
end $function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3. THE INSTANCE DOOR SHIPS IT ONLY TO THE PERSON IT WAS WRITTEN FOR. Re-emitted whole from the
--    live body (pins hr_c4_36, hr_c4_55, hr_c4_57).
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION hr.wf_instance(p_instance_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
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

  -- 🚨 EVERY ARM BELOW IS A NAMED PROJECTION. NEVER A WHOLE-ROW CAST — hr_c4_55 / hr_c4_57.
  -- The rule is one sentence: NARROWING IN THE CLIENT CANNOT UNSEND A PAYLOAD. A field that is
  -- not consumed by the decision panel and not required by this door's own contract does not
  -- travel; a field carrying operator detail travels as a sentence or not at all. The contract
  -- rows on this function name every cast that is forbidden here — do not restore one.
  return jsonb_build_object(
    'granted', true,
    -- The instance: what it is, where it has got to, and how to find the record. NOT `payload`,
    -- `validation_findings` or `rule_snapshot` — the proposal renders through hr._wf_display's
    -- entitlement-gated `change`, which is the one place allowed to decide who may be told.
    'instance', jsonb_build_object(
                  'id', inst.id,
                  'flow_key', inst.flow_key,
                  'state', inst.state,
                  'state_reason', inst.state_reason,
                  'sensitivity_tier', inst.sensitivity_tier,
                  'target_token', inst.target_token,
                  'target_id', inst.target_id,
                  'requester_employment_id', inst.requester_employment_id),
    -- Steps: the chain, and the handle on the one being decided. `step_order` is here because the
    -- public door sorts on it. NOT `resolved_user_ids` / `resolved_approver_ids` (who can decide
    -- is not the deciding surface's business), `resolution_evidence`, `recommendation` or
    -- `result_evidence`. The label, the diff and the reason rule arrive via hr._wf_display.
    'steps',     coalesce((select jsonb_agg(jsonb_build_object(
                                    'id', s.id, 'step_key', s.step_key, 'step_order', s.step_order,
                                    'state', s.state, 'due_at', s.due_at,
                                    'approvals_needed', s.approvals_needed,
                                    'approvals_received', s.approvals_received,
                                    'resolution_path', s.resolution_path)
                                  order by s.step_order, s.step_key)
                             from hr.workflow_step s where s.workflow_instance_id = p_instance_id), '[]'::jsonb),
    -- Decisions: the verb, when, and the decider's own words. NOT `client_context`,
    -- `calculation_snapshot`, `recommendation_snapshot`, `target_digest` or the actor ids.
    'decisions', coalesce((select jsonb_agg(jsonb_build_object(
                                    'id', d.id, 'decision', d.decision,
                                    'decided_at', d.decided_at, 'reason', d.reason)
                                  order by d.decided_at)
                             from hr.workflow_decision d where d.workflow_instance_id = p_instance_id), '[]'::jsonb),
    -- Events: the state trail, and NOTHING ELSE. `detail` is the operator payload — it is where
    -- hr._wf_call_hook's `{raised, sqlstate, detail: sqlerrm}` lands, and two live rows already
    -- carry `column d.decider_employment_id does not exist` / `42703`. No surface has ever read an
    -- event; the arm stays so the envelope's contract check keeps passing, narrowed to the shape
    -- a history could honestly be drawn from.
    'events',    coalesce((select jsonb_agg(jsonb_build_object(
                                    'id', e.id, 'event_kind', e.event_kind,
                                    'from_state', e.from_state, 'to_state', e.to_state,
                                    'occurred_at', e.occurred_at)
                                  order by e.occurred_at)
                             from hr.workflow_event e where e.workflow_instance_id = p_instance_id), '[]'::jsonb),
    -- Failures: the handle, the state, and WHAT IT MEANS FOR THE READER. `failure_reason` is
    -- hr._wf_failure_sentence of the CLASS — never the stored `detail`, which is the hook's own
    -- output and stays in the ledger for the operator.
    'failures',  coalesce((select jsonb_agg(jsonb_build_object(
                                    'id', f.id, 'failure_class', f.failure_class,
                                    'state', f.state, 'occurred_at', f.occurred_at,
                                    'failure_reason', hr._wf_failure_sentence(f.failure_class))
                                  order by f.occurred_at)
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
                                    'failure_reason', n.failure_reason,
                                    -- 🚨 hr_l3_115: THE SENTENCE, BUT ONLY TO THE PERSON IT WAS
                                    -- WRITTEN FOR. Unlike hr.wf_inbox, this arm is filtered by
                                    -- INSTANCE, not by recipient — it deliberately shows a viewer
                                    -- every notice sent about this request, including notices
                                    -- addressed to other people. The delivery CHIPS are safe that
                                    -- way; the body is not. Since 0556 the body is rendered PER
                                    -- RECIPIENT through hr._subject_display_name with that
                                    -- recipient as the viewer, so it can name an employee whose
                                    -- directory entry THIS viewer is not allowed to see. Shipping
                                    -- it unfiltered would launder a name past the very opt-out
                                    -- 0556 was careful to honour. Other people's chips stay; other
                                    -- people's words do not.
                                    'body', case when n.recipient_user_id = v_uid
                                                 then n.body end)
                                  order by n.sent_at nulls last)
                             from hr.workflow_notice n where n.workflow_instance_id = p_instance_id), '[]'::jsonb));
end
$function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 4. THE hr_c4_55 PIN IS AMENDED, NOT SILENCED.
--
-- Its `must_not_contain = {to_jsonb(n)}` is the ruling and is UNTOUCHED. Its `reason` said the arm
-- "must ship the six named delivery fields", which is now false by one — and a pin whose stated
-- reason has quietly stopped describing the code is how the next agent talks themselves into
-- widening it. The count is corrected and the seventh field is justified in the same sentence.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
update hr.function_contract
   set must_contain = array['''failure_reason'', n.failure_reason', '''body'', case when n.recipient_user_id = v_uid'],
       reason = reason
         || ' | AMENDED hr_l3_115: the arm now ships SEVEN named fields, not six — `body`, the '
         || 'sentence the recipient was actually sent, was added because /hr/tasks displayed every '
         || 'fact about a notice except what it said. The ruling is unchanged and the whole-row '
         || 'cast stays banned: `body` is named, and it is the OPPOSITE of the operator detail '
         || 'to_jsonb(n) leaked. It is additionally gated to the recipient on THIS door, which '
         || 'hr.wf_inbox does not need because it already filters by recipient: this arm is '
         || 'filtered by instance and deliberately shows notices addressed to other people, and '
         || 'since 0556 a body is rendered per recipient through hr._subject_display_name — so an '
         || 'ungated body could name an employee this viewer may not see. The gate is part of the '
         || 'contract, which is why it is pinned alongside the field.'
 where schema_name = 'hr' and function_name = 'wf_instance' and home_migration = 'hr_c4_55';

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason, is_active)
values
  ('hr', 'wf_inbox', 'hr_l3_115',
   array['''body'', n.body', 'n.recipient_user_id = v_uid'],
   array['to_jsonb(n)'],
   'hr_l3_115: the queue''s notices arm ships the notice BODY — the sentence the reader was sent — '
   || 'so /hr/tasks shows what a notice said and not only that it was delivered. The recipient '
   || 'filter is pinned in the same row because it is what makes the body safe to ship here at all: '
   || 'every notice this arm selects belongs to the viewer. Widening the filter without gating the '
   || 'body would hand one person the words written for another, which on this lane means a name '
   || 'rendered under somebody else''s directory permissions.',
   true)
on conflict (schema_name, function_name, home_migration) do update
   set must_contain     = excluded.must_contain,
       must_not_contain = excluded.must_not_contain,
       reason           = excluded.reason,
       is_active        = true;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 5. FALSIFICATION.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
do $post$
declare v_broken integer; v_n integer;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema='hr' and table_name='workflow_notice' and column_name='body') then
    raise exception 'hr_l3_115: hr.workflow_notice still does not expose body';
  end if;

  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='hr' and p.proname in ('wf_inbox','wf_instance')
     and p.prosrc like '%to_jsonb(n)%';
  if v_n > 0 then
    raise exception 'hr_l3_115: the whole-row cast to_jsonb(n) came back in % door(s)', v_n;
  end if;

  -- the instance door must carry the recipient gate on the body, or it ships other people's words
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='hr' and p.proname='wf_instance')
     not like '%''body'', case when n.recipient_user_id = v_uid%' then
    raise exception 'hr_l3_115: hr.wf_instance ships body WITHOUT the recipient gate';
  end if;

  select count(*) into v_broken from hr.function_contracts_broken();
  if v_broken > 0 then
    raise exception 'hr_l3_115: % contract(s) broken', v_broken;
  end if;
  raise notice 'hr_l3_115: view exposes body, both doors named-only, instance door gated, % broken',
    v_broken;
end
$post$;

commit;
