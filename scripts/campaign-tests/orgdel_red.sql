-- LANE ORG-DELETE — THE RED TWIN of scripts/campaign-tests/orgdel_green.sql.
--
-- Each block below RUNS THE REAL BYTES of one of this lane's inverses inside a transaction
-- that ends in ROLLBACK, and then asserts the defect exactly as it was measured on the main
-- database on 2026-09-20 (bug 8500bd65-7a5c-4c22-8213-2e10d462d348). A block is RED when the
-- defect it describes is GONE — which is what this file must print on this database today.
-- Run it on origin/main before this lane's migrations and every block goes GREEN instead,
-- which is the whole point: the assertions have force.
--
-- Every clause runs from the seat `authenticated`, like the green suite.
--
--   RED 1  custom.organization_contents / custom.organization_clear do not exist, so nothing
--          can say what an organization holds and there is no supported way to empty one.
--   RED 2  the retention purge is refused by the store's own trigger on every row, so NOTHING
--          a person can call destroys a record and no organization holding one is deletable.
--   RED 3  the destroying arm issues its own DELETE and the store refuses it.
--   RED 4  history.migration_log is swept with the work logs, so the door destroys the undo it
--          promised in the same call.
--   RED 5  the deletion event asks a reader's access question, so the purge dies on a Table
--          that has already been retired.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/orgdel_red.sql

\set ON_ERROR_STOP on
\timing off

-- ─────────────────────────────────────────────────────────────────────────────
-- RED 1 — THERE IS NO DOOR AT ALL.
-- ─────────────────────────────────────────────────────────────────────────────
begin;
-- Replacing a live trigger or door function has to wait for the sessions currently inside it,
-- and this database is busy. The default two-second wait is not enough; sixty is.
set local lock_timeout = '10s';
\i migrations/inverse/orgdel_an_organization_says_what_it_holds_down.sql
do $r$
declare
  v_caught text;
begin
  perform set_config('role', 'authenticated', true);
  begin
    perform custom.organization_contents(gen_random_uuid());
    raise exception 'RED 1 IS GREEN — the door answered after its own inverse dropped it';
  exception when undefined_function then
    get stacked diagnostics v_caught = message_text;
  end;
  raise notice 'RED 1 IS RED — with the inverse applied: %. A person is back to the database''s foreign-key string with nothing to act on.', v_caught;
end;
$r$;
rollback;

-- ─────────────────────────────────────────────────────────────────────────────
-- RED 2 — THE RETENTION PURGE IS REFUSED ON EVERY ROW, AND THE STORE CAN NEVER
--         LET GO OF ANYTHING. This is the root cause, and it is the one block
--         whose fixture has to build a real record to prove it.
-- ─────────────────────────────────────────────────────────────────────────────
begin;
-- Replacing a live trigger or door function has to wait for the sessions currently inside it,
-- and this database is busy. The default two-second wait is not enough; sixty is.
set local lock_timeout = '10s';
\i migrations/inverse/orgdel_the_retention_rule_decides_the_hard_delete_down.sql
do $r$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org  uuid := gen_random_uuid();
  v_home uuid; v_tbl uuid; v_r uuid; v_caught text;
  v_boss text := current_user;
begin
  perform set_config('app.actor_system', 'campaign-test/orgdel_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Ironclad Mobile Mechanic — Ironclad Yard', 'ironclad-mobile-ironclad-' || substr(v_org::text, 1, 8), 'IMI', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'orgdel_red');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name','Home')) returning id into v_home;

  perform set_config('role', 'authenticated', true);
  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','Service Calls','slug','service_calls','type','entity','label_singular','Service Call','label_plural','Service Calls',
    'title_field','n','display','page','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','n')), 'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('key','n','label','N','plain','text','sort',10));
  v_r := custom.record_write(v_org, v_tbl, jsonb_build_object('n','x'));
  perform custom.record_delete(v_org, v_r);

  -- Move the clock past the window. No door does this; the row guards are stood down for the
  -- one statement, out of the seat, and no clause is asserted while it is out.
  perform set_config('role', v_boss, true);
  set local session_replication_role = 'replica';
  update custom.record set deleted_at = now() - interval '400 days'
   where organization_id = v_org and id = v_r;
  set local session_replication_role = 'origin';
  perform set_config('role', 'authenticated', true);

  begin
    perform custom.migrate_purge(v_org, v_tbl, false);
    raise exception 'RED 2 IS GREEN — the purge destroyed a row past its window with the inverse applied';
  exception when insufficient_privilege then
    get stacked diagnostics v_caught = message_text;
  end;
  if v_caught !~ 'not deleted for good' then
    raise exception 'RED 2: the purge failed, but not for the reason the bug names: %', v_caught;
  end if;
  raise notice 'RED 2 IS RED — with the inverse applied, a record 400 days past its retention still cannot be destroyed by the store''s own purge: "%". The retention floor was not a floor, it was forever.', v_caught;
end;
$r$;
rollback;

