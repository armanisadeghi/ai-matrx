-- W4-QUERY — THE GREEN SUITE. DOOR-6 · DOOR-7 · DOOR-8 · DOOR-9 · DOOR-10 · DOOR-N-3, on the
-- MAIN database, in one transaction that ends in ROLLBACK. Everything it makes — one
-- disposable organization, its home, its three tables, its fields, its records, its relations
-- and one knob override — disappears with it.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/w4_query_green.sql
--
-- ITS RED TWIN is `scripts/campaign-tests/w4_query_red.sql`.
--
-- 🚨 RE-POINTED AND SEATED (lane SEAT-SUITES, 2026-09-19). This suite used to target the
-- rehearsal branch — a copy carrying 226 functions in schema `custom` against main's 332, with
-- `authenticated` holding 29 of them against main's 103 — so the query surface it measured was
-- not the one anybody reaches. The owner's 2026-09-18 ruling is that there is no production and
-- everything is the main database, so it now runs there.
--
-- And it used to run every clause as the role that OWNS `custom.record`. In that seat
-- `custom.assert_client_may_reach` returns on its first line, EXECUTE grants are free,
-- SECURITY INVOKER and SECURITY DEFINER are the same thing and `custom.record` is directly
-- readable — so DOOR-10's whole subject, "two principals get two answers", was being asked of a
-- seat that was neither principal. It now builds its fixtures as the connected role, takes the
-- seat `authenticated` in PART 0, asserts that it holds it, and runs every asserted product
-- clause through the doors a signed-in person reaches: `custom.query_visible_ids`,
-- `custom.query_by_coordinates`, `custom.query_relation_edges`, `custom.query_rollup`,
-- `custom.query_rollup_sum`, `custom.query_record_as_of`, `custom.query_table_homes`,
-- `custom.query_across_homes`, `custom.home_add`, `custom.read_record`, `custom.record_update`
-- and `custom.my_level`.
--
-- The four steps no client door covers — a Home record, two relation Fields, the relation
-- EDGES themselves and the simulated-time shift of `history.row_versions` — step OUT of the
-- seat and say so, and assert no product clause while out. PART 6 is a declared server lane
-- and does the same. TWO of those four are DEFECTS this conversion found and are named where
-- they are stepped over: `custom.field_declare` cannot declare a column pointing at one of a
-- person's own Tables, and `platform.relation_set` dies from a client seat on
-- `permission denied for table record`.
--
-- WHAT MAKES IT FAIL — the production change, named, for every part:
--   · make `custom.visible_predicate_sql` always return 'true'        → PART 1 (three seats)
--   · drop the `distinct co.n` from `custom.query_by_coordinates`     → PART 2's subset counts
--   · take `cycle … using path` out of `custom.query_rollup`          → PART 3 never terminates
--   · take `group by record_id` out of it                             → PART 3's exactly-once
--   · make `custom.query_record_as_of` ignore `p_recorded_at`         → PART 4's first clock
--   · make it ignore `p_world_on`                                     → PART 4's second clock
--   · make `custom.query_across_homes` read one Home                  → PART 5's three Homes
--   · make `custom.query_prepare_hot` a no-op                         → PART 6
--
-- EVERY NUMBER IS COMPARED TO A HAND-COMPUTED EXPECTED VALUE, never to another query's answer,
-- and every refusal is paired with a positive control that succeeds.

\set ON_ERROR_STOP on
\timing off

