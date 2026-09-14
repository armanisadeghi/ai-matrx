-- dd219_impairment_definitions_registered_for_what_they_are — DD-219 (lane B-112).
--
-- THE ONE ORPHAN COMPONENT IN THE DATABASE GETS A REAL REGISTRATION.
--
-- `legal.wc_impairment_definition` was registered `rls_variant = 'component'` — a child whose
-- access IS its parent's (db-rules §6d-1) — and then given no parent. `platform.entity_relationships`
-- holds ZERO rows naming it as a child, so `iam.class_lanes` answered `private` only by its
-- parentless-component safety fallback: nobody had ever declared this table's class anywhere in its
-- chain. `iam.verify_canonical` FAILed it on `composition_parent` ("no composition edge"),
-- `policy_defers_parent`, `privacy_wall` and `policies_canonical`, and `pnpm check:staff-door` has
-- named it since B-60. Its live policies said the opposite of `private`: a bespoke
-- `auth_read SELECT USING (true)` handed all 215 rows to every signed-in user. A class nobody
-- declared, measured against a parent that does not exist, beside a door that opened everything.
--
-- Re-parenting is not available and would be wrong. WHAT THE DATA SAYS:
--
--   * The 215 rows are the California permanent-disability impairment schedule — `impairment_number`
--     ('03.05.00.00'), `name` ('Pericardial Heart Disease'), `fec_rank`, `search_aliases`, an
--     `attributes` jsonb of {wpi, ue, le, side, digit}. A statutory reference dictionary.
--   * The table has NO `organization_id`, NO `created_by`, NO `visibility`, NO `user_id`. Nothing on
--     any row is tenant-scoped, and no row belongs to anyone.
--   * Nothing composes it. The ONE foreign key pointing at it runs the other way:
--     `legal.wc_injury.impairment_definition_id` REFERENCES it — an injury LOOKS UP a definition.
--     A shared lookup that many private children point at is the definition of a catalog, and a
--     catalog is not a component of its consumers.
--   * Every reader is signed in. aidream's `/legal/wc/ratings` router (the only reader: it owns
--     `GET /impairments`, `POST /impairments/search` and the calculator that resolves
--     `impairment_definition_id`) is mounted in `aidream/api/app.py` with
--     `dependencies=[Depends(require_authenticated)]` — guests and fingerprint-only sessions are
--     rejected before the handler. matrx-frontend reaches it only through that API
--     (`features/legal/wc/pd-ratings/api/hooks.ts`); no `supabase.from('wc_impairment_definition')`
--     exists in any repo. `anon` holds no table grant, so the open web reads 0 rows today and reads
--     0 rows after this file (measured live over HTTPS: `42501 permission denied` before).
--
-- So it is a catalog / shared-definition table: db-rules §6d-2's `system` variant, exactly like
-- `iam.industries`, `crm.jurisdiction_policy`, `seo.geo_place` and `hr.jurisdiction` — every one of
-- which carries `organization_id` = the Matrx System org (global_readable) and `visibility='public'`.
-- Class `public`: every signed-in user of the calculator legitimately reads all 215, and nothing in
-- the table is tenant-scoped. `iam.class_lanes('industry')` already answers `public` with
-- `platform_admin_lane = true`, so `suppress_platform_admin_lane` — which is `true` today while the
-- `platform_admin_all` policy exists anyway, the `privacy_wall` FAIL — goes to `false`, which is
-- what the live policy set has always been. `is_component` follows the variant (§6d-2: is_component
-- = true ⇔ rls_variant = 'component', exactly).
--
-- WHAT CHANGES FOR A READER: nothing. `auth_read USING (true)` is superseded by the generated
-- `std_select`, whose `visibility = 'public'` arm answers for every authenticated identity — the
-- same 215 rows, now stated by a declared class instead of an undeclared blanket.
--
-- WHAT CHANGES FOR A WRITER, said out loud because the read gate cannot see it (B-83's lesson):
-- today the table has NO insert/update/delete policy at all, so client writes are refused by RLS
-- even though the table grants already exist. The `system` contract emits `std_insert` /
-- `std_update` / `std_delete` — the canonical lane every one of the 62 active system+public tokens
-- already carries. A non-staff user still cannot touch any of the 215 rows: `std_update`/`std_delete`
-- key on `created_by = auth.uid()` (NULL on all 215) or `iam.has_access`, and `std_insert`'s
-- system-org arm needs `is_super_admin()`. They could insert a row under THEIR OWN organization,
-- which is what `industry`, `ai_model` and `jurisdiction_policy` have permitted all along. That is
-- the canonical contract for this variant, not a hole opened here; it is named here so no one has
-- to rediscover it.
--
-- Sibling census (brief item 5): `platform.entity_relationships` joined against every active
-- `component` token returns EXACTLY ONE token with no edge of any kind — this one. There is no
-- sibling to fix in the same change.
--
-- The named org strategy, the re-read bespoke superset, the one-transaction access gate, the
-- UNPROVEN resolution and the guard acknowledgement are DD-173 batch 1's shape.
set local lock_timeout = '20s';

do $dd219$
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
  v_edges      bigint;
  v_orphans    text[];
  v_rows       bigint;
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
    '34ed4fc3-c527-4819-99bf-15c26603b261',  -- arman@titaniumsuccess.com: ADMIN of that organization, NOT staff
    '4060701e-706a-4c76-b3ca-0bbc69fa5a14',  -- test@test.com: a non-member signed-in user
    '00000000-0000-0000-0000-000000000000'   -- anonymous, no JWT — must stay at 0
  ]::uuid[];
  v_tokens text[] := array['wc_impairment_definition'];
  -- A WIDENING IS APPROVED BY NAME OR IT IS A FAILURE. 'token|principal'.
  v_approved constant text[] := '{}';
