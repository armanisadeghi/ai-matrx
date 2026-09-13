-- iam_system_org_arm_regen_dd185_batch2 — DD-185 REGENERATION BATCH 2 OF 5 (15 tokens).
--
-- `iam_system_org_arm_follows_the_class_dd185.sql` changed what the resolvers ANSWER and what the
-- generator EMITS. A live policy is TEXT, written at generation time, so until a token is
-- regenerated its std_select still carries the every-signed-in-user §6e arm and the new
-- `iam.verify_canonical` check `system_org_arm_respects_class` FAILs on it. This file pays that
-- for 15 of the 74 tokens the check named.
--
-- 🚨 NARROWING IS THE POINT OF THIS FILE, AND IT IS STILL MEASURED. Every token here resolves to
-- class `confidential`, which has an organization-member lane and NO every-signed-in-user lane.
-- A principal who loses rows here was reading rows of a CONFIDENTIAL table that belong to the
-- global-readable system organization, by virtue of having an account. The gate still runs in
-- full: a WIDENING is a failure unless named, and every narrowing is printed by token and
-- principal so the report can list them rather than summarise them.
--
-- 🚨 A PRE-EXISTING verify_canonical FAIL IS NOT THIS FILE'S TO ABSORB OR TO BE BLAMED FOR.
-- These tokens are already generated and carry whatever findings they carry (bespoke policies,
-- base-contract gaps from other lanes). So the certification here is a DELTA: the FAIL set is
-- collected before and after, a FAIL that appears is this file's and aborts it, and
-- `system_org_arm_respects_class` must go FAIL -> PASS on every token or the batch does not stand.
--
-- 🚨 THE TWO TOKENS THAT ACTUALLY EXPOSED ROWS ARE IN THIS BATCH, AND THEIR NARROWINGS ARE NAMED
-- HERE RATHER THAN COUNTED. Rehearsed against the live database before applying:
--   hr_earning_code   (hr.earning_code, 24 rows owned by the global-readable system org)
--       arman26@gmail.com 24 -> 0 · info@aimatrx.com 24 -> 0 · developer111@pixelium.uk 24 -> 0
--       seo@titaniumsuccess.com 24 -> 0 · arman@titaniumsuccess.com 24 -> 0 · test@test.com 24 -> 0
--       admin@admin.com 108 -> 84 (they keep the 84 rows that are theirs)
--   hr_auto_close_rule (hr.auto_close_rule, 2 rows owned by the same organization)
--       every one of the seven signed-in principals 2 -> 0
-- test@test.com is a member of NO organization and has no staff role: those 26 rows were readable
-- because the account exists. That is the DD-185 leak, and removing it is this file's purpose.
-- Both tables keep `svc_all`, so every server-side reader is untouched.
--
-- Nothing here changes a schema, a grant or a registry row. It re-emits policies from the fixed
-- generator.
set local lock_timeout = '10s';

do $dd185b2$
declare
  v_as       timestamptz := now();
  v_before   uuid; v_after uuid; r record;
  v_unapproved text[] := '{}';
  v_hard      text[] := '{}';
  v_narrower  text[] := '{}';
  v_newfail   text[] := '{}';
  v_stillred  text[] := '{}';
  v_total     bigint;
  v_pre       jsonb := '{}'::jsonb;
  v_post      text[];
  v_principals uuid[] := array[
    '7604b9d9-57f3-4c44-b75b-dc9a3ee8aacf',  -- platform admin, arman26@gmail.com (super_admin)
    '6555aa73-c647-4ecf-8a96-b60e315b6b18',  -- platform admin, info@aimatrx.com
    '87a6e699-3622-4869-8843-d0867456c0dd',  -- platform admin, admin@admin.com (the testing identity)
    'a4955b5c-d524-4d72-a90e-0658d5d51148',  -- developer111@pixelium.uk: a NON-admin with real rows elsewhere
    'c5e92166-e148-4e73-926e-83af0c453665',  -- seo@titaniumsuccess.com: a plain member of a real organization
    '34ed4fc3-c527-4819-99bf-15c26603b261',  -- arman@titaniumsuccess.com: admin of that organization, NOT platform staff
    '4060701e-706a-4c76-b3ca-0bbc69fa5a14',  -- test@test.com: a non-member
    '00000000-0000-0000-0000-000000000000'   -- anonymous, no JWT
  ]::uuid[];
  v_tokens text[] := array['hr_approval_authority','hr_approval_delegation','hr_asset','hr_auto_close_rule','hr_calculation_snapshot','hr_candidate','hr_checklist_template','hr_course','hr_crew','hr_deduction_code','hr_department','hr_derived_grant','hr_disposition_event','hr_earning_code','hr_employee'];
  -- A WIDENING IS APPROVED BY NAME OR IT IS A FAILURE. 'token|principal'.
  v_approved constant text[] := '{}';
