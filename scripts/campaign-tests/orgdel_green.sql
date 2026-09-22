-- LANE ORG-DELETE — THE GREEN SUITE. An organization that holds store records says what it
-- holds in plain words, can be emptied through a supported path, and can then be deleted.
-- On the MAIN database, in one transaction that ends in ROLLBACK.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/orgdel_green.sql
--
-- ITS RED TWIN is `scripts/campaign-tests/orgdel_red.sql`, which runs the real bytes of
-- `migrations/inverse/orgdel_an_organization_says_what_it_holds_down.sql` and asserts the
-- defect exactly as it was measured on 2026-09-19 (bug 8500bd65-7a5c-4c22-8213-2e10d462d348).
--
-- THE SEAT. Every asserted clause runs as `authenticated`, the role PostgREST gives a
-- signed-in person, through doors that person reaches. PART 0 proves the seat is held. The
-- only steps that leave it are the fixture's Home record and its Rule row, which no client
-- door covers; they assert nothing while they are out.
--
-- WHAT MAKES IT FAIL — the production change, named, one per part:
--   1   drop `custom.organization_contents` → nothing can say what an organization holds and
--       the Danger Zone is back to showing the database's foreign-key string.
--   2   drop `custom.organization_clear` → there is no supported way to empty an organization
--       and the delete is refused forever.
--   3   make the default arm destroy instead of retire → a retired Table can no longer be put
--       back, which is REC-23 gone.
--   4   drop the owner check or the name confirmation from `custom.organization_clear` →
--       a member, or a caller that drew no dialog, empties somebody's organization.
--   5   name the tables in the clear instead of asking the catalog → the thirty-fourth
--       foreign key added tomorrow refuses the delete again with nothing to act on.
--
-- A SECOND INPUT WITH A DIFFERENT EXPECTED VALUE IN EVERY PART: PART 1's full organization is
-- paired with an empty one that says so; PART 2's successful delete is paired with the raw
-- refusal that same delete gives before the clear; PART 3's undo is paired with the counts
-- proving nothing was destroyed; PART 4's two refusals are paired with the one read
-- `test@test.com` CAN do.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'orgdel_green.sql'
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
  v_orgA    uuid := gen_random_uuid();   -- retired, then put back
  v_orgB    uuid := gen_random_uuid();   -- emptied, then deleted
  v_orgC    uuid := gen_random_uuid();   -- holds nothing at all
  v_nameA   text;
  v_nameB   text;
  v_homeA   uuid;
  v_homeB   uuid;
  v_tblA    uuid;
  v_tblB    uuid;
  v_rA      uuid;
  v_rB      uuid;
  v_held    jsonb;
  v_res     jsonb;
  v_caught  text;
  v_code    text;
  v_hint    text;
  v_n       integer;
  v_left    bigint;
  v_holder  record;
  v_rows    bigint;
  v_migs    jsonb;
  v_boss    text := current_user;
