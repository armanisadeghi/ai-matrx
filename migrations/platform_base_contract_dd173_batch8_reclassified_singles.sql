-- platform_base_contract_dd173_batch8_reclassified_singles — DD-173 BATCH 8 (4 tokens).
--
-- THE FOUR remaining tokens B-65 §5f held back as "registered with the WRONG variant". Each one is
-- decided here from the DATA and the CALLERS, corrected in the registry with a stored reason, and
-- then either generated under the gate or refused by construction:
--
--   `user_secret_grant` (users.user_secret_grants) — registered `entity`. It is NOT an entity: it
--     is an INPUT CONSUMED BY THE ACCESS RESOLVER. Four live policies on the two vault tables read
--     it by name — credential_items_org_member_read, credential_items_personal_grantee_read,
--     user_secrets_org_member_read, user_secrets_personal_grantee_read — and `iam.apply_rls`'s own
--     definition of machinery is "machinery owns inputs consumed by the access resolver". So it is
--     re-registered `audit_class = 'machinery'` and the generator refuses it BY CONSTRUCTION rather
--     than by accident, exactly as DD-185's chair ruling settled `admin_user` and
--     `admin_markdown_sample`. Its hand-written door (`user_secret_grants_self_read` + the three
--     restrictive platform-admin write walls) stays as its recorded policy. This is also the answer
--     to DD-137b11's standing "do not run iam.apply_rls on the vault tables without that lane's
--     sign-off": nothing is generated here, so no sign-off is being assumed.
--
--   `guardian_link` (education.guardian_link) — registered `entity`, class `private`. Every client
--     operation on it is a DECLARED SECURITY DEFINER door: guardian_list_links, guardian_grant,
--     guardian_respond, guardian_unlink, guardian_confirm_verification, edu_coppa_gate_for — four
--     of them already in `platform.client_callable_door`. Its direct table read
--     (`guardian_link_select`: guardian_user_id = uid OR student_user_id = uid) is a SECOND door
--     beside the declared one, and it is a lane no variant in db-rules §6d-3 can express: `entity`
--     keys on one `created_by`, `personal` on one `user_id`, and this row has TWO parties. A safe
--     path beside an unsafe one is not a fix and neither is a second path beside a declared one —
--     so the table becomes `restricted` (server/RPC only) and the ONE client that read the table
--     directly, `app/api/education/coppa-verification/route.ts`, is repointed to
--     `guardian_list_links()` in the same change. Its three restrictive platform-admin write walls
--     are superseded: `restricted` has no client write lane at all, so the walls have nothing left
--     to wall.
--
--   `scrape_parsed_page` (scraper.scrape_parsed_page) — registered `entity`, class `confidential`.
--     The data settles it: all 8,032 rows carry `user_id IS NULL` and `is_public = false`. aidream
--     says so in its own words (`services/auto_ingest/reconciliation.py`): "scrape_parsed_page ->
--     user_id (no org; NULL-user system rows skipped)". So `personal` is impossible (its contract
--     needs user_id NOT NULL and there is no source to backfill it from), and `entity` would key on
--     an owner column that is empty on every row. It is server-produced scrape output: `restricted`.
--     Its `owner_insert` / `owner_update` / `owner_delete` lanes key on `user_id = auth.uid()`, so
--     with every row's user_id NULL they match nothing today; no client in matrx-frontend,
--     matrx-extend or aidream writes this table from a client channel, and every real writer is the
--     scraper service on `service_role`, which keeps `svc_all`.
--
--   `math_problem` (education.math_problems) — registered `entity`, class `public`. `created_by` is
--     NULL on all 12 rows and every row is published and readable signed-out: it is not somebody's
--     private object, it is platform-published course content — the `system` variant, exactly like
--     the reference catalogs of batches 1, 2 and 4. `visibility` is derived from the row's own
--     `is_published` so the anonymous read of a published problem is preserved to the row and an
--     unpublished one is not published to the open web by the retrofit.
--
-- The named org strategy, the re-read bespoke superset, the one-transaction gate, the UNPROVEN
-- resolution and the guard acknowledgement are batch 1's shape and are documented there.
set local lock_timeout = '20s';