begin
  -- ═══════ 1. THE FAIL SET BEFORE, per token ═══════════════════════════════════════════════════
  for r in select et.token, et.schema_name, et.table_name, et.rls_variant
             from platform.entity_types et where et.token = any (v_tokens) and et.is_active order by et.token
  loop
    v_pre := v_pre || jsonb_build_object(r.token,
      (select coalesce(jsonb_agg(c.check_name order by c.check_name), '[]'::jsonb)
         from iam.verify_canonical(r.schema_name, r.table_name, r.token, r.rls_variant) c
        where c.status = 'FAIL'));
    if not (v_pre -> r.token ? 'system_org_arm_respects_class') then
      raise exception 'dd185b2: % does not FAIL system_org_arm_respects_class before this file runs. It is not in the RED set this batch was written against; re-census.', r.token;
    end if;
  end loop;

  -- ═══════ 2. THE BEFORE, pinned to this transaction's instant ═════════════════════════════════
  v_before := iam.access_delta_snapshot('DD-185 b2 BEFORE', v_principals, v_tokens, 400000,
    'DD-185 batch 2: confidential tokens carrying the every-signed-in-user system-org arm, before regeneration', v_as);

  -- ═══════ 3. REGENERATE through the one path ══════════════════════════════════════════════════
  for r in select et.token, et.schema_name, et.table_name, et.rls_variant
             from platform.entity_types et where et.token = any (v_tokens) and et.is_active order by et.token
  loop
    perform iam.apply_rls(r.schema_name, r.table_name, r.token, r.rls_variant);
  end loop;

  -- ═══════ 4. THE GATE — same probe, same instant, same cast ═══════════════════════════════════
  v_after := iam.access_delta_snapshot('DD-185 b2 AFTER', v_principals, v_tokens, 400000,
    'DD-185 batch 2 confirmation, pinned to the same instant as the baseline', v_as);
  for r in select c.token, c.principal_label, c.count_before, c.count_after, c.verdict,
                  et.schema_name, et.table_name
             from iam.access_delta_compare(v_before, v_after) c
             join platform.entity_types et on et.token = c.token
            where c.verdict <> 'SAME' order by c.verdict, c.token, c.principal_label
  loop
    if r.verdict = 'WIDER' then
      if not ((r.token || '|' || r.principal_label) = any (v_approved)) then
        v_unapproved := array_append(v_unapproved,
          format('%s for %s (%s -> %s)', r.token, r.principal_label, r.count_before, r.count_after));
      else
        raise notice 'dd185b2: WIDER (approved by name) % for % : % -> %', r.token, r.principal_label, r.count_before, r.count_after;
      end if;
    elsif r.verdict = 'UNPROVEN' then
      -- UNPROVEN is not a pass. This file adds no column and changes no row, so the row-by-row
      -- comparison must be possible; if it is not, nobody can say which rows moved.
      execute format('select count(*) from %I.%I', r.schema_name, r.table_name) into v_total;
      v_hard := array_append(v_hard,
        format('UNPROVEN %s for %s (%s -> %s of %s rows) — nothing in this file changes a row or a column, so the probe could not compare for a reason nobody has established',
               r.token, r.principal_label, r.count_before, r.count_after, v_total));
    elsif r.verdict = 'UNMEASURED' then
      v_unapproved := array_append(v_unapproved,
        format('UNMEASURED %s for %s — the probe itself failed; a gate that could not read proves nothing', r.token, r.principal_label));
    else
      v_narrower := array_append(v_narrower,
        format('%s for %s (%s -> %s)', r.token, r.principal_label, r.count_before, r.count_after));
      raise notice 'dd185b2: NARROWED % for % : % -> %', r.token, r.principal_label, r.count_before, r.count_after;
    end if;
  end loop;
  if cardinality(v_hard) > 0 then
    raise exception 'dd185b2: % read(s) this gate could not prove either way: %', cardinality(v_hard), array_to_string(v_hard, ' ; ');
  end if;
  if cardinality(v_unapproved) > 0 then
    raise exception 'dd185b2: % door(s) opened that nobody approved by name: %. Over-opening and over-tightening are the same class of defect and neither ships on a count.',
      cardinality(v_unapproved), array_to_string(v_unapproved, ' ; ');
  end if;

  -- ═══════ 5. CERTIFICATION AS A DELTA ═════════════════════════════════════════════════════════
  for r in select et.token, et.schema_name, et.table_name, et.rls_variant
             from platform.entity_types et where et.token = any (v_tokens) and et.is_active order by et.token
  loop
    select coalesce(array_agg(c.check_name order by c.check_name), '{}') into v_post
      from iam.verify_canonical(r.schema_name, r.table_name, r.token, r.rls_variant) c
     where c.status = 'FAIL';
    if 'system_org_arm_respects_class' = any (v_post) then
      v_stillred := array_append(v_stillred, r.token);
    end if;
    v_newfail := v_newfail || array(
      select format('%s / %s', r.token, x) from unnest(v_post) x
       where not (v_pre -> r.token ? x));
  end loop;
  if cardinality(v_stillred) > 0 then
    raise exception 'dd185b2: % token(s) still FAIL system_org_arm_respects_class after regeneration: %. The generator did not remove the arm this batch exists to remove.',
      cardinality(v_stillred), array_to_string(v_stillred, ', ');
  end if;
  if cardinality(v_newfail) > 0 then
    raise exception 'dd185b2: % verify_canonical FAIL(s) that were NOT there before this file ran: %. A regeneration that introduces a finding does not stand.',
      cardinality(v_newfail), array_to_string(v_newfail, ' ; ');
  end if;
  raise notice 'dd185b2: 0 unapproved widenings, % narrowing(s), 0 new verify_canonical FAILs, % token(s) FAIL -> PASS on system_org_arm_respects_class',
    cardinality(v_narrower), cardinality(v_tokens);
end
$dd185b2$;
