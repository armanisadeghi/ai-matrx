-- HR domain C4 — migration 38 (register item HRB-008; the coordinator's ruling on the capability
-- question hr_c4_37 raised and deliberately did not answer).
--
-- 🚨 THE PUBLISH GATE WAS CHECKING SOMEBODY ELSE'S CAPABILITY.
--
-- `hr.wf_publish_definition` gated on `hr.capability(v_uid, 'workflow.cancel', …)`. Cancelling a
-- running request and rewriting the routing plan that decides WHO APPROVES WHAT are not the same
-- power, and hr_c4_37 built the door over that gate rather than changing it underneath the spec,
-- reporting it instead.
--
-- RULED (SPEC-ACCESS §1.4 + SPEC-WORKFLOW-ENGINE changelogs, 2026-08-28): the governing capability
-- is **`workflow.publish_definition`**, a SIXTH `workflow.*` capability, held by **hr_owner ONLY**.
-- Publishing a routing definition rewrites who approves what, which is `authority.grant`'s power
-- class; hr_admin is excluded on exactly the principle that already excludes it from
-- `workflow.record_result`.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. THE VOCABULARY IS THE ROLE ARRAY — THERE IS NO CAPABILITY CATALOGUE TO SEED. Measured live:
--    `workflow.record_result` exists in exactly TWO places in the entire database — `hr_owner`'s
--    `hr.access_role.capabilities` array, and the body of the function that checks it. There is no
--    `platform.categories` dimension for capability keys and no capability table. So "seed it into
--    the vocabulary" and "seed it into hr_owner's row" are the SAME act, and this migration does
--    exactly what the five existing keys did: append to the builtin `hr_owner` row in the system
--    catalogue, and to nothing else.
--
-- 2. 🚨 THIS NARROWS, DELIBERATELY. Before this migration any holder of `workflow.cancel` could
--    publish — that is hr_admin AND hr_owner. After it, only hr_owner can. An hr_admin who could
--    publish through the stand-in gate no longer can, and that is the ruling working rather than a
--    regression. Falsified in BOTH directions below, including the control that hr_admin STILL
--    holds `workflow.cancel` — so the refusal is the new capability doing its job, not a role that
--    went missing.
--
-- 3. THE HUMAN REFUSAL SENTENCE IS UNCHANGED, AS RULED. 🚨 OWED, AND REPORTED RATHER THAN FIXED
--    HERE: that sentence is *"publishing a routing definition needs HR administration standing"*,
--    and the person most likely to read it is now an hr_admin — who HAS HR administration standing
--    and will reasonably read the refusal as a bug. `hr._governance_refusal` has no slot for a
--    required-capability field: its `detail` IS the sentence, so naming the capability is not
--    possible without changing it. Left exactly as ruled; the wording is raised, not decided here.
--
-- 4. THE STALE COUNT CANNOT MISLEAD A REPLAY. `hr_c4_36`'s post-condition asserts
--    `count(*) = 15` workflow doors and would raise on re-apply now that `hr_c4_37` added a
--    sixteenth — a TRUE fact reported as a failure. The applied file is left alone (an applied
--    migration's checksum is ledgered), and instead `hr._wf_door_smoke()` — the live check every
--    migration's post-conditions already call — gains the PROPERTY form: no `public.hr_wf_*` door
--    may be `SECURITY INVOKER`, whatever the count. Anybody diagnosing a replay now has a true
--    statement standing next to the stale one.
--
-- Authority: the coordinator's ruling (2026-08-28); SPEC-ACCESS §1.4; SPEC-WORKFLOW-ENGINE.
-- Applied live as `hr_c4_38_publishing_routing_is_an_owner_power`. Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '120s';

do $$
declare v_bad integer;
begin
  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  perform set_config('matrx.hr_c4_38_conf_before', v_bad::text, true);
end $$;

-- ============================================================ 1. the sixth capability (RD 1, RD 2)
do $$
begin
  if exists (select 1 from hr.access_role
              where role_key = 'hr_owner' and deleted_at is null
                and organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
                and 'workflow.publish_definition' = any(capabilities)) then
    raise notice 'hr_c4_38: hr_owner already holds workflow.publish_definition';
  else
    perform hr.arm_write();
    update hr.access_role
       set capabilities = capabilities || array['workflow.publish_definition']
     where role_key = 'hr_owner' and deleted_at is null
       and organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid;
    raise notice 'hr_c4_38: workflow.publish_definition granted to hr_owner';
  end if;
  -- RD 2: hr_admin is EXCLUDED, on the principle that already excludes it from
  -- workflow.record_result. Asserted, not assumed — a later seed must not quietly widen it.
  if exists (select 1 from hr.access_role
              where role_key <> 'hr_owner' and deleted_at is null
                and 'workflow.publish_definition' = any(capabilities)) then
    raise exception 'hr_c4_38: a role other than hr_owner holds workflow.publish_definition';
  end if;
end $$;

-- ============================================================ 2. the gate reads it (RD 2, RD 3)
do $mig$
declare
  v_oid oid; v_def text;
  v_old constant text := $o$  if v_uid is not null and not hr.capability(v_uid, 'workflow.cancel', null, current_date, d.organization_id) then$o$;
  v_new constant text := $o$  -- 🚨 PUBLISHING ROUTING IS AN OWNER POWER, NOT AN ADMIN ONE. This read `workflow.cancel` — a
  -- stand-in that let anybody who could cancel a request also rewrite WHO APPROVES WHAT, which is
  -- authority.grant's power class. hr_admin is excluded here on the same principle that excludes it
  -- from workflow.record_result. The refusal SENTENCE is unchanged by ruling.
  if v_uid is not null and not hr.capability(v_uid, 'workflow.publish_definition', null, current_date, d.organization_id) then$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_publish_definition';
  v_def := pg_get_functiondef(v_oid);
  if position('workflow.publish_definition' in v_def) > 0 then
    raise notice 'hr_c4_38: the publish gate already reads its own capability';
  else
    if position(v_old in v_def) = 0 then
      raise exception 'hr_c4_38: hr.wf_publish_definition does not carry the expected gate — refusing to half-apply';
    end if;
    execute replace(v_def, v_old, v_new);
    raise notice 'hr_c4_38: the publish gate now reads workflow.publish_definition';
  end if;
end
$mig$;

-- ============================================================ 3. the live check gains the PROPERTY (RD 4)
do $mig$
declare
  v_oid oid; v_def text; v_new text;
  v_dec_old constant text := $o$declare v_org uuid; v_emp uuid; v_env jsonb;
begin
  select ra.organization_id, ra.employment_id into v_org, v_emp$o$;
  v_dec_new constant text := $o$declare v_org uuid; v_emp uuid; v_env jsonb; v_invoker text[];
begin
  -- 🚨 THE PROPERTY, NOT A COUNT. hr_c4_36's post-condition asserts `count(*) = 15` workflow doors
  -- and now raises on re-apply because hr_c4_37 added a sixteenth — a TRUE fact reported as a
  -- failure. An applied migration's checksum is ledgered, so that file is left alone; the standing
  -- guarantee lives here instead, where every migration's post-conditions already call it. What
  -- must hold is that NO door is SECURITY INVOKER, whatever the count.
  select coalesce(array_agg(p.proname order by p.proname), '{}')
    into v_invoker
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'hr\_wf\_%' and not p.prosecdef;
  if cardinality(v_invoker) > 0 then
    raise exception 'hr__wf_door_smoke: % workflow door(s) are SECURITY INVOKER: %',
      cardinality(v_invoker), array_to_string(v_invoker, ', ');
  end if;

  select ra.organization_id, ra.employment_id into v_org, v_emp$o$;
  v_ret_old constant text := $o$      return jsonb_build_object('ok', true, 'envelope_shape', 'well-formed');$o$;
  v_ret_new constant text := $o$      return jsonb_build_object('ok', true, 'envelope_shape', 'well-formed',
                                'doors_all_definer', true);$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_wf_door_smoke';
  v_def := pg_get_functiondef(v_oid);
  if position('doors_all_definer' in v_def) > 0 then
    raise notice 'hr_c4_38: the smoke test already carries the door-mode property';
  else
    if position(v_dec_old in v_def) = 0 or position(v_ret_old in v_def) = 0 then
      raise exception 'hr_c4_38: hr._wf_door_smoke does not carry the expected shape — refusing to half-apply';
    end if;
    v_new := replace(v_def, v_dec_old, v_dec_new);
    v_new := replace(v_new, v_ret_old, v_ret_new);
    execute v_new;
    raise notice 'hr_c4_38: hr._wf_door_smoke now asserts the door-mode PROPERTY';
  end if;
end
$mig$;

-- ============================================================ 4. the contract, updated
do $$
begin
  delete from hr.function_contract
   where schema_name = 'hr' and function_name = 'wf_publish_definition'
     and home_migration in ('hr_c4_37', 'hr_c4_38');
  insert into hr.function_contract (schema_name, function_name, home_migration,
                                    must_contain, must_not_contain, must_be_definer, reason)
  values ('hr', 'wf_publish_definition', 'hr_c4_38',
    array['auth.uid()', 'no_publish_authority', 'workflow.publish_definition'],
    array['''workflow.cancel'''], true,
    'hr_c4_38: THE GATE, and the capability it must read. Publishing a routing definition rewrites WHO APPROVES WHAT — authority.grant''s power class — so it is gated on workflow.publish_definition, held by hr_owner ONLY, on the same principle that excludes hr_admin from workflow.record_result. It previously read workflow.cancel, a stand-in that let any hr_admin republish routing; workflow.cancel is BANNED here so the stand-in cannot come back. Deleting the gate entirely leaves public.hr_wf_publish_definition running as the owner with nothing in front of it. Supersedes the hr_c4_37 row.');
end $$;

-- ============================================================ 5. post-conditions that EXECUTE
do $$
declare
  v_owner uuid; v_admin uuid; v_org uuid; v_bad integer; v_before integer; v_res jsonb;
begin
  -- RD 1: the capability is held by hr_owner and by nobody else
  if not exists (select 1 from hr.access_role
                  where role_key = 'hr_owner' and deleted_at is null
                    and 'workflow.publish_definition' = any(capabilities)) then
    raise exception 'hr_c4_38: hr_owner does not hold workflow.publish_definition';
  end if;

  -- RD 2: FALSIFIED BOTH WAYS, on real people, through the real predicate.
  select ra.organization_id, ra.employment_id into v_org, v_admin
    from hr.role_assignment ra where ra.role_key = 'hr_admin' and ra.is_active
      and ra.revoked_at is null limit 1;
  select e.login_user_id into v_owner
    from hr.role_assignment ra join hr.employment em on em.id = ra.employment_id
    join hr.employee e on e.id = em.employee_id
   where ra.role_key = 'hr_owner' and ra.is_active and ra.revoked_at is null
     and ra.organization_id = v_org and e.login_user_id is not null limit 1;
  select e.login_user_id into v_admin
    from hr.employment em join hr.employee e on e.id = em.employee_id where em.id = v_admin;

  if v_owner is not null then
    if not hr.capability(v_owner, 'workflow.publish_definition', null, current_date, v_org) then
      raise exception 'hr_c4_38: the HR OWNER cannot publish — the ruling grants exactly this';
    end if;
  end if;
  if v_admin is not null then
    if hr.capability(v_admin, 'workflow.publish_definition', null, current_date, v_org) then
      raise exception 'hr_c4_38: an hr_admin still holds workflow.publish_definition';
    end if;
    -- 🚨 THE CONTROL FOR THE NARROWING. hr_admin must STILL hold workflow.cancel, or the refusal
    -- above proves nothing except that a role went missing.
    if not hr.capability(v_admin, 'workflow.cancel', null, current_date, v_org) then
      raise exception 'hr_c4_38: the hr_admin lost workflow.cancel — the narrowing hit the wrong thing';
    end if;
  end if;

  -- RD 3: the gate reads the new key and the stand-in is gone
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'wf_publish_definition') !~ 'workflow\.publish_definition' then
    raise exception 'hr_c4_38: the gate does not read workflow.publish_definition';
  end if;
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'wf_publish_definition') ~ '''workflow\.cancel''' then
    raise exception 'hr_c4_38: the workflow.cancel stand-in is still in the gate';
  end if;
  -- RD 3: the human sentence is unchanged, as ruled
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'wf_publish_definition')
     !~ 'publishing a routing definition needs HR administration standing' then
    raise exception 'hr_c4_38: the ruled refusal sentence was changed';
  end if;

  -- RD 4: the live check now carries the PROPERTY, and it is EXECUTED
  v_res := hr._wf_door_smoke();
  if not coalesce((v_res ->> 'ok')::boolean, false)
     or coalesce((v_res ->> 'doors_all_definer')::boolean, false) is not true then
    raise exception 'hr_c4_38: the door smoke test failed or lost the property: %', v_res;
  end if;

  select coalesce(count(*), 0) into v_bad from hr.function_contracts_broken();
  if v_bad > 0 then
    raise exception 'hr_c4_38: % function contract(s) broken', v_bad;
  end if;
  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  v_before := current_setting('matrx.hr_c4_38_conf_before')::integer;
  if v_bad > v_before then
    raise exception 'hr_c4_38: hr conformance findings rose from % to %', v_before, v_bad;
  end if;
  raise notice 'hr_c4_38: publishing routing is an hr_owner power; the smoke test asserts the door-mode property';
end $$;
