-- LANE V1-STORE-FIXES — THE RED TWIN. The three things `V1-STORE` observed at 00:20 UTC on
-- 2026-09-18, asserted EXACTLY AS THEY WERE MEASURED, against the SAME live objects
-- `v1store_fixes_green.sql` runs over, on the MAIN database.
--
--   RED 1. ORGANIZATIONS ARE NOT WALLS IN THE STORE (REC-29). A record of organization B is
--          accepted carrying a Table of organization A; a containment edge of organization B
--          reaches a record of organization A; and a Field of organization B is accepted
--          taking its choices from organization A's Table. Nothing anywhere refuses.
--   RED 2. DELETE HAS NO DOOR (REC-23). `custom._store_door` is attached to
--          `custom.external_link` and `custom.external_source` and NOT to `custom.record`;
--          every BEFORE trigger on `custom.record` is INSERT OR UPDATE only. So a back-end
--          role that is no member of the store's owner hard-DELETEs a row out of the store for
--          good, on a law that says delete is soft and reversible within retention.
--   RED 3. A PROMOTION THAT MOVED NOTHING REPORTS SUCCESS. `custom.promote_table` runs its
--          `update custom.record set data = data || '{"storage":"heavy"}'`, matches ZERO rows,
--          and returns a result object all the same — and its two INSTEAD OF siblings,
--          `custom._field_definition_write` and `custom._rule_definition_write`, read no row
--          count either.
--   RED 4. ACCESS IS NOT ASKED AT THE DOOR. A member who was shared nothing promotes somebody
--          else's Table and deletes somebody else's record. (SEAT-SUITES, 2026-09-19 — a
--          defect the old seat could not have seen: as a member of the role that owns
--          `custom.record`, `custom.assert_client_may_reach` returned true on its first line.)
--
-- 🚨 RE-POINTED AND SEATED (lane SEAT-SUITES, 2026-09-19). This twin used to run against the
-- rehearsal branch — 226 of main's 332 functions in schema `custom`, no `custom.field_declare`
-- at all — and it proved the wall by INSERTing straight into `custom.record` from the role that
-- OWNS it, which is the one seat where the wall was never the thing being measured. Every
-- block now goes through the door a signed-in person reaches. Block 2's one statement is a
-- BACK-END role's, because REC-23 is about a role that holds DELETE on the store and no person
-- does; it steps out of the seat and says so.
--
-- EVERY block is measured, not only the first: a red twin that stops at its first failure says
-- nothing about the others. They are collected and raised together at the end.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/v1store_fixes_red.sql
--
-- IT IS NOT A MIGRATION: it lives outside `migrations/`, no sweep can see it, and its one
-- transaction ends in ROLLBACK.

\set ON_ERROR_STOP on
\timing off

begin;
set local lock_timeout = '60s';

-- BYPASSRLS on purpose, and it is the point rather than a convenience: RLS is a row VISIBILITY
-- filter and the door is the write barrier. A role RLS happens to hide the row from proves
-- nothing about the door; this one removes the filter so the door is the only thing left that
-- could refuse — and RED 2 says there is none on DELETE.
create role zz_v1store_red nologin bypassrls;
grant usage on schema custom to zz_v1store_red;
grant select, insert, update, delete on custom.record to zz_v1store_red;
grant usage on schema platform to zz_v1store_red;
grant select on platform.feature_knob, platform.knob_override,
                platform.knob_scope_kind, platform.knob_rung_lock to zz_v1store_red;
