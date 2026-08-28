-- HR domain C4 — migration 35 (register item HRB-008; conversion owed to C4 by the L3 SQL lane's
-- readiness note `projects/hr-domain/readiness/WF-INVOKER-CONVERSION.md`, GO from the coordinator).
--
-- 🚨 TWELVE WORKFLOW DOORS RUN AS THE CALLER, SO AN INNER GRANT IS DOING A DOOR'S JOB.
--
-- 12 of the 15 `public.hr_wf_*` doors are `SECURITY INVOKER`. An INVOKER wrapper executes as the
-- CALLING role, so `authenticated` must hold EXECUTE on the inner `hr.wf_*` body for the door to
-- work at all. That grant is not debt to be swept — it is load-bearing while the doors are INVOKER,
-- and it is why check 33's last 53 client-reachable helpers cannot be revoked.
--
-- Converting the doors to DEFINER ends that requirement. This migration converts ELEVEN of them.
-- The twelfth is stopped by name below, with evidence.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. THE CONVERSION CHANGES NO ROW VISIBILITY, AND THAT WAS CONFIRMED PER DOOR RATHER THAN
--    INHERITED. The risk in an INVOKER→DEFINER conversion is a door relying on RLS evaluated AS THE
--    CALLER: converting makes RLS evaluate as the owner and silently widens what comes back. That
--    risk is absent because the inner layer is ALREADY the owner — every one of the 12 inner
--    `hr.wf_*` bodies is itself `SECURITY DEFINER` with a pinned `search_path`, so RLS is already
--    evaluated as the owner on every path today. The INVOKER wrapper's only live effect is the
--    EXECUTE requirement. Measured per door, as `authenticated`, before the flip: an OUTSIDER (a
--    non-admin employment in a DIFFERENT organization) is refused by name at all ten write doors —
--    `WF_NOT_APPROVER`, `no_cancel_authority`, `not_the_requester`, `approver_ineligible`,
--    `no_reassign_authority`, `not_the_assignee`, `no_authority_to_delegate` — and every one of
--    those refusals is derived from `auth.uid()`, which reads `request.jwt.claims`, a GUC that
--    `SECURITY DEFINER` does not touch.
--
-- 2. 🚨 A CORRECTION TO THE READINESS NOTE, BECAUSE IT WOULD HAVE MATTERED. The note reports the
--    only non-DEFINER inner functions as `hr._wf_condition_met` and `hr._wf_value_text`, both
--    table-free. Measured live there are THREE: the third is `hr._leave_policy_lawful`, which is
--    `SECURITY INVOKER`, has NO pinned `search_path`, and DOES read tables — precisely the shape the
--    note says would reintroduce the RLS-as-the-caller risk. It is not a workflow function at all:
--    it matched the note's `proname ~ 'wf'` census through the letters in "la-WF-ul". It has ZERO
--    callers anywhere in the database, so it is on no door's path and this conversion is unaffected.
--    Recorded here so the next census does not re-derive the same false negative from the same regex.
--
-- 3. 🚨 `public.hr_wf_for_target` IS STOPPED BY NAME. It is the one door in the set with NO
--    authorization gate of its own — no `auth.uid()`, no capability call, no organization
--    predicate; it filters on `(target_token, target_id)` and nothing else. Measured live, in a
--    rolled-back transaction, as a non-admin employment in an UNRELATED organization:
--
--        public.hr_wf_for_target('hr_position_assignment', <another org's assignment>)
--          → granted: true
--          → history: [{"flow_key":"pay_change","state":"cancelled","instance_id":"54d3ec54-…"}]
--
--    That leak exists TODAY and is not caused by this conversion — the inner is already DEFINER, so
--    the INVOKER wrapper was never protecting anything. But the note's own rule is that the internal
--    check must be the ONLY gate, and this door has none; stamping `SECURITY DEFINER` on it would
--    make this lane the author of a gate-less definer door. So it is left INVOKER and reported.
--    THE COST OF STOPPING IS EXACTLY ONE GRANT: `hr.wf_for_target` calls no other `hr` function, so
--    52 of the 53 inner grants are still free for the SQL lane to revoke. Filed as D283.
--
-- 4. THE GATE IS CONTRACTED WHERE THE GATE ACTUALLY LIVES. The readiness note asks for a contract
--    row per door with `must_contain: auth.uid`. That cannot hold: all 12 doors are pure
--    pass-throughs of 44–144 bytes, and `auth.uid` appears in NONE of them — it is in the inner
--    body. So this migration writes TWO rows per converted door: the DOOR gets `must_be_definer =
--    true` plus the inner call it must keep delegating to, and the INNER gets `must_contain
--    ['auth.uid']`, which is the refusal itself. Contracting the door's text alone would have
--    protected the pass-through while leaving the actual gate deletable.
--
-- 5. `hr.wf_bulk_decide` GATES BY DELEGATION, AND THAT IS CONTRACTED AS SUCH. It holds no
--    `auth.uid()` of its own; it calls `hr.wf_decide` per step, which does. Proven live rather than
--    assumed — an outsider calling it on a real active step gets envelope `granted: true` with
--    per-step `WF_NOT_APPROVER`, `succeeded: 0`, and `hr.workflow_decision` unchanged at 48 rows.
--    Its contract row therefore requires `hr.wf_decide(`: delete the delegation and the batch door
--    becomes an ungated bypass of the single-step door.
--
-- 6. THE INNER-GRANT REVOKE IS NOT IN THIS FILE. If a door were silently relying on the grant,
--    doing both at once makes the failure impossible to attribute. The SQL lane takes the 52 after
--    this is proven.
--
-- Authority: `/projects/hr-domain/readiness/WF-INVOKER-CONVERSION.md` (L3), SPEC-ACCESS §4.1 (doors
-- refuse with envelopes, never raw SQL) and law 2; check 31 (`hr.function_contract`) as extended by
-- hr_l3_86 with `must_be_definer`.
-- Applied live as `hr_c4_35_the_workflow_doors_run_as_the_owner`. Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '120s';

do $$
declare v_bad integer;
begin
  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  perform set_config('matrx.hr_c4_35_conf_before', v_bad::text, true);
end $$;

-- ============================================================ 1. the conversion (RD 1)
do $mig$
declare
  -- 🚨 `for_target` is ABSENT from this list on purpose (RD 3). Adding it back without first
  -- giving it a gate ships a SECURITY DEFINER door that authorizes nobody.
  v_doors constant text[] := array[
    'hr_wf_bulk_decide', 'hr_wf_cancel', 'hr_wf_decide', 'hr_wf_delegate', 'hr_wf_escalate',
    'hr_wf_inbox', 'hr_wf_reassign_step', 'hr_wf_record_result', 'hr_wf_resolve_failure',
    'hr_wf_resubmit', 'hr_wf_withdraw'];
  d text; v_oid oid; v_def text; v_new text; v_n integer := 0;
begin
  foreach d in array v_doors loop
    select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = d;
    if v_oid is null then
      raise exception 'hr_c4_35: door public.% does not exist — refusing to half-apply', d;
    end if;
    -- the inner body must already be DEFINER, or the RLS-as-the-caller argument does not hold
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'hr' and p.proname = replace(d, 'hr_wf_', 'wf_')
                      and p.prosecdef) then
      raise exception 'hr_c4_35: inner hr.% is not SECURITY DEFINER — converting its door would change row visibility',
        replace(d, 'hr_wf_', 'wf_');
    end if;

    v_def := pg_get_functiondef(v_oid);
    if position('SECURITY DEFINER' in v_def) > 0 then
      raise notice 'hr_c4_35: public.% is already SECURITY DEFINER', d;
    else
      -- the options block always ends immediately before `AS $function$`
      if position(e'\nAS $function$' in v_def) = 0 then
        raise exception 'hr_c4_35: unexpected pg_get_functiondef shape for public.% — refusing to edit blind', d;
      end if;
      v_new := replace(v_def, e'\nAS $function$',
                       e'\n SECURITY DEFINER\n SET search_path TO \'hr\', \'public\'\nAS $function$');
      execute v_new;
      v_n := v_n + 1;
    end if;

    -- RD: the doors' own ACLs. authenticated yes; PUBLIC and anon BOTH revoked — Supabase's
    -- default privileges grant EXECUTE to anon explicitly on new functions in `public`, so
    -- revoking only one of the two leaves the other open.
    execute format('revoke all on function public.%I(%s) from public', d,
                   pg_get_function_identity_arguments(v_oid));
    execute format('revoke all on function public.%I(%s) from anon', d,
                   pg_get_function_identity_arguments(v_oid));
    execute format('grant execute on function public.%I(%s) to authenticated', d,
                   pg_get_function_identity_arguments(v_oid));
  end loop;
  raise notice 'hr_c4_35: % door(s) converted to SECURITY DEFINER', v_n;
