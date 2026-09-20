-- MERGE-HISTORY — THE GREEN SUITE. History says what a compound operation did.
--
-- RUN IT FROM THE REPOSITORY ROOT (against the MAIN database, where the store lives):
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the five SUPABASE_MATRIX_* values>" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/mergehist_green.sql
--
-- IT IS NOT A MIGRATION and never becomes one: it lives outside `migrations/`, and its single
-- transaction ends in ROLLBACK, so it leaves the database exactly as it found it.
--
-- WHY IT IS MADE OF SEPARATE STATEMENTS, which no other suite in this campaign is. The mark a
-- compound verb leaves for `history.record_capture` is fenced by `statement_timestamp()`, so
-- that a transaction which merges and then edits does not call the edit a merge. A suite
-- written as one `do $t$` block is ONE statement and could not tell the two apart — it would
-- pass while proving nothing about the fence. Each operation here is therefore its own
-- statement, exactly as a client sends it, and the ids travel between them in session settings.
--
-- 🚨 THE SEAT (lane SEAT-SUITES, 2026-09-19). This suite used to run every one of its
-- statements as the role that OWNS `custom.record`. In that seat `custom.assert_client_may_reach`
-- returns on its first line, EXECUTE grants are free, SECURITY INVOKER and SECURITY DEFINER are
-- the same thing, and `custom.record` is directly readable — so "history says what happened"
-- was proved about the store's internals and not about what a signed-in person is shown. It
-- now builds the organization, its memberships, its switch and its Home as the connected role,
-- takes the seat `authenticated` in PART 0 and PROVES it holds it, and runs EVERY statement
-- below — the two `field` declarations, the merge, the cascade, the undo and every reading of
-- history — through the doors a signed-in person reaches. `set_config('role', …, true)` is
-- transaction-local, so the seat is held across all of the separate statements the fence needs.
-- The two Field rows that used to be INSERTed straight into `custom.record` now go through
-- `custom.field_declare`; the platform-wide census at the foot steps OUT of the seat and says
-- why, and asserts no product clause while it is out.
--
-- ITS RED TWIN is `mergehist_red.sql`, which runs this lane's inverse inside a rolled-back
-- transaction, from the same seat, and requires every block below to flip.

\set ON_ERROR_STOP on
\timing off

begin;
set local statement_timeout = '600s';

