-- iam_super_admin_arm_personal_wall_dd180b_batch6 — DD-180 REGENERATION BATCH 6 OF 7 (24 tokens).
--
-- `iam_super_admin_arm_personal_wall_dd180a_check.sql` carries the full account: the db-rules §6e
-- global-readable system-organization super-admin arm was walled behind `visibility >= 'internal'`
-- in the kernel and in the generator by DD-170, but a live policy is TEXT written at generation
-- time, so 167 active tokens with a real `platform.visibility` column still carry the arm UNWALLED
-- and FAIL the new `super_admin_system_org_arm_walled` check. This file pays that for 24 of them.
--
-- 🚨 NOTHING HERE IS EXPECTED TO MOVE A ROW, AND THAT IS MEASURED, NOT ASSUMED. Counted across all
-- 167 tables before this round: ZERO rows with `visibility = 'personal'` sit under a global-readable
-- system organization, so the arm being walled can take nothing away from anyone today. The gate
-- runs in full anyway — a WIDENING is a failure unless named, an UNPROVEN or UNMEASURED pair is a
-- failure, and any narrowing is printed by token and principal — because the point of the gate is
-- that it is the thing that would tell us the premise was wrong.
--
-- 🚨 A PRE-EXISTING verify_canonical FAIL IS NOT THIS FILE'S TO ABSORB OR TO BE BLAMED FOR. These
-- tokens are already generated and carry whatever findings they carry. So certification is a DELTA:
-- the FAIL set is collected before and after, a FAIL that APPEARS aborts the batch, and
-- `super_admin_system_org_arm_walled` must go FAIL -> PASS on every token or the batch does not stand.
--
-- Nothing here changes a schema, a grant or a registry row. It re-emits policies from the generator
-- that has been emitting the walled form since DD-170.
set local lock_timeout = '10s';

do $dd180b6$
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
    '7604b9d9-57f3-4c44-b75b-dc9a3ee8aacf',  -- platform admin, arman26@gmail.com (super_admin) — the identity this arm belongs to
    '6555aa73-c647-4ecf-8a96-b60e315b6b18',  -- platform admin, info@aimatrx.com
    '87a6e699-3622-4869-8843-d0867456c0dd',  -- platform admin, admin@admin.com (the testing identity)
    'a4955b5c-d524-4d72-a90e-0658d5d51148',  -- developer111@pixelium.uk: a NON-admin with real rows elsewhere
    'c5e92166-e148-4e73-926e-83af0c453665',  -- seo@titaniumsuccess.com: a plain member of a real organization
    '34ed4fc3-c527-4819-99bf-15c26603b261',  -- arman@titaniumsuccess.com: admin of that organization, NOT platform staff
    '4060701e-706a-4c76-b3ca-0bbc69fa5a14',  -- test@test.com: a non-member
    '00000000-0000-0000-0000-000000000000'   -- anonymous, no JWT
  ]::uuid[];
  v_tokens text[] := array[
    'seo_keyword_class_rule','seo_keyword_edge','seo_keyword_facet','seo_keyword_market',
    'seo_keyword_place','seo_keyword_topic','seo_rank_target','seo_source_request','seo_starter_pack',
    'seo_starter_pack_item','seo_story_angle','seo_topic','shared_canvas_item','skill',
    'skill_render_definition','studio_session','study_media','system_context_item','task','thread',
    'tool','tool_bundle','transcript','ui_surface_agent_pref'];
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
    if not (v_pre -> r.token ? 'super_admin_system_org_arm_walled') then
      raise exception 'dd180b6: % does not FAIL super_admin_system_org_arm_walled before this file runs. It is not in the RED set this batch was written against; re-census.', r.token;
    end if;
  end loop;

  -- ═══════ 2. THE BEFORE, pinned to this transaction's instant ═════════════════════════════════
  v_before := iam.access_delta_snapshot('DD-180 b6 BEFORE', v_principals, v_tokens, 400000,
    'DD-180 batch 6: tokens carrying the UNWALLED system-org super-admin read arm, before regeneration', v_as);

  -- ═══════ 3. REGENERATE through the one path ══════════════════════════════════════════════════
  for r in select et.token, et.schema_name, et.table_name, et.rls_variant
             from platform.entity_types et where et.token = any (v_tokens) and et.is_active order by et.token
  loop
    perform iam.apply_rls(r.schema_name, r.table_name, r.token, r.rls_variant);
  end loop;

  -- ═══════ 4. THE GATE — same probe, same instant, same cast ═══════════════════════════════════
  v_after := iam.access_delta_snapshot('DD-180 b6 AFTER', v_principals, v_tokens, 400000,
    'DD-180 batch 6 confirmation, pinned to the same instant as the baseline', v_as);
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
        raise notice 'dd180b6: WIDER (approved by name) % for % : % -> %', r.token, r.principal_label, r.count_before, r.count_after;
      end if;
    elsif r.verdict = 'UNPROVEN' then
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
      raise notice 'dd180b6: NARROWED % for % : % -> %', r.token, r.principal_label, r.count_before, r.count_after;
    end if;
  end loop;
  if cardinality(v_hard) > 0 then
    raise exception 'dd180b6: % read(s) this gate could not prove either way: %', cardinality(v_hard), array_to_string(v_hard, ' ; ');
  end if;
  if cardinality(v_unapproved) > 0 then
    raise exception 'dd180b6: % door(s) opened that nobody approved by name: %. Over-opening and over-tightening are the same class of defect and neither ships on a count.',
      cardinality(v_unapproved), array_to_string(v_unapproved, ' ; ');
  end if;

  -- ═══════ 5. CERTIFICATION AS A DELTA ═════════════════════════════════════════════════════════
  for r in select et.token, et.schema_name, et.table_name, et.rls_variant
             from platform.entity_types et where et.token = any (v_tokens) and et.is_active order by et.token
  loop
    select coalesce(array_agg(c.check_name order by c.check_name), '{}') into v_post
      from iam.verify_canonical(r.schema_name, r.table_name, r.token, r.rls_variant) c
     where c.status = 'FAIL';
    if 'super_admin_system_org_arm_walled' = any (v_post) then
      v_stillred := array_append(v_stillred, r.token);
    end if;
    v_newfail := v_newfail || array(
      select format('%s / %s', r.token, x) from unnest(v_post) x
       where not (v_pre -> r.token ? x));
  end loop;
  if cardinality(v_stillred) > 0 then
    raise exception 'dd180b6: % token(s) still FAIL super_admin_system_org_arm_walled after regeneration: %. The generator did not wall the arm this batch exists to wall.',
      cardinality(v_stillred), array_to_string(v_stillred, ', ');
  end if;
  if cardinality(v_newfail) > 0 then
    raise exception 'dd180b6: % verify_canonical FAIL(s) that were NOT there before this file ran: %. A regeneration that introduces a finding does not stand.',
      cardinality(v_newfail), array_to_string(v_newfail, ' ; ');
  end if;
  raise notice 'dd180b6: 0 unapproved widenings, % narrowing(s), 0 new verify_canonical FAILs, % token(s) FAIL -> PASS on super_admin_system_org_arm_walled',
    cardinality(v_narrower), cardinality(v_tokens);
end
$dd180b6$;
