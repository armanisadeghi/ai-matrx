-- extend_wbx_recipe_uuid_identity_dd173 — DD-173, the first of FOUR uuid-identity renames (B-103).
--
-- THE DEFECT. `extend.wbx_recipe.id` is TEXT ('linkedin-jsonld-job', 'hn-frontpage', …) — the
-- catalogue's natural key wearing the canonical identity's name. §6d-3 requires `id uuid` on the
-- `system` variant, so `platform.retrofit_entity` refuses the table by name rather than changing a
-- live identity underneath rows, and `iam.apply_rls` has refused it since DD-159 batch 3
-- registered it. B-65 held it back with that disposition written down; this file pays it.
--
-- THE SHAPE, AND WHY THE NATURAL KEY KEEPS THE PRIMARY KEY
-- -------------------------------------------------------
-- `platform.retrofit_entity` already states the answer in its own code, for the case where a table
-- arrives with no `id` at all:
--
--     execute format('alter table %s add column id uuid not null default gen_random_uuid()', ...)
--     create unique index ... (id)
--     v_did := array_append(v_did, 'id(uuid + unique; the natural key stays the PK)');
--
-- So the canonical identity is a uuid column with its own UNIQUE index, and the natural key stays
-- the primary key. That is not this file's invention: it is the shape 35 tables already carry
-- live through B-65's five batches — `platform.assurance_level` PK (slug),
-- `platform.source_authority` PK (slug), `seo.ai_capability` PK (slug), `tool.executor` PK (name),
-- `billing.plan_limit` PK (plan_id, capability, period) — every one of them certified
-- `iam.verify_canonical` 0 base / 0 policy FAIL with a uuid `id` beside a natural primary key.
-- Renaming `id` out of the way is therefore the WHOLE identity change here: after the rename the
-- table has no `id`, and `retrofit_entity` adds the canonical one down its own existing path.
--
-- 🚨 THE NAME IS `recipe_key`, THE NAME B-65 WROTE INTO THE REGISTER. The values are slugs, and
--    `slug` would have been defensible, but `<thing>_key` is the register's own word for all four
--    of these tables and `platform.change_type_default.change_type_key` is the live precedent.
--    Renaming a live identifier needs a reason, and matching the disposition of record is one.
--
-- INCOMING FOREIGN KEYS: NONE. Verified live against pg_constraint — `extend.wbx_recipe` is
-- referenced by no table in the database, which is why B-65 put it first in the order.
--
-- 🚨 THE ONE APP CONSUMER, REPOINTED IN THE SAME COMMIT.
--    `matrx-extend/src/lib/data-pattern/recipes.ts` selects `id, label, description, hosts,
--    routes, kind, config, yields_rows` and orders by `id`. Left alone it would keep COMPILING and
--    silently start returning the new uuid as `Recipe.id`, which is the pointer the extension's
--    bundled fallback catalogue and every pattern reference key on. The select, the order, the zod
--    row schema and the mapping all move to `recipe_key` in the same commit.
--    No other reader exists: a four-repository grep (matrx-frontend, aidream, matrx-local,
--    matrx-extend) finds only that file, aidream's GENERATED ORM model/manager pair, and the two
--    declaration files (`lib/security/public-exposure.ts`, `scripts/check-schema-routing.ts`).
--
-- 🚨 THE ANON SURFACE (DD-186). `anon` holds a column-level SELECT grant on twelve columns of this
--    table, `id` among them. A column grant is stored by attribute number, so it FOLLOWS the
--    rename: anon keeps seeing the same value under the name `recipe_key`, and the uuid `id` this
--    file adds is born with no anon grant at all — closed by default, which is what DD-186's
--    column-bounded doctrine wants. `lib/security/public-exposure.ts` declares that list and moves
--    with it in the same commit, or `pnpm check:anon-column-surface` fails on the drift.
--
-- 🚨 AND THEN `anon` IS GRANTED THE NEW `id`, DELIBERATELY — MEASURED, NOT ASSUMED.
--    The first rehearsal of this file reported `wbx_recipe` NARROWED 12 -> 0 for anonymous, and it
--    was a PROBE ARTEFACT that would have shipped as a fact either way. `iam.access_delta_snapshot`
--    reads `t.id` to collect row identities; with no anon grant on the brand-new `id` column that
--    read raises `insufficient_privilege`, and the snapshot records it as ZERO ROWS with a note.
--    A direct anonymous `select count(*)` in the same transaction returned all 12. So the door had
--    not moved at all — the gate had gone blind on the one principal that matters most on a public
--    catalogue, and would have read 0 -> 0 SAME on every future run.
--    Two things follow, and this file does both:
--      1. `anon` is granted SELECT on `id`. This is not an exception to DD-186, it is DD-186's own
--         censused decision for this relation family: every anon-bounded `extend.*` relation's
--         declared column list already begins with `id`. The revoked identity class is
--         `created_by` / `updated_by` / `organization_id`, and those stay revoked here.
--      2. The anonymous read is ALSO gated directly, by a real `set local role anon` count before
--         and after, so this file never again depends on the probe being able to see it.
--    The probe blind spot itself is a platform defect and is filed, not fixed here: any
--    anon-column-bounded relation whose `id` is not granted to `anon` reports 0 rows for the
--    anonymous principal, and a 0 -> 0 pair compares as SAME.
--
-- VISIBILITY: derived from `is_active`, batch 1's rule verbatim. All 12 rows are active today, so
-- nothing moves now; a recipe retired tomorrow stops being published to the world by the flag that
-- already means exactly that.
-- ORGANIZATION: the system org, named explicitly (db-rules §2). A browser-automation recipe
-- catalogue is platform content by construction; no customer wrote a row.
set local lock_timeout = '20s';

