-- platform_base_contract_dd173_batch6_confidential_system_dd185 — DD-173's LAST SIX, UNBLOCKED
-- (DD-173 residue §5b, lane B-77, after DD-185.)
--
-- B-65 held these six back BY NAME and said why: generating a `confidential` token through the
-- entity/system branch handed a NON-MEMBER the rows (0 -> 8 on meta.audit_exemption, 0 -> 4 on
-- admin.admin_markdown_samples, measured in a rolled-back rehearsal), because the §6e
-- system-organization arm ignored the class. `iam_system_org_arm_follows_the_class_dd185.sql`
-- closed that, `system_org_arm_respects_class` is GREEN on all 800 active tokens, and the six can
-- now be paid the way the other 35 were.
--
-- 🚨 TWO OF THEM ARE NOT A GENERATION PROBLEM, THEY ARE A REGISTRATION PROBLEM, and the chair
--    ruled on both. The registry is corrected FIRST, because generating a token whose registration
--    is wrong is how `tool_binding` would have silently removed a user's write lane (B-65 §5f).
--
--   * `admin_user` (admin.admins) -> `audit_class = machinery`. It is the input to
--     `public.is_admin()`, which policies across this database read. That is `iam.apply_rls`'s own
--     definition of machinery — "machinery owns inputs consumed by the access resolver" — so it is
--     refused BY CONSTRUCTION rather than by accident, and no base retrofit is owed. It has no
--     `id` column at all (its PK is `user_id`), which is the shape of a thing the resolver reads,
--     not a thing a user browses.
--   * `extract_sweep_state` (workflow.extract_sweep_state) -> `rls_variant = personal`,
--     `data_class = private`, `default_list_scope = mine`. Its PK is `user_id` and every row is
--     one person's sweep state. The `system` variant demands a `visibility` column that a per-user
--     state table has no business carrying, and §3.1 derivation one says a personal variant's
--     class is `private` — a personal row's user_id IS the whole access boundary.
--
-- 🚨 THE OTHER FOUR ARE STAFF/OPS CONFIGURATION AND THEY GO TO THE SYSTEM ORGANIZATION, which is
--    only safe to say now: before DD-185 that sentence meant "and every signed-in account may read
--    them". The gate below measures it rather than trusting it.
--
-- 🚨 EVERY STAFF READ GOES TO ZERO AND THAT IS THE DECLARED BEHAVIOUR. `iam.class_lanes` gives a
--    `confidential` class no platform-admin lane, so step 1b declares
--    `suppress_platform_admin_lane` before the generator reads it (DD-137b §3.1 derivation two).
--    These four are read by the SERVER — `service_role` keeps `svc_all` — and by the admin portal
--    through server-side routes; neither repo contains a client-side anon/authenticated SELECT of
--    any of them.
--
-- 🚨 ONE OF THE SIX IS HELD BACK BY NAME, AND IT IS THE `tool_binding` CLASS AGAIN (B-65 §5f).
--    `admin_markdown_sample` (admin.admin_markdown_samples) carries ONE hand-written policy,
--    `admin_markdown_samples_super_admin_all` — a full staff door — and
--    `components/admin/markdown-tester/samples-service.ts` reads and writes that table from the
--    BROWSER through the authenticated supabase client, not through a server route. Its class is
--    `confidential`, which closes the platform-staff lane (DD-137b §3.1 derivation two), so
--    generating it and superseding that policy would silently remove the admin Markdown Tester
--    from every member of staff — a capability removed inside a file whose subject is an access
--    leak, and invisible to a read-only access delta because the delta measures principals, and
--    every staff principal would simply go to zero "as declared".
--    THE DISPOSITION: this is a classification question, not a generation one. A staff tool whose
--    only readers ARE platform staff cannot be a class that closes the staff lane. It is either
--    `organization`-class on the Matrx System organization (staff read it as members of the
--    organization that owns it) or it keeps a declared bespoke door. Either answer is a ruling
--    with a read-lane consequence and it belongs with whoever owns the admin portal. Held, named,
--    and left exactly as it is — nothing in this file touches it.
--
-- The one-transaction shape (baseline -> registry -> retrofit -> supersede -> generate -> gate ->
-- certify -> acknowledge) and the UNPROVEN resolution are DD-173 batch 1's, documented there.
set local lock_timeout = '20s';

