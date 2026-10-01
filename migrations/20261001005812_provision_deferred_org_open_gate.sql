-- chair-step: changes the global provisioner certification boundary and unlocks the watched private-table creation sequence
-- based-on: platform.provision_certify_judged(text, text, text, boolean) 8fa104e150de69dcc9238cdefbc01ce537371bfb83d9168390fc096a34bb0f47
-- org_open_gate is installed by the same deferred access seal as every other policy.
-- It remains mandatory after attach; final certification is unchanged.
CREATE OR REPLACE FUNCTION platform.provision_certify_judged(p_schema text, p_table text, p_token text, p_defer_base boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_certify jsonb := '[]'::jsonb;
  v_refuse  jsonb := '[]'::jsonb;
  r         record;
begin
  -- THE ONE CERTIFICATION JUDGEMENT OF THE PROVISIONER (lane PROVISION-BATCH-FIX, 2026-09-26).
  -- platform.provision (one table) and platform.provision_batch (its members, again, after the
  -- batch's deferred constraints) both call this and nothing else, so the two paths cannot
  -- disagree about what refuses. The batch used to carry its own copy of the loop without the
  -- deferred base-contract rule, and refused every batch.
  --
  -- canonical_certify reports every WARN and FAIL under category `conformance`; the CHECK NAME is
  -- the prefix of `detail`. Refuse on every FAIL and every WARN except the three legacy-column
  -- WARNs (§3.1); INFO (the snapshot row) is ignored.
  --
  -- THE THREE BASE-CONTRACT CHECKS ARE OWED, NOT FAILED (2026-09-21), when p_defer_base: the
  -- foreign keys are added by platform.provision_attach_base_contract in the NEXT transaction, on
  -- purpose, so verify_canonical is RIGHT that they are absent and wrong to call it a defect here.
  -- They are recorded ONCE, as `PENDING`, the debt register carries the relation, and
  -- platform.provision_validate_base_contract re-runs the full certification once they are
  -- validated — the moment the table is actually certified. Deferral does not excuse the check;
  -- it moves it to where the answer is true.
  --
  -- Answers {certify: [{category, status, detail}], refuse: ["<category> [<status>]: <detail>"]}.
  for r in select * from iam.canonical_certify(p_schema, p_table, p_token) loop
    -- LANE PROVISION-LOCK (2026-09-27): THE POLICY CHECKS ARE OWED, NOT FAILED, while the table's
    -- policies are deferred to the access seal (platform.provision_attach_base_contract), exactly
    -- like the three base-contract checks: recorded once as PENDING, re-judged in full by
    -- platform.provision_validate_base_contract once the policies exist.
    if r.status in ('FAIL', 'WARN')
       and platform._access_seal_marked(to_regclass(format('%I.%I', p_schema, p_table)), 'owed')
       and split_part(coalesce(r.detail, ''), ':', 1) = any (array['org_open_gate', 'policies_canonical', 'platform_admin_read_present', 'bespoke_policy_present', 'privacy_wall', 'personal_row_wall', 'component_not_wider_than_parent', 'containment_respects_personal', 'client_read_only_policies', 'component_public_read', 'policy_owner_shortcircuit', 'policy_uses_has_access', 'pub_read_anon', 'policy_system_public_read', 'policy_personal_owner_only', 'policy_follows_parent']) then
      v_certify := v_certify || jsonb_build_array(jsonb_build_object('category', r.category, 'status', 'PENDING',
        'detail', coalesce(r.detail,'') || ' — the policies are written by platform.provision_attach_base_contract (the access seal) in its own short transaction'));
      continue;
    end if;
    if p_defer_base
       and r.status = 'FAIL'
       and split_part(coalesce(r.detail, ''), ':', 1) in ('base_org_fk','base_created_by_fk','base_updated_by_fk') then
      v_certify := v_certify || jsonb_build_array(jsonb_build_object('category', r.category, 'status', 'PENDING',
        'detail', coalesce(r.detail,'') || ' — deferred to platform.provision_attach_base_contract, settled in its own short transaction'));
      continue;
    end if;
    v_certify := v_certify || jsonb_build_array(jsonb_build_object('category', r.category, 'status', r.status, 'detail', r.detail));
    if r.status = 'FAIL'
       or (r.status = 'WARN'
           and split_part(coalesce(r.detail, ''), ':', 1) not in ('legacy_owner_col','legacy_is_public','legacy_is_deleted')) then
      v_refuse := v_refuse || to_jsonb(format('%s [%s]: %s', r.category, r.status, coalesce(r.detail,'')));
    end if;
  end loop;
  return jsonb_build_object('certify', v_certify, 'refuse', v_refuse);
end;
$function$;
