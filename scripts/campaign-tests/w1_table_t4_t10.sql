-- W1-TABLE — T4, T10 and the containment refusals, on the MAIN database.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/w1_table_t4_t10.sql
--
-- IT IS NOT A MIGRATION and never becomes one: it lives outside `migrations/`, is
-- discovered by no sweep, and its single transaction ends in ROLLBACK, so it leaves the
-- database exactly as it found it. Everything it makes — one disposable organization, its
-- Home, its Tables, its Fields, its records and one knob override — disappears with it.
--
-- 🚨 THE MAIN DATABASE (SEAT-SUITES, 2026-09-19). This file used to refuse to run anywhere
-- but the rehearsal branch. That branch is dead weight: schema `custom` there carries 226
-- functions against main's 332, `authenticated` may execute 29 of them against main's 103,
-- and `custom.field_declare` — the door a person adds a column with — does not exist there
-- at all. The store these clauses are about is on MAIN, and the owner's 2026-09-18 ruling is
-- that there is no production: everything is the main database. So the guard below names
-- main's system identifier, and the fixtures build a DISPOSABLE organization rather than
-- writing into Matrx System.
--
-- 🚨 THE SEAT (SEAT-SUITES, 2026-09-19). This suite used to run as the role that OWNS
-- `custom.record`. In that seat `custom.assert_client_may_reach` returns on its first line,
-- EXECUTE grants are free, SECURITY INVOKER and SECURITY DEFINER are the same thing and
-- `custom.record` is directly readable — so every clause proved something about the store's
-- internals and nothing about the product. It now builds its fixtures as the connected role,
-- takes the seat `authenticated` in PART 0, proves it holds it, and runs EVERY clause through
-- the door a signed-in person reaches:
--   · `insert into custom.record … 'record'`  →  `custom.record_write`
--   · `update custom.record set data = …`     →  `custom.record_update`
--   · `select … from custom."table"`          →  `custom.read_record(org, table_id, true)`
--   · `select count(*) … where table_id = X`  →  `custom.read_records(org, X, true, 200, 0)`
--   · the Field rows the old file INSERTed    →  `custom.field_declare`
--   · `custom.reachable_from`                 →  the parent walk `custom.read_record` exposes
-- There is no table privilege on anything in schema `custom` for `authenticated` — not one
-- SELECT — so every read here is a function or it does not happen.
--
-- WHAT MAKES IT FAIL. Every assertion below is a POSITIVE query with a stated expected
-- value, and the refusal assertions compare the TRIGGER'S OWN MESSAGE — never the mere
-- presence of an error, which a typo would also produce. Its RED twin is `w1_table_red.sql`,
-- which turns each guard off inside a rolled-back transaction and proves the same writes
-- then LAND, from the same seat.
--
-- THE IDENTITIES. admin@admin.com owns the disposable organization; test@test.com is a
-- member of it and asks the negative clause in PART 5. It signs nobody in and reads no
-- credential.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'w1_table_t4_t10.sql'
\set requires 'exec:custom.table_declare'
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
  v_org        uuid := gen_random_uuid();
  v_hq         uuid;
  v_color      uuid;
  v_red        uuid;
  v_paint_tbl  uuid;
  v_paint      uuid;
  v_project    uuid;
  v_x          uuid;
  v_y          uuid;
  v_risk       uuid;
  v_incident   uuid;
  v_note_tbl   uuid;
  v_note       uuid;
  v_r1         uuid;
  v_r2         uuid;
  v_i1         uuid;
  v_prev       uuid;
  v_next       uuid;
  v_walk       uuid;
  v_relcount_before integer;
  v_relcount_after  integer;
  v_n          integer;
  v_msg        text;
  v_doc        jsonb;
  v_ids        uuid[];
  v_caught     text;
  v_boss       text := current_user;   -- the connected role, for the steps no client door covers