end
$mig$;

-- ============================================================ 2. the contracts (RD 4, RD 5)
do $$
declare
  d text; v_inner text;
  v_doors constant text[] := array[
    'hr_wf_bulk_decide', 'hr_wf_cancel', 'hr_wf_decide', 'hr_wf_delegate', 'hr_wf_escalate',
    'hr_wf_inbox', 'hr_wf_reassign_step', 'hr_wf_record_result', 'hr_wf_resolve_failure',
    'hr_wf_resubmit', 'hr_wf_withdraw'];
begin
  delete from hr.function_contract where home_migration = 'hr_c4_35';
  foreach d in array v_doors loop
    v_inner := replace(d, 'hr_wf_', 'wf_');
    -- the DOOR: stays DEFINER, and keeps delegating to its inner body
    insert into hr.function_contract (schema_name, function_name, home_migration,
                                      must_contain, must_not_contain, must_be_definer, reason)
    values ('public', d, 'hr_c4_35', array['hr.' || v_inner || '('], '{}', true,
      'hr_c4_35: this door was SECURITY INVOKER, so it ran as the CALLER and the authenticated EXECUTE grant on hr.' || v_inner || ' was what made it work — which is why check 33''s last 53 helpers could not be revoked. Flipping it back to INVOKER re-imposes that grant requirement and silently reopens the inner workflow machinery to clients. The pass-through must also keep calling hr.' || v_inner || ': a door that stops delegating is a door whose gate has moved somewhere nobody has reviewed.');
    -- the INNER: where the gate actually is (RD 4)
    insert into hr.function_contract (schema_name, function_name, home_migration,
                                      must_contain, must_not_contain, must_be_definer, reason)
    values ('hr', v_inner, 'hr_c4_35',
      case when v_inner = 'wf_bulk_decide' then array['hr.wf_decide('] else array['auth.uid'] end,
      '{}', true,
      case when v_inner = 'wf_bulk_decide'
        then 'hr_c4_35: hr.wf_bulk_decide holds no auth.uid() of its own — IT GATES BY DELEGATION, calling hr.wf_decide per step, which does. Measured: an outsider batch-deciding a real active step gets envelope granted:true with per-step WF_NOT_APPROVER, succeeded:0, and no hr.workflow_decision row. Delete the delegation and the batch door becomes an ungated bypass of the single-step door.'
        else 'hr_c4_35: THE GATE LIVES HERE, not in the door. public.' || d || ' is a pure pass-through of a few dozen bytes that contains no auth.uid at all, so contracting the door''s text protects the wrapper while leaving the actual refusal deletable. Now that the door runs as the owner, this auth.uid()-derived check is the ONLY thing standing between any authenticated caller and this operation.' end);
  end loop;
