-- HR domain C4 — migration 24 (register item HRB-008 follow-up, lane workflow-engine).
--
-- 🚨 EVERY LEAVE REQUEST SELF-INVALIDATED AT ITS FIRST DECISION, WITH `WF_TARGET_CHANGED`.
--
-- Measured: the manager approves a leave request that nobody has touched, and the engine refuses —
-- *"the target changed materially; prior approvals were reset and the request re-routed"*. Nothing
-- had changed it. The engine had.
--
-- THE ORDERING, which is this lane's:
--   1. `hr.wf_request` computes `v_digest := hr._wf_call_digest(...)` and stamps it on the instance.
--   2. `hr.wf_submit` THEN runs `validate_fn` (§4.4: "runs ONCE, at submit").
--   3. `hr.leave_wf_validate` computes the leave span and **writes it back to the target**
--      (`update hr.leave_request … day_parts/requested_hours`) — legitimate intake enrichment, and
--      `hr.leave_wf_digest` covers exactly those fields, narrowly and correctly.
--   4. At decide time the digest is recomputed, differs, and §3.4 fires.
--
-- Neither hook is wrong. **The digest was taken at the wrong moment.** §1.5 defines
-- `target_digest` as *"what the decider actually saw (§3.4)"*, and no decider ever saw the
-- pre-validation row — it existed for the few milliseconds between the instance insert and the
-- validate hook. §3.4 exists to catch somebody EDITING the target after submission; the engine's
-- own intake enriching it is not that, and treating it as that makes the whole flow undeliverable.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. THE DIGEST IS RE-STAMPED AFTER A CLEAN VALIDATION, BEFORE ROUTING — the first moment the row
--    is what a decider will be shown. `target_version` moves with it, for the same reason and to
--    the same instant, so the two never disagree about which revision was pinned.
--
-- 2. ONLY ON THE CLEAN PATH. A validation that RAISED, or that returned hard findings, closes the
--    instance without routing; there is no decider, so there is nothing to re-pin and the original
--    digest stays as the record of what was refused.
--
-- 3. THE RE-STAMP IS AN EVENT, NOT A SILENT WRITE. `target_changed` already means "somebody edited
--    the target"; using it here would be a lie. `target_pinned` is emitted with both digests, so
--    the history shows plainly that the engine re-pinned at intake and what it moved from — and a
--    later genuine `target_changed` can still be told apart from it.
--
-- 4. §3.4 IS NOT WEAKENED, AND THE PROOF PINS BOTH SIDES: a request nobody touches now approves
--    cleanly, and a request whose dates are edited between submit and decide is still refused
--    `WF_TARGET_CHANGED` with policy `restart`. That second assertion has been green since HRB-008
--    shipped and stays green.
--
-- Authority: SPEC-WORKFLOW-ENGINE §1.5 (`target_digest` is what the decider actually saw), §3.4
-- (the versioned target reference), §4.4 (validate_fn runs once, at submit).
-- Applied live as `hr_c4_24_the_digest_is_what_the_decider_will_see`. Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '120s';

do $$
declare v_bad integer;
begin
  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  perform set_config('matrx.hr_c4_24_conf_before', v_bad::text, true);
end $$;

