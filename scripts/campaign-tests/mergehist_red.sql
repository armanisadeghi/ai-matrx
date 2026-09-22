-- MERGE-HISTORY — THE RED TWIN of mergehist_green.sql.
--
-- RUN IT FROM THE REPOSITORY ROOT (the \i path below is relative to it), against the MAIN
-- database, exactly as the green suite is run:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the five SUPABASE_MATRIX_* values>" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/mergehist_red.sql
--
-- WHAT IT DOES. It runs this lane's inverse — the five bodies and the two columns as they stood
-- before tonight — and then asks the SAME questions the green suite asks, requiring the OLD,
-- BROKEN answer to each. A block that does NOT flip is a green clause that was never proving
-- anything. It also proves the inverse EXECUTES, which is the other half of rule 27.
--
-- Everything is inside ONE transaction that ends in ROLLBACK, so the functions, the columns and
-- the grants are exactly as they were the moment it finishes.
--
-- 🚨 THE SEAT (lane SEAT-SUITES, 2026-09-19). A red twin proves the green suite's clauses flip,
-- so it has to ask them in the SAME seat the green suite asks them in — otherwise it would be
-- measuring the defect against the store's internals while the green suite measures the fix
-- against the product, and the pair would not be a pair. It therefore does exactly what
-- `mergehist_green.sql` does: fixtures and the inverse as the connected role, PART 0 takes the
-- seat `authenticated` and proves it, and every compound operation and every reading of history
-- below that line goes through the doors a signed-in person reaches. The Field row that used to
-- be INSERTed straight into `custom.record` goes through `custom.field_declare`.
--
-- WHY THE INVERSE IS APPLIED OUT OF THE SEAT AND SAYS SO. `CREATE OR REPLACE FUNCTION` is DDL
-- on functions the store owns; no signed-in person may do it and no client door covers it. It
-- is run before the seat is taken, it asserts no product clause, and the seat is taken
-- immediately afterwards and held for every clause in the file.
--
-- ONE GREEN BLOCK HAS NO RED TWIN, and says so rather than pretending: green part 2 (an
-- ordinary edit made after a merge is not called a merge) guards the fence on a mark that did
-- not exist before this lane. Before the inverse is undone nothing is ever marked, so there is
-- nothing that could leak and no way for that block to be red. It is a guard on the mechanism
-- this lane adds, not a measurement of the defect it closes.
--
-- AND GREEN PART 5 HAS NO RED TWIN EITHER, for the same honest reason: it is the ACCESS
-- question, which this lane did not touch. It is asked again at the foot of this file anyway —
-- not as a red block but as the proof that the seat this file holds is a real client seat and
-- not a decoration.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'mergehist_red.sql'
\set requires 'column:history.row_versions.operation_name'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '60s';

-- ─────────── THE INVERSE, as the connected role. Out of the seat, and nothing is asserted.
\i migrations/inverse/mergehist_a_compound_operation_signs_its_revision_down.sql

-- ── THE SAME SETUP, THE SAME SEAT, AND THE SAME ORDINARY EDIT ────────────────────────────
do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org  uuid := gen_random_uuid();
  v_home uuid; v_per_t uuid; v_ch1 uuid; v_ch2 uuid;
  v_proj uuid; v_note_t uuid; v_x uuid; v_n1 uuid; v_n2 uuid;
  v_boss text := current_user;
