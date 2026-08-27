-- HR domain C4 — migration 8 (register item HRB-008 follow-up, lane workflow-engine).
--
-- 🚨 THE C4 WORKFLOW ENGINE STOPS ARMING THE HR WRITE GUARD TRANSACTION-WIDE.
--
-- Every one of the engine's 20 privileged writers armed the guard with the LEGACY literal:
--
--     perform set_config('hr.privileged_write','on',true);
--
-- `is_local => true` scopes a GUC to the TRANSACTION, not to the function. So one call to any
-- `hr.wf_*` RPC left the whole HR write guard disarmed for the rest of that transaction — every
-- later statement in it could write any `hr.*` table directly, ledgers included. HRB-008's own
-- proof suite RECORDED that as a finding ("hr.privileged_write is TRANSACTION-scoped, so a definer
-- call disarms the write guard for the rest of it") and handed the debt to the access lane. The
-- access lane has since shipped the fix — `hr.arm_write()` (hr_c3_00, corrected in hr_c3_11) issues
-- a statement-scoped, unforgeable token, and never degrades a caller that already holds a legacy
-- arm. This migration is C4 paying that debt at the source rather than asserting it as a feature.
--
-- WHY THE TOKEN IS ENOUGH FOR EVERY ENGINE CALLER, verified before writing this file:
--   · The token is md5(statement_timestamp() || pid || key). `statement_timestamp()` is stable for
--     the whole of one TOP-LEVEL statement, including every nested plpgsql statement, every hook
--     the engine calls through `regprocedure`, and every trigger those writes fire. An engine RPC
--     is exactly one top-level statement, so one arm covers its entire body — which is precisely
--     the property `hr.arm_write`'s comment names and hr_c3_11's assertions pin.
--   · All 20 are SECURITY DEFINER, owned by `postgres`, so the EXECUTE privilege on
--     `hr.arm_write()` (REVOKEd from anon/authenticated) is checked against the definer, not the
--     client. No client gains a way to arm anything.
--   · The engine's cross-statement callers all arm for themselves: `hr.pay_period_transition`
--     (L3) and `hr._timecard_reject_reopen` (L3) already call `hr.arm_write()`, and every proof
--     harness sets the legacy literal itself — which `hr.arm_write()` deliberately leaves alone.
--
-- 🚨 THE LEGACY LANE IN `hr._guard_hr_write` IS NOT TOUCHED. The C5 jurisdiction lane, the
-- retention/export writers and 14 applied migrations' seed blocks still arm with the literal;
-- removing the lane here would break all of them, which is collateral this change must not cause.
-- What changes is that the C4 engine is no longer one of those callers. Deleting the legacy lane
-- is still a one-line change, owned by whoever migrates the last of the remaining writers.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. 🚨 THE BODIES ARE REWRITTEN FROM THE LIVE CATALOG, NOT RE-PASTED FROM THE C4 FILES.
--    `hr_c4_03`…`hr_c4_07` are not the current truth: later lanes have fixed defects inside these
--    same functions at the source (HRB-022 fixed two). Re-pasting the original bodies to change one
--    line each would silently REVERT those fixes. So this migration reads `pg_get_functiondef` for
--    every `hr.wf_*` / `hr._wf_*` function that still carries the literal, replaces that exact
--    string, and re-executes the definition. `CREATE OR REPLACE FUNCTION` preserves the ACL and the
--    COMMENT, so grants and documentation survive untouched. It is idempotent by construction:
--    after the first run nothing matches, and the loop is a no-op.
--
-- 2. THE MATCH IS THE EXACT LITERAL, NEVER A PATTERN. `set_config('hr.privileged_write','on',true)`
--    is matched byte-for-byte (all 21 live occurrences are identical, verified before writing).
--    A looser pattern could rewrite a DISARM (`,'off',`) into an ARM, which would be a leak
--    introduced by a leak fix. The post-conditions below refuse to let the file commit if any
--    `hr.privileged_write` mention survives anywhere in the family.
--
-- 3. THE SCOPE IS THIS LANE'S FUNCTIONS ONLY — `hr.wf_*` and `hr._wf_*`. Other lanes' writers
--    (`hr.export_*`, `hr.dispose_records`, `hr.write_calculation_snapshot`, `hr._sync_legal_hold_count`,
--    `hr.transfer_restricted_note`, `hr.provider_event_record`, `hr.rpc_calculation_snapshot_get`,
--    `hr.stamp_retention_triggers`, the two fixture probes) still hold the literal and are NOT
--    touched here: a lane migrates its own writers, having verified its own callers.
--
-- Authority: SPEC-ACCESS law 2 (`hr.arm_write` is the only sanctioned arm) and SPEC-WORKFLOW-ENGINE
-- §1.3 note 2 (the write guard, not the `deleted_at` column, is what protects workflow evidence —
-- which is only true while the guard is actually armed for the statement and no longer).
-- Applied live as `hr_c4_08_engine_arms_statement_scoped`. Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '30s';

-- ============================================================ 1. the rewrite
do $mig$
declare
  r        record;
  v_def    text;
  v_new    text;
  v_done   integer := 0;
  v_legacy constant text := 'set_config(''hr.privileged_write'',''on'',true)';
begin
  for r in
    select p.oid, p.oid::regprocedure::text as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'hr'
       and (p.proname ~ '^wf_' or p.proname ~ '^_wf_')
       and position(v_legacy in p.prosrc) > 0
     order by 2
  loop
    v_def := pg_get_functiondef(r.oid);
    v_new := replace(v_def, v_legacy, 'hr.arm_write()');
    if v_new = v_def then
      raise exception 'hr_c4_08: % carries the literal in prosrc but not in its definition', r.sig;
    end if;
    execute v_new;
    v_done := v_done + 1;
  end loop;
  raise notice 'hr_c4_08: % engine function(s) moved from the legacy arm to hr.arm_write()', v_done;
end
$mig$;

-- ============================================================ 2. post-conditions
do $$
declare
  v_bad  integer;
  v_n    integer;
  v_left text;
begin
  -- 2a. NOT ONE `hr.wf_*` / `hr._wf_*` function may mention the guard flag any more. The engine
  -- arms through the one sanctioned door or it does not arm at all.
  select count(*), string_agg(p.oid::regprocedure::text, ', ')
    into v_bad, v_left
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and (p.proname ~ '^wf_' or p.proname ~ '^_wf_')
     and p.prosrc ~ 'privileged_write';
  if v_bad > 0 then
    raise exception 'hr_c4_08: % engine function(s) still touch hr.privileged_write directly: %',
      v_bad, v_left;
  end if;

  -- 2b. and the twenty that used to are all calling hr.arm_write() now
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and (p.proname ~ '^wf_' or p.proname ~ '^_wf_')
     and p.prosrc ~ 'arm_write';
  if v_n < 20 then
    raise exception 'hr_c4_08: only % engine function(s) call hr.arm_write(); expected at least 20', v_n;
  end if;

  -- 2c. every rewritten function is still SECURITY DEFINER on the pinned search_path. A rewrite
  -- that dropped either would turn the whole family into a client-privilege function.
  select count(*) into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and (p.proname ~ '^wf_' or p.proname ~ '^_wf_')
     and p.prosrc ~ 'arm_write'
     and (not p.prosecdef
          or p.proconfig is null
          or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'));
  if v_bad > 0 then
    raise exception 'hr_c4_08: % engine function(s) lost SECURITY DEFINER or the pinned search_path', v_bad;
  end if;

  -- 2d. the arm itself is still unforgeable by a client — the whole point of moving to it
  if has_function_privilege('authenticated', 'hr.arm_write()', 'execute')
     or has_function_privilege('anon', 'hr.arm_write()', 'execute') then
    raise exception 'hr_c4_08: hr.arm_write became callable by a client role';
  end if;

  -- 2e. the guard is still the definer trigger function it was
  if not (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'hr' and p.proname = '_guard_hr_write') then
    raise exception 'hr_c4_08: hr._guard_hr_write stopped being SECURITY DEFINER';
  end if;

  -- 2f. the public doors the frontend calls are all still executable (CREATE OR REPLACE keeps the
  -- ACL; this refuses to believe that rather than assuming it)
  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'hr\_wf\_%'
     and not has_function_privilege('authenticated', p.oid, 'EXECUTE');
  if v_bad > 0 then
    raise exception 'hr_c4_08: % public.hr_wf_* door(s) lost the authenticated EXECUTE grant', v_bad;
  end if;

  -- 2g. nothing in the hr schema stopped certifying
  select count(*) into v_bad from platform.entity_types e
   where e.schema_name = 'hr' and not iam.canonical_certify_ok(e.schema_name, e.table_name, e.token);
  if v_bad > 0 then
    raise exception 'hr_c4_08: % hr tokens no longer certify', v_bad;
  end if;
end $$;

-- ============================================================ 3. the behaviour, proven in the file
-- A migration that only greps its own source has proven nothing, so this calls the real thing from
-- a COLD flag and reads what the engine left behind. `hr.wf_tick` is the probe because it arms
-- unconditionally near the top, before it has decided whether there is any work; every other
-- engine writer arms late, after refusals it might legitimately take here.
--
-- 🚨 IT RUNS INSIDE A BLOCK THAT ALWAYS RAISES, so the sweep's real effects — reminders,
-- escalations, timeouts on whatever is due when this file is re-run in a year — are rolled back to
-- the block's implicit savepoint and never land. plpgsql variables are not transactional, so the
-- reading survives the rollback and is asserted afterwards.
do $$
declare
  v_flag text;
begin
  perform set_config('hr.privileged_write', '', true);
  begin
    perform hr.wf_tick();
    v_flag := coalesce(current_setting('hr.privileged_write', true), '');
    raise exception 'hr_c4_08_probe_rollback';
  exception when others then
    if sqlerrm <> 'hr_c4_08_probe_rollback' then raise; end if;
  end;

  -- 🚨 the engine leaves NO transaction-wide arm behind. Under the legacy literal this read was
  -- 'on', and every later statement in the transaction could then write any hr.* table directly —
  -- ledgers included. That is the finding HRB-008 recorded and this file closes.
  if v_flag is null then
    raise exception 'hr_c4_08: the probe never reached the reading; hr.wf_tick raised';
  end if;
  if v_flag in ('on','true','1','yes') then
    raise exception 'hr_c4_08: hr.wf_tick still leaves the legacy transaction-wide arm behind (%)', v_flag;
  end if;
  if v_flag = '' then
    raise exception 'hr_c4_08: hr.wf_tick armed nothing at all — it can no longer write';
  end if;

  perform set_config('hr.privileged_write', '', true);
end $$;
