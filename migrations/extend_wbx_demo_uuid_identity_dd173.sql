-- extend_wbx_demo_uuid_identity_dd173 — DD-173, the third of FOUR uuid-identity renames (B-103).
--
-- THE DEFECT, AND WHY THIS ONE WAS THE LOUDEST. `extend.wbx_demo.id` is TEXT — a CLIENT-generated
-- demo id (`demo_<uuid>`) that a guidance `demo_ref` pointer carries across machines with no
-- id-translation layer. §6d-3 requires `id uuid` on the `entity` variant, and B-65 recorded that
-- this token does not merely fail certification: `iam.apply_rls` RAISES on it,
-- `operator does not exist: text = uuid`, because the generated entity lane compares `id` to a
-- uuid. `pnpm check:row-visibility` carries `wbx_demo` in its RESIDUE_TOKENS set for that exact
-- 42883, with a comment saying so. This file removes the cause, so that residue entry can go.
--
-- THE SHAPE. As in the two files before it: rename the natural key out of the way, let
-- `platform.retrofit_entity` add the canonical uuid down its own "id(uuid + unique; the natural key
-- stays the PK)" branch. The name is `demo_key`, the name B-65 wrote into the register — and here
-- `slug` would have been actively wrong, because the value is not a slug: it is an opaque
-- client-minted `demo_<uuid>` pointer.
--
-- 🚨 THE REST OF THE BASE CONTRACT IS ALREADY THERE. Unlike the other three, this table already
--    carries organization_id NOT NULL, created_by, updated_by, version, deleted_at, metadata and
--    visibility. The org strategy is therefore `keep` — there is nothing to backfill and nothing
--    for this file to decide about whose organization these rows belong to.
--
-- 🚨 ZERO ROWS, EIGHT LIVE CONSUMER SITES. The registry's own note says it: "Holds 0 rows today
--    and has eight live consumer sites in matrx-extend, so it is EMPTY, NOT DEAD." So the
--    key-value assertion the other files make has nothing to assert, and the only real proof
--    available is the WRITE proof — which is the proof that matters here anyway, because the
--    capability at risk is a user writing their own demo.
--
-- 🚨 THIS FILE CLOSES A RECORDED DEFECT: D257. `wbx_demo_svc` is named for the service role but was
--    created TO PUBLIC with `USING (true) WITH CHECK (true)` — `lib/security/public-exposure.ts`
--    carries it under "KNOWN WRONG, tracked" with the note that the `extend` schema IS
--    PostgREST-exposed, so it is internet-reachable, and that nothing has leaked only because the
--    table is empty. Superseding it for the generated entity set replaces it with `svc_all` TO
--    service_role and an owner lane, which is what it was always named for. The declaration moves
--    out of the KNOWN-WRONG list in the same commit. (The anonymous WRITE half was already dead by
--    grant — DD-193 revoked every anon write privilege — but a policy that says PUBLIC/ALL is a
--    door standing open behind a locked gate, and D257 is closed at the door.)
--
-- 🚨 THE APP CONSUMERS, REPOINTED IN THE SAME COMMIT (matrx-extend, the only repo that touches it).
--    `src/lib/supabase/queries.ts` — the column list, the upsert's `onConflict`, both `.eq('id', …)`
--    lookups and the zod row schema; `src/lib/demos/cloud-sync.ts` — the two mappers; and the two
--    unit tests that pin them. Left alone every one of these would keep COMPILING and start
--    reading or writing the new uuid, which is the id-translation layer the text key exists to
--    avoid: a `demo_ref` pointer minted on one machine would stop resolving on another.
--
-- 🚨 THE ANON SURFACE (DD-186) AND THE PROBE. As in the wbx_recipe file: the anon column grants
--    follow the rename by attribute number, and the new uuid `id` is granted to `anon` afterwards
--    — not to publish anything (the generated lane is what decides who reads rows) but because
--    `iam.access_delta_snapshot` reads `t.id` to collect identities and records
--    `insufficient_privilege` as ZERO ROWS, which would blind this gate on the anonymous principal
--    for good. `lib/security/public-exposure.ts` moves with it.
-- VISIBILITY: left as the column already stands ('internal' default). This is a personal recording,
-- not platform content; nothing here publishes one.
set local lock_timeout = '20s';