-- ─────────────────────────────────────────────────────────────────────────────
-- RED 3 — THE CLEAR ISSUES ITS OWN DELETE AND THE STORE REFUSES IT.
-- ─────────────────────────────────────────────────────────────────────────────
begin;
-- Replacing a live trigger or door function has to wait for the sessions currently inside it,
-- and this database is busy. The default two-second wait is not enough; sixty is.
set local lock_timeout = '10s';
\i migrations/inverse/orgdel_the_clear_goes_through_the_purge_down.sql
do $r$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org uuid := gen_random_uuid(); v_name text; v_home uuid; v_caught text;
begin
  v_name := 'Ironclad Mobile Mechanic — Brackenfield Yard ' || substr(v_org::text, 1, 8);
  perform set_config('app.actor_system', 'campaign-test/orgdel_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, v_name, 'ironclad-mobile-brackenfield-' || substr(v_org::text, 1, 8), 'IMB', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'orgdel_red');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name','Home')) returning id into v_home;

  perform set_config('role', 'authenticated', true);
  begin
    perform custom.organization_clear(v_org, v_name, true);
    raise exception 'RED 3 IS GREEN — the raw DELETE went through with the inverse applied';
  exception when insufficient_privilege then
    get stacked diagnostics v_caught = message_text;
  end;
  if v_caught !~ 'not deleted for good' then
    raise exception 'RED 3: it failed, but not on the store''s own refusal: %', v_caught;
  end if;
  raise notice 'RED 3 IS RED — with the inverse applied, the destroying arm dies on the store''s own rule: "%"', v_caught;
end;
$r$;
rollback;

-- ─────────────────────────────────────────────────────────────────────────────
-- RED 4 — THE DOOR DESTROYS THE UNDO IT JUST PROMISED.
-- ─────────────────────────────────────────────────────────────────────────────
begin;
-- Replacing a live trigger or door function has to wait for the sessions currently inside it,
-- and this database is busy. The default two-second wait is not enough; sixty is.
set local lock_timeout = '10s';
\i migrations/inverse/orgdel_the_undo_is_not_swept_away_with_the_logs_down.sql
do $r$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org uuid := gen_random_uuid(); v_name text; v_home uuid; v_tbl uuid;
  v_res jsonb; v_logs integer;
begin
  v_name := 'Ironclad Mobile Mechanic — Union City Yard ' || substr(v_org::text, 1, 8);
  perform set_config('app.actor_system', 'campaign-test/orgdel_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, v_name, 'ironclad-mobile-union-city-' || substr(v_org::text, 1, 8), 'IMU', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'orgdel_red');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name','Home')) returning id into v_home;

  perform set_config('role', 'authenticated', true);
  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','Invoices','slug','invoices','type','entity','label_singular','Invoice','label_plural','Invoices',
    'title_field','n','display','page','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','n')), 'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('key','n','label','N','plain','text','sort',10));
  perform custom.record_write(v_org, v_tbl, jsonb_build_object('n','x'));

  v_res := custom.organization_clear(v_org, v_name, true);
  -- Asked through the door a person reaches, not of the table: `authenticated` holds no
  -- privilege on history.migration_log at all, which is the point of the door.
  select count(*) into v_logs from custom.migrations(v_org, null, 500);
  if v_logs > 0 then
    raise exception 'RED 4 IS GREEN — the undo entries survived with the inverse applied (% left)', v_logs;
  end if;
  raise notice 'RED 4 IS RED — with the inverse applied the door said "%" and left 0 migration entries, so not one of those rows could ever be put back.',
    v_res ->> 'sentence';
end;
$r$;
rollback;

-- ─────────────────────────────────────────────────────────────────────────────
-- RED 5 — THE DELETION EVENT ASKS A READER'S QUESTION AND THE PURGE DIES ON IT.
-- ─────────────────────────────────────────────────────────────────────────────
begin;
-- Replacing a live trigger or door function has to wait for the sessions currently inside it,
-- and this database is busy. The default two-second wait is not enough; sixty is.
set local lock_timeout = '10s';
\i migrations/inverse/orgdel_a_deletion_event_asks_nobody_for_permission_down.sql
do $r$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org uuid := gen_random_uuid(); v_name text; v_home uuid; v_tbl uuid; v_caught text;
  v_boss text := current_user;
begin
  v_name := 'Ironclad Mobile Mechanic — Westgate Yard ' || substr(v_org::text, 1, 8);
  perform set_config('app.actor_system', 'campaign-test/orgdel_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, v_name, 'ironclad-mobile-westgate-' || substr(v_org::text, 1, 8), 'IMW', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'orgdel_red');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name','Home')) returning id into v_home;

  perform set_config('role', 'authenticated', true);
  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','Parts Used','slug','parts_used','type','entity','label_singular','Part Used','label_plural','Parts Used',
    'title_field','n','display','page','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','n')), 'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('key','n','label','N','plain','text','sort',10));
  perform custom.record_write(v_org, v_tbl, jsonb_build_object('n','x'));

  perform custom.organization_clear(v_org, v_name, false);   -- retire everything, Table included
  perform set_config('role', v_boss, true);
  set local session_replication_role = 'replica';
  update custom.record set deleted_at = now() - interval '400 days' where organization_id = v_org;
  set local session_replication_role = 'origin';
  perform set_config('role', 'authenticated', true);

  begin
    perform custom.migrate_purge(v_org, null, false);
    raise exception 'RED 5 IS GREEN — the purge cleared a retired Table''s records with the inverse applied';
  exception when others then
    get stacked diagnostics v_caught = message_text;
  end;
  if v_caught !~ 'has nothing to show you' then
    raise exception 'RED 5: it failed, but not on the reader''s access question: %', v_caught;
  end if;
  raise notice 'RED 5 IS RED — with the inverse applied, the store cannot let go of a record whose Table was retired first: "%"', v_caught;
end;
$r$;
rollback;

\echo '5 of 5 blocks are RED (the defect they assert is gone).'
