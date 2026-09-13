-- platform_base_contract_dd173_batch1_reference_catalogs — DD-173 BATCH 1 (9 tokens).
--
-- 🚨 `billing_plan` WAS THE TENTH AND IS HELD BACK BY NAME, NOT SKIPPED. `billing.plan.id` is
--    TEXT ('free', 'pro', …) — the plan's natural key wearing the canonical identity's name — and
--    §6d-3 requires `id uuid` on a `system` table. `platform.retrofit_entity` refuses rather than
--    changing a live identity underneath rows, and it is right to: `billing.plan_limit.plan_id`,
--    `billing.user_plan.plan_id` and the app's plan ladder all key on that text. Its disposition
--    (rename the natural key to `plan_key`, add the uuid identity, repoint the FKs, in one
--    migration with its own proof) is written up in the B-65 report. It generates fine; it is the
--    CERTIFICATION bar it cannot meet today, and shipping it half-done would put a base-contract
--    FAIL inside a batch whose whole claim is that there are none.
--
-- THE NINE. Every one is a platform-wide REFERENCE CATALOG registered by DD-159 batch 1 and then
-- refused by `iam.apply_rls` for a missing base contract: the plans, prices, products,
-- capabilities and limits the billing screens read; the industry list; the country-by-country
-- outreach rules; the assurance and source-authority vocabularies. All ten are `rls_variant =
-- system`, `data_class = public`, and all ten are read TODAY by everyone including anonymous
-- visitors through a hand-written `USING (true)` (or `USING (active)`) policy.
--
-- WHAT EACH ONE GETS, AND WHY IT IS NOT A CHOICE THIS FILE MAKES
-- -------------------------------------------------------------
-- `platform.retrofit_entity` derives the columns from the registry's `rls_variant` through
-- db-rules §6d-3. For the `system` variant that is: id uuid, organization_id NOT NULL + FK,
-- created_at, metadata, the actor pair + `_stamp_actor`, the mutation trio + `_touch_row`, and a
-- `visibility` enum — which `iam.apply_rls` HARD-REQUIRES for this variant and which is the only
-- value this file has to decide.
--
-- 🚨 ORGANIZATION: THE SYSTEM ORG, EXPLICITLY. db-rules §2 — "System / global / builtin / template
--    content: the launching operation explicitly supplies the system org, iam.organizations.id =
--    39c38960-…". A price list, a plan ladder, a country rule table and an industry vocabulary are
--    platform content by construction: no customer wrote a row and no customer owns one. NULL is
--    not a scope and the database is never allowed to choose, so the strategy is named ('system')
--    at every call and `retrofit_entity` raises if one row would be left without an org.
--
-- 🚨 VISIBILITY: 'public' WHERE THE TABLE HAS NO ACTIVE FLAG, AND DERIVED FROM THAT FLAG WHERE IT
--    HAS ONE. These rows are read by signed-out visitors today, and the generated `pub_read`
--    lane is `visibility = 'public'`, so a flat 'public' reproduces exactly today's reach. Where
--    the table already distinguishes live from retired rows (`active` / `is_active`), the retired
--    ones are given 'internal' instead — every such row is live TODAY, so nothing moves now, but
--    a plan retired tomorrow stops being published to the world by the flag that already means
--    that. `billing.plan` is the one whose current policy already reads the flag
--    (`is_platform_admin() OR active`); the other five are `USING (true)` and this is a
--    deliberate, named tightening of what they will publish in future, not of what they publish
--    today.
--
-- 🚨 THE BESPOKE SET IS RE-READ, NOT TRUSTED. DD-159 batch 2 hardcoded each table's hand-written
--    policy names and aborted on any difference. That is right and it is not enough here: a
--    SIBLING LANE (DD-172, the unattributed-policy sweep) is superseding policies on this same
--    database this same hour — four `*_no_write` policies on these very tables disappeared between
--    this file's census and its first rehearsal. So the declared set below is a SUPERSET: the file
--    supersedes the names that are actually there and ABORTS on any name it has never seen. A
--    peer removing a policy must not fail this migration; a policy nobody enumerated must.
--
-- 🚨 THE TRANSIENT NULLABLE-ORG WINDOW IS ACKNOWLEDGED, NOT SWALLOWED. `platform._ddl_guard`'s log
--    lane records severity 'error' / rule 'nullable_org' for each ADD COLUMN before the SET NOT
--    NULL that follows it in the same call. Those firings are acknowledged at the end of this file
--    through `platform.ddl_guard_ack` — the supported write path — with a reason naming DD-173 and
--    the fact that the same transaction made the column NOT NULL. Nothing is silenced: an
--    unacknowledged firing on any OTHER table is still there for the reader.
--
-- ONE FILE, ONE TRANSACTION, ON PURPOSE. The baseline, the schema change, the generation and the
-- gate are the same transaction, so a widening nobody approved rolls the SCHEMA back too. And
-- both snapshots are pinned to `now()`, which in Postgres is the TRANSACTION timestamp — the same
-- instant the ADD COLUMN defaults evaluate to, so a `created_at` this file adds is inside the pin
-- rather than reading as every row disappearing.
set local lock_timeout = '20s';