begin
  -- ═══════ 0. THE PREMISE IS RE-MEASURED HERE, NOT TRUSTED FROM A REPORT ═══════════════════════
  select count(*) into v_edges from platform.entity_relationships
   where child_type = 'wc_impairment_definition' or parent_type = 'wc_impairment_definition';
  if v_edges <> 0 then
    raise exception
      'dd219: platform.entity_relationships now holds % edge(s) naming wc_impairment_definition. This file re-registers an ORPHAN component as a system catalog; if it has acquired a parent since the census, the right answer may be the parent, not the catalog. Nothing was changed — re-read the edges and re-decide.',
      v_edges;
  end if;
  select coalesce(array_agg(et.token order by et.token), '{}') into v_orphans
    from platform.entity_types et
   where et.is_active and et.rls_variant = 'component'
     and not exists (select 1 from platform.entity_relationships er where er.child_type = et.token);
  if v_orphans <> array['wc_impairment_definition']::text[] then
    raise exception
      'dd219: the orphan-component census no longer returns exactly this one token — it returns %. A sibling with the identical shape must be fixed in the same change (brief item 5) or named; it cannot be silently left behind.',
      array_to_string(v_orphans, ', ');
  end if;
  raise notice 'dd219: premise re-measured — 0 edges, and wc_impairment_definition is the ONLY active orphan component in the database.';

  -- ═══════ 1. THE REGISTRY DECISION, with its reason stored on the row ═════════════════════════
  -- 🚨 data_class IS DELIBERATELY NOT SET HERE, AND THE ORDER IS THE WHOLE POINT.
  -- `platform._entity_types_class_regenerates` is an AFTER UPDATE OF data_class trigger that calls
  -- iam.apply_rls the instant the class moves. Setting the class in this statement fired the
  -- generator against a table that still had no created_by and no visibility, and it refused —
  -- correctly — with "lacks created_by — base-retrofit it before applying canonical RLS" (measured
  -- live in a rolled-back rehearsal). So the variant moves first, the base contract is retrofitted
  -- against it, and the class is declared afterwards in step 4c, where that same trigger regenerates
  -- onto a table that now satisfies the contract.
  update platform.entity_types et set
    rls_variant  = 'system',
    is_component = false,
    -- class public ⇒ iam.class_lanes.platform_admin_lane = true (proven on `industry`), and the
    -- platform_admin_all policy has been live on this table all along; suppressing it is the
    -- privacy_wall FAIL, not a wall.
    suppress_platform_admin_lane = false,
    -- §3.3: a screen needs a declared landing place. All 62 active system+public tokens land on
    -- `organization` and so does this one — the calculator opens on the shared catalog, not on
    -- "mine": nobody owns an impairment definition.
    default_list_scope = 'organization',
    data_class_reason =
      'DD-219 B-112 (2026-09-14): the California permanent-disability impairment schedule — 215 statutory reference rows (impairment_number, name, fec_rank, search_aliases, attributes). No organization_id, no created_by, no visibility, no user_id on any row: nothing here is tenant-scoped and no row belongs to anyone. Every reader is signed in — aidream''s /legal/wc/ratings router owns every read and is mounted behind require_authenticated, matrx-frontend reaches it only through that API, and anon holds no table grant (42501 over HTTPS, before and after). So class `public`: every signed-in user of the PD calculator legitimately reads all 215 rows.',
    notes = concat_ws(' ', et.notes,
      '[DD-219 B-112, 2026-09-14] rls_variant component -> system; is_component true -> false; data_class NULL -> public; suppress_platform_admin_lane true -> false. It was the ONLY orphan component in the database: platform.entity_relationships held zero edges naming it, so iam.class_lanes answered `private` by its parentless-component fallback while a bespoke auth_read USING (true) handed all 215 rows to every signed-in user. It is not a component of anything — the one FK runs the other way (legal.wc_injury.impairment_definition_id REFERENCES it), which is a catalog being looked up, not a child. Registered as the db-rules 6d-2 `system` catalog variant, the same shape as iam.industries, crm.jurisdiction_policy, seo.geo_place and hr.jurisdiction: Matrx System org, visibility public.')
   where et.token = 'wc_impairment_definition' and et.is_active;
  if not found then
    raise exception 'dd219: wc_impairment_definition is not an active row in platform.entity_types — nothing to re-register.';
  end if;

  -- ═══════ 2. THE BEFORE, pinned to this transaction's instant ═════════════════════════════════
  v_before := iam.access_delta_snapshot('DD-219 BEFORE', v_principals, v_tokens, 400000,
    'DD-219: the orphan component, before the retrofit and generation', v_as);
  raise notice 'dd219: baseline % over % token(s) x % principals, pinned at %',
    v_before, cardinality(v_tokens), cardinality(v_principals), v_as;

  -- ═══════ 3. THE BASE RETROFIT ════════════════════════════════════════════════════════════════
  -- db-rules §2 — the organization is STATED by the operation, never inferred: platform-published
  -- statutory reference data belongs to the Matrx System organization, which is global_readable.
  -- visibility is the literal 'public' because that is what the 215 rows are: a published statute.
  v_res := platform.retrofit_entity('legal','wc_impairment_definition','wc_impairment_definition',
             'system', null, null, null, null, $x$'public'$x$, null);
  raise notice 'dd219: %', v_res;

  -- ═══════ 4. DECLARE THE CLASS, SUPERSEDE BY NAME, then GENERATE ══════════════════════════════
  -- Now that the base contract is met, the class can be stated. The AFTER UPDATE OF data_class
  -- trigger regenerates the policy set for `system` on the spot; it keeps the bespoke auth_read,
  -- which step 4d then supersedes by name before the final, authoritative generation.
  update platform.entity_types et set data_class = 'public'
   where et.token = 'wc_impairment_definition' and et.is_active;

  select coalesce(array_agg(pol.polname order by pol.polname), '{}') into v_live
    from pg_policy pol
   where pol.polrelid = 'legal.wc_impairment_definition'::regclass
     and not (pol.polname = any (iam.generated_policy_names()));
  v_extra := array(select unnest(v_live) except select unnest(array['auth_read']));
  if v_extra <> '{}' then
    raise exception
      'dd219: legal.wc_impairment_definition carries hand-written policy/policies % that this file has never seen. Nothing was dropped. A policy nobody enumerated is not superseded on a guess — re-census and re-write this file.',
      array_to_string(v_extra, ', ');
  end if;
  v_drop := array(select unnest(array['auth_read']) intersect select unnest(v_live));
  if cardinality(v_drop) > 0 then
    perform iam.supersede_bespoke_policies('legal','wc_impairment_definition', v_drop,
      'DD-219 (B-112): auth_read SELECT USING (true) was the whole access story of a token registered as a component with no parent — a blanket door standing in for a class nobody had declared. The token is re-registered `system` / class `public` in this same transaction, and the generated std_select''s visibility=''public'' arm answers for exactly the same authenticated readers. Kept unsuperseded, the two regimes would OR together and leave the table wider than either intended.');
  end if;
  perform iam.apply_rls('legal','wc_impairment_definition','wc_impairment_definition','system');
  raise notice 'dd219: generated wc_impairment_definition (legal.wc_impairment_definition) as system, superseding % bespoke name(s)', cardinality(v_drop);

  -- ═══════ 4b. THE ROWS ARE ALL STILL THERE AND ALL STILL PUBLISHED ════════════════════════════
  select count(*) into v_rows from legal.wc_impairment_definition where visibility = 'public';
  if v_rows <> 215 then
    raise exception
      'dd219: % of the 215 impairment definitions carry visibility=''public'' after the retrofit. std_select''s reader arm IS that column, so any row missing it is a definition the calculator can no longer resolve.',
      v_rows;
  end if;
  raise notice 'dd219: all 215 impairment definitions carry visibility=public and organization_id = the Matrx System org.';

  -- ═══════ 4c. THE INTENDED READERS, ASKED DIRECTLY, UNDER THE authenticated ROLE ══════════════
  -- The delta gate compares row sets; this asks the question a person would ask. A non-member
  -- signed-in user and the ADMIN of a real customer organization who is not platform staff must
  -- both still see the whole impairment schedule, because both are exactly who the PD calculator
  -- serves. And the open web must still see nothing.
  foreach f in array array[
    '4060701e-706a-4c76-b3ca-0bbc69fa5a14|test@test.com (signed in, member of nothing)',
    '34ed4fc3-c527-4819-99bf-15c26603b261|arman@titaniumsuccess.com (admin of a real organization, NOT platform staff)']
  loop
    perform set_config('request.jwt.claims',
      json_build_object('sub', split_part(f,'|',1), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into v_rows from legal.wc_impairment_definition;
    execute 'reset role';
    perform set_config('request.jwt.claims', null, true);
    if v_rows <> 215 then
      raise exception
        'dd219: %s reads % of the 215 impairment definitions after the change. The bespoke auth_read this file supersedes handed all 215 to every signed-in user; re-stating that as a declared class must not take a single row away from anyone.',
        split_part(f,'|',2), v_rows;
    end if;
    raise notice 'dd219: % still reads all 215 impairment definitions (authenticated role, live policies)', split_part(f,'|',2);
  end loop;
  if has_table_privilege('anon','legal.wc_impairment_definition','SELECT') then
    raise exception
      'dd219: anon now holds SELECT on legal.wc_impairment_definition. §6d-2 — apply_table_grants leaves anon deliberately untouched and widening anon is a separate explicit decision nobody made here. The open web read 0 rows (42501) before this file and must read 0 rows after it.';
  end if;
  raise notice 'dd219: anon still holds no SELECT grant — the pub_read lane is inert for the open web, exactly as on every other system catalog.';

  -- ═══════ 5. THE GATE ═════════════════════════════════════════════════════════════════════════
  v_after := iam.access_delta_snapshot('DD-219 AFTER', v_principals, v_tokens, 400000,
    'DD-219 confirmation, pinned to the same instant as the baseline', v_as);
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
        raise notice 'dd219: WIDER (approved by name) % for % : % -> %', r.token, r.principal_label, r.count_before, r.count_after;
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
      raise notice 'dd219: NARROWED % for % : % -> %', r.token, r.principal_label, r.count_before, r.count_after;
    end if;
  end loop;
  if cardinality(v_unapproven_hard) > 0 then
    raise exception 'dd219: % read(s) this gate could not prove either way: %',
      cardinality(v_unapproven_hard), array_to_string(v_unapproven_hard, ' ; ');
  end if;
  if cardinality(v_unapproved) > 0 then
    raise exception
      'dd219: % door(s) opened that nobody approved by name: %. Over-opening and over-tightening are the same class of defect and neither ships on a count.',
      cardinality(v_unapproved), array_to_string(v_unapproved, ' ; ');
  end if;
  if cardinality(v_narrower) > 0 then
    raise exception
      'dd219: % reader(s) LOST rows: %. This file re-states an existing class; it does not take the impairment schedule away from anyone who reads it today.',
      cardinality(v_narrower), array_to_string(v_narrower, ' ; ');
  end if;
  raise notice 'dd219: 0 unapproved widenings, 0 narrowings, % pair(s) whole-table-identical, across % token(s) x % principals',
    cardinality(v_unproven_ok), cardinality(v_tokens), cardinality(v_principals);

  -- ═══════ 6. CERTIFICATION ════════════════════════════════════════════════════════════════════
  for v in select * from iam.verify_canonical('legal','wc_impairment_definition','wc_impairment_definition','system')
            where status = 'FAIL'
  loop
    f := format('wc_impairment_definition / %s: %s', v.check_name, coalesce(v.detail,''));
    if v.check_name = any (v_policy_checks) then v_policy_fail := array_append(v_policy_fail, f);
    else v_base_fail := array_append(v_base_fail, f); end if;
  end loop;
  if cardinality(v_base_fail) > 0 then
    raise exception 'dd219: % base-contract FAIL(s) remain after the retrofit: %. This file exists to close exactly these.',
      cardinality(v_base_fail), array_to_string(v_base_fail, ' ; ');
  end if;
  if cardinality(v_policy_fail) > 0 then
    raise exception 'dd219: % POLICY-family FAIL(s) after generation: %. The generator produced a policy set its own certification refuses; this round does not stand.',
      cardinality(v_policy_fail), array_to_string(v_policy_fail, ' ; ');
  end if;
  -- The FAIL this row was opened over, named explicitly so its disappearance is a stated outcome.
  if exists (select 1 from iam.verify_canonical('legal','wc_impairment_definition','wc_impairment_definition','system')
              where check_name = 'composition_parent' and status = 'FAIL') then
    raise exception 'dd219: composition_parent still FAILs. The whole point of this file is that a catalog is not a component.';
  end if;
  raise notice 'dd219: iam.verify_canonical — 0 base-contract FAIL, 0 POLICY-family FAIL, composition_parent FAIL gone.';

  -- ═══════ 7. ACKNOWLEDGE THIS FILE'S OWN GUARD FIRINGS ════════════════════════════════════════
  select count(*) into v_acked from platform.ddl_guard_log
   where rule = 'nullable_org' and acknowledged_at is null and occurred_at >= v_as;
  if v_acked > 0 then
    perform platform.ddl_guard_ack(
      p_reason => 'DD-219 (B-112): platform.retrofit_entity added organization_id and set it NOT NULL in the same call, and raises if any row would be left without an organization. The guard saw the ADD COLUMN half of that pair.',
      p_by     => 'DD-219 migration',
      p_rule   => 'nullable_org',
      p_before => null,
      p_ids    => (select array_agg(id) from platform.ddl_guard_log
                    where rule = 'nullable_org' and acknowledged_at is null and occurred_at >= v_as));
    raise notice 'dd219: acknowledged % nullable_org guard firing(s) raised by this file', v_acked;
  end if;
end $dd219$;
