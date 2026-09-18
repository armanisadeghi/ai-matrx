-- files_account_tier_uuid_identity_dd173 — DD-173, the second of FOUR uuid-identity renames (B-103).
--
-- THE DEFECT. `files.account_tiers.id` is TEXT ('guest', 'free', 'pro', 'enterprise') — the tier's
-- natural key wearing the canonical identity's name. §6d-3 requires `id uuid` on the `system`
-- variant, so `platform.retrofit_entity` refuses the table by name and `iam.apply_rls` has refused
-- it since DD-159 batch 3 registered it. B-65 held it back with that disposition; this file pays it.
--
-- THE SHAPE. Identical to `extend_wbx_recipe_uuid_identity_dd173` and for the same reason, written
-- out once there: `retrofit_entity`'s own no-id branch says "id(uuid + unique; the natural key
-- stays the PK)", and 35 live tables already carry that shape certified at 0 base / 0 policy FAIL.
-- So the rename is the whole identity change; the retrofit adds the canonical uuid down its own
-- existing path. The name is `tier_key`, the name B-65 wrote into the register.
--
-- 🚨 B-65 AND THE REGISTER BOTH SAY THIS TABLE HAS NO INCOMING FOREIGN KEYS. IT HAS ONE.
--    `files.user_account.tier_id` REFERENCES `files.account_tiers(id)` (constraint
--    `cld_user_account_tier_id_fkey`), live today, read on every upload quota check. It does not
--    change the plan — a foreign key is stored by attribute number and FOLLOWS a rename of the
--    referenced column, and `tier_id` stays TEXT pointing at the (renamed) natural key exactly as
--    `billing.plan_limit.plan_id` does — but the register's ordering rationale ("the two with no
--    incoming FKs first") rests on a fact that is not true, and a later lane must not inherit it.
--    The constraint is asserted, by definition, after the rename.
--
-- 🚨 THE APP CONSUMERS, REPOINTED IN THE SAME COMMIT — AND ONE OF THEM IS A DATABASE FUNCTION.
--    `public.get_user_limits(uuid, boolean)` is the upload/rate/quota resolver every file, image
--    and asset path in aidream calls. It reads `files.account_tiers.id` three times and returns it
--    as the JSON key `tier_id`. Left alone it would keep COMPILING and start resolving the tier by
--    a uuid it was never given — every lookup missing, every caller silently falling back to the
--    'free' sentinel. It is rewritten here, in this transaction, and its wire shape is unchanged:
--    the JSON key stays `tier_id` and still carries the tier's slug.
--    `matrx-frontend/app/api/compute-targets/route.ts` selects `features` `.eq("id", tierId)` —
--    the same silent-miss shape, repointed to `tier_key` in the same commit.
--    aidream's generated ORM model + manager pair (`matrx_files/db/models_files.py`,
--    `.../managers/files/account_tiers.py`) are regenerated from the live schema.
--
-- ANONYMOUS: none. `anon` holds no grant of any kind on this table (checked live), so unlike
-- wbx_recipe there is no DD-186 column surface to move and no anonymous axis to keep measurable.
-- VISIBILITY: 'internal'. Nobody reads this table signed-out today and the §6e system-org arm
-- admits `visibility >= 'internal'` on a global-readable organization, so 'internal' reproduces
-- exactly today's reach (every signed-in reader, no anonymous reader) where 'public' would publish
-- the platform's storage ladder to the open web.
-- ORGANIZATION: the system org, named explicitly (db-rules §2). A platform-wide storage-tier
-- vocabulary is platform content; no customer wrote a row.
set local lock_timeout = '20s';

do $dd173t$
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
  v_keys_before text; v_keys_after text;
  v_rowcount   bigint;
  v_limits_before jsonb; v_limits_after jsonb;
  v_admin_before boolean; v_admin_after boolean;
  v_other_before boolean; v_other_after boolean;
  v_probe_key text := 'b103_dd173_tier_probe';
  v_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';  -- admin@admin.com, platform admin
  v_other constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';  -- test@test.com, no platform rights
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
    '00000000-0000-0000-0000-000000000000'   -- anonymous, no JWT
  ]::uuid[];
  v_tokens text[] := array['files_account_tier'];
  v_names constant text[] := array['cld_account_tiers_authenticated_select','platform_admin_all'];
  -- A WIDENING IS APPROVED BY NAME OR IT IS A FAILURE. 'token|principal'.
  v_approved constant text[] := '{}';
