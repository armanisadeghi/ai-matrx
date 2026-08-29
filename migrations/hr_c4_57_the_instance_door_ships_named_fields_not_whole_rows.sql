-- hr_c4_57 — the instance door ships NAMED FIELDS, not whole rows.
--
-- ===================================================================================
-- WHAT THIS FIXES — hr_c4_55 / D2's lesson, applied to the other five collections.
--
-- hr_c4_55 established the rule for ONE arm of `hr.wf_instance`:
--
--     "narrowing in the client cannot unsend a payload"
--
-- …and narrowed `notices` from a whole-row cast to six named delivery fields, because the
-- `hr.workflow_notice` view carried `error_code` / `error_message` — env var names, provider
-- strings, SQLSTATEs — to the browser on every task open.
--
-- The SAME function still shipped whole rows for the OTHER FIVE arms: the instance, its steps,
-- its decisions, its events and its failures. The lesson had been applied to one collection out
-- of six. This file applies it to the remaining five.
--
-- IT IS NOT HYPOTHETICAL. Two live `hr.workflow_event` rows already read:
--
--     {"detail": {"ok": false, "raised": true, "sqlstate": "42703",
--                 "detail": "column d.decider_employment_id does not exist"}}
--     {"detail": {"ok": false, "raised": true, "sqlstate": "42703",
--                 "detail": "column pp.ends_on does not exist"}}
--
-- Both hang off instances nobody is opening today, and all four live `workflow_failure` details
-- happen to be engine-authored sentences — so nothing reached a user yet. But `hr._wf_call_hook`
-- converts EVERY raising hook into `{ok, raised, sqlstate, detail: sqlerrm}`, `hr._wf_failure`
-- writes that verbatim into both `hr.workflow_failure.detail` and the `failed` event, and the
-- door then put both on an HR user's wire. The next hook failure on a live instance was raw
-- Postgres text on a browser connection. That is a fix that lands before the incident, not after.
--
-- THE WHOLE-ROW CASTS WERE CARRYING MORE THAN THE ERROR TEXT.
--   * `workflow_instance.payload` — the PROPOSAL ITSELF (the new address, the new legal name, the
--     new rate). The panel deliberately renders only the entitlement-gated `change` that
--     `hr._wf_display` builds, and puts a "Restricted — the record itself is the only place its
--     details render" banner above it. The raw payload was shipping underneath that banner
--     anyway. Same for `validation_findings` and `rule_snapshot`.
--   * `workflow_step.resolved_user_ids` / `resolved_approver_ids` — the identity of every person
--     who can decide, on the wire to anybody with read standing on the request.
--   * `workflow_decision.client_context` — whatever the deciding client recorded about itself.
--   * `workflow_decision.calculation_snapshot` / `recommendation_snapshot`, and `metadata` on all
--     five tables — engine internals, none of which any surface reads.
--
-- WHAT THE SURFACES ACTUALLY CONSUME — enumerated BEFORE narrowing, not after.
--   `public.hr_wf_instance` is read from exactly one place in the whole workspace:
--   `features/hr/tasks/service.ts::fetchHrInstance` → `envelope.ts::parseInstance` →
--   `features/hr/tasks/components/HrDecisionPanel.tsx` (which `/hr/tasks/{id}` renders, and which
--   the task table's window hosts with `embedded`). No Python caller, no other SQL caller, no
--   other component. Every key that component reads:
--
--     instance   sensitivity_tier · state · state_reason · target_token · target_id · flow_key
--                · requester_employment_id      (+ `sensitivity_tier` again in the public door)
--     steps      id · step_key · state · due_at · approvals_needed · approvals_received
--                · resolution_path              (+ `step_order`, which the public door sorts on)
--     decisions  id · decision · decided_at · reason
--     events     — NOTHING. No surface has ever read an event.
--     failures   id · failure_class · state · detail
--
--   Everything decorated ON TOP of a step — step_label, flow_label, change, digest,
--   requires_reason_on_approve, viewer_is_subject, subject_label — comes from `hr._wf_display`,
--   which `public.hr_wf_instance` merges over each step AFTER this function returns. Those are
--   unaffected: this narrows the BASE row, and the display rule keeps deciding, in the one place
--   it has always decided, what this caller may be told.
--
-- THE ONE FIELD THAT NEEDED A LANE SPLIT RATHER THAN A DELETION: `failures.detail`.
--   The panel renders it — `{str(f, "detail")}` in the "Holding this request" list. Except it
--   never has: `workflow_failure.detail` is a jsonb OBJECT on every live row, the client's `str()`
--   returns null for anything that is not a JSON string, so that line has been dead since it was
--   written. Deleting the field would have kept a dead line dead; passing the object through would
--   have been the leak itself.
--
--   So it gets the `communication.delivery_failure_sentence` treatment: `hr._wf_failure_sentence`
--   turns the failure CLASS — a closed, checked vocabulary of thirteen tokens — into a sentence
--   for the person looking at their own held request, and the door ships that as `failure_reason`.
--   Built from the class alone, it is structurally incapable of carrying a SQLSTATE, a column
--   name or a provider string, for the same reason the delivery catalogue's else-branch is.
--
--   The operator lane is unchanged and complete. `hr.workflow_failure.detail` and
--   `hr.workflow_event.detail` still hold the full hook output, sqlstate and all; anybody querying
--   those tables directly still sees everything; and `hr._wf_call_hook` now also SAYS it in the
--   Postgres log (`raise warning`) at the moment it swallows the exception, so a raising hook is
--   visible to an operator without anybody opening a table. Nothing was deleted; it was routed.
--
-- WHAT WE DELIBERATELY KEPT that could be read as operator detail:
--   * `instance.target_token` + `instance.target_id` — a table token and a bare uuid. The panel
--     renders them under a collapsed "Record reference" disclosure precisely so whoever debugs
--     this can find the row. Named, consumed, and already withheld from the sentence itself.
--   * `instance.requester_employment_id` — the panel gates the Withdraw / Cancel controls on its
--     presence. Removing it removes those two buttons from every request.
--   * `steps.id` — sent to `hr.wf_decide` / `hr.wf_escalate` as the thing being acted on.
--   * `steps.resolution_path` — rendered as "via authority". A routing word, not an identity.
--   Each of these is an id or a token the surface genuinely needs; none is free text from a hook.
--
-- ===================================================================================

begin;

-- ---------------------------------------------------------------------------------
-- 1. The failure catalogue — a held request, in words, for whoever is holding it.
--
-- Deliberately IMMUTABLE and built from the class token ONLY. That is the whole safety property:
-- there is no argument through which a hook's text, a column name or a SQLSTATE could enter, so
-- this cannot be made to leak by a future caller passing it something richer. Same shape and same
-- reasoning as `communication.delivery_failure_sentence` (hr_c4_55).
--
-- The thirteen classes are `workflow_failure_class_registered`'s whole vocabulary. An unknown one
-- resolves to the true, useful, class-free sentence rather than being guessed at or echoed.
-- ---------------------------------------------------------------------------------
create or replace function hr._wf_failure_sentence(p_class text)
returns text
language sql
immutable
as $function$
  select case p_class
    when 'unroutable'
      then 'held — this request reached nobody who could decide it'
    when 'approver_ineligible'
      then 'held — everybody it could have gone to was ruled out from deciding it'
    when 'distinct_actor_required'
      then 'held — this step needs a decider who has not already decided on it, and there is not one'
    when 'sole_actor_deadlock'
      then 'held — the only person who could decide this is the person it is about'
    when 'approver_not_entitled'
      then 'held — whoever it reached is not entitled to decide it'
    when 'unactionable_no_reach'
      then 'held — everybody this step resolved to has no way to sign in, so none of them can act on it'
    when 'validation_error'
      then 'held — this request did not pass its own checks, so nothing was changed'
    when 'conflict_at_decision'
      then 'held — the record changed while this was being decided, so the decision was not applied'
    when 'apply_failed'
      then 'held — the decision was recorded but could not be written to the record'
    when 'result_unverified'
      then 'held — what this step asked for has not been confirmed as done'
    when 'notification_undeliverable'
      then 'held — nobody could be told about this; there was no working way to reach them'
    when 'target_missing'
      then 'held — the record this request is about is no longer there'
    when 'definition_invalid'
      then 'held — this kind of request is misconfigured and cannot run'
    -- 🚨 EVERYTHING ELSE. A class this catalogue does not name is still a held request, and the
    -- reader is told the true consequence. This branch is built from NOTHING, so it is incapable
    -- of carrying whatever the new class was called, let alone what raised it.
    else 'held — somebody has been asked to sort out a problem with this request'
  end;
$function$;

comment on function hr._wf_failure_sentence(text) is
  'hr_c4_57: a workflow failure CLASS becomes a sentence for the person whose request is held. '
  'The operator detail (hook output, sqlstate, sqlerrm) stays in hr.workflow_failure.detail and '
  'hr.workflow_event.detail and never leaves the database on the HR read path.';

-- ---------------------------------------------------------------------------------
-- 2. The operator lane says so out loud.
--
-- `hr._wf_call_hook` converts a raising hook into a structured result so no caller has to guess.
-- That conversion is right and stays — but it was SILENT, so the only trace of a raising hook was
-- a jsonb blob in a table nobody watches. hr_c4_55 established the split for `hr.wf_bulk_decide`:
-- the sqlerrm goes to the Postgres log with its SQLSTATE, and the person is told what it means for
-- them. Same split here. The returned shape is byte-identical; only the log line is new.
-- ---------------------------------------------------------------------------------
create or replace function hr._wf_call_hook(p_fn regprocedure, p_arg uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'hr', 'public'
as $function$
declare v_out jsonb;
begin
  if p_fn is null then return null; end if;
  execute format('select %s($1)', p_fn::regproc::text) into v_out using p_arg;
  return v_out;
exception when others then
  -- §1.8: `validate_fn` RAISED rather than returning findings is its own failure class. Every hook
  -- that raises is converted here into a structured result so no caller has to guess.
  --
  -- 🚨 AND IT IS SAID IN THE OPERATOR LANE, LOUDLY (hr_c4_57). This text is Postgres's, about our
  -- schema — a column that does not exist, a type that does not cast. It belongs in the log and in
  -- the failure ledger, and NOWHERE on a browser connection. `hr.wf_instance` ships a sentence
  -- built from the failure class instead; see `hr._wf_failure_sentence`.
  raise warning 'hr._wf_call_hook: % raised [%] %', p_fn::regproc::text, sqlstate, sqlerrm;
  return jsonb_build_object('ok', false, 'raised', true, 'sqlstate', sqlstate, 'detail', sqlerrm);
end $function$;

-- ---------------------------------------------------------------------------------
-- 3. The door itself — six named projections where five whole-row casts were.
-- ---------------------------------------------------------------------------------
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
                                    'failure_reason', n.failure_reason) order by n.sent_at nulls last)
                             from hr.workflow_notice n where n.workflow_instance_id = p_instance_id), '[]'::jsonb));