do $dd173b8$
declare
  v_as         timestamptz := now();
  v_before     uuid; v_after uuid; r record;
  v_unapproved text[] := '{}';
  v_unapproven_hard text[] := '{}';
  v_unproven_ok text[] := '{}';
  v_narrower   text[] := '{}';
  v_total      bigint;
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
    'a4955b5c-d524-4d72-a90e-0658d5d51148',  -- developer111@pixelium.uk: a NON-admin
    'c5e92166-e148-4e73-926e-83af0c453665',  -- seo@titaniumsuccess.com: a plain member of a real organization
    '34ed4fc3-c527-4819-99bf-15c26603b261',  -- arman@titaniumsuccess.com: admin of that organization, NOT staff
    '4060701e-706a-4c76-b3ca-0bbc69fa5a14',  -- test@test.com: a non-member, and the STUDENT on the one guardian_link
    '00000000-0000-0000-0000-000000000000'   -- anonymous, no JWT — the one that matters on math_problem
  ]::uuid[];
  v_tokens text[] := array['guardian_link','scrape_parsed_page','math_problem','user_secret_grant'];
  v_bespoke constant text[] := array[
    'guardian_link|guardian_link_select,platform_admin_delete_only,platform_admin_insert_only,platform_admin_update_only',
    'scrape_parsed_page|owner_delete,owner_insert,owner_update',
    'math_problem|Authenticated users can view all math problems,Public can view published math problems'];
  -- A WIDENING IS APPROVED BY NAME OR IT IS A FAILURE. 'token|principal'.
  v_approved constant text[] := '{}';
  v_tok text; v_sch text; v_tbl text; v_names text[]; v_variant text;
  -- The declared door that replaces guardian_link's direct table read.
  v_door_rows int;