begin;

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_t_before constant timestamptz := '2026-08-10 12:00:00+00';
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_tjob    uuid;
  v_tclient uuid;
  v_trate   uuid;
  v_north   uuid;
  v_south   uuid;
  v_alpha   uuid;
  v_beta    uuid;
  v_j1      uuid;
  v_j2      uuid;
  v_j3      uuid;
  v_j4      uuid;
  v_rate    uuid;
  v_f_client uuid;
  v_f_next  uuid;
  v_plan    jsonb;
  v_txt     text;
  v_miss    text;
  v_msg     text;
  v_now     jsonb;
  v_then    jsonb;
  v_world   jsonb;
  v_server  int; v_test int; v_admin int;
  n_none int; n_alpha int; n_beta int; n_both int; n_role_any int;
  n_homes int; n_rows int;
  n_declared int; n_prepared int; n_made int;
  n int; n_raw bigint; s numeric;
  v_boss    text := current_user;   -- the connected role, for the steps no client door covers
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'w4_query_green.sql runs on the MAIN database only, and this is %',
      (select system_identifier from pg_control_system());
  end if;

  -- WHO IS WRITING. `platform.associations` refuses an automated write that does not name the
  -- system doing it, and every relation this suite writes lands there.
  perform set_config('app.actor_system', 'campaign.w4_query.green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Ironclad Mobile Mechanic', 'ironclad-mobile-mechanic-' || substr(v_org::text, 1, 8), 'IMM', c_admin);
  -- A seat is a PERSON, and a person reaches an organization only through a membership.
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  -- And the store answers a person only where it is switched on.
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'w4_query_green');

  -- A Home record has no client door of its own (a Home is made by the onboarding path, not by
  -- a person's browser), so it is built here, as the connected role, before the seat is taken.
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;

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

  -- THE TABLES AND THEIR COLUMNS, declared through the doors a person reaches.
  v_tjob := custom.table_declare(v_org, jsonb_build_object(
    'name','Service Calls','slug','service_calls','type','entity','display','list',
    'label_singular','Job','label_plural','Jobs','ordered',false,'weight','light',
    'retention_days',365,'row_order','sorted','agent_writable',true,
    'parent_id', v_home::text,'title_field','title','default_sort','[]'::jsonb,
    'fields', jsonb_build_array(jsonb_build_object('name','title'),
                                jsonb_build_object('name','amount'))));
  v_tclient := custom.table_declare(v_org, jsonb_build_object(
    'name','Customers','slug','customers','type','entity','display','list',
    'label_singular','Client','label_plural','Clients','ordered',false,'weight','light',
    'retention_days',365,'row_order','sorted','agent_writable',true,
    'parent_id', v_home::text,'title_field','title','default_sort','[]'::jsonb,
    'fields', jsonb_build_array(jsonb_build_object('name','title'))));
  perform custom.field_declare(v_org, v_tjob, jsonb_build_object('key','title','label','Title','plain','text','sort',10));
  perform custom.field_declare(v_org, v_tjob, jsonb_build_object('key','amount','label','Amount','plain','number','sort',20));
  perform custom.field_declare(v_org, v_tclient, jsonb_build_object('key','title','label','Title','plain','text','sort',10));

  -- DOOR-8's world clock is OPT IN, per Field (HIS-5), so `rate` declares `dated` — and it
  -- lives on a Table of its own so PART 2's and PART 3's row arithmetic over the jobs is
  -- untouched by it.
  v_trate := custom.table_declare(v_org, jsonb_build_object(
    'name','Labor Rates','slug','labor_rates','type','entity','display','list',
    'label_singular','Rate','label_plural','Rates','ordered',false,'weight','light',
    'retention_days',365,'row_order','sorted','agent_writable',true,
    'parent_id', v_home::text,'title_field','title','default_sort','[]'::jsonb,
    'fields', jsonb_build_array(jsonb_build_object('name','title'))));
  perform custom.field_declare(v_org, v_trate, jsonb_build_object('key','title','label','Title','plain','text','sort',10));
  perform custom.field_declare(v_org, v_trate, jsonb_build_object('key','rate','label','Rate','plain','text','sort',30,'dated',true));

  -- ── THE FIRST FIXTURE STEP NO CLIENT DOOR COVERS ─────────────────────────────
  -- 🚨 FOUND, NOT WORKED AROUND (SEAT-SUITES, 2026-09-19). `custom.field_declare` can make a
  -- relation column only through `member` (which points at the Person kernel) or `attachment`
  -- (the File kernel), and refuses the bare word `relation` by name. There is NO door through
  -- which a signed-in person declares a column pointing at one of their OWN Tables — which is
  -- what every "Job → Client" column in the product is. So the two relation Fields below are
  -- written as the connected role, with the seat stepped out of and said so, and no clause is
  -- asserted while it is out. It is reported as a gap in `custom.field_declare`, not routed
  -- round in silence.
  perform set_config('role', v_boss, true);
  -- The TABLE declares its columns and `custom.field` defines them (REC-1 / FLD-8), and
  -- `custom._field_shape_guard` refuses a definition for a name the table never declared — so
  -- the two names go on the table first.
  update custom.record
     set data = jsonb_set(data, '{fields}',
                  coalesce(data -> 'fields','[]'::jsonb)
                  || jsonb_build_array(jsonb_build_object('name','client'),
                                       jsonb_build_object('name','next_job')))
   where organization_id = v_org and id = v_tjob;
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key','client','label','Client','name','Client','type','relation','sort',40,
    'required',false,'multi',true,'dated',false,'source','manual',
    'relation_target', v_tclient::text, 'relation_max', 50, 'on_target_delete','set_null',
    'config', jsonb_build_object('target_mode','one','ordered',false,'loops',true),
    'rules','[]'::jsonb,'depends_on','[]'::jsonb,'sensitivity','internal',
    'source_config','{}'::jsonb,'context_policy','include','applies_to_types','[]'::jsonb,
    'entity_definition_id', v_tjob))
  returning id into v_f_client;
  -- A SECOND relation Field, so "any combination" is a real combination and not one role twice.
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key','next_job','label','Next job','name','Next job','type','relation','sort',50,
    'required',false,'multi',true,'dated',false,'source','manual',
    'relation_target', v_tjob::text, 'relation_max', 50, 'on_target_delete','set_null',
    'config', jsonb_build_object('target_mode','one','ordered',false,'loops',true),
    'rules','[]'::jsonb,'depends_on','[]'::jsonb,'sensitivity','internal',
    'source_config','{}'::jsonb,'context_policy','include','applies_to_types','[]'::jsonb,
    'entity_definition_id', v_tjob))
  returning id into v_f_next;
  perform set_config('role', 'authenticated', true);
  -- ─────────────────────────────────────────────────────────────────────────────

  -- DOOR-9's three Homes for ONE Table. `custom.home_add` writes the carrying `home` relation.
  v_north := custom.record_write(v_org, v_tclient, '{"title":"Home North"}'::jsonb);
  v_south := custom.record_write(v_org, v_tclient, '{"title":"Home South"}'::jsonb);
  perform custom.home_add(v_org, v_tjob, v_north);
  perform custom.home_add(v_org, v_tjob, v_south);

  v_alpha := custom.record_write(v_org, v_tclient, '{"title":"Client Alpha"}'::jsonb);
  v_beta  := custom.record_write(v_org, v_tclient, '{"title":"Client Beta"}'::jsonb);

  -- Four jobs. The coordinate arithmetic below is hand-computed from exactly this:
  --   J1 → Alpha          J2 → Alpha + Beta      J3 → Beta          J4 → nothing
  v_j1 := custom.record_write(v_org, v_tjob, '{"title":"J1","amount":100}'::jsonb);
  v_j2 := custom.record_write(v_org, v_tjob, '{"title":"J2","amount":200}'::jsonb);
  v_j3 := custom.record_write(v_org, v_tjob, '{"title":"J3","amount":300}'::jsonb);
  v_j4 := custom.record_write(v_org, v_tjob, '{"title":"J4","amount":400}'::jsonb);

  -- THE WORLD CLOCK'S OWN FIXTURE. `rate` declares `dated`, and this record carries ONE period
  -- that has not started yet: the rate is CT-99 from 2027 to 2029 and nothing before that. Two
  -- world dates over this one stored row therefore have two different hand-computed answers,
  -- which is what makes PART 4's second clock a clock and not a spare argument.
  v_rate := custom.record_write(v_org, v_trate, jsonb_build_object(
    'title', 'Rate card',
    'rate',  'CT-99',
    '_values', jsonb_build_object(
      'rate', jsonb_build_object('dated', jsonb_build_array(
        jsonb_build_object('from', '2027-01-01', 'to', '2029-01-01', 'value', 'CT-99'))))));

  -- ── THE SECOND FIXTURE STEP NO CLIENT DOOR COVERS ────────────────────────────
  -- 🚨 FOUND, NOT WORKED AROUND (SEAT-SUITES, 2026-09-19, measured on main). `authenticated`
  -- HOLDS EXECUTE on `platform.relation_set`, and calling it from the seat dies on
  -- `permission denied for table record`: the door is SECURITY INVOKER, and so are the two
  -- helpers it calls on its first two lines — `platform.relation_field` and
  -- `platform.relation_declaration` both `select … from custom.record`, which no signed-in
  -- person may read (PART 0 asserts that). So the ONE way the product writes a relation is
  -- dead from every browser, and has been since the schema was closed.
  --
  -- It is NOT fixed here, and the fix is not "make them SECURITY DEFINER": `relation_set`'s
  -- only decision today is `platform.assert_relations_door`, which reads a KNOB and asks
  -- nothing about the caller — so a definer door would let any signed-in person write edges on
  -- any organization's records. The relation write path needs the same access decision every
  -- other write door in schema `custom` makes (`custom.assert_client_may_change` at `editor`
  -- on the source record), which is a design change and not a one-line repair. It is reported.
  --
  -- So the edges below are written as the connected role, with the seat stepped out of and
  -- said so, and no clause is asserted while it is out. Every clause that READS them — PART 2
  -- and PART 3 — is asked from the seat, through the client doors.
  perform set_config('role', v_boss, true);
  perform platform.relation_set(v_org, v_j1, 'client', jsonb_build_array(v_alpha::text));
  perform platform.relation_set(v_org, v_j2, 'client', jsonb_build_array(v_alpha::text, v_beta::text));
  perform platform.relation_set(v_org, v_j3, 'client', jsonb_build_array(v_beta::text));
  perform set_config('role', 'authenticated', true);
  -- ─────────────────────────────────────────────────────────────────────────────

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 1 — DOOR-10: the filter is INSIDE the plan, and three seats get three answers.
  -- ════════════════════════════════════════════════════════════════════════════

  -- (a-i) THE PLAN. This ONE statement is about the SHAPE OF THE STORE'S OWN QUERY and about no
  -- person's privilege at all, so it steps OUT of the seat and says so: `EXPLAIN` over
  -- `custom.record` needs SELECT on that table, which no signed-in person holds by design —
  -- PART 0 asserts exactly that. `EXPLAIN` over a plpgsql door reports one `Function Scan` and
  -- says nothing about what is inside it, so explaining a door would be reading the wrapper.
  -- This is the exact shape every record-returning function in this lane emits, and it must
  -- plan as a JOIN with no discarded rows. Every clause about what a PERSON may see is in
  -- (a-ii) and (b), back in the seat.
  perform set_config('role', v_boss, true);
  execute format(
    'explain (analyze, format json, timing off, summary off)
       select r.id from custom.query_visible_ids(%L::uuid, %L::uuid) v
         join custom.record r on r.organization_id = %L::uuid and r.id = v',
    v_org, v_tjob, v_org)
    into v_plan;
  perform set_config('role', 'authenticated', true);
  v_txt := v_plan::text;
  if v_txt !~* 'Nested Loop|Hash Join|Merge Join' then
    raise exception 'DOOR-10 FAIL: the Visibility set does not JOIN — the plan is %', v_txt;
  end if;
  if v_txt ~* '"Rows Removed by Filter": [1-9]' then
    raise exception 'DOOR-10 FAIL: rows were fetched and discarded, which is a post-filter. Plan: %', v_txt;
  end if;
  raise notice 'DOOR-10 (a-i) PASS: the Visibility set is JOINED in the plan and no row is fetched-then-discarded';

  -- (a-ii) THE CENSUS, from the seat, out of the catalogue. A plan proves ONE query. This
  -- proves the CLASS: every function in this lane's query surface that returns records must
  -- read the one Visibility helper. A later query that forgets it — the actual failure DOOR-10
  -- describes — is caught here and not by hoping somebody explains it.
  --
  -- 🚨 RE-MEASURED ON MAIN (SEAT-SUITES, 2026-09-19). The one helper now has TWO halves and a
  -- door may read either: `custom.query_visible_ids` returns the ids as a set, and READ-PERF's
  -- `custom.visible_predicate_sql` writes the same ladder's answer as a PREDICATE in the door's
  -- own WHERE so the planner can prune the partition. `custom.query_by_coordinates` and
  -- `custom.query_across_homes` moved to the second half; `custom.query_rollup`,
  -- `custom.query_table_as_of` and `custom.query_can_see` still read the first. Reading only
  -- the first name would now report two doors as broken that are not.
  select string_agg(p.proname, ', ') into v_miss
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'custom'
     and p.proname in ('query_by_coordinates', 'query_across_homes', 'query_rollup',
                       'query_table_as_of', 'query_can_see')
     and p.prosrc !~ 'query_visible_ids|visible_predicate_sql';
  if v_miss is not null then
    raise exception 'DOOR-10 FAIL: these query functions read neither half of the one Visibility helper: %', v_miss;
  end if;
  raise notice 'DOOR-10 (a-ii) PASS: every record-returning function in the query surface reads custom.query_visible_ids or custom.visible_predicate_sql — the filter cannot be forgotten by a later one';

  -- (b) THREE SEATS, ONE REFUSAL AND FOUR NUMBERS, each compared to a hand-computed expected
  --     value and never to each other only.
  --
  --     · NO PRINCIPAL. A client seat whose session names nobody is REFUSED BY NAME, before it
  --       reads a row. On the branch this clause expected the number 4, because the suite ran
  --       as the role that OWNS the store and `custom.visible_predicate_sql` answers
  --       `custom.query_is_store_owner()` for a caller with no principal — so an anonymous
  --       browser and the maintenance connection were the same thing to it. From the seat the
  --       organization wall answers first, and it says so: an implementation that let the
  --       connection's own privilege leak past the principal would hand back 4 rows here.
  --     · test@test.com is a MEMBER, so the organization lane reaches her to all 4 at `viewer`
  --       and to NONE of them at `editor` — two different numbers for one person over one set
  --       of rows, which is the per-record resolution a 0-and-4 pair alone would not catch.
  --     · admin@admin.com is the positive control at both levels.
  perform set_config('request.jwt.claims', '', true);
  v_msg := null;
  begin
    select count(*) into v_server from custom.query_visible_ids(v_org, v_tjob);
  exception when others then
    v_msg := sqlerrm;
  end;
  if v_msg is null then
    raise exception 'DOOR-10 FAIL: a client seat whose session names no principal was answered % rows instead of being refused — the connection''s own privilege is leaking past the principal', v_server;
  end if;
  if v_msg !~* 'member of that organization' then
    raise exception 'DOOR-10 FAIL: the refusal for a seat with no principal does not name the organization wall — "%"', v_msg;
  end if;
  perform set_config('request.jwt.claims', c_dana_j, true);
  select count(*) into v_test from custom.query_visible_ids(v_org, v_tjob);
  perform set_config('request.jwt.claims', c_admin_j, true);
  select count(*) into v_admin from custom.query_visible_ids(v_org, v_tjob);

  if v_test <> 4 then
    raise exception 'DOOR-10 FAIL: test@test.com is a member of this organization, so the organization lane reaches her to all 4 jobs at viewer, and she reached %', v_test;
  end if;
  if v_admin <> 4 then
    raise exception 'DOOR-10 FAIL: admin@admin.com DOES hold access here, so the positive control is all 4, and it saw %', v_admin;
  end if;

  -- THE SAME ROWS, ONE RUNG UP, and the answers part. `editor` is not conveyed by membership,
  -- so she reaches none of the four until ONE is actually shared with her at that level — and
  -- then exactly one, never the other three.
  perform set_config('request.jwt.claims', c_dana_j, true);
  select count(*) into v_test from custom.query_visible_ids(v_org, v_tjob, 'editor');
  if v_test <> 0 then
    raise exception 'DOOR-10 FAIL: nothing was shared with test@test.com at editor and she reaches % of these four jobs at that level', v_test;
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform custom.share_grant(v_org, v_j1, 'user', c_dana, 'editor'::public.permission_level);
  perform set_config('request.jwt.claims', c_dana_j, true);
  select count(*) into v_test from custom.query_visible_ids(v_org, v_tjob, 'editor');
  if v_test <> 1 then
    raise exception 'DOOR-10 FAIL: exactly one job was shared with test@test.com at editor and she reaches % at that level', v_test;
  end if;
  if custom.my_level(v_org, v_j1) < 'editor'::public.permission_level then
    raise exception 'DOOR-10 FAIL: J1 was shared with test@test.com at editor and her level on it reads %', custom.my_level(v_org, v_j1);
  end if;
  if custom.my_level(v_org, v_j2) >= 'editor'::public.permission_level then
    raise exception 'DOOR-10 FAIL: nothing was shared with test@test.com on J2 and her level on it reads % — the ladder is not resolving per record', custom.my_level(v_org, v_j2);
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);
  select count(*) into v_admin from custom.query_visible_ids(v_org, v_tjob, 'editor');
  if v_admin <> 4 then
    raise exception 'DOOR-10 FAIL: admin@admin.com is an owner of this organization, so the editor control is all 4, and it saw %', v_admin;
  end if;
  raise notice 'DOOR-10 (b) PASS: over this Table — a seat with no principal is REFUSED by the organization wall, test@test.com reaches 4 at viewer and 0 then 1 at editor, admin@admin.com 4 at both (the positive control). One refusal and four hand-computed numbers, every one asked from the client seat.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 2 — DOOR-6: any combination of coordinates, and any SUBSET of them.
  -- ════════════════════════════════════════════════════════════════════════════
  -- THE SUBSET LADDER. Four questions over ONE fixture with four DIFFERENT expected answers,
  -- so an implementation that ignores a coordinate, or ANDs when it should intersect, is caught
  -- by construction rather than by one number happening to match.
  select count(*) into n_none  from custom.query_by_coordinates(v_org, v_tjob, '[]'::jsonb, 100, 0);
  select count(*) into n_alpha from custom.query_by_coordinates(v_org, v_tjob,
    jsonb_build_array(jsonb_build_object('role','client','target_id',v_alpha)), 100, 0);
  select count(*) into n_beta  from custom.query_by_coordinates(v_org, v_tjob,
    jsonb_build_array(jsonb_build_object('role','client','target_id',v_beta)), 100, 0);
  select count(*) into n_both  from custom.query_by_coordinates(v_org, v_tjob,
    jsonb_build_array(jsonb_build_object('role','client','target_id',v_alpha),
                      jsonb_build_object('role','client','target_id',v_beta)), 100, 0);
  -- A coordinate with NO role: "related to Alpha by anything at all".
  select count(*) into n_role_any from custom.query_by_coordinates(v_org, v_tjob,
    jsonb_build_array(jsonb_build_object('target_id',v_alpha)), 100, 0);

  if n_none  <> 4 then raise exception 'DOOR-6 FAIL: no coordinates is the whole Table, expected 4, got %', n_none; end if;
  if n_alpha <> 2 then raise exception 'DOOR-6 FAIL: one coordinate (Alpha) should return J1 and J2 = 2, got %', n_alpha; end if;
  if n_beta  <> 2 then raise exception 'DOOR-6 FAIL: one coordinate (Beta) should return J2 and J3 = 2, got %', n_beta; end if;
  if n_both  <> 1 then raise exception 'DOOR-6 FAIL: both coordinates is the INTERSECTION, J2 only = 1, got %', n_both; end if;
  if n_role_any <> 2 then raise exception 'DOOR-6 FAIL: a roleless coordinate on Alpha should return 2, got %', n_role_any; end if;
  raise notice 'DOOR-6 PASS: 0/1/1/2 coordinates over one fixture answer 4 / 2 / 2 / 1, and a roleless coordinate answers 2 — four different hand-computed numbers, from the seat';

  -- THE REVERSE END, paired with the forward one so "any combination" includes direction.
  select count(*) into n_alpha from custom.query_by_coordinates(v_org, null,
    jsonb_build_array(jsonb_build_object('role','client','target_id',v_j2,'direction','to')), 100, 0);
  if n_alpha <> 2 then
    raise exception 'DOOR-6 FAIL: the reverse end of J2''s client relation is Alpha and Beta = 2, got %', n_alpha;
  end if;
  raise notice 'DOOR-6 PASS: the reverse end of the same edges answers 2 — one stored row, read from either side';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 3 — DOOR-7: a rollup over a LOOP counts every node exactly once.
  -- ════════════════════════════════════════════════════════════════════════════
  -- The loop: J1 → J2 → J3 → J1, plus a DIAMOND J1 → J4 and J2 → J4, because cycle detection
  -- alone does not stop a diamond from being reached twice and the grouping is what does.
  -- The same fixture step, out of the seat for the same measured reason as above.
  perform set_config('role', v_boss, true);
  perform platform.relation_set(v_org, v_j1, 'next_job', jsonb_build_array(v_j2::text));
  perform platform.relation_set(v_org, v_j2, 'next_job', jsonb_build_array(v_j3::text, v_j4::text));
  perform platform.relation_set(v_org, v_j3, 'next_job', jsonb_build_array(v_j1::text));
  perform platform.relation_set(v_org, v_j4, 'next_job', jsonb_build_array(v_j1::text));
  perform set_config('role', 'authenticated', true);

  select count(*) into n from custom.query_rollup(v_org, array[v_j1], 'referenced', 'next_job');
  if n <> 4 then
    raise exception 'DOOR-7 FAIL: the four jobs form one loop and one diamond, so the rollup is exactly 4 nodes, got %', n;
  end if;

  -- THE NAIVE WALK, RUN HERE over the door's OWN edges, so "too big" is a number this file
  -- produced rather than a number a comment claims.
  with recursive edge as (
    select parent_id, child_id from custom.query_relation_edges(v_org, 'referenced', 'next_job')
  ), walk(node, d) as (
      select v_j1, 0
    union all
      select e.child_id, walk.d + 1 from walk join edge e on e.parent_id = walk.node where walk.d < 8
  )
  select count(*) into n_raw from walk;
  if n_raw <= n then
    raise exception 'DOOR-7 FAIL: the naive walk should OVERCOUNT this graph (it is a loop plus a diamond) — it returned % against the rollup''s %', n_raw, n;
  end if;
  raise notice 'DOOR-7 PASS: the rollup returns exactly 4 nodes where the naive walk over the SAME edges returns % — the difference is the double counting', n_raw;

  select custom.query_rollup_sum(v_org, array[v_j1], 'amount', 'referenced', 'next_job') into s;
  if s <> 1000 then
    raise exception 'DOOR-7 FAIL: 100+200+300+400 = 1000 counted once each, got %', s;
  end if;
  raise notice 'DOOR-7 PASS: the rollup SUM is 1000 — hand-computed as 100+200+300+400, each counted once';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 4 — DOOR-8: as-of a date on EITHER clock, and they are genuinely two.
  -- ════════════════════════════════════════════════════════════════════════════
  -- SIMULATED TIME. `history.row_versions.occurred_at` defaults to `now()`, which is constant
  -- inside one transaction, so a recorded-clock question would otherwise have one moment to ask
  -- about. This ONE statement pushes J1's versions back to a real past moment; `authenticated`
  -- holds SELECT on `history.row_versions` and nothing else, so it steps OUT of the seat and
  -- says so, touches only rows this transaction wrote, and asserts nothing.
  perform set_config('role', v_boss, true);
  update history.row_versions
     set occurred_at = v_t_before
   where entity_type = 'custom.record' and row_id = v_j1 and organization_id = v_org;
  perform set_config('role', 'authenticated', true);

  perform custom.record_update(v_org, v_j1, '{"title":"J1 corrected"}'::jsonb, null);

  v_now  := custom.query_record_as_of(v_org, v_j1, null, null);
  v_then := custom.query_record_as_of(v_org, v_j1, v_t_before + interval '1 second', null);

  if v_now ->> 'title' <> 'J1 corrected' then
    raise exception 'DOOR-8 FAIL: with no clock argument the answer is today''s, expected "J1 corrected", got %', v_now ->> 'title';
  end if;
  if v_then is null or v_then ->> 'title' is null then
    raise exception 'DOOR-8 FAIL: the recorded clock returned nothing for a moment the store has a version for';
  end if;
  if v_then ->> 'title' <> 'J1' then
    raise exception 'DOOR-8 FAIL: as of % the store said "J1"; it answered "%" — p_recorded_at is being ignored', v_t_before, v_then ->> 'title';
  end if;
  raise notice 'DOOR-8 PASS (clock one, recorded): today answers "%", and the SAME record as-of % answers "%" — two different stored truths, both hand-computed, both through custom.query_record_as_of',
    v_now ->> 'title', v_t_before, v_then ->> 'title';

  -- CLOCK TWO, the world clock, and it is genuinely a SECOND clock: the SAME stored row read on
  -- two world dates gives two DIFFERENT hand-computed answers. The rate is CT-99 from 2027 to
  -- 2029 and nothing before that, so today is ABSENT and June 2027 is CT-99 — and absent is
  -- the answer that matters, because the failure this guards against is a store that quietly
  -- hands back a future-effective value as though it were true today.
  --
  -- 🚨 RE-MEASURED ON MAIN (SEAT-SUITES, 2026-09-19). The clause here used to say a Field that
  -- declares `dated` and carries NO period is absent on every date. Main's
  -- `history.value_in_force` says the opposite in so many words — a key with no periods in the
  -- document is `undated` and its value stands on every date, because the document is the only
  -- thing that ever said anything about it — and it is right: "absent on every date" would
  -- have made every ordinary column of a dated Field unreadable. So the fixture now writes the
  -- period the clause is actually about, and the ABSENCE asserted is the one HIS-6 means: a
  -- date no period covers. The old note claimed `custom.value_envelope_keys()` refuses `dated`
  -- by name and the period could not be written through the door at all; on the main database,
  -- from the seat, `custom.record_write` takes it.
  v_now   := custom.query_record_as_of(v_org, v_rate, null, null);
  v_world := custom.query_record_as_of(v_org, v_rate, null, date '2027-06-15');
  if v_now -> 'rate' is not null and jsonb_typeof(v_now -> 'rate') <> 'null' then
    raise exception 'DOOR-8 FAIL: the rate starts in 2027 and today''s read answered % — a future-effective value reaching backwards', v_now -> 'rate';
  end if;
  if (v_now -> '_effective' -> 'rate' ->> 'state') is distinct from 'not_yet' then
    raise exception 'DOOR-8 FAIL: the store must say WHICH kind of nothing this is, and _effective reads %', coalesce((v_now -> '_effective' -> 'rate')::text, 'nothing');
  end if;
  if (v_world ->> 'rate') is distinct from 'CT-99' then
    raise exception 'DOOR-8 FAIL: the 2027-2029 rate read % in June 2027', coalesce(v_world -> 'rate', 'null'::jsonb);
  end if;
  if not (v_world ? 'title') then
    raise exception 'DOOR-8 FAIL: the world-clock read dropped the record instead of projecting its keys';
  end if;
  raise notice 'DOOR-8 PASS (clock two, world): the SAME row answers NOTHING today (state "not_yet") and CT-99 for 2027-06-15 — p_world_on changes the answer, so it is a second clock and not a spare argument';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 5 — DOOR-9: every Home of one Table in ONE answer.
  -- ════════════════════════════════════════════════════════════════════════════
  select count(*) into n_homes from custom.query_table_homes(v_org, v_tjob);
  if n_homes < 3 then
    raise exception 'DOOR-9 FAIL: this Table was declared under this organization''s Home and given two more, so it has 3 Homes, got %', n_homes;
  end if;
  select count(*) into n_rows from custom.query_across_homes(v_org, v_tjob, 100, 0);
  if n_rows <> 4 then
    raise exception 'DOOR-9 FAIL: one page across EVERY Home returns all 4 jobs, got %', n_rows;
  end if;
  raise notice 'DOOR-9 PASS: % Homes, and one call returns all 4 records across them — one query, one page, not one query per Home', n_homes;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 6 — DOOR-N-3: the hot paths are PREPARED, and the plan is reused.
  --
  -- THIS WHOLE PART IS A SERVER LANE and steps OUT of the seat and says so.
  -- `custom.query_hot_paths`, `custom.query_prepare_hot` and `custom.query_hot_paths_prepared`
  -- hold NO client grant: a prepared statement belongs to a CONNECTION, and the connections
  -- are the pool's, not a browser's — a client that could re-prepare on checkout would raise
  -- 42P05 for whoever got that connection next. No clause below asserts anything about what a
  -- person may do; every access clause of this suite is in PART 1 and PART 7.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('role', v_boss, true);
  select count(*) into n_declared from custom.query_hot_paths();
  if n_declared < 4 then
    raise exception 'DOOR-N-3 FAIL: fewer than four hot paths are declared (%)', n_declared;
  end if;
  select custom.query_prepare_hot() into n_made;
  select count(*) into n_prepared from custom.query_hot_paths_prepared() where prepared;
  if n_prepared <> n_declared then
    raise exception 'DOOR-N-3 FAIL: % hot paths are declared and only % are prepared on this connection', n_declared, n_prepared;
  end if;
  -- IDEMPOTENT: calling it again prepares nothing and does not raise 42P05.
  if custom.query_prepare_hot() <> 0 then
    raise exception 'DOOR-N-3 FAIL: the second call re-prepared something, so the pool would raise 42P05 on every checkout';
  end if;
  perform set_config('role', 'authenticated', true);
  raise notice 'DOOR-N-3 PASS: % declared hot paths, all % prepared on this connection, and a second call prepares 0 rather than raising 42P05',
    n_declared, n_prepared;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 7 — THE NEGATIVE CLAUSES, AS A REAL SECOND PERSON.
  -- PART 1 (b) proves the query surface answers `test@test.com` per record. This part proves
  -- the other side of the same seat: the ONE job she was given at `editor` is hers to read and
  -- to change, and the three she was not given are not. As the owner of `custom.record`,
  -- `custom.assert_client_may_reach` returned true on its first line for every organization on
  -- the database, so none of this could be asked at all.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_dana_j, true);

  -- 7a. A job nobody shared with her is not hers to delete.
  v_msg := null;
  begin
    perform custom.record_delete(v_org, v_j2);
  exception when others then
    v_msg := sqlerrm;
  end;
  if v_msg is null then
    raise exception 'DOOR-10 FAIL: test@test.com deleted a job nobody shared with her';
  end if;

  -- 7b. Nor may she change the SHAPE of a Table she is not an admin of.
  v_msg := null;
  begin
    perform custom.field_declare(v_org, v_tjob, jsonb_build_object('key','sneaked','label','Sneaked in','plain','text'));
  exception when others then
    v_msg := sqlerrm;
  end;
  if v_msg is null then
    raise exception 'DOOR-10 FAIL: test@test.com added a column to a table she is not an admin of';
  end if;

  -- 7c. THE CONTROL, so 7a and 7b are not a door that refuses her everything: the job she IS
  --     given at editor, she reads through the read door and changes through the write door.
  if (custom.read_record(v_org, v_j1, true) ->> 'title') <> 'J1 corrected' then
    raise exception 'DOOR-10 FAIL: the job shared with test@test.com at editor does not read back for her';
  end if;
  perform custom.record_update(v_org, v_j1, jsonb_build_object('title','J1 hers'));
  if (custom.read_record(v_org, v_j1, true) ->> 'title') <> 'J1 hers' then
    raise exception 'DOOR-10 FAIL: test@test.com holds editor on J1 and her write did not land';
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);
  raise notice 'DOOR-10 PASS (the second person): test@test.com cannot delete a job she was not given and cannot add a column, and the one job she WAS given at editor she reads AND writes — so PART 1''s numbers are the ladder resolving per record, not a door that refuses her everything.';

  raise notice '════ W4-QUERY GREEN SUITE PASSED — DOOR-10 1a-1b + 7a-7c, DOOR-6 2, DOOR-7 3, DOOR-8 4, DOOR-9 5, DOOR-N-3 6 — every asserted product clause from the seat `authenticated`, through the doors a signed-in person reaches. ════';
end $t$;

rollback;