do $mig$
declare
  v_oid oid; v_def text;
  v_old constant text := $o$  perform hr._wf_event(p_instance_id, null, 'validated', 'validating', 'routing');
  update hr.workflow_instance set state = 'routing' where id = p_instance_id;$o$;
  v_rep constant text := $o$  perform hr._wf_event(p_instance_id, null, 'validated', 'validating', 'routing');

  -- 🚨 RE-PIN THE TARGET NOW: this is the first moment the row is what a DECIDER will be shown.
  -- hr.wf_request stamps the digest before validate_fn runs, and §4.4 hooks legitimately ENRICH
  -- the target at intake (hr.leave_wf_validate writes back the computed span), so the digest taken
  -- at request time described a row that existed for milliseconds and that nobody ever saw. Left
  -- alone, every such request refused its own first decision with WF_TARGET_CHANGED — §3.4 firing
  -- on the engine's own intake instead of on somebody editing the request.
  -- Only on the clean path: a raise or hard findings closed the instance above, and an unrouted
  -- request has no decider to pin anything for.
  declare
    v_old_digest text; v_new_digest text; v_new_version integer;
  begin
    select i.target_digest into v_old_digest from hr.workflow_instance i where i.id = p_instance_id;
    v_new_digest := hr._wf_call_digest(inst.flow_key, inst.organization_id,
                                       inst.target_token, inst.target_id);
    execute format('select version from %I.%I where id = $1',
                   split_part(hr._wf_target_table(inst.target_token), '.', 1),
                   split_part(hr._wf_target_table(inst.target_token), '.', 2))
       into v_new_version using inst.target_id;
    if v_new_digest is distinct from v_old_digest then
      update hr.workflow_instance
         set target_digest = v_new_digest, target_version = coalesce(v_new_version, target_version)
       where id = p_instance_id;
      -- NOT `target_changed`: that means somebody edited the request, and saying so here would be
      -- a lie the history could never be untangled from. This is the engine pinning at intake.
      perform hr._wf_event(p_instance_id, null, 'target_pinned', 'validating', 'routing',
                           'automation', null, null,
                           jsonb_build_object(
                             'from_digest', v_old_digest, 'to_digest', v_new_digest,
                             'target_version', v_new_version,
                             'why', 'validate_fn enriched the target at intake; the digest is re-pinned to what the decider will actually see (§1.5). This is NOT a target_changed event.'));
    end if;
  end;

  update hr.workflow_instance set state = 'routing' where id = p_instance_id;$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_submit';
  if v_oid is null then raise exception 'hr_c4_24: hr.wf_submit does not exist'; end if;
  v_def := pg_get_functiondef(v_oid);
  if position($chk$target_pinned$chk$ in v_def) > 0 then
    raise notice 'hr_c4_24: hr.wf_submit already re-pins the digest after validation';
  else
    if position(v_old in v_def) = 0 then
      raise exception 'hr_c4_24: hr.wf_submit does not carry the expected validated/routing pair — refusing to half-apply';
    end if;
    execute replace(v_def, v_old, v_rep);
    raise notice 'hr_c4_24: hr.wf_submit re-pins the target digest to what the decider will see';
  end if;
end
$mig$;

-- ============================================================ post-conditions
do $$
declare v_src text; v_bad integer; v_before integer;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_submit';
  if v_src !~ 'target_pinned' then
    raise exception 'hr_c4_24: hr.wf_submit does not re-pin the digest';
  end if;
  -- RD 3: it must NEVER call the re-pin a target_changed
  if v_src ~ '''target_changed''' then
    raise exception 'hr_c4_24: hr.wf_submit emits target_changed for its own intake re-pin';
  end if;
  -- RD 2: the re-pin sits AFTER the hard-findings return, so an unrouted request is never re-pinned
  if position('rejected_at_intake' in v_src) > position('target_pinned' in v_src) then
    raise exception 'hr_c4_24: the re-pin runs before the hard-findings gate';
  end if;
  -- RD 4: §3.4's real machinery is untouched
  -- the refusal LITERAL lives in hr._wf_target_changed, which hr.wf_decide calls when the digest
  -- it recomputes differs from the pinned one. Both halves are asserted where they actually are.
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'wf_decide') !~ '_wf_target_changed' then
    raise exception 'hr_c4_24: hr.wf_decide no longer checks the target digest';
  end if;
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = '_wf_target_changed') !~ 'WF_TARGET_CHANGED' then
    raise exception 'hr_c4_24: §3.4''s target-changed refusal was lost';
  end if;

  -- everything hr_c4_20..23 installed is still in force
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'wf_resolve_approvers')
     !~ 'v_two_actor and st\.parallel_group is null' then
    raise exception 'hr_c4_24: hr_c4_23''s ladder-scoped strike was lost';
  end if;
  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and (p.proname ~ '^wf_' or p.proname ~ '^_wf_')
     and p.prosrc ~ 'privileged_write';
  if v_bad > 0 then
    raise exception 'hr_c4_24: % engine function(s) touch hr.privileged_write directly', v_bad;
  end if;

  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  v_before := current_setting('matrx.hr_c4_24_conf_before')::integer;
  if v_bad > v_before then
    raise exception 'hr_c4_24: hr conformance findings rose from % to %', v_before, v_bad;
  end if;
end $$;