begin
  perform set_config('app.actor_system', 'campaign-test/mergehist_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Hands & Hope Alliance', 'hands-and-hope-alliance-' || substr(v_org::text, 1, 8), 'HHA', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb,
          'campaign-test/mergehist_red');

  -- A Home has no client door of its own, so it is made before the seat is taken.
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Hands & Hope Alliance — Main Office')) returning id into v_home;

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

  v_per_t := custom.table_declare(v_org, jsonb_build_object(
    'name','Donors','slug','donors','type','entity',
    'label_singular','Donor','label_plural','Donors','title_field','pname',
    'display','page','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','pname'), jsonb_build_object('name','phone')),
    'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_per_t, jsonb_build_object(
    'key','phone','label','Phone','plain','text','sort',20));
  v_ch1 := custom.record_write(v_org, v_per_t, jsonb_build_object('pname','Chen','phone','555-0101','parent_id',v_home::text));
  v_ch2 := custom.record_write(v_org, v_per_t, jsonb_build_object('pname','Chen','phone','555-0202','parent_id',v_home::text));
  perform custom.record_update(v_org, v_ch1, jsonb_build_object('pname','Chen Practitioner'));

  v_proj := custom.table_declare(v_org, jsonb_build_object(
    'name','Campaigns','slug','campaigns','type','entity',
    'label_singular','Campaign','label_plural','Campaigns','title_field','pjname',
    'display','page','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','pjname')),
    'parent_id', v_home::text));
  v_x := custom.record_write(v_org, v_proj, jsonb_build_object('pjname','Project X','parent_id',v_home::text));
  v_note_t := custom.table_declare(v_org, jsonb_build_object(
    'name','Contact Notes','slug','contact_notes','type','entity',
    'label_singular','Contact Note','label_plural','Contact Notes','title_field','ntext',
    'display','list','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','ntext')),
    'parent_id', v_home::text));
  v_n1 := custom.record_write(v_org, v_note_t, jsonb_build_object('ntext','first note','parent_id',v_x::text));
  v_n2 := custom.record_write(v_org, v_note_t, jsonb_build_object('ntext','second note','parent_id',v_x::text));

  perform set_config('hha.org',  v_org::text,   false);
  perform set_config('hha.ch1',  v_ch1::text,   false);
  perform set_config('hha.ch2',  v_ch2::text,   false);
  perform set_config('hha.x',    v_x::text,     false);
  perform set_config('hha.n1',   v_n1::text,    false);
  perform set_config('hha.tbl',  v_per_t::text, false);
  perform set_config('hha.boss', v_boss,        false);
end $t$;

-- The three compound operations, each its own statement, each sent from the seat.
select custom.migrate_merge(current_setting('hha.org')::uuid, current_setting('hha.ch1')::uuid,
                            current_setting('hha.ch2')::uuid, 'campaign-test/mergehist_red') ->> 'verb' as merged;
select custom.migrate_delete(current_setting('hha.org')::uuid, current_setting('hha.x')::uuid,
                             'campaign-test/mergehist_red') ->> 'cascaded' as cascaded;
select custom.migrate_undo(current_setting('hha.org')::uuid,
         (select m.id from custom.migrations(current_setting('hha.org')::uuid, null, 50) m
           where m.verb = 'merge' order by m.applied_at desc limit 1)) ->> 'verb' as undone;

-- ── THE FIVE QUESTIONS, ASKED OF THE OLD BODIES, FROM THE SEAT ───────────────────────────
do $t$
declare
  v_org uuid := current_setting('hha.org')::uuid;
  v_sum text;
  v_red integer := 0;