-- ── SETUP as the connected role, THE SEAT, then one ORDINARY edit through the door ───────
do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org  uuid := gen_random_uuid();
  v_home uuid; v_per_t uuid; v_ch1 uuid; v_ch2 uuid;
  v_proj uuid; v_note_t uuid; v_x uuid; v_n1 uuid; v_n2 uuid;
  v_boss text := current_user;   -- the connected role, for the two steps no client door covers
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'mergehist_green.sql runs on the MAIN database only, and this is %',
      (select system_identifier from pg_control_system());
  end if;
  perform set_config('app.actor_system', 'campaign-test/mergehist_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'ZZ MERGE-HISTORY Green', 'zz-mergehist-green-' || substr(v_org::text, 1, 8), 'ZMG', c_admin);
  -- A seat is a PERSON, and a person reaches an organization only through a membership.
  -- `test@test.com` is a plain member who is shared nothing, for PART 5.
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  -- And the store answers a person only where it is switched on. The role that owns
  -- `custom.record` walked past this switch on its first line; `authenticated` does not.
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb,
          'campaign-test/mergehist_green: every door under test is behind the store switch');

  -- A Home record is made by the onboarding path, not by a person's browser, so it has no
  -- client door of its own and is made here, before the seat is taken.
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'ZZ HQ')) returning id into v_home;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0 — THE SEAT. Everything below this line, in this block and in every
  -- statement after it, runs as a signed-in person.
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

  -- T5's shape: two Chens with different phone numbers.
  v_per_t := custom.table_declare(v_org, jsonb_build_object(
    'name','ZZ Person','slug','zz_mergehist_person','type','entity',
    'label_singular','Person','label_plural','People','title_field','pname',
    'display','page','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','pname'), jsonb_build_object('name','phone')),
    'parent_id', v_home::text));
  -- THROUGH THE DOOR: a person adds a column with `custom.field_declare`. This suite used to
  -- INSERT the Field row straight into `custom.record`, which needs a table privilege no
  -- signed-in person holds — and a phone field declared that way is a document no door ever
  -- produced, so what the merge did to it proved nothing about the product.
  perform custom.field_declare(v_org, v_per_t, jsonb_build_object(
    'key','phone','label','Phone','plain','text','sort',20));
  v_ch1 := custom.record_write(v_org, v_per_t, jsonb_build_object('pname','Chen','phone','555-0101','parent_id',v_home::text));
  v_ch2 := custom.record_write(v_org, v_per_t, jsonb_build_object('pname','Chen','phone','555-0202','parent_id',v_home::text));

  -- AN ORDINARY EDIT. This is the clause that says the defect was a class and not a merge bug:
  -- before this lane it also answered "0 field(s) changed".
  perform custom.record_update(v_org, v_ch1, jsonb_build_object('pname','Chen Practitioner'));

  -- A Project holding two notes, for the second compound operation: one delete that takes the
  -- records it contains with it.
  v_proj := custom.table_declare(v_org, jsonb_build_object(
    'name','ZZ Project','slug','zz_mergehist_project','type','entity',
    'label_singular','Project','label_plural','Projects','title_field','pjname',
    'display','page','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','pjname')),
    'parent_id', v_home::text));
  v_x := custom.record_write(v_org, v_proj, jsonb_build_object('pjname','Project X','parent_id',v_home::text));
  v_note_t := custom.table_declare(v_org, jsonb_build_object(
    'name','ZZ Note','slug','zz_mergehist_note','type','entity',
    'label_singular','Note','label_plural','Notes','title_field','ntext',
    'display','list','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','ntext')),
    'parent_id', v_home::text));
  v_n1 := custom.record_write(v_org, v_note_t, jsonb_build_object('ntext','first note','parent_id',v_x::text));
  v_n2 := custom.record_write(v_org, v_note_t, jsonb_build_object('ntext','second note','parent_id',v_x::text));

  perform set_config('zz.org',  v_org::text,  false);
  perform set_config('zz.ch1',  v_ch1::text,  false);
  perform set_config('zz.ch2',  v_ch2::text,  false);
  perform set_config('zz.x',    v_x::text,    false);
  perform set_config('zz.n1',   v_n1::text,   false);
  perform set_config('zz.n2',   v_n2::text,   false);
  perform set_config('zz.tbl',  v_per_t::text, false);
  perform set_config('zz.boss', v_boss,       false);
end $t$;

-- ── THE MERGE, in its own statement, exactly as a client sends it ─────────────────────────
select custom.migrate_merge(current_setting('zz.org')::uuid,
                            current_setting('zz.ch1')::uuid,
                            current_setting('zz.ch2')::uuid,
                            'campaign-test/mergehist_green') ->> 'verb' as merged;

-- ── PART 1 — T5's last clause: HISTORY SHOWS THE MERGE ───────────────────────────────────
do $t$
declare
  v_org uuid := current_setting('zz.org')::uuid;
  v_ch1 uuid := current_setting('zz.ch1')::uuid;
  v_ch2 uuid := current_setting('zz.ch2')::uuid;
  r record;
