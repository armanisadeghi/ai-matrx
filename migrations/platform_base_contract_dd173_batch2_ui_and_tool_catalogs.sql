-- platform_base_contract_dd173_batch2_ui_and_tool_catalogs — DD-173 BATCH 2 (9 tokens).
--
-- THE NINE. The catalogs the tool runtime and the UI surfaces read: the MCP server list and its
-- configs, the tool executors, the per-surface tool defaults, the UI client list, and the four
-- per-surface registries (agent roles, client tools, values, write targets — 5,850 rows between
-- them). Every one is `rls_variant = system`, `data_class = public`, registered by DD-159 batch 1
-- and refused by `iam.apply_rls` ever since for a missing base contract, so every one still
-- carries its pre-registration hand-written policies. All nine are read today by everyone
-- including anonymous visitors through a `USING (true)` policy.
--
-- 🚨 VISIBILITY IS A FLAT 'public' HERE, AND THAT IS A CORRECTION OF BATCH 1'S HABIT, NOT A
--    SHORTCUT. Batch 1 derived visibility from each table's live/retired flag where it had one,
--    because every row was live and nothing moved. Here `tool.executor` has 133 rows of which 10
--    are `is_active = false`, and the generated `std_select` for this variant reads
--    `visibility = 'public'` for EVERY reader, not just anonymous ones — so deriving would have
--    hidden ten retired executors from the admin screens that exist to re-enable them. `is_active`
--    on an executor is an operational toggle, not an access decision, and conflating the two is
--    how a canonicalization breaks a feature. Flat 'public' reproduces exactly today's reach.
--
-- 🚨 `tool_binding` WAS THE TENTH AND IS HELD BACK BY NAME. Its hand-written `j_insert` /
--    `j_update` / `j_delete` policies read `iam.has_access('tool', tool_id, 'editor')` — a real
--    user capability: whoever may edit a tool may bind it to an executor. Generating it as a
--    `system` catalog replaces that with a staff-only write lane, which the read-only access delta
--    would not even see. The table keys on `tool_id` and derives its access from that parent: it
--    is a COMPONENT of `tool` registered as a `system` catalog, and that classification has to be
--    corrected (and proven) before it is generated. Written up in the B-65 report.
--
-- Everything else about this file — the named org strategy, the re-read bespoke superset, the
-- one-transaction gate, the UNPROVEN resolution, the guard acknowledgement — is batch 1's shape
-- and is documented there.
set local lock_timeout = '20s';