do $dd173d$
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
  v_rowcount   bigint;
  v_anon_before bigint; v_anon_after bigint;
  v_owner_before boolean; v_owner_after boolean;
  v_read_before boolean; v_read_after boolean;
  v_other_read_before boolean; v_other_read_after boolean;
  v_porg uuid;
  v_probe_key text := 'demo_b103dd173probe';
  v_owner constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';  -- test@test.com, a plain non-admin user
  v_other constant uuid := 'a4955b5c-d524-4d72-a90e-0658d5d51148';  -- developer111@pixelium.uk, not the owner
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
    '00000000-0000-0000-0000-000000000000'   -- anonymous, no JWT — D257's principal
  ]::uuid[];
  v_tokens text[] := array['wbx_demo'];
  v_names constant text[] := array[
    'wbx_demo_owner_select','wbx_demo_owner_insert','wbx_demo_owner_update',
    'wbx_demo_owner_delete','wbx_demo_svc','platform_admin_all'];
  -- A WIDENING IS APPROVED BY NAME OR IT IS A FAILURE. 'token|principal'.
  v_approved constant text[] := '{}';
begin
  select count(*) into v_rowcount from extend.wbx_demo;
  -- The organization a probe row can honestly belong to: the owner's own personal organization.
  select o.id into v_porg from iam.organizations o
   where o.created_by = v_owner and o.is_personal limit 1;
  if v_porg is null then
    raise exception 'dd173-demo: test@test.com has no personal organization, so the write probe cannot name an organization the way a real extension write does (DD-154). Nothing ships on an un-probed write lane.';
  end if;

  -- ═══════ 0b. THE WRITE GATE, BEFORE HALF ════════════════════════════════════════════════════
  -- The capability at risk is THE WHOLE POINT of this table: a signed-in person records a demo in
  -- the extension and it syncs. A read-only access probe cannot see that disappear. The same two
  -- identities attempt the same insert before and after, and the verdicts must match. The write is
  -- typed the way the extension types it, organization named by the writer (DD-154).
  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    insert into extend.wbx_demo (id, name, organization_id, created_by)
      values (v_probe_key, 'DD-173 B-103 probe', v_porg, v_owner);
    v_owner_before := true;
    execute 'reset role';
  exception when others then
    v_owner_before := false;
    begin execute 'reset role'; exception when others then null; end;
  end;
  perform set_config('request.jwt.claims', null, true);

  -- With the probe row present (when the insert succeeded), measure who can READ it.
  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select exists (select 1 from extend.wbx_demo where id = v_probe_key) into v_read_before;
    execute 'reset role';
  exception when others then
    v_read_before := false;
    begin execute 'reset role'; exception when others then null; end;
  end;
  perform set_config('request.jwt.claims', null, true);
  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_other::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select exists (select 1 from extend.wbx_demo where id = v_probe_key) into v_other_read_before;
    execute 'reset role';
  exception when others then
    v_other_read_before := false;
    begin execute 'reset role'; exception when others then null; end;
  end;
  perform set_config('request.jwt.claims', null, true);
  delete from extend.wbx_demo where id = v_probe_key;

  if v_owner_before is not true then
    raise exception 'dd173-demo: the write gate proves nothing — a signed-in user could not record a demo even BEFORE this file ran. Re-write the probe before trusting its after half.';
  end if;
  raise notice 'dd173-demo: write gate BEFORE — owner(test@test.com) inserts own demo: %, reads it back: %; a different non-admin reads it: %',
    v_owner_before, v_read_before, v_other_read_before;

  -- ═══════ 0c. THE ANONYMOUS READ, MEASURED DIRECTLY (D257's principal) ════════════════════════
  perform set_config('request.jwt.claims', null, true);
  execute 'set local role anon';
  select count(*) into v_anon_before from extend.wbx_demo;
  execute 'reset role';

  -- ═══════ 1. THE BEFORE, pinned to this transaction's instant ═════════════════════════════════
  v_before := iam.access_delta_snapshot('DD-173 wbx_demo BEFORE', v_principals, v_tokens, 400000,
    'DD-173 B-103: extend.wbx_demo before the identity rename, base retrofit and generation', v_as);
  raise notice 'dd173-demo: baseline % over % principals, pinned at %, % rows, anon reads %',
    v_before, cardinality(v_principals), v_as, v_rowcount, v_anon_before;

  -- ═══════ 2. THE IDENTITY RENAME ══════════════════════════════════════════════════════════════
  alter table extend.wbx_demo rename column id to demo_key;

  if not exists (
    select 1 from pg_constraint c
     where c.conrelid = 'extend.wbx_demo'::regclass and c.contype = 'p'
       and pg_get_constraintdef(c.oid) = 'PRIMARY KEY (demo_key)') then
    raise exception 'dd173-demo: the primary key did not follow the rename. Live definition: %',
      (select pg_get_constraintdef(c.oid) from pg_constraint c
        where c.conrelid = 'extend.wbx_demo'::regclass and c.contype = 'p');
  end if;
  if not exists (
    select 1 from information_schema.column_privileges
     where table_schema = 'extend' and table_name = 'wbx_demo'
       and grantee = 'anon' and column_name = 'demo_key' and privilege_type = 'SELECT') then
    raise exception 'dd173-demo: the anon column grant did not follow the rename; DD-186''s column bound is not re-granted on a guess.';
  end if;
  raise notice 'dd173-demo: id -> demo_key; PK and anon column grant followed the column';

  -- ═══════ 3. THE BASE RETROFIT, through the one path ══════════════════════════════════════════
  -- Org strategy `keep`: organization_id is already NOT NULL on this table and there is nothing to
  -- backfill. Everything else the entity variant needs is already present; only `id` is added.
  v_res := platform.retrofit_entity('extend', 'wbx_demo', 'wbx_demo', 'keep',
             null, 'created_by', null, null, null, null);
  raise notice 'dd173-demo: %', v_res;

  if not exists (select 1 from information_schema.columns
                  where table_schema='extend' and table_name='wbx_demo'
                    and column_name='id' and udt_name='uuid' and is_nullable='NO') then
    raise exception 'dd173-demo: the canonical uuid identity is not present after the retrofit.';
  end if;

  -- ═══════ 4. SUPERSEDE BY NAME, then GENERATE ═════════════════════════════════════════════════
  select coalesce(array_agg(pol.polname order by pol.polname), '{}') into v_live
    from pg_policy pol
   where pol.polrelid = 'extend.wbx_demo'::regclass
     and not (pol.polname = any (iam.generated_policy_names()));
  v_extra := array(select unnest(v_live) except select unnest(v_names));
  if v_extra <> '{}' then
    raise exception
      'dd173-demo: extend.wbx_demo carries hand-written policy/policies % that this file has never seen. Nothing was dropped. A policy nobody enumerated is not superseded on a guess — re-census and re-write this file.',
      array_to_string(v_extra, ', ');
  end if;
  v_drop := array(select unnest(v_names) intersect select unnest(v_live));
  if cardinality(v_drop) > 0 then
    perform iam.supersede_bespoke_policies('extend', 'wbx_demo', v_drop,
      'DD-173 B-103: extend.wbx_demo is the cloud-synced store for recorded extension demo bodies, registered by DD-159 batch 1 and refused by iam.apply_rls ever since — it did not merely fail certification, the generated entity lane RAISED 42883 comparing a TEXT id to a uuid. Its identity is renamed to demo_key and the canonical uuid added in this same transaction, and its hand-written policy set is superseded by the generated entity set. This also closes recorded defect D257: wbx_demo_svc was named for the service role but created TO PUBLIC with USING (true) WITH CHECK (true) on a PostgREST-exposed schema; it is replaced by the generated svc_all (TO service_role) and the generated owner lane.');
  end if;
  perform iam.apply_rls('extend', 'wbx_demo', 'wbx_demo', 'entity');
  raise notice 'dd173-demo: generated wbx_demo, superseding % of % declared bespoke name(s)',
    cardinality(v_drop), cardinality(v_names);

  -- ═══════ 4b. THE NEW IDENTITY JOINS THE DECLARED ANON COLUMN SURFACE ═════════════════════════
  grant select (id) on extend.wbx_demo to anon;
  if exists (
    select 1 from information_schema.column_privileges
     where table_schema='extend' and table_name='wbx_demo' and grantee='anon'
       and column_name in ('created_by','updated_by','organization_id','metadata','version')) then
    raise exception 'dd173-demo: identity or bookkeeping columns reached the anonymous surface. DD-186 revokes exactly those.';
  end if;

  -- ═══════ 4c. THE WRITE GATE AND THE READ LANES, AFTER — the verdicts must MATCH ══════════════
  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    insert into extend.wbx_demo (demo_key, name, organization_id, created_by)
      values (v_probe_key, 'DD-173 B-103 probe', v_porg, v_owner);
    v_owner_after := true;
    execute 'reset role';
  exception when others then
    v_owner_after := false;
    begin execute 'reset role'; exception when others then null; end;
  end;
  perform set_config('request.jwt.claims', null, true);

  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select exists (select 1 from extend.wbx_demo where demo_key = v_probe_key) into v_read_after;
    execute 'reset role';
  exception when others then
    v_read_after := false;
    begin execute 'reset role'; exception when others then null; end;
  end;
  perform set_config('request.jwt.claims', null, true);
  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_other::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select exists (select 1 from extend.wbx_demo where demo_key = v_probe_key) into v_other_read_after;
    execute 'reset role';
  exception when others then
    v_other_read_after := false;
    begin execute 'reset role'; exception when others then null; end;
  end;
  perform set_config('request.jwt.claims', null, true);

  execute 'set local role anon';
  select count(*) into v_anon_after from extend.wbx_demo;
  execute 'reset role';
  delete from extend.wbx_demo where demo_key = v_probe_key;

  if v_owner_after is distinct from v_owner_before then
    raise exception 'dd173-demo: THE USER WRITE MOVED. A signed-in person could record a demo before this file (%) and after (%). That capability IS the table.',
      v_owner_before, v_owner_after;
  end if;
  if v_read_after is distinct from v_read_before then
    raise exception 'dd173-demo: THE OWNER READ MOVED: the person who recorded the demo could read it back before (%) and after (%).',
      v_read_before, v_read_after;
  end if;
  if v_other_read_after is distinct from v_other_read_before then
    raise exception 'dd173-demo: THE READ LANE MOVED for a non-owner: before %, after %. Over-opening and over-tightening are the same class of defect.',
      v_other_read_before, v_other_read_after;
  end if;
  -- The ONE deliberate move in this file, and it is a CLOSING, named: D257.
  if v_anon_after > v_anon_before then
    raise exception 'dd173-demo: the anonymous read WIDENED (% -> %) on a table of personal recordings.',
      v_anon_before, v_anon_after;
  end if;
  raise notice 'dd173-demo: write/read gate AFTER — owner writes %, owner reads %, non-owner reads %, anonymous % -> % (D257 closed at the door)',
    v_owner_after, v_read_after, v_other_read_after, v_anon_before, v_anon_after;

  -- ═══════ 5. THE GATE — the same probe, the same instant ══════════════════════════════════════
  v_after := iam.access_delta_snapshot('DD-173 wbx_demo AFTER', v_principals, v_tokens, 400000,
    'DD-173 B-103 confirmation, pinned to the same instant as the baseline', v_as);
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
        raise notice 'dd173-demo: WIDER (approved by name) % for % : % -> %', r.token, r.principal_label, r.count_before, r.count_after;
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
      raise notice 'dd173-demo: NARROWED % for % : % -> %', r.token, r.principal_label, r.count_before, r.count_after;
    end if;
  end loop;
  if cardinality(v_unapproven_hard) > 0 then
    raise exception 'dd173-demo: % read(s) this gate could not prove either way: %',
      cardinality(v_unapproven_hard), array_to_string(v_unapproven_hard, ' ; ');
  end if;
  if cardinality(v_unapproved) > 0 then
    raise exception
      'dd173-demo: % door(s) opened that nobody approved by name: %. Over-opening and over-tightening are the same class of defect and neither ships on a count.',
      cardinality(v_unapproved), array_to_string(v_unapproved, ' ; ');
  end if;
  raise notice 'dd173-demo: 0 unapproved widenings, % narrowing(s), % pair(s) whole-table-identical',
    cardinality(v_narrower), cardinality(v_unproven_ok);

  -- ═══════ 6. CERTIFICATION ════════════════════════════════════════════════════════════════════
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
    raise exception 'dd173-demo: % base-contract FAIL(s) remain after the retrofit: %. This file exists to close exactly these.',
      cardinality(v_base_fail), array_to_string(v_base_fail, ' ; ');
  end if;
  if cardinality(v_policy_fail) > 0 then
    raise exception 'dd173-demo: % POLICY-family FAIL(s) after generation: %. The generator produced a policy set its own certification refuses; this round does not stand.',
      cardinality(v_policy_fail), array_to_string(v_policy_fail, ' ; ');
  end if;
  raise notice 'dd173-demo: iam.verify_canonical — 0 base-contract FAIL and 0 POLICY-family FAIL on wbx_demo';

  -- ═══════ 7. ACKNOWLEDGE THIS FILE'S OWN GUARD FIRINGS ════════════════════════════════════════
  select count(*) into v_acked from platform.ddl_guard_log
   where rule = 'nullable_org' and acknowledged_at is null and occurred_at >= v_as;
  if v_acked > 0 then
    perform platform.ddl_guard_ack(
      p_reason => 'DD-173 B-103 (extend.wbx_demo): the retrofit ran with org strategy keep on a table whose organization_id is already NOT NULL. Any nullable_org firing in this window belongs to this file and names no other table.',
      p_by     => 'DD-173 B-103 wbx_demo migration',
      p_rule   => 'nullable_org',
      p_before => null,
      p_ids    => (select array_agg(id) from platform.ddl_guard_log
                    where rule = 'nullable_org' and acknowledged_at is null and occurred_at >= v_as));
    raise notice 'dd173-demo: acknowledged % nullable_org guard firing(s) raised by this file', v_acked;
  end if;
end $dd173d$;
