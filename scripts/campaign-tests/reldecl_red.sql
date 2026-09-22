-- LANE RELATION-DECLARE — THE RED TWIN. This lane's three inverses, executed as their REAL
-- BYTES inside one transaction that ends in ROLLBACK, and each defect shown going RED in the
-- words a person actually got on 2026-09-20.
--
--   RED 1  Every relation surface answers `permission denied for table record`. Eleven
--          functions held an EXECUTE grant for `authenticated` and every one of them was
--          SECURITY INVOKER over a table no client role may read. The relation feature had a
--          front door with the handle painted on.
--   RED 2  A relation column may be declared pointing at a uuid that is not a Table — at
--          nothing at all, or at a RECORD — and nobody is told.
--   RED 3  Retyping a relation column away leaves its links live, and the reverse side of the
--          table it used to point at then dies with
--          `the field <id> behaves as text, so it declares no relation` for EVERY record in it.
--
-- IT EXECUTES THE REAL INVERSES — the bytes of migrations/inverse/reldecl_*_down.sql — not a
-- hand-weakened copy, so the RED it shows is the rule-27 inverse itself, and the fixed bodies
-- are back the moment the transaction rolls back.
--
-- RUN IT (against the MAIN database):
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<dsn>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/reldecl_red.sql
--
-- ITS GREEN TWIN is scripts/campaign-tests/reldecl_green.sql.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'reldecl_red.sql'
\set requires 'function:custom.field_declare'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- THE FIXTURE, built as the connected role (a person cannot make their own organization).
-- ════════════════════════════════════════════════════════════════════════════════════════
create temporary table greenline_fixture (k text primary key, v uuid) on commit drop;

do $f$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_org uuid := gen_random_uuid();
  v_home uuid; v_job uuid; v_client uuid; v_f_many uuid; v_b1 uuid; v_a1 uuid;