do $dd173b2$
declare
  v_as         timestamptz := now();
  v_before     uuid; v_after uuid; r record;
  v_unapproved text[] := '{}';
  v_unapproven_hard text[] := '{}';
  v_unproven_ok text[] := '{}';
  v_narrower   text[] := '{}';
  v_total      bigint;
  v_admins bigint; v_admins_also_platform bigint;
  v_res        text;
  v_live       text[]; v_extra text[]; v_drop text[];
  v_policy_fail text[] := '{}'; v_base_fail text[] := '{}';
  f text; v record;
  v_acked      bigint;
  v_policy_checks constant text[] := array[
    'policies_canonical','bespoke_policy_present','privacy_wall','personal_row_wall',
    'rls_enabled','anon_public_lane','class_lanes','component_anon_lane',
    'policy_system_public_read','pub_read_anon','component_public_read',
    'component_not_wider_than_parent','containment_respects_personal'];
  v_principals uuid[] := array[
    '7604b9d9-57f3-4c44-b75b-dc9a3ee8aacf',  -- platform admin, arman26@gmail.com (super_admin)
    '6555aa73-c647-4ecf-8a96-b60e315b6b18',  -- platform admin, info@aimatrx.com
    '87a6e699-3622-4869-8843-d0867456c0dd',  -- platform admin, admin@admin.com (the testing identity)
    'a4955b5c-d524-4d72-a90e-0658d5d51148',  -- developer111@pixelium.uk: a NON-admin with real rows elsewhere
    'c5e92166-e148-4e73-926e-83af0c453665',  -- seo@titaniumsuccess.com: a plain member of a real organization
    '34ed4fc3-c527-4819-99bf-15c26603b261',  -- arman@titaniumsuccess.com: admin of that organization, NOT platform staff
    '4060701e-706a-4c76-b3ca-0bbc69fa5a14',  -- test@test.com: a non-member
    '00000000-0000-0000-0000-000000000000'   -- anonymous, no JWT — the one that matters most on a public catalog
  ]::uuid[];
  v_tokens text[] := array[
    'mcp_config','mcp_server','tool_executor','tool_surface_defaults','ui_client',
    'ui_surface_agent_role','ui_surface_client_tool','ui_surface_value','ui_surface_write_target'];
  -- token | schema | table | visibility expression (SQL over alias t, or a literal)
  v_plan constant text[][] := array[
    array['mcp_config','tool','mcp_config',                    $x$'public'$x$],
    array['mcp_server','tool','mcp_server',                    $x$'public'$x$],
    array['tool_executor','tool','executor',                   $x$'public'$x$],
    array['tool_surface_defaults','tool','surface_defaults',   $x$'public'$x$],
    array['ui_client','ui','ui_client',                        $x$'public'$x$],
    array['ui_surface_agent_role','ui','ui_surface_agent_role', $x$'public'$x$],
    array['ui_surface_client_tool','ui','ui_surface_client_tool', $x$'public'$x$],
    array['ui_surface_value','ui','ui_surface_value',          $x$'public'$x$],
    array['ui_surface_write_target','ui','ui_surface_write_target', $x$'public'$x$]];
  -- the SUPERSET of hand-written policy names this file was written against: 'token|a,b,c'.
  -- (A flat text[] rather than a 2-D array because Postgres requires every row of a
  -- multidimensional array to have the same length, and these tables do not.)
  v_bespoke constant text[] := array[
    'mcp_config|ref_admin,ref_select',
    'mcp_server|ref_admin,ref_select',
    'tool_executor|ref_admin,ref_select',
    'tool_surface_defaults|ref_admin,ref_select',
    'ui_client|ui_client_read,ui_client_read_anon,ui_client_service_role,ui_client_write_admin',
    'ui_surface_agent_role|ui_surface_agent_role_read,ui_surface_agent_role_service_role,ui_surface_agent_role_write',
    'ui_surface_client_tool|ui_surface_client_tool_read,ui_surface_client_tool_read_anon,ui_surface_client_tool_service_role,ui_surface_client_tool_write_admin',
    'ui_surface_value|ui_surface_value_read,ui_surface_value_read_anon,ui_surface_value_service_role,ui_surface_value_write_admin',
    'ui_surface_write_target|ui_surface_write_target_read,ui_surface_write_target_read_anon,ui_surface_write_target_service_role,ui_surface_write_target_write_admin'];
  -- A WIDENING IS APPROVED BY NAME OR IT IS A FAILURE. 'token|principal'.
  v_approved constant text[] := '{}';
  i int; v_tok text; v_sch text; v_tbl text; v_vis text; v_names text[];