end $$;

-- ============================================================ 3. post-conditions that EXECUTE
do $$
declare
  d text; v_bad integer; v_before integer; v_res jsonb; v_acl text;
  v_doors constant text[] := array[
    'hr_wf_bulk_decide', 'hr_wf_cancel', 'hr_wf_decide', 'hr_wf_delegate', 'hr_wf_escalate',
    'hr_wf_inbox', 'hr_wf_reassign_step', 'hr_wf_record_result', 'hr_wf_resolve_failure',
    'hr_wf_resubmit', 'hr_wf_withdraw'];
begin
  foreach d in array v_doors loop
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public' and p.proname = d and p.prosecdef) then
      raise exception 'hr_c4_35: public.% is not SECURITY DEFINER', d;
    end if;
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public' and p.proname = d
                      and array_to_string(p.proconfig, ',') like '%search_path%') then
      raise exception 'hr_c4_35: public.% has no pinned search_path, and it now runs as the owner', d;
    end if;
    select p.proacl::text into v_acl from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = d;
    if v_acl is null then
      raise exception 'hr_c4_35: public.% has a NULL ACL — that is the PUBLIC default grant, wide open', d;
    end if;
    if v_acl not like '%authenticated=X%' then
      raise exception 'hr_c4_35: public.% is not executable by authenticated — the door is dead', d;
    end if;
    if v_acl like '%anon=X%' then
      raise exception 'hr_c4_35: public.% is executable by anon', d;
    end if;
    -- a bare `=X/` entry (no grantee before the `=`) is the PUBLIC grant
    if v_acl like '%{=X/%' or v_acl like '%,=X/%' then
      raise exception 'hr_c4_35: public.% is executable by PUBLIC', d;
    end if;
  end loop;

  -- RD 3: the stop is part of the migration's meaning, so it is asserted, not just described.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'hr_wf_for_target' and p.prosecdef) then
    raise exception 'hr_c4_35: hr_wf_for_target was converted — it has no authorization gate and was stopped by name (D283)';
  end if;

  v_res := hr._wf_door_smoke();
  if not coalesce((v_res ->> 'ok')::boolean, false) then
    raise exception 'hr_c4_35: the door smoke test failed: %', v_res;
  end if;
  select coalesce(count(*), 0) into v_bad from hr.function_contracts_broken();
  if v_bad > 0 then
    raise exception 'hr_c4_35: % function contract(s) broken', v_bad;
  end if;

  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  v_before := current_setting('matrx.hr_c4_35_conf_before')::integer;
  if v_bad > v_before then
    raise exception 'hr_c4_35: hr conformance findings rose from % to %', v_before, v_bad;
  end if;
  raise notice 'hr_c4_35: 11 doors converted, ACLs pinned, 22 contract rows declared; hr_wf_for_target stopped (D283)';
end $$;
