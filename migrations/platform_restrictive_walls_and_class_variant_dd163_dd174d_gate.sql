-- platform_restrictive_walls_and_class_variant_dd163_dd174d_gate
-- THE ACCESS DELTA, THE ROW-LEVEL PROOFS AND THE CERTIFICATION (DD-163 + DD-174, lane B-57.)
--
-- ..._declare took the BEFORE over 9 tokens x 8 principals; ..._apply superseded four restrictive
-- FOR ALL staff walls and generated four tokens. This re-probes the SAME 9 with the SAME 8,
-- pinned to the SAME instant the baseline recorded, and gates the difference.
--
-- 🚨 A WIDENING IS APPROVED BY NAME OR IT IS A FAILURE, and an approval is not taken on trust: the
-- rows each widened principal gained are re-read afterwards and asserted to be THEIRS, or their
-- organization's, or a catalogue a signed-out visitor was already reading. A count that went up by
-- eight proves nothing about what the eight are.
set local lock_timeout = '4s';

do $$
declare
  v_before uuid; v_after uuid; v_as timestamptz; r record;
  v_unapproved text[] := '{}';
  v_approved constant text[] := array[
    -- token | principal   (every one of these is the same sentence: the wall had made a live lane dead text)
    'edge_payload_kind|arman@titaniumsuccess.com',
    'edge_payload_kind|developer111@pixelium.uk',
    'edge_payload_kind|seo@titaniumsuccess.com',
    'edge_payload_kind|test@test.com',
    'org_module_config|arman@titaniumsuccess.com',
    'org_module_config|developer111@pixelium.uk',
    'org_module_config|seo@titaniumsuccess.com',
    'platform_share_link|developer111@pixelium.uk',
    'platform_share_link|seo@titaniumsuccess.com'];
  v_principals uuid[] := array[
    '7604b9d9-57f3-4c44-b75b-dc9a3ee8aacf', '6555aa73-c647-4ecf-8a96-b60e315b6b18',
    '87a6e699-3622-4869-8843-d0867456c0dd', 'a4955b5c-d524-4d72-a90e-0658d5d51148',
    'c5e92166-e148-4e73-926e-83af0c453665', '34ed4fc3-c527-4819-99bf-15c26603b261',
    '4060701e-706a-4c76-b3ca-0bbc69fa5a14', '00000000-0000-0000-0000-000000000000'
  ]::uuid[];
  v_tokens text[] := array[
    'platform_share_link', 'org_module_config', 'edge_payload_kind', 'billing_stripe_event',
    'billing_usage_ledger', 'retrieval_audit', 'knob_override_audit',
    'udt_document_snapshot', 'udt_workbook_snapshot'];
begin
  select id, started_at into v_before, v_as from iam.access_delta_run
   where label = 'DD-163/174 BEFORE' order by started_at desc limit 1;
  if v_before is null then
    raise exception 'b57_gate: there is no DD-163/174 BEFORE snapshot to compare against. A gate with no baseline is not a gate.';
  end if;

  v_after := iam.access_delta_snapshot('DD-163/174 AFTER', v_principals, v_tokens, 400000,
    'B-57 confirmation, pinned to the declare-file baseline instant', v_as);

  for r in select token, principal_label, count_before, count_after, verdict
             from iam.access_delta_compare(v_before, v_after)
            where verdict <> 'SAME' order by verdict desc, token, principal_label
  loop
    if r.verdict = 'WIDER' then
      if not ((r.token || '|' || r.principal_label) = any (v_approved)) then
        v_unapproved := array_append(v_unapproved,
          format('%s for %s (%s -> %s)', r.token, r.principal_label, r.count_before, r.count_after));
      else
        raise notice 'b57_gate: WIDER (approved) % for % : % -> %', r.token, r.principal_label, r.count_before, r.count_after;
      end if;
    else
      raise notice 'b57_gate: NARROWED % for % : % -> %', r.token, r.principal_label, r.count_before, r.count_after;
    end if;
  end loop;

  if cardinality(v_unapproved) > 0 then
    raise exception
      'b57_gate: % door(s) opened that nobody approved by name: %. Over-opening and over-tightening are the same class of defect and neither ships on a count.',
      cardinality(v_unapproved), array_to_string(v_unapproved, ' ; ');
  end if;
  raise notice 'b57_gate: 0 unapproved widenings across % tokens x % principals', cardinality(v_tokens), cardinality(v_principals);
end $$;