begin
  perform set_config('app.actor_system', 'campaign-test/reldecl_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Greenline Landscaping Crew', 'greenline-landscaping-' || substr(v_org::text, 1, 8), 'GLC', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'reldecl_red');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name','Home')) returning id into v_home;

  v_client := custom.table_declare(v_org, jsonb_build_object(
    'name','Clients','slug','clients','type','entity','label_singular','Client',
    'label_plural','Clients','title_field','cname','display','page','weight','light',
    'ordered',false,'row_order','sorted','default_sort','[]'::jsonb,'agent_writable',true,
    'retention_days',365,'fields', jsonb_build_array(jsonb_build_object('name','cname')),
    'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_client, jsonb_build_object('label','Name','key','cname','type','text'));
  v_job := custom.table_declare(v_org, jsonb_build_object(
    'name','Jobs','slug','jobs','type','entity','label_singular','Job',
    'label_plural','Jobs','title_field','jname','display','page','weight','light',
    'ordered',false,'row_order','sorted','default_sort','[]'::jsonb,'agent_writable',true,
    'retention_days',365,'fields', jsonb_build_array(jsonb_build_object('name','jname')),
    'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_job, jsonb_build_object('label','Name','key','jname','type','text'));
  v_f_many := custom.field_declare(v_org, v_job, jsonb_build_object(
    'label','Crew','type','relation','relation_target', v_client::text,
    'multi', true, 'relation_max', 10, 'on_target_delete','set_null'));
  v_b1 := custom.record_write(v_org, v_client, jsonb_build_object('cname','Sutherland & Voss LLP'));
  v_a1 := custom.record_write(v_org, v_job, jsonb_build_object(
    'jname','Roof','crew', jsonb_build_array(v_b1::text)));

  insert into greenline_fixture (k, v) values
    ('org', v_org), ('job', v_job), ('client', v_client),
    ('f_many', v_f_many), ('b1', v_b1), ('a1', v_a1);
end $f$;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- PUT THE DEFECTS BACK — the real inverse files, in the reverse of the order they landed.
-- ════════════════════════════════════════════════════════════════════════════════════════
\i migrations/inverse/reldecl_unmaking_a_relation_is_not_a_claim_down.sql
\i migrations/inverse/reldecl_a_column_that_stops_pointing_takes_its_edges_down.sql
\i migrations/inverse/reldecl_the_relation_doors_take_a_person_down.sql

do $t$
declare
  v_org    uuid := (select v from greenline_fixture where k = 'org');
  v_job    uuid := (select v from greenline_fixture where k = 'job');
  v_client uuid := (select v from greenline_fixture where k = 'client');
  v_f_many uuid := (select v from greenline_fixture where k = 'f_many');
  v_b1     uuid := (select v from greenline_fixture where k = 'b1');
  v_a1     uuid := (select v from greenline_fixture where k = 'a1');
  v_boss   text := current_user;
  v_caught text;
  v_red    integer := 0;
  v_ghost  uuid;
begin
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'this twin did not take the seat — current_user is %', current_user;
  end if;

  -- ── RED 1. The relation surface does not answer a person at all. ───────────────────────
  v_caught := null;
  begin
    perform platform.relations_from(v_org, v_a1);
  exception when others then get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is not null and v_caught like '%permission denied for table record%' then
    v_red := v_red + 1;
    raise notice 'RED 1 IS RED — platform.relations_from: %', v_caught;
  else
    raise exception 'RED 1 IS NOT RED: the inverse did not put the refusal back (%)', coalesce(v_caught,'it answered');
  end if;

  v_caught := null;
  begin
    perform platform.relation_set(v_org, v_a1, 'crew', jsonb_build_array(v_b1::text));
  exception when others then get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is null or v_caught not like '%permission denied for table record%' then
    raise exception 'RED 1b IS NOT RED: platform.relation_set answered (%)', coalesce(v_caught,'ok');
  end if;
  v_red := v_red + 1;
  raise notice 'RED 1b IS RED — platform.relation_set: %', v_caught;

  -- ── RED 2. A relation column may point at something that is not a Table. ───────────────
  v_ghost := gen_random_uuid();
  begin
    perform custom.field_declare(v_org, v_job, jsonb_build_object(
      'label','Ghost','type','relation','relation_target', v_ghost::text));
    v_red := v_red + 1;
    raise notice 'RED 2 IS RED — a relation column pointing at %, which is no record at all, was ACCEPTED', v_ghost;
  exception when others then
    get stacked diagnostics v_caught = message_text;
    raise exception 'RED 2 IS NOT RED: it was refused (%)', v_caught;
  end;

  begin
    perform custom.field_declare(v_org, v_job, jsonb_build_object(
      'label','Oops','type','relation','relation_target', v_b1::text));
    v_red := v_red + 1;
    raise notice 'RED 2b IS RED — a relation column pointing at a RECORD instead of a Table was ACCEPTED';
  exception when others then
    get stacked diagnostics v_caught = message_text;
    raise exception 'RED 2b IS NOT RED: it was refused (%)', v_caught;
  end;

  -- ── RED 3. A retyped column leaves its links, and the other table's reverse side dies. ─
  perform custom.field_update(v_org, v_f_many, jsonb_build_object('type','text'));
  perform set_config('role', v_boss, true);   -- the reverse side does not answer a client at all now
  v_caught := null;
  begin
    perform platform.relations_to(v_org, v_b1);
  exception when others then get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is null or v_caught not like '%declares no relation%' then
    raise exception 'RED 3 IS NOT RED: the reverse side still answered after the retype (%)',
      coalesce(v_caught, 'no error'); end if;
  v_red := v_red + 1;
  raise notice 'RED 3 IS RED — after one column of one table was retyped, the reverse side of the table it pointed at dies: %', v_caught;

  raise notice '% of 5 blocks are RED (the defect they assert is gone from origin/main).', v_red;
  if v_red <> 5 then raise exception 'only % of 5 blocks were red', v_red; end if;
end $t$;

rollback;