begin
  -- WHO IS WRITING. `platform.associations` refuses an automated write that does not name the
  -- system doing it, and the store's soft delete reaches that table through
  -- `platform._gc_entity_associations`. This suite is a named system, and says so.
  perform set_config('app.actor_system', 'campaign-test/w1_table_t4_t10', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- Nothing here may create a Postgres relation. T4's law is "nothing migrates", and the
  -- whole ruling is that a Table is a ROW: if this count moves, the projection has quietly
  -- become a second relation and every other assertion in this file is beside the point.
  -- A catalogue count is not a person's question and no door answers it, so it is taken as
  -- the connected role, both times, and nothing about the product is asserted from there.
  select count(*) into v_relcount_before
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'custom';

  -- A SEAT IS A PERSON, and a person reaches an organization only through a membership.
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Rincon Plumbing Co', 'rincon-plumbing-' || substr(v_org::text, 1, 8), 'RPC', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  -- And the store answers a person only where it is switched on. The superuser walked past
  -- this switch on its first line; `authenticated` does not.
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'w1_table_t4_t10');

  -- A Home for everything below. A Home record has no client door of its own (a Home is made
  -- by the onboarding path, not by a person's browser), so this one fixture step is taken as
  -- the connected role and asserts nothing.
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'W1-TABLE HQ'))
  returning id into v_hq;

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

  -- ════════════════════════════════════════════════════════════════════════════
  -- T4 — CATEGORY GROWS UP (REC-1, REC-2, REC-25, REC-66, REC-N-17)
  -- "Red is a record of Color, display: list, title field only. Two years and many
  --  records later, Color gains hex and shade Fields and becomes display: page. Every
  --  record still relates to the same Red. Nothing migrates."
  -- ════════════════════════════════════════════════════════════════════════════

  v_color := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Colour', 'slug', 'colours',
    'label_singular', 'Colour', 'label_plural', 'Colours',
    'type', 'entity', 'display', 'list', 'ordered', false,
    'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted',
    'agent_writable', true,
    'fields', jsonb_build_array(jsonb_build_object('name', 'cname')),
    'title_field', 'cname',
    'parent_id', v_hq::text));
  -- The column the Table declared is DEFINED through the door a person has. The old suite
  -- INSERTed Field rows straight into `custom.record`, a table privilege no person holds.
  perform custom.field_declare(v_org, v_color, jsonb_build_object('key','cname','label','Name','plain','text'));

  -- REC-1 read back through the READ DOOR, not out of the jsonb we just wrote and not out of
  -- `custom."table"`, which carries no grant for a signed-in person at all.
  v_doc := custom.read_record(v_org, v_color, true);
  if (v_doc ->> 'display') <> 'list' then
    raise exception 'T4 setup: Colour should be display list, is %', v_doc ->> 'display';
  end if;
  if jsonb_array_length(v_doc -> 'fields') <> 1 then
    raise exception 'T4 setup: Colour should have exactly its title field, has % fields',
      jsonb_array_length(v_doc -> 'fields');
  end if;

  v_red := custom.record_write(v_org, v_color, jsonb_build_object('cname', 'Red'));

  -- "many records later": a second Table whose records point at Red. A column that points at
  -- ANOTHER TABLE'S records is not something `custom.field_declare` offers a person — it
  -- offers `member` (a Person) and `attachment` (a File) and refuses the word `relation` by
  -- name — so the pointer here is the id itself, and it is read back through the door that
  -- resolves a record's targets, `custom.relation_targets`.
  v_paint_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Paint', 'slug', 'paints',
    'label_singular', 'Paint', 'label_plural', 'Paints',
    'type', 'entity', 'display', 'list', 'ordered', false,
    'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', jsonb_build_array(jsonb_build_object('name', 'pname'), jsonb_build_object('name', 'colour')),
    'title_field', 'pname', 'parent_id', v_hq::text));
  perform custom.field_declare(v_org, v_paint_tbl, jsonb_build_object('key','pname','label','Name','plain','text'));
  perform custom.field_declare(v_org, v_paint_tbl, jsonb_build_object('key','colour','label','Colour','plain','text'));

  v_paint := custom.record_write(v_org, v_paint_tbl,
    jsonb_build_object('pname', 'Barn red', 'colour', v_red::text));
  select array_agg(t) into v_ids from custom.relation_targets(v_org, v_paint, 'colour') t;
  if not (v_red = any (coalesce(v_ids, '{}'::uuid[]))) then
    raise exception 'T4 setup: Barn red does not point at Red through the door (%)', v_ids;
  end if;

  -- ── two years later: Colour gains Fields and becomes a page, THROUGH THE DOOR ───
  -- 🚨 RE-PINNED (lane RED-SUITES-3, 2026-09-21). This used to write the two NAMES into the
  -- Table's own `fields` list first and define the columns afterwards, and FIELD-TRUTH closed
  -- that door: between those two statements the Table claimed a column no Field record backed
  -- — no type, no rules, no validation, never answered by `custom.applicable_fields`, never
  -- drawn by a grid — and `custom.assert_columns_are_defined` now refuses it out loud with
  -- "Colour says it has a column called "hex", "shade", and there is no such field."
  -- (`fieldtruth_the_name_and_the_definition_go_on_together.sql`, which found the same defect
  -- behind `custom.work_approval_decide` when an agent's proposed column was approved).
  -- The pre-add was REDUNDANT as well as wrong: `custom.field_declare` appends the name to the
  -- Table's own list in the same call that writes the definition, which is the whole point of
  -- there being ONE door for a column. The assertions below are unchanged — the Table still
  -- has to end up a page carrying three fields — so what this proves is stronger, not weaker:
  -- the names arrive because the columns were DEFINED, not because the suite typed them in.
  perform custom.record_update(v_org, v_color, jsonb_build_object('display', 'page'));
  perform custom.field_declare(v_org, v_color, jsonb_build_object('key','hex','label','Hex','plain','text'));
  perform custom.field_declare(v_org, v_color, jsonb_build_object('key','shade','label','Shade','plain','text'));

  v_doc := custom.read_record(v_org, v_color, true);
  if (v_doc ->> 'display') <> 'page' then
    raise exception 'T4: Colour did not become a page, it is %', v_doc ->> 'display';
  end if;
  if jsonb_array_length(v_doc -> 'fields') <> 3 then
    raise exception 'T4: Colour should carry three fields, carries %', jsonb_array_length(v_doc -> 'fields');
  end if;
  -- And the three are DEFINED, not merely named: the door that tells a screen what columns a
  -- table has answers three.
  select count(*) into v_n from custom.applicable_fields(v_org, v_color, null);
  if v_n <> 3 then
    raise exception 'T4: the columns door answers % fields for Colour, and it grew to three', v_n;
  end if;

  -- "Every record still relates to the same Red."
  select array_agg(t) into v_ids from custom.relation_targets(v_org, v_paint, 'colour') t;
  if not (v_red = any (coalesce(v_ids, '{}'::uuid[]))) then
    raise exception 'T4: Barn red no longer points at the same Red (%)', v_ids;
  end if;
  if (custom.record_resolve(v_org, v_red) ->> 'resolves_to')::uuid <> v_red
     or not (custom.record_resolve(v_org, v_red) ->> 'live')::boolean then
    raise exception 'T4: Red changed identity or stopped being live: %', custom.record_resolve(v_org, v_red);
  end if;
  select count(*) into v_n from custom.read_records(v_org, v_color, true, 200, 0);
  if v_n <> 1 then raise exception 'T4: Colour should still hold exactly its one record, holds %', v_n; end if;

  -- "Nothing migrates." No relation was created, altered or dropped by any of it. A catalogue
  -- count is not a person's question, so it steps out of the seat and says so.
  perform set_config('role', v_boss, true);
  select count(*) into v_relcount_after
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'custom';
  perform set_config('role', 'authenticated', true);
  if v_relcount_after <> v_relcount_before then
    raise exception 'T4: schema custom gained or lost % relation(s) - a Table is a ROW, and growing one may not be DDL',
                    v_relcount_after - v_relcount_before;
  end if;
  raise notice 'T4 GREEN - Colour grew from list/1 field to page/3 defined fields through the doors, Red kept its id %, Barn red still points at it, and schema custom still holds % relations', v_red, v_relcount_after;

  -- ════════════════════════════════════════════════════════════════════════════
  -- T10 — TWO HOMES, ONE TABLE (REC-3, REC-11, REC-14, REC-26)
  -- "Project X and Project Y each hold Risk, declared once at the organization. All
  --  risks returns both sets... Project Y also has its own Table, Incident, whose Home
  --  is Y. A principal shared on X alone sees X's risks, cannot tell Y's risks exist,
  --  and cannot see that a Table called Incident exists, nor its Fields."
  -- ════════════════════════════════════════════════════════════════════════════

  v_project := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Project', 'slug', 'projects',
    'label_singular', 'Project', 'label_plural', 'Projects',
    'type', 'entity', 'display', 'page', 'ordered', false,
    'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', jsonb_build_array(jsonb_build_object('name', 'pname')),
    'title_field', 'pname', 'parent_id', v_hq::text));
  perform custom.field_declare(v_org, v_project, jsonb_build_object('key','pname','label','Name','plain','text'));

  v_x := custom.record_write(v_org, v_project, jsonb_build_object('pname', 'Project X', 'parent_id', v_hq::text));
  v_y := custom.record_write(v_org, v_project, jsonb_build_object('pname', 'Project Y', 'parent_id', v_hq::text));

  -- Risk is DECLARED ONCE, at the organization: its declared Home is the organization
  -- record itself (REC-1's exactly one Home), and X and Y are additional Homes (REC-3).
  v_risk := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Risk', 'slug', 'risks',
    'label_singular', 'Risk', 'label_plural', 'Risks',
    'type', 'entity', 'display', 'list', 'ordered', false,
    'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', jsonb_build_array(jsonb_build_object('name', 'title')),
    'title_field', 'title', 'parent_id', v_hq::text));
  perform custom.field_declare(v_org, v_risk, jsonb_build_object('key','title','label','Title','plain','text'));

  perform custom.home_add(v_org, v_risk, v_x);
  perform custom.home_add(v_org, v_risk, v_y);

  -- Y's own Table, Home Y and nowhere else.
  v_incident := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Incident', 'slug', 'incidents',
    'label_singular', 'Incident', 'label_plural', 'Incidents',
    'type', 'entity', 'display', 'list', 'ordered', false,
    'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', jsonb_build_array(jsonb_build_object('name', 'title')),
    'title_field', 'title', 'parent_id', v_y::text));
  perform custom.field_declare(v_org, v_incident, jsonb_build_object('key','title','label','Title','plain','text'));

  v_r1 := custom.record_write(v_org, v_risk,     jsonb_build_object('title', 'X risk', 'parent_id', v_x::text));
  v_r2 := custom.record_write(v_org, v_risk,     jsonb_build_object('title', 'Y risk', 'parent_id', v_y::text));
  v_i1 := custom.record_write(v_org, v_incident, jsonb_build_object('title', 'Y incident', 'parent_id', v_y::text));

  -- REC-3 / REC-26: one Table, three Homes - one declared, two referenced carrying.
  select count(*) into v_n from custom.query_table_homes(v_org, v_risk);
  if v_n <> 3 then raise exception 'T10: Risk should appear in three Homes (declared + X + Y), appears in %', v_n; end if;
  select count(*) into v_n from custom.tables_at_home(v_org, array[v_x]) t where t.table_id = v_risk and t.kind = 'declared';
  if v_n <> 0 then raise exception 'T10 / REC-1: X holds Risk as a DECLARED home, and only the organization may'; end if;

  -- "All risks returns both sets."
  select count(*) into v_n from custom.read_records(v_org, v_risk, true, 200, 0);
  if v_n <> 2 then raise exception 'T10: all risks should return both sets (2), returned %', v_n; end if;

  -- "cannot see that a Table called Incident exists, nor its Fields" - structurally:
  -- Incident is at no Home reachable from X, so a scope of X never names it.
  select array_agg(table_id order by table_id) into v_ids
    from custom.tables_at_home(v_org, array[v_x]);
  if not (v_risk = any (v_ids)) then raise exception 'T10: Risk is not at Home in X'; end if;
  if v_incident = any (v_ids) then
    raise exception 'T10: Incident is visible from X - a Table Home to Y alone must not appear there';
  end if;
  select array_agg(table_id order by table_id) into v_ids
    from custom.tables_at_home(v_org, array[v_y]);
  if not (v_risk = any (v_ids) and v_incident = any (v_ids)) then
    raise exception 'T10: Y should hold both Risk and Incident';
  end if;

  -- "sees X's risks, cannot tell Y's risks exist" - structurally, over the containment the
  -- READ DOOR exposes. `custom.reachable_from` carries no client grant, so the closure is
  -- walked the way a screen walks it: each record's `parent_id`, out of `custom.read_record`.
  v_walk := v_r1; v_next := null;
  for i in 1..32 loop
    v_doc := custom.read_record(v_org, v_walk, true);
    exit when v_doc is null or (v_doc ->> 'parent_id') is null;
    v_walk := (v_doc ->> 'parent_id')::uuid;
    if v_walk = v_x then v_next := v_x; exit; end if;
  end loop;
  if v_next is distinct from v_x then raise exception 'T10: X''s own risk is not inside X'; end if;

  v_walk := v_r2; v_next := null;
  for i in 1..32 loop
    v_doc := custom.read_record(v_org, v_walk, true);
    exit when v_doc is null or (v_doc ->> 'parent_id') is null;
    v_walk := (v_doc ->> 'parent_id')::uuid;
    if v_walk = v_x then v_next := v_x; exit; end if;
  end loop;
  if v_next is not null then raise exception 'T10: Y''s risk is inside X'; end if;

  v_walk := v_i1; v_next := null;
  for i in 1..32 loop
    v_doc := custom.read_record(v_org, v_walk, true);
    exit when v_doc is null or (v_doc ->> 'parent_id') is null;
    v_walk := (v_doc ->> 'parent_id')::uuid;
    if v_walk = v_x then v_next := v_x; exit; end if;
  end loop;
  if v_next is not null then raise exception 'T10: Y''s incident is inside X'; end if;

  -- REC-3: the same Table in the same Record twice is one placement, refused by name.
  begin
    perform custom.home_add(v_org, v_risk, v_x);
    raise exception 'T10: a duplicate Home was accepted';
  exception when unique_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'that table already has a home there' then
      raise exception 'T10: the duplicate-Home refusal said "%"', v_msg;
    end if;
  end;

  -- REC-11: a `detail` Table inherits only - its records cannot be Homes.
  v_note_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Risk note', 'slug', 'risk_notes',
    'label_singular', 'Note', 'label_plural', 'Notes',
    'type', 'detail', 'parent_token', 'risks',
    'display', 'list', 'ordered', false,
    'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', jsonb_build_array(jsonb_build_object('name', 'body')),
    'title_field', 'body', 'parent_id', v_hq::text));
  perform custom.field_declare(v_org, v_note_tbl, jsonb_build_object('key','body','label','Body','plain','text'));
  v_doc := custom.read_record(v_org, v_note_tbl, true);
  if (v_doc ->> 'type') <> 'detail' then
    raise exception 'REC-1/REC-66: the detail Table does not read back as detail: %', v_doc ->> 'type';
  end if;

  v_note := custom.record_write(v_org, v_note_tbl, jsonb_build_object('body', 'a note', 'parent_id', v_r1::text));

  begin
    perform custom.home_add(v_org, v_risk, v_note);
    raise exception 'REC-11: a detail record was accepted as a Home';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'a detail record cannot be a home' then
      raise exception 'REC-11: the refusal said "%"', v_msg;
    end if;
  end;
  raise notice 'T10 GREEN - Risk at three Homes, all risks = 2 through the read door, Incident invisible from X, Y''s risk and Y''s incident not inside X by the parent walk the read door exposes, duplicate Home and detail Home both refused by name';

  -- ════════════════════════════════════════════════════════════════════════════
  -- REC-7 — ZERO OR ONE PARENT, NEVER TWO
  -- ════════════════════════════════════════════════════════════════════════════
  begin
    perform custom.record_update(v_org, v_r1,
      jsonb_build_object('parent_id', jsonb_build_array(v_x::text, v_y::text)));
    raise exception 'REC-7: two parents were accepted';
  exception when invalid_parameter_value then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'a record has zero or one parent, never two' then
      raise exception 'REC-7: the refusal said "%"', v_msg;
    end if;
  end;
  raise notice 'REC-7 GREEN - an array of parents is refused at the write door: "a record has zero or one parent, never two"';

  -- ════════════════════════════════════════════════════════════════════════════
  -- REC-8 and REC-N-4 — THE TREE AND THE CEILING, AT THE EDGE
  -- The ceiling is 16 and the organization has set nothing, so the deepest record this
  -- organization may hold sits at chain length 16. HQ is 1, so fifteen records fit under
  -- it; the sixteenth would be DEPTH 17 and is refused there, by the trigger's own words.
  -- `custom.containment_depth_ceiling` carries no client grant, so the number is read as the
  -- connected role — that read asserts nothing about what a person may do; the refusal below
  -- it does, and it is asked from the seat.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('role', v_boss, true);
  v_n := custom.containment_depth_ceiling(v_org);
  perform set_config('role', 'authenticated', true);
  if v_n <> 16 then
    raise exception 'REC-N-4: the ceiling this organization gets is %, not 16', v_n;
  end if;

  v_prev := v_hq;                                  -- depth 1
  for i in 2..16 loop                              -- depths 2 … 16
    v_prev := custom.record_write(v_org, v_project,
      jsonb_build_object('pname', format('chain %s', i), 'parent_id', v_prev::text));
  end loop;

  -- DEPTH 17 — the write one past the ceiling, at the door.
  begin
    perform custom.record_write(v_org, v_project,
      jsonb_build_object('pname', 'chain 17', 'parent_id', v_prev::text));
    raise exception 'REC-N-4: a record at depth 17 was accepted under a ceiling of 16';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'that is more things inside things than this organization allows' then
      raise exception 'REC-N-4: the depth refusal said "%"', v_msg;
    end if;
    if v_msg like '%16%' or v_msg like '%17%' then
      raise exception 'REC-N-4: the refusal quoted a number the organization never set: "%"', v_msg;
    end if;
  end;
  -- PAIRED POSITIVE CONTROL: the same write one level higher LANDS, so the ceiling is a
  -- ceiling and not a door that refuses every containment.
  v_next := custom.record_write(v_org, v_project,
    jsonb_build_object('pname', 'chain 16b', 'parent_id',
      (custom.read_record(v_org, v_prev, true) ->> 'parent_id')));
  if v_next is null then raise exception 'REC-N-4: a record one level inside the ceiling was refused'; end if;

  -- REPARENT UNDER A DESCENDANT, at the same depth-17 edge: put HQ - the root of that
  -- sixteen-long chain - inside its own deepest descendant.
  begin
    perform custom.record_reparent(v_org, v_hq, v_prev);
    raise exception 'REC-8: a reparent under a descendant was accepted';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'this would put it inside itself' then
      raise exception 'REC-8: the reparent refusal said "%"', v_msg;
    end if;
  end;

  -- and the shortest cycle of all.
  begin
    perform custom.record_reparent(v_org, v_x, v_x);
    raise exception 'REC-8: a record was accepted as its own container';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'this would put it inside itself' then
      raise exception 'REC-8: the self-parent refusal said "%"', v_msg;
    end if;
  end;
  -- PAIRED POSITIVE CONTROL: a reparent that is NOT a cycle lands through the same door.
  perform custom.record_reparent(v_org, v_r1, v_y);
  if (custom.read_record(v_org, v_r1, true) ->> 'parent_id')::uuid <> v_y then
    raise exception 'REC-8: a legal reparent was refused, so the door refuses every reparent';
  end if;
  perform custom.record_reparent(v_org, v_r1, v_x);
  raise notice 'REC-8 / REC-N-4 GREEN - depth 17 refused as "that is more things inside things than this organization allows" with no number quoted, depth 16 lands; a reparent under a descendant and a self-parent both refused as "this would put it inside itself", a legal reparent lands';

  -- ════════════════════════════════════════════════════════════════════════════
  -- REC-10 — AN OWNED RELATION MAKES ITS TARGET CONTAINED
  -- ════════════════════════════════════════════════════════════════════════════
  v_next := custom.record_write(v_org, v_paint_tbl, jsonb_build_object('pname', 'loose paint'));
  if (custom.read_record(v_org, v_next, true) ->> 'parent_id') is not null then
    raise exception 'REC-10 setup: the target is contained before the owned relation';
  end if;

  perform custom.relation_own(v_org, v_x, v_next);
  if (custom.read_record(v_org, v_next, true) ->> 'parent_id')::uuid is distinct from v_x then
    raise exception 'REC-10: the owned target''s parent is %, expected the owner %',
      custom.read_record(v_org, v_next, true) ->> 'parent_id', v_x;
  end if;
  raise notice 'REC-10 GREEN - an owned relation put its target inside the owner, read back through the read door';

  -- ════════════════════════════════════════════════════════════════════════════
  -- REC-1 / REC-2 — A HALF-DECLARED TABLE CANNOT BE STORED
  -- ════════════════════════════════════════════════════════════════════════════
  begin
    perform custom.table_declare(v_org, jsonb_build_object(
      'name', 'Untitled', 'slug', 'untitled',
      'label_singular', 'U', 'label_plural', 'Us',
      'type', 'entity', 'display', 'list', 'ordered', false,
      'weight', 'light', 'retention_days', 30,
      'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
      'fields', jsonb_build_array(jsonb_build_object('name', 'name')),
      'parent_id', v_hq::text));
    raise exception 'REC-2: a Table with no title field was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'a table needs a title field, or its records cannot be shown as chips' then
      raise exception 'REC-2: the refusal said "%"', v_msg;
    end if;
  end;

  -- T14 / REC-1: the retention floor. MAIN'S OWN SENTENCE, measured 2026-09-19 — the branch
  -- this file used to run against said "thirty days is the least history a table can keep";
  -- the store on main tells the person the floor AND the number they asked for.
  begin
    perform custom.table_declare(v_org, jsonb_build_object(
      'name', 'Shortlived', 'slug', 'shortlived',
      'label_singular', 'S', 'label_plural', 'Ss',
      'type', 'entity', 'display', 'list', 'ordered', false,
      'weight', 'light', 'retention_days', 10,
      'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
      'fields', jsonb_build_array(jsonb_build_object('name', 'name')),
      'title_field', 'name', 'parent_id', v_hq::text));
    raise exception 'T14 / REC-1: a ten-day retention was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%30 days%' or v_msg not like '%10%' then
      raise exception 'REC-1 retention: the refusal must name the floor and the number asked for, and it said "%"', v_msg;
    end if;
  end;
  raise notice 'REC-1 / REC-2 GREEN - a Table with no title field and a Table below the retention floor are both refused by name, at the door';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 5 — THE NEGATIVE CLAUSE, AS A REAL SECOND PERSON.
  -- `test@test.com` is a member of this organization and was made an admin of nothing. The
  -- refusals above are STORE RULES; these are the ACCESS question, which the old seat could
  -- not ask at all: as the owner of `custom.record`, `custom.assert_client_may_reach`
  -- returned true on its first line for every organization on the database.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_dana_j, true);

  -- 5a. She cannot change the SHAPE of a Table she is not an admin of.
  v_caught := null;
  begin
    perform custom.field_declare(v_org, v_risk, jsonb_build_object('key','sneaked','label','Sneaked in','plain','text'));
  exception when others then v_caught := sqlerrm;
  end;
  if v_caught is null then
    raise exception '5a: test@test.com added a column to a Table she is not an admin of';
  end if;

  -- 5b. Nor give a Table another Home.
  v_caught := null;
  begin
    perform custom.home_add(v_org, v_incident, v_x);
  exception when others then v_caught := sqlerrm;
  end;
  if v_caught is null then
    raise exception '5b: test@test.com gave a Table she does not administer a second Home';
  end if;

  -- 5c. THE CONTROL, so 5a and 5b are not a door that refuses her everything: the record she
  --     IS given, she reads.
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform custom.share_grant(v_org, v_r1, 'user', c_dana, 'viewer'::public.permission_level);
  perform set_config('request.jwt.claims', c_dana_j, true);
  if (custom.read_record(v_org, v_r1, true) ->> 'title') <> 'X risk' then
    raise exception '5c: the record shared with test@test.com at viewer does not read back for her';
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);
  raise notice 'PART 5 GREEN - test@test.com is refused a column and a Home on Tables she does not administer, and reads the record shared with her';

  raise notice 'W1-TABLE SUITE GREEN — every clause from the seat `authenticated`, on the main database.';
end;
$t$;

rollback;