begin
  -- ═══════ 0. THE REGISTRY CORRECTIONS, each with its reason stored in the row ═════════════════
  update platform.entity_types et set
    audit_class = 'machinery',
    audit_class_reason =
      'DD-173 B-83 (2026-09-13): users.user_secret_grants is an INPUT CONSUMED BY THE ACCESS RESOLVER, not an entity. Four live policies read it by name — credential_items_org_member_read, credential_items_personal_grantee_read, user_secrets_org_member_read, user_secrets_personal_grantee_read — which is iam.apply_rls''s own definition of machinery. Registered machinery so the generator refuses it BY CONSTRUCTION instead of by accident; the hand-written door (user_secret_grants_self_read plus three restrictive platform-admin write walls) stays as its recorded policy. Same ruling shape as admin_user and admin_markdown_sample (DD-185). It also honours DD-137b11''s standing instruction not to run iam.apply_rls on the vault tables without that lane''s sign-off: nothing is generated.',
    notes = concat_ws(' ', et.notes,
      '[DD-173 B-83, 2026-09-13] audit_class entity -> machinery; rls_variant left as recorded because a machinery token is never generated.')
   where et.token = 'user_secret_grant' and et.is_active;

  update platform.entity_types et set
    rls_variant = 'restricted',
    -- §3.1 derivation two (iam.class_lanes: platform_admin_lane is FALSE for `private`): our own
    -- staff go through the declared door too. iam.verify_canonical FAILs the token until the
    -- registry says so, and it is right to — the flag is what stops apply_rls emitting the
    -- platform_admin_all lane on the next regeneration.
    suppress_platform_admin_lane = true,
    data_class_reason = concat_ws(' ', et.data_class_reason,
      '[DD-173 B-83, 2026-09-13] class private kept; the variant is what changed.'),
    notes = concat_ws(' ', et.notes,
      '[DD-173 B-83, 2026-09-13] rls_variant entity -> restricted. Every client operation is a DECLARED SECURITY DEFINER door (guardian_list_links / guardian_grant / guardian_respond / guardian_unlink are in platform.client_callable_door; guardian_confirm_verification and edu_coppa_gate_for are server-side). The direct guardian_link_select read was a SECOND door beside the declared one, and it expresses a lane no variant can: the row has TWO parties (guardian and student) and both entity (one created_by) and personal (one user_id) key on ONE. The declared door serves both parties and is unaffected by RLS, so the capability is kept and the second path is closed.')
   where et.token = 'guardian_link' and et.is_active;

  update platform.entity_types et set
    rls_variant = 'restricted',
    -- §3.1 derivation two: iam.class_lanes says `confidential` has no platform-admin lane.
    suppress_platform_admin_lane = true,
    notes = concat_ws(' ', et.notes,
      '[DD-173 B-83, 2026-09-13] rls_variant entity -> restricted. All 8,032 rows carry user_id IS NULL and is_public = false: this is server-produced scrape output with no owner, which aidream states in services/auto_ingest/reconciliation.py ("scrape_parsed_page -> user_id (no org; NULL-user system rows skipped)"). personal is impossible (its contract needs user_id NOT NULL and nothing can backfill it) and entity would key on an owner column empty on every row. Every real writer is the scraper service on service_role, which keeps svc_all.')
   where et.token = 'scrape_parsed_page' and et.is_active;

  update platform.entity_types et set
    rls_variant = 'system',
    notes = concat_ws(' ', et.notes,
      '[DD-173 B-83, 2026-09-13] rls_variant entity -> system. created_by is NULL on all 12 rows and every row is published and readable signed-out: platform-published course content, not somebody''s private object — the same shape as the reference catalogs of DD-173 batches 1, 2 and 4. visibility is derived from the row''s own is_published so the anonymous read of a published problem is preserved and an unpublished one is not published to the open web.')
   where et.token = 'math_problem' and et.is_active;

  -- ═══════ 1. THE BEFORE, pinned to this transaction's instant ═════════════════════════════════
  v_before := iam.access_delta_snapshot('DD-173 b8 BEFORE', v_principals, v_tokens, 400000,
    'DD-173 batch 8: four reclassified tokens, before the retrofit and generation', v_as);
  raise notice 'dd173b8: baseline % over % tokens x % principals, pinned at %',
    v_before, cardinality(v_tokens), cardinality(v_principals), v_as;

  -- ═══════ 2. THE BASE RETROFIT ════════════════════════════════════════════════════════════════
  -- guardian_link: the link is about the STUDENT, so the row's organization is the student's own
  -- personal organization. It is lineage here, not an access key: `restricted` has no org lane.
  v_res := platform.retrofit_entity('education','guardian_link','guardian_link','personal', null, 'student_user_id', null, null, null, null);
  raise notice 'dd173b8: %', v_res;
  -- scrape_parsed_page: every row is a platform scrape with no user. db-rules §2 — the launching
  -- operation supplies the system org EXPLICITLY; the database never picks one.
  v_res := platform.retrofit_entity('scraper','scrape_parsed_page','scrape_parsed_page','system', null, 'user_id', null, null, null, null);
  raise notice 'dd173b8: %', v_res;
  -- math_problem: platform-published content in the system organization; visibility from the row.
  v_res := platform.retrofit_entity('education','math_problems','math_problem','system', null, null, null, null,
             $x$case when coalesce(t.is_published, false) then 'public' else 'internal' end$x$, null);
  raise notice 'dd173b8: %', v_res;
  -- user_secret_grant is NOT retrofitted: a machinery token is never generated, so it has no
  -- variant contract to meet. Saying that out loud is the point — it is closed, not skipped.
  raise notice 'dd173b8: user_secret_grant NOT retrofitted and NOT generated — machinery by classification (see the stored audit_class_reason).';

  -- ═══════ 3. SUPERSEDE BY NAME, then GENERATE, one pass per token ═════════════════════════════
  foreach f in array v_bespoke loop
    v_tok   := split_part(f, '|', 1);
    v_names := array_remove(string_to_array(split_part(f, '|', 2), ','), '');
    select et.schema_name, et.table_name, et.rls_variant into v_sch, v_tbl, v_variant
      from platform.entity_types et where et.token = v_tok and et.is_active;

    select coalesce(array_agg(pol.polname order by pol.polname), '{}') into v_live
      from pg_policy pol
     where pol.polrelid = format('%I.%I', v_sch, v_tbl)::regclass
       and not (pol.polname = any (iam.generated_policy_names()));
    v_extra := array(select unnest(v_live) except select unnest(v_names));
    if v_extra <> '{}' then
      raise exception
        'dd173b8: %.% carries hand-written policy/policies % that this file has never seen. Nothing was dropped. A policy nobody enumerated is not superseded on a guess — re-census and re-write this file.',
        v_sch, v_tbl, array_to_string(v_extra, ', ');
    end if;
    v_drop := array(select unnest(v_names) intersect select unnest(v_live));
    if cardinality(v_drop) > 0 then
      perform iam.supersede_bespoke_policies(v_sch, v_tbl, v_drop, format(
        'DD-173 batch 8 (B-83): %s was registered with the wrong rls_variant and is corrected to `%s` in this same transaction, with the reason stored on its registry row. Its hand-written policy set is superseded by the generated set iam.apply_rls emits for that variant. Kept unsuperseded the two regimes would OR together and leave the table wider than either intended.',
        v_tok, v_variant));
    end if;
    perform iam.apply_rls(v_sch, v_tbl, v_tok, v_variant);
    raise notice 'dd173b8: generated % (%.%) as %, superseding % of % declared bespoke name(s)',
      v_tok, v_sch, v_tbl, v_variant, cardinality(v_drop), cardinality(v_names);
  end loop;

  -- ═══════ 3b. THE DECLARED DOOR STILL SERVES BOTH PARTIES ═════════════════════════════════════
  -- guardian_link's direct table read is gone. That is only honest if the door that replaces it
  -- actually answers — for the party who is NOT the row's creator, which is the half a
  -- created_by-keyed variant would have lost. Measured live as test@test.com (the STUDENT on the
  -- one live link) and as the guardian, through the RPC, under the authenticated role.
  perform set_config('request.jwt.claims',
    json_build_object('sub', '4060701e-706a-4c76-b3ca-0bbc69fa5a14', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_door_rows from public.guardian_list_links();
  execute 'reset role';
  perform set_config('request.jwt.claims', null, true);
  if v_door_rows < 1 then
    raise exception
      'dd173b8: THE DECLARED DOOR DOES NOT ANSWER. test@test.com is the student on a live education.guardian_link row and public.guardian_list_links() returned % row(s) for them. Closing the direct table read is only safe because that door serves both parties; it does not, so nothing ships.',
      v_door_rows;
  end if;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '87a6e699-3622-4869-8843-d0867456c0dd', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_door_rows from public.guardian_list_links();
  execute 'reset role';
  perform set_config('request.jwt.claims', null, true);
  if v_door_rows < 1 then
    raise exception
      'dd173b8: THE DECLARED DOOR DOES NOT ANSWER FOR THE GUARDIAN — public.guardian_list_links() returned % row(s) for the guardian on a live link.', v_door_rows;
  end if;
  raise notice 'dd173b8: the declared door answers for BOTH parties of the live guardian_link row (student and guardian), with the direct table read gone.';

  -- ═══════ 4. THE GATE ═════════════════════════════════════════════════════════════════════════
  v_after := iam.access_delta_snapshot('DD-173 b8 AFTER', v_principals, v_tokens, 400000,
    'DD-173 batch 8 confirmation, pinned to the same instant as the baseline', v_as);
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
        raise notice 'dd173b8: WIDER (approved by name) % for % : % -> %', r.token, r.principal_label, r.count_before, r.count_after;
      end if;
    elsif r.verdict = 'UNPROVEN' then
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
      raise notice 'dd173b8: NARROWED % for % : % -> %', r.token, r.principal_label, r.count_before, r.count_after;
    end if;
  end loop;
  if cardinality(v_unapproven_hard) > 0 then
    raise exception 'dd173b8: % read(s) this gate could not prove either way: %',
      cardinality(v_unapproven_hard), array_to_string(v_unapproven_hard, ' ; ');
  end if;
  if cardinality(v_unapproved) > 0 then
    raise exception
      'dd173b8: % door(s) opened that nobody approved by name: %. Over-opening and over-tightening are the same class of defect and neither ships on a count.',
      cardinality(v_unapproved), array_to_string(v_unapproved, ' ; ');
  end if;
  raise notice 'dd173b8: 0 unapproved widenings, % narrowing(s), % pair(s) whole-table-identical, across % tokens x % principals',
    cardinality(v_narrower), cardinality(v_unproven_ok), cardinality(v_tokens), cardinality(v_principals);

  -- ═══════ 5. CERTIFICATION ════════════════════════════════════════════════════════════════════
  -- user_secret_grant is deliberately not in this loop: iam.verify_canonical measures a table
  -- against the variant contract the generator would enforce, and a machinery token is never
  -- generated. Certifying it here would be certifying something nobody applies.
  for r in select et.token, et.schema_name, et.table_name, et.rls_variant
             from platform.entity_types et
            where et.token = any (array['guardian_link','scrape_parsed_page','math_problem']) order by et.token
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
    raise exception 'dd173b8: % base-contract FAIL(s) remain after the retrofit: %. This file exists to close exactly these.',
      cardinality(v_base_fail), array_to_string(v_base_fail, ' ; ');
  end if;
  if cardinality(v_policy_fail) > 0 then
    raise exception 'dd173b8: % POLICY-family FAIL(s) after generation: %. The generator produced a policy set its own certification refuses; this round does not stand.',
      cardinality(v_policy_fail), array_to_string(v_policy_fail, ' ; ');
  end if;
  raise notice 'dd173b8: iam.verify_canonical — 0 base-contract FAIL and 0 POLICY-family FAIL across the 3 generated tokens';

  -- ═══════ 6. ACKNOWLEDGE THIS FILE'S OWN GUARD FIRINGS ════════════════════════════════════════
  select count(*) into v_acked from platform.ddl_guard_log
   where rule = 'nullable_org' and acknowledged_at is null and occurred_at >= v_as;
  if v_acked > 0 then
    perform platform.ddl_guard_ack(
      p_reason => 'DD-173 batch 8 (B-83): platform.retrofit_entity added organization_id and set it NOT NULL in the same call, and raises if any row would be left without an organization. The guard saw the ADD COLUMN half of that pair.',
      p_by     => 'DD-173 batch 8 migration',
      p_rule   => 'nullable_org',
      p_before => null,
      p_ids    => (select array_agg(id) from platform.ddl_guard_log
                    where rule = 'nullable_org' and acknowledged_at is null and occurred_at >= v_as));
    raise notice 'dd173b8: acknowledged % nullable_org guard firing(s) raised by this file', v_acked;
  end if;
end $dd173b8$;
