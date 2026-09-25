-- LANE TABLE-DELETE — THE GREEN SUITE. Deleting a Table takes its Fields, its saved views, its
-- Rules and its records with it, refuses by name when something OUTSIDE it reads one of those
-- Fields, is undone as ONE operation, and a Field left stranded by an older delete can finally
-- be deleted through the door. On the MAIN database, in one transaction that ends in ROLLBACK.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/tabledelete_green.sql
--
-- ITS RED TWIN is `scripts/campaign-tests/tabledelete_red.sql`, which asserts the defect exactly
-- as it was measured on 2026-09-19 and is RED against this database.
--
-- 🚨 THE SEAT (lane SEAT-SUITES, 2026-09-19). This suite used to run every clause as the role
-- that OWNS `custom.record`. In that seat `custom.assert_client_may_reach` returns on its first
-- line, EXECUTE grants are free, SECURITY INVOKER and SECURITY DEFINER are the same thing, and
-- `custom.record` is readable and WRITABLE directly — so its fixtures INSERTed Field rows a
-- person could never write, its counts were `select count(*) from custom.record`, and its undo
-- called `history.migration_undo`, which holds no client grant at all. Every clause proved
-- something about the store's internals and nothing about the product.
--
-- It now builds its organization, its memberships, its switch and its Home as the connected
-- owner, takes the seat `authenticated` in PART 0 and proves it holds it, and runs EVERY clause
-- through the door a signed-in person reaches:
--   `custom.table_contents`         -> `custom.delete_preview` (the screen's own preview)
--   `select … from custom.record`   -> `custom.record_resolve` / `custom.read_records`
--                                      / `custom.applicable_fields`
--   `insert into custom.record` (a Field) -> `custom.field_declare`
--   `history.migration_undo`        -> `custom.migrate_undo`
--   `select … from history.migration_log` -> `custom.migrations`
-- The two steps no client door covers — a Home record, and the raw `update … set deleted_at`
-- that REPRODUCES the old stranding behaviour — step out of the seat and say so, and assert no
-- product clause while they are out. PART 2 asks the same doors as `test@test.com`.
--
-- WHAT MAKES IT FAIL — the production change, named, one per part:
--   1a/1b  take the Table arm out of `custom.delete_rule`, or stop `custom.record_delete`
--          taking a Table's contents before the Table itself.
--   1c     drop the "used by" refusal from the Table arm → a table is deleted out from under a
--          formula somewhere else.
--   1e     put the shape check back in front of a retirement in `custom._field_shape_guard`
--          → a stranded Field is undeletable again.
--   1f     narrow `custom.field_dependants` back to `data_class = 'field'` → REC-18 stops
--          holding for the 95% of Fields written through `custom.record_write`.
--
-- A SECOND INPUT WITH A DIFFERENT EXPECTED VALUE IN EVERY PART, because a delete that refuses
-- everything and a delete that takes everything both pass a test that checks only one side:
-- 1a's cascade is paired with 1c's refusal; 1c's refusal is paired with 1d's clean delete;
-- 1e's stranded Field is paired with 1f's live Field that is still refused; and PART 2's two
-- refusals for `test@test.com` are paired with the one read she CAN do.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'tabledelete_green.sql'
\set requires 'row:platform.feature_knob:feature = \'custom\' and key = \'member_default_visibility\''
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
  v_views   uuid;
  v_f_name  uuid;
  v_f_score uuid;
  v_f_dbl   uuid;
  v_rule    uuid;
  v_view    uuid;
  v_r1      uuid;
  v_r2      uuid;
  v_tbl2    uuid;
  v_f2a     uuid;
  v_f2b     uuid;
  v_r2a     uuid;
  v_tblA    uuid;
  v_tblB    uuid;
  v_fA      uuid;
  v_fB      uuid;
  v_tbl5    uuid;
  v_f5      uuid;
  v_res     jsonb;
  v_undo    jsonb;
  v_prev    jsonb;
  v_caught  text;
  v_n       integer;
  v_id      uuid;
  v_boss    text := current_user;   -- the connected role, for the steps no door covers
begin
  -- WHO IS WRITING. platform.associations refuses an automated write that does not name the
  -- system doing it, and the store's soft delete reaches that table through
  -- platform._gc_entity_associations.
  perform set_config('app.actor_system', 'campaign-test/tabledelete_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Signal & Scale Podcast — Production Desk',
          'signal-scale-production-desk-' || substr(v_org::text, 1, 8), 'SSP', c_admin);
  -- A seat is a PERSON, and a person reaches an organization only through a membership.
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  -- And the store answers a person only where it is switched on. The owner of custom.record
  -- walked past this switch on its first line; `authenticated` does not.
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'tabledelete_green');
  -- MEMBERSHIP GIVES NOTHING BY ITSELF in this organization, so PART 2's refusals are about
  -- what `test@test.com` was GIVEN and not about a default the fixture handed her.
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','member_default_visibility','organization', v_org, v_org, '"shared_only"'::jsonb, 'tabledelete_green');

  -- A Home record is made by the onboarding path, not by a person's browser, and no client
  -- door covers it. It is a fixture, and it is written before the seat is taken.
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

  -- ── A Table with two plain Fields and one formula that reads one of them, two records,
  --    one Rule scoped to it, and one saved view whose subject is it. EVERY Field is written
  --    through `custom.field_declare`, which is the only way a person has.
  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','Guest','slug','guests','type','entity',
    'label_singular','Guest','label_plural','Guests','title_field','pname','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','pname'),
                                jsonb_build_object('name','score'),
                                jsonb_build_object('name','doubled')),
    'parent_id', v_home::text));

  v_f_name  := custom.field_declare(v_org, v_tbl, jsonb_build_object(
    'key','pname','label','Name','plain','text','sort',10));
  v_f_score := custom.field_declare(v_org, v_tbl, jsonb_build_object(
    'key','score','label','Score','plain','number','sort',20));
  v_f_dbl   := custom.field_declare(v_org, v_tbl, jsonb_build_object(
    'key','doubled','label','Doubled','parity_type','formula','sort',30,'compute_on','write',
    'depends_on', jsonb_build_array(to_jsonb(v_f_score::text)),
    'expr', jsonb_build_object('op','mul',
      'args', jsonb_build_array(jsonb_build_object('field', v_f_score::text),
                                jsonb_build_object('const', 2)))));

  -- A Rule record has no client door of its own yet (there is no `custom.rule_declare`), so
  -- this ONE fixture step leaves the seat and says so. No clause is asserted while it is out.
  perform set_config('role', v_boss, true);
  insert into custom.record (organization_id, table_id, data_class, data) values
    (v_org, custom.rule_kernel_id(), 'rule', jsonb_build_object(
      'row','TABLE-DELETE','name','Has a score at all','kind','predicate','sort',10,
      'message','this person has a score','uses', jsonb_build_array('membership'),
      'applies_to_types','[]'::jsonb,'scope_table_id', v_tbl::text,
      'expr', jsonb_build_object('op','present',
                'args', jsonb_build_array(jsonb_build_object('field', v_f_score::text)))))
    returning id into v_rule;
  perform set_config('role', 'authenticated', true);

  v_views := custom.table_declare(v_org, jsonb_build_object(
    'name','Saved view','slug','saved_views','type','entity',
    'label_singular','Saved view','label_plural','Saved views','title_field','name',
    'display','page','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','name'),
                                jsonb_build_object('name','subject'),
                                jsonb_build_object('name','layout')),
    'parent_id', v_home::text));
  v_view := custom.record_write(v_org, v_views, jsonb_build_object(
    'name','Guests by score','subject', v_tbl::text, 'layout','kanban'));

  v_r1 := custom.record_write(v_org, v_tbl, jsonb_build_object('pname','Priya Nathaniel','score',3));
  v_r2 := custom.record_write(v_org, v_tbl, jsonb_build_object('pname','Dorian Cassell','score',4));

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 1a — THE DOOR TAKES THE WHOLE TABLE.
  -- ════════════════════════════════════════════════════════════════════════════
  -- THE SCREEN'S OWN PREVIEW, which is what a person is shown before they confirm.
  -- `custom.table_contents` holds no client grant; `custom.delete_preview` is the door.
  v_prev := custom.delete_preview(v_org, v_tbl);
  if coalesce((v_prev ->> 'would_be_refused')::boolean, true) then
    raise exception '1a: the delete preview refuses this table: %', v_prev ->> 'reason';
  end if;
  v_n := jsonb_array_length(coalesce(v_prev -> 'cascade_to', '[]'::jsonb));
  if v_n < 7 then
    raise exception '1a: the preview a person is shown says deleting this table takes % thing(s), and it holds 7 (3 fields, 1 rule, 1 saved view, 2 records). Preview: %', v_n, v_prev;
  end if;

  perform custom.record_delete(v_org, v_tbl);

  -- Alive-or-dead is asked of `custom.record_resolve`, the door a person has.
  foreach v_id in array array[v_tbl, v_f_name, v_f_score, v_f_dbl, v_rule, v_view, v_r1, v_r2] loop
    if (custom.record_resolve(v_org, v_id) ->> 'live')::boolean then
      raise exception '1a: deleting the table left % live — exactly the strand this lane exists to close', v_id;
    end if;
  end loop;

  -- 1a-ii. AND NOTHING OF IT IS LEFT FOR A PERSON TO FIND: the table has no columns and no
  -- rows through the two doors every screen reads it with.
  select count(*) into v_n from custom.applicable_fields(v_org, v_tbl, null);
  if v_n <> 0 then
    raise exception '1a-ii: the deleted table still answers % column(s) through custom.applicable_fields — a strand by another route', v_n;
  end if;
  select count(*) into v_n from custom.read_records(v_org, v_tbl, true, 200, 0);
  if v_n <> 0 then
    raise exception '1a-ii: the deleted table still answers % row(s) through custom.read_records', v_n;
  end if;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 1b — ONE OPERATION, AND UNDO PUTS THE WHOLE SET BACK.
  -- ════════════════════════════════════════════════════════════════════════════
  v_tbl2 := custom.table_declare(v_org, jsonb_build_object(
    'name','Sponsor invoice','slug','sponsor_invoices','type','entity',
    'label_singular','Sponsor invoice','label_plural','Sponsor invoices','title_field','title','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','title'),
                                jsonb_build_object('name','amount')),
    'parent_id', v_home::text));
  v_f2a := custom.field_declare(v_org, v_tbl2, jsonb_build_object(
    'key','title','label','Title','plain','text','sort',10));
  v_f2b := custom.field_declare(v_org, v_tbl2, jsonb_build_object(
    'key','amount','label','Amount','plain','number','sort',20));
  v_r2a := custom.record_write(v_org, v_tbl2, jsonb_build_object('title','Hearthline Cloud Backups, March','amount',10));

  v_res := custom.migrate_delete(v_org, v_tbl2, 'green 1b');
  if coalesce((v_res ->> 'cascaded')::integer, 0) < 3 then
    raise exception '1b: migrate_delete reported % cascaded and this table held three things', v_res ->> 'cascaded';
  end if;
  -- THE HISTORY DOOR, not the table. `history.migration_log` holds no client grant;
  -- `custom.migrations` is what the history panel reads.
  select count(*) into v_n from custom.migrations(v_org, v_tbl2, 50) m
   where m.id = (v_res ->> 'migration_id')::uuid;
  if v_n <> 1 then
    raise exception '1b: the delete of a table and everything in it is not ONE row a person can see in its history (% rows)', v_n;
  end if;

  -- THE DOOR, not the verb: `custom.migrate_undo` is what a person reaches;
  -- `history.migration_undo` is the internal function it calls and holds no client grant.
  v_undo := custom.migrate_undo(v_org, (v_res ->> 'migration_id')::uuid);
  foreach v_id in array array[v_tbl2, v_f2a, v_f2b, v_r2a] loop
    if not (custom.record_resolve(v_org, v_id) ->> 'live')::boolean then
      raise exception '1b: undo restored % but left % still deleted', v_undo ->> 'record_id', v_id;
    end if;
  end loop;
  if coalesce((v_undo ->> 'also_restored')::integer, 0) < 3 then
    raise exception '1b: undo reported also_restored = %, and the delete took three records with it', v_undo ->> 'also_restored';
  end if;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 1c — A TABLE WHOSE FIELD SOMETHING OUTSIDE READS IS REFUSED, BY NAME.
  -- ════════════════════════════════════════════════════════════════════════════
  v_tblA := custom.table_declare(v_org, jsonb_build_object(
    'name','Sponsor rate','slug','sponsor_rates','type','entity',
    'label_singular','Sponsor rate','label_plural','Sponsor rates','title_field','base','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','base')),
    'parent_id', v_home::text));
  v_fA := custom.field_declare(v_org, v_tblA, jsonb_build_object(
    'key','base','label','Base rate','plain','number','sort',10));

  v_tblB := custom.table_declare(v_org, jsonb_build_object(
    'name','Sponsor quote','slug','sponsor_quotes','type','entity',
    'label_singular','Sponsor quote','label_plural','Sponsor quotes','title_field','quoted','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','quoted')),
    'parent_id', v_home::text));
  v_fB := custom.field_declare(v_org, v_tblB, jsonb_build_object(
    'key','quoted','label','Quoted price','parity_type','formula','sort',10,'compute_on','write',
    'depends_on', jsonb_build_array(to_jsonb(v_fA::text)),
    'expr', jsonb_build_object('op','mul',
      'args', jsonb_build_array(jsonb_build_object('field', v_fA::text),
                                jsonb_build_object('const', 1.5)))));

  -- The same question the screen asks BEFORE it offers the button: the preview says it would
  -- be refused, and names what reads it.
  v_prev := custom.delete_preview(v_org, v_tblA);
  if not coalesce((v_prev ->> 'would_be_refused')::boolean, false) then
    raise exception '1c: the preview offered to delete a table whose field a formula in another table reads: %', v_prev;
  end if;
  if (v_prev ->> 'reason') not ilike '%Quoted price%' then
    raise exception '1c: the preview''s reason does not name what depends on it: %', v_prev ->> 'reason';
  end if;

  v_caught := null;
  begin
    perform custom.record_delete(v_org, v_tblA);
  exception when others then
    v_caught := sqlerrm;
  end;
  if v_caught is null then
    raise exception '1c: the door deleted a table whose field a formula in another table reads, and said nothing';
  end if;
  if v_caught not ilike '%Quoted price%' then
    raise exception '1c: the refusal does not name what depends on it: %', v_caught;
  end if;
  if not (custom.record_resolve(v_org, v_fA) ->> 'live')::boolean then
    raise exception '1c: the refusal did not leave the table''s fields alone';
  end if;

  -- ── 1d. THE CONTROL: take the outside formula away and the same table goes cleanly.
  perform custom.record_delete(v_org, v_fB);
  perform custom.record_delete(v_org, v_tblA);
  if (custom.record_resolve(v_org, v_fA) ->> 'live')::boolean then
    raise exception '1d: with nothing outside reading it, the table still did not take its field';
  end if;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 1e — A FIELD LEFT STRANDED BY AN OLDER DELETE CAN BE DELETED AT LAST.
  -- ════════════════════════════════════════════════════════════════════════════
  v_tbl5 := custom.table_declare(v_org, jsonb_build_object(
    'name','Edit task','slug','edit_tasks','type','entity',
    'label_singular','Edit task','label_plural','Edit tasks','title_field','label','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','label')),
    'parent_id', v_home::text));
  v_f5 := custom.field_declare(v_org, v_tbl5, jsonb_build_object(
    'key','label','label','Label','plain','text','sort',10));

  -- THE OLD BEHAVIOUR, REPRODUCED EXACTLY: the Table row goes on its own, behind the rule's
  -- back. No door can do that — that is the whole point of the defect — so this ONE fixture
  -- step leaves the seat, says so, and asserts no product clause while it is out.
  perform set_config('role', v_boss, true);
  update custom.record set deleted_at = now()
   where organization_id = v_org and id = v_tbl5;
  if not custom.owning_table_gone(v_org, v_f5) then
    raise exception '1e: the setup did not actually strand the field';
  end if;
  perform set_config('role', 'authenticated', true);

  -- AND NOW THE PRODUCT QUESTION, back in the seat: a person can finally delete it.
  perform custom.record_delete(v_org, v_f5);
  if (custom.record_resolve(v_org, v_f5) ->> 'live')::boolean then
    raise exception '1e: a stranded field is still undeletable through the door';
  end if;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 1f — THE CONTROLS: a field nothing reads goes, an already-deleted one is refused.
  -- ════════════════════════════════════════════════════════════════════════════
  v_caught := null;
  begin
    perform custom.record_delete(v_org, v_f2b);      -- restored by 1b's undo; nothing reads it
  exception when others then
    v_caught := sqlerrm;
  end;
  if v_caught is not null then
    raise exception '1f: a field nothing reads was refused: %', v_caught;
  end if;

  v_caught := null;
  begin
    perform custom.record_delete(v_org, v_fA);       -- deleted with its table in 1d
  exception when others then
    v_caught := sqlerrm;
  end;
  if v_caught is null then
    raise exception '1f: the door deleted an already-deleted record and said nothing';
  end if;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 2 — THE NEGATIVE CLAUSE, AS A REAL SECOND PERSON.
  -- `test@test.com` is a member of this organization and was shared nothing, and this
  -- organization's `custom/member_default_visibility` is `shared_only`, so membership itself
  -- hands her nothing. Every refusal above is a STORE RULE; these two are the ACCESS
  -- question, which the old seat could not ask at all — as the owner of `custom.record`,
  -- `custom.assert_client_may_reach` returned true on its first line for every organization
  -- on this database.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_dana_j, true);

  -- 2a. She cannot delete a record she was never given.
  v_caught := null;
  begin
    perform custom.record_delete(v_org, v_r2a);
  exception when others then
    v_caught := sqlerrm;
  end;
  if v_caught is null then
    raise exception '2a: test@test.com deleted a record nobody shared with her';
  end if;

  -- 2b. Nor change the shape of a table she is not an admin of.
  v_caught := null;
  begin
    perform custom.field_declare(v_org, v_tbl2, jsonb_build_object('label','Sneaked in','plain','text'));
  exception when others then
    v_caught := sqlerrm;
  end;
  if v_caught is null then
    raise exception '2b: test@test.com added a column to a table she is not an admin of';
  end if;

  -- 2c. THE CONTROL, so 2a and 2b are not a door that refuses her everything: the record she
  --     IS given, she reads.
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform custom.share_grant(v_org, v_r2a, 'user', c_dana, 'viewer'::public.permission_level);
  perform set_config('request.jwt.claims', c_dana_j, true);
  if (custom.read_record(v_org, v_r2a, false) ->> 'title') <> 'Hearthline Cloud Backups, March' then
    raise exception '2c: the record shared with test@test.com at viewer does not read back for her';
  end if;
  if not custom.query_can_see(v_org, v_r2a, 'viewer') then
    raise exception '2c: the visibility door says she cannot see the record she was just given';
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);

  raise notice 'tabledelete_green: ALL PARTS PASSED (1a preview + cascade, 1a-ii no strand, 1b one operation + undo, 1c refusal by name, 1d control, 1e stranded field freed, 1f controls, access 2a-2c) — every clause from the seat `authenticated`, through the doors a signed-in person reaches.';
end;
$t$;

rollback;