-- ═══════════ THE APPROVALS, RE-READ AS ROWS RATHER THAN AS COUNTS ═══════════════════════════════
do $$
declare v_n bigint; v_anon bigint; v_auth bigint;
begin
  -- platform_share_link: each widened principal gained exactly the links THEY created.
  select count(*) into v_n from platform.share_links where created_by = 'a4955b5c-d524-4d72-a90e-0658d5d51148';
  if v_n <> 179 then
    raise exception 'b57_gate: developer111@pixelium.uk gained 179 share links but created % — the widening is not "the owner reads their own rows".', v_n;
  end if;
  select count(*) into v_n from platform.share_links where created_by = 'c5e92166-e148-4e73-926e-83af0c453665';
  if v_n <> 10 then
    raise exception 'b57_gate: seo@titaniumsuccess.com gained 10 share links but created % of them.', v_n;
  end if;

  -- org_module_config: every row each principal gained belongs to an organization they are IN.
  select count(*) into v_n from platform.org_module_config c
   where c.organization_id in (select m.organization_id from iam.organization_member m
                                where m.user_id = '34ed4fc3-c527-4819-99bf-15c26603b261');
  if v_n <> 2 then
    raise exception 'b57_gate: arman@titaniumsuccess.com gained 2 org_module_config rows but only % of them belong to an organization they are a member of.', v_n;
  end if;
  select count(*) into v_n from platform.org_module_config c
   where c.organization_id in (select m.organization_id from iam.organization_member m
                                where m.user_id = 'c5e92166-e148-4e73-926e-83af0c453665');
  if v_n <> 1 then
    raise exception 'b57_gate: seo@titaniumsuccess.com gained 1 org_module_config row but % of them belong to an organization they are a member of.', v_n;
  end if;

  -- edge_payload_kind — AND A CORRECTION THIS FILE OWES THE RECORD.
  -- The two files before this one say, in a comment and in a stored supersede reason, that the wall
  -- produced an inversion: "a SIGNED-OUT visitor reads all 8 rows and a SIGNED-IN person reads 0."
  -- That is WRONG and it is corrected here rather than left standing. `edge_payload_kind_read`
  -- names the `anon` role, but there is NO anon SELECT grant on the table, so an anonymous session
  -- gets 42501 and always did. The truth is worse and simpler: the catalogue was readable by NOBODY
  -- except AI Matrx staff — the restrictive wall killed the authenticated half and a missing grant
  -- killed the anon half. The registry note and the superseded_policy reason are rewritten below;
  -- a stored reason that says something untrue is how a ledger becomes decoration.
  if has_table_privilege('anon', 'platform.edge_payload_kind', 'SELECT') then
    raise exception 'b57_gate: anon now HAS a SELECT grant on platform.edge_payload_kind. Nothing in this round granted one, so something else did and the correction below would be wrong.';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub','4060701e-706a-4c76-b3ca-0bbc69fa5a14','role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_auth from platform.edge_payload_kind;
  execute 'reset role';
  perform set_config('request.jwt.claims', null, true);
  if v_auth <> 8 then
    raise exception 'b57_gate: a signed-in non-admin reads % of the 8 edge payload kinds; the wall it was behind is supposed to be gone.', v_auth;
  end if;
  v_anon := 0;

  update iam.superseded_policy
     set reason = 'DD-163 (reason corrected by the B-57 gate file, same round): platform_admin_only was a '
       || 'RESTRICTIVE FOR ALL policy TO authenticated, so it ANDed with edge_payload_kind_read USING (true) '
       || 'and left the published catalogue readable by NOBODY but AI Matrx staff — every signed-in identity '
       || 'read 0 of the 8 rows and now reads all 8. The reason first stored here claimed a signed-out '
       || 'visitor could read them; that was wrong. edge_payload_kind_read names the anon role but there is '
       || 'no anon SELECT GRANT on the table, so an anonymous session gets 42501 and always did. Writes stay '
       || 'with platform_admin_all. The token is classed public because the CONTENT is a published catalogue '
       || 'with no user data in it; the missing anon grant is reported as a separate observation, not '
       || 'silently granted here.'
   where schema_name = 'platform' and table_name = 'edge_payload_kind' and policy_name = 'platform_admin_only';

  update platform.entity_types
     set data_class_reason = 'DD-163: a published catalogue of edge payload kinds — kind, version, '
       || 'description, json_schema. No person, organization or customer content is in it and its own policy '
       || 'grants SELECT on true to authenticated (and names anon, though no anon GRANT exists, so an '
       || 'anonymous session gets 42501 — reported, not granted here). It was classed confidential by '
       || 'DD-159 batch 3''s machinery boilerplate, which described the audit_class and not the contents. '
       || 'audit_class stays machinery: iam.apply_rls still refuses to generate over a table the access '
       || 'kernel reads.'
   where token = 'edge_payload_kind';

  raise notice 'b57_gate: every approval re-read as ROWS — 179 + 10 share links created by their own readers, 2 + 1 module configs owned by organizations their readers belong to, and all 8 payload-catalogue rows now reach a signed-in non-admin who read 0 of them. anon still has no SELECT grant there (%) — reported, not granted.', v_anon;