begin
  if current_user <> 'authenticated' then
    raise exception 'PART 1 is not in the seat — current_user is %', current_user;
  end if;
  -- 1a. THE WINNER'S NEWEST REVISION NAMES THE MERGE. `custom.io_revisions` is the door the
  --     history panel calls; it is what a person is shown, and it is asked here as a person.
  select * into r from custom.io_revisions(v_org, v_ch1) order by version desc limit 1;
  if r.operation is distinct from 'merge' then
    raise exception '1a (T5): after the merge the winner''s newest revision calls itself "%" — history does not show the merge', coalesce(r.operation, 'nothing at all');
  end if;
  if r.summary !~ 'merge' then
    raise exception '1a (T5): the sentence beside the version does not say what happened: "%"', r.summary;
  end if;

  -- 1b. AND IT NAMES THE FIELDS THAT ACTUALLY MOVED. The losing phone number became a ranked
  --     alternate inside the winner's one document, which is a change to the phone FIELD even
  --     though the document's top level still reads 555-0101.
  if not (r.changed_fields -> 'keys' ? 'phone') then
    raise exception '1b (T5): the merge moved a phone number into the winner and history lists the changed fields as % — a compound operation that reports no field-level change is the defect this lane closes', coalesce((r.changed_fields -> 'keys')::text, 'nothing');
  end if;
  if r.summary !~ 'phone' then
    raise exception '1b (T5): the sentence does not name the field that moved: "%"', r.summary;
  end if;
  -- 1b (control, at the door a person reads the record itself by): the alternate really is in
  -- the winner's document as `custom.read_record` hands it back — so 1b is not a summary that
  -- names a field nothing happened to.
  if not exists (select 1 from jsonb_array_elements(
                   coalesce(custom.read_record(v_org, v_ch1, true) -> '_alternates' -> 'phone', '[]'::jsonb)) x
                  where x -> 'value' = '"555-0202"'::jsonb
                    and (x -> 'source' ->> 'id')::uuid = v_ch2) then
    raise exception '1b (T5): history names phone as changed and the door hands back no alternate from the merged-away record. Document: %',
      custom.read_record(v_org, v_ch1, true);
  end if;

  -- 1c. THE REVISION POINTS AT THE MIGRATION, so "what else did this operation do" is answerable
  --     from the revision a person is looking at. `history.migration_log` holds no client grant
  --     and `custom.migrations` is the door onto it, so that is what is asked.
  if nullif(r.changed_fields ->> 'migration_id', '') is null then
    raise exception '1c (T5): the revision names the merge and carries no Migration to look it up by';
  end if;
  if not exists (select 1 from custom.migrations(v_org, null, 50) m
                  where m.verb = 'merge' and m.id = (r.changed_fields ->> 'migration_id')::uuid
                    and m.target_id in (v_ch1, v_ch2)) then
    raise exception '1c (T5): the Migration the revision points at is not a merge on these two records in the list custom.migrations hands this person';
  end if;

  -- 1d. THE LOSER'S REMOVAL IS THE SAME OPERATION, not an unexplained deletion.
  select * into r from custom.io_revisions(v_org, v_ch2) order by version desc limit 1;
  if r.operation is distinct from 'merge' or r.summary !~ 'removed' then
    raise exception '1d (T5): the merged-away record''s last revision reads "%" instead of saying the merge removed it', coalesce(r.summary, 'nothing at all');
  end if;

  -- 1e. AND THE ORDINARY EDIT BEFORE IT IS DESCRIBED TOO — the class, not the merge.
  select * into r from custom.io_revisions(v_org, current_setting('zz.ch1')::uuid) where version = 2;
  if r.operation is distinct from 'update' then
    raise exception '1e: an ordinary edit is recorded as "%"', r.operation;
  end if;
  if not (r.changed_fields -> 'keys' ? 'pname') or r.summary !~ 'pname' then
    raise exception '1e: an ordinary edit changed pname and history says "%" — every revision on the platform reported 0 field(s) changed before this lane', r.summary;
  end if;
  raise notice '[GREEN] part 1 (T5) — history shows the merge, names the fields it moved, and points at the Migration. From the seat `authenticated`.';
end $t$;

-- ── AN ORDINARY EDIT AFTER THE MERGE, its own statement, as a client sends it ─────────────
select custom.record_update(current_setting('zz.org')::uuid,
                            current_setting('zz.ch1')::uuid,
                            jsonb_build_object('pname', 'Chen')) as version_after;

-- ── PART 2 — THE MARK DOES NOT LEAK ──────────────────────────────────────────────────────
do $t$
declare
  r record;
begin
  if current_user <> 'authenticated' then
    raise exception 'PART 2 is not in the seat — current_user is %', current_user;
  end if;
  select * into r from custom.io_revisions(current_setting('zz.org')::uuid,
                                           current_setting('zz.ch1')::uuid)
   order by version desc limit 1;
  if r.operation is distinct from 'update' then
    raise exception '2a: an ordinary edit made after the merge is recorded as "%" — the operation''s mark leaked past the statement that asked for it', r.operation;
  end if;
  raise notice '[GREEN] part 2 — an edit after a merge is an edit, not a merge.';
end $t$;