grant execute on function custom.assert_store_door(uuid, text) to zz_v1store_red;
grant execute on function custom.caller_role() to zz_v1store_red;
grant execute on function custom.store_is_open(uuid) to zz_v1store_red;
do $g$ begin execute format('grant zz_v1store_red to %I', current_user); end $g$;

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org_a   uuid := gen_random_uuid();
  v_org_b   uuid := gen_random_uuid();
  v_home_a  uuid;
  v_home_b  uuid;
  v_table_a uuid;
  v_table_b uuid;
  v_rec_a   uuid;
  v_rec_b   uuid;
  v_id      uuid;
  v_n       integer;
  v_answer  jsonb;
  v_caught  text;
  v_boss    text := current_user;
  v_reds    text[] := '{}';
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'v1store_fixes_red.sql runs on the MAIN database only, and this is %',
      (select system_identifier from pg_control_system());
  end if;

  perform set_config('app.actor_system', 'campaign-test/v1store_fixes_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by) values
    (v_org_a, 'ZZ V1STORE Red A', 'zz-v1store-red-a-' || substr(v_org_a::text,1,8), 'ZRA', c_admin),
    (v_org_b, 'ZZ V1STORE Red B', 'zz-v1store-red-b-' || substr(v_org_b::text,1,8), 'ZRB', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org_a, 'organization', v_org_a, c_admin, 'owner',  'active'),
    (v_org_b, 'organization', v_org_b, c_admin, 'owner',  'active'),
    (v_org_b, 'organization', v_org_b, c_dana,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom','system_enabled','organization', v_org_a, v_org_a, 'true'::jsonb, 'v1store_fixes_red'),
    ('custom','system_enabled','organization', v_org_b, v_org_b, 'true'::jsonb, 'v1store_fixes_red');

  insert into custom.record (organization_id, table_id, data)
  values (v_org_a, null, jsonb_build_object('name','Home of A')) returning id into v_home_a;
  insert into custom.record (organization_id, table_id, data)
  values (v_org_b, null, jsonb_build_object('name','Home of B')) returning id into v_home_b;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0 — THE SEAT. Every block below runs as a signed-in person.
  -- ════════════════════════════════════════════════════════════════════════════
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
  raise notice 'PART 0 PASSED — the seat is `authenticated`, the ladder sees a client, and custom.record is not readable from it.';

  v_table_a := custom.table_declare(v_org_a, jsonb_build_object(
    'type','entity','name','Order','slug','zz_v1store_red_a_order',
    'label_singular','Order','label_plural','Orders','display','page','ordered',false,
    'weight','light','retention_days',30,'default_sort','[]'::jsonb,'row_order','sorted',
    'agent_writable',true,'title_field','name','parent_id', v_home_a::text,
    'fields', jsonb_build_array(jsonb_build_object('name','name'))));
  perform custom.field_declare(v_org_a, v_table_a, jsonb_build_object('key','name','label','Name','plain','text','sort',10));
  v_table_b := custom.table_declare(v_org_b, jsonb_build_object(
    'type','entity','name','Order','slug','zz_v1store_red_b_order',
    'label_singular','Order','label_plural','Orders','display','page','ordered',false,
    'weight','light','retention_days',30,'default_sort','[]'::jsonb,'row_order','sorted',
    'agent_writable',true,'title_field','name','parent_id', v_home_b::text,
    'fields', jsonb_build_array(jsonb_build_object('name','name'))));
  perform custom.field_declare(v_org_b, v_table_b, jsonb_build_object('key','name','label','Name','plain','text','sort',10));
  v_rec_a := custom.record_write(v_org_a, v_table_a, jsonb_build_object('name','A-1'));
  v_rec_b := custom.record_write(v_org_b, v_table_b, jsonb_build_object('name','PO-1'));

  -- ════════════════════════════════════════════════════════════════════════════
  -- RED 1 — organizations are not walls in the store.
  -- Made red by: custom_record_organization_wall, and the door refusals it stands behind.
  -- ════════════════════════════════════════════════════════════════════════════
  -- 1a. a record of B carrying A's Table
  v_id := null; v_caught := null;
  begin
    v_id := custom.record_write(v_org_b, v_table_a, jsonb_build_object('name','the wall is open'));
  exception when others then get stacked diagnostics v_caught = message_text;
  end;
  if v_id is null then
    v_reds := array_append(v_reds, format('RED 1a did not go red: a cross-organization Table was refused ("%s")', left(coalesce(v_caught,''), 80)));
  else
    raise notice 'RED 1a — a record of organization B landed carrying organization A''s Table %', v_table_a;
  end if;

  -- 1b. a containment edge of B reaching A
  v_caught := null;
  begin
    perform custom.relation_own(v_org_b, v_rec_b, v_rec_a);
  exception when others then get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is not null then
    v_reds := array_append(v_reds, format('RED 1b did not go red: custom.relation_own refused across organizations ("%s")', left(v_caught, 80)));
  else
    raise notice 'RED 1b — a containment edge of organization B reached organization A''s record';
  end if;

  -- 1c. a Field of B taking its choices from A's Table
  v_id := null; v_caught := null;
  begin
    v_id := custom.field_declare(v_org_b, v_table_b, jsonb_build_object(
      'key','supplier','label','Supplier','parity_type','select','options_table_id', v_table_a::text));
  exception when others then get stacked diagnostics v_caught = message_text;
  end;
  if v_id is null then
    v_reds := array_append(v_reds, format('RED 1c did not go red: a cross-organization options Table was refused ("%s")', left(coalesce(v_caught,''), 80)));
  else
    raise notice 'RED 1c — a Field of organization B takes its choices from organization A''s Table';
  end if;

  -- 1d. WHAT IS CLOSED TODAY, AND MUST NOT REGRESS — the control for the whole block, so
  --     RED 1 cannot be satisfied by a store that accepts nothing either.
  v_caught := null;
  begin
    perform custom.record_write(v_org_b, v_table_b,
      jsonb_build_object('name','PO-X','parent_id', v_rec_a::text));
  exception when others then get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is distinct from 'that container is not in this organization' then
    raise exception 'RED 1d: containment across organizations was ACCEPTED, or lost its own words — a closed site opened (got %)',
                    coalesce(v_caught, 'no refusal at all');
  end if;
  raise notice 'RED 1d — control: containment across organizations is already refused, as it must stay.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- RED 2 — delete has no door.
  -- Made red by: custom_record_store_door, a BEFORE DELETE trigger on custom.record, and
  -- custom._store_door's REC-23 arm.
  -- ════════════════════════════════════════════════════════════════════════════
  -- This organization's store is ON, so what RED 2 measures is REC-23 and never the off switch.
  if not coalesce((platform.unified_data_store_state(v_org_b) ->> 'switched_on')::boolean, false) then
    raise exception 'RED 2 cannot run: this organization''s store reads OFF at entry';
  end if;
  select count(*) into v_n
    from pg_trigger t
   where t.tgrelid = 'custom.record'::regclass and not t.tgisinternal
     and (t.tgtype::int & 8) > 0 and (t.tgtype::int & 2) > 0;
  if v_n <> 0 then
    v_reds := array_append(v_reds, format('RED 2 did not go red: custom.record carries %s BEFORE DELETE trigger(s)', v_n));
  end if;

  -- THE ONE STATEMENT THAT STEPS OUT OF THE SEAT, AND SAYS SO. REC-23 is about a BACK-END role
  -- that HOLDS delete on the store and is not its owner. `authenticated` holds no privilege on
  -- `custom.record` at all, so no person can ask this question; there is no client door for
  -- "connect as another role". Nothing about what a PERSON may do is asserted here.
  perform set_config('role', v_boss, true);
  insert into custom.record (organization_id, table_id, data)
  values (v_org_b, null, jsonb_build_object('note','hard delete me')) returning id into v_id;
  set local lock_timeout = '60s';
  set local role zz_v1store_red;
  v_n := 0; v_caught := null;
  begin
    delete from custom.record where organization_id = v_org_b and id = v_id;
    get diagnostics v_n = row_count;
  exception when insufficient_privilege then get stacked diagnostics v_caught = message_text;
  end;
  reset role;
  perform set_config('role', 'authenticated', true);
  if v_n <> 1 then
    v_reds := array_append(v_reds, format('RED 2 did not go red: the hard DELETE by a non-owner matched %s row(s) — it was refused ("%s")', v_n, left(coalesce(v_caught,''), 80)));
  else
    raise notice 'RED 2 — a back-end role the INSERT door would refuse hard-DELETED a row out of the store.';
  end if;

  -- ════════════════════════════════════════════════════════════════════════════
  -- RED 3 — a promotion that moved nothing reports success.
  -- Made red by: `get diagnostics ... row_count` in custom.promote_table and in the two
  -- INSTEAD OF writers.
  -- ════════════════════════════════════════════════════════════════════════════
  v_answer := null; v_caught := null;
  begin
    v_answer := custom.promote_table(v_org_b, v_table_a);   -- B does not own that Table
  exception when others then get stacked diagnostics v_caught = message_text;
  end;
  if v_answer is null then
    v_reds := array_append(v_reds, format('RED 3 did not go red: promote_table refused a Table of another organization ("%s")', left(coalesce(v_caught,''), 80)));
  else
    raise notice 'RED 3 — promote_table updated 0 rows and returned %', v_answer;
  end if;

  select count(*) into v_n from pg_proc p
   where p.pronamespace = 'custom'::regnamespace
     and p.proname in ('_field_definition_write', '_rule_definition_write')
     and p.prosrc ~* 'update\s+custom\.record'
     and p.prosrc !~* '(get\s+diagnostics|not\s+found)';
  if v_n <> 2 then
    v_reds := array_append(v_reds, format('RED 3b did not go red: %s of the 2 INSTEAD OF writers still count no rows', v_n));
  else
    raise notice 'RED 3b — both INSTEAD OF writers UPDATE custom.record and check no row count.';
  end if;

  -- ════════════════════════════════════════════════════════════════════════════
  -- RED 4 (SEAT-SUITES) — access is not asked at the door, as a REAL SECOND PERSON.
  -- `test@test.com` is a member of organization B who was shared nothing.
  -- Made red by: custom.assert_client_may_change / may_open, which every door now calls.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_dana_j, true);
  -- THE CONTROL FIRST, so RED 4 is not a door that refuses her everything: a record's default
  -- visibility lane is the organization and she is a member, so she READS admin's record.
  if (custom.read_record(v_org_b, v_rec_b, true) ->> 'name') is distinct from 'PO-1' then
    raise exception 'RED 4 CONTROL FAILED: test@test.com cannot even read a record on her own organization''s lane, so RED 4 proves nothing';
  end if;
  raise notice 'RED 4 control — test@test.com reads admin''s record on the organization lane.';
  v_answer := null; v_caught := null;
  begin
    v_answer := custom.promote_table(v_org_b, v_table_b);
  exception when others then get stacked diagnostics v_caught = message_text;
  end;
  if v_answer is null then
    v_reds := array_append(v_reds, format('RED 4a did not go red: test@test.com was refused a promotion she is not an admin for ("%s")', left(coalesce(v_caught,''), 80)));
  else
    raise notice 'RED 4a — test@test.com promoted a Table she is not an admin of.';
  end if;
  v_caught := null;
  begin
    perform custom.record_delete(v_org_b, v_rec_b);
  exception when others then get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is not null then
    v_reds := array_append(v_reds, format('RED 4b did not go red: test@test.com was refused a delete of a record nobody gave her ("%s")', left(v_caught, 80)));
  else
    raise notice 'RED 4b — test@test.com deleted a record nobody shared with her.';
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);

  if array_length(v_reds, 1) > 0 then
    raise exception 'v1store_fixes_red: % of the 9 clauses across its 4 blocks are RED (the defect they assert is gone): %',
      array_length(v_reds, 1), array_to_string(v_reds, ' | ');
  end if;
  raise notice 'v1store_fixes_red: every block asserted the defect and found it — NOTHING IS FIXED.';
end $t$;

rollback;
