-- LANE TABLE-DELETE — THE RED TWIN. The same defect, asserted EXACTLY AS IT WAS MEASURED on the
-- main database on 2026-09-19, before this lane's files landed:
--
--   RED 1  custom.record_delete marks a Table deleted and LEAVES its Fields, its saved views,
--          its Rules and its records live — the strand lane LATENCY hit and wrote down.
--   RED 2  and those Fields are then undeletable through every door in the store, because
--          custom._field_shape_guard refuses the soft delete with "the field <key> says it
--          belongs to a table this organization does not have". Raw SQL was the only way out.
--   RED 3  custom.migrate_delete of a Table records an inverse that takes nothing with it, so
--          the undo has nothing to put back but the Table row.
--   RED 4  a Table whose Field a formula in ANOTHER table reads is deleted without a word, and
--          that formula quietly stops being able to find what it multiplies.
--
-- AGAINST THIS DATABASE IT IS RED, and the exception at the end says so — that exception IS this
-- file's pass. Run each inverse in migrations/inverse/tabledelete_*_down.sql and the blocks come
-- back green one by one, which is the only way to know the green suite is measuring anything.
--
-- 🚨 THE SEAT (lane SEAT-SUITES, 2026-09-19). A red twin's job is to prove the GREEN suite's
-- clauses flip, so it has to ask the SAME questions from the SAME seat. It used to run as the
-- role that owns `custom.record` — where `custom.assert_client_may_reach` returns on its first
-- line, every EXECUTE grant is free and the table is directly readable — so it could have gone
-- red for a reason that has nothing to do with what a person sees. It now builds its fixtures as
-- the connected owner, takes the seat `authenticated` in PART 0 and proves it holds it, and asks
-- every one of the four blocks through the doors the green suite uses: `custom.field_declare`,
-- `custom.record_delete`, `custom.record_resolve` and `custom.migrate_delete`. The one step no
-- door covers — the raw `update … set deleted_at` that reproduces the old stranding — leaves the
-- seat and says so.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/tabledelete_red.sql

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'tabledelete_red.sql'
\set requires 'row:platform.feature_knob:feature = 'custom' and key = 'member_default_visibility''
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_tbl     uuid;
  v_f1      uuid;
  v_f2      uuid;
  v_rec     uuid;
  v_tblA    uuid;
  v_tblB    uuid;
  v_fA      uuid;
  v_fB      uuid;
  v_tblP    uuid;
  v_fP      uuid;
  v_recP    uuid;
  v_res     jsonb;
  v_caught  text;
  v_boss    text := current_user;   -- the connected role, for the one step no door covers
  -- EVERY block is measured, not only the first: a red twin that stops at its first failure
  -- says nothing about the others. They are collected and raised together at the end.
  v_reds    text[] := '{}';