-- ── THE SECOND COMPOUND OPERATION: one delete takes the records it contains with it ───────
select custom.migrate_delete(current_setting('zz.org')::uuid,
                             current_setting('zz.x')::uuid,
                             'campaign-test/mergehist_green') ->> 'cascaded' as cascaded;

-- ── PART 3 — EVERY RECORD THE OPERATION TOUCHED SAYS WHICH OPERATION IT WAS ───────────────
do $t$
declare
  v_org uuid := current_setting('zz.org')::uuid;
  v_ids uuid[] := array[current_setting('zz.x')::uuid,
                        current_setting('zz.n1')::uuid,
                        current_setting('zz.n2')::uuid];
  v_id  uuid;
  v_mig uuid;
  r record;
begin
  if current_user <> 'authenticated' then
    raise exception 'PART 3 is not in the seat — current_user is %', current_user;
  end if;
  foreach v_id in array v_ids loop
    select * into r from custom.io_revisions(v_org, v_id) order by version desc limit 1;
    if r.operation is distinct from 'delete' then
      raise exception '3a: the delete took record % with it and its last revision reads "%" — a cascade that reaches history as an anonymous SOFT_DELETE cannot be explained or undone knowingly', v_id, coalesce(r.summary, 'nothing at all');
    end if;
    if r.summary !~ 'removed' then
      raise exception '3a: record %''s last revision does not say it was removed: "%"', v_id, r.summary;
    end if;
    -- 3b. ONE OPERATION, ONE MIGRATION — the parent and everything it took share it.
    if v_mig is null then
      v_mig := (r.changed_fields ->> 'migration_id')::uuid;
      if v_mig is null then
        raise exception '3b: the delete named no Migration on the record it was asked about';
      end if;
    elsif (r.changed_fields ->> 'migration_id')::uuid is distinct from v_mig then
      raise exception '3b: record % was taken by the same delete and points at a different Migration', v_id;
    end if;
    -- 3c. AND THE RECORD IS REALLY GONE, asked of the door a person has for alive-or-dead.
    --     `custom.record` itself is not readable from this seat at all.
    if (custom.record_resolve(v_org, v_id) ->> 'live')::boolean then
      raise exception '3c: record % reads live after the delete that history says removed it', v_id;
    end if;
  end loop;
  raise notice '[GREEN] part 3 — one delete, three records, one operation named on every one of them.';
end $t$;

-- ── THE UNDO, its own statement, found through the door onto the migration list ───────────
select custom.migrate_undo(current_setting('zz.org')::uuid,
         (select m.id from custom.migrations(current_setting('zz.org')::uuid, null, 50) m
           where m.verb = 'merge' order by m.applied_at desc limit 1)) ->> 'verb' as undone;

-- ── PART 4 — AND THE UNDO SAYS ITS OWN NAME ──────────────────────────────────────────────
do $t$
declare
  r record;
begin
  if current_user <> 'authenticated' then
    raise exception 'PART 4 is not in the seat — current_user is %', current_user;
  end if;
  select * into r from custom.io_revisions(current_setting('zz.org')::uuid,
                                           current_setting('zz.ch2')::uuid)
   order by version desc limit 1;
  if r.operation is distinct from 'undo of merge' then
    raise exception '4a (T5): the restored record''s newest revision reads "%" — an undo that reaches history as an unexplained RESTORE is a change nobody can account for', coalesce(r.operation, 'nothing at all');
  end if;
  raise notice '[GREEN] part 4 — the undo of the merge is on the record, in those words.';
end $t$;

-- ── PART 5 — THE NEGATIVE CLAUSE, AS A REAL SECOND PERSON ────────────────────────────────
-- `test@test.com` is a member of this organization and was shared nothing. Everything above
-- is a STORE rule; this is the ACCESS question, which the old seat could not ask at all: as
-- the owner of `custom.record`, `custom.assert_client_may_reach` returned true on its first
-- line for every organization on this database.
do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org  uuid := current_setting('zz.org')::uuid;
  v_ch1  uuid := current_setting('zz.ch1')::uuid;
  v_tbl  uuid := current_setting('zz.tbl')::uuid;
  v_caught text;
  r record;
  v_n integer;
