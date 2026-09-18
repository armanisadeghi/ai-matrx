-- dd227b_the_reason_says_the_lane_was_folded — DD-227 residue, found by the verifier V-97.
--
-- WHAT WAS WRONG. `dd227_global_execution_control_machinery.sql` was written against the DD-204
-- disposition (DROP the class-regime lane) and switched to the FOLD mid-lane, on two facts found
-- while measuring: `iam.superseded_policy` already carried a 2026-09-12 DD-163 row that removed a
-- RESTRICTIVE `platform_admin_only` wall from this exact table *because* it killed this exact
-- lane, and the lane turned out to be USED by real non-admin principals. The migration, the
-- supersede record and the policy set all shipped the fold correctly. **The `audit_class_reason`
-- on the registry row did not** — it kept the drop wording ("was superseded … and it served no
-- reader in any repository") and never says the lane still exists as `control_read_via_execution`.
--
-- WHY THAT MATTERS ENOUGH FOR ITS OWN FILE. The reason on `platform.entity_types` is the durable,
-- queryable record of origin: it outlives every report, it is what `machinery_has_reason` reads,
-- and it is what the next reader of this table will find. Two records of the same event disagreed
-- — the supersede ledger said "folded, re-created in the same transaction", the registry row said
-- "served no reader" — and the registry row is the one that reads as "the lane is gone".
--
-- SCOPE. One UPDATE of one text column on one registry row. No policy, no grant, no column, no
-- classification changes; `audit_class` stays `machinery` and `rls_variant` stays `component`.
-- There is no reason-update door on the registry (no function in this database takes an
-- `audit_class_reason`), so the column is written directly, with the before-state asserted first
-- and the after-state re-certified. No function is replaced, so no `-- based-on:` line is owed.

do $dd227b$
declare
  v_reason text; v_audit text; v_pols text[];
  v_fail text[] := '{}'; v_pass text[] := '{}'; v_msg text; r record;
begin
  set local lock_timeout = '2s';

  -- ═══════ 1. THE ROW MUST BE THE ONE THIS FILE WAS WRITTEN AGAINST ═══════════════════════════
  select et.audit_class::text, et.audit_class_reason into v_audit, v_reason
    from platform.entity_types et
   where et.token = 'global_execution_control' and et.is_active
     and et.schema_name = 'runtime' and et.table_name = 'global_execution_control';
  if v_reason is null then
    raise exception 'dd227b: global_execution_control is not an active registered entity at runtime.global_execution_control. Nothing was changed.';
  end if;
  if v_audit <> 'machinery' then
    raise exception 'dd227b: audit_class is %, not the machinery DD-227 registered. This file corrects a reason, never a classification; re-read the row first.', v_audit;
  end if;
  if v_reason not like 'DD-227 (2026-09-14):%' then
    raise exception 'dd227b: the reason on the row is not DD-227''s. Somebody else rewrote it; read it before overwriting it.';
  end if;
  if position('served no reader in any repository' in v_reason) = 0
     and position('control_read_via_execution' in v_reason) > 0 then
    raise notice 'dd227b: the reason already names the fold — this file is idempotent and rewrites it to the same corrected text';
  elsif position('served no reader in any repository' in v_reason) = 0 then
    raise exception 'dd227b: the reason carries neither the drop wording this file corrects nor the fold wording it writes. It has moved; re-read it before overwriting it.';
  end if;

  -- The correction must describe a live state, not a hoped-for one: the folded lane has to BE there.
  select array_agg(p.polname order by p.polname) into v_pols
    from pg_policy p where p.polrelid = 'runtime.global_execution_control'::regclass;
  if v_pols is distinct from array['control_read_via_execution','platform_admin_all'] then
    raise exception 'dd227b: the live policy set is %, not the {control_read_via_execution, platform_admin_all} this correction asserts. A reason that describes doors that are not there is the defect this file exists to fix.', v_pols;
  end if;
  if not exists (select 1 from iam.superseded_policy s
                  where s.schema_name = 'runtime' and s.table_name = 'global_execution_control'
                    and s.policy_name = 'std_select') then
    raise exception 'dd227b: iam.superseded_policy has no std_select row for this table, so the "superseded through DD-172''s mechanism" half of this reason is unsupported. Nothing was changed.';
  end if;
  if not exists (select 1 from iam.superseded_policy s
                  where s.schema_name = 'runtime' and s.table_name = 'global_execution_control'
                    and s.policy_name = 'platform_admin_only') then
    raise exception 'dd227b: iam.superseded_policy has no platform_admin_only row for this table, so the DD-163 citation in this reason is unsupported. Nothing was changed.';
  end if;

  -- ═══════ 2. THE CORRECTED RECORD OF ORIGIN ══════════════════════════════════════════════════
  update platform.entity_types
     set audit_class_reason =
'DD-227 (2026-09-14, reason corrected by DD-227b after V-97): runtime.global_execution_control is the runtime''s per-execution-tree STOP SWITCH — one row per root execution holding cost_budget, limits, cancel_requested_at/by and deadline — not a record anybody keeps. Its only writer is the engine (matrx_runtime OrmExecutionStore.upsert_control, from engine.py create_execution and request_cancel) and its only reader is the same engine (get_control, from ensure_can_proceed / is_cancel_requested / remaining_budget / tree budget), which connects as the privileged postgres login role and never sees RLS. No function body, view or matview in this database names it, and no client CODE in aidream, matrx-frontend, matrx-sandbox, matrx-local or matrx-extend reads or writes it — but the CLIENT READ LANE is real and resolves real rows (see below), so "no reader" is a statement about application code, never about the door. The per-variant base contract is inapplicable by design, not merely hard to apply: the row has no identity of its own (it IS its parent execution, one per root, addressed by nothing), and organization_id NOT NULL STOPS THE PLATFORM — proven live and re-proven as the migration''s own forcing limb: the engine''s control insert dies 23514 the moment an organization is required, so no execution can start, because the engine names no organization and NO NULL ORG (2026-08-21) forbids a default, a resolver or a trigger choosing one (platform._ddl_guard refuses the default by name, 23514). THE GENERATED std_select LANE WAS FOLDED, NOT DROPPED: superseded through DD-172''s one recorded path (iam.supersede_bespoke_policies, reason in iam.superseded_policy) AND RE-CREATED IN THE SAME TRANSACTION as the bespoke policy control_read_via_execution, with a byte-identical predicate, role and command carried across verbatim from the policy the migration itself read — SELECT to authenticated USING ((select is_platform_admin()) OR iam.has_access(''global_execution'', root_execution_id, ''viewer'')). The non-staff read lane therefore still exists; only its NAME changed, because iam.apply_rls refuses a machinery token by construction, so a class-regime name here claimed a generation that can never re-run and that nothing certifies (DD-200''s machinery_no_generated_policy finding, taking DD-200''s first disposition — "fold it into this table''s bespoke, documented contract" — rather than the drop DD-204 gave platform.activity_log). Two facts decided the fold against the drop: (a) iam.superseded_policy already carried a 2026-09-12 DD-163 row removing a RESTRICTIVE platform_admin_only wall from THIS table precisely because it "ANDed with std_select and killed the only non-staff read lane this table has … the lane the runtime feature wrote", and (b) the lane is USED — measured live before the change over a fixed 400-row sample, as each principal with their own JWT: test@test.com 13 rows, arman@titaniumsuccess.com 13, two execution owners 400 each, three platform admins 400 each, anonymous refused at the grant. A drop would have silently narrowed four non-admin principals. Access delta across ten principals, before and after: 0 gained, 0 narrowed. control_read_via_execution''s migration of record is migrations/dd227_global_execution_control_machinery.sql; this corrected reason is migrations/dd227b_the_reason_says_the_lane_was_folded.sql, written because the original reason carried the DROP wording and disagreed with the supersede ledger about what shipped (V-97 §9.1). rls_variant stays component (there is no machinery variant) and is what it would be generated as if it ever stopped being machinery. Registered machinery under the DD-227 chair''s brief, on this evidence, per db-rules §11.'
   where token = 'global_execution_control';

  -- ═══════ 3. THE CORRECTION MUST ITSELF BE TRUE, AND STILL CERTIFY ═══════════════════════════
  select et.audit_class_reason into v_reason
    from platform.entity_types et where et.token = 'global_execution_control';
  if position('FOLDED, NOT DROPPED' in v_reason) = 0
     or position('control_read_via_execution' in v_reason) = 0
     or position('served no reader in any repository' in v_reason) > 0 then
    raise exception 'dd227b: the corrected reason does not say what this file exists to say. Nothing is committed.';
  end if;

  for r in select * from iam.verify_canonical('runtime','global_execution_control','global_execution_control') loop
    if r.status = 'FAIL' then v_fail := array_append(v_fail, format('%s: %s', r.check_name, coalesce(r.detail,'')));
    elsif r.status = 'PASS' then v_pass := array_append(v_pass, r.check_name); end if;
  end loop;
  if cardinality(v_fail) > 0 then
    raise exception 'dd227b: % certification FAIL(s) after the reason correction: %.', cardinality(v_fail), array_to_string(v_fail, ' ; ');
  end if;
  foreach v_msg in array array['machinery_has_reason','machinery_no_generated_policy','machinery_no_client_grant','machinery_rls_on'] loop
    if not (v_msg = any (v_pass)) then
      raise exception 'dd227b: the machinery contract check % did not PASS after the correction.', v_msg;
    end if;
  end loop;

  -- And nothing but the reason moved.
  select array_agg(p.polname order by p.polname) into v_pols
    from pg_policy p where p.polrelid = 'runtime.global_execution_control'::regclass;
  if v_pols is distinct from array['control_read_via_execution','platform_admin_all'] then
    raise exception 'dd227b: the policy set changed under this file. Nothing is committed.';
  end if;
  raise notice 'dd227b: the reason now states the FOLD, cites the DD-163 supersede row, and the token still certifies 0 FAIL with all four machinery checks PASS. Policy set unchanged: %', v_pols;
end $dd227b$;