do $dd173r$
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
  v_anon_before bigint; v_anon_after bigint;
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
    '00000000-0000-0000-0000-000000000000'   -- anonymous, no JWT — the one that matters most on a public catalogue
  ]::uuid[];
  v_tokens text[] := array['wbx_recipe'];
  -- the SUPERSET of hand-written policy names this file was written against.
  v_names constant text[] := array['wbx_recipe_read_all','platform_admin_all'];
  -- A WIDENING IS APPROVED BY NAME OR IT IS A FAILURE. 'token|principal'.
  v_approved constant text[] := '{}';
begin
  -- ═══════ 0. THE NATURAL KEY, CAPTURED BEFORE IT MOVES ════════════════════════════════════════
  -- The rename is the one step in this file that cannot be undone by rolling a policy back, so its
  -- own proof is here: the exact multiset of key values, before and after. A rename that lost or
  -- changed one value would be invisible to an access gate, which counts rows and hashes ids.
  select count(*), md5(coalesce(string_agg(t.id, ',' order by t.id), ''))
    into v_rowcount, v_keys_before from extend.wbx_recipe t;
  if v_rowcount = 0 then
    raise exception 'dd173-recipe: extend.wbx_recipe is empty. This file was written against 12 live rows; an empty table means the census is stale and the rename is not the change it was reviewed as.';
  end if;

  -- ═══════ 0b. THE ANONYMOUS READ, MEASURED DIRECTLY ══════════════════════════════════════════
  -- The access-delta probe cannot be trusted to see this one (see the header). A real anonymous
  -- read is taken here and repeated after generation; the two must match.
  perform set_config('request.jwt.claims', null, true);
  execute 'set local role anon';
  select count(*) into v_anon_before from extend.wbx_recipe;
  execute 'reset role';
  if v_anon_before <> v_rowcount then
    raise exception 'dd173-recipe: the anonymous baseline is % of % rows, but this table is a PUBLIC catalogue read signed-out today. The before half of the anon gate does not describe the system it is gating.',
      v_anon_before, v_rowcount;
  end if;

  -- ═══════ 1. THE BEFORE, pinned to this transaction's instant ═════════════════════════════════
  v_before := iam.access_delta_snapshot('DD-173 wbx_recipe BEFORE', v_principals, v_tokens, 400000,
    'DD-173 B-103: extend.wbx_recipe before the identity rename, base retrofit and generation', v_as);
  raise notice 'dd173-recipe: baseline % over % principals, pinned at %, % rows',
    v_before, cardinality(v_principals), v_as, v_rowcount;

  -- ═══════ 2. THE IDENTITY RENAME ══════════════════════════════════════════════════════════════
  -- The primary key constraint and the anon/authenticated column grants are stored by attribute
  -- number, so all three follow the column. Asserted below rather than assumed.
  alter table extend.wbx_recipe rename column id to recipe_key;

  select md5(coalesce(string_agg(t.recipe_key, ',' order by t.recipe_key), ''))
    into v_keys_after from extend.wbx_recipe t;
  if v_keys_after is distinct from v_keys_before then
    raise exception 'dd173-recipe: the natural key values are NOT identical across the rename (% -> %). Nothing about a rename may change a value; this file does not ship.',
      v_keys_before, v_keys_after;
  end if;
  if not exists (
    select 1 from pg_constraint c
     where c.conrelid = 'extend.wbx_recipe'::regclass and c.contype = 'p'
       and pg_get_constraintdef(c.oid) = 'PRIMARY KEY (recipe_key)') then
    raise exception 'dd173-recipe: the primary key did not follow the rename. Live definition: %',
      (select pg_get_constraintdef(c.oid) from pg_constraint c
        where c.conrelid = 'extend.wbx_recipe'::regclass and c.contype = 'p');
  end if;
  if not exists (
    select 1 from information_schema.column_privileges
     where table_schema = 'extend' and table_name = 'wbx_recipe'
       and grantee = 'anon' and column_name = 'recipe_key' and privilege_type = 'SELECT') then
    raise exception 'dd173-recipe: the anon column grant did not follow the rename. DD-186''s column bound is the only thing standing between a new column and the open web; it is not re-granted on a guess.';
  end if;
  raise notice 'dd173-recipe: id -> recipe_key; % key values byte-identical, PK and anon column grant followed the column', v_rowcount;

  -- ═══════ 3. THE BASE RETROFIT, through the one path ══════════════════════════════════════════
  -- The table now has no `id`, so retrofit_entity takes its own "id(uuid + unique; the natural key
  -- stays the PK)" branch and adds the canonical identity the same way it did for the 35 tables
  -- B-65 shipped.
  v_res := platform.retrofit_entity('extend', 'wbx_recipe', 'wbx_recipe', 'system',
             null, null, null, null,
             $x$case when t.is_active then 'public' else 'internal' end$x$, null);
  raise notice 'dd173-recipe: %', v_res;

  if not exists (select 1 from information_schema.columns
                  where table_schema='extend' and table_name='wbx_recipe'
                    and column_name='id' and udt_name='uuid' and is_nullable='NO') then
    raise exception 'dd173-recipe: the canonical uuid identity is not present after the retrofit. The whole file exists to add it.';
  end if;
  if (select count(distinct id) from extend.wbx_recipe) <> v_rowcount then
    raise exception 'dd173-recipe: the new uuid identity is not unique across % rows.', v_rowcount;
  end if;

  -- ═══════ 4. SUPERSEDE BY NAME, then GENERATE ═════════════════════════════════════════════════
  select coalesce(array_agg(pol.polname order by pol.polname), '{}') into v_live
    from pg_policy pol
   where pol.polrelid = 'extend.wbx_recipe'::regclass
     and not (pol.polname = any (iam.generated_policy_names()));
  v_extra := array(select unnest(v_live) except select unnest(v_names));
  if v_extra <> '{}' then
    raise exception
      'dd173-recipe: extend.wbx_recipe carries hand-written policy/policies % that this file has never seen. Nothing was dropped. A policy nobody enumerated is not superseded on a guess — re-census and re-write this file.',
      array_to_string(v_extra, ', ');
  end if;
  v_drop := array(select unnest(v_names) intersect select unnest(v_live));
  if cardinality(v_drop) > 0 then
    perform iam.supersede_bespoke_policies('extend', 'wbx_recipe', v_drop,
      'DD-173 B-103: extend.wbx_recipe is a platform-wide browser-automation recipe catalogue registered by DD-159 batch 3 and refused by iam.apply_rls ever since for a TEXT id. Its identity is renamed to recipe_key and its base contract retrofitted in this same transaction, and its hand-written policy set (a plain USING (true) read plus the platform-admin lane) is superseded by the generated set iam.apply_rls emits for the system variant. Kept unsuperseded the two regimes would OR together and leave the table wider than either intended.');
  end if;
  perform iam.apply_rls('extend', 'wbx_recipe', 'wbx_recipe', 'system');
  raise notice 'dd173-recipe: generated wbx_recipe, superseding % of % declared bespoke name(s)',
    cardinality(v_drop), cardinality(v_names);

  -- ═══════ 4b. THE NEW IDENTITY JOINS THE DECLARED ANON COLUMN SURFACE ═════════════════════════
  -- Granted AFTER generation, because iam.apply_rls re-runs iam.apply_table_grants. That generator
  -- grants only `authenticated` and `service_role` and its only mention of `anon` is a revoke
  -- (DD-193), so this grant is not undone by a later regeneration — but ordering it last makes
  -- that independent of the generator's internals rather than dependent on them.
  grant select (id) on extend.wbx_recipe to anon;

  execute 'set local role anon';
  select count(*) into v_anon_after from extend.wbx_recipe;
  execute 'reset role';
  if v_anon_after is distinct from v_anon_before then
    raise exception 'dd173-recipe: THE ANONYMOUS DOOR MOVED on a public catalogue: % rows before, % after. This table is read signed-out by the extension before anyone signs in.',
      v_anon_before, v_anon_after;
  end if;
  if not exists (
    select 1 from information_schema.column_privileges
     where table_schema='extend' and table_name='wbx_recipe'
       and grantee='anon' and column_name='id' and privilege_type='SELECT') then
    raise exception 'dd173-recipe: the anon grant on the new id column is not present; the access-delta probe would read this public catalogue as zero rows for anonymous forever after.';
  end if;
  if exists (
    select 1 from information_schema.column_privileges
     where table_schema='extend' and table_name='wbx_recipe' and grantee='anon'
       and column_name in ('created_by','updated_by','organization_id','metadata','version')) then
    raise exception 'dd173-recipe: the retrofit''s identity and bookkeeping columns reached the anonymous surface. DD-186 revokes exactly those; only the row identity and the domain columns are published.';
  end if;
  raise notice 'dd173-recipe: anon gate — % rows before, % after, identity columns still revoked',
    v_anon_before, v_anon_after;

  -- ═══════ 5. THE GATE — the same probe, the same instant ══════════════════════════════════════
  v_after := iam.access_delta_snapshot('DD-173 wbx_recipe AFTER', v_principals, v_tokens, 400000,
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
        raise notice 'dd173-recipe: WIDER (approved by name) % for % : % -> %', r.token, r.principal_label, r.count_before, r.count_after;
      end if;

    elsif r.verdict = 'UNPROVEN' then
      -- 🚨 UNPROVEN IS NOT A PASS. Here the cause is structural and is the whole point of the file:
      -- `iam.access_delta_snapshot` only collects ids when the table has a UUID `id`, so the BEFORE
      -- half — taken while `id` was still TEXT — hashed the row text instead. The count is
      -- necessary and not sufficient; what makes it sufficient is that the count IS the whole
      -- table. Any pair where that is not true aborts.
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
      raise notice 'dd173-recipe: NARROWED % for % : % -> %', r.token, r.principal_label, r.count_before, r.count_after;
    end if;
  end loop;
  if cardinality(v_unapproven_hard) > 0 then
    raise exception 'dd173-recipe: % read(s) this gate could not prove either way: %',
      cardinality(v_unapproven_hard), array_to_string(v_unapproven_hard, ' ; ');
  end if;
  if cardinality(v_unapproved) > 0 then
    raise exception
      'dd173-recipe: % door(s) opened that nobody approved by name: %. Over-opening and over-tightening are the same class of defect and neither ships on a count.',
      cardinality(v_unapproved), array_to_string(v_unapproved, ' ; ');
  end if;
  raise notice 'dd173-recipe: 0 unapproved widenings, % narrowing(s), % pair(s) whole-table-identical (id-hash UNPROVEN by construction, resolved)',
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
    raise exception 'dd173-recipe: % base-contract FAIL(s) remain after the retrofit: %. This file exists to close exactly these.',
      cardinality(v_base_fail), array_to_string(v_base_fail, ' ; ');
  end if;
  if cardinality(v_policy_fail) > 0 then
    raise exception 'dd173-recipe: % POLICY-family FAIL(s) after generation: %. The generator produced a policy set its own certification refuses; this round does not stand.',
      cardinality(v_policy_fail), array_to_string(v_policy_fail, ' ; ');
  end if;
  raise notice 'dd173-recipe: iam.verify_canonical — 0 base-contract FAIL and 0 POLICY-family FAIL on wbx_recipe';

  -- ═══════ 7. ACKNOWLEDGE THIS FILE'S OWN GUARD FIRINGS ════════════════════════════════════════
  select count(*) into v_acked from platform.ddl_guard_log
   where rule = 'nullable_org' and acknowledged_at is null and occurred_at >= v_as;
  if v_acked > 0 then
    perform platform.ddl_guard_ack(
      p_reason => 'DD-173 B-103 (extend.wbx_recipe): platform.retrofit_entity added organization_id and set it NOT NULL in the same call, and raises if any row would be left without an organization. The guard saw the ADD COLUMN half of that pair. The alternative (add column not null default <org>) is hard-blocked by this same guard, and combining add + drop-default into one ALTER is rejected by Postgres.',
      p_by     => 'DD-173 B-103 wbx_recipe migration',
      p_rule   => 'nullable_org',
      p_before => null,
      p_ids    => (select array_agg(id) from platform.ddl_guard_log
                    where rule = 'nullable_org' and acknowledged_at is null and occurred_at >= v_as));
    raise notice 'dd173-recipe: acknowledged % nullable_org guard firing(s) raised by this file', v_acked;
  end if;
end $dd173r$;