begin
  perform set_config('app.actor_system', 'campaign-test/orgdel_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  v_nameA := 'Ironclad Mobile Mechanic — Ironclad Yard ' || substr(v_orgA::text, 1, 8);
  v_nameB := 'Ironclad Mobile Mechanic — Brackenfield Yard ' || substr(v_orgB::text, 1, 8);

  insert into iam.organizations (id, name, slug, abbreviation, created_by) values
    (v_orgA, v_nameA, 'ironclad-mobile-ironclad-' || substr(v_orgA::text, 1, 8), 'IMI', c_admin),
    (v_orgB, v_nameB, 'ironclad-mobile-brackenfield-' || substr(v_orgB::text, 1, 8), 'IMB', c_admin),
    (v_orgC, 'Ironclad Mobile Mechanic — Westgate Yard ' || substr(v_orgC::text, 1, 8),
             'ironclad-mobile-westgate-' || substr(v_orgC::text, 1, 8), 'IMW', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_orgA, 'organization', v_orgA, c_admin, 'owner',  'active'),
    (v_orgA, 'organization', v_orgA, c_dana,  'member', 'active'),
    (v_orgB, 'organization', v_orgB, c_admin, 'owner',  'active'),
    (v_orgC, 'organization', v_orgC, c_admin, 'owner',  'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom','system_enabled','organization', v_orgA, v_orgA, 'true'::jsonb, 'orgdel_green'),
    ('custom','system_enabled','organization', v_orgB, v_orgB, 'true'::jsonb, 'orgdel_green'),
    ('custom','system_enabled','organization', v_orgC, v_orgC, 'true'::jsonb, 'orgdel_green'),
    ('custom','member_default_visibility','organization', v_orgA, v_orgA, '"shared_only"'::jsonb, 'orgdel_green');

  -- A Home record is made by the onboarding path, not by a person's browser, and no client
  -- door covers it. Written before the seat is taken; no clause is asserted here.
  insert into custom.record (organization_id, table_id, data)
  values (v_orgA, null, jsonb_build_object('name', 'Home')) returning id into v_homeA;
  insert into custom.record (organization_id, table_id, data)
  values (v_orgB, null, jsonb_build_object('name', 'Home')) returning id into v_homeB;

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

  -- ── Two organizations with one Table and two records each, all through the doors.
  v_tblA := custom.table_declare(v_orgA, jsonb_build_object(
    'name','Service Calls','slug','service_calls','type','entity',
    'label_singular','Service Call','label_plural','Service Calls','title_field','jname','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','jname')),
    'parent_id', v_homeA::text));
  perform custom.field_declare(v_orgA, v_tblA, jsonb_build_object(
    'key','jname','label','Name','plain','text','sort',10));
  v_rA := custom.record_write(v_orgA, v_tblA, jsonb_build_object('jname','Roof survey'));
  perform custom.record_write(v_orgA, v_tblA, jsonb_build_object('jname','Gutter clean'));

  v_tblB := custom.table_declare(v_orgB, jsonb_build_object(
    'name','Service Calls','slug','service_calls','type','entity',
    'label_singular','Service Call','label_plural','Service Calls','title_field','jname','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','jname')),
    'parent_id', v_homeB::text));
  perform custom.field_declare(v_orgB, v_tblB, jsonb_build_object(
    'key','jname','label','Name','plain','text','sort',10));
  v_rB := custom.record_write(v_orgB, v_tblB, jsonb_build_object('jname','Roof survey'));
  perform custom.record_write(v_orgB, v_tblB, jsonb_build_object('jname','Gutter clean'));

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 1 — WHAT IT HOLDS, IN PLAIN WORDS (1a), AND AN EMPTY ONE SAYS SO (1b).
  -- ════════════════════════════════════════════════════════════════════════════
  v_held := custom.organization_contents(v_orgA);

  if (v_held ->> 'is_empty')::boolean then
    raise exception '1a: this organization holds a table and two records and the door said it is empty: %', v_held;
  end if;
  if (v_held ->> 'tables')::bigint < 1 or (v_held ->> 'records')::bigint < 2 then
    raise exception '1a: the door miscounted what this organization holds: %', v_held;
  end if;
  if v_held ->> 'sentence' !~ 'table' or v_held ->> 'sentence' !~ 'record' then
    raise exception '1a: the sentence a person reads names neither tables nor records: %', v_held ->> 'sentence';
  end if;
  -- IT IS A SENTENCE, NOT A DATABASE STRING. The whole point of this lane.
  if v_held ->> 'sentence' ~* '(foreign key|constraint|violates|_fkey)' then
    raise exception '1a: the sentence a person reads is still the database talking: %', v_held ->> 'sentence';
  end if;
  -- The refusing table is NAMED, so a person can be told which one is holding on.
  if not exists (select 1 from jsonb_array_elements(v_held -> 'holds') h
                  where h ->> 'where' = 'custom.record') then
    raise exception '1a: the door did not name custom.record among what this organization holds: %', v_held;
  end if;
  raise notice '1a PASSED — "%"', v_held ->> 'sentence';

  v_held := custom.organization_contents(v_orgC);
  if not (v_held ->> 'is_empty')::boolean or (v_held ->> 'rows_held')::bigint <> 0 then
    raise exception '1b: an organization that holds nothing did not say so: %', v_held;
  end if;
  if v_held ->> 'sentence' !~ 'can be removed now' then
    raise exception '1b: an empty organization did not say it can be removed: %', v_held ->> 'sentence';
  end if;
  raise notice '1b PASSED — "%"', v_held ->> 'sentence';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 2 — THE DEFECT, AND THE PATH THROUGH IT.
  --   2a the delete is refused, raw, exactly as bug 8500bd65 reported it;
  --   2b the clear empties it; 2c the SAME delete then succeeds.
  -- ════════════════════════════════════════════════════════════════════════════
  begin
    delete from iam.organizations o where o.id = v_orgB;
    raise exception '2a: an organization holding records was deleted with no complaint, so this suite is not reproducing the bug at all';
  exception
    when foreign_key_violation then
      get stacked diagnostics v_caught = message_text;
      if v_caught !~ 'record_organization_id_fkey' then
        raise exception '2a: the refusal was a foreign key, but not the one the bug names: %', v_caught;
      end if;
  end;
  raise notice '2a PASSED — the database still refuses it raw: "%" — which is exactly what a person must never be shown.', v_caught;

  -- 2b THE HONEST ANSWER WHILE RETENTION STILL PROTECTS THE ROWS. Everything is retired,
  --    the work logs are cleared, and the door says the DATE rather than a foreign key.
  v_res := custom.organization_clear(v_orgB, v_nameB, true);
  if (v_res ->> 'is_empty')::boolean then
    raise exception '2b: rows retired seconds ago were destroyed. REC-23 says they can be put back: %', v_res;
  end if;
  if v_res ->> 'removable_on' is null then
    raise exception '2b: the door said the organization cannot go and would not say when: %', v_res;
  end if;
  if v_res ->> 'sentence' ~* '(foreign key|constraint|_fkey)' then
    raise exception '2b: the clear answered with the database talking: %', v_res ->> 'sentence';
  end if;
  if v_res ->> 'sentence' !~ 'put back' or v_res ->> 'sentence' !~ 'Nothing is lost' then
    raise exception '2b: the sentence does not tell the person their data is safe: %', v_res ->> 'sentence';
  end if;
  raise notice '2b PASSED — "%"', v_res ->> 'sentence';

  -- 2c THE WINDOW RUNS OUT. Waiting thirty days is not something a suite can do, so the one
  --    step no door covers — moving the clock on the retirement — leaves the seat and says so.
  --    No product clause is asserted while it is out.
  --    Moving a retirement's clock is not a shape change and no door does it, so the row
  --    guards are stood down for this ONE statement (`set local`, inside a transaction that
  --    ends in ROLLBACK) — otherwise custom._field_shape_guard judges a Field whose Table is
  --    now retired, which is the fixture's doing and not the product's.
  perform set_config('role', v_boss, true);
  set local session_replication_role = 'replica';
  update custom.record set deleted_at = now() - interval '400 days'
   where organization_id = v_orgB and deleted_at is not null;
  set local session_replication_role = 'origin';
  perform set_config('role', 'authenticated', true);

  v_res := custom.organization_clear(v_orgB, v_nameB, true);
  if not (v_res ->> 'is_empty')::boolean then
    raise exception '2c: the retention window has run out and the store still will not let go: %', v_res;
  end if;
  if v_res ->> 'sentence' !~ 'can now be deleted' then
    raise exception '2c: the organization is empty and the door did not say it can be removed: %', v_res ->> 'sentence';
  end if;
  v_held := custom.organization_contents(v_orgB);
  if not (v_held ->> 'is_empty')::boolean then
    raise exception '2c: the clear reported success and the organization still holds rows: %', v_held;
  end if;
  raise notice '2c PASSED — "%"', v_res ->> 'sentence';

  -- 2d THE SAME DELETE THAT WAS REFUSED IN 2a.
  delete from iam.organizations o where o.id = v_orgB;
  if exists (select 1 from iam.organizations o where o.id = v_orgB) then
    raise exception '2d: the organization is still here after the delete the RLS policy allows';
  end if;
  raise notice '2d PASSED — the same delete that was refused in 2a now removes the organization.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 3 — THE DEFAULT ARM RETIRES AND DESTROYS NOTHING (REC-23), AND THE
  --          RETIREMENT IS ONE OPERATION THE STORE'S OWN UNDO PUTS BACK.
  -- ════════════════════════════════════════════════════════════════════════════
  v_res := custom.organization_clear(v_orgA, v_nameA);
  if (v_res ->> 'destroyed')::boolean then
    raise exception '3a: the DEFAULT arm destroyed rows. Nothing but an explicit and_destroy may do that: %', v_res;
  end if;
  if (v_res ->> 'retired_operations')::integer < 1 then
    raise exception '3a: the default arm retired nothing: %', v_res;
  end if;
  if v_res ->> 'sentence' !~ 'put all of it back' then
    raise exception '3a: the retire arm did not tell the person their data can be put back: %', v_res ->> 'sentence';
  end if;
  v_migs := v_res -> 'migrations';

  -- NOTHING WAS HARD-DELETED: the rows are all still there, and they are all retired.
  v_held := custom.organization_contents(v_orgA);
  if (v_held ->> 'is_empty')::boolean then
    raise exception '3b: the retire arm emptied the organization — that is a hard delete wearing a soft name: %', v_held;
  end if;
  if (v_held ->> 'tables')::bigint <> 0 or (v_held ->> 'records')::bigint <> 0 then
    raise exception '3b: something in this organization is still live after the retire: %', v_held;
  end if;
  if (v_held ->> 'retired_rows')::bigint < 4 then
    raise exception '3b: the rows are gone rather than retired: %', v_held;
  end if;
  raise notice '3b PASSED — % rows retired, 0 destroyed, and the door counts them as recoverable.',
    v_held ->> 'retired_rows';

  -- AND THE STORE'S OWN UNDO PUTS IT BACK, through the door a person reaches.
  perform custom.migrate_undo(v_orgA, (v_migs ->> 0)::uuid);
  if (custom.record_resolve(v_orgA, v_tblA) ->> 'live')::boolean is not true then
    raise exception '3c: the undo did not bring the Table back';
  end if;
  if (custom.read_record(v_orgA, v_rA, true) ->> 'jname') is distinct from 'Roof survey' then
    raise exception '3c: the Table came back without the record it had taken with it';
  end if;
  raise notice '3c PASSED — one undo put the whole retired Table, and the record inside it, back.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 4 — WHO MAY, AND WHAT A REFUSAL SAYS.
  --   4a a wrong confirmation changes nothing; 4b a member who is not the owner is
  --   refused by name with the remedy; 4c the one thing she CAN do still works.
  -- ════════════════════════════════════════════════════════════════════════════
  begin
    perform custom.organization_clear(v_orgA, 'not the name of this organization', true);
    raise exception '4a: an organization was emptied on a confirmation that did not match its name';
  exception when sqlstate '22023' then
    get stacked diagnostics v_caught = message_text, v_hint = pg_exception_hint;
  end;
  if v_caught !~ 'Nothing was removed' or v_hint !~ v_nameA then
    raise exception '4a: the refusal did not say nothing happened, or did not name what to type: % / %', v_caught, v_hint;
  end if;
  v_held := custom.organization_contents(v_orgA);
  if (v_held ->> 'is_empty')::boolean then
    raise exception '4a: the refusal was a sentence and it still emptied the organization: %', v_held;
  end if;
  raise notice '4a PASSED — "%" / "%"', v_caught, v_hint;

  perform set_config('request.jwt.claims', c_dana_j, true);
  begin
    perform custom.organization_clear(v_orgA, v_nameA, true);
    raise exception '4b: a member who is not the owner emptied the organization';
  exception when insufficient_privilege then
    get stacked diagnostics v_caught = message_text, v_hint = pg_exception_hint;
  end;
  if v_caught !~ 'Only the owner' or v_hint !~ 'owner' then
    raise exception '4b: the refusal did not name who may do it, or offered no remedy: % / %', v_caught, v_hint;
  end if;
  raise notice '4b PASSED — "%"', v_caught;

  -- THE CONTROL, so 4b is not satisfied by a door that refuses her everything.
  v_held := custom.organization_contents(v_orgA);
  if v_held ->> 'sentence' is null then
    raise exception '4c: a member of the organization could not even read what it holds';
  end if;
  raise notice '4c PASSED — the same person can still read what the organization holds.';
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 5 — THE CENSUS. After the destroying clear, not ONE of the foreign keys
  --          from `custom` and `history` to `iam.organizations` still holds a row
  --          of that organization. The class, not the one constraint the bug named.
  -- ════════════════════════════════════════════════════════════════════════════
  v_n := 0;
  v_left := 0;
  for v_holder in
    select distinct rn.nspname as s, rc.relname as t
      from pg_constraint con
      join pg_class rc on rc.oid = con.conrelid
      join pg_namespace rn on rn.oid = rc.relnamespace
     where con.contype = 'f'
       and con.confrelid = 'iam.organizations'::regclass
       and rn.nspname in ('custom', 'history')
       and rc.relkind in ('r', 'p')
       and rc.relispartition = false
     order by 1, 2
  loop
    v_n := v_n + 1;
    -- This one read leaves the seat: `authenticated` holds no table privilege in schema
    -- `custom` at all (that boundary is what makes every door meaningful), so the census
    -- itself can only be taken by the connected role. It asserts no product clause — the
    -- product clause was 2b and 2c, and both were made from the seat.
    perform set_config('role', v_boss, true);
    execute format('select count(*) from %I.%I where organization_id = $1', v_holder.s, v_holder.t)
      into v_rows using v_orgB;
    perform set_config('role', 'authenticated', true);
    if v_rows > 0 then
      raise exception '5: % . % still holds % row(s) of an organization that was cleared and deleted',
        v_holder.s, v_holder.t, v_rows;
    end if;
    v_left := v_left + v_rows;
  end loop;
  if v_n < 15 then
    raise exception '5: the census read only % table(s) — it is not looking at the class', v_n;
  end if;
  raise notice '5 PASSED — % tables in custom and history reach iam.organizations; % of them hold a row of the cleared organization.', v_n, v_left;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 6 — THE ROOT CAUSE, ASSERTED ON ITS OWN. `custom.migrate_purge` holds an
  --          EXECUTE grant for `authenticated` and a row in the door registry, and
  --          until this lane it was refused by the store's own trigger on EVERY row
  --          it tried to destroy. A grant that cannot be used is a lie told to a
  --          caller (T9's class), and it is why no organization holding a record has
  --          ever been deletable.
  -- ════════════════════════════════════════════════════════════════════════════
  perform custom.record_delete(v_orgA, v_rA);
  perform set_config('role', v_boss, true);
  set local session_replication_role = 'replica';
  update custom.record set deleted_at = now() - interval '400 days'
   where organization_id = v_orgA and id = v_rA;
  set local session_replication_role = 'origin';
  perform set_config('role', 'authenticated', true);

  v_res := custom.migrate_purge(v_orgA, v_tblA, false);
  if coalesce((v_res ->> 'rows_purged')::bigint, 0) < 1 then
    raise exception '6a: the retention purge destroyed nothing from the seat a person has: %', v_res;
  end if;
  raise notice '6a PASSED — the retention purge finally works from the seat: % row(s) past their window destroyed.',
    v_res ->> 'rows_purged';

  -- AND IT STILL REFUSES A ROW INSIDE ITS WINDOW — the pair, so 6a is not passing because
  -- the rule was removed rather than moved onto the retention it names.
  v_rB := custom.record_write(v_orgA, v_tblA, jsonb_build_object('jname','Fresh'));
  perform custom.record_delete(v_orgA, v_rB);
  v_res := custom.migrate_purge(v_orgA, v_tblA, false);
  if coalesce((v_res ->> 'rows_purged')::bigint, 0) <> 0 then
    raise exception '6b: a record retired seconds ago was destroyed — REC-23 is gone: %', v_res;
  end if;
  if (custom.record_resolve(v_orgA, v_rB) ->> 'resolves_to') is null then
    raise exception '6b: the record retired seconds ago is no longer in the store at all';
  end if;
  raise notice '6b PASSED — a record retired seconds ago is left exactly where it is.';

  raise notice 'ALL PARTS PASSED (1a what it holds, 1b an empty one, 2a the raw refusal, 2b the date, 2c the window runs out, 2d the delete, 3a-3c retire and undo, 4a-4c who may, 5 the census, 6a-6b the purge) — every clause from the seat `authenticated`.';
end;
$t$;

rollback;
