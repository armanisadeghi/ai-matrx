-- LANE RELATION-DECLARE — THE GREEN SUITE. The whole life of a relation column, from the seat
-- `authenticated`, on the MAIN database, in one transaction that ends in ROLLBACK.
--
-- RUN IT:
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/reldecl_green.sql
--
-- ITS RED TWIN is `scripts/campaign-tests/reldecl_red.sql`, which runs the real bytes of this
-- lane's two inverses inside a rolled-back transaction and asserts every defect exactly as it
-- was measured on 2026-09-20.
--
-- 🚨 THE SEAT. PART 0 takes `authenticated`, proves it holds it, and proves `custom.record` is
-- not readable from it. Everything asserted below that line goes through a door a signed-in
-- person reaches. The fixtures above it are built as the connected role, because a person
-- cannot make their own organization row.
--
-- WHAT MAKES IT FAIL — THE PRODUCTION CHANGE, NAMED, one per part:
--   1  put `platform.relation_set` etc. back to SECURITY INVOKER → every clause of 1, 3, 4, 6.
--   2  drop the Table lookup from `custom._field_document_for`'s relation arm → 2c, 2d.
--   2  drop the `custom.assert_may_know_table` call from `custom.field_declare` → 2e.
--   5  drop the `custom.relation_edges_withdraw` call from `custom.field_update` → 5b.
--   5  drop the same call from `custom.field_retire` → 5d.
--   6  drop the withholding arm of `platform.relation_label` → 6b, 6c.
--
-- A SECOND INPUT WITH A DIFFERENT EXPECTED VALUE in every part, because a door that refuses
-- everything passes a test that only checks one side: 2c's refusal is paired with 2a/2b's
-- acceptances, 5b's withdrawal with 5a's surviving edge, 6b's withheld chip with 6a's readable
-- one, and 4c's `restrict` refusal with 4a's `set_null` and 4b's `cascade`.

-- 🚨 p_by_id = FALSE (lane RED-SUITES-2, 2026-09-21). `custom.read_records`' THIRD argument is
-- `p_by_id`, and with it TRUE the document comes back keyed by FIELD ID, so `document ->> '<a
-- field key>'` is always NULL. Measured on the main database against the Birchwood companies
-- table: by_id=true -> `{"_choices": {"1ce7851e-…": …}}` and 0 rows match
-- `document ->> 'company_name' = 'Hearthstone Flooring'`; by_id=false -> 1 row matches.
-- RED-SUITES fixed this exact shape once already, in `guardswitch_green` 3e: "the clause passed
-- `true` and then looked the row up by `document ->> 'title'`. The door was right; the clause was
-- asking for the wrong document." These are its siblings.
\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'reldecl_green.sql'
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
  v_far     uuid := gen_random_uuid();
  v_home    uuid;
  v_home2   uuid;
  v_job     uuid;   -- Table A
  v_client  uuid;   -- Table B
  v_fartbl  uuid;   -- a Table in the other organization
  v_f_one   uuid;   -- Client   — a single relation, set_null
  v_f_many  uuid;   -- Crew     — a multi relation, set_null
  v_f_res   uuid;   -- Owner    — restrict
  v_f_cas   uuid;   -- Sub      — cascade
  v_f_roll  uuid;   -- Crew size — a rollup over the multi relation
  v_b1 uuid; v_b2 uuid; v_b3 uuid; v_b4 uuid;
  v_a1 uuid; v_a2 uuid; v_a3 uuid;
  v_n       integer;
  v_j       jsonb;
  v_t       text;
  v_caught  text;
  v_boss    text := current_user;
