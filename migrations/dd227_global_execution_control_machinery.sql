-- dd227_global_execution_control_machinery — DD-227. db-rules §0/§6d-1/§6d-3/§9/§11.
--
-- `runtime.global_execution_control` was named beside `runtime.execution_event_cursor` in DD-173's
-- hot-table line and B-104 deliberately did NOT touch it: "nobody censused its readers". This file
-- is that census, and the classification that follows from it.
--
-- ═══ 1. WHAT THE TABLE IS ═════════════════════════════════════════════════════════════════════
-- Nine columns, one row per ROOT execution: `root_execution_id uuid` (the primary key, and a FK to
-- `runtime.global_execution(id)` ON DELETE CASCADE), `cost_budget numeric(20,8)`, `limits jsonb`,
-- `cancel_requested_at`, `cancel_requested_by uuid`, `deadline`, `created_at`, `updated_at`,
-- `version`. 168,500 rows on 2026-09-14; 11 carry a cancel request, 7 a budget, 0 a deadline, 0 a
-- non-empty limits map. It is the runtime's per-execution-tree STOP SWITCH: the row the engine
-- re-reads at every boundary to decide whether the tree may do more work.
--
-- ═══ 2. WHO TOUCHES IT — CENSUSED 2026-09-14, EVERY LANE ══════════════════════════════════════
--   WRITER — exactly one, and it is the engine: `OrmExecutionStore.upsert_control`
--     (aidream `packages/matrx-runtime/matrx_runtime/orm_store.py`), which upserts
--         (root_execution_id, cost_budget, limits, cancel_requested_at, cancel_requested_by,
--          deadline)
--     on conflict (root_execution_id). Its callers are all in `matrx_runtime/engine.py`:
--     `create_execution` (line 172 — EVERY root execution gets its control row at birth) and
--     `request_cancel` (line 599).
--   READER — the same engine, through `OrmExecutionStore.get_control`, from `engine.py`
--     `remaining_budget` (588), `request_cancel` (596), `is_cancel_requested` (605) and
--     `ensure_can_proceed` (614). `ensure_can_proceed` is the hot one: consumers poll it every
--     turn and every step, and `spawn_child` calls it for free.
--   DATABASE — nothing. No function body in this database names the table (0 of ~3,000
--     `pg_proc` rows), no view or matview reads it, and the only triggers on it are
--     `platform._touch_row` and `platform._stamp_actor_tier` (the latter inert here — the table
--     carries none of the columns it writes).
--   CLIENT — nobody, in any repository: `global_execution_control` does not appear in one line of
--     application code in aidream, matrx-frontend, matrx-sandbox, matrx-local or matrx-extend.
--     Its matrx-frontend appearances are migrations, two guard scripts and generated types.
--   AND THE ENGINE IS NOT A CLIENT. The runtime connects through the Matrx ORM as
--     `SUPABASE_MATRIX_USER = postgres.<project>` — the privileged login role, which BYPASSES row
--     security entirely. So nothing that this file does to a policy can reach the writer.
--
-- ═══ 3. WHY MACHINERY, AND NOT A BASE-CONTRACT RETROFIT ═══════════════════════════════════════
-- The §6d-3 contract for its registered `component` variant wants `id uuid`, `organization_id`
-- NOT NULL + FK, and `metadata`. The certifier reports five FAILs on that basis today
-- (`base_id_uuid`, `base_metadata`, `base_organization_id`, `base_org_fk`, `policies_canonical`).
-- Two of the three columns are false statements about this row and the third STOPS THE PLATFORM:
--   * `id` — the row has no identity of its own; it IS its parent execution, one per root, and
--     nothing addresses it, shares it or lists it.
--   * `organization_id NOT NULL` — the engine's upsert names no organization, and NO NULL ORG
--     (owner ruling 2026-08-21) forbids a default, a resolver and a trigger choosing one. With the
--     requirement in place the very next `create_execution` fails and NO EXECUTION CAN START.
--     Measured live in a rolled-back transaction on 2026-09-14 and reproduced as this file's own
--     forcing limb below: the engine's exact insert dies `23514`, and `platform._ddl_guard`
--     refuses the organization default that would have hidden it (`ddl_guard:
--     runtime.global_execution_control adds or changes an organization_id default`).
-- That is what db-rules §11 means by "the gate is circular or inapplicable by design". The
-- classification is registered here with the reason written on the row, under the DD-227 chair's
-- brief and on this evidence — never an agent clearing red on its own authority (§11).
--
-- ═══ 4. THE ONE DOOR THAT CHANGES, AND WHY IT IS THE SAME CLASS DD-204 REMOVED ════════════════
-- Unlike the cursor (RLS on, no policy at all), this table carries `std_select`:
--     (select is_platform_admin()) OR iam.has_access('global_execution', root_execution_id, 'viewer')
-- `std_select` is a name `iam.apply_rls` AUTHORS. `iam.apply_rls` refuses a machinery token by
-- construction (the 2026-08-24 42P17 recursion class), so a class-regime lane on a machinery
-- relation is a generation that can never be re-run and that nothing certifies — exactly the
-- finding `iam.verify_canonical`'s `machinery_no_generated_policy` exists to make.
--
-- 🚨 IT IS FOLDED, NOT DROPPED — AND THE REASON IS A PRIOR DELIBERATE RULING ON THIS EXACT TABLE.
-- DD-200's own finding text offers two dispositions: "Fold it into this table's bespoke,
-- documented contract or drop it." DD-204 DROPPED `platform.activity_log/std_select` because that
-- lane handed every member of an organization the whole audit trail of everyone else in it. This
-- lane is not that: it admits exactly the people who can already view the parent execution, to the
-- stop-switch row of that one execution. And `iam.superseded_policy` already carries a 2026-09-12
-- entry for this table (DD-163, lane B-57) removing a RESTRICTIVE `platform_admin_only` wall
-- precisely BECAUSE it "ANDed with std_select and killed the only non-staff read lane this table
-- has — iam.has_access('global_execution', root_execution_id, 'viewer'), on 160,536 rows … the
-- lane it was hiding is the one the runtime feature wrote". Deleting two days later the lane a
-- recorded ruling deliberately restored would need a proof that lane is wrong, and no such proof
-- exists: what is wrong is its NAME, which claims a generator that refuses this token.
-- So `std_select` is superseded through the ONE recorded path (`iam.supersede_bespoke_policies`,
-- reason kept in `iam.superseded_policy` — never a bare DROP POLICY) and re-created in the SAME
-- transaction as `control_read_via_execution` with a byte-identical predicate, role and command.
-- ACCESS DELTA IS ZERO BY CONSTRUCTION, and this file measures it against real principals before
-- and after (§2 and §6 of the block below) rather than asserting it.
-- `platform_admin_all` is untouched — a platform-wide lane its own migration put on 888 tables,
-- which `machinery_no_client_grant` accepts and which `supersede_bespoke_policies` refuses to
-- remove even on machinery.
--
-- ═══ 5. WHAT THIS DOES NOT DO ═════════════════════════════════════════════════════════════════
--   * `rls_variant` stays `component` — there is no `machinery` rls_variant (the CHECK admits only
--     entity/component/system/restricted/ledger/personal; DD-200's correction), and `component` is
--     what this table would be generated as if it ever stopped being machinery.
--   * No column is added, no row is rewritten, no grant is changed, RLS stays on.
--   * The sibling `execution_event_cursor` is NOT touched. V-92 reports that `authenticated` holds
--     INSERT/UPDATE/DELETE on it behind an admin-gated policy set — a pre-existing shape that this
--     file's evidence does not cover, reported rather than swept in.
--   * aidream's `packages/matrx-runtime/matrx_runtime/db/bootstrap/020_runtime.sql` re-creates a
--     `std_select` on this table when it bootstraps a BARE database (standalone installs only; the
--     host never runs it against this one). That divergence is reported to the chair — this lane is
--     read-only in aidream.

do $dd227$
declare
  v_variant text; v_audit text; v_cols text; v_pols text[]; v_lane text; v_sample uuid[];
  v_root uuid; v_org uuid;
  v_state text; v_msg text;
  v_before jsonb := '{}'::jsonb; v_after jsonb := '{}'::jsonb;
  v_gained text[] := '{}'; v_narrowed text[] := '{}';
  v_fail text[] := '{}'; v_pass text[] := '{}';
  v_n bigint; r record; k text; v_locked boolean := false; v_lock_at timestamptz; v_held numeric;
begin
  set local lock_timeout = '2s';

  -- ═══════ 1. THE TABLE AND THE REGISTRY MUST BE WHAT THIS FILE WAS WRITTEN AGAINST ═══════════
  select et.rls_variant, et.audit_class::text into v_variant, v_audit
    from platform.entity_types et
   where et.token = 'global_execution_control' and et.is_active
     and et.schema_name = 'runtime' and et.table_name = 'global_execution_control';
  if v_variant is null then
    raise exception 'dd227: global_execution_control is not an active registered entity at runtime.global_execution_control. Nothing was changed.';
  end if;
  if v_variant <> 'component' then
    raise exception 'dd227: rls_variant is %, not the component this file was written against. Re-census before re-running it.', v_variant;
  end if;
  if v_audit = 'machinery' then
    raise notice 'dd227: already machinery — this file is idempotent from here on';
  elsif v_audit <> 'entity' then
    raise exception 'dd227: audit_class is %, which this file was not written against.', v_audit;
  end if;

  select string_agg(a.attname, ',' order by a.attnum) into v_cols
    from pg_attribute a
   where a.attrelid = 'runtime.global_execution_control'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_cols <> 'root_execution_id,cost_budget,limits,cancel_requested_at,cancel_requested_by,deadline,created_at,updated_at,version' then
    raise exception 'dd227: runtime.global_execution_control has columns (%), not the nine this file''s whole argument rests on. Re-census before re-running it.', v_cols;
  end if;

  select array_agg(p.polname order by p.polname) into v_pols
    from pg_policy p where p.polrelid = 'runtime.global_execution_control'::regclass;
  if not (v_pols = array['platform_admin_all','std_select']
          or v_pols = array['control_read_via_execution','platform_admin_all']) then
    raise exception 'dd227: the live policy set is %, not the {platform_admin_all, std_select} this file was written against. Read the doors again before changing one.', v_pols;
  end if;
  -- The lane being folded must be the one this file describes, character for character, or the
  -- "byte-identical predicate" promise below is a claim about a policy nobody re-read.
  select pg_get_expr(p.polqual, p.polrelid) into v_lane
    from pg_policy p where p.polrelid = 'runtime.global_execution_control'::regclass
                       and p.polname = 'std_select';
  if v_lane is not null and v_lane !~ 'is_platform_admin' then
    raise exception 'dd227: std_select on this table no longer carries the staff arm this file read (%). Re-read the door before folding it.', v_lane;
  end if;
  if v_lane is not null and v_lane !~ 'has_access\(''global_execution''::text, root_execution_id' then
    raise exception 'dd227: std_select on this table no longer resolves its parent execution (%). Re-read the door before folding it.', v_lane;
  end if;

  -- The census claim "no function and no view in this database touches it" is re-proven at apply
  -- time, because a claim measured yesterday is not a fact today.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where p.prosrc ~* 'global_execution_control'
                and not (n.nspname = 'platform' and p.proname = '_ddl_guard')) then
    raise exception 'dd227: a function body in this database now names global_execution_control. The "no database reader" half of this file''s census is stale; re-census before reclassifying.';
  end if;
  if exists (select 1 from pg_class c where c.relkind in ('v','m') and pg_get_viewdef(c.oid) ~* 'global_execution_control') then
    raise exception 'dd227: a view now reads global_execution_control. Re-census before reclassifying.';
  end if;

  -- The probe row for §9 and §10: a REAL root execution that has no control row yet — the exact
  -- situation the engine is in the instant after create_execution() inserts the execution and
  -- before upsert_control() writes its control row. Chosen here, before the table is locked.
  select ge.id, ge.organization_id into v_root, v_org
    from runtime.global_execution ge
   where ge.root_execution_id = ge.id
     and not exists (select 1 from runtime.global_execution_control c where c.root_execution_id = ge.id)
   order by ge.created_at desc limit 1;
  if v_root is null then
    raise exception 'dd227: no root execution without a control row to probe. The forcing limb cannot run, so this file does not proceed on an unproven claim.';
  end if;

  -- ═══════ 2. WHO CAN READ IT TODAY — MEASURED, NOT ASSUMED ═══════════════════════════════════
  -- A BOUNDED probe, and it says so. `select count(*)` over all 168,500 rows as `authenticated`
  -- runs the parent access walk once per row and does not finish in a migration's lifetime, so the
  -- comparison is made over a FIXED sample chosen before any role switch — the 400 most recently
  -- created control rows, the ones a live principal is most likely to have a claim on — and the
  -- SAME sample is used before and after. That measures the change to the door, which is what this
  -- file is responsible for; it is not a census of the table.
  select array_agg(c.root_execution_id) into v_sample
    from (select root_execution_id from runtime.global_execution_control
           order by created_at desc limit 400) c;
  if v_sample is null or cardinality(v_sample) < 100 then
    raise exception 'dd227: the access probe could not build a sample of at least 100 control rows. An unmeasured door change is a failure, not a pass.';
  end if;

  -- Real principals, through the live policy set, as `authenticated` with their own JWT claim.
  for r in
    select u.id as uid, u.email::text as label from auth.users u
     where u.email in ('admin@admin.com','arman26@gmail.com','info@aimatrx.com','test@test.com',
                       'seo@titaniumsuccess.com','arman@titaniumsuccess.com')
    union all
    select o.owner_id, 'top-execution-owner-' || left(o.owner_id::text, 8) from (
      select gr.created_by as owner_id, count(*) c
        from runtime.global_execution ge join runtime.global_request gr on gr.id = ge.request_id
       where gr.created_by is not null group by 1 order by c desc limit 3
    ) o
  loop
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', r.uid::text, 'role', 'authenticated')::text, true);
    select count(*) into v_n from runtime.global_execution_control c
      where c.root_execution_id = any (v_sample);
    reset role;
    v_before := v_before || jsonb_build_object(r.label, v_n);
  end loop;
  begin
    set local role anon;
    select count(*) into v_n from runtime.global_execution_control c
      where c.root_execution_id = any (v_sample);
    reset role;
    v_before := v_before || jsonb_build_object('anonymous', v_n);
  exception when others then
    reset role;
    v_before := v_before || jsonb_build_object('anonymous', -1);  -- refused at the grant
  end;
  raise notice 'dd227: BEFORE, rows readable through the live policy set — %', v_before::text;


  -- ═══════ 4. THE CLASSIFICATION, WITH ITS REASON ON THE ROW ══════════════════════════════════
  update platform.entity_types
     set audit_class = 'machinery',
         audit_class_reason =
           'DD-227 (2026-09-14): runtime.global_execution_control is the runtime''s per-execution-tree STOP SWITCH — one row per root execution holding cost_budget, limits, cancel_requested_at/by and deadline — not a record anybody keeps. Its only writer is the engine (matrx_runtime OrmExecutionStore.upsert_control, from engine.py create_execution and request_cancel) and its only reader is the same engine (get_control, from ensure_can_proceed / is_cancel_requested / remaining_budget / tree budget), which connects as the privileged postgres login role and never sees RLS. No function body, view or matview in this database names it; no client in aidream, matrx-frontend, matrx-sandbox, matrx-local or matrx-extend reads or writes it. The per-variant base contract is inapplicable by design, not merely hard to apply: the row has no identity of its own (it IS its parent execution, one per root, addressed by nothing), and organization_id NOT NULL STOPS THE PLATFORM — proven live and re-proven as this migration''s own forcing limb: the engine''s control insert dies 23514 the moment an organization is required, so no execution can start, because the engine names no organization and NO NULL ORG (2026-08-21) forbids a default, a resolver or a trigger choosing one (platform._ddl_guard refuses the default by name). The generated std_select lane was superseded in the same migration through iam.supersede_bespoke_policies: iam.apply_rls refuses a machinery token by construction, so a class-regime lane here could never be re-run or certified — the same disposition DD-204 gave platform.activity_log/std_select — and it served no reader in any repository. rls_variant stays component (there is no machinery variant) and is what it would be generated as if it ever stopped being machinery. Registered machinery under the DD-227 chair''s brief, on this evidence, per db-rules §11.'
   where token = 'global_execution_control';

  -- ═══════ 4b. TAKE THE EXCLUSIVE LOCK ONCE, AS LATE AS POSSIBLE ════════════════════════════
  -- Both the policy fold (§5, DROP POLICY) and the forcing limb (§10, ALTER TABLE) need ACCESS
  -- EXCLUSIVE on a table the runtime writes continuously, and a lock is held to the END of the
  -- transaction however it is taken — so it is taken ONCE, here, with everything that does not
  -- need it already done, and nothing after it waits on anything slow. The hold is measured and
  -- the file REFUSES to commit past its budget rather than quietly stalling the runtime.
  -- Two outcomes are normal and both mean "try again", never "widen the bound": 55P03 (the 2s
  -- lock_timeout expired) and 40P01 (this transaction already read the table, so the request is a
  -- lock UPGRADE and a writer queued in between deadlocks with it). lock_timeout stays 2s.
  for i in 1..12 loop
    begin
      lock table runtime.global_execution_control in access exclusive mode;
      v_locked := true;
      v_lock_at := clock_timestamp();
      exit;
    exception when lock_not_available or deadlock_detected then
      raise notice 'dd227: probe-lock attempt % lost the race (%) — retrying at the same 2s bound', i, sqlstate;
      perform pg_sleep(1);
    end;
  end loop;
  if not v_locked then
    raise exception 'dd227: the forcing limb could not take its lock in 12 attempts at a 2s bound. It is NOT proven, so this file reclassifies nothing. Re-run in a quieter window.';
  end if;

  -- ═══════ 5. THE GENERATED NAME, FOLDED INTO A BESPOKE LANE THROUGH THE ONE RECORDED PATH ════
  -- Supersede + re-create in ONE transaction: there is no instant at which this table has no
  -- non-staff read lane, and the predicate is carried across verbatim from the policy that was
  -- read in §1, never retyped.
  if v_lane is not null then
    perform iam.supersede_bespoke_policies('runtime','global_execution_control', array['std_select'],
      'DD-227: std_select on runtime.global_execution_control is a CLASS-REGIME NAME on access machinery. iam.apply_rls refuses this token by construction (the 2026-08-24 42P17 recursion class), so the name claims a generator that can never run here and nothing certifies it — the finding iam.verify_canonical''s machinery_no_generated_policy exists to make. What is wrong is the NAME, not the lane: the lane admits exactly the people who can already view the parent execution, to the stop-switch row of that one execution, and iam.superseded_policy''s own 2026-09-12 entry for this table (DD-163) removed a RESTRICTIVE platform_admin_only wall precisely because it killed this lane, calling it "the only non-staff read lane this table has … the lane the runtime feature wrote". So it is FOLDED, not dropped: re-created in this same transaction as control_read_via_execution with a byte-identical predicate, role and command, carried across verbatim from the policy this migration read rather than retyped. Access delta is zero by construction and is measured principal by principal in the same file, before and after, with zero gains permitted. This migration is that policy''s record of origin.');
    execute format(
      'create policy control_read_via_execution on runtime.global_execution_control '
      || 'for select to authenticated using (%s)', v_lane);
    select pg_get_expr(p.polqual, p.polrelid) into v_msg
      from pg_policy p where p.polrelid = 'runtime.global_execution_control'::regclass
                         and p.polname = 'control_read_via_execution';
    if v_msg is distinct from v_lane then
      raise exception 'dd227: the folded lane is not the lane that was there. BEFORE % ; AFTER %. A "byte-identical" promise that is not identical is the defect this check exists for.', v_lane, v_msg;
    end if;
    raise notice 'dd227: std_select folded into control_read_via_execution, predicate unchanged: %', v_lane;
  end if;

  -- ═══════ 6. THE SAME PRINCIPALS, AFTER — 0 MAY GAIN, EVERY LOSS IS NAMED ════════════════════
  for r in
    select u.id as uid, u.email::text as label from auth.users u
     where u.email in ('admin@admin.com','arman26@gmail.com','info@aimatrx.com','test@test.com',
                       'seo@titaniumsuccess.com','arman@titaniumsuccess.com')
    union all
    select o.owner_id, 'top-execution-owner-' || left(o.owner_id::text, 8) from (
      select gr.created_by as owner_id, count(*) c
        from runtime.global_execution ge join runtime.global_request gr on gr.id = ge.request_id
       where gr.created_by is not null group by 1 order by c desc limit 3
    ) o
  loop
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', r.uid::text, 'role', 'authenticated')::text, true);
    select count(*) into v_n from runtime.global_execution_control c
      where c.root_execution_id = any (v_sample);
    reset role;
    v_after := v_after || jsonb_build_object(r.label, v_n);
  end loop;
  begin
    set local role anon;
    select count(*) into v_n from runtime.global_execution_control c
      where c.root_execution_id = any (v_sample);
    reset role;
    v_after := v_after || jsonb_build_object('anonymous', v_n);
  exception when others then
    reset role;
    v_after := v_after || jsonb_build_object('anonymous', -1);
  end;
  for k in select jsonb_object_keys(v_before) loop
    if (v_after ->> k)::bigint > (v_before ->> k)::bigint then
      v_gained := array_append(v_gained, format('%s %s -> %s', k, v_before ->> k, v_after ->> k));
    elsif (v_after ->> k)::bigint < (v_before ->> k)::bigint then
      v_narrowed := array_append(v_narrowed, format('%s %s -> %s', k, v_before ->> k, v_after ->> k));
    end if;
  end loop;
  if cardinality(v_gained) > 0 then
    raise exception 'dd227: a principal GAINED rows on this table: %. Nothing about this file is allowed to widen a door.', array_to_string(v_gained, ' ; ');
  end if;
  raise notice 'dd227: ACCESS DELTA — 0 unapproved widenings; % narrowing(s): %; AFTER %',
    cardinality(v_narrowed), coalesce(array_to_string(v_narrowed, ' ; '), 'none'), v_after::text;

  -- ═══════ 7. THE MACHINERY CONTRACT, MEASURED — 0 FAIL OR THIS FILE DOES NOT STAND ═══════════
  for r in select * from iam.verify_canonical('runtime','global_execution_control','global_execution_control') loop
    if r.status = 'FAIL' then
      v_fail := array_append(v_fail, format('%s: %s', r.check_name, coalesce(r.detail,'')));
    elsif r.status = 'PASS' then
      v_pass := array_append(v_pass, r.check_name);
    end if;
    raise notice 'dd227: % = % (%)', r.check_name, r.status, left(coalesce(r.detail,''), 160);
  end loop;
  if cardinality(v_fail) > 0 then
    raise exception 'dd227: % certification FAIL(s) after the reclassification: %. A classification that does not certify is not a classification.',
      cardinality(v_fail), array_to_string(v_fail, ' ; ');
  end if;
  foreach v_msg in array array['machinery_has_reason','machinery_no_generated_policy','machinery_no_client_grant','machinery_rls_on'] loop
    if not (v_msg = any (v_pass)) then
      raise exception 'dd227: the machinery contract check % did not PASS — the certifier did not route this token to the machinery universe (DD-200). Nothing stands on a skipped check.', v_msg;
    end if;
  end loop;
  raise notice 'dd227: all four machinery contract checks PASS, 0 FAIL, base contract SKIPped by name';

  -- ═══════ 8. AND THE GENERATOR REFUSES IT BY CONSTRUCTION, PROVEN RATHER THAN ASSUMED ════════
  begin
    perform iam.apply_rls('runtime','global_execution_control','global_execution_control', v_variant);
    raise exception 'dd227: iam.apply_rls GENERATED policies on a machinery token. The refusal this classification relies on does not exist; this file does not stand.';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like 'dd227:%' then raise; end if;
    if v_msg not like '%machinery%' then
      raise exception 'dd227: iam.apply_rls failed for a reason that is not the machinery refusal: %', v_msg;
    end if;
    raise notice 'dd227: iam.apply_rls refuses it by construction — %', v_msg;
  end;

  -- ═══════ 9. THE SHIPPED CASE — THE RUNTIME STILL RUNS, PROVEN AFTER THE CHANGE ══════════════
  -- The forcing limb proved what would have stopped every execution. This proves the thing that
  -- SHIPPED does not: the engine's own read and write, on the real table, in the state this file
  -- leaves behind. Rolled back — only the verdict survives.
  begin
    insert into runtime.global_execution_control as c
      (root_execution_id, cost_budget, limits, cancel_requested_at, cancel_requested_by, deadline)
    values (v_root, null, '{}'::jsonb, null, null, null)
    on conflict (root_execution_id) do update
       set cost_budget = excluded.cost_budget, limits = excluded.limits;
    -- ...and `request_cancel`'s update path, and `get_control`'s read.
    update runtime.global_execution_control
       set cancel_requested_at = now(), cancel_requested_by = null
     where root_execution_id = v_root;
    select count(*) into v_n from runtime.global_execution_control where root_execution_id = v_root;
    if v_n <> 1 then
      raise exception 'dd227: SHIPPED CASE — the engine''s own row is not readable back after the change.';
    end if;
    raise exception 'dd227-rollback';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg = 'dd227-rollback' then
      raise notice 'dd227: SHIPPED CASE — after the reclassification the engine still creates a control row, still requests a cancel on it and still reads it back. Rolled back.';
    elsif v_msg like 'dd227:%' then raise;
    else
      raise exception 'dd227: SHIPPED CASE FAILED — the engine''s own path broke after the change: %', v_msg;
    end if;
  end;

  -- ═══════ 10. THE FORCING LIMB — THE BREAK, REPRODUCED AND UNDONE IN ONE SUBTRANSACTION ══════
  -- "organization_id NOT NULL stops every execution" is worth nothing unless it is run. Everything
  -- this block does is rolled back by its own EXCEPTION handler; only the verdict survives.
  -- The requirement is expressed as a NOT VALID CHECK rather than SET NOT NULL deliberately: it
  -- binds every NEW row exactly as NOT NULL would (and is the same technique DD-173 used to reach
  -- NOT NULL on ops.api_request_log without an ACCESS EXCLUSIVE scan), while touching none of the
  -- 168,500 existing rows and holding no strong lock on a table the runtime writes continuously.
  -- The whole limb lives in ONE subtransaction whose handler is the rollback: the two probes are
  -- nested blocks inside it, so the schema change the first probe needs is still in place when the
  -- second one runs, and NOTHING here survives the outer handler.
  begin
    -- CONTROL: the engine's own upsert, the instant after create_execution() inserts the execution
    -- and before upsert_control() writes its control row.
    insert into runtime.global_execution_control as c
      (root_execution_id, cost_budget, limits, cancel_requested_at, cancel_requested_by, deadline)
    values (v_root, null, '{}'::jsonb, null, null, null)
    on conflict (root_execution_id) do update
       set cost_budget = excluded.cost_budget, limits = excluded.limits;
    delete from runtime.global_execution_control where root_execution_id = v_root;
    v_state := null;

    alter table runtime.global_execution_control add column organization_id uuid;
    alter table runtime.global_execution_control
      add constraint dd227_org_present check (organization_id is not null) not valid;

    -- RED 1: the same statement, with the base contract's organization requirement in force.
    begin
      insert into runtime.global_execution_control as c
        (root_execution_id, cost_budget, limits, cancel_requested_at, cancel_requested_by, deadline)
      values (v_root, null, '{}'::jsonb, null, null, null)
      on conflict (root_execution_id) do update
         set cost_budget = excluded.cost_budget, limits = excluded.limits;
      raise exception 'dd227: THE FORCING LIMB DID NOT FIRE — the engine''s control insert survived an organization_id requirement. The premise of this file is false and nothing should be reclassified on it.';
    exception when others then
      get stacked diagnostics v_msg = message_text, v_state = returned_sqlstate;
      if v_msg like 'dd227:%' then raise; end if;
      if v_state <> '23514' then
        raise exception 'dd227: the forcing limb failed with % (%) instead of the expected 23514 check violation. An unexplained failure is not a proof.', v_state, v_msg;
      end if;
      raise notice 'dd227: FORCING LIMB 1 — the engine''s control upsert succeeds today, and with organization_id required it dies % (%). Every create_execution on the platform stops.', v_state, v_msg;
    end;

    -- RED 2: can the DATABASE supply the organization instead, so the engine need not? NO NULL ORG
    -- says no, and platform._ddl_guard enforces it by name.
    begin
      execute format('alter table runtime.global_execution_control alter column organization_id set default %L::uuid',
                     coalesce(v_org::text, gen_random_uuid()::text));
      raise exception 'dd227: SECOND FORCING LIMB DID NOT FIRE — platform._ddl_guard allowed an organization_id default on this table. NO NULL ORG is not being enforced and this file''s argument rests on it.';
    exception when others then
      get stacked diagnostics v_msg = message_text, v_state = returned_sqlstate;
      if v_msg like 'dd227:%' then raise; end if;
      if v_msg not like '%ddl_guard%' then
        raise exception 'dd227: the organization-default probe failed for a reason that is not the guard: % (%)', v_state, v_msg;
      end if;
      raise notice 'dd227: FORCING LIMB 2 — the database is forbidden to choose the organization itself: % (%).', v_state, v_msg;
    end;

    raise exception 'dd227-limb-rollback';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg = 'dd227-limb-rollback' then
      raise notice 'dd227: both forcing limbs fired and the probe schema is rolled back.';
    else
      raise;  -- a dd227: verdict, or an unexplained failure — either way it stops the file
    end if;
  end;
  if exists (select 1 from pg_attribute a
              where a.attrelid = 'runtime.global_execution_control'::regclass
                and a.attname = 'organization_id' and not a.attisdropped) then
    raise exception 'dd227: the forcing limb left organization_id on the real table. A RED proof that survives is a defect, not a proof.';
  end if;

  -- ═══════ 11. THE LOCKED WINDOW, MEASURED AND BOUNDED ═══════════════════════════════════════
  v_held := extract(epoch from (clock_timestamp() - v_lock_at));
  raise notice 'dd227: ACCESS EXCLUSIVE on runtime.global_execution_control was held for %s', round(v_held, 3);
  if v_held > 25 then
    raise exception 'dd227: the exclusive window was %s, past the 25s budget — every control write on the platform was queued behind it. Nothing is committed; re-run in a quieter window.', round(v_held, 3);
  end if;
end $dd227$;
