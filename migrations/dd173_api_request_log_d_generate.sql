-- dd173_api_request_log_d_generate — DD-173 `ops.api_request_log`, STEP D of four: the policies
-- are GENERATED, under the access-delta gate, and the hand-written one is superseded by name.
--
-- Steps A-C gave the table the ledger base contract (organization_id NOT NULL + FK validated,
-- metadata, uuid id, created_at). This file is what DD-159 batch 1 could not do: it replaces the
-- one bespoke policy with the set `iam.apply_rls` emits for `ledger` under the `confidential`
-- class, and proves nobody's read got wider.
--
-- 🚨 WHAT THIS CHANGES, MEASURED BEFORE IT WAS WRITTEN:
--    TODAY  — one policy, `platform_admin_all` (ALL, authenticated, `is_platform_admin()`): every
--             platform admin reads all 1.6 M request-log rows; everyone else reads none.
--    AFTER  — `svc_all` (service_role, the server's own writer and reader) plus `std_select`
--             (`organization_id IS NOT NULL AND organization_id IN (SELECT iam.my_orgs())`), and
--             NO platform-admin lane, because `iam.class_lanes` gives a `confidential` class none
--             (DD-137b: our own staff go through the door like anyone).
--    Every row's organization is the Matrx System organization, and the Matrx System organization
--    has ZERO members (measured 2026-09-14). So `std_select` admits nobody today, and the whole
--    delta is a NARROWING: three platform admins go from the whole table to none. That is the
--    declared behaviour of a confidential ledger, and the gate below names each one rather than
--    letting a narrowing pass unremarked — over-opening and over-tightening are the same class of
--    defect. Nothing on the read path breaks: this trail is read by `service_role` (the server)
--    and by no client in any of the five repos, and the frontend's one admin route reads it
--    through the service-role client.
--
-- 🚨 WHY AN INDEX ON organization_id IS PART OF THIS FILE AND NOT A SEPARATE OPINION. Generated
--    lanes on this table all filter `organization_id`. On 1.6 M rows with no index on it, ONE
--    principal's RLS read is a full sequential scan: measured 2026-09-14, five principals reading
--    zero rows took 7,833 ms — 1.6 s each. The gate's AFTER snapshot reads as eight principals,
--    and it runs while this transaction holds the ACCESS EXCLUSIVE lock `iam.apply_rls` takes to
--    drop and create policies. Without the index that is ~13 s of the strongest lock there is on
--    a table under continuous writes — about three times the 4.5 s readiness budget. With it the
--    lane is an index lookup for a principal with no matching organization. The index is created
--    BEFORE the generation, so its own build (SHARE: readers unaffected, the async audit sink's
--    inserts queue) is outside that window.
--
-- 🚨 AND THE GATE IS SPLIT FOR THE SAME REASON — MEASURED, NOT FEARED. A full eight-principal
--    AFTER snapshot inside this transaction was rehearsed on the live table (rolled back,
--    2026-09-14 06:34:55Z) and held ACCESS EXCLUSIVE for 14,192 ms — three times the 4.5 s
--    readiness budget. The index does not fix it: `organization_id IN (SELECT iam.my_orgs())`
--    plans as a hash join, and for a principal who IS in some organization the probe still reads
--    all 1.6 M rows. So the AFTER snapshot moved OUT of the locked window into its own file,
--    `dd173_api_request_log_e_gate.sql`, which takes no lock at all and compares against the
--    BEFORE this file pins. That rehearsal is also the gate's own dress rehearsal, and its
--    verdict was: 0 unapproved widenings, 3 narrowings (the three platform admins, 1,615,224 ->
--    0), 5 principals unchanged at 0, `iam.verify_canonical` 0 base-contract FAIL and 0
--    POLICY-family FAIL.
--
-- 🚨 WHAT MAKES THE GAP BETWEEN THIS FILE'S COMMIT AND THE GATE FILE SAFE IS PROVEN HERE, NOT
--    ASSUMED. Before this transaction commits, step 6 proves — in milliseconds, off the index and
--    the membership table — that EVERY row of this table belongs to the Matrx System
--    organization and that the Matrx System organization has NO members. `std_select` admits a
--    row only to a member of its organization, so no authenticated principal can read a single
--    row of this table the moment the policies change, whatever the gate measures afterwards.
--    The gate file then measures it anyway.

do $dd173arld$
declare
  v_as        timestamptz := now();
  v_before    uuid;
  v_sysorg    constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';  -- matrx-system (db-rules §2)
  v_other_org boolean; v_members bigint;
  v_lock_t0   timestamptz; v_locked_ms numeric;
  v_budget_ms constant numeric := 4500;   -- the readiness budget, db-rules; never raised here
  r record; v record; f text;
  v_live text[]; v_extra text[]; v_drop text[];
  v_names constant text[] := array['platform_admin_all'];   -- the SUPERSET this file was written against
  v_policy_fail text[] := '{}'; v_base_fail text[] := '{}';
  v_lane boolean; v_sup boolean;
  v_policy_checks constant text[] := array[
    'policies_canonical','bespoke_policy_present','privacy_wall','personal_row_wall',
    'rls_enabled','anon_public_lane','class_lanes','component_anon_lane',
    'policy_system_public_read','pub_read_anon','component_public_read',
    'component_not_wider_than_parent','containment_respects_personal'];
  v_principals constant uuid[] := array[
    '7604b9d9-57f3-4c44-b75b-dc9a3ee8aacf',  -- platform admin, arman26@gmail.com (super_admin)
    '6555aa73-c647-4ecf-8a96-b60e315b6b18',  -- platform admin, info@aimatrx.com
    '87a6e699-3622-4869-8843-d0867456c0dd',  -- platform admin, admin@admin.com (the testing identity)
    'a4955b5c-d524-4d72-a90e-0658d5d51148',  -- developer111@pixelium.uk: a NON-admin with real rows elsewhere
    'c5e92166-e148-4e73-926e-83af0c453665',  -- seo@titaniumsuccess.com: a plain member of a real organization
    '34ed4fc3-c527-4819-99bf-15c26603b261',  -- arman@titaniumsuccess.com: admin of that organization, NOT platform staff
    '4060701e-706a-4c76-b3ca-0bbc69fa5a14',  -- test@test.com: a non-member
    '00000000-0000-0000-0000-000000000000'   -- anonymous, no JWT
  ]::uuid[];
begin
  -- ═══════ 0. STEP C MUST HAVE SEALED THE CONTRACT ════════════════════════════════════════════
  if not exists (select 1 from pg_attribute a where a.attrelid='ops.api_request_log'::regclass
                  and a.attname='organization_id' and a.attnotnull and not a.attisdropped) then
    raise exception 'dd173-arl-d: organization_id is not NOT NULL yet. Step C has not sealed the contract; the generator would refuse this table anyway.';
  end if;

  -- ═══════ 1. THE BEFORE, pinned to this transaction's instant ════════════════════════════════
  v_before := iam.access_delta_snapshot('DD-173 api_request_log BEFORE @' || v_as::text, v_principals,
    array['api_request_log'], 20000,
    'DD-173 ops.api_request_log: the one bespoke platform-admin policy, before generation', v_as);
  raise notice 'dd173-arl-d: baseline % over 1 token x % principals, pinned at % — dd173_api_request_log_e_gate.sql compares against this run, by label, with no lock', v_before, cardinality(v_principals), v_as;

  -- ═══════ 2. THE DECLARATION THAT MUST COME BEFORE THE GENERATION ════════════════════════════
  select l.platform_admin_lane, coalesce(et.suppress_platform_admin_lane,false)
    into v_lane, v_sup
    from platform.entity_types et, lateral iam.class_lanes(et.token) l
   where et.token = 'api_request_log';
  if not v_lane and not v_sup then
    update platform.entity_types set suppress_platform_admin_lane = true where token = 'api_request_log';
    raise notice 'dd173-arl-d: api_request_log declares suppress_platform_admin_lane — its confidential class has no staff lane';
  elsif v_lane and v_sup then
    raise exception 'dd173-arl-d: the registry declares suppress_platform_admin_lane but the class HAS a staff lane. The registry and the class disagree; nothing was generated.';
  end if;

  -- ═══════ 3. THE INDEX THE GENERATED LANE READS (see the header for the measurement) ═════════
  if not exists (select 1 from pg_indexes where schemaname='ops' and tablename='api_request_log'
                   and indexname='idx_api_request_log_organization_id') then
    create index idx_api_request_log_organization_id on ops.api_request_log (organization_id);
    raise notice 'dd173-arl-d: created idx_api_request_log_organization_id';
  end if;

  -- ═══════ 4. SUPERSEDE BY NAME — a policy nobody enumerated aborts this file ══════════════════
  select coalesce(array_agg(pol.polname order by pol.polname), '{}') into v_live
    from pg_policy pol
   where pol.polrelid = 'ops.api_request_log'::regclass
     and not (pol.polname = any (iam.generated_policy_names()));
  v_extra := array(select unnest(v_live) except select unnest(v_names));
  if v_extra <> '{}' then
    raise exception
      'dd173-arl-d: ops.api_request_log carries hand-written policy/policies % that this file has never seen. Nothing was dropped. A policy nobody enumerated is not superseded on a guess — re-census and re-write this file.',
      array_to_string(v_extra, ', ');
  end if;
  v_drop := array(select unnest(v_names) intersect select unnest(v_live));

  -- ═══════ 5. THE LOCKED WINDOW OPENS HERE ════════════════════════════════════════════════════
  v_lock_t0 := clock_timestamp();
  if cardinality(v_drop) > 0 then
    perform iam.supersede_bespoke_policies('ops','api_request_log', v_drop,
      'DD-173: ops.api_request_log is the platform''s own API request trail, registered ledger / confidential by DD-159 batch 1 and refused by iam.apply_rls ever since for a missing base contract (retrofitted in steps A-C of this series). Its one hand-written policy is a blanket is_platform_admin() lane over every row, which its confidential class forbids (iam.class_lanes gives a confidential class no platform-admin lane, DD-137b). It is superseded by the generated ledger set; kept beside it the two would OR together and leave the table wider than either regime intended.');
  end if;
  perform iam.apply_rls('ops','api_request_log','api_request_log','ledger');
  raise notice 'dd173-arl-d: generated api_request_log, superseding % of % declared bespoke name(s)', cardinality(v_drop), cardinality(v_names);

  -- ═══════ 6. THE PROOF THAT COSTS MILLISECONDS, AND IS COMPLETE ═════════════════════════════
  -- Not a sample and not an argument from the class: the generated read lane admits a row to a
  -- member of that row's organization. If every row is in one organization and that organization
  -- has no members, the lane admits nothing — and both halves are read here, off the index and
  -- off iam.memberships, while the lock is held.
  -- Two range probes rather than min()/max(): a uuid has no min() aggregate, and each of these
  -- rides idx_api_request_log_organization_id and stops at the first row it finds. Together they
  -- say "no row sorts before or after the system organization", i.e. every row is in it — and
  -- organization_id is NOT NULL as of step C, so there is no third case.
  select exists (select 1 from ops.api_request_log t where t.organization_id < v_sysorg)
    into v_other_org;
  if not v_other_org then
    select exists (select 1 from ops.api_request_log t where t.organization_id > v_sysorg)
      into v_other_org;
  end if;
  if v_other_org then
    raise exception
      'dd173-arl-d: this table holds rows outside the Matrx System organization. The millisecond proof below does not hold and the eight-principal gate must run inside this transaction instead. Nothing is committed.';
  end if;
  select count(*) into v_members from iam.memberships where organization_id = v_sysorg;
  if v_members > 0 then
    raise exception
      'dd173-arl-d: the Matrx System organization has % member(s). The generated lane would hand them the whole request-log trail, which is a widening nobody approved by name. Nothing is committed.',
      v_members;
  end if;

  -- the generated set is exactly what a confidential ledger gets, and carries no staff arm
  select coalesce(array_agg(pol.polname order by pol.polname), '{}') into v_live
    from pg_policy pol where pol.polrelid = 'ops.api_request_log'::regclass;
  if v_live <> array['std_select','svc_all']::text[] then
    raise exception 'dd173-arl-d: after generation the policy set is %, not the {std_select, svc_all} a confidential ledger gets. Nothing is committed.', array_to_string(v_live, ', ');
  end if;
  select pg_get_expr(pol.polqual, pol.polrelid) into f
    from pg_policy pol where pol.polrelid='ops.api_request_log'::regclass and pol.polname='std_select';
  if f ilike '%is_platform_admin%' or f ilike '%system_orgs%' then
    raise exception 'dd173-arl-d: the generated std_select carries a staff or system-org arm (%) on a confidential ledger. Nothing is committed.', f;
  end if;
  raise notice 'dd173-arl-d: every row is in the Matrx System organization, which has 0 members; the generated lane is % — so no authenticated principal reads a row of this table', f;

  v_locked_ms := extract(epoch from (clock_timestamp() - v_lock_t0)) * 1000;
  if v_locked_ms > v_budget_ms then
    raise exception
      'dd173-arl-d: the generation held ACCESS EXCLUSIVE on ops.api_request_log for % ms, past the % ms readiness budget. NOTHING IS COMMITTED. The budget is not raised to make a migration fit.',
      round(v_locked_ms), v_budget_ms;
  end if;
  raise notice 'dd173-arl-d: the locked window (supersede + generate + proof) was % ms, inside the % ms readiness budget', round(v_locked_ms), v_budget_ms;

  -- ═══════ 7. CERTIFICATION — both axes, or this round does not stand ═════════════════════════
  for v in select * from iam.verify_canonical('ops','api_request_log','api_request_log') where status='FAIL' loop
    f := format('%s: %s', v.check_name, coalesce(v.detail,''));
    if v.check_name = any (v_policy_checks) then v_policy_fail := array_append(v_policy_fail, f);
    else v_base_fail := array_append(v_base_fail, f); end if;
  end loop;
  if cardinality(v_base_fail) > 0 then
    raise exception 'dd173-arl-d: % base-contract FAIL(s) remain: %. Steps A-C exist to close exactly these.', cardinality(v_base_fail), array_to_string(v_base_fail, ' ; ');
  end if;
  if cardinality(v_policy_fail) > 0 then
    raise exception 'dd173-arl-d: % POLICY-family FAIL(s) after generation: %. The generator produced a policy set its own certification refuses; this round does not stand.', cardinality(v_policy_fail), array_to_string(v_policy_fail, ' ; ');
  end if;
  raise notice 'dd173-arl-d: iam.verify_canonical — 0 base-contract FAIL and 0 POLICY-family FAIL on api_request_log';
end $dd173arld$;
