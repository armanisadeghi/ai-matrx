-- HR domain C4 — migration 25 (register item HRB-008 follow-up, lane workflow-engine).
--
-- 🚨 A REGRESSION I SHIPPED IN hr_c4_21: THE PRE-FLIGHT TURNS A FAIL-CLOSED REFUSAL INTO A RAISE.
--
-- Measured, driving the real door on a real envelope (rolled back):
--
--   select hr.wf_request('signature_request','esign_envelope', <envelope>, <org>)
--   → InvalidParameterValueError: hr.can_approve: esign.envelope is not an approvable target table
--
-- Not an envelope. Not a refusal. An exception, out of an RPC, past every caller — which is exactly
-- what THE REFUSAL-ENVELOPE LAW exists to forbid, and what `hrb011_proof.py` has been aborting on
-- at 106 assertions.
--
-- 🚨 **AND IT CORRECTS MY OWN EARLIER REPORT.** When I filed D281 I wrote that "the engine is not at
-- fault — wf_resolve_approvers already catches that raise and fails closed with
-- `approval_subject_unmapped` (RECORDED DECISION 5)". The resolver does. But hr_c4_21's pre-flight
-- calls `hr.can_approve` **directly**, at the door, BEFORE the resolver is ever reached — outside
-- the `begin … exception` block that RECORDED DECISION 5 lives in. So the guarantee that existed
-- before hr_c4_21 was silently removed by hr_c4_21, and I asserted it was still there without
-- driving it. Driving it is what found this.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. THE PRE-FLIGHT GETS THE SAME GUARD, RETURNING THE SAME ENVELOPE THE RESOLVER WOULD.
--    `definition_invalid` with
--    `approval_subject_unmapped: hr.can_approve cannot resolve a subject for <table> (<sqlerrm>)` —
--    the resolver's exact reason and detail shape, so a caller cannot tell which layer caught it and
--    the two can never drift into two different stories about the same condition.
--
-- 2. `when others`, DELIBERATELY, AND MIRRORING THE RESOLVER. RECORDED DECISION 5 catches broadly
--    because the failure it guards is "this target table cannot be mapped to a subject", which
--    surfaces as several sqlstates depending on how `hr._approval_subject` gives up. Narrowing it
--    here would let a variant through as a raise again. The sqlerrm is carried into the detail, so
--    nothing is swallowed — it is reported, in the envelope, where a person can read it.
--
-- 3. ONLY THE STRUCTURE CHANGES. The refusal sentence (including a peer's article-agreement fix —
--    "an address change", not "a address change") is preserved byte-for-byte, and the existence
--    test itself is unchanged: same predicate, same §2.2-rule-2 exclusion. What changes is that the
--    test now runs inside a block that cannot throw past the door.
--
-- 4. THIS DOES NOT MAKE `signature_request` ROUTABLE, AND DOES NOT PRETEND TO. It makes it fail
--    HONESTLY — a named refusal a caller can read and act on, instead of an exception. The
--    allowlist entry that would make it actually route is a separate, unresolved design question
--    reported to the coordinator: `esign.envelope` has **zero** columns that FK to an employment, so
--    there is nothing to derive. See the report; not guessed at here.
--
-- Authority: SPEC-WORKFLOW-ENGINE §2.2 RECORDED DECISION 5 (fail closed and name it, never route on
-- a guess), §4.2 (the refusal-envelope law).
-- Applied live as `hr_c4_25_the_preflight_fails_closed_too`. Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '120s';

do $$
declare v_bad integer;
begin
  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  perform set_config('matrx.hr_c4_25_conf_before', v_bad::text, true);
end $$;