do $dd173b1$
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
    'a4955b5c-d524-4d72-a90e-0658d5d51148',  -- developer111@pixelium.uk: a NON-admin with real rows elsewhere
    'c5e92166-e148-4e73-926e-83af0c453665',  -- seo@titaniumsuccess.com: a plain member of a real organization
    '34ed4fc3-c527-4819-99bf-15c26603b261',  -- arman@titaniumsuccess.com: admin of that organization, NOT platform staff
    '4060701e-706a-4c76-b3ca-0bbc69fa5a14',  -- test@test.com: a non-member
    '00000000-0000-0000-0000-000000000000'   -- anonymous, no JWT — the one that matters most on a public catalog
  ]::uuid[];
  v_tokens text[] := array[
    'assurance_level','billing_capability','billing_capability_limit',
    'billing_plan_limit','billing_price','billing_product','industry',
    'jurisdiction_policy','source_authority'];
  -- token | schema | table | visibility expression (SQL over alias t, or a literal)
  v_plan constant text[][] := array[
    array['assurance_level','platform','assurance_level',          $x$case when t.is_active then 'public' else 'internal' end$x$],
    array['billing_capability','billing','capability',             $x$'public'$x$],
    array['billing_capability_limit','billing','capability_limit',  $x$'public'$x$],
    array['billing_plan_limit','billing','plan_limit',              $x$'public'$x$],
    array['billing_price','billing','price',                        $x$case when t.active then 'public' else 'internal' end$x$],
    array['billing_product','billing','product',                    $x$case when t.active then 'public' else 'internal' end$x$],
    array['industry','iam','industries',                            $x$case when t.is_active then 'public' else 'internal' end$x$],
    array['jurisdiction_policy','crm','jurisdiction_policy',        $x$'public'$x$],
    array['source_authority','platform','source_authority',         $x$case when t.is_active then 'public' else 'internal' end$x$]];
  -- the SUPERSET of hand-written policy names this file was written against: 'token|a,b,c'.
  -- (A flat text[] rather than a 2-D array because Postgres requires every row of a
  -- multidimensional array to have the same length, and these tables do not.)
  v_bespoke constant text[] := array[
    'assurance_level|assurance_level_platform_admin_all,assurance_level_select_all,platform_admin_delete_only,platform_admin_insert_only,platform_admin_update_only',
    'billing_capability|capability_read,capability_no_write,platform_admin_delete_only,platform_admin_insert_only,platform_admin_update_only',
    'billing_capability_limit|capability_limit_read,capability_limit_no_write,platform_admin_delete_only,platform_admin_insert_only,platform_admin_update_only',
    'billing_plan_limit|plan_limit_public_read,platform_admin_delete_only,platform_admin_insert_only,platform_admin_update_only',
    'billing_price|price_read,price_no_write,platform_admin_delete_only,platform_admin_insert_only,platform_admin_update_only',
    'billing_product|product_read,product_no_write,platform_admin_delete_only,platform_admin_insert_only,platform_admin_update_only',
    'industry|industries_select_all',
    'jurisdiction_policy|jurisdiction_policy_select_all,platform_admin_delete_only,platform_admin_insert_only,platform_admin_update_only',
    'source_authority|platform_admin_delete_only,platform_admin_insert_only,platform_admin_update_only,source_authority_platform_admin_all,source_authority_select_all'];
  -- A WIDENING IS APPROVED BY NAME OR IT IS A FAILURE. 'token|principal'.
  v_approved constant text[] := '{}';
  i int; v_tok text; v_sch text; v_tbl text; v_vis text; v_names text[];