begin
  if current_user <> 'authenticated' then
    raise exception 'PART 5 is not in the seat — current_user is %', current_user;
  end if;
  -- THE ORGANIZATION'S OWN SETTING, set through the settings screen's door (a person with
  -- the owner's seat, not a table INSERT): membership alone shows nothing here. Without this
  -- the platform default is `all_records`, under which a member legitimately reads every
  -- record — and a negative clause that the settings say YES to proves nothing at all.
  perform platform.knob_override_set('custom', 'member_default_visibility', 'organization',
                                     v_org, v_org, '"shared_only"'::jsonb,
                                     'campaign-test/mergehist_green part 5');
  perform set_config('request.jwt.claims', c_dana_j, true);

  -- 5a. She cannot read the history of a record nobody gave her. A revision list is the whole
  --     edit trail of a record — if it answered her, the access wall would be decorative.
  v_caught := null;
  v_n := null;
  begin
    select count(*) into v_n from custom.io_revisions(v_org, v_ch1);
  exception when others then
    v_caught := sqlerrm;
  end;
  if v_caught is null and coalesce(v_n, 0) > 0 then
    raise exception '5a: test@test.com read % revision(s) of a record nobody shared with her, in an organization that says members see only what is shared', v_n;
  end if;

  -- 5b. Nor change the shape of a table she is not an admin of.
  v_caught := null;
  begin
    perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Sneaked in','plain','text'));
  exception when others then
    v_caught := sqlerrm;
  end;
  if v_caught is null then
    raise exception '5b: test@test.com added a column to a table she is not an admin of';
  end if;

  -- 5c. THE CONTROL, so 5a and 5b are not a door that refuses her everything: the record she
  --     IS given, she reads, and its history reads with it.
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform custom.share_grant(v_org, v_ch1, 'user', c_dana, 'viewer'::public.permission_level);
  perform set_config('request.jwt.claims', c_dana_j, true);
  if (custom.read_record(v_org, v_ch1, true) ->> 'pname') <> 'Chen' then
    raise exception '5c: the record shared with test@test.com at viewer does not read back for her';
  end if;
  select count(*) into v_n from custom.io_revisions(v_org, v_ch1);
  if coalesce(v_n, 0) = 0 then
    raise exception '5c: the record shared with test@test.com at viewer has no history for her, so 5a is a door that refuses everyone';
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);
  raise notice '[GREEN] part 5 — the wall is real for a second person, and it is not a wall against everyone.';
  raise notice 'ALL PARTS PASSED (the seat 0, T5 1a-1e, the fence 2a, the cascade 3a-3c, the undo 4a, access 5a-5c) — every clause from the seat `authenticated`, through the doors a signed-in person reaches.';
end $t$;

-- ── THE CENSUS, over every record version on the platform ────────────────────────────────
-- IT STEPS OUT OF THE SEAT AND SAYS SO. This is not a person's question and there is no door
-- onto it: it reads `history.row_versions` across EVERY organization on the database and calls
-- `custom.io_changed_keys`, which holds no client grant because no screen asks it anything. It
-- asserts no product clause — it prints an operator census — and the seat is not used for it.
select set_config('role', current_setting('zz.boss'), true) as stepped_out;

-- A revision that says nothing moved while the document moved is the defect, wherever it is.
-- `say_nothing_moved` is the census and it is ZERO; `update_versions` is its denominator, so
-- the answer cannot be zero for want of anything to count. The four bookkeeping keys excluded
-- from the comparison are the store's own derivations, which are not values a person edited.
with chain as (
  select v.organization_id, v.row_id, v.version, v.operation,
         v.row_data -> 'data' as doc,
         lag(v.row_data -> 'data') over (partition by v.organization_id, v.row_id order by v.version) as prev
    from history.row_versions v
   where v.entity_type = 'custom.record'
)
select count(*) as update_versions,
       count(*) filter (where cardinality(custom.io_changed_keys(coalesce(prev, '{}'::jsonb),
                                                                 coalesce(doc, '{}'::jsonb))) = 0)
         as say_nothing_moved
  from chain
 where operation = 'UPDATE' and prev is not null
   and (prev - '_computed' - '_derived' - '_sources' - '_actor')
       is distinct from (doc - '_computed' - '_derived' - '_sources' - '_actor');

rollback;