begin
  -- ═══════ 1. THE BEFORE, pinned to this transaction's instant ═════════════════════════════════
  v_before := iam.access_delta_snapshot('DD-173 b2 BEFORE', v_principals, v_tokens, 400000,
    'DD-173 batch 2: the ten public reference catalogs, before the base retrofit and generation', v_as);
  raise notice 'dd173b2: baseline % over % tokens x % principals, pinned at %',
    v_before, cardinality(v_tokens), cardinality(v_principals), v_as;

  -- ═══════ 2. THE BASE RETROFIT, per token, through the one path ═══════════════════════════════
  for i in 1 .. array_length(v_plan, 1) loop
    v_tok := v_plan[i][1]; v_sch := v_plan[i][2]; v_tbl := v_plan[i][3]; v_vis := v_plan[i][4];
    v_res := platform.retrofit_entity(v_sch, v_tbl, v_tok, 'system', null, null, null, null, v_vis, null);
    raise notice 'dd173b2: %', v_res;
  end loop;

  -- ═══════ 2b. THE WRITE AXIS, WHICH THE READ GATE DOES NOT MEASURE ═══════════════════════════
  -- The access delta probes READS. Superseding these tables' hand-written policies also replaces
  -- their WRITE lanes, and one of them is not the generated lane's shape: `ref_admin` on the four
  -- `tool` catalogs admits `public.is_admin()` (a row in `admin.admins`) beside
  -- `is_platform_admin()`, and the generated staff lane reads only the latter. So the narrowing is
  -- MEASURED before it is accepted: if a single person is in admin.admins and is not a platform
  -- admin, this file takes a real capability away from them and must not run.
  select count(*), count(*) filter (where exists (select 1 from public.current_user_is_admin c
                                                   where c.user_id = a.user_id and c.is_admin))
    into v_admins, v_admins_also_platform from admin.admins a;
  if v_admins <> v_admins_also_platform then
    raise exception
      'dd173b2: % of % admin.admins member(s) are NOT platform admins, so superseding ref_admin would take away a write lane they hold today. Name them and decide before this file runs again.',
      v_admins - v_admins_also_platform, v_admins;
  end if;
  raise notice 'dd173b2: all % admin.admins member(s) are also platform admins — superseding ref_admin narrows nobody''s writes today', v_admins;

  -- ═══════ 3. SUPERSEDE BY NAME, then GENERATE, one pass per token ═════════════════════════════
  foreach f in array v_bespoke loop
    v_tok   := split_part(f, '|', 1);
    v_names := string_to_array(split_part(f, '|', 2), ',');
    select et.schema_name, et.table_name into v_sch, v_tbl
      from platform.entity_types et where et.token = v_tok and et.is_active;

    select coalesce(array_agg(pol.polname order by pol.polname), '{}') into v_live
      from pg_policy pol
     where pol.polrelid = format('%I.%I', v_sch, v_tbl)::regclass
       and not (pol.polname = any (iam.generated_policy_names()));
    v_extra := array(select unnest(v_live) except select unnest(v_names));
    if v_extra <> '{}' then
      raise exception
        'dd173b2: %.% carries hand-written policy/policies % that this file has never seen. Nothing was dropped. A policy nobody enumerated is not superseded on a guess — re-census and re-write this file.',
        v_sch, v_tbl, array_to_string(v_extra, ', ');
    end if;
    v_drop := array(select unnest(v_names) intersect select unnest(v_live));
    if cardinality(v_drop) > 0 then
      perform iam.supersede_bespoke_policies(v_sch, v_tbl, v_drop, format(
        'DD-173 batch 2: %s is a platform-wide reference catalog registered by DD-159 batch 1 and refused by iam.apply_rls until now for a missing base contract. Its base contract is retrofitted in this same transaction and its hand-written policy set is superseded by the generated set iam.apply_rls emits for the system variant. Kept unsuperseded the two would OR together and leave the table wider than either regime intended.',
        v_tok));
    end if;
    perform iam.apply_rls(v_sch, v_tbl, v_tok, 'system');
    raise notice 'dd173b2: generated % (%.%), superseding % of % declared bespoke name(s)',
      v_tok, v_sch, v_tbl, cardinality(v_drop), cardinality(v_names);
  end loop;

  -- ═══════ 4. THE GATE — the same probe, the same instant, the same cast ═══════════════════════
  v_after := iam.access_delta_snapshot('DD-173 b2 AFTER', v_principals, v_tokens, 400000,
    'DD-173 batch 2 confirmation, pinned to the same instant as the baseline', v_as);
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
        raise notice 'dd173b2: WIDER (approved by name) % for % : % -> %', r.token, r.principal_label, r.count_before, r.count_after;
      end if;

    elsif r.verdict = 'UNPROVEN' then
      -- 🚨 UNPROVEN IS NOT A PASS, AND IT IS NOT NARROWER EITHER. It means the probe could not
      -- compare the two reads ROW BY ROW. Here the cause is structural and known: before this
      -- file these tables had no uuid `id`, so `iam.access_delta_snapshot` hashed the whole row
      -- text instead of collecting ids — and this file ADDS columns to every one of them, so that
      -- hash was always going to differ. The count is unchanged, which is necessary and not
      -- sufficient. What makes it sufficient is that the count IS the whole table: if a principal
      -- read every row before and every row after, there is no "which rows" left to ask. Any pair
      -- where that is not true aborts the migration rather than being waved through.
      execute format('select count(*) from %I.%I', r.schema_name, r.table_name) into v_total;
      if r.count_before = r.count_after and r.count_after = v_total then
        v_unproven_ok := array_append(v_unproven_ok,
          format('%s for %s (all %s rows before and after)', r.token, r.principal_label, v_total));
      else
        v_unapproven_hard := array_append(v_unapproven_hard,
          format('UNPROVEN %s for %s (%s -> %s of %s rows) — the row-by-row comparison is impossible and the read is not the whole table, so nobody can say which rows moved',
                 r.token, r.principal_label, r.count_before, r.count_after, v_total));
      end if;

    elsif r.verdict = 'UNMEASURED' then
      v_unapproved := array_append(v_unapproved,
        format('UNMEASURED %s for %s — the probe itself failed; a gate that could not read proves nothing', r.token, r.principal_label));

    else
      v_narrower := array_append(v_narrower,
        format('%s for %s (%s -> %s)', r.token, r.principal_label, r.count_before, r.count_after));
      raise notice 'dd173b2: NARROWED % for % : % -> %', r.token, r.principal_label, r.count_before, r.count_after;
    end if;
  end loop;
  if cardinality(v_unapproven_hard) > 0 then
    raise exception 'dd173b2: % read(s) this gate could not prove either way: %',
      cardinality(v_unapproven_hard), array_to_string(v_unapproven_hard, ' ; ');
  end if;
  if cardinality(v_unapproved) > 0 then
    raise exception
      'dd173b2: % door(s) opened that nobody approved by name: %. Over-opening and over-tightening are the same class of defect and neither ships on a count.',
      cardinality(v_unapproved), array_to_string(v_unapproved, ' ; ');
  end if;
  raise notice 'dd173b2: 0 unapproved widenings, % narrowing(s), % pair(s) whole-table-identical (id-hash UNPROVEN by construction, resolved), across % tokens x % principals',
    cardinality(v_narrower), cardinality(v_unproven_ok), cardinality(v_tokens), cardinality(v_principals);

  -- ═══════ 5. CERTIFICATION — this batch's whole point is that BOTH axes are now clean ═════════
  -- DD-159 batch 2 could only say "0 POLICY FAIL, and the base FAILs are named not absorbed",
  -- because a base retrofit was another lane's decision. This IS that lane, so a base-contract
  -- FAIL here is this file failing, and it aborts exactly like a policy FAIL.
  for r in select et.token, et.schema_name, et.table_name, et.rls_variant
             from platform.entity_types et where et.token = any (v_tokens) order by et.token
  loop
    for v in select * from iam.verify_canonical(r.schema_name, r.table_name, r.token, r.rls_variant)
              where status = 'FAIL'
    loop
      f := format('%s / %s: %s', r.token, v.check_name, coalesce(v.detail,''));
      if v.check_name = any (v_policy_checks) then v_policy_fail := array_append(v_policy_fail, f);
      else v_base_fail := array_append(v_base_fail, f); end if;
    end loop;
  end loop;
  if cardinality(v_base_fail) > 0 then
    raise exception 'dd173b2: % base-contract FAIL(s) remain after the retrofit: %. This file exists to close exactly these.',
      cardinality(v_base_fail), array_to_string(v_base_fail, ' ; ');
  end if;
  if cardinality(v_policy_fail) > 0 then
    raise exception 'dd173b2: % POLICY-family FAIL(s) after generation: %. The generator produced a policy set its own certification refuses; this round does not stand.',
      cardinality(v_policy_fail), array_to_string(v_policy_fail, ' ; ');
  end if;
  raise notice 'dd173b2: iam.verify_canonical — 0 base-contract FAIL and 0 POLICY-family FAIL across all 9 tokens';

  -- ═══════ 6. ACKNOWLEDGE THIS FILE'S OWN GUARD FIRINGS ════════════════════════════════════════
  select count(*) into v_acked from platform.ddl_guard_log
   where rule = 'nullable_org' and acknowledged_at is null and occurred_at >= v_as;
  if v_acked > 0 then
    perform platform.ddl_guard_ack(
      p_reason => 'DD-173 batch 2: platform.retrofit_entity added organization_id and set it NOT NULL in the same call, and raises if any row would be left without an organization. The guard saw the ADD COLUMN half of that pair. The alternative (add column not null default <org>) is hard-blocked by this same guard, and combining add + drop-default into one ALTER is rejected by Postgres.',
      p_by     => 'DD-173 batch 2 migration',
      p_rule   => 'nullable_org',
      p_before => null,
      p_ids    => (select array_agg(id) from platform.ddl_guard_log
                    where rule = 'nullable_org' and acknowledged_at is null and occurred_at >= v_as));
    raise notice 'dd173b2: acknowledged % nullable_org guard firing(s) raised by this file', v_acked;
  end if;
end $dd173b2$;