begin
  -- ═══════ 1. THE BEFORE, pinned to this transaction's instant ═════════════════════════════════
  v_before := iam.access_delta_snapshot('DD-173 b1 BEFORE', v_principals, v_tokens, 400000,
    'DD-173 batch 1: the ten public reference catalogs, before the base retrofit and generation', v_as);
  raise notice 'dd173b1: baseline % over % tokens x % principals, pinned at %',
    v_before, cardinality(v_tokens), cardinality(v_principals), v_as;

  -- ═══════ 2. THE BASE RETROFIT, per token, through the one path ═══════════════════════════════
  for i in 1 .. array_length(v_plan, 1) loop
    v_tok := v_plan[i][1]; v_sch := v_plan[i][2]; v_tbl := v_plan[i][3]; v_vis := v_plan[i][4];
    v_res := platform.retrofit_entity(v_sch, v_tbl, v_tok, 'system', null, null, null, null, v_vis, null);
    raise notice 'dd173b1: %', v_res;
  end loop;

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
        'dd173b1: %.% carries hand-written policy/policies % that this file has never seen. Nothing was dropped. A policy nobody enumerated is not superseded on a guess — re-census and re-write this file.',
        v_sch, v_tbl, array_to_string(v_extra, ', ');
    end if;
    v_drop := array(select unnest(v_names) intersect select unnest(v_live));
    if cardinality(v_drop) > 0 then
      perform iam.supersede_bespoke_policies(v_sch, v_tbl, v_drop, format(
        'DD-173 batch 1: %s is a platform-wide reference catalog registered by DD-159 batch 1 and refused by iam.apply_rls until now for a missing base contract. Its base contract is retrofitted in this same transaction and its hand-written policy set is superseded by the generated set iam.apply_rls emits for the system variant. Kept unsuperseded the two would OR together and leave the table wider than either regime intended.',
        v_tok));
    end if;
    perform iam.apply_rls(v_sch, v_tbl, v_tok, 'system');
    raise notice 'dd173b1: generated % (%.%), superseding % of % declared bespoke name(s)',
      v_tok, v_sch, v_tbl, cardinality(v_drop), cardinality(v_names);
  end loop;

  -- ═══════ 4. THE GATE — the same probe, the same instant, the same cast ═══════════════════════
  v_after := iam.access_delta_snapshot('DD-173 b1 AFTER', v_principals, v_tokens, 400000,
    'DD-173 batch 1 confirmation, pinned to the same instant as the baseline', v_as);
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
        raise notice 'dd173b1: WIDER (approved by name) % for % : % -> %', r.token, r.principal_label, r.count_before, r.count_after;
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
      raise notice 'dd173b1: NARROWED % for % : % -> %', r.token, r.principal_label, r.count_before, r.count_after;
    end if;
  end loop;
  if cardinality(v_unapproven_hard) > 0 then
    raise exception 'dd173b1: % read(s) this gate could not prove either way: %',
      cardinality(v_unapproven_hard), array_to_string(v_unapproven_hard, ' ; ');
  end if;
  if cardinality(v_unapproved) > 0 then
    raise exception
      'dd173b1: % door(s) opened that nobody approved by name: %. Over-opening and over-tightening are the same class of defect and neither ships on a count.',
      cardinality(v_unapproved), array_to_string(v_unapproved, ' ; ');
  end if;
  raise notice 'dd173b1: 0 unapproved widenings, % narrowing(s), % pair(s) whole-table-identical (id-hash UNPROVEN by construction, resolved), across % tokens x % principals',
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
    raise exception 'dd173b1: % base-contract FAIL(s) remain after the retrofit: %. This file exists to close exactly these.',
      cardinality(v_base_fail), array_to_string(v_base_fail, ' ; ');
  end if;
  if cardinality(v_policy_fail) > 0 then
    raise exception 'dd173b1: % POLICY-family FAIL(s) after generation: %. The generator produced a policy set its own certification refuses; this round does not stand.',
      cardinality(v_policy_fail), array_to_string(v_policy_fail, ' ; ');
  end if;
  raise notice 'dd173b1: iam.verify_canonical — 0 base-contract FAIL and 0 POLICY-family FAIL across all 9 tokens';

  -- ═══════ 6. ACKNOWLEDGE THIS FILE'S OWN GUARD FIRINGS ════════════════════════════════════════
  select count(*) into v_acked from platform.ddl_guard_log
   where rule = 'nullable_org' and acknowledged_at is null and occurred_at >= v_as;
  if v_acked > 0 then
    perform platform.ddl_guard_ack(
      p_reason => 'DD-173 batch 1: platform.retrofit_entity added organization_id and set it NOT NULL in the same call, and raises if any row would be left without an organization. The guard saw the ADD COLUMN half of that pair. The alternative (add column not null default <org>) is hard-blocked by this same guard, and combining add + drop-default into one ALTER is rejected by Postgres.',
      p_by     => 'DD-173 batch 1 migration',
      p_rule   => 'nullable_org',
      p_before => null,
      p_ids    => (select array_agg(id) from platform.ddl_guard_log
                    where rule = 'nullable_org' and acknowledged_at is null and occurred_at >= v_as));
    raise notice 'dd173b1: acknowledged % nullable_org guard firing(s) raised by this file', v_acked;
  end if;
end $dd173b1$;
