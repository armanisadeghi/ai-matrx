-- WRITE-PERF — THE GREEN SUITE. Every asserted clause runs as `authenticated`, through the doors
-- a signed-in person reaches. Ends in ROLLBACK and leaves nothing.
-- Run: bin/p.sh -f scripts/campaign-tests/writeperf_green.sql
\set ON_ERROR_STOP on

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'writeperf_green.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;
set local statement_timeout = 0;
set local lock_timeout = '10s';
do $$
declare
  c_admin uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_dana  uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_admin_j text; c_dana_j text;
  v_boss text := current_user;
  v_org uuid; v_org2 uuid; v_home uuid; v_tbl uuid; v_n int; v_c jsonb;
  v_sqlstate text; v_detail text; v_msg text; i int;
  v_a jsonb; v_b jsonb;
begin
  c_admin_j := jsonb_build_object('sub', c_admin, 'role', 'authenticated')::text;
  c_dana_j  := jsonb_build_object('sub', c_dana,  'role', 'authenticated')::text;
  perform set_config('app.actor_system','campaign-test/writeperf_green', true);

  insert into iam.organizations (name, slug, abbreviation, created_by)
  values ('Ironline Fitness Green', 'ironline-fitness-green-' || substr(md5(random()::text),1,8), 'IFG', c_admin)
  returning id into v_org;
  insert into iam.organizations (name, slug, abbreviation, created_by)
  values ('Ironline Fitness Green Annex', 'ironline-fitness-green-annex-' || substr(md5(random()::text),1,8), 'IFA', c_admin)
  returning id into v_org2;
  insert into iam.memberships (organization_id, user_id, role, status, container_type, container_id)
  values (v_org,  c_admin, 'owner', 'active', 'organization', v_org),
         (v_org,  c_dana,  'member','active', 'organization', v_org),
         (v_org2, c_admin, 'owner', 'active', 'organization', v_org2);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value)
  values ('custom','system_enabled','organization', v_org,  v_org,  'true'),
         ('custom','system_enabled','organization', v_org2, v_org2, 'true');

  perform set_config('request.jwt.claims', c_admin_j, true);

  -- ═══ PART 0 — take the seat and PROVE it ═════════════════════════════════════════════════
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  if pg_has_role(current_user,
                 (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass),
                 'member') then
    raise exception '0: this seat is a member of the role that owns custom.record, so every wall would open on its first line';
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;
  raise notice '0: PASSED — seated as authenticated, no direct read of custom.record';

  -- ═══ PART 1 — the page contract is a door, not a rumour ══════════════════════════════════
  v_c := custom.page_contract(v_org);
  if (v_c ->> 'ceiling')::int <> 1000 or (v_c ->> 'default')::int <> 200
     or (v_c ->> 'export_ceiling')::int <> 100000 or nullif(v_c ->> 'says','') is null then
    raise exception '1: the page contract is %', v_c;
  end if;
  raise notice '1: PASSED — custom.page_contract answers %', v_c;

  -- ═══ PART 2 — a table with 250 records, so a short page is observable ════════════════════
  v_home := custom.record_write(v_org, custom.person_kernel_id(), jsonb_build_object('name','Green Home'));
  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','Member Check-ins','slug','member_checkins','type','entity',
    'label_singular','Row','label_plural','Rows','title_field','title','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','title')), 'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Title','key','title','type','text'));
  for i in 1..250 loop
    perform custom.record_write(v_org, v_tbl, jsonb_build_object('title','Row ' || i));
  end loop;

  -- 2a. ASK FOR THE CEILING AND GET THE CEILING'S WORTH — every one of the 250.
  select count(*) into v_n from custom.read_records(v_org, v_tbl, false, 1000, 0);
  if v_n <> 250 then raise exception '2a: asked for 1000, got % of 250', v_n; end if;
  raise notice '2a: PASSED — a page of the ceiling serves all 250 rows';

  -- 2b. ASK FOR MORE THAN THE CEILING AND BE TOLD SO, with the four keys in the DETAIL. This is
  --     the defect IMPORT filed: it used to answer 200 rows and say nothing.
  begin
    perform count(*) from custom.read_records(v_org, v_tbl, false, 5000, 0);
    raise exception '2b: read_records served a page of 5000 without a word about the ceiling';
  exception when others then
    get stacked diagnostics v_sqlstate = returned_sqlstate, v_detail = pg_exception_detail, v_msg = message_text;
    if v_sqlstate <> '22023' then raise exception '2b: expected 22023, got % (%)', v_sqlstate, v_msg; end if;
    if (v_detail::jsonb -> 'page' ->> 'requested')::int <> 5000
       or (v_detail::jsonb -> 'page' ->> 'returned')::int <> 0
       or (v_detail::jsonb -> 'page' ->> 'ceiling')::int <> 1000
       or (v_detail::jsonb -> 'page') ? 'next' is false then
      raise exception '2b: the refusal detail is %', v_detail;
    end if;
    raise notice '2b: PASSED — "%" detail %', v_msg, v_detail;
  end;

  -- 2c. ASK FOR NOTHING AND GET THE DOOR'S OWN DEFAULT. Nothing was named, so nothing was
  --     substituted for a number: 200 of 250 is the contract, not a short page.
  select count(*) into v_n from custom.read_records(v_org, v_tbl, false, null, 0);
  if v_n <> 200 then raise exception '2c: the default page is % rows', v_n; end if;
  raise notice '2c: PASSED — no page size asked serves the door default of 200';

  -- 2d. A PAGE OF NOUGHT AND A PAGE OF MINUS FIVE ARE NONSENSE AND ARE SAID TO BE.
  foreach i in array array[0, -5] loop
    begin
      perform count(*) from custom.read_records(v_org, v_tbl, false, i, 0);
      raise exception '2d: a page of % was served', i;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_msg = message_text;
      if v_sqlstate <> '22023' then raise exception '2d: page of % gave % (%)', i, v_sqlstate, v_msg; end if;
    end;
  end loop;
  raise notice '2d: PASSED — a page of 0 and a page of -5 are both refused by name';

  -- ═══ PART 3 — the ceiling is a KNOB, and lowering it changes what the refusal says ═══════
  perform set_config('role', v_boss, true);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value)
  values ('custom','page_size_ceiling','organization', v_org, v_org, '50');
  perform set_config('role', 'authenticated', true);
  if (custom.page_contract(v_org) ->> 'ceiling')::int <> 50 then
    raise exception '3: the organization override did not reach the contract: %', custom.page_contract(v_org);
  end if;
  begin
    perform count(*) from custom.read_records(v_org, v_tbl, false, 200, 0);
    raise exception '3: 200 rows were served under a ceiling of 50';
  exception when others then
    get stacked diagnostics v_sqlstate = returned_sqlstate, v_detail = pg_exception_detail;
    if v_sqlstate <> '22023' or (v_detail::jsonb -> 'page' ->> 'ceiling')::int <> 50 then
      raise exception '3: expected a 22023 naming 50, got % %', v_sqlstate, v_detail;
    end if;
  end;
  select count(*) into v_n from custom.read_records(v_org, v_tbl, false, 50, 0);
  if v_n <> 50 then raise exception '3: a page of the lowered ceiling gave % rows', v_n; end if;
  -- and the other organization is untouched by that organization's setting
  if (custom.page_contract(v_org2) ->> 'ceiling')::int <> 1000 then
    raise exception '3: one organization''s ceiling leaked into another';
  end if;
  perform set_config('role', v_boss, true);
  delete from platform.knob_override
   where feature='custom' and key='page_size_ceiling' and organization_id = v_org;
  perform set_config('role', 'authenticated', true);
  raise notice '3: PASSED — the ceiling is an organization knob, the refusal names the lowered number, and it does not leak';

  -- ═══ PART 4 — the census ═════════════════════════════════════════════════════════════════
  perform set_config('role', v_boss, true);
  select count(*) into v_n from custom.silent_page_doors();
  if v_n <> 0 then
    raise exception '4: % door(s) still invent a page size: %', v_n,
      (select string_agg(door, ', ') from custom.silent_page_doors());
  end if;
  select count(*) into v_n from custom.ladder_replanners();
  if v_n <> 0 then
    raise exception '4: % function(s) on the ladder are re-planned on every call: %', v_n,
      (select string_agg(fn, ', ') from custom.ladder_replanners());
  end if;
  perform set_config('role', 'authenticated', true);
  raise notice '4: PASSED — 0 silent page doors, 0 re-planning functions on the ladder';

  -- ═══ PART 5 — the memo answers what the uncached body answers, and the fence works ═══════
  perform set_config('role', v_boss, true);
  select count(*) into v_n from platform.feature_knob k
   where platform.knob_resolve(k.feature, k.key, null)
         is distinct from platform.knob_resolve_uncached(k.feature, k.key, null);
  if v_n <> 0 then raise exception '5a: % knob(s) answer differently through the memo', v_n; end if;

  -- THE FENCE, DEMONSTRATED RATHER THAN ASSERTED: read a knob (filling the memo), change it in
  -- this same transaction, read it again. A memo without the bump triggers would answer the old
  -- value here, and that is precisely the bug a memo is one mistake away from being.
  v_a := platform.knob_resolve('custom','page_size_ceiling', v_org2);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value)
  values ('custom','page_size_ceiling','organization', v_org2, v_org2, '77');
  v_b := platform.knob_resolve('custom','page_size_ceiling', v_org2);
  if (v_a #>> '{}')::int <> 1000 or (v_b #>> '{}')::int <> 77 then
    raise exception '5b: the memo did not see the knob change in its own transaction: % then %', v_a, v_b;
  end if;
  delete from platform.knob_override
   where feature='custom' and key='page_size_ceiling' and organization_id = v_org2;
  perform set_config('role', 'authenticated', true);
  raise notice '5: PASSED — % knobs answer identically through the memo, and a knob written in the same transaction is seen at once (1000 then 77)',
    (select count(*) from platform.feature_knob);

  -- ═══ PART 6 — from test@test.com's seat ══════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_dana_j, true);
  -- 6a. the control: she IS a member of v_org, so the contract answers her
  if (custom.page_contract(v_org) ->> 'ceiling')::int <> 1000 then
    raise exception '6a: a member could not read the page contract of her own organization';
  end if;
  -- 6b. the wall: she is NOT a member of v_org2
  begin
    perform custom.page_contract(v_org2);
    raise exception '6b: a non-member read the page contract of an organization she is not in';
  exception when others then
    get stacked diagnostics v_sqlstate = returned_sqlstate, v_msg = message_text;
    if v_sqlstate not in ('42501','22023') then raise exception '6b: expected a refusal, got % (%)', v_sqlstate, v_msg; end if;
    raise notice '6b: PASSED — "%"', v_msg;
  end;
  raise notice '6: PASSED — the contract answers a member and refuses a stranger';

  perform set_config('role', v_boss, true);
  raise notice '=== ALL PARTS PASSED ===';
end $$;
rollback;