begin
  if current_user <> 'authenticated' then
    raise exception 'the red blocks are not in the seat — current_user is %', current_user;
  end if;
  -- Only the four columns the old door had, on purpose: a red twin that asked for `operation`
  -- would fail to COMPILE rather than answer wrongly, which proves nothing about the defect.

  -- RED 1 — the merge does not appear in the winner's history at all.
  select r.summary into v_sum from custom.io_revisions(v_org, current_setting('hha.ch1')::uuid) r
   order by r.version desc limit 1;
  if v_sum ~ 'merge' then
    raise exception 'RED 1 did not flip: the old door already showed the merge — "%"', v_sum;
  end if;
  if v_sum !~ '0 field\(s\) changed' then
    raise exception 'RED 1 did not flip: the old door already counted the fields the merge moved — "%"', v_sum;
  end if;
  raise notice '[RED] 1 — the merge reads "%"', v_sum;
  v_red := v_red + 1;

  -- RED 2 — and so does an ORDINARY edit, which is what makes it a class.
  select r.summary into v_sum from custom.io_revisions(v_org, current_setting('hha.ch1')::uuid) r
   where r.version = 2;
  if v_sum !~ '0 field\(s\) changed' then
    raise exception 'RED 2 did not flip: an ordinary edit was already described — "%"', v_sum;
  end if;
  raise notice '[RED] 2 — an ordinary edit that changed pname reads "%"', v_sum;
  v_red := v_red + 1;

  -- RED 3 — the merged-away record's removal is unexplained.
  select r.summary into v_sum from custom.io_revisions(v_org, current_setting('hha.ch2')::uuid) r
   order by r.version desc limit 1;
  if v_sum ~ 'merge' then
    raise exception 'RED 3 did not flip: the loser''s removal already named the merge — "%"', v_sum;
  end if;
  v_red := v_red + 1;

  -- RED 4 — a record a cascade took with it cannot say what took it.
  select r.summary into v_sum from custom.io_revisions(v_org, current_setting('hha.n1')::uuid) r
   order by r.version desc limit 1;
  if v_sum ~ 'delete' then
    raise exception 'RED 4 did not flip: a cascaded record already named the delete — "%"', v_sum;
  end if;
  raise notice '[RED] 4 — a record the delete took with it reads "%"', v_sum;
  v_red := v_red + 1;

  -- RED 5 — and the undo is an unexplained RESTORE.
  select r.summary into v_sum from custom.io_revisions(v_org, current_setting('hha.ch2')::uuid) r
   order by r.version desc limit 1;
  if v_sum ~ 'undo' then
    raise exception 'RED 5 did not flip: the undo already said its own name — "%"', v_sum;
  end if;
  raise notice '[RED] 5 — the undo of the merge reads "%"', v_sum;
  v_red := v_red + 1;

  if v_red <> 5 then
    raise exception 'only % of 5 blocks are red', v_red;
  end if;
  -- Wording corrected by lane RED-SUITES-3, 2026-09-21: this twin PASSES when all five flip,
  -- and a block that flipped is a defect PUT BACK by the inverse, not one that is gone.
  raise notice '% of 5 blocks are RED — the inverse executed and every defect MERGE-HIST closed is back and was observed', v_red;
end $t$;

-- ── THE SEAT IS A REAL SEAT — the access clause, as a real second person ─────────────────
-- Not a red block: this lane did not touch access, so there is nothing here to flip. It is
-- here because a file that merely SAYS `set local role authenticated` and then asks everything
-- of the store's internals is a fake, and the cheapest proof that this one is not is a second
-- person hitting a wall the first person walks through.
do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org constant uuid := current_setting('hha.org')::uuid;
  v_ch1 constant uuid := current_setting('hha.ch1')::uuid;
  v_tbl constant uuid := current_setting('hha.tbl')::uuid;
  v_caught text;
  v_n integer;
begin
  if current_user <> 'authenticated' then
    raise exception 'the access clause is not in the seat — current_user is %', current_user;
  end if;
  -- This organization says membership alone shows nothing, set through the settings door.
  perform platform.knob_override_set('custom', 'member_default_visibility', 'organization',
                                     v_org, v_org, '"shared_only"'::jsonb,
                                     'campaign-test/mergehist_red access clause');
  perform set_config('request.jwt.claims', c_dana_j, true);

  -- She cannot read the history of a record nobody gave her.
  v_caught := null; v_n := null;
  begin
    select count(*) into v_n from custom.io_revisions(v_org, v_ch1);
  exception when others then
    v_caught := sqlerrm;
  end;
  if v_caught is null and coalesce(v_n, 0) > 0 then
    raise exception 'ACCESS: test@test.com read % revision(s) of a record nobody shared with her', v_n;
  end if;

  -- Nor change the shape of a table she is not an admin of.
  v_caught := null;
  begin
    perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Sneaked in','plain','text'));
  exception when others then
    v_caught := sqlerrm;
  end;
  if v_caught is null then
    raise exception 'ACCESS: test@test.com added a column to a table she is not an admin of';
  end if;

  -- THE CONTROL: the record she IS given, she reads.
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform custom.share_grant(v_org, v_ch1, 'user', c_dana, 'viewer'::public.permission_level);
  perform set_config('request.jwt.claims', c_dana_j, true);
  if (custom.read_record(v_org, v_ch1, true) ->> 'pname') is null then
    raise exception 'ACCESS: the record shared with test@test.com at viewer does not read back for her';
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);
  raise notice '[SEAT] the wall is real for a second person, and it is not a wall against everyone.';
end $t$;

rollback;