end
$function$;

-- ---------------------------------------------------------------------------------
-- 4. The contract rows — so a re-emit cannot restore the whole-row casts.
--
-- hr_c4_55 pinned the notices arm by name and that is why it is still narrow today. The other five
-- arms had no such row, which is exactly how they survived the same session that fixed notices.
-- ---------------------------------------------------------------------------------
insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, must_be_definer, reason)
values
  ('hr', 'wf_instance', 'hr_c4_57',
   array[
     '''sensitivity_tier'', inst.sensitivity_tier',
     '''step_order'', s.step_order',
     '''decision'', d.decision',
     '''event_kind'', e.event_kind',
     '''failure_reason'', hr._wf_failure_sentence(f.failure_class)'
   ],
   array['to_jsonb(inst)', 'to_jsonb(s)', 'to_jsonb(d)', 'to_jsonb(e)', 'to_jsonb(f)'],
   true,
   'hr_c4_57: every arm of the instance door is a NAMED projection. hr_c4_55 fixed `notices` and '
   'left the other five as whole-row casts, so the door still shipped workflow_event.detail '
   '(hr._wf_call_hook''s {raised, sqlstate, detail: sqlerrm} — two live rows already carry '
   '"column d.decider_employment_id does not exist" / 42703), workflow_failure.detail, '
   'workflow_instance.payload (the proposal the restricted banner says is not shown here), '
   'workflow_step.resolved_user_ids and workflow_decision.client_context. Narrowing in the client '
   'cannot unsend a payload. Operator detail stays in the ledger and the Postgres log; the reader '
   'gets hr._wf_failure_sentence.'),
  ('hr', '_wf_failure_sentence', 'hr_c4_57',
   array['else ''held — somebody has been asked to sort out a problem with this request'''],
   array['p_detail', 'sqlerrm', 'sqlstate'],
   false,
   'hr_c4_57: this catalogue takes the failure CLASS and nothing else, which is its entire safety '
   'property — there is no argument through which a hook''s text could enter, and an unnamed class '
   'falls through to a sentence built from nothing at all. Giving it the detail payload to "make '
   'the message better" re-creates hr_c4_55''s defect one layer down.'),
  ('hr', '_wf_call_hook', 'hr_c4_57',
   array['raise warning', 'sqlstate'],
   array[]::text[],
   true,
   'hr_c4_57: a hook that RAISES must be audible to an operator at the moment it is swallowed. The '
   'conversion to {ok:false, raised, sqlstate, detail} is right and stays — but it was silent, so '
   'the only trace was a jsonb blob in a table nobody watches, and the same text was travelling to '
   'a browser through hr.wf_instance. Log lane loud, wire lane worded.')
