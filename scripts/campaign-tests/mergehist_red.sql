-- MERGE-HISTORY — THE RED TWIN of mergehist_green.sql.
--
-- RUN IT FROM THE REPOSITORY ROOT (the \i path below is relative to it), against the MAIN
-- database, exactly as the green suite is run:
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
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
-- ONE GREEN BLOCK HAS NO RED TWIN, and says so rather than pretending: green part 2 (an
-- ordinary edit made after a merge is not called a merge) guards the fence on a mark that did
-- not exist before this lane. Before the inverse is undone nothing is ever marked, so there is
-- nothing that could leak and no way for that block to be red. It is a guard on the mechanism
-- this lane adds, not a measurement of the defect it closes.

\set ON_ERROR_STOP on
\timing off

begin;
set local statement_timeout = '600s';

\i migrations/inverse/mergehist_a_compound_operation_signs_its_revision_down.sql

-- ── THE SAME SETUP AND THE SAME ORDINARY EDIT ────────────────────────────────────────────
do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org  uuid := gen_random_uuid();
  v_home uuid; v_per_t uuid; v_ch1 uuid; v_ch2 uuid;
  v_proj uuid; v_note_t uuid; v_x uuid; v_n1 uuid; v_n2 uuid;
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'mergehist_red.sql runs on the MAIN database only, and this is %',
      (select system_identifier from pg_control_system());
  end if;
  perform set_config('app.actor_system', 'campaign-test/mergehist_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'ZZ MERGE-HISTORY Red', 'zz-mergehist-red-' || substr(v_org::text, 1, 8), 'ZMR', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb,
          'campaign-test/mergehist_red');

  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'ZZ HQ')) returning id into v_home;

  v_per_t := custom.table_declare(v_org, jsonb_build_object(
    'name','ZZ Person','slug','zz_mergehist_r_person','type','entity',
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
  perform custom.record_update(v_org, v_ch1, jsonb_build_object('pname','Chen Practitioner'));

  v_proj := custom.table_declare(v_org, jsonb_build_object(
    'name','ZZ Project','slug','zz_mergehist_r_project','type','entity',
    'label_singular','Project','label_plural','Projects','title_field','pjname',
    'display','page','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','pjname')),
    'parent_id', v_home::text));
  v_x := custom.record_write(v_org, v_proj, jsonb_build_object('pjname','Project X','parent_id',v_home::text));
  v_note_t := custom.table_declare(v_org, jsonb_build_object(
    'name','ZZ Note','slug','zz_mergehist_r_note','type','entity',
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
end $t$;

select custom.migrate_merge(current_setting('zz.org')::uuid, current_setting('zz.ch1')::uuid,
                            current_setting('zz.ch2')::uuid, 'campaign-test/mergehist_red') ->> 'verb' as merged;
select custom.migrate_delete(current_setting('zz.org')::uuid, current_setting('zz.x')::uuid,
                             'campaign-test/mergehist_red') ->> 'cascaded' as cascaded;
select custom.migrate_undo(current_setting('zz.org')::uuid,
         (select l.id from history.migration_log l
           where l.organization_id = current_setting('zz.org')::uuid and l.verb = 'merge'
           order by l.applied_at desc limit 1)) ->> 'verb' as undone;

-- ── THE FIVE QUESTIONS, ASKED OF THE OLD BODIES ──────────────────────────────────────────
do $t$
declare
  v_org uuid := current_setting('zz.org')::uuid;
  v_sum text;
  v_red integer := 0;
begin
  -- Only the four columns the old door had, on purpose: a red twin that asked for `operation`
  -- would fail to COMPILE rather than answer wrongly, which proves nothing about the defect.

  -- RED 1 — the merge does not appear in the winner's history at all.
  select r.summary into v_sum from custom.io_revisions(v_org, current_setting('zz.ch1')::uuid) r
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
  select r.summary into v_sum from custom.io_revisions(v_org, current_setting('zz.ch1')::uuid) r
   where r.version = 2;
  if v_sum !~ '0 field\(s\) changed' then
    raise exception 'RED 2 did not flip: an ordinary edit was already described — "%"', v_sum;
  end if;
  raise notice '[RED] 2 — an ordinary edit that changed pname reads "%"', v_sum;
  v_red := v_red + 1;

  -- RED 3 — the merged-away record's removal is unexplained.
  select r.summary into v_sum from custom.io_revisions(v_org, current_setting('zz.ch2')::uuid) r
   order by r.version desc limit 1;
  if v_sum ~ 'merge' then
    raise exception 'RED 3 did not flip: the loser''s removal already named the merge — "%"', v_sum;
  end if;
  v_red := v_red + 1;

  -- RED 4 — a record a cascade took with it cannot say what took it.
  select r.summary into v_sum from custom.io_revisions(v_org, current_setting('zz.n1')::uuid) r
   order by r.version desc limit 1;
  if v_sum ~ 'delete' then
    raise exception 'RED 4 did not flip: a cascaded record already named the delete — "%"', v_sum;
  end if;
  raise notice '[RED] 4 — a record the delete took with it reads "%"', v_sum;
  v_red := v_red + 1;

  -- RED 5 — and the undo is an unexplained RESTORE.
  select r.summary into v_sum from custom.io_revisions(v_org, current_setting('zz.ch2')::uuid) r
   order by r.version desc limit 1;
  if v_sum ~ 'undo' then
    raise exception 'RED 5 did not flip: the undo already said its own name — "%"', v_sum;
  end if;
  raise notice '[RED] 5 — the undo of the merge reads "%"', v_sum;
  v_red := v_red + 1;

  if v_red <> 5 then
    raise exception 'only % of 5 blocks are red', v_red;
  end if;
  raise notice '% of 5 blocks are RED (the defect they assert is gone), and the inverse executed', v_red;
end $t$;

rollback;