do $dd173b6$
declare
  v_as         timestamptz := now();
  v_before     uuid; v_after uuid; r record;
  v_unapproved text[] := '{}';
  v_hard       text[] := '{}';
  v_unproven_ok text[] := '{}';
  v_narrower   text[] := '{}';
  v_total      bigint;
  v_res        text;
  v_live       text[]; v_extra text[]; v_drop text[];
  v_policy_fail text[] := '{}'; v_base_fail text[] := '{}';
  f text; v record;
  v_acked      bigint;
  v_caught     text;
  v_policy_checks constant text[] := array[
    'policies_canonical','bespoke_policy_present','privacy_wall','personal_row_wall',
    'rls_enabled','anon_public_lane','class_lanes','class_lanes_match_policy',
    'system_org_arm_respects_class','component_anon_lane',
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
    '00000000-0000-0000-0000-000000000000'   -- anonymous, no JWT
  ]::uuid[];
  v_tokens text[] := array[
    'admin_user','app_log_muted_pattern','app_log_norm_exception',
    'audit_exemption','extract_sweep_state'];
  -- the four that are retrofitted and generated: token | schema | table | org strategy
  v_plan constant text[][] := array[
    array['app_log_muted_pattern','ops','app_log_muted_pattern','system'],
    array['app_log_norm_exception','ops','app_log_norm_exception','system'],
    array['audit_exemption','meta','audit_exemption','system'],
    -- `extract_sweep_state` is reclassified to the `personal` variant above, and its base contract
    -- is still owed: iam.verify_canonical wants the uuid identity, the organization column and its
    -- FK, `version` and `_touch_row` on it like any other table. The `personal` org strategy puts
    -- each row in ITS OWN USER'S personal organization, which changes no lane — the generated
    -- personal std_select is `user_id = auth.uid()` and reads no organization at all — but it
    -- means the row is addressable by the same rules as everything else (db-rules §2, NO NULL ORG).
    array['extract_sweep_state','workflow','extract_sweep_state','personal']];
  -- the SUPERSET of hand-written policy names this file was written against: 'token|a,b,c'
  v_bespoke constant text[] := array[
    'app_log_muted_pattern|',
    'app_log_norm_exception|',
    'audit_exemption|platform_admin_only',
    'extract_sweep_state|'];
  -- A WIDENING IS APPROVED BY NAME OR IT IS A FAILURE — and a name alone is not enough: §4a below
  -- RE-READS every row each of these two principals gains and asserts it is their own.
  -- `workflow.extract_sweep_state` becomes `personal`, so its access boundary becomes `user_id =
  -- auth.uid()`. Two principals who could read NONE of it now read exactly the one row that
  -- records THEIR OWN sweep state. That is a person reading their own data, which is the whole
  -- point of the personal variant; the same change takes the three platform admins from 6 (every
  -- user's state) to 1 (their own).
  v_approved constant text[] := array[
    'extract_sweep_state|developer111@pixelium.uk',
    'extract_sweep_state|test@test.com'];
  i int; v_tok text; v_sch text; v_tbl text; v_strat text; v_names text[];
begin
  -- ═══════ 1. THE BEFORE, pinned to this transaction's instant ═════════════════════════════════
  v_before := iam.access_delta_snapshot('DD-173 b6 BEFORE', v_principals, v_tokens, 400000,
    'DD-173 batch 6: the six confidential tokens B-65 held back on the §6e ruling, before', v_as);

  -- ═══════ 1a. THE REGISTRY CORRECTIONS, BEFORE ANY GENERATION ═════════════════════════════════
  update platform.entity_types
     set audit_class = 'machinery',
         audit_class_reason = 'DD-173/DD-185 (chair ruling): admin.admins is the input to public.is_admin(), read by policies across this database — iam.apply_rls''s own definition of machinery.',
         data_class_reason = 'DD-173/DD-185 (chair ruling): admin.admins is the input to public.is_admin(), which policies across this database read. iam.apply_rls''s own definition of machinery is a table owning inputs consumed by the access resolver, so this token is refused by construction rather than by accident. It has no id column at all; its PK is user_id.'
   where token = 'admin_user';
  update platform.entity_types
     set rls_variant = 'personal', data_class = 'private', default_list_scope = 'mine',
         data_class_reason = 'DD-173/DD-185 (chair ruling): workflow.extract_sweep_state is keyed on user_id and every row is one person''s sweep state. §3.1 derivation one — a personal variant emits no org, staff or sharing lane, so the class is private.'
   where token = 'extract_sweep_state';
  raise notice 'dd173b6: registry corrected — admin_user -> machinery, extract_sweep_state -> personal/private/mine';

  -- `admin_user` must now be REFUSED by the generator, by name. A ruling nobody can observe is a
  -- ruling that gets undone by the next regeneration sweep.
  begin
    perform iam.apply_rls('admin', 'admins', 'admin_user', 'system');
    raise exception 'dd173b6: iam.apply_rls GENERATED admin_user after it was declared machinery. The declaration is not being read, so the refusal this correction relies on does not exist.';
  exception when others then
    v_caught := sqlerrm;
    if v_caught like 'dd173b6:%' then raise; end if;
    raise notice 'dd173b6: admin_user is refused by construction, as declared: %', v_caught;
  end;

  -- ═══════ 1b. THE STAFF-LANE DECLARATION THAT MUST PRECEDE THE GENERATION ═════════════════════
  for r in select et.token, l.platform_admin_lane, coalesce(et.suppress_platform_admin_lane,false) sup
             from platform.entity_types et, lateral iam.class_lanes(et.token) l
            where et.token = any (v_tokens) and et.token <> 'admin_user' order by et.token
  loop
    if not r.platform_admin_lane and not r.sup then
      update platform.entity_types set suppress_platform_admin_lane = true where token = r.token;
      raise notice 'dd173b6: % declares suppress_platform_admin_lane — its class has no staff lane', r.token;
    elsif r.platform_admin_lane and r.sup then
      raise exception 'dd173b6: % declares suppress_platform_admin_lane but its class HAS a staff lane. The registry and the class disagree; nothing was generated.', r.token;
    end if;
  end loop;

  -- ═══════ 2. THE BASE RETROFIT, per token, through the one path ═══════════════════════════════
  for i in 1 .. array_length(v_plan, 1) loop
    v_tok := v_plan[i][1]; v_sch := v_plan[i][2]; v_tbl := v_plan[i][3]; v_strat := v_plan[i][4];
    -- `internal` is the only honest answer for all four: `public` would publish staff/ops
    -- configuration to anonymous readers and `personal` would hide it from the organization that
    -- owns it. platform.retrofit_entity refuses to pick one itself, and it is right to.
    -- `internal` is the only honest answer for the three `system` catalogs: `public` would publish
    -- staff/ops configuration to anonymous readers and `personal` would hide it from the
    -- organization that owns it. platform.retrofit_entity refuses to pick one itself, and it is
    -- right to. A `personal` table gets NO visibility column: its user_id is the whole boundary
    -- and a second access authority beside it is exactly what §6d-3 forbids.
    if v_tok = 'extract_sweep_state' then
      v_res := platform.retrofit_entity(v_sch, v_tbl, v_tok, v_strat, p_owner_col => 'user_id');
    else
      v_res := platform.retrofit_entity(v_sch, v_tbl, v_tok, v_strat, p_visibility_expr => '''internal''');
    end if;
    raise notice 'dd173b6: %', v_res;
  end loop;

  -- ═══════ 3. SUPERSEDE BY NAME, then GENERATE ═════════════════════════════════════════════════
  foreach f in array v_bespoke loop
    v_tok   := split_part(f, '|', 1);
    v_names := array_remove(string_to_array(split_part(f, '|', 2), ','), '');
    select et.schema_name, et.table_name into v_sch, v_tbl
      from platform.entity_types et where et.token = v_tok and et.is_active;

    select coalesce(array_agg(pol.polname order by pol.polname), '{}') into v_live
      from pg_policy pol
     where pol.polrelid = format('%I.%I', v_sch, v_tbl)::regclass
       and not (pol.polname = any (iam.generated_policy_names()));
    v_extra := array(select unnest(v_live) except select unnest(v_names));
    if v_extra <> '{}' then
      raise exception
        'dd173b6: %.% carries hand-written policy/policies % that this file has never seen. Nothing was dropped. A policy nobody enumerated is not superseded on a guess — re-census and re-write this file.',
        v_sch, v_tbl, array_to_string(v_extra, ', ');
    end if;
    v_drop := array(select unnest(v_names) intersect select unnest(v_live));
    if cardinality(v_drop) > 0 then
      perform iam.supersede_bespoke_policies(v_sch, v_tbl, v_drop, format(
        'DD-173 batch 6: %s is one of the six tokens B-65 held back on the §6e system-organization ruling. DD-185 settled it, its base contract is retrofitted in this same transaction, and its hand-written policy set is superseded by the generated set. meta.audit_exemption''s `platform_admin_only` is a full staff door on a `confidential` token, which is the lane DD-137b closes; its readers are iam.verify_canonical and the audit machinery, which run as service_role and keep `svc_all`, and neither repo contains a client-side SELECT of it (checked by name before this file was written).', v_tok));
    end if;
    perform iam.apply_rls(v_sch, v_tbl, v_tok,
      (select et.rls_variant from platform.entity_types et where et.token = v_tok));
    raise notice 'dd173b6: generated % (%.%) as %', v_tok, v_sch, v_tbl,
      (select et.rls_variant from platform.entity_types et where et.token = v_tok);
  end loop;

  -- ═══════ 4. THE GATE ═════════════════════════════════════════════════════════════════════════
  v_after := iam.access_delta_snapshot('DD-173 b6 AFTER', v_principals, v_tokens, 400000,
    'DD-173 batch 6 confirmation, pinned to the same instant as the baseline', v_as);
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
        raise notice 'dd173b6: WIDER (approved by name) % for % : % -> %', r.token, r.principal_label, r.count_before, r.count_after;
      end if;
    elsif r.verdict = 'UNPROVEN' then
      -- UNPROVEN is not a pass and is not NARROWER: the probe could not compare the two reads row
      -- by row. Here the cause is structural and known — these tables had no uuid `id` before this
      -- file, so the snapshot hashed the whole row text, and this file ADDS columns. It is
      -- resolved only when the read IS the whole table before and after; anything else aborts.
      execute format('select count(*) from %I.%I', r.schema_name, r.table_name) into v_total;
      if r.count_before = r.count_after and r.count_after = v_total then
        v_unproven_ok := array_append(v_unproven_ok,
          format('%s for %s (all %s rows before and after)', r.token, r.principal_label, v_total));
      else
        v_hard := array_append(v_hard,
          format('UNPROVEN %s for %s (%s -> %s of %s rows) — the row-by-row comparison is impossible and the read is not the whole table, so nobody can say which rows moved',
                 r.token, r.principal_label, r.count_before, r.count_after, v_total));
      end if;
    elsif r.verdict = 'UNMEASURED' then
      v_unapproved := array_append(v_unapproved,
        format('UNMEASURED %s for %s — the probe itself failed; a gate that could not read proves nothing', r.token, r.principal_label));
    else
      v_narrower := array_append(v_narrower,
        format('%s for %s (%s -> %s)', r.token, r.principal_label, r.count_before, r.count_after));
      raise notice 'dd173b6: NARROWED % for % : % -> %', r.token, r.principal_label, r.count_before, r.count_after;
    end if;
  end loop;
  -- ═══════ 4a. THE ROW-LEVEL RE-READ BEHIND THE TWO APPROVED WIDENINGS ═════════════════════════
  -- A count going up is never approved on its name alone. Each principal below is impersonated and
  -- asked to read the table; every row that comes back must carry THEIR user_id.
  for r in select unnest(array[
             'a4955b5c-d524-4d72-a90e-0658d5d51148'::uuid,
             '4060701e-706a-4c76-b3ca-0bbc69fa5a14'::uuid]) as uid
  loop
    perform set_config('request.jwt.claims', json_build_object('sub', r.uid, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into v_total from workflow.extract_sweep_state where user_id is distinct from r.uid;
    execute 'reset role';
    perform set_config('request.jwt.claims', null, true);
    if v_total <> 0 then
      raise exception 'dd173b6: the approved widening on extract_sweep_state is NOT a person reading their own row — % can read % row(s) belonging to somebody else. The approval is withdrawn by this assertion.', r.uid, v_total;
    end if;
  end loop;
  raise notice 'dd173b6: the two approved widenings re-read row by row — each principal reads only rows whose user_id is their own';

  if cardinality(v_hard) > 0 then
    raise exception 'dd173b6: % read(s) this gate could not prove either way: %', cardinality(v_hard), array_to_string(v_hard, ' ; ');
  end if;
  if cardinality(v_unapproved) > 0 then
    raise exception 'dd173b6: % door(s) opened that nobody approved by name: %. Over-opening and over-tightening are the same class of defect and neither ships on a count.',
      cardinality(v_unapproved), array_to_string(v_unapproved, ' ; ');
  end if;
  raise notice 'dd173b6: 0 unapproved widenings, % narrowing(s), % whole-table-identical UNPROVEN pair(s)',
    cardinality(v_narrower), cardinality(v_unproven_ok);

  -- ═══════ 5. CERTIFICATION ════════════════════════════════════════════════════════════════════
  for r in select et.token, et.schema_name, et.table_name, et.rls_variant
             from platform.entity_types et where et.token = any (v_tokens) and et.token <> 'admin_user' order by et.token
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
    raise exception 'dd173b6: % base-contract FAIL(s) remain after the retrofit: %. This file exists to close exactly these.',
      cardinality(v_base_fail), array_to_string(v_base_fail, ' ; ');
  end if;
  if cardinality(v_policy_fail) > 0 then
    raise exception 'dd173b6: % POLICY-family FAIL(s) after generation: %. The generator produced a policy set its own certification refuses; this round does not stand.',
      cardinality(v_policy_fail), array_to_string(v_policy_fail, ' ; ');
  end if;
  raise notice 'dd173b6: iam.verify_canonical — 0 base-contract FAIL and 0 POLICY-family FAIL across the five generated/declared tokens';

  -- ═══════ 6. ACKNOWLEDGE THIS FILE'S OWN GUARD FIRINGS ════════════════════════════════════════
  select count(*) into v_acked from platform.ddl_guard_log
   where rule = 'nullable_org' and acknowledged_at is null and occurred_at >= v_as;
  if v_acked > 0 then
    perform platform.ddl_guard_ack(
      p_reason => 'DD-173 batch 6: platform.retrofit_entity added organization_id and set it NOT NULL in the same call, and raises if any row would be left without an organization. The guard saw the ADD COLUMN half of that pair; the alternative is hard-blocked by this same guard.',
      p_by     => 'DD-173 batch 6 migration',
      p_rule   => 'nullable_org',
      p_before => null,
      p_ids    => (select array_agg(id) from platform.ddl_guard_log
                    where rule = 'nullable_org' and acknowledged_at is null and occurred_at >= v_as));
    raise notice 'dd173b6: acknowledged % nullable_org guard firing(s) raised by this file', v_acked;
  end if;
end $dd173b6$;