on conflict do nothing;

commit;

-- ===================================================================================
-- FALSIFICATION — every claim above, asked of the live database.
-- ===================================================================================
do $$
declare
  v_def text; v_bad text; v_n int; v_payload jsonb; v_probed int := 0;
  v_row record;
  -- The keys that must never appear ANYWHERE in what this door returns. Matched as JSON KEYS
  -- (`"key":`), so a decider's own prose cannot produce a false alarm.
  v_forbidden text := '"(sqlstate|sqlerrm|error_message|error_code|payload|client_context'
                   || '|resolved_user_ids|resolved_approver_ids|validation_findings|rule_snapshot'
                   || '|calculation_snapshot|recommendation_snapshot|resolution_evidence'
                   || '|result_evidence|metadata|idempotency_key|target_digest)"\s*:';
begin
  -- (a) no whole-row cast survives in the door, for ANY of the six arms.
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_instance';
  foreach v_bad in array array['to_jsonb(inst)', 'to_jsonb(s)', 'to_jsonb(d)',
                               'to_jsonb(e)', 'to_jsonb(f)', 'to_jsonb(n)'] loop
    if v_def like '%' || v_bad || '%' then
      raise exception 'hr_c4_57: wf_instance still ships a whole row — %', v_bad;
    end if;
  end loop;

  -- (b) the catalogue answers every registered failure class with a real sentence, and none of
  --     those sentences can carry operator text (they are literals in an immutable function).
  select count(*) into v_n
    from unnest(array['unroutable','approver_ineligible','validation_error','conflict_at_decision',
                      'apply_failed','result_unverified','notification_undeliverable','target_missing',
                      'definition_invalid','unactionable_no_reach','sole_actor_deadlock',
                      'distinct_actor_required','approver_not_entitled']) c
   where hr._wf_failure_sentence(c) is null
      or hr._wf_failure_sentence(c) = hr._wf_failure_sentence('__no_such_class__');
  if v_n > 0 then
    raise exception 'hr_c4_57: % registered failure classes have no sentence of their own', v_n;
  end if;

  -- (c) THE PAYLOAD ITSELF. Walk every live instance as somebody who can see it and scan every
  --     key, at every depth, for the forbidden ones. This is the claim that matters: not "the
  --     source looks right" but "the bytes that leave contain none of these".
  for v_row in
    select i.id,
           (select l.user_id from hr.workflow_step st
              join lateral unnest(st.resolved_user_ids) l(user_id) on true
             where st.workflow_instance_id = i.id limit 1) as viewer
      from hr.workflow_instance i
     where i.deleted_at is null
     order by i.created_at desc
     limit 60
  loop
    continue when v_row.viewer is null;
    perform set_config('request.jwt.claims', json_build_object('sub', v_row.viewer)::text, true);
    -- Ask the shared predicate FIRST, so a probe never manufactures a refusal audit row.
    continue when not hr._wf_instance_visible(v_row.id, v_row.viewer);
    v_payload := hr.wf_instance(v_row.id);
    v_probed := v_probed + 1;
    if v_payload::text ~ v_forbidden then
      raise exception 'hr_c4_57: instance % still ships an operator key: %',
        v_row.id, (regexp_match(v_payload::text, v_forbidden))[1];
    end if;
  end loop;
  perform set_config('request.jwt.claims', '', true);
  if v_probed = 0 then
    raise exception 'hr_c4_57: the payload scan probed ZERO instances — it proved nothing';
  end if;
  raise notice 'hr_c4_57: % live instance payloads scanned, no operator key on any of them', v_probed;

  -- (d) every contract this file declares holds right now.
  for v_bad in
    select c.schema_name || '.' || c.function_name
      from hr.function_contract c
     where c.home_migration = 'hr_c4_57' and c.is_active
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
    raise exception 'hr_c4_57: contract violated on declaration for %', v_bad;
  end loop;

  raise notice 'hr_c4_57: CONFORMANT — six named projections, no whole-row cast, no operator key on the wire';
end $$;
