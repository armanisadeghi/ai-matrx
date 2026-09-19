-- MERGE-HISTORY — THE GREEN SUITE. History says what a compound operation did.
--
-- RUN IT FROM THE REPOSITORY ROOT (against the MAIN database, where the store lives):
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
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
-- ITS RED TWIN is `mergehist_red.sql`, which runs this lane's inverse inside a rolled-back
-- transaction and requires every block below to flip.

\set ON_ERROR_STOP on
\timing off

begin;
set local statement_timeout = '600s';

-- ── SETUP, and one ORDINARY edit before anything compound happens ────────────────────────
do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org  uuid := gen_random_uuid();
  v_home uuid; v_per_t uuid; v_ch1 uuid; v_ch2 uuid;
  v_proj uuid; v_note_t uuid; v_x uuid; v_n1 uuid; v_n2 uuid;
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'mergehist_green.sql runs on the MAIN database only, and this is %',
      (select system_identifier from pg_control_system());
  end if;
  perform set_config('app.actor_system', 'campaign-test/mergehist_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'ZZ MERGE-HISTORY Green', 'zz-mergehist-green-' || substr(v_org::text, 1, 8), 'ZMG', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb,
          'campaign-test/mergehist_green: every door under test is behind the store switch');

  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'ZZ HQ')) returning id into v_home;

  -- T5's shape: two Chens with different phone numbers.
  v_per_t := custom.table_declare(v_org, jsonb_build_object(
    'name','ZZ Person','slug','zz_mergehist_person','type','entity',
    'label_singular','Person','label_plural','People','title_field','pname',
    'display','page','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','pname'), jsonb_build_object('name','phone')),
    'parent_id', v_home::text));
  insert into custom.record (organization_id, table_id, data_class, data) values
    (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
      'key','phone','label','Phone','type','text','sort',20,'required',false,'multi',false,
      'dated',false,'source','manual','config','{}'::jsonb,'rules','[]'::jsonb,
      'depends_on','[]'::jsonb,'sensitivity','internal','source_config','{}'::jsonb,
      'context_policy','include','applies_to_types','[]'::jsonb,'entity_definition_id',v_per_t));
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

  perform set_config('zz.org', v_org::text, false);
  perform set_config('zz.ch1', v_ch1::text, false);
  perform set_config('zz.ch2', v_ch2::text, false);
  perform set_config('zz.x',   v_x::text,   false);
  perform set_config('zz.n1',  v_n1::text,  false);
  perform set_config('zz.n2',  v_n2::text,  false);
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
  -- 1a. THE WINNER'S NEWEST REVISION NAMES THE MERGE.
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

  -- 1c. THE REVISION POINTS AT THE MIGRATION, so "what else did this operation do" is answerable
  --     from the revision a person is looking at.
  if nullif(r.changed_fields ->> 'migration_id', '') is null then
    raise exception '1c (T5): the revision names the merge and carries no Migration to look it up by';
  end if;
  if not exists (select 1 from history.migration_log l
                  where l.organization_id = v_org and l.verb = 'merge'
                    and l.id = (r.changed_fields ->> 'migration_id')::uuid) then
    raise exception '1c (T5): the Migration the revision points at is not the merge on the record';
  end if;

  -- 1d. THE LOSER'S REMOVAL IS THE SAME OPERATION, not an unexplained deletion.
  select * into r from custom.io_revisions(v_org, v_ch2) order by version desc limit 1;
  if r.operation is distinct from 'merge' or r.summary !~ 'removed' then
    raise exception '1d (T5): the merged-away record''s last revision reads "%" instead of saying the merge removed it', coalesce(r.summary, 'nothing at all');
  end if;

  -- 1e. AND THE ORDINARY EDIT BEFORE IT IS DESCRIBED TOO — the class, not the merge.
  select * into r from custom.io_revisions(v_org, v_ch1) where version = 2;
  if r.operation is distinct from 'update' then
    raise exception '1e: an ordinary edit is recorded as "%"', r.operation;
  end if;
  if not (r.changed_fields -> 'keys' ? 'pname') or r.summary !~ 'pname' then
    raise exception '1e: an ordinary edit changed pname and history says "%" — every revision on the platform reported 0 field(s) changed before this lane', r.summary;
  end if;
  raise notice '[GREEN] part 1 (T5) — history shows the merge, names the fields it moved, and points at the Migration.';
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
  end loop;
  raise notice '[GREEN] part 3 — one delete, three records, one operation named on every one of them.';
end $t$;

-- ── THE UNDO, its own statement ──────────────────────────────────────────────────────────
select custom.migrate_undo(current_setting('zz.org')::uuid,
         (select l.id from history.migration_log l
           where l.organization_id = current_setting('zz.org')::uuid and l.verb = 'merge'
           order by l.applied_at desc limit 1)) ->> 'verb' as undone;

-- ── PART 4 — AND THE UNDO SAYS ITS OWN NAME ──────────────────────────────────────────────
do $t$
declare
  r record;
begin
  select * into r from custom.io_revisions(current_setting('zz.org')::uuid,
                                           current_setting('zz.ch2')::uuid)
   order by version desc limit 1;
  if r.operation is distinct from 'undo of merge' then
    raise exception '4a (T5): the restored record''s newest revision reads "%" — an undo that reaches history as an unexplained RESTORE is a change nobody can account for', coalesce(r.operation, 'nothing at all');
  end if;
  raise notice '[GREEN] part 4 — the undo of the merge is on the record, in those words.';
  raise notice 'ALL PARTS PASSED (T5 1a-1e, the fence 2a, the cascade 3a-3b, the undo 4a)';
end $t$;

-- ── THE CENSUS, over every record version on the platform ────────────────────────────────
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
