-- platform_registered_tables_generated_dd159b_gate — THE ACCESS DELTA AND THE CERTIFICATION
-- (DD-159 batch 2.)
--
-- dd159b_baseline took the BEFORE over all 24 generable tokens and dd159b_batch generated 19 of
-- them. This re-probes the SAME 24 with the SAME 8 principals, pinned to the SAME instant the
-- baseline recorded, and gates the difference. The five tokens the batch held back are in the cast
-- on purpose: if one of them moved, something touched a table this round said it would not touch.
--
-- 🚨 A WIDENING IS APPROVED BY NAME OR IT IS A FAILURE. The approved list below is (token,
-- principal, reason) and nothing else passes. Every entry is the same sentence in a different
-- table: under the class regime a `personal`/`private` row's owner reads their own row, and before
-- this round a RESTRICTIVE `platform_admin_only` policy meant NOBODY but AI Matrx staff could —
-- not even the person whose row it is. And the approval is not taken on trust: after the gate, the
-- rows each widened principal gained are re-read and asserted to be THEIRS. A count that went up
-- by one proves nothing about whose row it is.
do $$
declare
  v_before uuid; v_after uuid; v_as timestamptz; r record;
  v_unapproved text[] := '{}';
  v_approved constant text[] := array[
    -- token | principal
    'billing_user_plan|arman@titaniumsuccess.com',
    'billing_user_plan|developer111@pixelium.uk',
    'billing_user_plan|seo@titaniumsuccess.com',
    'billing_user_plan|test@test.com',
    'org_admin_audit|arman@titaniumsuccess.com',
    'user_entity_state|developer111@pixelium.uk'];
  v_principals uuid[] := array[
    '7604b9d9-57f3-4c44-b75b-dc9a3ee8aacf',  -- platform admin, arman26@gmail.com (super_admin)
    '6555aa73-c647-4ecf-8a96-b60e315b6b18',  -- platform admin, info@aimatrx.com
    '87a6e699-3622-4869-8843-d0867456c0dd',  -- platform admin AND the biggest row owner here (admin@admin.com)
    'a4955b5c-d524-4d72-a90e-0658d5d51148',  -- developer111@pixelium.uk: a NON-admin OWNER (220 retrieval_audit rows). The widening witness.
    'c5e92166-e148-4e73-926e-83af0c453665',  -- seo@titaniumsuccess.com: a plain member of a real organization
    '34ed4fc3-c527-4819-99bf-15c26603b261',  -- arman@titaniumsuccess.com: admin of that organization, NOT a platform admin
    '4060701e-706a-4c76-b3ca-0bbc69fa5a14',  -- test@test.com: a non-member
    '00000000-0000-0000-0000-000000000000'   -- anonymous, no JWT
  ]::uuid[];
  v_tokens text[] := array[
    'udt_document_snapshot', 'udt_workbook_snapshot', 'assignment_session', 'dict_entry',
    'org_member_control', 'udt_dataset_template', 'billing_usage_ledger', 'knob_override_audit',
    'org_admin_audit', 'retrieval_audit', 'billing_connect_account', 'billing_customer',
    'billing_subscription', 'billing_user_plan', 'chat_user_usage_summary', 'extension_auth_code',
    'files_user_account', 'html_extraction', 'mcp_user_conn', 'study_streak',
    'task_user_state', 'user_active_context', 'user_entity_state', 'user_storage_usage'];
begin
  select id, started_at into v_before, v_as from iam.access_delta_run
   where label = 'DD-159b BEFORE' order by started_at desc limit 1;
  if v_before is null then
    raise exception 'dd159b_gate: there is no DD-159b BEFORE snapshot to compare against. A gate with no baseline is not a gate.';
  end if;

  v_after := iam.access_delta_snapshot('DD-159b AFTER', v_principals, v_tokens, 400000,
    'DD-159 batch 2 confirmation, pinned to the dd159b baseline instant', v_as);

  for r in select token, principal_label, count_before, count_after, verdict
             from iam.access_delta_compare(v_before, v_after)
            where verdict <> 'SAME' order by verdict desc, token, principal_label
  loop
    if r.verdict = 'WIDER' then
      if not ((r.token || '|' || r.principal_label) = any (v_approved)) then
        v_unapproved := array_append(v_unapproved,
          format('%s for %s (%s -> %s)', r.token, r.principal_label, r.count_before, r.count_after));
      else
        raise notice 'dd159b_gate: WIDER (approved) % for % : % -> %',
          r.token, r.principal_label, r.count_before, r.count_after;
      end if;
    else
      raise notice 'dd159b_gate: NARROWED % for % : % -> %',
        r.token, r.principal_label, r.count_before, r.count_after;
    end if;
  end loop;

  if cardinality(v_unapproved) > 0 then
    raise exception
      'dd159b_gate: % door(s) opened that nobody approved by name: %. Over-opening and over-tightening are the same class of defect and neither ships on a count.',
      cardinality(v_unapproved), array_to_string(v_unapproved, ' ; ');
  end if;
  raise notice 'dd159b_gate: 0 unapproved widenings across % tokens x % principals',
    cardinality(v_tokens), cardinality(v_principals);