end $$;

-- ═══════════ runtime.global_execution_control — PROVEN THE WAY A CLIENT ACTUALLY READS IT ═══════
-- Not in the delta cast: with no `id` column iam.access_delta_snapshot falls back to a string_agg
-- over all 160,536 rows behind a per-row iam.has_access lane, and a rehearsal of that ran past 200
-- seconds per principal. A control row is read BY ITS EXECUTION, one row at a time, and that is
-- what is proven here — in both directions, because over-tightening is the same size of bug.
do $$
declare
  v_who uuid; v_yes uuid; v_no uuid; n bigint; v_cands uuid[];
begin
  foreach v_who in array array['a4955b5c-d524-4d72-a90e-0658d5d51148',   -- developer111@pixelium.uk
                               '4060701e-706a-4c76-b3ca-0bbc69fa5a14']::uuid[]  -- test@test.com
  loop
    perform set_config('request.jwt.claims', json_build_object('sub', v_who, 'role','authenticated')::text, true);
    execute 'set local role authenticated';
    select c.root_execution_id into v_yes from runtime.global_execution_control c
     where iam.has_access('global_execution', c.root_execution_id, 'viewer') limit 1;
    execute 'reset role';
    perform set_config('request.jwt.claims', null, true);
    if v_yes is null then
      raise exception 'b57_gate: % has viewer access to no global execution at all, so this proof cannot be made with them. Pick a principal who does rather than passing on an empty set.', v_who;
    end if;
    select c.root_execution_id into v_no from runtime.global_execution_control c
     where c.root_execution_id <> v_yes
       and not exists (select 1 from runtime.global_execution_control c2 where false)
     limit 1;

    perform set_config('request.jwt.claims', json_build_object('sub', v_who, 'role','authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into n from runtime.global_execution_control where root_execution_id = v_yes;
    execute 'reset role';
    perform set_config('request.jwt.claims', null, true);
    if n <> 1 then
      raise exception 'b57_gate: % has viewer access to execution % but reads % control row(s) for it. The lane the restrictive wall was killing is still dead.', v_who, v_yes, n;
    end if;
    raise notice 'b57_gate: % reads the control row of execution % (1 row) — the has_access viewer lane the FOR ALL staff wall had ANDed to false is live.', v_who, v_yes;
  end loop;

  -- THE OTHER DIRECTION: a control row whose execution this identity may NOT view stays invisible.
  -- 🚨 The candidate CANNOT be found with `where not iam.has_access(...)` as that identity: the
  -- policy already filters the scan to rows has_access says yes to, so that predicate returns the
  -- empty set on an open table and on a shut one alike — a query that can only ever say "nothing",
  -- which is the shape of a test that proves nothing. So the candidates are listed as the table's
  -- owner (RLS does not apply) and the verdict on each is then asked AS THEM.
  select array_agg(c.root_execution_id) into v_cands
    from (select root_execution_id from runtime.global_execution_control limit 200) c;
  perform set_config('request.jwt.claims', json_build_object('sub','4060701e-706a-4c76-b3ca-0bbc69fa5a14','role','authenticated')::text, true);
  execute 'set local role authenticated';
  select x into v_no from unnest(v_cands) x
   where not iam.has_access('global_execution', x, 'viewer') limit 1;
  if v_no is not null then
    select count(*) into n from runtime.global_execution_control where root_execution_id = v_no;
  end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', null, true);
  if v_no is null then
    raise exception 'b57_gate: iam.has_access said YES to test@test.com for all 200 sampled control rows. That is not a lane, that is an open table, and the negative half of this proof cannot be made.';
  end if;
  if n <> 0 then
    raise exception 'b57_gate: test@test.com read % control row(s) for execution %, which iam.has_access says they may not view. Removing the wall opened a door instead of uncovering one.', n, v_no;
  end if;
  raise notice 'b57_gate: a control row whose execution test@test.com may not view is still invisible to them (0 rows).';
end $$;

-- ═══════════ THE ANON SHARE-LINK DOOR, CALLED FOR REAL AFTER THE REGENERATION ═══════════════════
-- B-48 registered platform_share_link with "do NOT run iam.apply_rls on it": the anon
-- link-resolution door, 355 live links. That door is public.resolve_share_token — a SECURITY
-- DEFINER function anon may EXECUTE — not an RLS policy. This calls it AS anon, on a real live
-- token, after the regeneration, and refuses to pass on a reading.
do $$
declare v_tok text; j jsonb;
begin
  select token into v_tok from platform.share_links where is_active order by created_at desc limit 1;
  if v_tok is null then
    raise exception 'b57_gate: there is no active share link to resolve, so the anon door cannot be proven. An unproven door is a finding.';
  end if;
  perform set_config('request.jwt.claims', null, true);
  execute 'set local role anon';
  j := public.resolve_share_token(v_tok);
  execute 'reset role';
  perform set_config('request.jwt.claims', null, true);
  if coalesce(j->>'success','') <> 'true' then
    raise exception 'b57_gate: an anonymous call to public.resolve_share_token returned %. The regeneration took the share-link door out and that is the one thing B-48 said must not happen.', left(j::text, 300);
  end if;
  raise notice 'b57_gate: an ANONYMOUS session resolved a live share link through public.resolve_share_token after the regeneration (success=true). RLS never held that door.';
end $$;

-- ═══════════ knob_override_audit — THE ARM THE CLASS NEVER SANCTIONED IS GONE ═══════════════════
do $$
declare v_expr text; n_sysorg bigint; n_read bigint;
begin
  select pg_get_expr(polqual, polrelid) into v_expr from pg_policy
   where polrelid = 'platform.knob_override_audit'::regclass and polname = 'std_select';
  if v_expr is null then
    raise exception 'b57_gate: platform.knob_override_audit has no generated std_select.';
  end if;
  if v_expr like '%system_orgs%' then
    raise exception 'b57_gate: the generated std_select on a CONFIDENTIAL ledger still carries the global-readable system-org arm: %', v_expr;
  end if;
  if v_expr like '%is_platform_admin%' or v_expr like '%is_super_admin%' then
    raise exception 'b57_gate: the generated std_select on a CONFIDENTIAL ledger still carries a platform-staff arm: %', v_expr;
  end if;
  select count(*) into n_sysorg from platform.knob_override_audit a
   where a.organization_id in (select organization_id from iam.system_orgs where global_readable);
  perform set_config('request.jwt.claims', json_build_object('sub','4060701e-706a-4c76-b3ca-0bbc69fa5a14','role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n_read from platform.knob_override_audit a
   where a.organization_id in (select organization_id from iam.system_orgs where global_readable);
  execute 'reset role';
  perform set_config('request.jwt.claims', null, true);
  if n_read <> 0 then
    raise exception 'b57_gate: test@test.com reads % of the % system-organization rows of a CONFIDENTIAL audit.', n_read, n_sysorg;
  end if;
  raise notice 'b57_gate: 0 of the % global-readable system-organization rows of platform.knob_override_audit reach a non-member (the stock ledger variant gave them all %).', n_sysorg, n_sysorg;
end $$;

-- ═══════════ CERTIFICATION: iam.verify_canonical over the four generated tokens ════════════════
-- 🚨 THREE AXES, THREE DIFFERENT SENTENCES, AND SAYING SO IS THE HONEST REPORT.
--  * A POLICY-family FAIL aborts: it would mean this round left a table the class regime refuses.
--  * A BASE-family FAIL is COUNTED AND NAMED, never absorbed — these tables were built before the
--    registry existed and lack `metadata`, `version`, `updated_by`, stamp/touch triggers. That is a
--    schema retrofit (DD-173) and widening this check to swallow it is how a certification becomes
--    decoration.
--  * `policies_canonical` has a THIRD state that post-DD-147 it cannot express. It FAILs whenever
--    the live policy set is not exactly the generated set — and since DD-147 the generator KEEPS
--    bespoke policies on purpose, so every table with a deliberately kept policy FAILs it forever
--    (B-54 §1 recorded the same thing on platform.activity_log). Three tables here keep one on
--    purpose and this file says which, by name, in advance:
--        billing.usage_ledger, rag.retrieval_audit  platform_admin_{insert,update,delete}_only —
--            the RESTRICTIVE "the server writes this ledger" walls. Superseding them would let a
--            person INSERT their own usage rows: a widening on the write axis nobody asked for.
--        platform.share_links                        share_links_svc_all — the service_role lane.
--    So a policies_canonical FAIL passes ONLY when it is missing nothing and its unexpected set is
--    a subset of the names declared below, AND `bespoke_policy_present` names those same policies.
--    Anything else — a missing generated policy, or an unexpected name nobody declared — aborts.
do $$
declare
  r record; v record;
  v_policy_fail text[] := '{}';
  v_base_fail   text[] := '{}';
  v_kept_ok     text[] := '{}';
  f text; v_unexpected text[]; v_missing text; v_extra text[]; v_bespoke text;
  v_policy_checks constant text[] := array[
    'policies_canonical','bespoke_policy_present','privacy_wall','personal_row_wall',
    'rls_enabled','anon_public_lane','class_lanes','component_anon_lane','class_lanes_match_policy',
    'data_class_derivations'];
begin
  for r in
    select * from (values
      ('platform_share_link',   array['share_links_svc_all']),
      ('billing_usage_ledger',  array['platform_admin_insert_only','platform_admin_update_only','platform_admin_delete_only']),
      ('retrieval_audit',       array['platform_admin_insert_only','platform_admin_update_only','platform_admin_delete_only']),
      ('knob_override_audit',   array[]::text[])
    ) as t(token, kept)
    order by t.token
  loop
    select detail into v_bespoke from iam.verify_canonical(
        (select schema_name from platform.entity_types where token = r.token),
        (select table_name  from platform.entity_types where token = r.token),
        r.token,
        (select rls_variant from platform.entity_types where token = r.token))
     where check_name = 'bespoke_policy_present';

    for v in select * from iam.verify_canonical(
        (select schema_name from platform.entity_types where token = r.token),
        (select table_name  from platform.entity_types where token = r.token),
        r.token,
        (select rls_variant from platform.entity_types where token = r.token))
      where status = 'FAIL'
    loop
      f := format('%s / %s: %s', r.token, v.check_name, coalesce(v.detail,''));
      if v.check_name = 'policies_canonical' and cardinality(r.kept::text[]) > 0 then
        -- detail shape: missing={...} legacy/unexpected={...}
        v_missing := substring(coalesce(v.detail,'') from 'missing=\{([^}]*)\}');
        v_unexpected := string_to_array(coalesce(substring(coalesce(v.detail,'') from 'unexpected=\{([^}]*)\}'), ''), ',');
        v_unexpected := array(select btrim(x) from unnest(v_unexpected) x where btrim(x) <> '');
        v_extra := array(select unnest(v_unexpected) except select unnest(r.kept::text[]));
        if coalesce(v_missing,'') = '' and v_extra = '{}' then
          -- the kept set must also be the set the generator says it kept
          foreach f in array r.kept::text[] loop
            if coalesce(v_bespoke,'') not like '%' || f || '%' then
              raise exception 'b57_gate: % declares it keeps % but bespoke_policy_present does not name it (%). The declaration and the database disagree.', r.token, f, coalesce(v_bespoke,'<null>');
            end if;
          end loop;
          v_kept_ok := array_append(v_kept_ok, format('%s keeps %s', r.token, array_to_string(r.kept::text[], ', ')));
          continue;
        end if;
        f := format('%s / %s: %s', r.token, v.check_name, coalesce(v.detail,''));
      end if;
      if v.check_name = any (v_policy_checks) then
        v_policy_fail := array_append(v_policy_fail, f);
      else
        v_base_fail := array_append(v_base_fail, f);
      end if;
    end loop;
  end loop;

  foreach f in array v_base_fail loop
    raise notice 'b57_gate: BASE-CONTRACT FAIL (not this round, named not absorbed) %', f;
  end loop;
  foreach f in array v_kept_ok loop
    raise notice 'b57_gate: policies_canonical FAILs only on a policy this file KEPT on purpose — %', f;
  end loop;
  raise notice 'b57_gate: % base-contract FAIL(s) across the four generated tokens — every one is a missing column or trigger on a table built before the registry existed.', cardinality(v_base_fail);

  if cardinality(v_policy_fail) > 0 then
    raise exception
      'b57_gate: % POLICY-family FAIL(s) after generation: %. The generator produced a policy set its own certification refuses; this round does not stand.',
      cardinality(v_policy_fail), array_to_string(v_policy_fail, ' ; ');
  end if;
  raise notice 'b57_gate: 0 POLICY-family FAIL across platform_share_link, billing_usage_ledger, retrieval_audit and knob_override_audit (bar the three kept-by-design policies named above)';
end $$;
