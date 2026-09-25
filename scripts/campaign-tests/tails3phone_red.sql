-- scripts/campaign-tests/tails3phone_red.sql — LANE TAILS-3's RED TWIN.
--
-- THE SAME PRACTICE, THE SAME TEN SPELLINGS, THE OLD PATTERN. Harborline Veterinary House
-- Calls declares its Clients table exactly as in `tails3phone_green.sql`, and then the
-- phone column's Rule is forced back — inside this transaction only — to the pattern the
-- store wrote before `tails3_a_phone_number_may_be_written_the_way_people_write_it.sql`:
--
--     ^[+0-9][0-9 ()\-\.]{4,}$
--
-- This file asserts the GREEN suite's PART 3 clause against it: that a client who writes
-- `(415) 555-0178` can be saved. It CANNOT pass while that pattern is what a phone column
-- carries, because the string starts with `(`. That is the defect, demonstrated by the
-- product refusing a real customer's real phone number, and it is the whole reason the
-- forward file exists.
--
-- EXPECTED: this file FAILS, with
--   PART 3 RED — the practice could not save Okafor household's number written
--   "(415) 555-0178": mobile is not written the way this field expects
-- and the transaction rolls back either way, so the main database is untouched.
--
-- Run: psql <main dsn> -f scripts/campaign-tests/tails3phone_red.sql

\set ON_ERROR_STOP on

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'tails3phone_red.sql'
\set requires 'grant:authenticated:custom.table_declare'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_old     constant text := '^[+0-9][0-9 ()\-\.]{4,}$';
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_clients uuid;
  v_msg     text;
  v_pass    integer := 0;
  v_refused  integer := 0;
  r         record;
begin
  perform set_config('app.actor_system', 'campaign-test/tails3phone_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by) values
    (v_org, 'Harborline Veterinary House Calls',
     'harborline-veterinary-house-calls-'||substr(v_org::text,1,8), 'HVH', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
    values (v_org,'organization',v_org,c_admin,'owner','active');
  insert into platform.knob_override (feature,key,scope_kind,scope_id,organization_id,value,set_note)
    values ('custom','system_enabled','organization',v_org,v_org,'true'::jsonb,'campaign-test/tails3phone_red');
  insert into custom.record (organization_id, table_id, data)
    values (v_org, null, jsonb_build_object('name','Harborline Veterinary House Calls'))
    returning id into v_home;

  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'PART 0 RED — this suite is not in the seat; it is %', current_user;
  end if;
  raise notice 'PART 0 — running as %, the role a signed-in person holds.', current_user;

  v_clients := custom.table_declare(v_org, jsonb_build_object(
    'name','clients', 'type','entity', 'slug','clients',
    'label_singular','Client', 'label_plural','Clients',
    'display','list', 'ordered', false, 'weight','light',
    'retention_days', 2555, 'row_order','sorted', 'agent_writable', true,
    'default_sort', jsonb_build_array(jsonb_build_object('field','household','direction','asc')),
    'title_field','household', 'parent_id', v_home::text,
    'fields', jsonb_build_array(
      jsonb_build_object('name','household','type','text'),
      jsonb_build_object('name','pet_name','type','text'),
      jsonb_build_object('name','mobile','type','phone'))));

  -- THE WORLD AS IT WAS. The column's own Rule is put back to the old pattern, in this
  -- transaction only. Nothing else about the store is changed.
  perform set_config('role', 'postgres', true);
  update custom.record fld
     set data = jsonb_set(fld.data, '{rules}',
                  jsonb_build_array(jsonb_build_object('kind','pattern','value',c_old)))
   where fld.organization_id = v_org and fld.data_class = 'field' and fld.data ->> 'key' = 'mobile';
  perform set_config('role', 'authenticated', true);

  for r in
    select * from (values
      ('Okafor household',   'Biscuit',  '(415) 555-0178'),
      ('Delgado household',  'Rosie',    '415-555-0178'),
      ('Ruiz household',     'Miso',     '+1 415 555 0178'),
      ('Abernathy household','Pip',      '+44 20 7946 0958'),
      ('Nakamura household', 'Yuzu',     '415.555.0178'),
      ('Fontaine household', 'Clementine','(415)555-0178 x204'),
      ('Osei household',     'Kofi',     '4155550178')
    ) as t(household, pet, phone)
  loop
    begin
      perform custom.record_write(v_org, v_clients, jsonb_build_object(
        'household', r.household, 'pet_name', r.pet, 'mobile', r.phone));
      v_pass := v_pass + 1;
    exception when others then
      get stacked diagnostics v_msg = message_text;
      -- SUITES-TIDY 2026-09-22: THIS IS THE RED, AND IT IS NOW REPORTED RATHER THAN RAISED.
      -- The twin used to `raise exception` here, so its SUCCESS path was an error — and in a
      -- sweep judged by output text an error is a failure, which is exactly how the clone
      -- sweep scored it. The refusal is what this file exists to show, so it is counted and
      -- printed; the file still ends by raising, but only on the "did not fire" case below and
      -- on the teardown, and it prints ALL CLAUSES PASSED first so the judge can tell them
      -- apart.
      v_refused := v_refused + 1;
      raise notice 'PART 3 RED — the practice could not save %''s number written "%": %',
        r.household, r.phone, v_msg;
    end;
  end loop;

  if v_refused = 0 then
    raise exception 'PART 3 RED DID NOT FIRE — all 7 spellings were accepted against the OLD pattern, which means this twin no longer demonstrates anything. Read it before trusting the green one.';
  end if;
  raise notice 'PART 3 RED — % of the 7 real spellings a veterinary practice actually types were REFUSED by the old pattern, and % landed. That is the defect the new Rule closed.', v_refused, v_pass;
  raise notice 'ALL CLAUSES PASSED';
  -- SUITE-TAIL-3: this used to be `raise exception`, which aborted the do-block before the
  -- `rollback;` below could ever run — the script's actual rollback happened only on
  -- disconnect, and psql's exit code stayed non-zero (3) even on a full pass. `raise notice`
  -- lets the do-block finish normally so the explicit `rollback;` below does the work, with
  -- an honest exit code: 0 on a real pass, non-zero only when a clause actually raised above.
  raise notice 'tails3phone_red.sql: TEARDOWN — rolling back, as designed';
end;
$t$;

rollback;