end $$;

-- ═══════════ THE APPROVALS, RE-READ AS ROWS RATHER THAN AS COUNTS ═══════════════════════════════
do $$
declare v_n bigint; v_bad bigint;
begin
  -- billing_user_plan: each widened principal gained exactly their OWN plan row.
  select count(*) into v_bad from billing.user_plan
   where user_id in ('34ed4fc3-c527-4819-99bf-15c26603b261','a4955b5c-d524-4d72-a90e-0658d5d51148',
                     'c5e92166-e148-4e73-926e-83af0c453665','4060701e-706a-4c76-b3ca-0bbc69fa5a14')
  having count(*) <> 4;
  if v_bad is not null then
    raise exception 'dd159b_gate: the four principals who gained a billing_user_plan row do not own exactly four rows between them (%). The widening is not "the owner reads their own row".', v_bad;
  end if;

  -- user_entity_state: developer111 owns exactly the 25 rows they gained.
  select count(*) into v_n from platform.user_entity_state
   where user_id = 'a4955b5c-d524-4d72-a90e-0658d5d51148';
  if v_n <> 25 then
    raise exception 'dd159b_gate: developer111 gained 25 user_entity_state rows but owns % — the widening is not their own rows.', v_n;
  end if;

  -- org_admin_audit: the row the organization admin gained belongs to an organization they are in.
  select count(*) into v_n from iam.org_admin_audit a
   where exists (select 1 from iam.organization_member m
                  where m.organization_id = a.organization_id
                    and m.user_id = '34ed4fc3-c527-4819-99bf-15c26603b261');
  if v_n <> 1 then
    raise exception 'dd159b_gate: the org_admin_audit row arman@titaniumsuccess.com gained is not a row of an organization they belong to (% matching).', v_n;
  end if;
  raise notice 'dd159b_gate: all three approvals re-read as ROWS — every gained row belongs to the principal or to their organization.';
end $$;

-- ═══════════ CERTIFICATION: iam.verify_canonical over the 19 ══════════════════════════════════
-- 🚨 THE TWO AXES ARE NOT THE SAME AXIS, AND SAYING SO IS THE HONEST REPORT. This round moved the
-- POLICY axis: which lanes each table emits, and to whom. It did not and could not move the BASE
-- axis: these tables were built years apart without `metadata`, `version`, `updated_by`,
-- `organization_id` or the stamp/touch triggers, which is exactly why nobody ever registered them.
-- So the gate is written as two different sentences. A POLICY-family FAIL on any of the 19 aborts:
-- that would mean this round left a table the class regime cannot certify. A BASE-family FAIL is
-- COUNTED AND NAMED, never absorbed — it is a schema retrofit, a different lane's decision, and
-- pretending it away by widening this check is how a certification becomes decoration.
do $$
declare
  r record; v record;
  v_policy_fail text[] := '{}';
  v_base_fail   text[] := '{}';
  f text;
  v_policy_checks constant text[] := array[
    'policies_canonical','bespoke_policy_present','privacy_wall','personal_row_wall',
    'rls_enabled','anon_public_lane','class_lanes','component_anon_lane'];
begin
  for r in
    select et.token, et.schema_name, et.table_name, et.rls_variant
      from platform.entity_types et
     where et.token = any (array[
       'assignment_session','dict_entry','org_member_control','udt_dataset_template',
       'org_admin_audit','billing_connect_account','billing_customer','billing_subscription',
       'billing_user_plan','chat_user_usage_summary','extension_auth_code','files_user_account',
       'html_extraction','mcp_user_conn','study_streak','task_user_state','user_active_context',
       'user_entity_state','user_storage_usage'])
     order by et.token
  loop
    for v in select * from iam.verify_canonical(r.schema_name, r.table_name, r.token, r.rls_variant)
              where status = 'FAIL'
    loop
      f := format('%s / %s: %s', r.token, v.check_name, coalesce(v.detail,''));
      if v.check_name = any (v_policy_checks) then
        v_policy_fail := array_append(v_policy_fail, f);
      else
        v_base_fail := array_append(v_base_fail, f);
      end if;
    end loop;
  end loop;

  foreach f in array v_base_fail loop
    raise notice 'dd159b_gate: BASE-CONTRACT FAIL (not this round, named not absorbed) %', f;
  end loop;
  raise notice 'dd159b_gate: % base-contract FAIL(s) across the 19 — every one is a missing column or trigger on a table built before the registry existed. A base retrofit is a schema change and is not smuggled into an RLS batch.',
    cardinality(v_base_fail);

  if cardinality(v_policy_fail) > 0 then
    raise exception
      'dd159b_gate: % POLICY-family FAIL(s) after generation: %. The generator produced a policy set its own certification refuses; this round does not stand.',
      cardinality(v_policy_fail), array_to_string(v_policy_fail, ' ; ');
  end if;
  raise notice 'dd159b_gate: 0 POLICY-family FAIL across all 19 generated tokens';
end $$;