do $mig$
declare
  v_oid oid; v_def text; v_new text;

  v_head_old constant text := $o$  if v_pf_action is not null
     and not exists (
       select 1 from hr.employment em2$o$;
  v_head_new constant text := $o$  if v_pf_action is not null then
   -- 🚨 RECORDED DECISION 5 AT THE DOOR. hr.can_approve RAISES for a target table
   -- hr._approval_subject cannot map to a subject employment, and this pre-flight calls it
   -- DIRECTLY — before hr.wf_resolve_approvers, whose `begin … exception` block is where that
   -- guarantee used to live. Without this the raise escapes hr.wf_request entirely, which is a
   -- broken refusal-envelope law and is what hr_c4_21 accidentally introduced.
   declare v_pf_any boolean;
   begin
     select exists (
       select 1 from hr.employment em2$o$;

  v_mid_old constant text := $o$          and hr.can_approve(e2.login_user_id, v_pf_action, v_tbl, p_target_id))
  then
    return jsonb_build_object($o$;
  v_mid_new constant text := $o$          and hr.can_approve(e2.login_user_id, v_pf_action, v_tbl, p_target_id))
       into v_pf_any;
   exception when others then
     -- the resolver's EXACT reason and detail shape, so a caller cannot tell which layer caught
     -- it and the two can never drift into two stories about one condition. sqlerrm is carried,
     -- so nothing is swallowed — it is reported where a person can read it.
     return jsonb_build_object('granted', false, 'reason', 'definition_invalid',
       'detail', format('approval_subject_unmapped: hr.can_approve cannot resolve a subject for %s (%s)',
                        v_tbl, sqlerrm),
       'flow_key', p_flow_key, 'target_token', p_target_token, 'action_type', v_pf_action);
   end;
   if not v_pf_any then
    return jsonb_build_object($o$;

  v_tail_old constant text := $o$      'remedy', 'An organization owner or HR administrator grants this approval authority to somebody; the request can then be submitted and will route to them.');
  end if;$o$;
  v_tail_new constant text := $o$      'remedy', 'An organization owner or HR administrator grants this approval authority to somebody; the request can then be submitted and will route to them.');
   end if;
  end if;$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_request';
  if v_oid is null then raise exception 'hr_c4_25: hr.wf_request does not exist'; end if;
  v_def := pg_get_functiondef(v_oid);
  if position($chk$approval_subject_unmapped$chk$ in v_def) > 0 then
    raise notice 'hr_c4_25: the pre-flight already fails closed';
  else
    if position(v_head_old in v_def) = 0 or position(v_mid_old in v_def) = 0
       or position(v_tail_old in v_def) = 0 then
      raise exception 'hr_c4_25: hr.wf_request does not carry hr_c4_21''s pre-flight in the expected shape — refusing to half-apply';
    end if;
    v_new := replace(v_def,  v_head_old, v_head_new);
    v_new := replace(v_new,  v_mid_old,  v_mid_new);
    v_new := replace(v_new,  v_tail_old, v_tail_new);
    execute v_new;
    raise notice 'hr_c4_25: hr.wf_request''s pre-flight now fails closed instead of raising';
  end if;
end
$mig$;

-- ============================================================ post-conditions
do $$
declare v_src text; v_bad integer; v_before integer;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_request';
  if v_src !~ 'approval_subject_unmapped' then
    raise exception 'hr_c4_25: the pre-flight does not fail closed on an unmapped subject';
  end if;
  -- RD 3: the pre-flight itself is otherwise UNCHANGED
  if v_src !~ 'WF_NO_POSSIBLE_APPROVER' or v_src !~ 'requester_is_interested_party, false\)' then
    raise exception 'hr_c4_25: hr_c4_21''s pre-flight or its §2.2 rule 2 exclusion was lost';
  end if;
  -- and the peer's article-agreement sentence survived verbatim
  if v_src !~ 'then ''an '' else ''a '' end' then
    raise exception 'hr_c4_25: the article-agreement fix in the refusal sentence was lost';
  end if;
  -- RD 1: the resolver's own guard is untouched, so BOTH layers say the same thing
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'wf_resolve_approvers') !~ 'approval_subject_unmapped' then
    raise exception 'hr_c4_25: RECORDED DECISION 5 was lost from the resolver';
  end if;

  -- everything hr_c4_20..24 installed is still in force
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'wf_submit') !~ 'target_pinned' then
    raise exception 'hr_c4_25: hr_c4_24''s digest re-pin was lost';
  end if;
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'wf_resolve_approvers')
     !~ 'v_two_actor and st\.parallel_group is null' then
    raise exception 'hr_c4_25: hr_c4_23''s ladder-scoped strike was lost';
  end if;
  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and (p.proname ~ '^wf_' or p.proname ~ '^_wf_')
     and p.prosrc ~ 'privileged_write';
  if v_bad > 0 then
    raise exception 'hr_c4_25: % engine function(s) touch hr.privileged_write directly', v_bad;
  end if;

  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  v_before := current_setting('matrx.hr_c4_25_conf_before')::integer;
  if v_bad > v_before then
    raise exception 'hr_c4_25: hr conformance findings rose from % to %', v_before, v_bad;
  end if;
end $$;