begin
  perform set_config('app.actor_system', 'campaign-test/tabledelete_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Signal & Scale Podcast — Edit Bay',
          'signal-scale-edit-bay-' || substr(v_org::text, 1, 8), 'SSE', c_admin);
  -- A seat is a PERSON, and a person reaches an organization only through a membership.
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  -- The store answers a person only where it is switched on; and membership by itself hands
  -- `test@test.com` nothing, so PART 2's refusals are about what she was GIVEN.
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'tabledelete_red'),
         ('custom','member_default_visibility','organization', v_org, v_org, '"shared_only"'::jsonb, 'tabledelete_red');

  -- A Home record has no client door of its own; it is a fixture, written before the seat.
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Signal & Scale Podcast — Show Home')) returning id into v_home;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0 — THE SEAT. Everything below this line runs as a signed-in person.
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

  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','Guest','slug','guests','type','entity',
    'label_singular','Guest','label_plural','Guests','title_field','pname','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','pname'),
                                jsonb_build_object('name','note')),
    'parent_id', v_home::text));
  v_f1 := custom.field_declare(v_org, v_tbl, jsonb_build_object(
    'key','pname','label','Name','plain','text','sort',10));
  v_f2 := custom.field_declare(v_org, v_tbl, jsonb_build_object(
    'key','note','label','Note','plain','text','sort',20));
  v_rec := custom.record_write(v_org, v_tbl, jsonb_build_object('pname','Priya Nathaniel','note','confirmed for the 12th'));

  -- ════════════════════════════════════════════════════════════════════════════
  -- RED 1 — the Table goes and its Fields and records stay.
  -- Made red by: the Table arm of custom.delete_rule + contents-first in custom.record_delete.
  -- ════════════════════════════════════════════════════════════════════════════
  perform custom.record_delete(v_org, v_tbl);
  if not ((custom.record_resolve(v_org, v_f1)  ->> 'live')::boolean
       or (custom.record_resolve(v_org, v_f2)  ->> 'live')::boolean
       or (custom.record_resolve(v_org, v_rec) ->> 'live')::boolean) then
    v_reds := array_append(v_reds, 'RED 1 did not go red: deleting the table took its fields and its records with it');
  end if;

  -- ════════════════════════════════════════════════════════════════════════════
  -- RED 2 — and the stranded Field cannot be deleted through the door.
  -- Made red by: a retirement is not a change of shape (custom._field_shape_guard).
  -- ════════════════════════════════════════════════════════════════════════════
  -- The strand is made the way the old door made it — the Table row goes on its own, behind
  -- the rule's back — so this block measures the GUARD and not the cascade RED 1 measures.
  declare
    v_tblS uuid;
    v_fS   uuid;
  begin
    v_tblS := custom.table_declare(v_org, jsonb_build_object(
      'name','Edit task','slug','edit_tasks','type','entity',
      'label_singular','Edit task','label_plural','Edit tasks','title_field','label','display','page',
      'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
      'agent_writable',true,'retention_days',365,'on_delete','cascade',
      'fields', jsonb_build_array(jsonb_build_object('name','label')),
      'parent_id', v_home::text));
    v_fS := custom.field_declare(v_org, v_tblS, jsonb_build_object(
      'key','label','label','Label','plain','text','sort',10));
    -- NO DOOR CAN DO THIS — that is the defect. Out of the seat, and nothing is asserted here.
    perform set_config('role', v_boss, true);
    update custom.record set deleted_at = now()
     where organization_id = v_org and id = v_tblS;
    perform set_config('role', 'authenticated', true);
    -- And back in the seat for the question that is a person's: can she delete it?
    v_caught := null;
    begin
      perform custom.record_delete(v_org, v_fS);
    exception when others then
      v_caught := sqlerrm;
    end;
  end;
  if v_caught is null then
    v_reds := array_append(v_reds, 'RED 2 did not go red: the stranded field was deleted through the door, so a retirement is no longer judged as a change of shape');
  end if;

  -- ════════════════════════════════════════════════════════════════════════════
  -- RED 3 — the verb's inverse takes nothing with it.
  -- Made red by: the Table arm's cascade_to reaching custom.delete_cascade_closure.
  -- ════════════════════════════════════════════════════════════════════════════
  v_tblA := custom.table_declare(v_org, jsonb_build_object(
    'name','Sponsor invoice','slug','sponsor_invoices','type','entity',
    'label_singular','Sponsor invoice','label_plural','Sponsor invoices','title_field','title','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','title')),
    'parent_id', v_home::text));
  v_fA := custom.field_declare(v_org, v_tblA, jsonb_build_object(
    'key','title','label','Title','plain','text','sort',10));
  v_res := custom.migrate_delete(v_org, v_tblA, 'red 3');
  if coalesce((v_res ->> 'cascaded')::integer, 0) > 0 then
    v_reds := array_append(v_reds, format('RED 3 did not go red: migrate_delete took %s record(s) with the table, so the inverse names them', v_res ->> 'cascaded'));
  end if;

  -- ════════════════════════════════════════════════════════════════════════════
  -- RED 4 — a Table whose Field a formula elsewhere reads goes without a word.
  -- Made red by: the Table arm's "This table's fields are used by …" refusal.
  -- ════════════════════════════════════════════════════════════════════════════
  v_tblB := custom.table_declare(v_org, jsonb_build_object(
    'name','Sponsor rate','slug','sponsor_rates','type','entity',
    'label_singular','Sponsor rate','label_plural','Sponsor rates','title_field','base','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','base')),
    'parent_id', v_home::text));
  v_fB := custom.field_declare(v_org, v_tblB, jsonb_build_object(
    'key','base','label','Base rate','plain','number','sort',10));
  declare
    v_tblC uuid;
    v_fC   uuid;
  begin
    v_tblC := custom.table_declare(v_org, jsonb_build_object(
      'name','Sponsor quote','slug','sponsor_quotes','type','entity',
      'label_singular','Sponsor quote','label_plural','Sponsor quotes','title_field','quoted','display','page',
      'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
      'agent_writable',true,'retention_days',365,'on_delete','cascade',
      'fields', jsonb_build_array(jsonb_build_object('name','quoted')),
      'parent_id', v_home::text));
    v_fC := custom.field_declare(v_org, v_tblC, jsonb_build_object(
      'key','quoted','label','Quoted price','parity_type','formula','sort',10,'compute_on','write',
      'depends_on', jsonb_build_array(to_jsonb(v_fB::text)),
      'expr', jsonb_build_object('op','mul',
        'args', jsonb_build_array(jsonb_build_object('field', v_fB::text),
                                  jsonb_build_object('const', 1.5)))));
  end;
  v_caught := null;
  begin
    perform custom.record_delete(v_org, v_tblB);
  exception when others then
    v_caught := sqlerrm;
  end;
  if v_caught is not null then
    v_reds := array_append(v_reds, format('RED 4 did not go red: the door refused the table and named what reads its field — "%s"', left(v_caught, 120)));
  end if;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 2 — THE SEAT IS A REAL ONE, PROVED WITH A REAL SECOND PERSON.
  -- These are not red blocks. They are what makes the four above worth reading: if the seat
  -- were not a client seat, `test@test.com` would be refused nothing and given nothing, and
  -- every measurement above would be about the store's internals. A failure here is a failure
  -- of THIS FILE, and says so.
  -- ════════════════════════════════════════════════════════════════════════════
  -- A table and a record of its own, so PART 2 never asks about something one of the four
  -- blocks above deleted — whichever way those blocks answered.
  v_tblP := custom.table_declare(v_org, jsonb_build_object(
    'name','Episode','slug','episodes','type','entity',
    'label_singular','Episode','label_plural','Episodes','title_field','pname','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','pname')),
    'parent_id', v_home::text));
  v_fP := custom.field_declare(v_org, v_tblP, jsonb_build_object(
    'key','pname','label','Name','plain','text','sort',10));
  v_recP := custom.record_write(v_org, v_tblP, jsonb_build_object('pname','The Golden Path Nobody Follows'));

  perform set_config('request.jwt.claims', c_dana_j, true);
  v_caught := null;
  begin
    perform custom.record_delete(v_org, v_recP);
  exception when others then
    v_caught := sqlerrm;
  end;
  if v_caught is null then
    raise exception 'ACCESS 2a (this file, not a red block): test@test.com deleted a record nobody shared with her';
  end if;
  v_caught := null;
  begin
    perform custom.field_declare(v_org, v_tblP, jsonb_build_object('label','Sneaked in','plain','text'));
  exception when others then
    v_caught := sqlerrm;
  end;
  if v_caught is null then
    raise exception 'ACCESS 2b (this file, not a red block): test@test.com added a column to a table she is not an admin of';
  end if;
  -- THE CONTROL, so the two refusals are not a door that refuses her everything.
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform custom.share_grant(v_org, v_recP, 'user', c_dana, 'viewer'::public.permission_level);
  perform set_config('request.jwt.claims', c_dana_j, true);
  if (custom.read_record(v_org, v_recP, true) ->> 'pname') <> 'The Golden Path Nobody Follows' then
    raise exception 'ACCESS 2c (this file, not a red block): the record shared with test@test.com at viewer does not read back for her';
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);
  raise notice 'PART 2 PASSED — from this seat test@test.com is refused what she was not given and reads what she was, so the four blocks above are measured against a real client.';

  if array_length(v_reds, 1) > 0 then
    raise exception 'tabledelete_red: % of 4 blocks are RED (the defect they assert is gone): %',
      array_length(v_reds, 1), array_to_string(v_reds, ' | ');
  end if;
  raise notice 'tabledelete_red: every block asserted the defect and found it — NOTHING IS FIXED.';
end $t$;

rollback;