begin
  perform set_config('app.actor_system', 'campaign-test/reldecl_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by) values
    (v_org, 'Greenline Landscaping Crew', 'greenline-landscaping-' || substr(v_org::text, 1, 8), 'GLC', c_admin),
    (v_far, 'Greenline Landscaping Crew — Northfield Branch',
            'greenline-landscaping-northfield-' || substr(v_far::text, 1, 8), 'GLN', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active'),
    (v_far, 'organization', v_far, c_admin, 'owner',  'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'reldecl_green'),
    ('custom','system_enabled','organization', v_far, v_far, 'true'::jsonb, 'reldecl_green'),
    -- Dana is an ordinary member who was shared nothing, and PART 6 is about what she sees.
    ('custom','member_default_visibility','organization', v_org, v_org, '"shared_only"'::jsonb, 'reldecl_green');

  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;
  insert into custom.record (organization_id, table_id, data)
  values (v_far, null, jsonb_build_object('name', 'Home')) returning id into v_home2;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0 — THE SEAT.
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

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 1 — TWO TABLES AND THE COLUMNS THAT JOIN THEM.
  -- ════════════════════════════════════════════════════════════════════════════
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

  -- 1a. A SINGLE relation column, declared by a person, through the field door.
  v_f_one := custom.field_declare(v_org, v_job, jsonb_build_object(
    'label','Client','type','relation','relation_target', v_client::text, 'on_target_delete','set_null'));
  if v_f_one is null then raise exception '1a: no single relation column was made'; end if;

  -- 1b. A MULTI relation column. Same door, one more word.
  v_f_many := custom.field_declare(v_org, v_job, jsonb_build_object(
    'label','Crew','type','relation','relation_target', v_client::text,
    'multi', true, 'relation_max', 10, 'on_target_delete','set_null'));

  -- 1c. And the store agrees about both, read back through the door a screen uses.
  select count(*) into v_n from custom.applicable_fields(v_org, v_job, null) f
   where (f.data ->> 'key') in ('client','crew');
  if v_n <> 2 then raise exception '1c: the table describes % of its two relation columns, not 2', v_n; end if;

  -- 1d. The DECLARATION each one carries — REL-7 reads the cardinality off relation_max.
  v_j := platform.relation_declaration(v_org, v_f_one);
  if v_j ->> 'cardinality' <> 'at_most_one' then
    raise exception '1d: the single relation says cardinality %', v_j ->> 'cardinality'; end if;
  if v_j ->> 'on_delete' <> 'set_null' then
    raise exception '1d: the single relation says on_delete %', v_j ->> 'on_delete'; end if;
  v_j := platform.relation_declaration(v_org, v_f_many);
  if v_j ->> 'cardinality' <> 'many' then
    raise exception '1d: the multi relation says cardinality %', v_j ->> 'cardinality'; end if;
  raise notice 'PART 1 PASSED (1a-1d) — a person declares a relation column pointing at another of their own Tables, single and multi, through the field door, and the store reads both back.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 2 — WHAT A RELATION COLUMN MAY POINT AT.
  -- ════════════════════════════════════════════════════════════════════════════

  -- 2a / 2b: the two kernel relations still work and still fill in their own target.
  perform custom.field_declare(v_org, v_job, jsonb_build_object('label','Lead','type','member'));
  perform custom.field_declare(v_org, v_job, jsonb_build_object('label','Plan','type','attachment'));

  -- 2c. A relation at a uuid that is no record at all.
  v_caught := null;
  begin
    perform custom.field_declare(v_org, v_job, jsonb_build_object(
      'label','Ghost','type','relation','relation_target', gen_random_uuid()::text));
  exception when others then get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is null or v_caught not like '%has to point at a TABLE%' then
    raise exception '2c: a relation at a uuid that names nothing was not refused by name — %',
      coalesce(v_caught, 'it was ACCEPTED'); end if;

  -- 2d. A relation at a RECORD instead of a Table.
  v_b1 := custom.record_write(v_org, v_client, jsonb_build_object('cname','Beacon Hill Medical Group'));
  v_b2 := custom.record_write(v_org, v_client, jsonb_build_object('cname','Cobalt Financial Partners'));
  v_b3 := custom.record_write(v_org, v_client, jsonb_build_object('cname','Dorchester County Clerk'));
  v_b4 := custom.record_write(v_org, v_client, jsonb_build_object('cname','Evergreen Title Company'));
  v_caught := null;
  begin
    perform custom.field_declare(v_org, v_job, jsonb_build_object(
      'label','Oops','type','relation','relation_target', v_b1::text));
  exception when others then get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is null or v_caught not like '%has to point at a TABLE%' then
    raise exception '2d: a relation pointing at a RECORD was not refused by name — %',
      coalesce(v_caught, 'it was ACCEPTED'); end if;

  -- 2e. A relation at a Table in ANOTHER organization. The wall is one step earlier than the
  -- shape: the FIELD that would declare it does not exist over there.
  perform set_config('role', v_boss, true);   -- no client door makes a Table in another org for this fixture
  perform set_config('request.jwt.claims', c_admin_j, true);
  v_fartbl := custom.table_declare(v_far, jsonb_build_object(
    'name','Equipment','slug','equipment','type','entity','label_singular','Equipment Item',
    'label_plural','Equipment','title_field','fname','display','page','weight','light',
    'ordered',false,'row_order','sorted','default_sort','[]'::jsonb,'agent_writable',true,
    'retention_days',365,'fields', jsonb_build_array(jsonb_build_object('name','fname')),
    'parent_id', v_home2::text));
  perform set_config('role', 'authenticated', true);
  v_caught := null;
  begin
    perform custom.field_declare(v_org, v_job, jsonb_build_object(
      'label','Equipment','type','relation','relation_target', v_fartbl::text));
  exception when others then get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is null then
    raise exception '2e: a relation pointing at ANOTHER ORGANIZATION''s table was ACCEPTED'; end if;
  raise notice 'PART 2 PASSED (2a-2e) — a Person column and a File column still fill in their own target; a relation at a uuid that names nothing, at a record, or at another organization''s table is refused by name and nothing is created.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 3 — PICKING, THE REVERSE SIDE, AND A ROLLUP OVER IT.
  -- ════════════════════════════════════════════════════════════════════════════

  -- 3a. A pick, written the way the panel writes it — into the record's own cell.
  v_a1 := custom.record_write(v_org, v_job, jsonb_build_object(
    'jname','Roof', 'client', v_b1::text, 'crew', jsonb_build_array(v_b1::text, v_b2::text)));

  -- 3b. The forward side, from the seat.
  select count(*) into v_n from platform.relations_from(v_org, v_a1);
  if v_n <> 3 then raise exception '3b: the record points at % things, not 3', v_n; end if;

  -- 3c. And every chip carries the TARGET'S OWN TITLE, hydrated at read (REL-14).
  select string_agg(f.label, ', ' order by f.label) into v_t
    from platform.relations_from(v_org, v_a1) f where f.role = 'crew';
  if v_t is distinct from 'Beacon Hill Medical Group, Cobalt Financial Partners' then
    raise exception '3c: the crew chips read "%", not "Beacon Hill Medical Group, Cobalt Financial Partners"', coalesce(v_t,'<null>'); end if;

  -- 3d. THE REVERSE SIDE ON B (REL-9). It is a where clause, not a second Field.
  select count(*) into v_n from platform.relations_to(v_org, v_b1);
  if v_n <> 2 then raise exception '3d: the reverse side of Beacon Hill Medical Group shows % relations, not 2', v_n; end if;
  select string_agg(distinct t.label, ', ') into v_t from platform.relations_to(v_org, v_b1) t;
  if v_t is distinct from 'Roof' then
    raise exception '3d: the reverse side names "%", not Roof', coalesce(v_t,'<null>'); end if;

  -- 3e. platform.relation_set is the OTHER client path, and it now answers a person.
  v_a2 := custom.record_write(v_org, v_job, jsonb_build_object('jname','Wall'));
  v_n := platform.relation_set(v_org, v_a2, 'crew', jsonb_build_array(v_b2::text, v_b3::text));
  if v_n <> 2 then raise exception '3e: relation_set wrote % edges, not 2', v_n; end if;

  -- 3f. A ROLLUP over the multi relation, declared and read back through the read door.
  v_f_roll := custom.field_declare(v_org, v_job, jsonb_build_object(
    'label','Crew size','type','rollup','via','crew','agg','count','of','cname'));
  v_j := custom.read_record(v_org, v_a1, true);
  if (v_j ->> 'crew_size') is distinct from '2' then
    raise exception '3f: the rollup over the relation answers %, not 2', coalesce(v_j ->> 'crew_size','<null>'); end if;

  -- 3g. UNLINK one of the many, through the store, and the rollup follows.
  perform custom.record_update(v_org, v_a1, jsonb_build_object('crew', jsonb_build_array(v_b1::text)));
  select count(*) into v_n from platform.relations_from(v_org, v_a1) f where f.role = 'crew';
  if v_n <> 1 then raise exception '3g: after the unlink the record still points at % crew, not 1', v_n; end if;
  v_j := custom.read_record(v_org, v_a1, true);
  if (v_j ->> 'crew_size') is distinct from '1' then
    raise exception '3g: after the unlink the rollup answers %, not 1', coalesce(v_j ->> 'crew_size','<null>'); end if;

  -- 3h. And the other unlink door, platform.relation_unset, on the other record.
  v_n := platform.relation_unset(v_org, v_a2, 'crew', v_b3);
  if v_n <> 1 then raise exception '3h: relation_unset removed % edges, not 1', v_n; end if;
  raise notice 'PART 3 PASSED (3a-3h) — a person picks a target in a cell, sees the chips by the target''s own title, sees the reverse side on the other table, rolls up over the relation, and unlinks through either door.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 4 — REL-2: THE THREE DELETE RULES, EACH ONE CARRIED OUT.
  -- ════════════════════════════════════════════════════════════════════════════
  v_f_res := custom.field_declare(v_org, v_job, jsonb_build_object(
    'label','Owner','type','relation','relation_target', v_client::text, 'on_target_delete','restrict'));
  v_f_cas := custom.field_declare(v_org, v_job, jsonb_build_object(
    'label','Sub','type','relation','relation_target', v_client::text, 'on_target_delete','cascade'));

  -- 4a. set_null — deleting the target detaches, and the VALUE goes too (T7).
  perform custom.record_delete(v_org, v_b1);
  v_j := custom.read_record(v_org, v_a1, true);
  if v_j ? 'client' and nullif(v_j ->> 'client','') is not null then
    raise exception '4a: set_null left the pointer % sitting in the document', v_j ->> 'client'; end if;
  select count(*) into v_n from platform.relations_from(v_org, v_a1) f where f.role = 'crew';
  if v_n <> 0 then raise exception '4a: set_null left % crew edge(s) pointing at a deleted record', v_n; end if;

  -- 4b. restrict — REFUSED, and it NAMES what is in the way, never a count.
  v_a3 := custom.record_write(v_org, v_job, jsonb_build_object('jname','Fence','owner', v_b2::text));
  v_caught := null;
  begin
    perform custom.record_delete(v_org, v_b2);
  exception when others then get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is null or v_caught not like '%still used by Fence%' then
    raise exception '4b: restrict did not refuse by name — %', coalesce(v_caught,'the delete went through'); end if;

  -- 4c. cascade — what the delete has to take with it is RETURNED, and the one delete verb
  -- takes it. A second, different rule on a second, different record, so 4b is not the only side.
  perform custom.record_write(v_org, v_job, jsonb_build_object('jname','Gate','sub', v_b4::text));
  perform custom.record_delete(v_org, v_b4);
  select count(*) into v_n from custom.read_records(v_org, v_job, false, 200, 0) r
   where (r.document ->> 'jname') = 'Gate';
  if v_n <> 0 then raise exception '4c: cascade left the Gate standing after its target was deleted'; end if;
  raise notice 'PART 4 PASSED (4a-4c) — set_null detaches and takes the value with it, restrict refuses NAMING what is in the way, cascade takes the relating record with it.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 5 — A COLUMN THAT STOPS POINTING TAKES ITS LINKS WITH IT.
  -- ════════════════════════════════════════════════════════════════════════════

  -- 5a. A live relation, so 5b has something to remove.
  perform custom.record_update(v_org, v_a3, jsonb_build_object('crew', jsonb_build_array(v_b2::text)));
  select count(*) into v_n from platform.relations_from(v_org, v_a3) f where f.role = 'crew';
  if v_n <> 1 then raise exception '5a: the fixture link was not made (% edges)', v_n; end if;

  -- 5b. RETYPE the column away from relation. Its links go in the same operation…
  perform custom.field_update(v_org, v_f_many, jsonb_build_object('type','text'));
  -- THE CENSUS IS AN OPERATOR'S READ, NOT A PERSON'S. It takes no organization, so there is
  -- nobody it could be scoped to, and it is declared server-only for exactly that reason. The
  -- suite steps out to read it and asserts no product clause while it is out.
  perform set_config('role', v_boss, true);
  select count(*) into v_n from platform.relation_edges_without_a_live_field() c
   where c.organization_id = v_org;
  perform set_config('role', 'authenticated', true);
  if v_n <> 0 then
    raise exception '5b: the retype left % edge(s) naming a field that is no longer a relation', v_n; end if;

  -- 5c. …and the OTHER table's reverse side still answers, which is the whole point: one
  -- column used to take down every record of the table it pointed at with a 23514.
  select count(*) into v_n from platform.relations_to(v_org, v_b2);
  if v_n is null then raise exception '5c: the reverse side answered nothing after the retype'; end if;

  -- 5d. REMOVE a relation column entirely. Same rule.
  perform custom.record_update(v_org, v_a3, jsonb_build_object('owner', v_b3::text));
  perform custom.field_retire(v_org, v_f_res);
  -- THE CENSUS IS AN OPERATOR'S READ, NOT A PERSON'S. It takes no organization, so there is
  -- nobody it could be scoped to, and it is declared server-only for exactly that reason. The
  -- suite steps out to read it and asserts no product clause while it is out.
  perform set_config('role', v_boss, true);
  select count(*) into v_n from platform.relation_edges_without_a_live_field() c
   where c.organization_id = v_org;
  perform set_config('role', 'authenticated', true);
  if v_n <> 0 then
    raise exception '5d: retiring the column left % edge(s) naming a field that is gone', v_n; end if;
  raise notice 'PART 5 PASSED (5a-5d) — retyping a relation column away and removing one both take their links with them, and the pointed-at table''s reverse side keeps answering.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 6 — THE MEMBER'S SEAT. test@test.com is a member who was shared nothing.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_dana_j, true);

  -- 6a. THE CONTROL: she may not open a Job she was never shared, and she is told so — not
  -- given an empty answer that looks like "there is nothing there".
  v_caught := null;
  begin
    perform platform.relations_from(v_org, v_a3);
  exception when others then get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is null then
    raise exception '6a: a member who was shared nothing read the relations of a record she does not hold'; end if;

  -- 6b. AND THE FAR END IS WITHHELD IN WORDS. The label door is the one surface that answers
  -- about somebody else's record, and it never wears that record's title.
  v_t := platform.relation_label(v_org, 'record', v_b3);
  if v_t is distinct from platform.relation_withheld_label() then
    raise exception '6b: the chip for a record she may not open reads "%", not the withheld sentence',
      coalesce(v_t, '<null>'); end if;
  if v_t like '%Dorchester County Clerk%' then
    raise exception '6b: the withheld chip is wearing the target''s title'; end if;

  -- 6c. AND THE SAME DOOR STILL TELLS THE TRUTH ABOUT WHAT SHE DOES HOLD, so 6b is not a door
  -- that withholds everything. The admin shares one Client with her at viewer.
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform custom.share_grant(v_org, v_b3, 'user', c_dana, 'viewer'::public.permission_level);
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_t := platform.relation_label(v_org, 'record', v_b3);
  if v_t is distinct from 'Dorchester County Clerk' then
    raise exception '6c: after it was shared with her the chip reads "%", not Dorchester County Clerk', coalesce(v_t,'<null>'); end if;
  raise notice 'PART 6 PASSED (6a-6c) — a member who was shared nothing is refused the relations of a record she does not hold, a relation INTO a record she may not see reads the withheld sentence and never its title, and the same door names it the moment it is shared with her.';

  raise notice 'ALL PARTS PASSED (1a-1d, 2a-2e, 3a-3h, 4a-4c, 5a-5d, 6a-6c) — every clause from the seat `authenticated`, through the doors a signed-in person reaches.';
end $t$;

-- THE CENSUS, platform-wide and not just this suite's organization: zero edges anywhere still
-- claiming a field that is gone or no longer behaves as a relation. The seat is given back
-- first: this is an operator's read and it says so.
reset role;
select count(*) as relation_edges_without_a_live_field from platform.relation_edges_without_a_live_field();

rollback;