begin
  -- ═══════ 0. THE NATURAL KEY, AND THE RESOLVER'S ANSWER, BEFORE ANYTHING MOVES ════════════════
  select count(*), md5(coalesce(string_agg(t.id, ',' order by t.id), ''))
    into v_rowcount, v_keys_before from files.account_tiers t;
  if v_rowcount = 0 then
    raise exception 'dd173-tier: files.account_tiers is empty. This file was written against 4 live rows; an empty table means the census is stale.';
  end if;
  -- The real answer of the real resolver, for the real testing identity. An access gate counts
  -- rows; it cannot see a quota resolver start returning the 'free' fallback for everybody.
  v_limits_before := public.get_user_limits(v_admin, false);
  if v_limits_before->>'tier_id' is null then
    raise exception 'dd173-tier: get_user_limits returned no tier_id even BEFORE this file ran. The proof would prove nothing; re-write it before trusting its after half.';
  end if;

  -- ═══════ 0b. THE WRITE GATE, BEFORE HALF ════════════════════════════════════════════════════
  -- A read probe cannot see a write disappear (B-83's lesson). The live write lane here is
  -- `platform_admin_all`; the generated `system` write lane is also platform staff, so the two
  -- should agree — "should" is not a proof, so both identities attempt the same insert.
  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    insert into files.account_tiers (id, name) values (v_probe_key, 'DD-173 B-103 probe');
    v_admin_before := true;
    execute 'reset role';
  exception when others then
    v_admin_before := false;
    begin execute 'reset role'; exception when others then null; end;
  end;
  perform set_config('request.jwt.claims', null, true);
  delete from files.account_tiers where id = v_probe_key;

  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_other::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    insert into files.account_tiers (id, name) values (v_probe_key, 'DD-173 B-103 probe');
    v_other_before := true;
    execute 'reset role';
  exception when others then
    v_other_before := false;
    begin execute 'reset role'; exception when others then null; end;
  end;
  perform set_config('request.jwt.claims', null, true);
  delete from files.account_tiers where id = v_probe_key;
  if v_admin_before is not true then
    raise exception 'dd173-tier: the write gate proves nothing — a platform admin could not insert a tier even BEFORE this file ran.';
  end if;
  raise notice 'dd173-tier: write gate BEFORE — platform admin can insert a tier: %; a user with no platform rights: %',
    v_admin_before, v_other_before;

  -- ═══════ 1. THE BEFORE, pinned to this transaction's instant ═════════════════════════════════
  v_before := iam.access_delta_snapshot('DD-173 files_account_tier BEFORE', v_principals, v_tokens, 400000,
    'DD-173 B-103: files.account_tiers before the identity rename, base retrofit and generation', v_as);
  raise notice 'dd173-tier: baseline % over % principals, pinned at %, % rows',
    v_before, cardinality(v_principals), v_as, v_rowcount;

  -- ═══════ 2. THE IDENTITY RENAME ══════════════════════════════════════════════════════════════
  alter table files.account_tiers rename column id to tier_key;

  select md5(coalesce(string_agg(t.tier_key, ',' order by t.tier_key), ''))
    into v_keys_after from files.account_tiers t;
  if v_keys_after is distinct from v_keys_before then
    raise exception 'dd173-tier: the natural key values are NOT identical across the rename (% -> %). Nothing about a rename may change a value.',
      v_keys_before, v_keys_after;
  end if;
  if not exists (
    select 1 from pg_constraint c
     where c.conrelid = 'files.account_tiers'::regclass and c.contype = 'p'
       and pg_get_constraintdef(c.oid) = 'PRIMARY KEY (tier_key)') then
    raise exception 'dd173-tier: the primary key did not follow the rename. Live definition: %',
      (select pg_get_constraintdef(c.oid) from pg_constraint c
        where c.conrelid = 'files.account_tiers'::regclass and c.contype = 'p');
  end if;
  -- The incoming FK the register says does not exist.
  if not exists (
    select 1 from pg_constraint c
     where c.conname = 'cld_user_account_tier_id_fkey'
       and pg_get_constraintdef(c.oid) = 'FOREIGN KEY (tier_id) REFERENCES files.account_tiers(tier_key)') then
    raise exception 'dd173-tier: files.user_account''s foreign key did not follow the rename. Live definition: %',
      (select pg_get_constraintdef(c.oid) from pg_constraint c where c.conname = 'cld_user_account_tier_id_fkey');
  end if;
  raise notice 'dd173-tier: id -> tier_key; % key values byte-identical, PK and the user_account FK followed the column', v_rowcount;

  -- ═══════ 2b. THE RESOLVER, REWRITTEN IN THE SAME TRANSACTION AS THE COLUMN ═══════════════════
  -- Its three reads of `id` would otherwise keep compiling against the NEW uuid and resolve every
  -- tier to nothing. The JSON it returns is byte-for-byte the same contract: the key is still
  -- `tier_id` and still carries the tier's slug, because every caller in aidream and this repo
  -- reads it by that name.
  create or replace function public.get_user_limits(p_user_id uuid, p_is_guest boolean default false)
  returns jsonb
  language plpgsql
  stable security definer
  as $fn$
  declare
    v_tier_id text;
    v_tier files.account_tiers%rowtype;
    v_custom jsonb := '{}'::jsonb;
    v_blocked boolean := false;
    v_block_reason text;
  begin
    if (auth.role() = 'service_role'
        or session_user = 'postgres'
        or p_user_id = (select auth.uid())) is not true then
      raise exception 'access denied: caller is not the target user'
        using errcode = '42501';
    end if;

    select tier_id, custom_limits, is_blocked, blocked_reason
    into v_tier_id, v_custom, v_blocked, v_block_reason
    from files.user_account
    where user_id = p_user_id;

    if v_tier_id is null then
      if p_is_guest then
        select tier_key into v_tier_id
        from files.account_tiers
        where is_default_for_guests = true
        limit 1;
      else
        select tier_key into v_tier_id
        from files.account_tiers
        where is_default_for_users = true
        limit 1;
      end if;
    end if;

    select * into v_tier
    from files.account_tiers
    where tier_key = v_tier_id;

    if v_tier.tier_key is null then
      v_tier.tier_key := 'free';
    end if;

    return jsonb_build_object(
      'tier_id', v_tier.tier_key,
      'tier_name', v_tier.name,
      'is_blocked', v_blocked,
      'blocked_reason', v_block_reason,
      'max_storage_bytes', coalesce(
        (v_custom->>'max_storage_bytes')::bigint,
        v_tier.max_storage_bytes
      ),
      'max_file_size_bytes', coalesce(
        (v_custom->>'max_file_size_bytes')::bigint,
        v_tier.max_file_size_bytes
      ),
      'max_files', coalesce(
        (v_custom->>'max_files')::int,
        v_tier.max_files
      ),
      'max_versions_per_file', coalesce(
        (v_custom->>'max_versions_per_file')::int,
        v_tier.max_versions_per_file
      ),
      'max_daily_uploads', coalesce(
        (v_custom->>'max_daily_uploads')::int,
        v_tier.max_daily_uploads
      ),
      'max_daily_upload_bytes', coalesce(
        (v_custom->>'max_daily_upload_bytes')::bigint,
        v_tier.max_daily_upload_bytes
      ),
      'max_share_links_per_resource', coalesce(
        (v_custom->>'max_share_links_per_resource')::int,
        v_tier.max_share_links_per_resource
      ),
      'max_bulk_items', coalesce(
        (v_custom->>'max_bulk_items')::int,
        v_tier.max_bulk_items
      ),
      'rate_limit_uploads_per_min', coalesce(
        (v_custom->>'rate_limit_uploads_per_min')::int,
        v_tier.rate_limit_uploads_per_min
      ),
      'rate_limit_downloads_per_min', coalesce(
        (v_custom->>'rate_limit_downloads_per_min')::int,
        v_tier.rate_limit_downloads_per_min
      ),
      'rate_limit_general_per_min', coalesce(
        (v_custom->>'rate_limit_general_per_min')::int,
        v_tier.rate_limit_general_per_min
      ),
      'features', coalesce(v_custom->'features', v_tier.features)
    );
  end;
  $fn$;

  -- ═══════ 3. THE BASE RETROFIT, through the one path ══════════════════════════════════════════
  v_res := platform.retrofit_entity('files', 'account_tiers', 'files_account_tier', 'system',
             null, null, null, null, $x$'internal'$x$, null);
  raise notice 'dd173-tier: %', v_res;

  if not exists (select 1 from information_schema.columns
                  where table_schema='files' and table_name='account_tiers'
                    and column_name='id' and udt_name='uuid' and is_nullable='NO') then
    raise exception 'dd173-tier: the canonical uuid identity is not present after the retrofit.';
  end if;
  if (select count(distinct id) from files.account_tiers) <> v_rowcount then
    raise exception 'dd173-tier: the new uuid identity is not unique across % rows.', v_rowcount;
  end if;

  -- ═══════ 4. SUPERSEDE BY NAME, then GENERATE ═════════════════════════════════════════════════
  select coalesce(array_agg(pol.polname order by pol.polname), '{}') into v_live
    from pg_policy pol
   where pol.polrelid = 'files.account_tiers'::regclass
     and not (pol.polname = any (iam.generated_policy_names()));
  v_extra := array(select unnest(v_live) except select unnest(v_names));
  if v_extra <> '{}' then
    raise exception
      'dd173-tier: files.account_tiers carries hand-written policy/policies % that this file has never seen. Nothing was dropped. A policy nobody enumerated is not superseded on a guess — re-census and re-write this file.',
      array_to_string(v_extra, ', ');
  end if;
  v_drop := array(select unnest(v_names) intersect select unnest(v_live));
  if cardinality(v_drop) > 0 then
    perform iam.supersede_bespoke_policies('files', 'account_tiers', v_drop,
      'DD-173 B-103: files.account_tiers is the platform-wide storage/rate tier vocabulary, registered by DD-159 batch 3 and refused by iam.apply_rls ever since for a TEXT id. Its identity is renamed to tier_key and its base contract retrofitted in this same transaction, and its hand-written policy set (an authenticated USING (true) read plus the platform-admin lane) is superseded by the generated set iam.apply_rls emits for the system variant. Kept unsuperseded the two regimes would OR together and leave the table wider than either intended.');
  end if;
  perform iam.apply_rls('files', 'account_tiers', 'files_account_tier', 'system');
  raise notice 'dd173-tier: generated files_account_tier, superseding % of % declared bespoke name(s)',
    cardinality(v_drop), cardinality(v_names);

  -- ═══════ 4b. THE RESOLVER AND THE WRITE LANE, AFTER ══════════════════════════════════════════
  v_limits_after := public.get_user_limits(v_admin, false);
  if v_limits_after is distinct from v_limits_before then
    raise exception 'dd173-tier: THE QUOTA RESOLVER MOVED. get_user_limits returned % before and % after. Every upload, image and asset path in aidream reads this answer.',
      v_limits_before, v_limits_after;
  end if;
  raise notice 'dd173-tier: get_user_limits byte-identical before and after (tier_id %)', v_limits_after->>'tier_id';

  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    insert into files.account_tiers (tier_key, name, organization_id, visibility)
      values (v_probe_key, 'DD-173 B-103 probe',
              '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, 'internal'::platform.visibility);
    v_admin_after := true;
    execute 'reset role';
  exception when others then
    v_admin_after := false;
    begin execute 'reset role'; exception when others then null; end;
  end;
  perform set_config('request.jwt.claims', null, true);
  delete from files.account_tiers where tier_key = v_probe_key;

  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_other::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    insert into files.account_tiers (tier_key, name, organization_id, visibility)
      values (v_probe_key, 'DD-173 B-103 probe',
              '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, 'internal'::platform.visibility);
    v_other_after := true;
    execute 'reset role';
  exception when others then
    v_other_after := false;
    begin execute 'reset role'; exception when others then null; end;
  end;
  perform set_config('request.jwt.claims', null, true);
  delete from files.account_tiers where tier_key = v_probe_key;

  if v_admin_after is distinct from v_admin_before then
    raise exception 'dd173-tier: THE STAFF WRITE LANE MOVED: a platform admin could insert a tier before (%) and after (%).',
      v_admin_before, v_admin_after;
  end if;
  if v_other_after is distinct from v_other_before then
    raise exception 'dd173-tier: THE WRITE LANE MOVED for a user with no platform rights: before %, after %. Over-opening and over-tightening are the same class of defect.',
      v_other_before, v_other_after;
  end if;
  raise notice 'dd173-tier: write gate AFTER — platform admin %, other % — IDENTICAL to the before half',
    v_admin_after, v_other_after;

  -- ═══════ 5. THE GATE — the same probe, the same instant ══════════════════════════════════════
  v_after := iam.access_delta_snapshot('DD-173 files_account_tier AFTER', v_principals, v_tokens, 400000,
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
        raise notice 'dd173-tier: WIDER (approved by name) % for % : % -> %', r.token, r.principal_label, r.count_before, r.count_after;
      end if;

    elsif r.verdict = 'UNPROVEN' then
      -- Structural and expected: the BEFORE half was taken while `id` was TEXT, so the snapshot
      -- hashed the row text instead of collecting ids. Resolved only when the read IS the whole
      -- table before and after; anything else aborts.
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
      raise notice 'dd173-tier: NARROWED % for % : % -> %', r.token, r.principal_label, r.count_before, r.count_after;
    end if;
  end loop;
  if cardinality(v_unapproven_hard) > 0 then
    raise exception 'dd173-tier: % read(s) this gate could not prove either way: %',
      cardinality(v_unapproven_hard), array_to_string(v_unapproven_hard, ' ; ');
  end if;
  if cardinality(v_unapproved) > 0 then
    raise exception
      'dd173-tier: % door(s) opened that nobody approved by name: %. Over-opening and over-tightening are the same class of defect and neither ships on a count.',
      cardinality(v_unapproved), array_to_string(v_unapproved, ' ; ');
  end if;
  raise notice 'dd173-tier: 0 unapproved widenings, % narrowing(s), % pair(s) whole-table-identical (id-hash UNPROVEN by construction, resolved)',
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
    raise exception 'dd173-tier: % base-contract FAIL(s) remain after the retrofit: %. This file exists to close exactly these.',
      cardinality(v_base_fail), array_to_string(v_base_fail, ' ; ');
  end if;
  if cardinality(v_policy_fail) > 0 then
    raise exception 'dd173-tier: % POLICY-family FAIL(s) after generation: %. The generator produced a policy set its own certification refuses; this round does not stand.',
      cardinality(v_policy_fail), array_to_string(v_policy_fail, ' ; ');
  end if;
  raise notice 'dd173-tier: iam.verify_canonical — 0 base-contract FAIL and 0 POLICY-family FAIL on files_account_tier';

  -- ═══════ 7. ACKNOWLEDGE THIS FILE'S OWN GUARD FIRINGS ════════════════════════════════════════
  select count(*) into v_acked from platform.ddl_guard_log
   where rule = 'nullable_org' and acknowledged_at is null and occurred_at >= v_as;
  if v_acked > 0 then
    perform platform.ddl_guard_ack(
      p_reason => 'DD-173 B-103 (files.account_tiers): platform.retrofit_entity added organization_id and set it NOT NULL in the same call, and raises if any row would be left without an organization. The guard saw the ADD COLUMN half of that pair. The alternative (add column not null default <org>) is hard-blocked by this same guard, and combining add + drop-default into one ALTER is rejected by Postgres.',
      p_by     => 'DD-173 B-103 files_account_tier migration',
      p_rule   => 'nullable_org',
      p_before => null,
      p_ids    => (select array_agg(id) from platform.ddl_guard_log
                    where rule = 'nullable_org' and acknowledged_at is null and occurred_at >= v_as));
    raise notice 'dd173-tier: acknowledged % nullable_org guard firing(s) raised by this file', v_acked;
  end if;
end $dd173t$;
